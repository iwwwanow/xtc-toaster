import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, type Plugin } from "vite";

// one origin: relative /api and /ws, in dev proxied to the bun server (host:port, docker compose: server:3000)
const SERVER = process.env.SERVER_HOST ?? "localhost:3000";

// debug: DEBUG_IMAGE=<path from the repo root> → the page uploads it on open (dev server only)
const DEBUG_IMAGE = process.env.DEBUG_IMAGE || null;
const DEBUG_IMAGE_URL = "/debug-image";

const debugImage = (path: string | null): Plugin => ({
  name: "debug-image",
  apply: "serve",
  config: () => ({ define: { "import.meta.env.DEBUG_IMAGE_URL": JSON.stringify(path && DEBUG_IMAGE_URL) } }),
  configureServer(server) {
    if (path === null) return;
    const file = resolve(import.meta.dirname, "../..", path);
    server.middlewares.use(DEBUG_IMAGE_URL, async (_req, res) => res.end(await readFile(file)));
  },
});

export default defineConfig({
  plugins: [svelte(), debugImage(DEBUG_IMAGE)],
  server: {
    proxy: {
      "/api": `http://${SERVER}`,
      "/ws": { target: `ws://${SERVER}`, ws: true },
    },
  },
});
