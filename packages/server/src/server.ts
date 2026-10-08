import { mkdir } from "node:fs/promises";
import { handleUpload } from "./upload";

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
    },
    fetch: () => new Response("not found", { status: 404 }),
  });
};
