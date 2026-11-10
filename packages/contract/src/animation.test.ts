import { describe, expect, test } from "bun:test";
import { graphAtFrame, paramSources, valueAtFrame } from "./animation";
import { TOAST_GRAPH_VERSION } from "./constants";
import { parseToastGraph, type GraphNode, type ToastGraph } from "./graph";
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

  test("the source of a link: the param behind the delays and their shift; a row nothing goes into — none", () => {
    const sourceOf = paramSources(delayed());
    expect(sourceOf("dl", "r1")).toEqual({ node: "mv", param: "x", shift: 4 });
    expect(sourceOf("dl2", "r1")).toEqual({ node: "sc", param: "x", shift: 6 });
    expect(sourceOf("mv", "x")).toEqual({ node: "mv", param: "x", shift: 0 });
    expect(sourceOf("dl", "free")).toBeNull();
  });
});
