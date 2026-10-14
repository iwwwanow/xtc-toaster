import type { Edge, XYPosition } from "@xyflow/svelte";
import {
  UPLOAD_MAX_BYTES,
  type RenderErrorMessage,
  type ServerMessage,
} from "@xtc-toaster/contract";
import { toast2signac } from "@xtc-toaster/toasts";
import { base64ToBlob, outputFileName, saveBlob } from "./files";
import { createNode, toFlow, toGraph, type FlowNode, type FlowNodeOf, type MenuNodeType } from "./graph";
import { connectSocket, wsUrl } from "./socket";
import { uploadImage } from "./upload";

// toast directory name — prefix of downloaded files
const TOAST = "toast-2_signac";
const initial = toFlow(toast2signac);

const UPLOAD_ERRORS: Record<string, string> = {
  "too-large": `too large: max ${UPLOAD_MAX_BYTES / 1024 / 1024} MB`,
  "unsupported-format": "png or jpeg only",
};

class Session {
  nodes = $state.raw<FlowNode[]>(initial.nodes);
  edges = $state.raw<Edge[]>(initial.edges);

  connected = $state(false);
  uploading = $state(false);
  rendering = $state(false);
  // png of the last sent requestId — output shows it, download saves the same bytes
  rendered = $state.raw<{ blob: Blob; url: string } | null>(null);
  // render-error of the last sent requestId — the only error shown in the ui, the rest is console.error
  renderError = $state.raw<Pick<RenderErrorMessage, "message" | "nodeId"> | null>(null);
  // shown in the input node — a rejected upload otherwise looks like the picture just did not change
  uploadError = $state<string | null>(null);

  locked = $derived(!this.connected || this.uploading || this.rendering);
  imageId = $derived(
    this.nodes.find((node): node is FlowNodeOf<"input"> => node.type === "input")?.data.imageId ?? null,
  );
  // only what goes to the server — ui fields (position, measured, …) don't count as a graph change
  graphKey = $derived(JSON.stringify(toGraph(this.nodes, this.edges)));

  private requestId = 0;
  private socket: ReturnType<typeof connectSocket> | null = null;

  connect() {
    this.socket = connectSocket(wsUrl(location), {
      onOpen: () => (this.connected = true),
      onClose: (event) => {
        console.error("ws disconnected", event);
        this.connected = false;
        // an in-flight response is lost — the graph is re-sent after reconnect
        this.rendering = false;
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
    this.nodes = [...this.nodes, createNode(type, position)];
  }

  // a param change is a graph change → App sends a new render
  setNodeData(id: string, data: FlowNode["data"]) {
    this.nodes = this.nodes.map((node) => (node.id === id ? ({ ...node, data } as FlowNode) : node));
  }

  render() {
    this.requestId += 1;
    this.rendering = true;
    this.socket?.send({ type: "render", requestId: this.requestId, graph: toGraph(this.nodes, this.edges) });
  }

  download() {
    if (this.rendered) saveBlob(this.rendered.blob, outputFileName(TOAST, "png"));
  }

  private receive(message: ServerMessage) {
    if (message.requestId === null) return console.error("render-error", message);
    if (message.requestId !== this.requestId) return; // stale — a newer request was sent

    this.rendering = false;
    if (message.type === "rendered") {
      this.renderError = null;
      return this.setRendered(base64ToBlob(message.png, "image/png"));
    }

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
