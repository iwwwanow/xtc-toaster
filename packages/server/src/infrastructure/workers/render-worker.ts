// Render worker: the whole render (runGraph + png encoding) off the main thread, see render-queue.ts
import type { NodeId, ToastGraph } from "@xtc-toaster/contract";
import { render } from "../../application/render";
import { GraphError } from "../../application/run-graph";
import { loadUpload } from "../repository/uploads";

// `outPath` — the png goes to that file (a frame of an animation), not back in the reply
export type RenderRequest = { graph: ToastGraph; uploadsDir: string; maxLayers?: number; outPath?: string };
export type RenderReply =
  | { width: number; height: number; png?: string } // base64; none with `outPath`
  | { error: { message: string; nodeId?: NodeId } };

declare const self: Worker;

self.onmessage = async ({ data: { graph, uploadsDir, maxLayers, outPath } }: MessageEvent<RenderRequest>) => {
  let reply: RenderReply;
  try {
    const { png, width, height } = await render(graph, (imageId) => loadUpload(uploadsDir, imageId), maxLayers);
    if (outPath) await Bun.write(outPath, png);
    reply = outPath ? { width, height } : { width, height, png: png.toString("base64") };
  } catch (e) {
    const nodeId = e instanceof GraphError ? e.nodeId : undefined;
    reply = { error: { message: e instanceof Error ? e.message : String(e), ...(nodeId && { nodeId }) } };
  }
  self.postMessage(reply);
};