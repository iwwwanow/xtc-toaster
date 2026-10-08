import { mkdir } from "node:fs/promises";
import { handleUpload } from "./upload";
import { createWsHandler, initialWsData } from "./ws";

export type ServerOptions = {
  port: number;
  uploadsDir: string;
};

export const createServer = async ({ port, uploadsDir }: ServerOptions) => {
  await mkdir(uploadsDir, { recursive: true });

  return Bun.serve({
    port,
    routes: {
      "/api/images": {
        POST: (req) => handleUpload(req, uploadsDir),
      },
      "/ws": (req, server) =>
        server.upgrade(req, { data: initialWsData() })
          ? undefined
          : new Response("websocket upgrade expected", { status: 400 }),
    },
    websocket: createWsHandler(uploadsDir),
    fetch: () => new Response("not found", { status: 404 }),
  });
};
