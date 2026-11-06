import { describe, expect, test } from "bun:test";
import { TOAST_GRAPH_VERSION, type AnimationNode, type ToastGraph } from "@xtc-toaster/contract";
import { gifPlays, renderAnimation } from "./render-animation";
import { GraphError } from "./run-graph";

const animation = (data: Partial<AnimationNode["data"]> = {}): AnimationNode => ({
  id: "anim",
  type: "animation",
  data: { fps: 12, frames: 24, tracks: [], ...data },
});

const graph = (node?: AnimationNode): ToastGraph => ({
  version: TOAST_GRAPH_VERSION,
  nodes: [
    { id: "in", type: "input", data: { imageId: null } },
    { id: "out", type: "output", data: {} },
    ...(node ? [node] : []),
  ],
  edges: [{ id: "in-out", source: "in", target: "out" }],
});

describe("gifPlays", () => {
  test("no loop → forever, reps as is", () => {
    expect(gifPlays(animation().data)).toBeUndefined();
    expect(gifPlays(animation({ loop: { reps: 3 } }).data)).toBe(3);
  });

  test("seconds → whole cycles, at least one", () => {
    // a cycle of 24 frames at 36 fps is 0.67 s: 15 s → 22.5 → 23 (the degas script's rounding)
    expect(gifPlays(animation({ fps: 36, frames: 24, loop: { seconds: 15 } }).data)).toBe(23);
    expect(gifPlays(animation({ fps: 12, frames: 24, loop: { seconds: 0.1 } }).data)).toBe(1);
  });
});

describe("renderAnimation", () => {
  const options = (node?: AnimationNode, maxFrames?: number) => ({
    graph: graph(node),
    renderFrameTo: () => Promise.reject(new Error("must not render")),
    framesDir: "/nowhere",
    outputPath: "/nowhere/out.gif",
    maxFrames,
  });

  test("no animation node → a graph error, nothing rendered", async () => {
    expect(renderAnimation(options())).rejects.toThrow(GraphError);
  });

  test("more frames than the cap → a graph error on the node, nothing rendered", async () => {
    const error = await renderAnimation(options(animation({ frames: 49 }), 48)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GraphError);
    expect(error).toMatchObject({ nodeId: "anim", message: "frames: at most 48" });
  });
});
