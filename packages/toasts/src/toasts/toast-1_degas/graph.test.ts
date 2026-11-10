import { describe, expect, test } from "bun:test";
import { graphAtFrame, parseToastGraph, validateGraph, type GraphNode } from "@xtc-toaster/contract";
import json from "./toast.json";
import { toast1degas } from "./graph";

describe("toast-1_degas graph", () => {
  test("the schema accepts toast.json, the graph is valid", () => {
    expect(() => parseToastGraph(json)).not.toThrow();
    expect(validateGraph(toast1degas)).toBeNull();
  });

  test("is a preset without a picture", () => {
    expect(toast1degas.nodes.find((node) => node.type === "input")?.data).toEqual({ imageId: null });
  });

  test("the script's 7 layers, top first, lch-hue on the blue one", () => {
    const layersNode = toast1degas.nodes.find((node) => node.type === "layers");
    expect(layersNode?.type === "layers" && layersNode.data.layers.map(({ name, blendMode }) => [name, blendMode])).toEqual([
      ["white", "normal"],
      ["red", "normal"],
      ["purple", "normal"],
      ["blue hue", "lch-hue"],
      ["light gray", "normal"],
      ["blurred", "normal"],
      ["dark gray", "normal"],
    ]);
  });

  // the script's formulas at t = frame / 24, in contract percent: corners gap = 11 * g %, move = tx * t %
  const scriptAt = (frame: number) => {
    const t = frame / 24;
    const corners = (g: number) => ({
      topLeftX: 22 * g, topLeftY: 22 * g, topRightX: 100 - 33 * g, topRightY: 33 * g,
      bottomRightX: 100 - 11 * g, bottomRightY: 100 - 11 * g, bottomLeftX: 0, bottomLeftY: 100,
    });
    return {
      "purple-corners": corners(-0.2 * t), "purple-move": { x: 2 * t, y: -2 * t },
      "red-corners": corners(-0.1 * t), "red-move": { x: t, y: -t },
      "white-corners": corners(-0.05 * t), "white-move": { x: t, y: -t },
    };
  };
  const dataOf = (nodes: GraphNode[], id: string) => nodes.find((node) => node.id === id)?.data as Record<string, number>;

  test("animated as the script: 24 linked tracks, 24 frames at 36 fps, a 15 s loop", () => {
    const anim = toast1degas.nodes.find((node) => node.type === "animation");
    expect(anim?.type === "animation" && anim.data).toMatchObject({ fps: 36, frames: 24 });
    // the loop is the toast's export setting: whole cycles, as the script rounds it
    expect(toast1degas.export).toEqual({ loop: { seconds: 15 } });
    const tracks = anim?.type === "animation" ? anim.data.tracks : [];
    expect(tracks).toHaveLength(24);
    const linked = new Set(toast1degas.edges.filter(({ target }) => target === anim?.id).map(({ targetHandle }) => targetHandle));
    expect(tracks.every(({ id }) => linked.has(id))).toBe(true);
  });

  test("every frame matches the script's formulas, frame 0 is the still graph", () => {
    expect(graphAtFrame(toast1degas, 0).nodes.map(({ data }) => data)).toEqual(toast1degas.nodes.map(({ data }) => data));
    for (const frame of [0, 7, 23]) {
      const { nodes } = graphAtFrame(toast1degas, frame);
      for (const [id, expected] of Object.entries(scriptAt(frame))) {
        const data = dataOf(nodes, id);
        for (const [key, value] of Object.entries(expected)) expect(data[key]).toBeCloseTo(value, 5);
      }
    }
  });
});
