import { describe, expect, test } from "bun:test";
import { toast2signac } from "@xtc-toaster/toasts";
import { toFlow } from "./graph";
import { fromSaved, toSaved } from "./persist";

const IMAGE_ID = crypto.randomUUID();

const withImage = () => {
  const { nodes, edges } = toFlow(toast2signac);
  return {
    nodes: nodes.map((node) => (node.type === "input" ? { ...node, data: { imageId: IMAGE_ID } } : node)),
    edges,
  };
};

describe("toSaved / fromSaved", () => {
  test("round trip keeps the graph, the picture and the positions", () => {
    const { nodes, edges } = withImage();
    const moved = nodes.map((node) => (node.id === "nz" ? { ...node, position: { x: 12, y: -34 } } : node));
    const restored = fromSaved(toSaved(moved, edges));
    expect(restored).not.toBeNull();
    expect(restored!.edges).toEqual(edges);
    expect(restored!.nodes.find(({ id }) => id === "nz")?.position).toEqual({ x: 12, y: -34 });
    expect(restored!.nodes.find(({ type }) => type === "input")?.data).toEqual({ imageId: IMAGE_ID });
    // input / output stay undeletable
    expect(restored!.nodes.find(({ type }) => type === "output")?.deletable).toBe(false);
  });

  test("a node without a saved position gets the auto layout", () => {
    const { nodes, edges } = withImage();
    const saved = JSON.parse(toSaved(nodes, edges));
    delete saved.positions.nz;
    const restored = fromSaved(JSON.stringify(saved));
    expect(restored!.nodes.find(({ id }) => id === "nz")?.position).toEqual(nodes.find(({ id }) => id === "nz")!.position);
  });

  test("nothing saved or anything broken → null (the default graph)", () => {
    expect(fromSaved(null)).toBeNull();
    expect(fromSaved("")).toBeNull();
    expect(fromSaved("not json")).toBeNull();
    expect(fromSaved(JSON.stringify({ positions: {} }))).toBeNull();
    expect(fromSaved(JSON.stringify({ graph: { version: 1, nodes: [], edges: [] }, positions: {} }))).toBeNull();
  });
});
