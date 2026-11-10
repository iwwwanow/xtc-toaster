import { describe, expect, test } from "bun:test";
import { TOAST_GRAPH_VERSION, type AnimationNode, type ToastGraph } from "@xtc-toaster/contract";
import { animationLength, renderAnimation } from "./render-animation";
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

describe("animationLength", () => {
  // a cycle of 24 frames at 36 fps is 0.67 s: 15 s → 22.5 → 23 cycles (the degas script's rounding)
  const degas = { fps: 36, frames: 24 };

  test("gif: no loop → forever, reps and seconds → plays of one cycle", () => {
    expect(animationLength(degas)).toEqual({});
    expect(animationLength(degas, { loop: { reps: 3 } })).toEqual({ plays: 3 });
    expect(animationLength(degas, { format: "gif", loop: { seconds: 15 } })).toEqual({ plays: 23 });
    expect(animationLength(degas, { loop: { seconds: 15, wholeCycles: true } })).toEqual({ plays: 23 });
    expect(animationLength({ fps: 12, frames: 24 }, { loop: { seconds: 0.1 } })).toEqual({ plays: 1 });
  });

  test("mp4: no loop → one cycle, reps and seconds → whole cycles as frames in the file", () => {
    expect(animationLength(degas, { format: "mp4" })).toEqual({});
    expect(animationLength(degas, { format: "mp4", loop: { reps: 1 } })).toEqual({});
    expect(animationLength(degas, { format: "mp4", loop: { reps: 3 } })).toEqual({ frames: 72 });
    expect(animationLength(degas, { format: "mp4", loop: { seconds: 15 } })).toEqual({ frames: 23 * 24 });
  });

  test("seconds without whole cycles → exactly that many frames, played once, in both formats", () => {
    const exact = { seconds: 15, wholeCycles: false };
    expect(animationLength(degas, { loop: exact })).toEqual({ frames: 540, plays: 1 });
    expect(animationLength(degas, { format: "mp4", loop: exact })).toEqual({ frames: 540, plays: 1 });
    // shorter than a cycle — the cycle cut; never zero frames
    expect(animationLength(degas, { loop: { seconds: 0.25, wholeCycles: false } })).toEqual({ frames: 9, plays: 1 });
    expect(animationLength(degas, { loop: { seconds: 0.001, wholeCycles: false } })).toEqual({ frames: 1, plays: 1 });
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
