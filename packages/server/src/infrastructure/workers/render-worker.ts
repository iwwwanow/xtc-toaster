// Render worker: the whole render (runGraph + png encoding) off the main thread, see render-queue.ts
import type { NodeId, ToastGraph } from "@xtc-toaster/contract";
import { render } from "../../application/render";
import { GraphError } from "../../application/run-graph";

export type RenderRequest = { graph: ToastGraph; uploadsDir: string; maxLayers?: number };
export type RenderReply =
  | { width: number; height: number; png: string } // base64
  | { error: { message: string; nodeId?: NodeId } };

declare const self: Worker;

self.onmessage = async ({ data: { graph, uploadsDir, maxLayers } }: MessageEvent<RenderRequest>) => {
  let reply: RenderReply;
  try {
    const { png, width, height } = await render(graph, uploadsDir, maxLayers);
    reply = { width, height, png: png.toString("base64") };
  } catch (e) {
    const nodeId = e instanceof GraphError ? e.nodeId : undefined;
    reply = { error: { message: e instanceof Error ? e.message : String(e), ...(nodeId && { nodeId }) } };
  }
  self.postMessage(reply);
};