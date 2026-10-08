import { describe, expect, test } from "bun:test";
import { TOAST_GRAPH_VERSION, type GraphEdge, type GraphNode } from "@xtc-toaster/contract";
import { GraphError, toChain } from "./run-graph";

const input: GraphNode = { id: "in", type: "input", data: { imageId: null } };
const noize: GraphNode = { id: "nz", type: "noize", data: { deviationCoefficient: 0.5 } };
const output: GraphNode = { id: "out", type: "output", data: {} };

const edge = (source: string, target: string): GraphEdge => ({ id: `${source}-${target}`, source, target });
const graph = (nodes: GraphNode[], edges: GraphEdge[]) => ({ version: TOAST_GRAPH_VERSION, nodes, edges });
const ids = (nodes: GraphNode[]) => nodes.map((node) => node.id);

describe("toChain", () => {
  test("orders nodes along the edges, not by array order", () => {
    const chain = toChain(graph([output, noize, input], [edge("nz", "out"), edge("in", "nz")]));
    expect(ids(chain)).toEqual(["in", "nz", "out"]);
  });

  test("accepts input → output without effects", () => {
    expect(ids(toChain(graph([input, output], [edge("in", "out")])))).toEqual(["in", "out"]);
  });

  test.each([
    ["two inputs", graph([input, { ...input, id: "in2" }, output], [edge("in", "out")])],
    ["no output", graph([input, noize], [edge("in", "nz")])],
    ["branching", graph([input, noize, output], [edge("in", "nz"), edge("in", "out")])],
    ["dangling node", graph([input, noize, output], [edge("in", "out")])],
    ["cycle off the path", graph([input, noize, { ...noize, id: "nz2" }, output], [edge("in", "out"), edge("nz", "nz2"), edge("nz2", "nz")])],
    ["edge to a missing node", graph([input, output], [edge("in", "ghost")])],
    ["duplicate ids", graph([input, { ...noize, id: "in" }, output], [edge("in", "out")])],
    ["no edges", graph([input, output], [])],
  ])("rejects %s", (_, g) => {
    expect(() => toChain(g)).toThrow(GraphError);
  });
});
