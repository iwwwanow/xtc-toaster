// A render (pixel loops + png encoding) blocks its thread for seconds. It runs in a worker, so the
// event loop stays free and ws messages reach the per-connection queue while a render is going
// (latest-wins, ws.ts). One worker for the whole process: native canvas crashes bun once a second
// worker uses it. Renders of different connections wait in line — docs/backlog/2026-10-11_render-pipeline-evolution.md
import { GraphError } from "../../application/run-graph";
import type { RenderReply, RenderRequest } from "./render-worker";

type Rendered = Extract<RenderReply, { png: string }>;

export const createRenderQueue = (workerUrl: URL) => {
  let worker: Worker | null = null;
  let failRender: ((reason: Error) => void) | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  // A dead worker never replies: forget it — the next render starts a fresh one — and fail the render
  // in flight, or it holds the line forever. The close after terminate() finds the worker already forgotten.
  const discard = (dead: Worker, message: string) => {
    if (worker !== dead) return;
    worker = null;
    failRender?.(new Error(message));
  };

  const startWorker = () => {
    const started = new Worker(workerUrl);
    started.unref(); // an idle worker doesn't keep the process alive
    started.addEventListener("error", (event) => {
      discard(started, event.message);
      started.terminate();
    });
    started.addEventListener("close", () => discard(started, "render worker exited"));
    return started;
  };

  const run = (request: RenderRequest) =>
    new Promise<Rendered>((resolve, reject) => {
      worker ??= startWorker();
      failRender = reject;
      worker.onmessage = ({ data: reply }: MessageEvent<RenderReply>) => {
        if ("png" in reply) return resolve(reply);
        const { message, nodeId } = reply.error;
        reject(nodeId ? new GraphError(message, nodeId) : new Error(message));
      };
      worker.postMessage(request);
    });

  // one render at a time, in call order
  return (request: RenderRequest): Promise<Rendered> => {
    const result = queue.then(() => run(request));
    queue = result.catch(() => {});
    return result;
  };
};

export const render = createRenderQueue(new URL("./render-worker.ts", import.meta.url));
