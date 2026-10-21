import { mkdir } from "node:fs/promises";
import { createStaticHandler } from "./static";
import { handleUpload } from "./upload";
import { removeExpired, type UploadsLimits } from "./uploads-cleanup";
import { createWsHandler, initialWsData } from "./ws";

export type ServerOptions = {
  port: number;
  hostname?: string;
  uploadsDir: string;
  uploads: UploadsLimits;
  // the web build; without it (dev) the vite dev server serves the page
  staticDir?: string;
};

const CLEANUP_INTERVAL_MS = 3_600_000;

const notFound = () => new Response("not found", { status: 404 });

export const createServer = async ({ port, hostname, uploadsDir, uploads, staticDir }: ServerOptions) => {
  await mkdir(uploadsDir, { recursive: true });

  const cleanup = () =>
    removeExpired(uploadsDir, uploads.ttlMs)
      .then((removed) => removed > 0 && console.log(`uploads: ${removed} expired removed`))
      .catch((error) => console.error("uploads cleanup failed", error));
  await cleanup();
  // unref — the timer alone doesn't keep the process (or a test run) alive
  setInterval(cleanup, CLEANUP_INTERVAL_MS).unref();

  return Bun.serve({
    port,
    hostname,
    routes: {
      "/healthz": new Response("ok"),
      "/api/images": {
        POST: (req) => handleUpload(req, uploadsDir, uploads.maxTotalBytes),
      },
      "/ws": (req, server) =>
        server.upgrade(req, { data: initialWsData() })
          ? undefined
          : new Response("websocket upgrade expected", { status: 400 }),
    },
    websocket: createWsHandler(uploadsDir),
    fetch: staticDir ? createStaticHandler(staticDir) : notFound,
  });
};
