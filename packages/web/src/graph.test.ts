import { describe, expect, test } from "bun:test";
import { toast2signac } from "@xtc-toaster/toasts";
import { INITIAL_DATA, PARAMS } from "@xtc-toaster/contract";
import type { Edge } from "@xyflow/svelte";
import { TOAST_GRAPH_VERSION, type GraphEdge, type GraphNode } from "@xtc-toaster/contract";
import {
  canConnect,
  createNode,
  fromToastFile,
  MENU_NODE_TYPES,
  toFlow,
  toGraph,
  toToastFile,
  ToastFileError,
  withoutTaken,
} from "./graph";

// input fans out: one row straight, one through hue noise; the composer into the output
const fanOut = () => ({
  version: TOAST_GRAPH_VERSION,
  nodes: [
    { id: "in", type: "input", data: { imageId: null } },
    { id: "nz", type: "hueNoise", data: { deviationCoefficient: 0.5 } },
    { id: "cmp", type: "composer", data: { layers: [{ id: "top", blendMode: "add" }, { id: "bottom", blendMode: "normal" }] } },
    { id: "out", type: "output", data: {} },
  ] as GraphNode[],
  edges: [
    { id: "in-nz", source: "in", target: "nz" },
    { id: "nz-cmp", source: "nz", target: "cmp", targetHandle: "top" },
    { id: "in-cmp", source: "in", target: "cmp", targetHandle: "bottom" },
    { id: "cmp-out", source: "cmp", target: "out" },
  ] as GraphEdge[],
});

describe("toFlow", () => {
  test("places nodes left to right by chain order", () => {
    const shuffled = { ...toast2signac, nodes: [...toast2signac.nodes].reverse() };
    const { nodes } = toFlow(shuffled);
    const x = Object.fromEntries(nodes.map(({ id, position }) => [id, position.x]));
    expect(x.in!).toBeLessThan(x.nz!);
    expect(x.nz!).toBeLessThan(x.out!);
  });

  test("puts nodes off the chain into a row below", () => {
    const bypass = { ...toast2signac, edges: [{ id: "in-out", source: "in", target: "out" }] };
    const y = Object.fromEntries(toFlow(bypass).nodes.map(({ id, position }) => [id, position.y]));
    expect(y.in).toBe(y.out!);
    expect(y.nz!).toBeGreaterThan(y.in!);
  });

  test("a fork: a node sits right of everything it pulls, a column stacks top-down", () => {
    const position = Object.fromEntries(toFlow(fanOut()).nodes.map(({ id, position }) => [id, position]));
    // cmp pulls in directly and through nz — the longest path puts it after nz
    expect(position.in!.x).toBeLessThan(position.nz!.x);
    expect(position.nz!.x).toBeLessThan(position.cmp!.x);
    expect(position.cmp!.x).toBeLessThan(position.out!.x);
  });

  test("two nodes at one depth stack in one column", () => {
    const graph = fanOut();
    graph.nodes.splice(2, 0, { id: "nz2", type: "hueNoise", data: { deviationCoefficient: 0.1 } });
    graph.edges.push({ id: "in-nz2", source: "in", target: "nz2" });
    const position = Object.fromEntries(toFlow(graph).nodes.map(({ id, position }) => [id, position]));
    expect(position.nz2!.x).toBe(position.nz!.x);
    expect(position.nz2!.y).toBeGreaterThan(position.nz!.y);
  });

  test("a cycle doesn't hang the layout", () => {
    const graph = fanOut();
    graph.edges.push({ id: "cmp-nz", source: "cmp", target: "nz" });
    expect(toFlow(graph).nodes).toHaveLength(4);
  });

  test("carries targetHandle, a plain edge stays without it", () => {
    const { edges } = toFlow(fanOut());
    expect(edges.find(({ id }) => id === "nz-cmp")).toMatchObject({ targetHandle: "top" });
    expect(edges.find(({ id }) => id === "in-nz")).not.toHaveProperty("targetHandle");
  });

  test("input and output can't be deleted, effects can", () => {
    const deletable = Object.fromEntries(toFlow(toast2signac).nodes.map(({ id, deletable }) => [id, deletable]));
    expect(deletable).toEqual({ in: false, nz: undefined, out: false });
  });
});

describe("createNode", () => {
  test("a uuid, the drop position and the initial params", () => {
    const node = createNode("hueNoise", { x: 10, y: 20 });
    expect(node.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(node.position).toEqual({ x: 10, y: 20 });
    expect(node.data).toEqual({ deviationCoefficient: PARAMS.hueNoise.deviationCoefficient.initial });
  });

  test("a hue mask starts with every param at its initial", () => {
    const { data } = createNode("hueMask", { x: 0, y: 0 });
    expect(data).toEqual({ hue: PARAMS.hueMask.hue.initial, tolerance: PARAMS.hueMask.tolerance.initial });
  });

  test("a y-rotation starts with every param at its initial", () => {
    const { data } = createNode("yRotation", { x: 0, y: 0 });
    expect(data).toEqual({
      angle: PARAMS.yRotation.angle.initial,
      focalLength: PARAMS.yRotation.focalLength.initial,
    });
  });

  test.each(["blur", "saturationMask", "valueMask", "translate", "rotate", "scale", "skew", "perspective", "opacity"] as const)(
    "%s starts with every param at its initial",
    (type) => {
      const initials = Object.fromEntries(Object.entries(PARAMS[type]).map(([name, { initial }]) => [name, initial]));
      expect<unknown>(createNode(type, { x: 0, y: 0 }).data).toEqual(initials);
    },
  );

  test("an isolate channel starts on red", () => {
    expect(createNode("isolateChannel", { x: 0, y: 0 }).data).toEqual({ channel: "red" });
  });

  test.each(["homography", "fill", "tint"] as const)("%s starts with its INITIAL_DATA", (type) => {
    expect<unknown>(createNode(type, { x: 0, y: 0 }).data).toEqual(INITIAL_DATA[type]);
  });

  test("two homographies don't share one matrix array", () => {
    const a = createNode("homography", { x: 0, y: 0 });
    const b = createNode("homography", { x: 0, y: 0 });
    expect((a.data as { matrix: number[] }).matrix).not.toBe((b.data as { matrix: number[] }).matrix);
  });

  // every menu node, dropped as is, is a valid graph node — the server accepts it
  test.each(MENU_NODE_TYPES)("a dropped %s passes the contract", (type) => {
    const nodes = [createNode(type, { x: 0, y: 0 })];
    expect(() => toGraph(nodes, [])).not.toThrow();
  });
});

describe("toGraph", () => {
  test("round-trips a toast", () => {
    const { nodes, edges } = toFlow(toast2signac);
    expect(toGraph(nodes, edges)).toEqual(toast2signac);
  });

  test("strips ui fields", () => {
    const { nodes, edges } = toFlow(toast2signac);
    const withUi = nodes.map((node) => ({ ...node, selected: true, measured: { width: 150, height: 40 } }));
    const graph = toGraph(withUi, edges.map((edge) => ({ ...edge, animated: true })));
    expect(graph.nodes[0]).toEqual({ id: "in", type: "input", data: { imageId: null } });
    expect(graph.edges[0]).toEqual({ id: "in-nz", source: "in", target: "nz" });
  });
});

describe("composer graph", () => {
  test("round-trips through the flow", () => {
    const { nodes, edges } = toFlow(fanOut());
    expect<unknown>(toGraph(nodes, edges)).toEqual(fanOut());
  });

  test("xyflow's null handles don't reach the contract", () => {
    const { nodes, edges } = toFlow(fanOut());
    const fromXyflow = edges.map((edge) => ({ sourceHandle: null, targetHandle: null, ...edge }));
    expect(toGraph(nodes, fromXyflow).edges[0]).toEqual({ id: "in-nz", source: "in", target: "nz" });
  });
});

describe("drawing links", () => {
  const flow = () => toFlow(fanOut());
  const link = (source: string, target: string, targetHandle: string | null = null) => ({ source, target, targetHandle });

  test.each([
    ["into a free row", link("nz", "cmp", "bottom")],
    ["onto a taken input — it replaces the link", link("in", "out")],
    ["the same output into a second node", link("in", "cmp", "top")],
  ])("allows %s", (_, connection) => {
    const { nodes, edges } = flow();
    expect(canConnect(nodes, edges, connection)).toBe(true);
  });

  test.each([
    ["a cycle", link("cmp", "nz")],
    ["a link into the input", link("nz", "in")],
    ["a link to itself", link("nz", "nz")],
    ["a composer link without a row", link("nz", "cmp")],
  ])("refuses %s", (_, connection) => {
    const { nodes, edges } = flow();
    expect(canConnect(nodes, edges, connection)).toBe(false);
  });

  test("a new link frees its target handle — other rows keep theirs", () => {
    const ids = (edges: Edge[]) => edges.map(({ id }) => id);
    expect(ids(withoutTaken(flow().edges, link("nz", "cmp", "bottom")))).toEqual(["in-nz", "nz-cmp", "cmp-out"]);
    expect(ids(withoutTaken(flow().edges, link("in", "nz")))).toEqual(["nz-cmp", "in-cmp", "cmp-out"]);
  });

  test("a moved link stays — only the one it lands on goes", () => {
    const moved = { id: "nz-cmp", source: "nz", target: "cmp", targetHandle: "bottom" };
    expect(withoutTaken(flow().edges, moved, "nz-cmp").map(({ id }) => id)).toEqual(["in-nz", "nz-cmp", "cmp-out"]);
  });
});

describe("toast file", () => {
  const IMAGE_ID = "3f6c1a52-8e0b-4c1d-9a7e-2b5f4d6e8a90";
  const withImage = () => {
    const { nodes, edges } = toFlow(toast2signac);
    return { nodes: nodes.map((node) => (node.type === "input" ? { ...node, data: { imageId: IMAGE_ID } } : node)), edges };
  };
  const inputData = (nodes: ReturnType<typeof toFlow>["nodes"]) =>
    nodes.find((node) => node.type === "input")?.data;

  test("export drops the picture and ui fields — the graph only", () => {
    const { nodes, edges } = withImage();
    const file = JSON.parse(toToastFile(nodes, edges));
    expect(file).toEqual({ ...toast2signac });
    expect(JSON.stringify(file)).not.toContain(IMAGE_ID);
  });

  test("export → import round trip keeps the graph, the current picture stays in the input", () => {
    const { nodes, edges } = withImage();
    const imported = fromToastFile(toToastFile(nodes, edges), IMAGE_ID);
    expect(toGraph(imported.nodes, imported.edges)).toEqual(toGraph(nodes, edges));
    expect(inputData(imported.nodes)).toEqual({ imageId: IMAGE_ID });
  });

  test("import rebuilds the layout by chain order", () => {
    const { nodes } = fromToastFile(JSON.stringify(toast2signac), null);
    expect(nodes.map(({ position }) => position)).toEqual(toFlow(toast2signac).nodes.map(({ position }) => position));
  });

  const onlyInput = toast2signac.nodes.filter(({ type }) => type === "input");
  test.each([
    ["not json", "{", "not a json file"],
    ["another json", JSON.stringify({ hello: "world" }), "not a toast file"],
    ["a param out of range", JSON.stringify({ ...toast2signac, nodes: toast2signac.nodes.map((node) => (node.type === "hueNoise" ? { ...node, data: { deviationCoefficient: 2 } } : node)) }), "not a toast file"],
    ["a newer version", JSON.stringify({ ...toast2signac, version: 2 }), "not a toast file"],
    ["no output", JSON.stringify({ ...toast2signac, nodes: onlyInput, edges: [] }), "a toast needs exactly one input and one output"],
    ["two inputs", JSON.stringify({ ...toast2signac, nodes: [...toast2signac.nodes, { ...onlyInput[0], id: "in2" }] }), "a toast needs exactly one input and one output"],
    ["a cycle", JSON.stringify({ ...fanOut(), edges: [...fanOut().edges.slice(1), { id: "cmp-nz", source: "cmp", target: "nz" }] }), "the graph loops"],
    ["duplicate ids", JSON.stringify({ ...toast2signac, nodes: toast2signac.nodes.map((node) => (node.type === "hueMask" ? { ...node, id: "nz" } : node)) }), "duplicate node id"],
  ])("import rejects %s with a message for the ui", (_, text, message) => {
    expect(() => fromToastFile(text, null)).toThrow(new ToastFileError(message));
  });
});
