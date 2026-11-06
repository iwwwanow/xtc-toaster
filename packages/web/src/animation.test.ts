import { describe, expect, test } from "bun:test";
import { TOAST_GRAPH_VERSION, type AnimationTrack, type ToastGraph } from "@xtc-toaster/contract";
import {
  addKey,
  addTrack,
  clampPlayhead,
  keyValueAt,
  moveKey,
  nextFrame,
  paramValue,
  removeKey,
  removeTrack,
  rulerLabels,
  seedTrack,
  setKeyValue,
  timelineEnd,
  trackName,
  withoutAnimation,
} from "./animation";
import type { FlowNode } from "./graph";

const track = (): AnimationTrack => ({ id: "t", keys: [{ frame: 0, value: 0 }, { frame: 10, value: 10 }] });
const moveNode = { id: "m", type: "move", position: { x: 0, y: 0 }, data: { x: 7, y: 0 } } as FlowNode;

describe("tracks", () => {
  test("a new track goes on top, empty, with an id not in use", () => {
    const added = addTrack(addTrack([]));
    expect(added.map(({ id }) => id)).toEqual(["track-2", "track-1"]);
    expect(added[0]!.keys).toEqual([]);
    const gap = addTrack(removeTrack(added, "track-1"));
    expect(new Set(gap.map(({ id }) => id)).size).toBe(gap.length);
  });

  test("the name: the param from the link, no link or a removed source — from the id", () => {
    const link = { id: "e", source: "m", sourceHandle: "x", target: "a", targetHandle: "track-3" };
    expect(trackName([moveNode], [link], "a", "track-3")).toBe("move.x");
    expect(trackName([moveNode], [], "a", "track-3")).toBe("track 3");
    expect(trackName([], [link], "a", "track-3")).toBe("track 3");
  });
});

describe("keys", () => {
  test("added in frame order; a taken frame keeps its key", () => {
    const [added] = addKey([track()], "t", 5, 3);
    expect(added!.keys.map(({ frame }) => frame)).toEqual([0, 5, 10]);
    expect(addKey([track()], "t", 10, 99)[0]!.keys.at(-1)).toEqual({ frame: 10, value: 10 });
  });

  test("removed, value changed — only that key", () => {
    expect(removeKey([track()], "t", 0)[0]!.keys).toEqual([{ frame: 10, value: 10 }]);
    expect(setKeyValue([track()], "t", 10, 5)[0]!.keys).toEqual([{ frame: 0, value: 0 }, { frame: 10, value: 5 }]);
  });

  test("moved to a free frame; a taken one refuses, its own one is fine", () => {
    expect(moveKey([track()], "t", 10, 3)![0]!.keys).toEqual([{ frame: 0, value: 0 }, { frame: 3, value: 10 }]);
    expect(moveKey([track()], "t", 10, 0)).toBeNull();
    expect(moveKey([track()], "t", 10, 10)![0]!.keys).toEqual(track().keys);
  });

  test("a link seeds only an empty track", () => {
    expect(seedTrack([{ id: "t", keys: [] }], "t", 4, 7)[0]!.keys).toEqual([{ frame: 4, value: 7 }]);
    expect(seedTrack([track()], "t", 4, 7)[0]!.keys).toEqual(track().keys);
  });

  test("a new key takes the value on that frame, an empty track — the param's own", () => {
    expect(keyValueAt(track(), 5, 99)).toBe(5);
    expect(keyValueAt({ id: "t", keys: [] }, 5, 99)).toBe(99);
    expect(keyValueAt({ id: "t", keys: [] }, 5, null)).toBeNull();
    expect(paramValue([moveNode], "m", "x")).toBe(7);
    expect(paramValue([moveNode], "m", "nope")).toBeNull();
  });
});

describe("timeline", () => {
  test("goes to the frames or the last key past them", () => {
    expect(timelineEnd({ fps: 24, frames: 48, tracks: [track()] })).toBe(48);
    expect(timelineEnd({ fps: 24, frames: 5, tracks: [track()] })).toBe(11);
    expect(timelineEnd({ fps: 24, frames: 5, tracks: [] })).toBe(5);
  });

  test("the playhead stops at the last rendered frame", () => {
    expect(clampPlayhead(100, 48)).toBe(47);
    expect(clampPlayhead(-1, 48)).toBe(0);
    expect(clampPlayhead(3, 48)).toBe(3);
  });

  test("next frame: one on, the last back to the first, a playhead past the end from the last", () => {
    expect(nextFrame(0, 48)).toBe(1);
    expect(nextFrame(47, 48)).toBe(0);
    expect(nextFrame(100, 48)).toBe(0);
    expect(nextFrame(0, 1)).toBe(0);
  });

  test("ruler labels: every 5 frames, bounded on a far key", () => {
    expect(rulerLabels(12)).toEqual([0, 5, 10]);
    expect(rulerLabels(1_000_000_000).length).toBeLessThanOrEqual(200);
  });
});

test("withoutAnimation keeps only what the picture depends on", () => {
  const graph: ToastGraph = {
    version: TOAST_GRAPH_VERSION,
    nodes: [
      { id: "in", type: "input", data: { imageId: null } },
      { id: "m", type: "move", data: { x: 1, y: 2 } },
      { id: "a", type: "animation", data: { fps: 24, frames: 2, tracks: [{ id: "t", keys: [] }] } },
      { id: "out", type: "output", data: {} },
    ],
    edges: [
      { id: "1", source: "in", target: "m" },
      { id: "2", source: "m", target: "out" },
      { id: "3", source: "m", sourceHandle: "x", target: "a", targetHandle: "t" },
    ],
  };
  const stripped = withoutAnimation(graph);
  expect(stripped.nodes.map(({ id }) => id)).toEqual(["in", "m", "out"]);
  expect(stripped.edges.map(({ id }) => id)).toEqual(["1", "2"]);
});
