import { describe, expect, test } from "bun:test";
import { drivenValues, graphAtFrame, timelineWindow, paramSources, valueAtFrame } from "./animation";
import { TOAST_GRAPH_VERSION } from "./constants";
import { AnimationTrackSchema, parseToastGraph, type GraphNode, type ToastGraph } from "./graph";
import { PARAMS } from "./params";

const keys = (...pairs: [frame: number, value: number][]) => pairs.map(([frame, value]) => ({ frame, value }));

describe("valueAtFrame", () => {
  test.each([
    ["on the first key", 0, 0],
    ["between keys", 5, 50],
    ["on a key in the middle", 10, 100],
    ["between the next pair", 15, 75],
    ["on the last key", 20, 50],
  ])("%s", (_, frame, value) => {
    expect(valueAtFrame(keys([0, 0], [10, 100], [20, 50]), frame)).toBe(value);
  });

  test.each([
    // 0 → 100 over 10 frames
    ["linear", [0, 25, 50, 75, 100]],
    ["constant", [0, 0, 0, 0, 100]],
    ["ease-in", [0, 1.5625, 12.5, 42.1875, 100]],
    ["ease-out", [0, 57.8125, 87.5, 98.4375, 100]],
    ["ease-in-out", [0, 6.25, 50, 93.75, 100]],
  ] as const)("%s: frames 0, 2.5, 5, 7.5, 10", (interpolation, values) => {
    expect([0, 2.5, 5, 7.5, 10].map((frame) => valueAtFrame(keys([0, 0], [10, 100]), frame, interpolation))).toEqual([...values]);
  });

  test("the track's interpolation acts between every two keys; a track takes one or none", () => {
    expect([5, 15].map((frame) => valueAtFrame(keys([0, 0], [10, 100], [20, 0]), frame, "constant"))).toEqual([0, 100]);
    expect(AnimationTrackSchema.safeParse({ id: "t", keys: [], interpolation: "ease-in" }).success).toBe(true);
    expect(AnimationTrackSchema.safeParse({ id: "t", keys: [] }).success).toBe(true);
    expect(AnimationTrackSchema.safeParse({ id: "t", keys: [], interpolation: "bounce" }).success).toBe(false);
  });

  test("animatedValues reads the track's interpolation", () => {
    const graph: ToastGraph = {
      version: TOAST_GRAPH_VERSION,
      nodes: [
        { id: "in", type: "input", data: { imageId: null } },
        { id: "op", type: "opacity", data: { opacity: 1 } },
        { id: "out", type: "output", data: {} },
        { id: "an", type: "animation", data: { fps: 12, frames: 11, tracks: [{ id: "t", keys: keys([0, 0], [10, 1]), interpolation: "ease-in" }] } },
      ],
      edges: [
        { id: "1", source: "in", target: "op" },
        { id: "2", source: "op", target: "out" },
        { id: "3", source: "op", sourceHandle: "opacity", target: "an", targetHandle: "t" },
      ],
    };
    expect(graphAtFrame(graph, 5).nodes.find(({ id }) => id === "op")?.data).toEqual({ opacity: 0.125 });
  });

  test("keeps the nearest key's value outside the keys", () => {
    const track = keys([5, 10], [10, 20]);
    expect(valueAtFrame(track, 0)).toBe(10);
    expect(valueAtFrame(track, 47)).toBe(20);
  });

  test("one key holds on every frame", () => {
    expect(valueAtFrame(keys([3, 7]), 0)).toBe(7);
    expect(valueAtFrame(keys([3, 7]), 9)).toBe(7);
  });

  test("no keys — no value", () => {
    expect(valueAtFrame([], 0)).toBeNull();
  });

  test("keys in any order", () => {
    expect(valueAtFrame(keys([10, 100], [0, 0]), 5)).toBe(50);
  });

  test("a falling track", () => {
    expect(valueAtFrame(keys([0, 100], [10, 0]), 5)).toBe(50);
  });

  test("two keys of one value stay exactly on it", () => {
    for (let frame = 0; frame <= 7; frame++) expect(valueAtFrame(keys([0, 0.1], [7, 0.1]), frame)).toBe(0.1);
  });

  test("float noise stays within the keys, for every frame", () => {
    for (const [from, to] of [[0.1, 3], [3, 0.1], [-85, 85], [0.1, 0.7]] as const) {
      for (let frame = 0; frame <= 97; frame++) {
        const value = valueAtFrame(keys([0, from], [97, to]), frame)!;
        expect(value).toBeGreaterThanOrEqual(Math.min(from, to));
        expect(value).toBeLessThanOrEqual(Math.max(from, to));
      }
    }
  });
});

describe("graphAtFrame", () => {
  const animated = (): ToastGraph => ({
    version: TOAST_GRAPH_VERSION,
    nodes: [
      { id: "in", type: "input", data: { imageId: null } },
      { id: "mv", type: "move", data: { x: 1, y: 2 } },
      { id: "op", type: "opacity", data: { opacity: 0.5 } },
      {
        id: "anim",
        type: "animation",
        data: {
          fps: 24,
          frames: 11,
          tracks: [
            { id: "t-x", keys: keys([0, 0], [10, 10]) },
            { id: "t-y", keys: keys([0, -10], [10, 10]) },
            { id: "t-empty", keys: [] },
            { id: "t-unlinked", keys: keys([0, 99]) },
          ],
        },
      },
      { id: "out", type: "output", data: {} },
    ],
    edges: [
      { id: "1", source: "in", target: "mv" },
      { id: "2", source: "mv", target: "out" },
      { id: "3", source: "mv", sourceHandle: "x", target: "anim", targetHandle: "t-x" },
      { id: "4", source: "mv", sourceHandle: "y", target: "anim", targetHandle: "t-y" },
      { id: "5", source: "op", sourceHandle: "opacity", target: "anim", targetHandle: "t-empty" },
    ],
  });
  const data = (graph: ToastGraph, id: string) => graph.nodes.find((node) => node.id === id)!.data;

  test("puts the values of every track of a node into its data", () => {
    expect(data(graphAtFrame(animated(), 5), "mv")).toEqual({ x: 5, y: 0 });
  });

  test("a track without keys leaves data as is", () => {
    expect(data(graphAtFrame(animated(), 5), "op")).toEqual({ opacity: 0.5 });
  });

  test("a track without a link changes nothing", () => {
    const { nodes } = graphAtFrame(animated(), 5);
    expect(nodes.flatMap(({ data }) => Object.values(data))).not.toContain(99);
  });

  test("the given graph stays untouched", () => {
    const graph = animated();
    graphAtFrame(graph, 5);
    expect(graph).toEqual(animated());
  });

  const withTrack = (trackKeys: { frame: number; value: number }[], frames = 11): ToastGraph => ({
    version: TOAST_GRAPH_VERSION,
    nodes: [
      { id: "sc", type: "scale", data: { x: 1, y: 1 } },
      { id: "anim", type: "animation", data: { fps: 24, frames, tracks: [{ id: "t", keys: trackKeys }] } },
    ],
    edges: [{ id: "1", source: "sc", sourceHandle: "x", target: "anim", targetHandle: "t" }],
  });

  test("a key out of the param's bounds is clamped on the frame, the key itself stays", () => {
    const graph = withTrack(keys([0, 50], [10, -50]));
    expect(data(graphAtFrame(graph, 0), "sc")).toEqual({ x: PARAMS.scale.x.max, y: 1 });
    expect(data(graphAtFrame(graph, 10), "sc")).toEqual({ x: PARAMS.scale.x.min, y: 1 });
    expect(data(graphAtFrame(graph, 0), "anim")).toEqual(data(graph, "anim"));
  });

  test("a key past the last frame still pulls the frames before it", () => {
    expect(data(graphAtFrame(withTrack(keys([0, 1], [20, 3]), 11), 10), "sc")).toEqual({ x: 2, y: 1 });
  });

  test("a graph without an animation node comes back as it is", () => {
    const graph: ToastGraph = { version: TOAST_GRAPH_VERSION, nodes: animated().nodes.filter(({ type }) => type !== "animation"), edges: [] };
    expect(graphAtFrame(graph, 3)).toBe(graph);
  });

  test("the frame is a graph the schema takes — on every frame, bounds included", () => {
    const bounds = PARAMS.scale.x;
    const nodes: GraphNode[] = [
      { id: "in", type: "input", data: { imageId: null } },
      { id: "sc", type: "scale", data: { x: 1, y: 1 } },
      { id: "anim", type: "animation", data: { fps: 24, frames: 98, tracks: [{ id: "t", keys: keys([0, bounds.min], [97, bounds.max]) }] } },
      { id: "out", type: "output", data: {} },
    ];
    const graph: ToastGraph = {
      version: TOAST_GRAPH_VERSION,
      nodes,
      edges: [{ id: "1", source: "sc", sourceHandle: "x", target: "anim", targetHandle: "t" }],
    };
    for (let frame = 0; frame < 98; frame++) expect(() => parseToastGraph(graphAtFrame(graph, frame))).not.toThrow();
  });
});

describe("graphAtFrame through a delay", () => {
  // x and y of one move node through one delay of 4 frames; the scale's x through two delays (4 + 2)
  const delayed = (frames = 4): ToastGraph => ({
    version: TOAST_GRAPH_VERSION,
    nodes: [
      { id: "mv", type: "move", data: { x: 0, y: 0 } },
      { id: "sc", type: "scale", data: { x: 1, y: 1 } },
      { id: "dl", type: "delay", data: { frames, rows: [{ id: "r1" }, { id: "r2" }, { id: "r3" }, { id: "free" }] } },
      { id: "dl2", type: "delay", data: { frames: 2, rows: [{ id: "r1" }] } },
      {
        id: "anim",
        type: "animation",
        data: {
          fps: 24,
          frames: 20,
          tracks: [
            { id: "t-x", keys: keys([0, 0], [10, 10]) },
            { id: "t-y", keys: keys([0, 0], [10, 20]) },
            { id: "t-sc", keys: keys([0, 1], [10, 2]) },
          ],
        },
      },
    ],
    edges: [
      { id: "1", source: "mv", sourceHandle: "x", target: "dl", targetHandle: "r1" },
      { id: "2", source: "dl", sourceHandle: "r1", target: "anim", targetHandle: "t-x" },
      { id: "3", source: "mv", sourceHandle: "y", target: "dl", targetHandle: "r2" },
      { id: "4", source: "dl", sourceHandle: "r2", target: "anim", targetHandle: "t-y" },
      { id: "5", source: "sc", sourceHandle: "x", target: "dl", targetHandle: "r3" },
      { id: "6", source: "dl", sourceHandle: "r3", target: "dl2", targetHandle: "r1" },
      { id: "7", source: "dl2", sourceHandle: "r1", target: "anim", targetHandle: "t-sc" },
    ],
  });
  const data = (graph: ToastGraph, id: string) => graph.nodes.find((node) => node.id === id)!.data;

  test("every param through it reads its track `frames` later", () => {
    expect(data(graphAtFrame(delayed(), 9), "mv")).toEqual({ x: 5, y: 10 });
  });

  test("before the shift the first key holds", () => {
    expect(data(graphAtFrame(delayed(), 2), "mv")).toEqual({ x: 0, y: 0 });
  });

  test("two delays add up", () => {
    expect(data(graphAtFrame(delayed(), 11), "sc")).toEqual({ x: 1.5, y: 1 });
  });

  test("a negative shift plays earlier", () => {
    expect(data(graphAtFrame(delayed(-4), 1), "mv")).toEqual({ x: 5, y: 10 });
  });

  test("a cycling timeline: before frame 0 a delay reads the cycle before, past the end — the one after", () => {
    const cycling = (frames = 4) => {
      const graph = delayed(frames);
      const anim = graph.nodes.find(({ type }) => type === "animation")!;
      if (anim.type === "animation") anim.data.cycle = true;
      return graph;
    };
    // frame 2 − 4 → frame 18 of 20: the track holds 10 there (y — 20)
    expect(data(graphAtFrame(cycling(), 2), "mv")).toEqual({ x: 10, y: 20 });
    // within the timeline nothing changes
    expect(data(graphAtFrame(cycling(), 9), "mv")).toEqual({ x: 5, y: 10 });
    // frame 18 + 4 → frame 2
    expect(data(graphAtFrame(cycling(-4), 18), "mv")).toEqual({ x: 2, y: 4 });
  });

  test("a cycling window goes round its own frames, not from 0", () => {
    const graph = delayed();
    const anim = graph.nodes.find(({ type }) => type === "animation")!;
    // the window 8–11: frame 9 − 4 → 5, before it → 5 + 4 = frame 9 of the cycle before (x: 9)
    if (anim.type === "animation") Object.assign(anim.data, { start: 8, frames: 4, cycle: true });
    expect(data(graphAtFrame(graph, 9), "mv")).toEqual({ x: 9, y: 18 });
    // frame 12 − 4 → 8, inside: as it is
    expect(data(graphAtFrame(graph, 12), "mv")).toEqual({ x: 8, y: 16 });
  });

  test("a cycling timeline wraps a delayed value's track too", () => {
    const graph: ToastGraph = {
      version: TOAST_GRAPH_VERSION,
      nodes: [
        { id: "mv", type: "move", data: { x: 0, y: 0 } },
        { id: "v", type: "value", data: { value: 0 } },
        { id: "dl", type: "delay", data: { frames: 4, rows: [{ id: "r1" }] } },
        { id: "anim", type: "animation", data: { fps: 24, frames: 20, cycle: true, tracks: [{ id: "t", keys: keys([0, 0], [10, 50]) }] } },
      ],
      edges: [
        { id: "1", source: "mv", sourceHandle: "x", target: "dl", targetHandle: "r1" },
        { id: "2", source: "dl", sourceHandle: "r1", target: "v" },
        { id: "3", source: "v", sourceHandle: "value", target: "anim", targetHandle: "t" },
      ],
    };
    expect(data(graphAtFrame(graph, 2), "mv")).toEqual({ x: 50, y: 0 });
  });

  test("the source of a link: the param behind the delays and their shift; a row nothing goes into — none", () => {
    const sourceOf = paramSources(delayed());
    expect(sourceOf("dl", "r1")).toEqual({ node: "mv", param: "x", shift: 4 });
    expect(sourceOf("dl2", "r1")).toEqual({ node: "sc", param: "x", shift: 6 });
    expect(sourceOf("mv", "x")).toEqual({ node: "mv", param: "x", shift: 0 });
    expect(sourceOf("dl", "free")).toBeNull();
  });
});

describe("graphAtFrame with a value", () => {
  // move.x, rotate.angle and opacity into one value; a second value wired into the first
  const valued = (number = 45, animated = false): ToastGraph => ({
    version: TOAST_GRAPH_VERSION,
    nodes: [
      { id: "mv", type: "move", data: { x: 0, y: 0 } },
      { id: "rt", type: "rotate", data: { angle: 0 } },
      { id: "op", type: "opacity", data: { opacity: 0.5 } },
      { id: "v", type: "value", data: { value: number } },
      ...(animated
        ? ([{ id: "anim", type: "animation", data: { fps: 24, frames: 20, tracks: [{ id: "t", keys: keys([0, 0], [10, 100]) }] } }] as GraphNode[])
        : []),
    ],
    edges: [
      { id: "1", source: "mv", sourceHandle: "x", target: "v" },
      { id: "2", source: "rt", sourceHandle: "angle", target: "v" },
      { id: "3", source: "op", sourceHandle: "opacity", target: "v" },
      ...(animated ? [{ id: "4", source: "v", sourceHandle: "value", target: "anim", targetHandle: "t" }] : []),
    ],
  });
  const data = (graph: ToastGraph, id: string) => graph.nodes.find((node) => node.id === id)!.data;

  test("every param wired into it takes its number, clamped to its own bounds", () => {
    const graph = graphAtFrame(valued(45), 0);
    expect(data(graph, "mv")).toEqual({ x: 45, y: 0 });
    expect(data(graph, "rt")).toEqual({ angle: 45 });
    expect(data(graph, "op")).toEqual({ opacity: 1 });
    expect(data(graphAtFrame(valued(-500), 0), "rt")).toEqual({ angle: -180 });
  });

  test("works without an animation node — a still render takes it too", () => {
    expect(drivenValues(valued(20), 0).get("mv")).toEqual({ x: 20 });
  });

  test("an animated value moves every param wired into it", () => {
    expect(data(graphAtFrame(valued(0, true), 5), "mv")).toEqual({ x: 50, y: 0 });
    expect(data(graphAtFrame(valued(0, true), 5), "rt")).toEqual({ angle: 50 });
  });

  test("value → value: the params of both take the last one's number", () => {
    const graph = valued(45);
    graph.nodes.push({ id: "v2", type: "value", data: { value: -7 } });
    graph.edges.push({ id: "5", source: "v", sourceHandle: "value", target: "v2" });
    const at = graphAtFrame(graph, 0);
    expect(data(at, "mv")).toEqual({ x: -7, y: 0 });
    expect(data(at, "v")).toEqual({ value: -7 });
  });

  test("a param through a delay takes an animated value's number that many frames later", () => {
    // move.x straight in, move.y through a delay of 3; the value goes 0 → 100 over frames 0…10
    const graph = valued(0, true);
    graph.nodes.push({ id: "dl", type: "delay", data: { frames: 3, rows: [{ id: "r1" }] } });
    graph.edges.push({ id: "5", source: "mv", sourceHandle: "y", target: "dl", targetHandle: "r1" }, { id: "6", source: "dl", sourceHandle: "r1", target: "v" });
    expect(data(graphAtFrame(graph, 5), "mv")).toEqual({ x: 50, y: 20 });
    expect(data(graphAtFrame(graph, 2), "mv")).toEqual({ x: 20, y: 0 });
  });

  test("value → delay → value: the first one takes the last one's number that many frames later", () => {
    const graph = valued(45, true);
    // the animated value's own track drives v2 now: v (and its params) → delay of 2 → v2
    graph.nodes.push({ id: "v2", type: "value", data: { value: 0 } }, { id: "dl", type: "delay", data: { frames: 2, rows: [{ id: "r1" }] } });
    graph.edges = graph.edges.map((edge) => (edge.id === "4" ? { ...edge, source: "v2" } : edge));
    graph.edges.push({ id: "5", source: "v", sourceHandle: "value", target: "dl", targetHandle: "r1" }, { id: "6", source: "dl", sourceHandle: "r1", target: "v2" });
    expect(data(graphAtFrame(graph, 7), "v")).toEqual({ value: 50 });
    expect(data(graphAtFrame(graph, 7), "mv")).toEqual({ x: 50, y: 0 });
  });

  test("no params wired in — the graph as is", () => {
    const graph = { ...valued(45), edges: [] };
    expect(graphAtFrame(graph, 0)).toBe(graph);
  });
});

describe("graphAtFrame with a factor", () => {
  // rotate.angle (−180…180), blur.radius (0…20) and opacity (0…1) into one factor
  const factored = (factor = 0.5): ToastGraph => ({
    version: TOAST_GRAPH_VERSION,
    nodes: [
      { id: "rt", type: "rotate", data: { angle: 15 } },
      { id: "bl", type: "blur", data: { radius: 4 } },
      { id: "op", type: "opacity", data: { opacity: 0.5 } },
      { id: "f", type: "factor", data: { factor } },
    ],
    edges: [
      { id: "1", source: "rt", sourceHandle: "angle", target: "f" },
      { id: "2", source: "bl", sourceHandle: "radius", target: "f" },
      { id: "3", source: "op", sourceHandle: "opacity", target: "f" },
    ],
  });
  const data = (graph: ToastGraph, id: string) => graph.nodes.find((node) => node.id === id)!.data;

  test("every param wired into it takes that share of its own range", () => {
    const graph = graphAtFrame(factored(0.25), 0);
    expect(data(graph, "rt")).toEqual({ angle: -90 });
    expect(data(graph, "bl")).toEqual({ radius: 5 });
    expect(data(graph, "op")).toEqual({ opacity: 0.25 });
  });

  test("0 and 1 are the ends of each range", () => {
    expect(data(graphAtFrame(factored(0), 0), "rt")).toEqual({ angle: -180 });
    expect(data(graphAtFrame(factored(1), 0), "bl")).toEqual({ radius: 20 });
  });

  test("an animated factor moves them all", () => {
    const graph = factored(0);
    graph.nodes.push({ id: "anim", type: "animation", data: { fps: 24, frames: 20, tracks: [{ id: "t", keys: keys([0, 0], [10, 1]) }] } });
    graph.edges.push({ id: "4", source: "f", sourceHandle: "factor", target: "anim", targetHandle: "t" });
    expect(data(graphAtFrame(graph, 5), "bl")).toEqual({ radius: 10 });
    expect(data(graphAtFrame(graph, 5), "op")).toEqual({ opacity: 0.5 });
  });

  test("a value wired into a factor gives it its number, clamped to 0…1; a factor into a value — a share of ±1000", () => {
    const graph = factored(0.5);
    graph.nodes.push({ id: "v", type: "value", data: { value: 0.75 } });
    graph.edges.push({ id: "4", source: "f", sourceHandle: "factor", target: "v" });
    expect(data(graphAtFrame(graph, 0), "op")).toEqual({ opacity: 0.75 });
    const back = factored(0.5);
    back.nodes.push({ id: "v", type: "value", data: { value: 0 } }, { id: "mv", type: "move", data: { x: 0, y: 0 } });
    back.edges.push({ id: "4", source: "v", sourceHandle: "value", target: "f" }, { id: "5", source: "mv", sourceHandle: "x", target: "v" });
    // the value's own param takes the half of −1000…1000 — 0; move.x takes the value's 0
    expect(data(graphAtFrame(back, 0), "mv")).toEqual({ x: 0, y: 0 });
    expect(data(graphAtFrame(back, 0), "v")).toEqual({ value: 0 });
  });
});

describe("timelineWindow", () => {
  test("frames from start (absent — 0), the last one included", () => {
    expect(timelineWindow({ frames: 24 })).toEqual({ first: 0, last: 23, count: 24 });
    expect(timelineWindow({ start: 23, frames: 25 })).toEqual({ first: 23, last: 47, count: 25 });
  });
});
