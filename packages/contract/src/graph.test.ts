import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { TOAST_GRAPH_VERSION } from "./constants";
import { parseToastGraph } from "./graph";

const IMAGE_ID = "3f6c1a52-8e0b-4c1d-9a7e-2b5f4d6e8a90";

const validGraph = () => ({
  version: TOAST_GRAPH_VERSION,
  nodes: [
    { id: "in", type: "input", data: { imageId: IMAGE_ID } },
    { id: "nz", type: "noize", data: { deviationCoefficient: 0.5 } },
    { id: "out", type: "output", data: {} },
  ],
  edges: [
    { id: "in-nz", source: "in", target: "nz" },
    { id: "nz-out", source: "nz", target: "out" },
  ],
});

const issuesOf = (data: unknown) => {
  try {
    parseToastGraph(data);
  } catch (error) {
    if (error instanceof z.ZodError) return error.issues;
    throw error;
  }
  throw new Error("expected parse to fail");
};

describe("parseToastGraph", () => {
  test("accepts a valid graph", () => {
    expect<unknown>(parseToastGraph(validGraph())).toEqual(validGraph());
  });

  test("accepts imageId: null (toast preset)", () => {
    const graph = validGraph();
    graph.nodes[0]!.data = { imageId: null as unknown as string };
    expect(() => parseToastGraph(graph)).not.toThrow();
  });

  test("strips ui fields from nodes", () => {
    const graph = validGraph();
    Object.assign(graph.nodes[0]!, { position: { x: 0, y: 0 }, selected: true });
    expect(parseToastGraph(graph).nodes[0]).not.toHaveProperty("position");
  });

  test("rejects missing edges", () => {
    const { edges, ...graph } = validGraph();
    expect(issuesOf(graph)[0]!.path).toEqual(["edges"]);
  });

  test("rejects a foreign version", () => {
    expect(issuesOf({ ...validGraph(), version: 2 })[0]!.path).toEqual(["version"]);
  });

  test("rejects a non-uuid imageId", () => {
    const graph = validGraph();
    graph.nodes[0]!.data = { imageId: "../../etc/passwd" };
    expect(issuesOf(graph)[0]!.path).toEqual(["nodes", 0, "data", "imageId"]);
  });

  test.each([-0.1, 1.1])("rejects deviationCoefficient %p", (value) => {
    const graph = validGraph();
    graph.nodes[1]!.data = { deviationCoefficient: value };
    // path points at the node index — server maps it to nodeId for render-error
    expect(issuesOf(graph)[0]!.path).toEqual(["nodes", 1, "data", "deviationCoefficient"]);
  });

  test("rejects an unknown node type", () => {
    const graph = validGraph();
    Object.assign(graph.nodes[1]!, { type: "blur" });
    expect(issuesOf(graph)[0]!.path).toEqual(["nodes", 1, "type"]);
  });
});
