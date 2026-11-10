import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { TOAST_GRAPH_VERSION, graphAtFrame, type BlendMode, type GraphEdge, type GraphNode } from "@xtc-toaster/contract";
import { imageFileToRawData } from "@xtc-toaster/lib";
import { GraphError, RENDER_MAX_LAYERS_DEFAULT, focalLengthPx, percentPx, cornersQuad, runGraph } from "./run-graph";

const FIXTURE_PATH = resolve(import.meta.dirname, "../../../lib/tests/fixtures/poppies.jpg");
const IMAGE_ID = "3f6c1a52-8e0b-4c1d-9a7e-2b5f4d6e8a90";
const loadImage = () => imageFileToRawData(FIXTURE_PATH);

const input: GraphNode = { id: "in", type: "input", data: { imageId: IMAGE_ID } };
const colorNoise: GraphNode = { id: "nz", type: "colorNoise", data: { deviationCoefficient: 0.5 } };
const output: GraphNode = { id: "out", type: "output", data: {} };
const fill = (id: string, color = "#ff0000"): GraphNode => ({ id, type: "fill", data: { color } });
const tint = (id: string, color = "#0000ff"): GraphNode => ({ id, type: "tint", data: { color } });
const opacity = (id: string, value: number): GraphNode => ({ id, type: "opacity", data: { opacity: value } });
// rows top first, ids = handle ids
const layersNode = (id: string, ...blendModes: BlendMode[]): GraphNode => ({
  id,
  type: "layers",
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
  runGraph(graph(nodes, edges), loadImage, maxLayers);
const hashOf = async (nodes: GraphNode[], edges: GraphEdge[], maxLayers?: number) =>
  Bun.hash((await render(nodes, edges, maxLayers)).data);

const nz2: GraphNode = { ...colorNoise, id: "nz2" };
const plain = () => hashOf([input, output], [edge("in", "out")]);

// top row `top`, bottom row `bottom` — each a chain already linked from the input
const twoRows = (top: string, bottom: string, ...blendModes: BlendMode[]) => ({
  layersNode: layersNode("cmp", ...(blendModes.length ? blendModes : (["normal", "normal"] as BlendMode[]))),
  edges: [edge(top, "cmp", "r0"), edge(bottom, "cmp", "r1"), edge("cmp", "out")],
});

describe("runGraph: structure", () => {
  test.each([
    ["an unlinked node", [input, colorNoise, output], [edge("in", "out")]],
    ["a dead-end fork", [input, colorNoise, output], [edge("in", "out"), edge("in", "nz")]],
    ["an unlinked layers node", [input, layersNode("cmp", "normal"), output], [edge("in", "out")]],
  ])("ignores %s", async (_, nodes, edges) => {
    expect(await hashOf(nodes, edges)).toBe(await plain());
  });

  test.each([
    ["output not linked", [input, colorNoise, output], [edge("in", "nz")], "out"],
    ["a chain not reaching the input", [input, colorNoise, output], [edge("nz", "out")], "nz"],
    [
      "a row chain not reaching the input",
      [input, colorNoise, layersNode("cmp", "normal", "normal"), output],
      [edge("in", "cmp", "r1"), edge("nz", "cmp", "r0"), edge("cmp", "out")],
      "nz",
    ],
    ["a layers node without a linked row", [input, layersNode("cmp", "normal"), output], [edge("cmp", "out")], "cmp"],
    // validateGraph — the same rules the web applies when a link is drawn
    ["two links into one node", [input, colorNoise, output], [edge("in", "nz"), edge("nz", "out"), edge("in", "out")], "out"],
    [
      "two links into one row",
      [input, colorNoise, layersNode("cmp", "normal"), output],
      [edge("in", "nz"), edge("in", "cmp", "r0"), edge("nz", "cmp", "r0"), edge("cmp", "out")],
      "cmp",
    ],
    ["a cycle", [input, colorNoise, nz2, output], [edge("nz", "nz2"), edge("nz2", "nz"), edge("nz2", "out")], "nz"],
    ["a link into the input", [input, colorNoise, output], [edge("in", "out"), edge("nz", "in")], "in"],
  ])("rejects %s, pointing at the node", async (_, nodes, edges, nodeId) => {
    await expect(render(nodes, edges)).rejects.toMatchObject({ nodeId });
  });

  test.each([
    ["two inputs", graph([input, { ...input, id: "in2" }, output], [edge("in", "out")])],
    ["duplicate ids", graph([input, { ...colorNoise, id: "in" }, output], [edge("in", "out")])],
  ])("rejects %s", async (_, g) => {
    await expect(runGraph(g, loadImage)).rejects.toBeInstanceOf(GraphError);
  });
});

describe("runGraph: the picture", () => {
  const plainGraph = graph([input, output], [edge("in", "out")]);

  test("asks the port for the input's imageId", async () => {
    const asked: string[] = [];
    await runGraph(plainGraph, (imageId) => {
      asked.push(imageId);
      return loadImage();
    });
    expect(asked).toEqual([IMAGE_ID]);
  });

  test("the port has no such picture → image not found on the input", async () => {
    const rendering = runGraph(plainGraph, async () => null);
    await expect(rendering).rejects.toBeInstanceOf(GraphError);
    await expect(rendering).rejects.toMatchObject({ message: "image not found", nodeId: "in" });
  });
});

describe("runGraph: layersNode", () => {
  test("fan-out: chains don't share a buffer — fill in one leaves the other untouched", async () => {
    // the filled row on top at opacity 0, or under an opaque row — either way only the picture shows
    const hidden = twoRows("op", "in");
    expect(
      await hashOf([input, fill("f"), opacity("op", 0), hidden.layersNode, output], [edge("in", "f"), edge("f", "op"), ...hidden.edges]),
    ).toBe(await plain());
    const under = twoRows("in", "f");
    expect(await hashOf([input, fill("f"), under.layersNode, output], [edge("in", "f"), ...under.edges])).toBe(await plain());
  });

  test("row order is layer order: swapping rows changes the picture", async () => {
    const redOnTop = twoRows("f", "in");
    const redUnder = twoRows("in", "f");
    const nodes = [input, fill("f"), redOnTop.layersNode, output];
    const onTop = await hashOf(nodes, [edge("in", "f"), ...redOnTop.edges]);
    const under = await hashOf(nodes, [edge("in", "f"), ...redUnder.edges]);
    expect(onTop).not.toBe(under);
    expect(under).toBe(await plain());
  });

  test("every blend mode renders, each its own picture", async () => {
    const hashes = await Promise.all(
      (["normal", "add", "lch-hue"] as const).map((mode) => {
        const { layersNode: cmp, edges } = twoRows("t", "in", mode, "normal");
        return hashOf([input, tint("t"), cmp, output], [edge("in", "t"), ...edges]);
      }),
    );
    expect(new Set(hashes).size).toBe(3);
  });

  test("the chain's opacity is baked into its layer", async () => {
    const { layersNode: cmp, edges } = twoRows("op", "in");
    const [{ data }, { data: source }] = await Promise.all([
      render([input, fill("f", "#ffffff"), opacity("op", 0.5), cmp, output], [edge("in", "f"), edge("f", "op"), ...edges]),
      render([input, output], [edge("in", "out")]),
    ]);
    // white at half over the picture: halfway between the two
    for (const i of [0, 1, 2, 4000, 4001]) expect(Math.abs(data[i]! - (source[i]! + 255) / 2)).toBeLessThanOrEqual(1);
    expect(data[3]).toBe(255);
  });

  test("an unlinked row is skipped", async () => {
    const nodes = [input, layersNode("cmp", "add", "normal", "normal"), output];
    expect(await hashOf(nodes, [edge("in", "cmp", "r1"), edge("cmp", "out")])).toBe(await plain());
  });

  test("a hidden row is skipped like an unlinked one", async () => {
    const { layersNode: cmp, edges } = twoRows("f", "in");
    const hidden = { ...cmp, data: { layers: [{ id: "r0", blendMode: "normal", visible: false }, { id: "r1", blendMode: "normal" }] } } as GraphNode;
    expect(await hashOf([input, fill("f"), hidden, output], [edge("in", "f"), ...edges])).toBe(await plain());
  });

  test("all linked rows hidden → an error on the layers node", async () => {
    const hidden = { ...layersNode("cmp", "normal"), data: { layers: [{ id: "r0", blendMode: "normal", visible: false }] } } as GraphNode;
    await expect(render([input, hidden, output], [edge("in", "cmp", "r0"), edge("cmp", "out")])).rejects.toMatchObject({
      nodeId: "cmp",
      message: "show a layer",
    });
  });

  test("one node into both rows of a layers node", async () => {
    const nodes = [input, layersNode("cmp", "normal", "normal"), output];
    expect(await hashOf(nodes, [edge("in", "cmp", "r0"), edge("in", "cmp", "r1"), edge("cmp", "out")])).toBe(await plain());
  });

  test("layers into layers", async () => {
    const nodes = [input, fill("f"), layersNode("inner", "normal", "normal"), layersNode("outer", "normal", "normal"), output];
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

describe("runGraph: the animation node", () => {
  const animation: GraphNode = {
    id: "anim",
    type: "animation",
    data: { fps: 24, frames: 11, tracks: [{ id: "t1", keys: [{ frame: 0, value: 0 }, { frame: 10, value: 1 }] }] },
  };
  const animated = (id: string): GraphEdge => ({ id: "param", source: id, sourceHandle: "opacity", target: "anim", targetHandle: "t1" });
  const chain = [edge("in", "op"), edge("op", "out")];

  test("is never reached: the picture is the one without it", async () => {
    const nodes = [input, opacity("op", 0.5), output];
    expect(await hashOf([...nodes, animation], [...chain, animated("op")])).toBe(await hashOf(nodes, chain));
  });

  test("a param link alone doesn't pull its source", async () => {
    const nodes = [input, opacity("op", 0.5), animation, output];
    expect(await hashOf(nodes, [edge("in", "out"), animated("op")])).toBe(await plain());
  });

  test("a frame from graphAtFrame renders as the same graph with that value", async () => {
    const frame = graphAtFrame(graph([input, opacity("op", 1), animation, output], [...chain, animated("op")]), 5);
    const { data } = await runGraph(frame, loadImage);
    const { data: expected } = await render([input, opacity("op", 0.5), output], chain);
    expect(Buffer.from(data).equals(Buffer.from(expected))).toBe(true);
  });

  test("a frame through a delay renders the value of `frames` earlier; the delay is never reached either", async () => {
    const delay: GraphNode = { id: "dl", type: "delay", data: { frames: 3, rows: [{ id: "r1" }] } };
    const links: GraphEdge[] = [
      { id: "in-dl", source: "op", sourceHandle: "opacity", target: "dl", targetHandle: "r1" },
      { id: "dl-anim", source: "dl", sourceHandle: "r1", target: "anim", targetHandle: "t1" },
    ];
    const frame = graphAtFrame(graph([input, opacity("op", 1), delay, animation, output], [...chain, ...links]), 8);
    const { data } = await runGraph(frame, loadImage);
    const { data: expected } = await render([input, opacity("op", 0.5), output], chain);
    expect(Buffer.from(data).equals(Buffer.from(expected))).toBe(true);
  });
});

describe("runGraph: layer cap", () => {
  const rows = (count: number) => ({
    nodes: [input, layersNode("cmp", ...Array<BlendMode>(count).fill("normal")), output],
    edges: [...Array.from({ length: count }, (_, row) => edge("in", "cmp", `r${row}`)), edge("cmp", "out")],
  });

  test(`${RENDER_MAX_LAYERS_DEFAULT} rows by default pass, one more doesn't`, async () => {
    const atCap = rows(RENDER_MAX_LAYERS_DEFAULT);
    expect(await hashOf(atCap.nodes, atCap.edges)).toBe(await plain());
    const over = rows(RENDER_MAX_LAYERS_DEFAULT + 1);
    await expect(render(over.nodes, over.edges)).rejects.toMatchObject({ nodeId: "cmp" });
  });

  test("hidden rows don't count", async () => {
    const { edges } = rows(3);
    const layers = (["r0", "r1", "r2"] as const).map((id) => ({ id, blendMode: "normal" as const, ...(id === "r0" && { visible: false }) }));
    const cmp: GraphNode = { id: "cmp", type: "layers", data: { layers } };
    expect(await hashOf([input, cmp, output], edges, 2)).toBe(await plain());
  });

  test("the cap comes from the caller", async () => {
    const { nodes, edges } = rows(3);
    await expect(render(nodes, edges, 2)).rejects.toMatchObject({ nodeId: "cmp" });
  });

  test("counts over all layers nodes — nesting doesn't bypass it", async () => {
    const nodes = [input, layersNode("inner", "normal", "normal"), layersNode("outer", "normal", "normal"), output];
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

describe("cornersQuad", () => {
  const untouched = {
    topLeftX: 0, topLeftY: 0, topRightX: 100, topRightY: 0,
    bottomRightX: 100, bottomRightY: 100, bottomLeftX: 0, bottomLeftY: 100,
  };

  test("0 / 100 % land on the first / last pixel — the source corners, the identity", () => {
    expect(cornersQuad(untouched, { width: 250, height: 359 })).toEqual([
      { x: 0, y: 0 }, { x: 249, y: 0 }, { x: 249, y: 358 }, { x: 0, y: 358 },
    ]);
  });

  test("percent of the size, past the frame too", () => {
    const [topLeft] = cornersQuad({ ...untouched, topLeftX: -50, topLeftY: 50 }, { width: 101, height: 201 });
    expect(topLeft).toEqual({ x: -50, y: 100 });
  });
});