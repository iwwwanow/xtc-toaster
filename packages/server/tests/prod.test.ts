// Integration, the prod setup: the server also serves the web build and keeps uploads under
// a quota. Fake build and uploads in tests/output/prod (gitignored, wiped every run).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { UploadResponseSchema } from "@xtc-toaster/contract";
import { createServer } from "../src/server";

const FIXTURE_PATH = resolve(import.meta.dirname, "../../lib/tests/fixtures/poppies.jpg");
const OUT_DIR = resolve(import.meta.dirname, "output/prod");
const STATIC_DIR = resolve(OUT_DIR, "dist");
const UPLOADS_DIR = resolve(OUT_DIR, "uploads");

let server: Awaited<ReturnType<typeof createServer>>;

const get = (path: string) => fetch(new URL(path, server.url));

const upload = () => {
  const form = new FormData();
  form.append("file", Bun.file(FIXTURE_PATH), "poppies.jpg");
  return fetch(new URL("/api/images", server.url), { method: "POST", body: form });
};

beforeAll(async () => {
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(resolve(STATIC_DIR, "assets"), { recursive: true });
  await writeFile(resolve(STATIC_DIR, "index.html"), "<!doctype html><title>xtc-toaster</title>");
  await writeFile(resolve(STATIC_DIR, "assets/index-abc123.js"), "console.log(1)");
  await writeFile(resolve(OUT_DIR, "secret.txt"), "outside the build");

  const fixtureBytes = Bun.file(FIXTURE_PATH).size;
  server = await createServer({
    port: 0,
    uploadsDir: UPLOADS_DIR,
    // room for two pictures — the third evicts the first
    uploads: { ttlMs: 3_600_000, maxTotalBytes: fixtureBytes * 2 + 1 },
    staticDir: STATIC_DIR,
  });
});

afterAll(() => server.stop(true));

describe("healthz", () => {
  test("200", async () => {
    const response = await get("/healthz");
    expect(response.status).toBe(200);
  });
});

describe("static", () => {
  test("/ is index.html, revalidated", async () => {
    const response = await get("/");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<title>xtc-toaster</title>");
    expect(response.headers.get("cache-control")).toBe("no-cache");
  });

  test("hashed assets are immutable", async () => {
    const response = await get("/assets/index-abc123.js");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("immutable");
  });

  test("a missing file → 404", async () => {
    expect((await get("/nope.js")).status).toBe(404);
  });

  test("no way out of the build dir", async () => {
    expect((await get("/%2e%2e/secret.txt")).status).toBe(404);
    expect((await get("/..%2fsecret.txt")).status).toBe(404);
  });
});

describe("uploads quota", () => {
  test("over the quota the oldest upload goes", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const response = await upload();
      expect(response.status).toBe(201);
      ids.push(UploadResponseSchema.parse(await response.json()).imageId);
      // mtime resolution — keep the order unambiguous
      await Bun.sleep(20);
    }
    expect((await readdir(UPLOADS_DIR)).sort()).toEqual(ids.slice(1).sort());
  });
});
