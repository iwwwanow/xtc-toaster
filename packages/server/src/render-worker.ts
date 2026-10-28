// Render worker: the whole render (runGraph + png encoding) off the main thread, see render.ts
import type { NodeId, ToastGraph } from "@xtc-toaster/contract";
import { encodePng } from "./codec";
import { GraphError, runGraph } from "./run-graph";

export type RenderRequest = { graph: ToastGraph; uploadsDir: string; maxLayers?: number };
export type RenderReply =
  | { width: number; height: number; png: string } // base64
  | { error: { message: string; nodeId?: NodeId } };

declare const self: Worker;

self.onmessage = async ({ data: { graph, uploadsDir, maxLayers } }: MessageEvent<RenderRequest>) => {
  let reply: RenderReply;
  try {
    const { data, width, height } = await runGraph(graph, uploadsDir, maxLayers);
    reply = { width, height, png: encodePng(data, { width, height }).toString("base64") };
  } catch (e) {
    const nodeId = e instanceof GraphError ? e.nodeId : undefined;
    reply = { error: { message: e instanceof Error ? e.message : String(e), ...(nodeId && { nodeId }) } };
  }
  self.postMessage(reply);
};
