import { describe, expect, test } from "bun:test";
import { TOAST_GRAPH_VERSION, type GraphEdge, type GraphNode } from "@xtc-toaster/contract";
import { GraphError, focalLengthPx, toPath } from "./run-graph";

const input: GraphNode = { id: "in", type: "input", data: { imageId: null } };
const hueNoise: GraphNode = { id: "nz", type: "hueNoise", data: { deviationCoefficient: 0.5 } };
const output: GraphNode = { id: "out", type: "output", data: {} };

const edge = (source: string, target: string): GraphEdge => ({ id: `${source}-${target}`, source, target });
const graph = (nodes: GraphNode[], edges: GraphEdge[]) => ({ version: TOAST_GRAPH_VERSION, nodes, edges });
const ids = (nodes: GraphNode[]) => nodes.map((node) => node.id);

const nz2: GraphNode = { ...hueNoise, id: "nz2" };

describe("toPath", () => {
  test("orders nodes along the edges, not by array order", () => {
    const path = toPath(graph([output, hueNoise, input], [edge("nz", "out"), edge("in", "nz")]));
    expect(ids(path)).toEqual(["in", "nz", "out"]);
  });

  test("accepts input → output without effects", () => {
    expect(ids(toPath(graph([input, output], [edge("in", "out")])))).toEqual(["in", "out"]);
  });

  test.each([
    ["an unlinked node", graph([input, hueNoise, output], [edge("in", "out")])],
    ["a dead-end fork", graph([input, hueNoise, output], [edge("in", "out"), edge("in", "nz")])],
    ["a cycle off the path", graph([input, hueNoise, nz2, output], [edge("in", "out"), edge("nz", "nz2"), edge("nz2", "nz")])],
  ])("ignores %s", (_, g) => {
    expect(ids(toPath(g))).toEqual(["in", "out"]);
  });

  test.each([
    ["output not linked", graph([input, hueNoise, output], [edge("in", "nz")]), "out"],
    ["path not reaching the input", graph([input, hueNoise, output], [edge("nz", "out")]), "nz"],
    ["two links into one node", graph([input, hueNoise, output], [edge("in", "nz"), edge("nz", "out"), edge("in", "out")]), "out"],
    ["a loop on the path", graph([input, hueNoise, nz2, output], [edge("nz", "nz2"), edge("nz2", "nz"), edge("nz2", "out")]), "nz"],
  ])("rejects %s, pointing at the node", (_, g, nodeId) => {
    expect(() => toPath(g)).toThrow(expect.objectContaining({ nodeId }));
  });

  test.each([
    ["two inputs", graph([input, { ...input, id: "in2" }, output], [edge("in", "out")])],
    ["no output", graph([input, hueNoise], [edge("in", "nz")])],
    ["edge to a missing node", graph([input, output], [edge("in", "ghost")])],
    ["duplicate ids", graph([input, { ...hueNoise, id: "in" }, output], [edge("in", "out")])],
  ])("rejects %s", (_, g) => {
    expect(() => toPath(g)).toThrow(GraphError);
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
