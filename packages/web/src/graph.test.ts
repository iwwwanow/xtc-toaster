import { describe, expect, test } from "bun:test";
import { toast2signac } from "@xtc-toaster/toasts";
import { toFlow, toGraph } from "./graph";

describe("toFlow", () => {
  test("places nodes left to right by chain order", () => {
    const shuffled = { ...toast2signac, nodes: [...toast2signac.nodes].reverse() };
    const { nodes } = toFlow(shuffled);
    const x = Object.fromEntries(nodes.map(({ id, position }) => [id, position.x]));
    expect(x.in!).toBeLessThan(x.nz!);
    expect(x.nz!).toBeLessThan(x.out!);
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
