// Integration: real Bun.serve on a random port, uploads into tests/output/uploads
// (gitignored, wiped every run).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { loadImage } from "canvas";
import {
  ServerMessageSchema,
  TOAST_GRAPH_VERSION,
  UploadResponseSchema,
  type ServerMessage,
} from "@xtc-toaster/contract";
import { createServer } from "../src/server";

const FIXTURE_PATH = resolve(import.meta.dirname, "../../lib/tests/fixtures/poppies.jpg");
const UPLOADS_DIR = resolve(import.meta.dirname, "output/uploads");
const MISSING_IMAGE_ID = "3f6c1a52-8e0b-4c1d-9a7e-2b5f4d6e8a90";

let server: Awaited<ReturnType<typeof createServer>>;
let socket: WebSocket;
const inbox: ServerMessage[] = [];
const waiters: Array<() => void> = [];

const nextMessage = async (): Promise<ServerMessage> => {
  while (inbox.length === 0) await new Promise<void>((resolve) => waiters.push(resolve));
  return inbox.shift()!;
};

const send = (message: unknown) => socket.send(typeof message === "string" ? message : JSON.stringify(message));

const upload = (file: Blob, name: string) => {
  const form = new FormData();
  form.append("file", file, name);
  return fetch(new URL("/api/images", server.url), { method: "POST", body: form });
};

const graph = (imageId: string | null, deviationCoefficient = 0.5) => ({
  version: TOAST_GRAPH_VERSION,
  nodes: [
    { id: "in", type: "input", data: { imageId } },
    { id: "nz", type: "noize", data: { deviationCoefficient } },
    { id: "out", type: "output", data: {} },
  ],
  edges: [
    { id: "in-nz", source: "in", target: "nz" },
    { id: "nz-out", source: "nz", target: "out" },
  ],
});

let imageId: string;

beforeAll(async () => {
  await rm(UPLOADS_DIR, { recursive: true, force: true });
  server = await createServer({ port: 0, uploadsDir: UPLOADS_DIR });
  socket = new WebSocket(new URL("/ws", server.url.href.replace(/^http/, "ws")));
  socket.addEventListener("message", ({ data }) => {
    inbox.push(ServerMessageSchema.parse(JSON.parse(String(data))));
    waiters.splice(0).forEach((wake) => wake());
  });
  await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
});

afterAll(() => {
  socket.close();
  server.stop(true);
});

describe("POST /api/images", () => {
  test("stores a jpeg and returns its id and size", async () => {
    const response = await upload(Bun.file(FIXTURE_PATH), "poppies.jpg");
    expect(response.status).toBe(201);
    const body = UploadResponseSchema.parse(await response.json());
    expect([body.width, body.height]).toEqual([250, 359]);
    expect(await Bun.file(resolve(UPLOADS_DIR, body.imageId)).exists()).toBe(true);
    imageId = body.imageId;
  });

  test("rejects a non-image as unsupported-format", async () => {
    const response = await upload(new Blob(["not an image"]), "notes.txt");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "unsupported-format" });
  });
});

describe("ws render", () => {
  test("renders the uploaded image at its stored size", async () => {
    send({ type: "render", requestId: 1, graph: graph(imageId) });
    const message = await nextMessage();
    if (message.type !== "rendered") throw new Error(`expected rendered, got ${JSON.stringify(message)}`);
    expect(message).toMatchObject({ requestId: 1, width: 250, height: 359 });

    const png = await loadImage(Buffer.from(message.png, "base64"));
    expect([png.width, png.height]).toEqual([250, 359]);
  });

  test("invalid json → render-error with requestId: null", async () => {
    send("{oops");
    expect(await nextMessage()).toMatchObject({ type: "render-error", requestId: null });
  });

  test("foreign version → reload the page", async () => {
    send({ type: "render", requestId: 2, graph: { ...graph(imageId), version: 2 } });
    expect(await nextMessage()).toEqual({ type: "render-error", requestId: 2, message: "reload the page" });
  });

  test("param out of range → render-error on that node", async () => {
    send({ type: "render", requestId: 3, graph: graph(imageId, 2) });
    expect(await nextMessage()).toMatchObject({ type: "render-error", requestId: 3, nodeId: "nz" });
  });

  test.each([
    ["unknown", MISSING_IMAGE_ID],
    ["null", null],
  ])("%s imageId → render-error on the input node", async (_, id) => {
    send({ type: "render", requestId: 4, graph: graph(id) });
    expect(await nextMessage()).toMatchObject({ type: "render-error", requestId: 4, nodeId: "in" });
  });

  test("not a chain → render-error", async () => {
    const broken = { ...graph(imageId), edges: [{ id: "in-out", source: "in", target: "out" }] };
    send({ type: "render", requestId: 5, graph: broken });
    expect(await nextMessage()).toMatchObject({ type: "render-error", requestId: 5 });
  });
});
