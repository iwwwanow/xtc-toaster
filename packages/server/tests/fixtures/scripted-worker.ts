// Stands in for render-worker.ts in render-queue.test.ts: does what the request's `action` says
declare const self: Worker;

self.onmessage = ({ data: { action } }: MessageEvent<{ action: "reply" | "exit" | "throw" }>) => {
  if (action === "exit") process.exit(1);
  if (action === "throw") throw new Error("worker blew up");
  self.postMessage({ width: 1, height: 1, png: "cG5n" });
};
