import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { TOAST_GRAPH_VERSION, type BlendMode, type GraphEdge, type GraphNode } from "@xtc-toaster/contract";
import { GraphError, RENDER_MAX_LAYERS_DEFAULT, focalLengthPx, percentPx, perspectiveCorners, runGraph } from "./run-graph";

// runGraph reads the picture from an uploads dir: the fixture under a uuid name, like an upload
const FIXTURE_PATH = resolve(import.meta.dirname, "../../lib/tests/fixtures/poppies.jpg");
const UPLOADS_DIR = resolve(import.meta.dirname, "../tests/output/run-graph");
const IMAGE_ID = "3f6c1a52-8e0b-4c1d-9a7e-2b5f4d6e8a90";

beforeAll(async () => {
  await mkdir(UPLOADS_DIR, { recursive: true });
  await copyFile(FIXTURE_PATH, resolve(UPLOADS_DIR, IMAGE_ID));
});
afterAll(() => rm(UPLOADS_DIR, { recursive: true, force: true }));

const input: GraphNode = { id: "in", type: "input", data: { imageId: IMAGE_ID } };
const hueNoise: GraphNode = { id: "nz", type: "hueNoise", data: { deviationCoefficient: 0.5 } };
const output: GraphNode = { id: "out", type: "output", data: {} };
const fill = (id: string, color = "#ff0000"): GraphNode => ({ id, type: "fill", data: { color } });
const tint = (id: string, color = "#0000ff"): GraphNode => ({ id, type: "tint", data: { color } });
const opacity = (id: string, value: number): GraphNode => ({ id, type: "opacity", data: { opacity: value } });
// rows top first, ids = handle ids
const composer = (id: string, ...blendModes: BlendMode[]): GraphNode => ({
  id,
  type: "composer",
  data: { layers: blendModes.map((blendMode, row) => ({ id: `r${row}`, blendMode })) },
});

const edge = (source: string, target: string, targetHandle?: string): GraphEdge => ({
  id: `${source}-${target}${targetHandle ? `-${targetHandle}` : ""}`,
  source,
  target,
  ...(targetHandle && { targetHandle }),
});
const graph = (nodes: GraphNode[], edges: GraphEdge[]) => ({ version: TOAST_GRAPH_VERSION, nodes, edges });

const render = (nodes: GraphNode[], edges: GraphEdge[], maxLayers?: number) =>
  runGraph(graph(nodes, edges), UPLOADS_DIR, maxLayers);
const hashOf = async (nodes: GraphNode[], edges: GraphEdge[], maxLayers?: number) =>
  Bun.hash((await render(nodes, edges, maxLayers)).data);

const nz2: GraphNode = { ...hueNoise, id: "nz2" };
const plain = () => hashOf([input, output], [edge("in", "out")]);

// top row `top`, bottom row `bottom` — each a chain already linked from the input
const twoRows = (top: string, bottom: string, ...blendModes: BlendMode[]) => ({
  composer: composer("cmp", ...(blendModes.length ? blendModes : (["normal", "normal"] as BlendMode[]))),
  edges: [edge(top, "cmp", "r0"), edge(bottom, "cmp", "r1"), edge("cmp", "out")],
});

describe("runGraph: structure", () => {
  test.each([
    ["an unlinked node", [input, hueNoise, output], [edge("in", "out")]],
    ["a dead-end fork", [input, hueNoise, output], [edge("in", "out"), edge("in", "nz")]],
    ["an unlinked composer", [input, composer("cmp", "normal"), output], [edge("in", "out")]],
  ])("ignores %s", async (_, nodes, edges) => {
    expect(await hashOf(nodes, edges)).toBe(await plain());
  });

  test.each([
    ["output not linked", [input, hueNoise, output], [edge("in", "nz")], "out"],
    ["a chain not reaching the input", [input, hueNoise, output], [edge("nz", "out")], "nz"],
    [
      "a row chain not reaching the input",
      [input, hueNoise, composer("cmp", "normal", "normal"), output],
      [edge("in", "cmp", "r1"), edge("nz", "cmp", "r0"), edge("cmp", "out")],
      "nz",
    ],
    ["a composer without a linked row", [input, composer("cmp", "normal"), output], [edge("cmp", "out")], "cmp"],
    // validateGraph — the same rules the web applies when a link is drawn
    ["two links into one node", [input, hueNoise, output], [edge("in", "nz"), edge("nz", "out"), edge("in", "out")], "out"],
    [
      "two links into one row",
      [input, hueNoise, composer("cmp", "normal"), output],
      [edge("in", "nz"), edge("in", "cmp", "r0"), edge("nz", "cmp", "r0"), edge("cmp", "out")],
      "cmp",
    ],
    ["a cycle", [input, hueNoise, nz2, output], [edge("nz", "nz2"), edge("nz2", "nz"), edge("nz2", "out")], "nz"],
    ["a link into the input", [input, hueNoise, output], [edge("in", "out"), edge("nz", "in")], "in"],
  ])("rejects %s, pointing at the node", async (_, nodes, edges, nodeId) => {
    await expect(render(nodes, edges)).rejects.toMatchObject({ nodeId });
  });

  test.each([
    ["two inputs", graph([input, { ...input, id: "in2" }, output], [edge("in", "out")])],
    ["duplicate ids", graph([input, { ...hueNoise, id: "in" }, output], [edge("in", "out")])],
  ])("rejects %s", async (_, g) => {
    await expect(runGraph(g, UPLOADS_DIR)).rejects.toBeInstanceOf(GraphError);
  });
});

describe("runGraph: composer", () => {
  test("fan-out: chains don't share a buffer — fill in one leaves the other untouched", async () => {
    // the filled row on top at opacity 0, or under an opaque row — either way only the picture shows
    const hidden = twoRows("op", "in");
    expect(
      await hashOf([input, fill("f"), opacity("op", 0), hidden.composer, output], [edge("in", "f"), edge("f", "op"), ...hidden.edges]),
    ).toBe(await plain());
    const under = twoRows("in", "f");
    expect(await hashOf([input, fill("f"), under.composer, output], [edge("in", "f"), ...under.edges])).toBe(await plain());
  });

  test("row order is layer order: swapping rows changes the picture", async () => {
    const redOnTop = twoRows("f", "in");
    const redUnder = twoRows("in", "f");
    const nodes = [input, fill("f"), redOnTop.composer, output];
    const onTop = await hashOf(nodes, [edge("in", "f"), ...redOnTop.edges]);
    const under = await hashOf(nodes, [edge("in", "f"), ...redUnder.edges]);
    expect(onTop).not.toBe(under);
    expect(under).toBe(await plain());
  });

  test("every blend mode renders, each its own picture", async () => {
    const hashes = await Promise.all(
      (["normal", "add", "lch-hue"] as const).map((mode) => {
        const { composer: cmp, edges } = twoRows("t", "in", mode, "normal");
        return hashOf([input, tint("t"), cmp, output], [edge("in", "t"), ...edges]);
      }),
    );
    expect(new Set(hashes).size).toBe(3);
  });

  test("the chain's opacity is baked into its layer", async () => {
    const { composer: cmp, edges } = twoRows("op", "in");
    const [{ data }, { data: source }] = await Promise.all([
      render([input, fill("f", "#ffffff"), opacity("op", 0.5), cmp, output], [edge("in", "f"), edge("f", "op"), ...edges]),
      render([input, output], [edge("in", "out")]),
    ]);
    // white at half over the picture: halfway between the two
    for (const i of [0, 1, 2, 4000, 4001]) expect(Math.abs(data[i]! - (source[i]! + 255) / 2)).toBeLessThanOrEqual(1);
    expect(data[3]).toBe(255);
  });

  test("an unlinked row is skipped", async () => {
    const nodes = [input, composer("cmp", "add", "normal", "normal"), output];
    expect(await hashOf(nodes, [edge("in", "cmp", "r1"), edge("cmp", "out")])).toBe(await plain());
  });

  test("one node into both rows of a composer", async () => {
    const nodes = [input, composer("cmp", "normal", "normal"), output];
    expect(await hashOf(nodes, [edge("in", "cmp", "r0"), edge("in", "cmp", "r1"), edge("cmp", "out")])).toBe(await plain());
  });

  test("composer into composer", async () => {
    const nodes = [input, fill("f"), composer("inner", "normal", "normal"), composer("outer", "normal", "normal"), output];
    const edges = [
      edge("in", "f"),
      edge("in", "inner", "r0"),
      edge("f", "inner", "r1"),
      edge("inner", "outer", "r0"),
      edge("f", "outer", "r1"),
      edge("outer", "out"),
    ];
    expect(await hashOf(nodes, edges)).toBe(await plain());
  });
});

describe("runGraph: layer cap", () => {
  const rows = (count: number) => ({
    nodes: [input, composer("cmp", ...Array<BlendMode>(count).fill("normal")), output],
    edges: [...Array.from({ length: count }, (_, row) => edge("in", "cmp", `r${row}`)), edge("cmp", "out")],
  });

  test(`${RENDER_MAX_LAYERS_DEFAULT} rows by default pass, one more doesn't`, async () => {
    const atCap = rows(RENDER_MAX_LAYERS_DEFAULT);
    expect(await hashOf(atCap.nodes, atCap.edges)).toBe(await plain());
    const over = rows(RENDER_MAX_LAYERS_DEFAULT + 1);
    await expect(render(over.nodes, over.edges)).rejects.toMatchObject({ nodeId: "cmp" });
  });

  test("the cap comes from the caller", async () => {
    const { nodes, edges } = rows(3);
    await expect(render(nodes, edges, 2)).rejects.toMatchObject({ nodeId: "cmp" });
  });

  test("counts over all composers — nesting doesn't bypass it", async () => {
    const nodes = [input, composer("inner", "normal", "normal"), composer("outer", "normal", "normal"), output];
    const edges = [
      edge("in", "inner", "r0"),
      edge("in", "inner", "r1"),
      edge("inner", "outer", "r0"),
      edge("in", "outer", "r1"),
      edge("outer", "out"),
    ];
    await expect(render(nodes, edges, 3)).rejects.toMatchObject({ nodeId: "inner" });
    expect(await hashOf(nodes, edges, 4)).toBe(await plain());
  });
});

describe("focalLengthPx", () => {
  test.each([
    ["landscape — across the width", { width: 360, height: 240 }],
    ["portrait — across the height", { width: 240, height: 360 }],
    ["square", { width: 360, height: 360 }],
  ])("36 mm spans the larger side: %s", (_, dimensions) => {
    expect(focalLengthPx(36, dimensions)).toBe(360);
    expect(focalLengthPx(50, dimensions)).toBe(500);
  });
});

describe("percentPx", () => {
  test.each([
    [50, 250, 125],
    [-100, 359, -359],
    [0, 250, 0],
  ])("%p %% of %p px → %p px", (percent, size, px) => {
    expect(percentPx(percent, size)).toBe(px);
  });
});

describe("perspectiveCorners", () => {
  const untouched = {
    topLeftX: 0, topLeftY: 0, topRightX: 100, topRightY: 0,
    bottomRightX: 100, bottomRightY: 100, bottomLeftX: 0, bottomLeftY: 100,
  };

  test("0 / 100 % land on the first / last pixel — the source corners, the identity", () => {
    expect(perspectiveCorners(untouched, { width: 250, height: 359 })).toEqual([
      { x: 0, y: 0 }, { x: 249, y: 0 }, { x: 249, y: 358 }, { x: 0, y: 358 },
    ]);
  });

  test("percent of the size, past the frame too", () => {
    const [topLeft] = perspectiveCorners({ ...untouched, topLeftX: -50, topLeftY: 50 }, { width: 101, height: 201 });
    expect(topLeft).toEqual({ x: -50, y: 100 });
  });
});
