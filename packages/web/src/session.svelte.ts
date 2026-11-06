import type { Edge, XYPosition } from "@xyflow/svelte";
import {
  animatedValues,
  graphAtFrame,
  UPLOAD_MAX_MEGAPIXELS,
  type RenderErrorMessage,
  type ServerMessage,
} from "@xtc-toaster/contract";
import { toast2signac } from "@xtc-toaster/toasts";
import { clampPlayhead, nextFrame, paramValue, removeTrack, seedTrack, trackLink, withoutAnimation } from "./animation";
import { removeLayer, removeRowEdges } from "./layers";
import { base64ToBlob, outputFileName, saveBlob } from "./files";
import {
  canConnect,
  createNode,
  emptyFlow,
  fromToastFile,
  toFlow,
  toGraph,
  toToastFile,
  ToastFileError,
  withoutTaken,
  type FlowNode,
  type FlowNodeOf,
  type Link,
  type MenuNodeType,
} from "./graph";
import { fromSaved, loadSaved } from "./persist";
import { connectSocket, wsUrl } from "./socket";
import { uploadImage } from "./upload";

// toast directory name — prefix of downloaded files
const TOAST = "toast-2_signac";
// the editor as it was before the reload, else the default toast
const initial = fromSaved(loadSaved()) ?? toFlow(toast2signac);

const UPLOAD_ERRORS: Record<string, string> = {
  // the server checks megapixels and bytes; MP read like MB (the sister's test), so one number in MB: a photo
  // jpeg is ≈ 0.5 MB per MP — the pixel limit binds first. Approximate: a png of the same size passes at several MB
  "too-large": `too large: max ≈ ${UPLOAD_MAX_MEGAPIXELS * 0.5} MB`,
  "unsupported-format": "png or jpeg only",
};

class Session {
  nodes = $state.raw<FlowNode[]>(initial.nodes);
  edges = $state.raw<Edge[]>(initial.edges);

  connected = $state(false);
  // the socket closed (a deploy restarts the container, the network dropped) and is reconnecting —
  // not set before the first open, so the page doesn't flash it on load
  serverUnavailable = $state(false);
  uploading = $state(false);
  rendering = $state(false);
  // png of the last sent requestId — output shows it, download saves the same bytes
  rendered = $state.raw<{ blob: Blob; url: string } | null>(null);
  // render-error of the last sent requestId — the only error shown in the ui, the rest is console.error
  renderError = $state.raw<Pick<RenderErrorMessage, "message" | "nodeId"> | null>(null);
  // shown in the input node — a rejected upload otherwise looks like the picture just did not change
  uploadError = $state<string | null>(null);
  // shown in the right panel under the import button
  importError = $state<string | null>(null);

  // bumped when the graph is replaced as a whole (import, clear) — Editor fits the view to the new layout
  replaced = $state(0);

  locked = $derived(!this.connected || this.uploading || this.rendering);
  // the animation node stays live during a render: scrubbing and setting keys would otherwise wait for every frame's
  // render, and latest-wins already drops what they make stale
  animationLocked = $derived(!this.connected || this.uploading);
  imageId = $derived(
    this.nodes.find((node): node is FlowNodeOf<"input"> => node.type === "input")?.data.imageId ?? null,
  );
  animationNode = $derived(this.nodes.find((node): node is FlowNodeOf<"animation"> => node.type === "animation"));

  // ui state, not in the toast; the wanted frame stays while `frames` shrinks and grows back
  private playhead = $state(0);
  frame = $derived(this.animationNode ? clampPlayhead(this.playhead, this.animationNode.data.frames) : 0);

  private graph = $derived(toGraph(this.nodes, this.edges));
  private animated = $derived(animatedValues(this.graph, this.frame));
  // what one render needs: the frame under the playhead, without the animation node
  private frameGraph = $derived(withoutAnimation(graphAtFrame(this.graph, this.frame)));
  // only what goes to the server — ui fields (position, measured, …) don't count as a graph change
  graphKey = $derived(JSON.stringify(this.frameGraph));

  private requestId = 0;
  private socket: ReturnType<typeof connectSocket> | null = null;

  connect() {
    this.socket = connectSocket(wsUrl(location), {
      onOpen: () => {
        this.connected = true;
        this.serverUnavailable = false;
      },
      onClose: (event) => {
        console.error("ws disconnected", event);
        this.connected = false;
        this.serverUnavailable = true;
        // an in-flight response is lost — the graph is re-sent after reconnect
        this.rendering = false;
        this.stop();
      },
      onMessage: (message) => this.receive(message),
    });
  }

  // true — the picture is in the input node now
  async upload(file: File): Promise<boolean> {
    this.uploading = true;
    try {
      const { imageId } = await uploadImage(file);
      this.nodes = this.nodes.map((node) => (node.type === "input" ? { ...node, data: { imageId } } : node));
      this.uploadError = null;
      return true;
    } catch (error) {
      console.error("upload failed", error);
      this.uploadError = (error instanceof Error && UPLOAD_ERRORS[error.message]) || "upload failed";
      return false;
    } finally {
      this.uploading = false;
    }
  }

  // a node from the left menu, dropped at a flow position — unlinked until the user links it
  addNode(type: MenuNodeType, position: XYPosition) {
    if (type === "animation" && this.animationNode) return; // one per graph (contract)
    this.nodes = [...this.nodes, createNode(type, position)];
  }

  // a param change is a graph change → App sends a new render
  setNodeData(id: string, data: FlowNode["data"]) {
    this.nodes = this.nodes.map((node) => (node.id === id ? ({ ...node, data } as FlowNode) : node));
  }

  // a layers row goes away with its link
  removeLayerRow(nodeId: string, layerId: string) {
    const node = this.nodes.find((node): node is FlowNodeOf<"layers"> => node.id === nodeId && node.type === "layers");
    if (!node) return;
    this.edges = removeRowEdges(this.edges, nodeId, layerId);
    this.setNodeData(nodeId, { layers: removeLayer(node.data.layers, layerId) });
  }

  // a param's value at the playhead; null — no track with keys drives it
  animatedValue(nodeId: string, param: string): number | null {
    return this.animated.get(nodeId)?.[param] ?? null;
  }

  // a moved playhead is a new frame → App sends a new render, if the picture changes on it
  setPlayhead(frame: number) {
    this.playhead = frame;
  }

  // Play, one frame at a time: a frame is rendered, then the playhead moves on and the next one is rendered. A frame
  // is shown no shorter than 1 / fps, but as long as its render takes — no frames rendered ahead yet
  // (`docs/backlog/2026-11-06_play-frame-cache-on-client.md`)
  playing = $state(false);
  canRender = $derived(this.connected && this.imageId !== null);
  private playTimer: ReturnType<typeof setTimeout> | undefined;
  private frameShownAt = 0;

  togglePlay() {
    if (this.playing) return this.stop();
    if (!this.animationNode || !this.canRender) return;
    this.playing = true;
    this.frameShownAt = performance.now();
    this.nextAfterFrame();
  }

  stop() {
    this.playing = false;
    clearTimeout(this.playTimer);
  }

  private nextAfterFrame() {
    const node = this.animationNode;
    if (!this.playing || !node || !this.canRender) return this.stop();
    const wait = Math.max(0, 1000 / node.data.fps - (performance.now() - this.frameShownAt));
    clearTimeout(this.playTimer);
    this.playTimer = setTimeout(() => this.advance(), wait);
  }

  private advance() {
    const node = this.animationNode;
    if (!this.playing || !node) return this.stop();
    const before = this.graphKey;
    this.playhead = nextFrame(this.frame, node.data.frames);
    this.frameShownAt = performance.now();
    // the same picture (keys hold still here) — no render to wait for, App sends nothing
    if (this.graphKey === before) this.nextAfterFrame();
  }

  // a track goes away with its link and keys
  removeTrack(nodeId: string, trackId: string) {
    const node = this.animationNode;
    if (node?.id !== nodeId) return;
    this.edges = removeRowEdges(this.edges, nodeId, trackId);
    this.setNodeData(nodeId, { ...node.data, tracks: removeTrack(node.data.tracks, trackId) });
  }

  // a param linked into an empty track: the first key, at the playhead with the param's value
  seedTrack({ source, sourceHandle, target, targetHandle }: Link) {
    const node = this.animationNode;
    if (node?.id !== target || !sourceHandle || !targetHandle) return;
    const value = paramValue(this.nodes, source, sourceHandle);
    if (value !== null) this.setNodeData(target, { ...node.data, tracks: seedTrack(node.data.tracks, targetHandle, this.frame, value) });
  }

  // the param a track drives, its value in the node's own data
  trackParamValue(nodeId: string, trackId: string): number | null {
    const link = trackLink(this.edges, nodeId, trackId);
    return link?.sourceHandle ? paramValue(this.nodes, link.source, link.sourceHandle) : null;
  }

  // xyflow asks while a link is dragged over a handle: a cycle, a link into the input, … are refused
  canConnect(connection: Link) {
    return canConnect(this.nodes, this.edges, connection);
  }

  // a link dropped on a taken input replaces the one there, like blender; `keep` — the link being moved
  freeTarget(connection: Link, keep?: string) {
    this.edges = withoutTaken(this.edges, connection, keep);
  }

  render() {
    this.requestId += 1;
    this.rendering = true;
    this.socket?.send({ type: "render", requestId: this.requestId, graph: this.frameGraph });
  }

  download() {
    if (this.rendered) saveBlob(this.rendered.blob, outputFileName(TOAST, "png"));
  }

  exportToast() {
    saveBlob(new Blob([toToastFile(this.nodes, this.edges)], { type: "application/json" }), outputFileName(TOAST, "json"));
  }

  // input → output, the picture stays
  clearGraph() {
    const { nodes, edges } = emptyFlow(this.imageId);
    this.nodes = nodes;
    this.edges = edges;
    this.stop();
    this.playhead = 0;
    this.replaced++;
  }

  // true — the graph is replaced, the layout rebuilt; the uploaded picture stays
  async importToast(file: File): Promise<boolean> {
    try {
      const { nodes, edges } = fromToastFile(await file.text(), this.imageId);
      this.nodes = nodes;
      this.edges = edges;
      this.stop();
      this.playhead = 0;
      this.replaced++;
      this.importError = null;
      return true;
    } catch (error) {
      if (!(error instanceof ToastFileError)) console.error("toast import failed", error);
      this.importError = error instanceof ToastFileError ? error.message : "import failed";
      return false;
    }
  }

  private receive(message: ServerMessage) {
    if (message.requestId === null) return console.error("render-error", message);
    if (message.requestId !== this.requestId) return; // stale — a newer request was sent
    // the web doesn't send render-animation yet — the button, progress and download are the next web step
    if (message.type === "animation-progress" || message.type === "animation-rendered") return;

    this.rendering = false;
    if (message.type === "rendered") {
      this.renderError = null;
      this.setRendered(base64ToBlob(message.png, "image/png"));
      if (this.playing) this.nextAfterFrame();
      return;
    }

    this.stop();

    // TODO: notify the user (notification toast or something else) — to be designed
    console.error("render-error", message);
    this.renderError = { message: message.message, ...(message.nodeId && { nodeId: message.nodeId }) };
    // the old picture no longer matches the graph
    this.setRendered(null);
  }

  private setRendered(blob: Blob | null) {
    if (this.rendered) URL.revokeObjectURL(this.rendered.url);
    this.rendered = blob && { blob, url: URL.createObjectURL(blob) };
  }
}

export const session = new Session();
