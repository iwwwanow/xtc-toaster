import { describe, expect, test } from "bun:test";
import { toast2signac } from "@xtc-toaster/toasts";
import { PARAMS } from "@xtc-toaster/contract";
import { createNode, fromToastFile, MENU_NODE_TYPES, toFlow, toGraph, toToastFile, ToastFileError } from "./graph";

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

  test.each(["blur", "saturationMask", "valueMask", "translate", "rotate", "scale"] as const)(
    "%s starts with every param at its initial",
    (type) => {
      const initials = Object.fromEntries(Object.entries(PARAMS[type]).map(([name, { initial }]) => [name, initial]));
      expect<unknown>(createNode(type, { x: 0, y: 0 }).data).toEqual(initials);
    },
  );

  test("an isolate channel starts on red", () => {
    expect(createNode("isolateChannel", { x: 0, y: 0 }).data).toEqual({ channel: "red" });
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
    ["duplicate ids", JSON.stringify({ ...toast2signac, nodes: toast2signac.nodes.map((node) => (node.type === "hueMask" ? { ...node, id: "nz" } : node)) }), "duplicate node id"],
  ])("import rejects %s with a message for the ui", (_, text, message) => {
    expect(() => fromToastFile(text, null)).toThrow(new ToastFileError(message));
  });
});
