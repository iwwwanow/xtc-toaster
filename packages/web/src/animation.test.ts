import { describe, expect, test } from "bun:test";
import { TOAST_GRAPH_VERSION, type AnimationTrack, type ToastGraph } from "@xtc-toaster/contract";
import {
  addKey,
  addTrack,
  clampPlayhead,
  hasAnimatedParams,
  keyValueAt,
  moveKey,
  nextFrame,
  paramValue,
  removeKey,
  removeTrack,
  rulerLabels,
  blockedFrames,
  dragKeyTo,
  moveKeys,
  trackGroups,
  groupKeyFrames,
  UNLINKED_GROUP,
  rulerStep,
  fitPxPerFrame,
  zoomPxPerFrame,
  ZOOM,
  frameAt,
  prevKeyFrame,
  nextKeyFrame,
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

  test("ruler labels: 1 / 2 / 5 / 10 … frames apart, at least 32 px, bounded on a far key", () => {
    expect(rulerLabels(12, 12)).toEqual([0, 5, 10]);
    expect(rulerLabels(4, 40)).toEqual([0, 1, 2, 3]);
    expect(rulerLabels(10, 16)).toEqual([0, 2, 4, 6, 8]);
    expect(rulerStep(4, 100)).toBe(10);
    expect(rulerLabels(1_000_000_000, 12).length).toBeLessThanOrEqual(200);
  });

  test("zoom: fit fills the width, Ctrl+wheel steps between the bounds or up to the fit", () => {
    expect(fitPxPerFrame(808, 24)).toBeCloseTo(33.67, 2);
    expect(fitPxPerFrame(808, 10_000)).toBe(ZOOM.min);
    expect(zoomPxPerFrame(10, 1, 10)).toBe(12.5);
    expect(zoomPxPerFrame(10, -1, 10)).toBe(8);
    expect(zoomPxPerFrame(ZOOM.max, 1, 10)).toBe(ZOOM.max);
    expect(zoomPxPerFrame(ZOOM.min, -1, 10)).toBe(ZOOM.min);
    // two frames fit at 404 px: zooming out from there is allowed, past it — not
    expect(zoomPxPerFrame(404, 1, 404)).toBe(404);
    expect(frameAt(100, 33)).toBe(3);
    expect(frameAt(-5, 33)).toBe(0);
  });

  test("jump to keyframe: the nearest key of any track, only among the rendered frames", () => {
    const data = {
      frames: 20,
      tracks: [
        { id: "a", keys: [{ frame: 0, value: 0 }, { frame: 10, value: 1 }] },
        { id: "b", keys: [{ frame: 4, value: 0 }, { frame: 30, value: 1 }] },
      ],
    };
    expect(nextKeyFrame(data, 0)).toBe(4);
    expect(nextKeyFrame(data, 4)).toBe(10);
    expect(nextKeyFrame(data, 10)).toBeNull(); // 30 is past the rendered frames
    expect(prevKeyFrame(data, 10)).toBe(4);
    expect(prevKeyFrame(data, 7)).toBe(4);
    expect(prevKeyFrame(data, 0)).toBeNull();
  });
});

const animatedGraph = (keys: AnimationTrack["keys"], linked = true): ToastGraph => ({
  version: TOAST_GRAPH_VERSION,
  nodes: [
    { id: "in", type: "input", data: { imageId: null } },
    { id: "m", type: "move", data: { x: 1, y: 2 } },
    { id: "a", type: "animation", data: { fps: 24, frames: 2, tracks: [{ id: "t", keys }] } },
    { id: "out", type: "output", data: {} },
  ],
  edges: [
    { id: "1", source: "in", target: "m" },
    { id: "2", source: "m", target: "out" },
    ...(linked ? [{ id: "3", source: "m", sourceHandle: "x", target: "a", targetHandle: "t" }] : []),
  ],
});

test("an export needs a linked track with keys", () => {
  expect(hasAnimatedParams(animatedGraph([{ frame: 5, value: 3 }]))).toBe(true);
  expect(hasAnimatedParams(animatedGraph([]))).toBe(false);
  expect(hasAnimatedParams(animatedGraph([{ frame: 5, value: 3 }], false))).toBe(false);
  expect(hasAnimatedParams({ ...animatedGraph([]), nodes: animatedGraph([]).nodes.filter(({ type }) => type !== "animation") })).toBe(false);
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
    export: { format: "mp4" },
  };
  const stripped = withoutAnimation(graph);
  expect(stripped.nodes.map(({ id }) => id)).toEqual(["in", "m", "out"]);
  expect(stripped.edges.map(({ id }) => id)).toEqual(["1", "2"]);
  // export settings change no picture — no render for them
  expect(stripped).not.toHaveProperty("export");
});

describe("track groups", () => {
  const node = (id: string, type: string) => ({ id, type, position: { x: 0, y: 0 }, data: {} }) as unknown as FlowNode;
  const link = (source: string, sourceHandle: string, track: string) =>
    ({ id: `${source}-${track}`, source, sourceHandle, target: "a", targetHandle: track }) as const;
  const t = (id: string, frames: number[] = []): AnimationTrack => ({ id, keys: frames.map((frame) => ({ frame, value: 0 })) });
  const nodes = [node("c1", "corners"), node("m", "move"), node("c2", "corners")];
  const tracks = [t("track-1", [0, 23]), t("track-2"), t("track-3", [5]), t("track-4", [0]), t("track-5", [0, 12])];
  const edges = [
    link("c1", "topLeftX", "track-1"),
    link("m", "x", "track-3"),
    link("c2", "topLeftY", "track-4"),
    link("c1", "topLeftY", "track-5"),
  ];

  test("a group per source node in the order of its first track, unlinked on top, numbered when a type repeats", () => {
    const groups = trackGroups(nodes, edges, "a", tracks);
    expect(groups.map(({ id, name }) => [id, name])).toEqual([
      [UNLINKED_GROUP, "unlinked"],
      ["c1", "corners 1"],
      ["m", "move"],
      ["c2", "corners 2"],
    ]);
    expect(groups[1]!.rows.map(({ name, index }) => [name, index])).toEqual([["topLeftX", 0], ["topLeftY", 4]]);
    expect(groups[0]!.rows.map(({ name }) => name)).toEqual(["track 2"]);
  });

  test("a link from a node that is gone — the track is unlinked", () => {
    expect(trackGroups([], edges, "a", tracks).map(({ id }) => id)).toEqual([UNLINKED_GROUP]);
  });

  test("the summary row: every frame a track of the group has a key on, once", () => {
    const corners1 = trackGroups(nodes, edges, "a", tracks).find(({ id }) => id === "c1")!;
    expect(groupKeyFrames(corners1)).toEqual([0, 12, 23]);
  });
});

describe("dragging keys", () => {
  const k = (...frames: number[]) => frames.map((frame) => ({ frame, value: frame }));
  const tracks: AnimationTrack[] = [
    { id: "a", keys: k(0, 10, 20) },
    { id: "b", keys: k(0, 15) },
    { id: "c", keys: k(5) },
  ];

  test("blocked: the other keys of the moved tracks that have a key on the frame", () => {
    expect([...blockedFrames(tracks, ["a"], 10)].toSorted((x, y) => x - y)).toEqual([0, 20]);
    // a group's summary diamond on 0: a and b move, c has no key there — it doesn't block
    expect([...blockedFrames(tracks, ["a", "b", "c"], 0)].toSorted((x, y) => x - y)).toEqual([10, 15, 20]);
  });

  test("a dragged key waits on the last free frame when the pointer is over a taken one, never below 0", () => {
    const blocked = new Set([0, 20]);
    expect(dragKeyTo(blocked, 10, 12)).toBe(12);
    expect(dragKeyTo(blocked, 19, 20)).toBe(19);
    expect(dragKeyTo(blocked, 19, 21)).toBe(21); // past it — free again
    expect(dragKeyTo(new Set(), 2, -3)).toBe(0);
  });

  test("moveKeys moves every track's key on the frame together, or nothing", () => {
    expect(moveKeys(tracks, ["a", "b", "c"], 0, 3)!.map(({ keys }) => keys.map(({ frame }) => frame))).toEqual([
      [3, 10, 20],
      [3, 15],
      [5],
    ]);
    expect(moveKeys(tracks, ["a", "b"], 0, 15)).toBeNull(); // b has a key on 15
    // the value goes with the key
    expect(moveKeys(tracks, ["a"], 10, 12)![0]!.keys).toEqual([{ frame: 0, value: 0 }, { frame: 12, value: 10 }, { frame: 20, value: 20 }]);
  });
});
