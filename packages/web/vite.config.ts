import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, type Plugin } from "vite";
import { favicon } from "./favicon/favicon";

// one origin: relative /api and /ws, in dev proxied to the bun server (host:port, docker compose: server:3000)
const SERVER = process.env.SERVER_HOST ?? "localhost:3000";

// debug: DEBUG_IMAGE=<path from the repo root> → the page uploads it on open (dev server only)
const DEBUG_IMAGE = process.env.DEBUG_IMAGE || null;
const DEBUG_IMAGE_URL = "/debug-image";

// debug: ?toast=<name> → the page imports tests/toasts/<name>.json on open (dev server only) —
// test graphs without building them by hand
const TOASTS_DIR = resolve(import.meta.dirname, "../../tests/toasts");
const DEBUG_TOAST_URL = "/debug-toast";

// the release version, shown in the ui: the docker job passes the semantic-release tag (Dockerfile ARG); anything else — "dev"
const APP_VERSION = process.env.APP_VERSION || "dev";

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

const debugToasts = (): Plugin => ({
  name: "debug-toasts",
  apply: "serve",
  config: () => ({ define: { "import.meta.env.DEBUG_TOAST_URL": JSON.stringify(DEBUG_TOAST_URL) } }),
  configureServer(server) {
    server.middlewares.use(DEBUG_TOAST_URL, async (req, res) => {
      const name = req.url?.slice(1) ?? "";
      const file = /^[\w-]+$/.test(name) ? await readFile(resolve(TOASTS_DIR, `${name}.json`)).catch(() => null) : null;
      if (file) return res.end(file);
      res.statusCode = 404;
      res.end();
    });
  },
});

export default defineConfig({
  define: { "import.meta.env.APP_VERSION": JSON.stringify(APP_VERSION) },
  plugins: [svelte(), debugImage(DEBUG_IMAGE), debugToasts(), favicon(resolve(import.meta.dirname, "favicon/favicon.svg"))],
  server: {
    proxy: {
      "/api": `http://${SERVER}`,
      "/ws": { target: `ws://${SERVER}`, ws: true },
    },
  },
});
