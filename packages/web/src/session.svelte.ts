import type { Edge, XYPosition } from "@xyflow/svelte";
import {
  drivenValues,
  expandGroups,
  graphAtFrame,
  innerId,
  instanceOf,
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
  keepChain,
  leaveCopiesBehind,
  scopeOf,
  toFlow,
  withLink,
  toGraph,
  toToastFile,
  ToastFileError,
  withoutTaken,
  type Flow,
  type FlowGroup,
  type FlowNode,
  type FlowNodeOf,
  type Link,
  type MenuNodeType,
} from "./graph";
import {
  createInstance,
  exposedParams,
  groupOf,
  groupSelection,
  itemGroup,
  nodeLabel,
  paramBoundsOf,
  ungroup,
  type MenuItem,
} from "./groups";
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

// xyflow keeps what it measured and what is selected on the nodes it was given — a level put back (undo) keeps them
const keepUi = (next: FlowNode[], was: readonly FlowNode[]): FlowNode[] => {
  const current = new Map(was.map((node) => [node.id, node]));
  return next.map((node) => {
    const old = current.get(node.id);
    return old ? { ...node, measured: old.measured, selected: old.selected } : node;
  });
};

class Session {
  // the toast's root level and its group definitions (each one's inside a level of its own, with positions)
  private rootNodes = $state.raw<FlowNode[]>(initial.nodes);
  private rootEdges = $state.raw<Edge[]>(initial.edges);
  groups = $state.raw<FlowGroup[]>(initial.groups ?? []);
  // the level on screen: null — the root, else the group whose inside is open; ui state, not in the toast. A group
  // gone (an undo before it was made) — the root
  private view = $state<string | null>(null);
  openGroup = $derived(this.view === null ? undefined : this.groups.find(({ id }) => id === this.view));

  // the level on screen, as SvelteFlow binds it — the root's nodes and links or the open group's
  get nodes(): FlowNode[] {
    return this.openGroup?.nodes ?? this.rootNodes;
  }
  set nodes(nodes: FlowNode[]) {
    const open = this.openGroup;
    if (open) this.groups = this.groups.map((group) => (group.id === open.id ? { ...group, nodes } : group));
    else this.rootNodes = nodes;
  }
  get edges(): Edge[] {
    return this.openGroup?.edges ?? this.rootEdges;
  }
  set edges(edges: Edge[]) {
    const open = this.openGroup;
    if (open) this.groups = this.groups.map((group) => (group.id === open.id ? { ...group, edges } : group));
    else this.rootEdges = edges;
  }
  // the level on screen inside the whole toast — every check of an edit (a link, a drop, a delete) sees what it touches
  scope = $derived(scopeOf({ nodes: this.rootNodes, edges: this.rootEdges, groups: this.groups }, this.openGroup?.id ?? null));

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
  private history = new History(toSaved(initial.nodes, initial.edges, initial.export, initial.groups));
  canUndo = $state(false);
  canRedo = $state(false);

  // a node is being dragged: the drag and what its drop does (going into a link) are one step, however long it
  // pauses on the way — App records no step until it's let go
  dragging = $state(false);
  // the link the dragged node would go into if let go now — LinkEdge highlights it
  dropLink = $state<string | null>(null);
  // the node a pixel wire would go into if let go now, over its frame (linkOntoNode) — Editor highlights it
  dropNode = $state.raw<{ node: string; link: Link } | null>(null);
  // the node type (or group) being dragged out of the left menu — a drag's data can't be read before the drop
  menuDrag: MenuItem | null = null;

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
    this.rootNodes.find((node): node is FlowNodeOf<"input"> => node.type === "input")?.data.imageId ?? null,
  );
  animationNode = $derived(this.rootNodes.find((node): node is FlowNodeOf<"animation"> => node.type === "animation"));

  // ui state, not in the toast; the wanted frame stays while `frames` shrinks and grows back
  private playhead = $state(0);
  frame = $derived(this.animationNode ? clampPlayhead(this.playhead, this.animationNode.data.frames) : 0);

  private graph = $derived(toGraph(this.rootNodes, this.rootEdges, this.exportSettings, this.groups));
  // the groups' instances turned into their insides — what is rendered, what the tracks reach
  private expanded = $derived(expandGroups(this.graph));
  // what the tracks and the value nodes put into the params at the playhead; inside a group — what its own value and
  // factor nodes put there (its instances may each be animated apart)
  private driven = $derived(
    this.openGroup
      ? drivenValues(toGraph(this.openGroup.nodes, this.openGroup.edges), this.frame)
      : drivenValues(this.expanded, this.frame),
  );
  // what one render needs: the frame under the playhead, without the animation node, the groups expanded
  private frameGraph = $derived(withoutAnimation(graphAtFrame(this.expanded, this.frame)));
  // only what goes to the server — ui fields (position, measured, …) don't count as a graph change
  graphKey = $derived(JSON.stringify(this.frameGraph));

  // ids grow across renders and exports; requestId — the last render, exportId — the running export
  private lastRequestId = 0;
  private requestId = 0;
  private exportId: number | null = null;
  private socket: ReturnType<typeof connectSocket> | null = null;

  // the whole editor as persist saves it and the history steps through it — every level, not just the one on screen
  snapshot() {
    return toSaved(this.rootNodes, this.rootEdges, this.exportSettings, this.groups);
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
    // xyflow keeps what it measured; the selection stays as it was. The view stays — on the root if its group is gone
    this.setFlow(flow, true);
    this.history.settle(this.snapshot());
    this.syncHistory();
  }

  // a whole flow in place of the editor's (import, clear, an undo); `keep` — the nodes keep what xyflow measured
  private setFlow(flow: Flow, keep = false) {
    const groups = flow.groups ?? [];
    const was = new Map(this.groups.map((group) => [group.id, group.nodes]));
    this.rootNodes = keep ? keepUi(flow.nodes, this.rootNodes) : flow.nodes;
    this.rootEdges = flow.edges;
    this.groups = keep ? groups.map((group) => ({ ...group, nodes: keepUi(group.nodes, was.get(group.id) ?? []) })) : groups;
    this.exportSettings = flow.export ?? {};
    if (!keep || !this.groups.some(({ id }) => id === this.view)) this.view = null;
  }

  // into a group's inside (double click, `open`) and back to the root (the breadcrumb). Not during a drag
  openView(group: string | null) {
    if (this.dragging) return;
    this.view = group !== null && this.groups.some(({ id }) => id === group) ? group : null;
  }

  // why the last `group` was refused — shown in the selection's toolbar until the selection changes
  groupError = $state<string | null>(null);

  // the selected nodes of the root into a new group, an instance in their place (groupSelection); one step
  groupSelected(selected: readonly string[]) {
    if (this.openGroup) {
      this.groupError = "no group inside a group yet";
      return;
    }
    const result = groupSelection({ nodes: this.rootNodes, edges: this.rootEdges, groups: this.groups }, selected);
    if ("error" in result) {
      this.groupError = result.error;
      return;
    }
    this.groupError = null;
    this.groups = result.groups;
    this.rootNodes = result.nodes;
    this.rootEdges = result.edges;
  }

  // an instance back into its nodes, selected; the group stays in the left menu; one step
  ungroup(instance: string) {
    if (this.openGroup) return;
    const result = ungroup({ nodes: this.rootNodes, edges: this.rootEdges, groups: this.groups }, instance);
    if (!result) return;
    this.rootNodes = result.nodes;
    this.rootEdges = result.edges;
  }

  // how many instances of a group stand at the root
  instancesOf(group: string): number {
    return this.rootNodes.filter((node) => node.type === "group" && node.data.group === group).length;
  }

  // a group's name — its instances' legend, the breadcrumb, the left menu; empty keeps the old one
  renameGroup(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.groups = this.groups.map((group) => (group.id === id ? { ...group, name: trimmed } : group));
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
      this.rootNodes = this.rootNodes.map((node) => (node.type === "input" ? { ...node, data: { imageId } } : node));
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

  // a node from the left menu, dropped at a flow position — unlinked until the user links it, or dropped onto a
  // link — into it; one step either way
  addNode(item: MenuItem, position: XYPosition, link?: string | null) {
    const node = this.menuNode(item, position);
    if (!node) return;
    this.nodes = [...this.nodes, node];
    if (link) this.insertOnLink(node.id, link);
  }

  // what a menu item makes: a node of that type, or an instance of that group. None: a second animation node (one per
  // graph, at the root), anything of a group inside a group (no nesting yet), a group that's gone
  private menuNode(item: MenuItem, position: XYPosition): FlowNode | null {
    const group = itemGroup(item);
    if (group !== null) return this.openGroup || !this.groups.some(({ id }) => id === group) ? null : createInstance(group, position);
    if (item === "animation" && (this.animationNode || this.openGroup)) return null;
    return createNode(item as MenuNodeType, position);
  }

  // a group no instance uses goes from the left menu; one step
  removeGroup(id: string) {
    if (this.instancesOf(id) > 0) return;
    this.groups = this.groups.filter((group) => group.id !== id);
  }

  // a node dragged onto a link and let go goes into it: A → node → B
  insertOnLink(nodeId: string, edgeId: string) {
    const edges = insertOnLink(this.nodes, this.edges, nodeId, edgeId, this.scope);
    if (edges) this.edges = edges;
  }

  // after a delete: the deleted nodes' sources linked to what they fed (keepChain)
  keepChain(nodes: string[], edges: Edge[]) {
    const gone = new Set(nodes);
    const left = this.edges.filter(({ source, target }) => !gone.has(source) && !gone.has(target));
    this.edges = keepChain(this.nodes.filter(({ id }) => !gone.has(id)), left, { nodes, edges }, this.scope);
  }

  // Alt + drag: copies left where the dragged nodes stood, with their links; the dragged ones go on as the copies
  leaveCopiesBehind(dragged: string[]) {
    const result = leaveCopiesBehind(this.nodes, this.edges, dragged);
    if (!result) return;
    this.nodes = result.nodes;
    this.edges = result.edges;
  }

  // a link the node may go into — asked on every move of a drag; a menu item — one still in the menu
  canInsertOnLink(node: string | MenuItem, edgeId: string) {
    if (node === this.menuDrag) {
      const created = this.menuNode(node, { x: 0, y: 0 });
      return created !== null && insertOnLink([...this.nodes, created], this.edges, created.id, edgeId, this.scope) !== null;
    }
    return insertOnLink(this.nodes, this.edges, node, edgeId, this.scope) !== null;
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

  // a param's value at the playhead; null — no track with keys and no value node drives it. An instance's exposed
  // param is what reaches its inner node
  animatedValue(nodeId: string, param: string): number | null {
    const node = this.nodes.find(({ id }) => id === nodeId);
    const exposed = node?.type === "group" ? exposedParams(groupOf(this.groups, node)).find(({ id }) => id === param) : undefined;
    if (exposed) return this.driven.get(innerId(nodeId, exposed.node))?.[exposed.param] ?? null;
    return this.driven.get(nodeId)?.[param] ?? null;
  }

  // the value or factor node a param is wired into — it sets the param, not a track; null — none
  driverOf(nodeId: string, param: string): "value" | "factor" | null {
    const link = this.edges.find(({ source, sourceHandle }) => source === nodeId && sourceHandle === param);
    const type = link && this.nodes.find(({ id }) => id === link.target)?.type;
    return type === "value" || type === "factor" ? type : null;
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
    const value = param && paramValue(this.nodes, param.node.id, param.param, this.groups);
    if (value !== null) this.setNodeData(target, { ...node.data, tracks: seedTrack(node.data.tracks, targetHandle, this.frame, value) });
  }

  // a param wired into a value or a factor nothing is wired into yet: it takes the param's number (a factor — where it
  // sits in the param's range) — the picture doesn't jump (like a track's first key)
  seedValue({ source, sourceHandle, target }: Link) {
    const node = this.nodes.find(({ id }) => id === target);
    if ((node?.type !== "value" && node?.type !== "factor") || !sourceHandle) return;
    if (this.edges.some((edge) => edge.target === target && edge.sourceHandle)) return;
    const value = paramValue(this.nodes, source, sourceHandle, this.groups);
    if (value === null) return;
    if (node.type === "value") return this.setNodeData(target, { value });
    const bounds = paramBoundsOf(this.groups, this.nodes.find(({ id }) => id === source), sourceHandle);
    if (bounds) this.setNodeData(target, { factor: (value - bounds.min) / (bounds.max - bounds.min) });
  }

  // A param's wire dropped on `+ track` (09.11): a new track on top, linked to that param, with its first key.
  // A param that drives a track already makes none — a second track would take its link and strand the first
  // one's keys (dropped on a track's handle, the link does move: that is asked for). Two steps: the track, then —
  // once its handle is measured (`linkTrack`) — the link; a link before its handle is drawn nowhere (xyflow #008)
  addLinkedTrack(source: string, sourceHandle: string): Link | null {
    const node = this.animationNode;
    if (!node || this.animationLocked || this.openGroup) return null;
    if (this.edges.some((edge) => edge.target === node.id && edge.source === source && edge.sourceHandle === sourceHandle))
      return null;
    const at = linkedTrackIndex(this.nodes, this.edges, node.id, node.data.tracks, paramOf(this.nodes, this.edges, source, sourceHandle)?.node.id ?? source);
    const tracks = addTrack(node.data.tracks, at);
    const link = { source, sourceHandle, target: node.id, targetHandle: tracks[at]!.id };
    const nodes = this.nodes.map((n) => (n.id === node.id ? ({ ...n, data: { ...node.data, tracks } } as FlowNode) : n));
    if (!canConnect(nodes, this.edges, link, this.scope)) return null;
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
    return param ? paramValue(this.nodes, param.node.id, param.param, this.groups) : null;
  }

  // xyflow asks while a link is dragged over a handle: a cycle, a link into the input, … are refused
  canConnect(connection: Link) {
    return canConnect(this.nodes, this.edges, connection, this.scope);
  }

  // a wire let go over a node's frame (linkOntoNode): in place of what that input had; `keep` — the link whose end
  // was moved there, it goes. One edges write — one step
  linkOntoNode(link: Link, keep?: string) {
    this.edges = withLink(this.edges, link, keep);
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
    this.canRender && !this.uploading && this.exporting === null && hasAnimatedParams(this.expanded),
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
        const node = this.rootNodes.find(({ id }) => id === (message.nodeId && instanceOf(this.graph, message.nodeId)));
        this.endExport(node ? `${nodeLabel(node, this.groups)}: ${message.message}` : message.message);
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
    const file = toToastFile(this.rootNodes, this.rootEdges, this.exportSettings, this.groups);
    saveBlob(new Blob([file], { type: "application/json" }), outputFileName("json"));
  }

  // input → output, the picture stays
  clearGraph() {
    this.recordHistory(); // an edit still settling stays a step of its own
    this.setFlow(emptyFlow(this.imageId));
    this.stop();
    this.playhead = 0;
    this.replaced++;
    this.recordHistory();
  }

  // true — the graph is replaced, the layout rebuilt; the uploaded picture stays
  async importToast(file: File): Promise<boolean> {
    try {
      const flow = fromToastFile(await file.text(), this.imageId);
      this.recordHistory();
      this.setFlow(flow);
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
    // an issue inside an instance (`<instance>/<inner>`) is shown on the instance
    const nodeId = message.nodeId && instanceOf(this.graph, message.nodeId);
    this.renderError = { message: message.message, ...(nodeId && { nodeId }) };
    // the old picture no longer matches the graph
    this.setRendered(null);
  }

  private setRendered(blob: Blob | null) {
    if (this.rendered) URL.revokeObjectURL(this.rendered.url);
    this.rendered = blob && { blob, url: URL.createObjectURL(blob) };
  }
}

export const session = new Session();
