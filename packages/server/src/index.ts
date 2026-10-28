import { resolve } from "node:path";
import { RENDER_MAX_LAYERS_DEFAULT } from "./run-graph";
import { createServer } from "./server";

const env = process.env;

// a typo in the env must not turn into NaN — NaN quota would evict every upload
const positive = (name: string, fallback: number) => {
  const value = Number(env[name] || fallback); // empty — unset (compose passes ${VAR:-})
  if (!(value > 0)) throw new Error(`${name} must be a positive number, got "${env[name]}"`);
  return value;
};

const server = await createServer({
  port: Number(env.PORT ?? 3000),
  // prod: 127.0.0.1 — network_mode: host, outside only through caddy
  hostname: env.HOST ?? "0.0.0.0",
  uploadsDir: env.UPLOADS_DIR ?? resolve(import.meta.dirname, "../../../assets/uploads"),
  uploads: {
    ttlMs: positive("UPLOADS_TTL_HOURS", 24) * 3_600_000,
    maxTotalBytes: positive("UPLOADS_MAX_TOTAL_MB", 512) * 1024 * 1024,
  },
  // per render, over all composers; the prod value comes from the memory measurement (sprint 4)
  maxLayers: positive("RENDER_MAX_LAYERS", RENDER_MAX_LAYERS_DEFAULT),
  staticDir: env.STATIC_DIR || undefined,
});

console.log(`server listening on ${server.url}`);
