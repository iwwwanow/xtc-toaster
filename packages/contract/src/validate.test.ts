import { describe, expect, test } from "bun:test";
import { LAYER_NAME_MAX, TOAST_GRAPH_VERSION } from "./constants";
import { parseToastGraph, type LayerRow, type GraphEdge, type GraphNode } from "./graph";
import { INITIAL_DATA } from "./params";
import { validateGraph } from "./validate";

const input: GraphNode = { id: "in", type: "input", data: { imageId: null } };
const colorNoise: GraphNode = { id: "nz", type: "colorNoise", data: { deviationCoefficient: 0.5 } };
const nz2: GraphNode = { ...colorNoise, id: "nz2" };
const output: GraphNode = { id: "out", type: "output", data: {} };
const layersNode: GraphNode = {
  id: "cmp",
  type: "layers",
  data: { layers: [{ id: "top", blendMode: "add" }, { id: "bottom", blendMode: "normal" }] },
};

const edge = (source: string, target: string, targetHandle?: string): GraphEdge => ({
  id: `${source}-${target}${targetHandle ? `-${targetHandle}` : ""}`,
  source,
  target,
  ...(targetHandle && { targetHandle }),
});
const graph = (nodes: GraphNode[], edges: GraphEdge[]) => ({ version: TOAST_GRAPH_VERSION, nodes, edges });

// input fans out into both rows, one through hue noise
const fanOut = () =>
  graph(
    [input, colorNoise, layersNode, output],
    [edge("in", "nz"), edge("nz", "cmp", "top"), edge("in", "cmp", "bottom"), edge("cmp", "out")],
  );

describe("validateGraph", () => {
  test.each([
    ["a chain", graph([input, colorNoise, output], [edge("in", "nz"), edge("nz", "out")])],
    ["input → output", graph([input, output], [edge("in", "out")])],
    ["a fan-out into a layers node", fanOut()],
    ["a layers node with an unlinked row", graph([input, layersNode, output], [edge("in", "cmp", "top"), edge("cmp", "out")])],
    ["one source into both rows", graph([input, layersNode, output], [edge("in", "cmp", "top"), edge("in", "cmp", "bottom")])],
    ["unlinked nodes", graph([input, colorNoise, layersNode, output], [])],
    ["a dead-end fork", graph([input, colorNoise, output], [edge("in", "out"), edge("in", "nz")])],
  ])("accepts %s", (_, g) => {
    expect(validateGraph(g)).toBeNull();
  });

  test.each([
    ["a self-link", graph([input, colorNoise, output], [edge("nz", "nz")]), "nz"],
    ["a link into the input", graph([input, colorNoise, output], [edge("nz", "in")]), "in"],
    ["a link out of the output", graph([input, colorNoise, output], [edge("out", "nz")]), "out"],
    ["two links into one node", graph([input, colorNoise, output], [edge("in", "out"), edge("nz", "out")]), "out"],
    ["two links into one row", graph([input, colorNoise, layersNode, output], [edge("in", "cmp", "top"), edge("nz", "cmp", "top")]), "cmp"],
    ["a layers link without a row", graph([input, layersNode, output], [edge("in", "cmp")]), "cmp"],
    ["a layers link into a missing row", graph([input, layersNode, output], [edge("in", "cmp", "middle")]), "cmp"],
    ["a handle on a plain node", graph([input, colorNoise, output], [edge("in", "nz", "top")]), "nz"],
    ["a cycle on the way", graph([input, colorNoise, nz2, output], [edge("nz", "nz2"), edge("nz2", "nz"), edge("nz2", "out")]), "nz"],
    // the whole graph is checked, not only what the output pulls
    ["a cycle off the path", graph([input, colorNoise, nz2, output], [edge("in", "out"), edge("nz", "nz2"), edge("nz2", "nz")]), "nz"],
    [
      "a cycle through a layers node",
      graph([input, colorNoise, layersNode, output], [edge("in", "cmp", "bottom"), edge("cmp", "nz"), edge("nz", "cmp", "top")]),
      "cmp",
    ],
    ["a duplicate node id", graph([input, { ...colorNoise, id: "in" }, output], []), "in"],
  ])("rejects %s, pointing at the node", (_, g, nodeId) => {
    expect(validateGraph(g)).toMatchObject({ nodeId });
  });

  test.each([
    ["two inputs", graph([input, { ...input, id: "in2" }, output], [])],
    ["no output", graph([input, colorNoise], [])],
    ["an edge to a missing node", graph([input, output], [edge("in", "ghost")])],
  ])("rejects %s", (_, g) => {
    expect(validateGraph(g)).toMatchObject({ message: expect.any(String) });
  });
});

describe("validateGraph, the animation node", () => {
  const move: GraphNode = { id: "mv", type: "move", data: { x: 0, y: 0 } };
  const matrix: GraphNode = { id: "mx", type: "matrix", data: { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1] } };
  const animation = (tracks: { id: string; keys: { frame: number; value: number }[] }[], frames = 10): GraphNode => ({
    id: "anim",
    type: "animation",
    data: { fps: 24, frames, tracks },
  });
  const t1 = { id: "t1", keys: [{ frame: 0, value: 0 }, { frame: 9, value: 10 }] };
  const t2 = { id: "t2", keys: [] };
  const param = (source: string, sourceHandle: string, targetHandle?: string): GraphEdge => ({
    id: `${source}.${sourceHandle}`,
    source,
    sourceHandle,
    target: "anim",
    ...(targetHandle && { targetHandle }),
  });
  const withAnimation = (node: GraphNode, edges: GraphEdge[], extra: GraphNode[] = [move]) =>
    graph([input, ...extra, node, output], edges);

  test.each([
    ["a node without tracks", withAnimation(animation([]), [])],
    ["a param linked to a track", withAnimation(animation([t1]), [param("mv", "x", "t1")])],
    ["two params of one node", withAnimation(animation([t1, t2]), [param("mv", "x", "t1"), param("mv", "y", "t2")])],
    ["a track without a link", withAnimation(animation([t1]), [])],
    ["a track without keys", withAnimation(animation([t2]), [param("mv", "x", "t2")])],
    [
      "a param link next to the node's pixel links",
      withAnimation(animation([t1]), [edge("in", "mv"), edge("mv", "out"), param("mv", "x", "t1")]),
    ],
    ["a key past the last frame — frames is only what gets rendered", withAnimation(animation([{ id: "t1", keys: [{ frame: 10, value: 0 }] }]), [param("mv", "x", "t1")])],
    ["a key out of the param's bounds — graphAtFrame clamps", withAnimation(animation([{ id: "t1", keys: [{ frame: 0, value: 101 }] }]), [param("mv", "x", "t1")])],
  ])("accepts %s", (_, g) => {
    expect(validateGraph(g)).toBeNull();
  });

  test.each([
    ["a second animation node", graph([input, animation([]), { ...animation([]), id: "anim2" }, output], []), "anim2"],
    ["a pixel link into it", withAnimation(animation([t1]), [edge("mv", "anim", "t1")]), "anim"],
    ["a link out of it", withAnimation(animation([t1]), [edge("anim", "out")]), "anim"],
    ["a param link out of it", withAnimation(animation([t1]), [{ ...edge("anim", "mv"), sourceHandle: "x" }]), "anim"],
    ["a param link into a plain node", withAnimation(animation([]), [{ ...edge("mv", "out"), sourceHandle: "x" }]), "mv"],
    ["a param link into a layers row", graph([input, move, layersNode, output], [{ ...edge("mv", "cmp", "top"), sourceHandle: "x" }]), "mv"],
    ["a param the type doesn't have", withAnimation(animation([t1]), [param("mv", "z", "t1")]), "mv"],
    ["an inherited name as a param", withAnimation(animation([t1]), [param("mv", "constructor", "t1")]), "mv"],
    ["a non-numeric param", withAnimation(animation([t1]), [param("mx", "matrix", "t1")], [matrix]), "mx"],
    ["a param of the input", withAnimation(animation([t1]), [param("in", "imageId", "t1")]), "in"],
    ["a param link without a track", withAnimation(animation([t1]), [param("mv", "x")]), "anim"],
    ["a link into a missing track", withAnimation(animation([t1]), [param("mv", "x", "ghost")]), "anim"],
    ["two tracks on one param", withAnimation(animation([t1, t2]), [param("mv", "x", "t1"), { ...param("mv", "x", "t2"), id: "again" }]), "anim"],
    ["two params on one track", withAnimation(animation([t1]), [param("mv", "x", "t1"), param("mv", "y", "t1")]), "anim"],
    ["two keys on one frame", withAnimation(animation([{ id: "t1", keys: [{ frame: 1, value: 0 }, { frame: 1, value: 5 }] }]), []), "anim"],
  ])("rejects %s, pointing at the node", (_, g, nodeId) => {
    expect(validateGraph(g)).toMatchObject({ nodeId });
  });
});

describe("validateGraph, a delay", () => {
  const move: GraphNode = { id: "mv", type: "move", data: { x: 0, y: 0 } };
  const animation: GraphNode = {
    id: "anim",
    type: "animation",
    data: { fps: 24, frames: 10, tracks: [{ id: "t1", keys: [] }, { id: "t2", keys: [] }] },
  };
  const delay = (id = "dl", rows = ["r1", "r2"]): GraphNode => ({
    id,
    type: "delay",
    data: { frames: 3, rows: rows.map((row) => ({ id: row })) },
  });
  const link = (source: string, sourceHandle: string | undefined, target: string, targetHandle?: string): GraphEdge => ({
    id: `${source}.${sourceHandle}-${target}.${targetHandle}`,
    source,
    target,
    ...(sourceHandle && { sourceHandle }),
    ...(targetHandle && { targetHandle }),
  });
  const g = (edges: GraphEdge[], extra: GraphNode[] = []) => graph([input, move, delay(), animation, output, ...extra], edges);

  test.each([
    ["an unlinked delay", g([])],
    ["param → delay → track", g([link("mv", "x", "dl", "r1"), link("dl", "r1", "anim", "t1")])],
    [
      "two params through one delay",
      g([link("mv", "x", "dl", "r1"), link("dl", "r1", "anim", "t1"), link("mv", "y", "dl", "r2"), link("dl", "r2", "anim", "t2")]),
    ],
    ["a row linked on one side only", g([link("mv", "x", "dl", "r1"), link("dl", "r2", "anim", "t1")])],
    [
      "delay → delay",
      g([link("mv", "x", "dl", "r1"), link("dl", "r1", "dl2", "r1"), link("dl2", "r1", "anim", "t1")], [delay("dl2")]),
    ],
  ])("accepts %s", (_, graph) => {
    expect(validateGraph(graph)).toBeNull();
  });

  test.each([
    ["a pixel link into it", g([link("in", undefined, "dl", "r1")]), "dl"],
    ["a pixel link out of it", g([link("dl", "r1", "out")]), "dl"],
    ["a link into a missing row", g([link("mv", "x", "dl", "ghost")]), "dl"],
    ["a link out of a missing row", g([link("dl", "ghost", "anim", "t1")]), "dl"],
    ["a non-param into a row", g([link("mv", "z", "dl", "r1")]), "mv"],
    ["two params into one row", g([link("mv", "x", "dl", "r1"), link("mv", "y", "dl", "r1")]), "dl"],
    ["one param into a row and a track", g([link("mv", "x", "dl", "r1"), link("mv", "x", "anim", "t1")]), "anim"],
    ["one row into two tracks", g([link("dl", "r1", "anim", "t1"), link("dl", "r1", "anim", "t2")]), "anim"],
    [
      "two delays in a loop",
      g([link("dl", "r1", "dl2", "r1"), link("dl2", "r1", "dl", "r1")], [delay("dl2")]),
      "dl",
    ],
  ])("rejects %s, pointing at the node", (_, graph, nodeId) => {
    expect(validateGraph(graph)).toMatchObject({ nodeId });
  });

  test("a new delay starts with one free row and a shift of 3", () => {
    expect(INITIAL_DATA.delay).toEqual({ frames: 3, rows: [{ id: "row-1" }] });
  });

  test("its shift is whole frames within the bounds", () => {
    const file = (frames: number) => ({ version: TOAST_GRAPH_VERSION, nodes: [{ ...delay(), data: { frames, rows: [] } }], edges: [] });
    expect(() => parseToastGraph(file(-12))).not.toThrow();
    expect(() => parseToastGraph(file(1.5))).toThrow();
    expect(() => parseToastGraph(file(5000))).toThrow();
  });
});

describe("the animation node in parseToastGraph", () => {
  const nodeWith = (data: unknown) => ({ version: TOAST_GRAPH_VERSION, nodes: [{ id: "anim", type: "animation", data }], edges: [] });
  const base = { fps: 24, frames: 48, tracks: [] };

  test.each([
    ["no tracks", base],
    ["keys", { ...base, tracks: [{ id: "t1", keys: [{ frame: 47, value: 10 }, { frame: 0, value: 0.5 }] }] }],
  ])("round-trips %s", (_, data) => {
    expect<unknown>(parseToastGraph(nodeWith(data)).nodes[0]!.data).toEqual(data);
  });

  test("a param link keeps sourceHandle", () => {
    const link = { id: "1", source: "mv", sourceHandle: "x", target: "anim", targetHandle: "t1" };
    expect<unknown>(parseToastGraph({ ...nodeWith(base), edges: [link] }).edges[0]).toEqual(link);
  });

  test.each([
    ["zero fps", { ...base, fps: 0 }],
    ["fps over the max", { ...base, fps: 101 }],
    ["fractional fps", { ...base, fps: 23.976 }],
    ["zero frames", { ...base, frames: 0 }],
    ["a negative key frame", { ...base, tracks: [{ id: "t1", keys: [{ frame: -1, value: 0 }] }] }],
    ["a fractional key frame", { ...base, tracks: [{ id: "t1", keys: [{ frame: 0.5, value: 0 }] }] }],
    ["a duplicate track id", { ...base, tracks: [{ id: "t1", keys: [] }, { id: "t1", keys: [] }] }],
  ])("rejects %s", (_, data) => {
    expect(() => parseToastGraph(nodeWith(data))).toThrow();
  });
});

describe("export settings in parseToastGraph", () => {
  const withExport = (exp: unknown) => ({ version: TOAST_GRAPH_VERSION, nodes: [], edges: [], export: exp });

  test.each([
    ["nothing", {}],
    ["a format", { format: "mp4" }],
    ["reps", { format: "gif", loop: { reps: 3 } }],
    ["seconds", { loop: { seconds: 15 } }],
    ["exact seconds", { format: "mp4", loop: { seconds: 2.5, wholeCycles: false } }],
  ])("round-trips %s", (_, exp) => {
    expect<unknown>(parseToastGraph(withExport(exp)).export).toEqual(exp);
  });

  test("absent stays absent", () => {
    expect(parseToastGraph({ version: TOAST_GRAPH_VERSION, nodes: [], edges: [] })).not.toHaveProperty("export");
  });

  // pre-release, no migration: a loop in the animation node (before 09.11) is dropped, the file still opens
  test("a loop left in the animation node is dropped", () => {
    const data = { fps: 24, frames: 48, tracks: [], loop: { reps: 3 } };
    const graph = parseToastGraph({ version: TOAST_GRAPH_VERSION, nodes: [{ id: "anim", type: "animation", data }], edges: [] });
    expect(graph.nodes[0]!.data).not.toHaveProperty("loop");
  });

  test.each([
    ["an unknown format", { format: "webm" }],
    ["reps and seconds together", { loop: { reps: 3, seconds: 15 } }],
    ["an empty loop", { loop: {} }],
    ["zero reps", { loop: { reps: 0 } }],
    ["fractional reps", { loop: { reps: 1.5 } }],
    ["zero seconds", { loop: { seconds: 0 } }],
    ["wholeCycles with reps", { loop: { reps: 2, wholeCycles: false } }],
  ])("rejects %s", (_, exp) => {
    expect(() => parseToastGraph(withExport(exp))).toThrow();
  });
});

describe("layersNode in parseToastGraph", () => {
  test("a fan-out graph round-trips, targetHandle kept", () => {
    expect<unknown>(parseToastGraph(fanOut())).toEqual(fanOut());
  });

  test("an edge without targetHandle stays without it — sprint 2–3 files are unchanged", () => {
    expect(parseToastGraph(fanOut()).edges[0]).not.toHaveProperty("targetHandle");
  });

  test("a new layers node starts with 2 normal rows", () => {
    const nodes = [input, { id: "cmp", type: "layers", data: INITIAL_DATA.layers }, output];
    expect(() => parseToastGraph(graph(nodes as GraphNode[], []))).not.toThrow();
  });

  test("a layer keeps its name and visibility; both optional", () => {
    const layers: LayerRow[] = [{ id: "a", blendMode: "normal", name: "poppies", visible: false }, { id: "b", blendMode: "add" }];
    const parsed = parseToastGraph(graph([input, { ...layersNode, data: { layers } } as GraphNode, output], []));
    expect(parsed.nodes[1]!.data).toEqual({ layers });
  });

  test.each([
    ["no layers", { layers: [] }, ["nodes", 1, "data", "layers"]],
    ["an empty layer name", { layers: [{ id: "a", blendMode: "normal", name: "" }] }, ["nodes", 1, "data", "layers", 0, "name"]],
    [
      "a layer name over the max",
      { layers: [{ id: "a", blendMode: "normal", name: "x".repeat(LAYER_NAME_MAX + 1) }] },
      ["nodes", 1, "data", "layers", 0, "name"],
    ],
    ["an unknown blend mode", { layers: [{ id: "a", blendMode: "multiply" }] }, ["nodes", 1, "data", "layers", 0, "blendMode"]],
    [
      "a duplicate layer id",
      { layers: [{ id: "a", blendMode: "normal" }, { id: "a", blendMode: "add" }] },
      ["nodes", 1, "data", "layers", 1, "id"],
    ],
  ])("rejects %s, the path at the node", (_, data, path) => {
    const g = graph([input, { ...layersNode, data } as GraphNode, output], []);
    expect(() => parseToastGraph(g)).toThrow();
    try {
      parseToastGraph(g);
    } catch (error) {
      expect((error as { issues: Array<{ path: unknown }> }).issues[0]!.path).toEqual(path);
    }
  });
});
