import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// one origin: relative /api and /ws, in dev proxied to the bun server (host:port, docker compose: server:3000)
const SERVER = process.env.SERVER_HOST ?? "localhost:3000";

export default defineConfig({
  plugins: [svelte()],
  server: {
    proxy: {
      "/api": `http://${SERVER}`,
      "/ws": { target: `ws://${SERVER}`, ws: true },
    },
  },
});
