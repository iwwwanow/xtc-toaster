import type { Edge } from "@xyflow/svelte";
import type { ServerMessage } from "@xtc-toaster/contract";
import { toast2signac } from "@xtc-toaster/toasts";
import { base64ToBlob, outputFileName, saveBlob } from "./files";
import { toFlow, toGraph, type FlowNode, type FlowNodeOf } from "./graph";
import { connectSocket, wsUrl } from "./socket";
import { uploadImage } from "./upload";

// toast directory name — prefix of downloaded files
const TOAST = "toast-2_signac";
const initial = toFlow(toast2signac);

class Session {
  nodes = $state.raw<FlowNode[]>(initial.nodes);
  edges = $state.raw<Edge[]>(initial.edges);

  connected = $state(false);
  uploading = $state(false);
  rendering = $state(false);
  // png of the last sent requestId — output shows it, download saves the same bytes
  rendered = $state.raw<{ blob: Blob; url: string } | null>(null);

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

  async upload(file: File) {
    this.uploading = true;
    try {
      const { imageId } = await uploadImage(file);
      this.nodes = this.nodes.map((node) => (node.type === "input" ? { ...node, data: { imageId } } : node));
    } catch (error) {
      console.error("upload failed", error);
    } finally {
      this.uploading = false;
    }
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
    if (message.type === "rendered") return this.setRendered(base64ToBlob(message.png, "image/png"));

    // TODO: notify the user (notification toast or something else) — to be designed
    console.error("render-error", message);
    // the old picture no longer matches the graph
    this.setRendered(null);
  }

  private setRendered(blob: Blob | null) {
    if (this.rendered) URL.revokeObjectURL(this.rendered.url);
    this.rendered = blob && { blob, url: URL.createObjectURL(blob) };
  }
}

export const session = new Session();
