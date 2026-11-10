import { describe, expect, test } from "bun:test";
import { toast1degas } from "@xtc-toaster/toasts";
import { arrange, type ArrangeHandle, type ArrangeNode } from "./arrange";
import { toFlow } from "./graph";

// degas with sizes as xyflow would measure them: a plain node 200 × 120, a node with param rows grows with
// them; handles on the rows of the layers node / animation tracks in the node's order
const ROW = 24;
const measured = (): ArrangeNode[] => {
  const { nodes, edges } = toFlow(toast1degas);
  return nodes.map((node) => {
    const handles: ArrangeHandle[] = [];
    if (node.type !== "input") handles.push({ id: null, type: "target", side: "left", y: 20 });
    if (node.type !== "output" && node.type !== "animation") handles.push({ id: null, type: "source", side: "right", y: 20 });
    const rows =
      node.type === "layers" ? node.data.layers.map(({ id }) => id) : node.type === "animation" ? node.data.tracks.map(({ id }) => id) : [];
    rows.forEach((id, i) => handles.push({ id, type: "target", side: "left", y: 60 + i * ROW }));
    const params = Object.keys(node.data).filter((key) => edges.some(({ source, sourceHandle }) => source === node.id && sourceHandle === key));
    params.forEach((id, i) => handles.push({ id, type: "source", side: "right", y: 60 + i * ROW }));
    const width = node.type === "animation" ? 602 : 200;
    return { id: node.id, width, height: 80 + Math.max(rows.length, Object.keys(node.data).length) * ROW, handles };
  });
};

describe("arrange", () => {
  test("degas: no overlaps, every link runs left to right, tighter than the 400 px grid", async () => {
    const nodes = measured();
    const { edges } = toFlow(toast1degas);
    const at = await arrange(nodes, edges);
    expect([...at.keys()].toSorted()).toEqual(nodes.map(({ id }) => id).toSorted());

    const box = (node: ArrangeNode) => ({ ...at.get(node.id)!, width: node.width, height: node.height });
    const boxes = nodes.map(box);
    for (const [i, a] of boxes.entries())
      for (const b of boxes.slice(i + 1))
        expect(a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height).toBe(false);

    const byId = new Map(nodes.map((node) => [node.id, box(node)]));
    for (const { source, target } of edges) expect(byId.get(source)!.x + byId.get(source)!.width).toBeLessThan(byId.get(target)!.x);

    const right = (boxes: { x: number; width: number }[]) => Math.max(...boxes.map(({ x, width }) => x + width));
    const grid = toFlow(toast1degas).nodes.map(({ id, position }) => ({ x: position.x, width: byId.get(id)!.width }));
    expect(right(boxes)).toBeLessThan(right(grid));
  });

  test("a chain lines up by the nodes' tops, not by the output in the bottom-right corner", async () => {
    const node = (id: string, height: number): ArrangeNode => ({
      id,
      width: 190,
      height,
      handles: [
        { id: null, type: "target", side: "left", y: 10 },
        { id: null, type: "source", side: "right", y: height - 2 },
      ],
    });
    const at = await arrange(
      [node("a", 60), node("b", 140), node("c", 90)],
      [
        { id: "a-b", source: "a", target: "b" },
        { id: "b-c", source: "b", target: "c" },
      ],
    );
    expect(at.get("b")!.y).toBe(at.get("a")!.y);
    expect(at.get("c")!.y).toBe(at.get("a")!.y);
  });

  test("a node without measured handles still gets a place", async () => {
    const at = await arrange(
      [
        { id: "a", width: 100, height: 50, handles: [] },
        { id: "b", width: 100, height: 50, handles: [] },
      ],
      [{ id: "a-b", source: "a", target: "b" }],
    );
    expect(at.get("a")!.x + 100).toBeLessThan(at.get("b")!.x);
  });
});
