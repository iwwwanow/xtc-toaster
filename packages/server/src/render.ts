// A render (pixel loops + png encoding) blocks its thread for seconds. It runs in a worker, so the
// event loop stays free and ws messages reach the per-connection queue while a render is going
// (latest-wins, ws.ts). One worker for the whole process: native canvas crashes bun once a second
// worker uses it. Renders of different connections wait in line — docs/backlog/2026-10-11_render-pipeline-evolution.md
import { GraphError } from "./run-graph";
import type { RenderReply, RenderRequest } from "./render-worker";

type Rendered = Extract<RenderReply, { png: string }>;

let worker: Worker | null = null;
let queue: Promise<unknown> = Promise.resolve();

const run = (request: RenderRequest) =>
  new Promise<Rendered>((resolve, reject) => {
    if (!worker) {
      worker = new Worker(new URL("./render-worker.ts", import.meta.url));
      worker.unref(); // an idle worker doesn't keep the process alive
    }
    worker.onmessage = ({ data: reply }: MessageEvent<RenderReply>) => {
      if ("png" in reply) return resolve(reply);
      const { message, nodeId } = reply.error;
      reject(nodeId ? new GraphError(message, nodeId) : new Error(message));
    };
    worker.onerror = (event) => reject(new Error(event.message));
    worker.postMessage(request);
  });

// one render at a time, in call order
export const render = (request: RenderRequest): Promise<Rendered> => {
  const result = queue.then(() => run(request));
  queue = result.catch(() => {});
  return result;
};
