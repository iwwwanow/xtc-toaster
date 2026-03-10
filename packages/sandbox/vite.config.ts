import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "path";

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      "@xtc-toaster/core": resolve(__dirname, "../core/lib"),
    },
  },
  build: {
    outDir: "dist",
  },
});
