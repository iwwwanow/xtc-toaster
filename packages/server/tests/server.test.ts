// Integration: real Bun.serve on a random port, uploads into tests/output/uploads
// (gitignored, wiped every run).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { createCanvas, loadImage } from "canvas";
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
    { id: "nz", type: "hueNoise", data: { deviationCoefficient } },
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
  server = await createServer({
    port: 0,
    uploadsDir: UPLOADS_DIR,
    uploads: { ttlMs: 3_600_000, maxTotalBytes: 100 * 1024 * 1024 },
  });
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

  test("a node off the path is ignored", async () => {
    const bypass = { ...graph(imageId), edges: [{ id: "in-out", source: "in", target: "out" }] };
    send({ type: "render", requestId: 5, graph: bypass });
    expect(await nextMessage()).toMatchObject({ type: "rendered", requestId: 5 });
  });

  test("no path → render-error on the node that misses its link", async () => {
    const broken = { ...graph(imageId), edges: [{ id: "in-nz", source: "in", target: "nz" }] };
    send({ type: "render", requestId: 5, graph: broken });
    expect(await nextMessage()).toMatchObject({ type: "render-error", requestId: 5, nodeId: "out" });
  });
});

describe("ws render: composer", () => {
  // input fans out: one row straight, one through hue noise
  const composed = (imageId: string, extra: object[] = []) => ({
    version: TOAST_GRAPH_VERSION,
    nodes: [
      { id: "in", type: "input", data: { imageId } },
      { id: "nz", type: "hueNoise", data: { deviationCoefficient: 0.5 } },
      { id: "cmp", type: "composer", data: { layers: [{ id: "top", blendMode: "add" }, { id: "bottom", blendMode: "normal" }] } },
      { id: "out", type: "output", data: {} },
    ],
    edges: [
      { id: "in-nz", source: "in", target: "nz" },
      { id: "nz-cmp", source: "nz", target: "cmp", targetHandle: "top" },
      { id: "in-cmp", source: "in", target: "cmp", targetHandle: "bottom" },
      { id: "cmp-out", source: "cmp", target: "out" },
      ...extra,
    ],
  });

  test("renders a fan-out through a composer", async () => {
    send({ type: "render", requestId: 11, graph: composed(imageId) });
    const message = await nextMessage();
    if (message.type !== "rendered") throw new Error(`expected rendered, got ${JSON.stringify(message)}`);
    expect([message.width, message.height]).toEqual([250, 359]);
  });

  test("a link the web would refuse → render-error on the node", async () => {
    send({ type: "render", requestId: 12, graph: composed(imageId, [{ id: "nz-cmp-2", source: "nz", target: "cmp", targetHandle: "bottom" }]) });
    expect(await nextMessage()).toMatchObject({ type: "render-error", requestId: 12, nodeId: "cmp" });
  });
});

describe("ws render: hue mask", () => {
  const hueMask = (hue: number, tolerance: number) => ({
    version: TOAST_GRAPH_VERSION,
    nodes: [
      { id: "in", type: "input", data: { imageId } },
      { id: "hm", type: "hueMask", data: { hue, tolerance } },
      { id: "out", type: "output", data: {} },
    ],
    edges: [
      { id: "in-hm", source: "in", target: "hm" },
      { id: "hm-out", source: "hm", target: "out" },
    ],
  });

  const alphaOf = async (message: ServerMessage) => {
    if (message.type !== "rendered") throw new Error(`expected rendered, got ${JSON.stringify(message)}`);
    const png = await loadImage(Buffer.from(message.png, "base64"));
    const context = createCanvas(png.width, png.height).getContext("2d");
    context.drawImage(png, 0, 0);
    const { data } = context.getImageData(0, 0, png.width, png.height);
    return data.filter((_, i) => i % 4 === 3);
  };

  // poppies: red flowers on green — red is partly kept, the rest goes transparent
  test("red keeps the poppies, the rest goes transparent", async () => {
    send({ type: "render", requestId: 9, graph: hueMask(0, 30) });
    const alpha = await alphaOf(await nextMessage());
    expect(alpha.some((a) => a === 0)).toBe(true);
    expect(alpha.some((a) => a > 128)).toBe(true);
  });

  test("tolerance out of range → render-error on that node", async () => {
    send({ type: "render", requestId: 10, graph: hueMask(0, 200) });
    expect(await nextMessage()).toMatchObject({ type: "render-error", requestId: 10, nodeId: "hm" });
  });
});

describe("ws render: y-rotation", () => {
  const yRotation = (angle: number, focalLength: number) => ({
    version: TOAST_GRAPH_VERSION,
    nodes: [
      { id: "in", type: "input", data: { imageId } },
      { id: "yr", type: "yRotation", data: { angle, focalLength } },
      { id: "out", type: "output", data: {} },
    ],
    edges: [
      { id: "in-yr", source: "in", target: "yr" },
      { id: "yr-out", source: "yr", target: "out" },
    ],
  });

  // middle row alpha at x = 0, the middle and the right edge
  const renderRowAlpha = async (requestId: number, angle: number, focalLength: number) => {
    send({ type: "render", requestId, graph: yRotation(angle, focalLength) });
    const message = await nextMessage();
    if (message.type !== "rendered") throw new Error(`expected rendered, got ${JSON.stringify(message)}`);
    const png = await loadImage(Buffer.from(message.png, "base64"));
    const context = createCanvas(png.width, png.height).getContext("2d");
    context.drawImage(png, 0, 0);
    const row = Math.floor(png.height / 2);
    const alphaAt = (x: number) => context.getImageData(x, row, 1, 1).data[3];
    return [alphaAt(0), alphaAt(Math.floor(png.width / 2)), alphaAt(png.width - 1)];
  };

  // poppies is opaque, 250 × 359 (portrait): an edge sampling outside the source goes transparent.
  // focalLength is mm with 36 mm across the larger side (blender sensor fit Auto) — at 30° the
  // near edge goes transparent past ~467 px: 50 mm is 499 px across the height, 347 across the width
  test("long lens (300 mm) → near-flat: the plane narrows, both edges go transparent", async () => {
    expect(await renderRowAlpha(11, 30, 300)).toEqual([0, 255, 0]);
  });

  test("portrait: 50 mm spans the height → the near edge goes transparent too", async () => {
    expect(await renderRowAlpha(14, 30, 50)).toEqual([0, 255, 0]);
  });

  test("wide lens (35 mm) → the near edge fills the frame, the far edge goes transparent", async () => {
    expect(await renderRowAlpha(15, 30, 35)).toEqual([255, 255, 0]);
  });

  test("angle out of range → render-error on that node", async () => {
    send({ type: "render", requestId: 12, graph: yRotation(90, 50) });
    expect(await nextMessage()).toMatchObject({ type: "render-error", requestId: 12, nodeId: "yr" });
  });

  // mm, not px: 800 was a valid px focal length, as mm it's past the 300 mm bound
  test("focalLength out of range → render-error on that node", async () => {
    send({ type: "render", requestId: 13, graph: yRotation(30, 800) });
    expect(await nextMessage()).toMatchObject({ type: "render-error", requestId: 13, nodeId: "yr" });
  });
});

describe("ws render: single-layer nodes", () => {
  const single = (type: string, data: Record<string, unknown>) => ({
    version: TOAST_GRAPH_VERSION,
    nodes: [
      { id: "in", type: "input", data: { imageId } },
      { id: "n", type, data },
      { id: "out", type: "output", data: {} },
    ],
    edges: [
      { id: "in-n", source: "in", target: "n" },
      { id: "n-out", source: "n", target: "out" },
    ],
  });

  let requestId = 100;
  const render = async (type: string, data: Record<string, unknown>) => {
    send({ type: "render", requestId: ++requestId, graph: single(type, data) });
    const message = await nextMessage();
    if (message.type !== "rendered") throw new Error(`expected rendered, got ${JSON.stringify(message)}`);
    const png = await loadImage(Buffer.from(message.png, "base64"));
    const context = createCanvas(png.width, png.height).getContext("2d");
    context.drawImage(png, 0, 0);
    const { data: pixels, width, height } = context.getImageData(0, 0, png.width, png.height);
    const at = (x: number, y: number) => [...pixels.slice((y * width + x) * 4, (y * width + x) * 4 + 4)];
    return { pixels, width, height, at };
  };
  const alphas = (pixels: Uint8ClampedArray) => pixels.filter((_, i) => i % 4 === 3);

  // mean |difference| of horizontally adjacent red values — a blur makes it smaller
  const roughness = ({ pixels, width, height }: Awaited<ReturnType<typeof render>>) => {
    let sum = 0;
    for (let y = 0; y < height; y++)
      for (let x = 1; x < width; x++) sum += Math.abs(pixels[(y * width + x) * 4]! - pixels[(y * width + x - 1) * 4]!);
    return sum / (height * (width - 1));
  };

  test("blur: radius 8 is smoother than radius 0, the picture stays opaque", async () => {
    const sharp = await render("blur", { radius: 0 });
    const blurred = await render("blur", { radius: 8 });
    expect(roughness(blurred)).toBeLessThan(roughness(sharp) / 2);
    expect(alphas(blurred.pixels).every((a) => a === 255)).toBe(true);
  });

  // poppies: saturated red flowers and greens, a pale sky — the masks keep part, drop part
  test.each([
    ["saturationMask", { saturation: 100, tolerance: 30 }],
    ["valueMask", { value: 100, tolerance: 30 }],
  ])("%s keeps part of the picture, the rest goes transparent", async (type, data) => {
    const alpha = alphas((await render(type, data)).pixels);
    expect(alpha.some((a) => a === 0)).toBe(true);
    expect(alpha.some((a) => a > 128)).toBe(true);
  });

  test.each([
    ["red", [255, 0, 0]],
    ["green", [0, 255, 0]],
    ["blue", [0, 0, 255]],
  ])("isolateChannel %s: every pixel turns the channel color, its value goes to alpha", async (channel, rgb) => {
    const { pixels, at } = await render("isolateChannel", { channel });
    expect(at(0, 0).slice(0, 3)).toEqual(rgb);
    expect(new Set(alphas(pixels)).size).toBeGreaterThan(1);
  });

  // poppies is 250 × 359: 50 % of the width moves the picture 125 px right
  test("translate x 50 %: the left half goes transparent, the right half stays", async () => {
    const { at, height } = await render("translate", { x: 50, y: 0 });
    const row = Math.floor(height / 2);
    expect([at(0, row)[3], at(124, row)[3], at(125, row)[3], at(249, row)[3]]).toEqual([0, 0, 255, 255]);
  });

  test("translate y -50 %: the picture moves up, the bottom goes transparent", async () => {
    const { at } = await render("translate", { x: 0, y: -50 });
    expect([at(125, 0)[3], at(125, 358)[3]]).toEqual([255, 0]);
  });

  test.each([
    ["rotate 45°", "rotate", { angle: 45 }],
    ["scale 0.5", "scale", { x: 0.5, y: 0.5 }],
  ])("%s around the center: the corners go transparent, the center stays", async (_, type, data) => {
    const { at, width, height } = await render(type, data);
    expect([at(0, 0)[3], at(width - 1, height - 1)[3], at(Math.floor(width / 2), Math.floor(height / 2))[3]]).toEqual([
      0, 0, 255,
    ]);
  });

  test("scale 2: the center fills the frame, no transparent corners", async () => {
    const { pixels } = await render("scale", { x: 2, y: 2 });
    expect(alphas(pixels).every((a) => a === 255)).toBe(true);
  });

  // skew x leans the verticals: the top row shifts against the bottom one — opaque spans differ
  test("skew x 30°: the top and bottom rows shift opposite ways, corners go transparent", async () => {
    const { at, width, height } = await render("skew", { x: 30, y: 0 });
    const opaqueFrom = (y: number) => [...Array(width).keys()].find((x) => at(x, y)[3] === 255);
    expect(opaqueFrom(0)).not.toBe(opaqueFrom(height - 1));
    expect(at(Math.floor(width / 2), Math.floor(height / 2))[3]).toBe(255);
  });

  const corners = {
    topLeftX: 0, topLeftY: 0, topRightX: 100, topRightY: 0,
    bottomRightX: 100, bottomRightY: 100, bottomLeftX: 0, bottomLeftY: 100,
  };

  test("perspective with the corners untouched — the picture as is", async () => {
    const plain = await render("blur", { radius: 0 });
    const same = await render("perspective", corners);
    expect([...same.pixels]).toEqual([...plain.pixels]);
  });

  test("perspective keystone (the top 25 % narrower each side): the top corners go transparent, the bottom stays", async () => {
    const { at, width, height } = await render("perspective", { ...corners, topLeftX: 25, topRightX: 75 });
    expect([at(0, 0)[3], at(width - 1, 0)[3], at(0, height - 1)[3], at(width - 1, height - 1)[3]]).toEqual([0, 0, 255, 255]);
  });

  test("homography identity — the picture as is", async () => {
    const plain = await render("blur", { radius: 0 });
    const same = await render("homography", { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1] });
    expect([...same.pixels]).toEqual([...plain.pixels]);
  });

  // translation is the last row ([x, y, 1] · H): 125 px right — like translate x 50 %
  test("homography with a translation row moves the picture", async () => {
    const { at, height } = await render("homography", { matrix: [1, 0, 0, 0, 1, 0, 125, 0, 1] });
    const row = Math.floor(height / 2);
    expect([at(0, row)[3], at(249, row)[3]]).toEqual([0, 255]);
  });

  test("fill: every pixel is the color, opaque", async () => {
    const { pixels } = await render("fill", { color: "#a4a4ff" });
    const colors = new Set<string>();
    for (let i = 0; i < pixels.length; i += 4) colors.add(pixels.slice(i, i + 4).join(","));
    expect([...colors]).toEqual(["164,164,255,255"]);
  });

  test("tint after a mask: the color everywhere, the mask's alpha kept", async () => {
    const graph = {
      version: TOAST_GRAPH_VERSION,
      nodes: [
        { id: "in", type: "input", data: { imageId } },
        { id: "hm", type: "hueMask", data: { hue: 0, tolerance: 30 } },
        { id: "t", type: "tint", data: { color: "#00ff00" } },
        { id: "out", type: "output", data: {} },
      ],
      edges: [
        { id: "a", source: "in", target: "hm" },
        { id: "b", source: "hm", target: "t" },
        { id: "c", source: "t", target: "out" },
      ],
    };
    send({ type: "render", requestId: ++requestId, graph });
    const message = await nextMessage();
    if (message.type !== "rendered") throw new Error(JSON.stringify(message));
    const png = await loadImage(Buffer.from(message.png, "base64"));
    const context = createCanvas(png.width, png.height).getContext("2d");
    context.drawImage(png, 0, 0);
    const { data } = context.getImageData(0, 0, png.width, png.height);
    const opaque = [...Array(data.length / 4).keys()].map((i) => [...data.slice(i * 4, i * 4 + 4)]).filter((p) => p[3] === 255);
    expect(opaque.length).toBeGreaterThan(0);
    expect(opaque.every(([r, g, b]) => r === 0 && g === 255 && b === 0)).toBe(true);
    expect(alphas(data).some((a) => a === 0)).toBe(true);
  });

  // 255 · 0.5 = 127.5 — Uint8ClampedArray rounds it to 128
  test("opacity 0.5 halves the alpha", async () => {
    const alpha = new Set(alphas((await render("opacity", { opacity: 0.5 })).pixels));
    expect([...alpha]).toEqual([128]);
  });

  test("two opacity nodes multiply: 0.5 · 0.5 → a quarter", async () => {
    const graph = {
      version: TOAST_GRAPH_VERSION,
      nodes: [
        { id: "in", type: "input", data: { imageId } },
        { id: "o1", type: "opacity", data: { opacity: 0.5 } },
        { id: "o2", type: "opacity", data: { opacity: 0.5 } },
        { id: "out", type: "output", data: {} },
      ],
      edges: [
        { id: "a", source: "in", target: "o1" },
        { id: "b", source: "o1", target: "o2" },
        { id: "c", source: "o2", target: "out" },
      ],
    };
    send({ type: "render", requestId: ++requestId, graph });
    const message = await nextMessage();
    if (message.type !== "rendered") throw new Error(JSON.stringify(message));
    const png = await loadImage(Buffer.from(message.png, "base64"));
    const context = createCanvas(png.width, png.height).getContext("2d");
    context.drawImage(png, 0, 0);
    expect(new Set(alphas(context.getImageData(0, 0, png.width, png.height).data))).toEqual(new Set([64]));
  });

  test.each([
    ["a singular homography", "homography", { matrix: [0, 0, 0, 0, 0, 0, 0, 0, 1] }],
    ["a perspective with every corner in one point", "perspective", Object.fromEntries(Object.keys(corners).map((k) => [k, 50]))],
  ])("%s → render-error on that node, not a crash", async (_, type, data) => {
    send({ type: "render", requestId: ++requestId, graph: single(type, data) });
    expect(await nextMessage()).toMatchObject({ type: "render-error", requestId, nodeId: "n" });
  });

  test.each([
    ["blur", { radius: 50 }],
    ["isolateChannel", { channel: "cyan" }],
    ["scale", { x: 0, y: 1 }],
    ["fill", { color: "red" }],
    ["homography", { matrix: [1, 0, 0] }],
  ])("%s out of range → render-error on that node", async (type, data) => {
    send({ type: "render", requestId: ++requestId, graph: single(type, data) });
    expect(await nextMessage()).toMatchObject({ type: "render-error", requestId, nodeId: "n" });
  });
});

describe("ws latest-wins", () => {
  // a render must not block the event loop: messages that come in during it reach the queue,
  // so after the running one only the newest renders
  test("a burst → the first and the latest are rendered, the ones between are dropped", async () => {
    for (const requestId of [6, 7, 8]) send({ type: "render", requestId, graph: graph(imageId) });
    expect((await nextMessage()).requestId).toBe(6);
    expect((await nextMessage()).requestId).toBe(8);
  });
});
