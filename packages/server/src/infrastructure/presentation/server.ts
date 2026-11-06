import { mkdir } from "node:fs/promises";
import { findGif, removeExpiredAnimations } from "../repository/animations";
import { removeExpired, type UploadsLimits } from "../repository/uploads";
import { createStaticHandler } from "./static";
import { handleUpload } from "./upload";
import { createWsHandler, initialWsData } from "./ws";

export type ServerOptions = {
  port: number;
  hostname?: string;
  uploadsDir: string;
  uploads: UploadsLimits;
  // linked layers rows over one render; unset — RENDER_MAX_LAYERS_DEFAULT
  maxLayers?: number;
  // frames of one render-animation; unset — RENDER_MAX_FRAMES_DEFAULT
  maxFrames?: number;
  // the web build; without it (dev) the vite dev server serves the page
  staticDir?: string;
};

const CLEANUP_INTERVAL_MS = 3_600_000;

const notFound = () => new Response("not found", { status: 404 });

export const createServer = async ({
  port,
  hostname,
  uploadsDir,
  uploads,
  maxLayers,
  maxFrames,
  staticDir,
}: ServerOptions) => {
  await mkdir(uploadsDir, { recursive: true });

  const cleanup = () =>
    Promise.all([
      removeExpired(uploadsDir, uploads.ttlMs)
        .then((removed) => removed > 0 && console.log(`uploads: ${removed} expired removed`))
        .catch((error) => console.error("uploads cleanup failed", error)),
      removeExpiredAnimations(uploadsDir)
        .then((removed) => removed > 0 && console.log(`animations: ${removed} expired removed`))
        .catch((error) => console.error("animations cleanup failed", error)),
    ]);
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
      // a rendered gif, by the url of its animation-rendered message
      "/api/animations/:name": {
        GET: async (req) => {
          const gif = await findGif(uploadsDir, req.params.name);
          return gif ? new Response(gif, { headers: { "content-type": "image/gif" } }) : notFound();
        },
      },
      "/ws": (req, server) =>
        server.upgrade(req, { data: initialWsData() })
          ? undefined
          : new Response("websocket upgrade expected", { status: 400 }),
    },
    websocket: createWsHandler({ uploadsDir, maxLayers, maxFrames }),
    fetch: staticDir ? createStaticHandler(staticDir) : notFound,
  });
};