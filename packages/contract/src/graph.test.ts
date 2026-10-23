import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { TOAST_GRAPH_VERSION } from "./constants";
import { parseToastGraph } from "./graph";

const IMAGE_ID = "3f6c1a52-8e0b-4c1d-9a7e-2b5f4d6e8a90";

const validGraph = () => ({
  version: TOAST_GRAPH_VERSION,
  nodes: [
    { id: "in", type: "input", data: { imageId: IMAGE_ID } },
    { id: "nz", type: "hueNoise", data: { deviationCoefficient: 0.5 } },
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

  test("accepts a hue mask at its bounds", () => {
    const graph = validGraph();
    graph.nodes[1] = { id: "hm", type: "hueMask", data: { hue: 360, tolerance: 0 } } as never;
    expect(() => parseToastGraph(graph)).not.toThrow();
  });

  test.each([
    ["hue", -1],
    ["hue", 361],
    ["tolerance", -1],
    ["tolerance", 181],
  ])("rejects hue mask %s %p", (param, value) => {
    const graph = validGraph();
    graph.nodes[1] = { id: "hm", type: "hueMask", data: { hue: 0, tolerance: 30, [param]: value } } as never;
    expect(issuesOf(graph)[0]!.path).toEqual(["nodes", 1, "data", param]);
  });

  test.each([
    [-85, 10],
    [85, 300],
  ])("accepts a y-rotation at its bounds: angle %p, focalLength %p", (angle, focalLength) => {
    const graph = validGraph();
    graph.nodes[1] = { id: "yr", type: "yRotation", data: { angle, focalLength } } as never;
    expect(() => parseToastGraph(graph)).not.toThrow();
  });

  test.each([
    ["angle", -86],
    ["angle", 86],
    ["focalLength", 9],
    ["focalLength", 301],
  ])("rejects y-rotation %s %p", (param, value) => {
    const graph = validGraph();
    graph.nodes[1] = { id: "yr", type: "yRotation", data: { angle: 30, focalLength: 50, [param]: value } } as never;
    expect(issuesOf(graph)[0]!.path).toEqual(["nodes", 1, "data", param]);
  });

  // single-layer nodes added together: a node at both ends of its bounds parses, one step past either end
  // fails on that param — the path is what server maps to render-error on the node
  const corners = (value: number) =>
    Object.fromEntries(
      ["topLeft", "topRight", "bottomRight", "bottomLeft"].flatMap((corner) => [
        [`${corner}X`, value],
        [`${corner}Y`, value],
      ]),
    );
  const nodeAt = (type: string, data: Record<string, unknown>) => {
    const graph = validGraph();
    graph.nodes[1] = { id: "n", type, data } as never;
    return graph;
  };

  test.each([
    ["blur", { radius: 0 }, { radius: 20 }],
    ["saturationMask", { saturation: 0, tolerance: 0 }, { saturation: 100, tolerance: 100 }],
    ["valueMask", { value: 0, tolerance: 0 }, { value: 100, tolerance: 100 }],
    ["translate", { x: -100, y: -100 }, { x: 100, y: 100 }],
    ["rotate", { angle: -180 }, { angle: 180 }],
    ["scale", { x: 0.1, y: 0.1 }, { x: 3, y: 3 }],
    ["skew", { x: -60, y: -60 }, { x: 60, y: 60 }],
    ["opacity", { opacity: 0 }, { opacity: 1 }],
    ["perspective", corners(-50), corners(150)],
  ])("accepts %s at its bounds", (type, min, max) => {
    expect(() => parseToastGraph(nodeAt(type, min))).not.toThrow();
    expect(() => parseToastGraph(nodeAt(type, max))).not.toThrow();
  });

  test.each([
    ["blur", { radius: 4 }, "radius", -1],
    ["blur", { radius: 4 }, "radius", 21],
    ["saturationMask", { saturation: 100, tolerance: 30 }, "saturation", 101],
    ["saturationMask", { saturation: 100, tolerance: 30 }, "tolerance", -1],
    ["valueMask", { value: 100, tolerance: 30 }, "value", -1],
    ["valueMask", { value: 100, tolerance: 30 }, "tolerance", 101],
    ["translate", { x: 10, y: 0 }, "x", 101],
    ["translate", { x: 10, y: 0 }, "y", -101],
    ["rotate", { angle: 15 }, "angle", 181],
    ["scale", { x: 0.75, y: 0.75 }, "x", 0],
    ["scale", { x: 0.75, y: 0.75 }, "y", 3.1],
    ["skew", { x: 15, y: 0 }, "x", 61],
    ["opacity", { opacity: 0.5 }, "opacity", 1.1],
    ["perspective", corners(0), "bottomLeftY", 151],
    ["perspective", corners(0), "topRightX", -51],
  ])("rejects %s with %s → %s %p", (type, data, param, value) => {
    expect(issuesOf(nodeAt(type, { ...data, [param]: value }))[0]!.path).toEqual(["nodes", 1, "data", param]);
  });

  test.each(["red", "green", "blue", "alpha"])("accepts isolateChannel %s", (channel) => {
    expect(() => parseToastGraph(nodeAt("isolateChannel", { channel }))).not.toThrow();
  });

  test("accepts a homography: any 9 finite numbers", () => {
    expect(() => parseToastGraph(nodeAt("homography", { matrix: [1, 0.2, 0, -0.1, 1, 0.001, 30, -20, 1] }))).not.toThrow();
  });

  test.each([
    ["8 numbers", [1, 0, 0, 0, 1, 0, 0, 0]],
    ["10 numbers", [1, 0, 0, 0, 1, 0, 0, 0, 1, 0]],
    ["a string inside", [1, 0, 0, 0, "1", 0, 0, 0, 1]],
  ])("rejects a homography of %s", (_, matrix) => {
    expect(issuesOf(nodeAt("homography", { matrix }))[0]!.path.slice(0, 4)).toEqual(["nodes", 1, "data", "matrix"]);
  });

  test.each(["fill", "tint"])("%s takes a #rrggbb color, any case", (type) => {
    expect(() => parseToastGraph(nodeAt(type, { color: "#A4a4ff" }))).not.toThrow();
  });

  test.each(["red", "#fff", "#a4a4a4ff", "a4a4a4"])("rejects a fill color %p", (color) => {
    expect(issuesOf(nodeAt("fill", { color }))[0]!.path).toEqual(["nodes", 1, "data", "color"]);
  });

  test("rejects an unknown channel", () => {
    expect(issuesOf(nodeAt("isolateChannel", { channel: "cyan" }))[0]!.path).toEqual(["nodes", 1, "data", "channel"]);
  });

  test("rejects an unknown node type", () => {
    const graph = validGraph();
    Object.assign(graph.nodes[1]!, { type: "sharpen" });
    expect(issuesOf(graph)[0]!.path).toEqual(["nodes", 1, "type"]);
  });
});
