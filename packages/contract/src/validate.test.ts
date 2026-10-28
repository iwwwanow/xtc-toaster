import { describe, expect, test } from "bun:test";
import { TOAST_GRAPH_VERSION } from "./constants";
import { parseToastGraph, type GraphEdge, type GraphNode } from "./graph";
import { INITIAL_DATA } from "./params";
import { validateGraph } from "./validate";

const input: GraphNode = { id: "in", type: "input", data: { imageId: null } };
const hueNoise: GraphNode = { id: "nz", type: "hueNoise", data: { deviationCoefficient: 0.5 } };
const nz2: GraphNode = { ...hueNoise, id: "nz2" };
const output: GraphNode = { id: "out", type: "output", data: {} };
const composer: GraphNode = {
  id: "cmp",
  type: "composer",
  data: { layers: [{ id: "top", blendMode: "add" }, { id: "bottom", blendMode: "normal" }] },
};

const edge = (source: string, target: string, targetHandle?: string): GraphEdge => ({
  id: `${source}-${target}${targetHandle ? `-${targetHandle}` : ""}`,
  source,
  target,
  ...(targetHandle && { targetHandle }),
});
const graph = (nodes: GraphNode[], edges: GraphEdge[]) => ({ version: TOAST_GRAPH_VERSION, nodes, edges });

// input fans out into both rows, one through hue noise
const fanOut = () =>
  graph(
    [input, hueNoise, composer, output],
    [edge("in", "nz"), edge("nz", "cmp", "top"), edge("in", "cmp", "bottom"), edge("cmp", "out")],
  );

describe("validateGraph", () => {
  test.each([
    ["a chain", graph([input, hueNoise, output], [edge("in", "nz"), edge("nz", "out")])],
    ["input → output", graph([input, output], [edge("in", "out")])],
    ["a fan-out into a composer", fanOut()],
    ["a composer with an unlinked row", graph([input, composer, output], [edge("in", "cmp", "top"), edge("cmp", "out")])],
    ["one source into both rows", graph([input, composer, output], [edge("in", "cmp", "top"), edge("in", "cmp", "bottom")])],
    ["unlinked nodes", graph([input, hueNoise, composer, output], [])],
    ["a dead-end fork", graph([input, hueNoise, output], [edge("in", "out"), edge("in", "nz")])],
  ])("accepts %s", (_, g) => {
    expect(validateGraph(g)).toBeNull();
  });

  test.each([
    ["a self-link", graph([input, hueNoise, output], [edge("nz", "nz")]), "nz"],
    ["a link into the input", graph([input, hueNoise, output], [edge("nz", "in")]), "in"],
    ["a link out of the output", graph([input, hueNoise, output], [edge("out", "nz")]), "out"],
    ["two links into one node", graph([input, hueNoise, output], [edge("in", "out"), edge("nz", "out")]), "out"],
    ["two links into one row", graph([input, hueNoise, composer, output], [edge("in", "cmp", "top"), edge("nz", "cmp", "top")]), "cmp"],
    ["a composer link without a row", graph([input, composer, output], [edge("in", "cmp")]), "cmp"],
    ["a composer link into a missing row", graph([input, composer, output], [edge("in", "cmp", "middle")]), "cmp"],
    ["a handle on a plain node", graph([input, hueNoise, output], [edge("in", "nz", "top")]), "nz"],
    ["a cycle on the way", graph([input, hueNoise, nz2, output], [edge("nz", "nz2"), edge("nz2", "nz"), edge("nz2", "out")]), "nz"],
    // the whole graph is checked, not only what the output pulls
    ["a cycle off the path", graph([input, hueNoise, nz2, output], [edge("in", "out"), edge("nz", "nz2"), edge("nz2", "nz")]), "nz"],
    [
      "a cycle through a composer",
      graph([input, hueNoise, composer, output], [edge("in", "cmp", "bottom"), edge("cmp", "nz"), edge("nz", "cmp", "top")]),
      "cmp",
    ],
    ["a duplicate node id", graph([input, { ...hueNoise, id: "in" }, output], []), "in"],
  ])("rejects %s, pointing at the node", (_, g, nodeId) => {
    expect(validateGraph(g)).toMatchObject({ nodeId });
  });

  test.each([
    ["two inputs", graph([input, { ...input, id: "in2" }, output], [])],
    ["no output", graph([input, hueNoise], [])],
    ["an edge to a missing node", graph([input, output], [edge("in", "ghost")])],
  ])("rejects %s", (_, g) => {
    expect(validateGraph(g)).toMatchObject({ message: expect.any(String) });
  });
});

describe("composer in parseToastGraph", () => {
  test("a fan-out graph round-trips, targetHandle kept", () => {
    expect<unknown>(parseToastGraph(fanOut())).toEqual(fanOut());
  });

  test("an edge without targetHandle stays without it — sprint 2–3 files are unchanged", () => {
    expect(parseToastGraph(fanOut()).edges[0]).not.toHaveProperty("targetHandle");
  });

  test("a new composer starts with 2 normal rows", () => {
    const nodes = [input, { id: "cmp", type: "composer", data: INITIAL_DATA.composer }, output];
    expect(() => parseToastGraph(graph(nodes as GraphNode[], []))).not.toThrow();
  });

  test.each([
    ["no layers", { layers: [] }, ["nodes", 1, "data", "layers"]],
    ["an unknown blend mode", { layers: [{ id: "a", blendMode: "multiply" }] }, ["nodes", 1, "data", "layers", 0, "blendMode"]],
    [
      "a duplicate layer id",
      { layers: [{ id: "a", blendMode: "normal" }, { id: "a", blendMode: "add" }] },
      ["nodes", 1, "data", "layers", 1, "id"],
    ],
  ])("rejects %s, the path at the node", (_, data, path) => {
    const g = graph([input, { ...composer, data } as GraphNode, output], []);
    expect(() => parseToastGraph(g)).toThrow();
    try {
      parseToastGraph(g);
    } catch (error) {
      expect((error as { issues: Array<{ path: unknown }> }).issues[0]!.path).toEqual(path);
    }
  });
});
