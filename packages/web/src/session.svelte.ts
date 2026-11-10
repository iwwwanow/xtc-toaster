import type { Edge, XYPosition } from "@xyflow/svelte";
import {
  animatedValues,
  graphAtFrame,
  UPLOAD_MAX_MEGAPIXELS,
  type AnimationExport,
  type AnimationFormat,
  type RenderErrorMessage,
  type ServerMessage,
} from "@xtc-toaster/contract";
import { toast2signac } from "@xtc-toaster/toasts";
import { addTrack, clampPlayhead, hasAnimatedParams, linkedTrackIndex, nextFrame, paramOf, paramValue, removeTrack, seedTrack, trackParam, withoutAnimation } from "./animation";
import { removeLayer, removeRowEdges } from "./layers";
import { base64ToBlob, outputFileName, saveBlob } from "./files";
import {
  canConnect,
  createNode,
  emptyFlow,
  fromToastFile,
  insertOnLink,
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
import { History } from "./history";
import { fromSaved, loadSaved, toSaved } from "./persist";
import { connectSocket, wsUrl } from "./socket";
import { uploadImage } from "./upload";

// the editor as it was before the reload, else the default toast
const initial = fromSaved(loadSaved()) ?? toFlow(toast2signac);

const UPLOAD_ERRORS: Record<string, string> = {
  // the server checks megapixels and bytes; MP read like MB (the sister's test), so one number in MB: a photo
  // jpeg is ≈ 0.5 MB per MP — the pixel limit binds first. Approximate: a png of the same size passes at several MB
  "too-large": `too large: max ≈ ${UPLOAD_MAX_MEGAPIXELS * 0.5} MB`,
  "unsupported-format": "png or jpeg only",
};

// the file's extension from the url the server made — the format the file was rendered in
const extensionOf = (url: string) => url.slice(url.lastIndexOf(".") + 1);

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

  // undo / redo: snapshots of the editor, a step once an edit settles (App → recordHistory)
  private history = new History(toSaved(initial.nodes, initial.edges, initial.export));
  canUndo = $state(false);
  canRedo = $state(false);

  // a node is being dragged: the drag and what its drop does (going into a link) are one step, however long it
  // pauses on the way — App records no step until it's let go
  dragging = $state(false);
  // the link the dragged node would go into if let go now — LinkEdge highlights it
  dropLink = $state<string | null>(null);

  // bumped when the graph is replaced as a whole (import, clear) — Editor arranges it (elk) and fits the view
  replaced = $state(0);

  // how render-animation writes the file (format, loop) — the toast's, saved with it; {} — the defaults
  exportSettings = $state.raw<AnimationExport>(initial.export ?? {});
  exportFormat = $derived<AnimationFormat>(this.exportSettings.format ?? "gif");

  // a render-animation running: frames done of frames; null — no export
  exporting = $state.raw<{ frame: number; frames: number } | null>(null);
  // shown under the export button
  exportError = $state<string | null>(null);

  locked = $derived(!this.connected || this.uploading || this.rendering || this.exporting !== null);
  // the animation node stays live during a render: scrubbing and setting keys would otherwise wait for every frame's
  // render, and latest-wins already drops what they make stale. Not during an export: the server takes one message
  // at a time, and a render sent now would replace the waiting export
  animationLocked = $derived(!this.connected || this.uploading || this.exporting !== null);
  imageId = $derived(
    this.nodes.find((node): node is FlowNodeOf<"input"> => node.type === "input")?.data.imageId ?? null,
  );
  animationNode = $derived(this.nodes.find((node): node is FlowNodeOf<"animation"> => node.type === "animation"));

  // ui state, not in the toast; the wanted frame stays while `frames` shrinks and grows back
  private playhead = $state(0);
  frame = $derived(this.animationNode ? clampPlayhead(this.playhead, this.animationNode.data.frames) : 0);

  private graph = $derived(toGraph(this.nodes, this.edges, this.exportSettings));
  private animated = $derived(animatedValues(this.graph, this.frame));
  // what one render needs: the frame under the playhead, without the animation node
  private frameGraph = $derived(withoutAnimation(graphAtFrame(this.graph, this.frame)));
  // only what goes to the server — ui fields (position, measured, …) don't count as a graph change
  graphKey = $derived(JSON.stringify(this.frameGraph));

  // ids grow across renders and exports; requestId — the last render, exportId — the running export
  private lastRequestId = 0;
  private requestId = 0;
  private exportId: number | null = null;
  private socket: ReturnType<typeof connectSocket> | null = null;

  private snapshot() {
    return toSaved(this.nodes, this.edges, this.exportSettings);
  }

  private syncHistory() {
    this.canUndo = this.history.canUndo;
    this.canRedo = this.history.canRedo;
  }

  // the history starts over from what's on screen — dev's debug toast / picture on open aren't edits to undo
  restartHistory() {
    this.history = new History(this.snapshot());
    this.syncHistory();
  }

  // a replaced graph (import, clear) is one step: the arrange that follows it (Editor) goes into that step
  amendHistory() {
    this.history.settle(this.snapshot());
  }

  // an edit has settled — a step back to before it
  recordHistory(snapshot = this.snapshot()) {
    if (this.history.record(snapshot)) this.syncHistory();
  }

  undo() {
    this.step(() => this.history.undo());
  }

  redo() {
    this.step(() => this.history.redo());
  }

  // not during an export or an upload — the editor is locked then. An edit still settling is a step of its own,
  // so an undo right after it takes back that edit, not the one before
  private step(move: () => string | null) {
    if (this.exporting !== null || this.uploading) return;
    this.recordHistory();
    const text = move();
    if (text === null) return;
    const flow = fromSaved(text);
    if (!flow) {
      console.error("history step dropped — the snapshot doesn't parse");
      this.syncHistory();
      return;
    }
    // xyflow keeps what it measured; the selection stays as it was
    const current = new Map(this.nodes.map((node) => [node.id, node]));
    this.nodes = flow.nodes.map((node) => {
      const was = current.get(node.id);
      return was ? { ...node, measured: was.measured, selected: was.selected } : node;
    });
    this.edges = flow.edges;
    this.exportSettings = flow.export ?? {};
    this.history.settle(this.snapshot());
    this.syncHistory();
  }

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
        if (this.exporting) this.endExport("connection lost — render the animation again");
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

  // a node dragged onto a link and let go goes into it: A → node → B
  insertOnLink(nodeId: string, edgeId: string) {
    const edges = insertOnLink(this.nodes, this.edges, nodeId, edgeId);
    if (edges) this.edges = edges;
  }

  // a link the node may go into — asked on every move of a drag
  canInsertOnLink(nodeId: string, edgeId: string) {
    return insertOnLink(this.nodes, this.edges, nodeId, edgeId) !== null;
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
    const param = paramOf(this.nodes, this.edges, source, sourceHandle);
    const value = param && paramValue(this.nodes, param.node.id, param.param);
    if (value !== null) this.setNodeData(target, { ...node.data, tracks: seedTrack(node.data.tracks, targetHandle, this.frame, value) });
  }

  // A param's wire dropped on `+ track` (09.11): a new track on top, linked to that param, with its first key.
  // A param that drives a track already makes none — a second track would take its link and strand the first
  // one's keys (dropped on a track's handle, the link does move: that is asked for). Two steps: the track, then —
  // once its handle is measured (`linkTrack`) — the link; a link before its handle is drawn nowhere (xyflow #008)
  addLinkedTrack(source: string, sourceHandle: string): Link | null {
    const node = this.animationNode;
    if (!node || this.animationLocked) return null;
    if (this.edges.some((edge) => edge.target === node.id && edge.source === source && edge.sourceHandle === sourceHandle))
      return null;
    const at = linkedTrackIndex(this.nodes, this.edges, node.id, node.data.tracks, paramOf(this.nodes, this.edges, source, sourceHandle)?.node.id ?? source);
    const tracks = addTrack(node.data.tracks, at);
    const link = { source, sourceHandle, target: node.id, targetHandle: tracks[at]!.id };
    const nodes = this.nodes.map((n) => (n.id === node.id ? ({ ...n, data: { ...node.data, tracks } } as FlowNode) : n));
    if (!canConnect(nodes, this.edges, link)) return null;
    this.nodes = nodes;
    return link;
  }

  linkTrack(link: Link) {
    if (!this.canConnect(link)) return;
    const { source, sourceHandle, target, targetHandle } = link;
    this.edges = [...this.edges, { id: `xy-edge__${source}${sourceHandle}-${target}${targetHandle}`, ...link }];
    this.seedTrack(link);
  }

  // the param a track drives, its value in the node's own data
  trackParamValue(nodeId: string, trackId: string): number | null {
    const param = trackParam(this.nodes, this.edges, nodeId, trackId);
    return param ? paramValue(this.nodes, param.node.id, param.param) : null;
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
    this.requestId = ++this.lastRequestId;
    this.rendering = true;
    this.socket?.send({ type: "render", requestId: this.requestId, graph: this.frameGraph });
  }

  // the button: a picture to render and keys that move something
  canExport = $derived(
    this.canRender && !this.uploading && this.exporting === null && hasAnimatedParams(this.graph),
  );

  // the export settings change no picture: frameGraph drops them, no render is sent
  setExportSettings(settings: AnimationExport) {
    this.exportSettings = settings;
  }

  // One cycle of the animation node as a gif / mp4, rendered on the server frame by frame, then downloaded. Renders
  // wait until it's done (App), the editor is locked; a render already sent still comes back under its own id
  exportAnimation() {
    const node = this.animationNode;
    if (!this.canExport || !node) return;
    this.stop();
    this.exportId = ++this.lastRequestId;
    this.exporting = { frame: 0, frames: node.data.frames };
    this.exportError = null;
    this.socket?.send({ type: "render-animation", requestId: this.exportId, graph: this.graph });
  }

  private async receiveExport(message: ServerMessage) {
    switch (message.type) {
      case "animation-progress":
        this.exporting = { frame: message.frame, frames: message.frames };
        return;
      case "animation-rendered":
        try {
          const response = await fetch(message.url);
          if (!response.ok) throw new Error(`GET ${message.url}: ${response.status}`);
          saveBlob(await response.blob(), outputFileName(extensionOf(message.url)));
          this.endExport(null);
        } catch (error) {
          console.error("animation download failed", error);
          this.endExport("download failed");
        }
        return;
      case "render-error": {
        console.error("render-animation error", message);
        const type = this.nodes.find(({ id }) => id === message.nodeId)?.type;
        this.endExport(type ? `${type}: ${message.message}` : message.message);
        return;
      }
      case "rendered":
        return; // never for a render-animation
    }
  }

  private endExport(error: string | null) {
    this.exportId = null;
    this.exporting = null;
    this.exportError = error;
  }

  download() {
    if (this.rendered) saveBlob(this.rendered.blob, outputFileName("png"));
  }

  exportToast() {
    const file = toToastFile(this.nodes, this.edges, this.exportSettings);
    saveBlob(new Blob([file], { type: "application/json" }), outputFileName("json"));
  }

  // input → output, the picture stays
  clearGraph() {
    this.recordHistory(); // an edit still settling stays a step of its own
    const { nodes, edges } = emptyFlow(this.imageId);
    this.nodes = nodes;
    this.edges = edges;
    this.exportSettings = {};
    this.stop();
    this.playhead = 0;
    this.replaced++;
    this.recordHistory();
  }

  // true — the graph is replaced, the layout rebuilt; the uploaded picture stays
  async importToast(file: File): Promise<boolean> {
    try {
      const { nodes, edges, export: settings } = fromToastFile(await file.text(), this.imageId);
      this.recordHistory();
      this.nodes = nodes;
      this.edges = edges;
      this.exportSettings = settings ?? {};
      this.stop();
      this.playhead = 0;
      this.replaced++;
      this.recordHistory();
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
    if (message.requestId === this.exportId) return void this.receiveExport(message);
    if (message.requestId !== this.requestId) return; // stale — a newer request was sent
    if (message.type === "animation-progress" || message.type === "animation-rendered") return; // an old export's

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
