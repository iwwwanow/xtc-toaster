import { describe, expect, test } from "bun:test";
import { toast2signac } from "@xtc-toaster/toasts";
import { PARAMS } from "@xtc-toaster/contract";
import { createNode, toFlow, toGraph } from "./graph";

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
