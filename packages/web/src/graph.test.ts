import { describe, expect, test } from "bun:test";
import { toast2signac } from "@xtc-toaster/toasts";
import { INITIAL_DATA, PARAMS } from "@xtc-toaster/contract";
import type { Edge } from "@xyflow/svelte";
import { TOAST_GRAPH_VERSION, validateGraph, type GraphEdge, type GraphNode } from "@xtc-toaster/contract";
import {
  canConnect,
  createNode,
  emptyFlow,
  fromToastFile,
  insertOnLink,
  keepChain,
  leaveCopiesBehind,
  linkOntoNode,
  linksUnder,
  MENU_NODE_TYPES,
  NODE_CATEGORIES,
  toFlow,
  toGraph,
  toToastFile,
  ToastFileError,
  withLink,
  withoutTaken,
} from "./graph";

// input fans out: one row straight, one through hue noise; the layers node into the output
const fanOut = () => ({
  version: TOAST_GRAPH_VERSION,
  nodes: [
    { id: "in", type: "input", data: { imageId: null } },
    { id: "nz", type: "colorNoise", data: { deviationCoefficient: 0.5 } },
    { id: "cmp", type: "layers", data: { layers: [{ id: "top", blendMode: "add" }, { id: "bottom", blendMode: "normal" }] } },
    { id: "out", type: "output", data: {} },
  ] as GraphNode[],
  edges: [
    { id: "in-nz", source: "in", target: "nz" },
    { id: "nz-cmp", source: "nz", target: "cmp", targetHandle: "top" },
    { id: "in-cmp", source: "in", target: "cmp", targetHandle: "bottom" },
    { id: "cmp-out", source: "cmp", target: "out" },
  ] as GraphEdge[],
});

describe("toFlow", () => {
  test("places nodes left to right by chain order", () => {
    const shuffled = { ...toast2signac, nodes: [...toast2signac.nodes].reverse() };
    const { nodes } = toFlow(shuffled);
    const x = Object.fromEntries(nodes.map(({ id, position }) => [id, position.x]));
    expect(x.in!).toBeLessThan(x.nz!);
    expect(x.nz!).toBeLessThan(x.out!);
  });

  test("puts nodes off the chain into a row below", () => {
    const bypass = { ...toast2signac, edges: [{ id: "in-out", source: "in", target: "out" }] };
    const y = Object.fromEntries(toFlow(bypass).nodes.map(({ id, position }) => [id, position.y]));
    expect(y.in).toBe(y.out!);
    expect(y.nz!).toBeGreaterThan(y.in!);
  });

  test("a fork: a node sits right of everything it pulls, a column stacks top-down", () => {
    const position = Object.fromEntries(toFlow(fanOut()).nodes.map(({ id, position }) => [id, position]));
    // cmp pulls in directly and through nz — the longest path puts it after nz
    expect(position.in!.x).toBeLessThan(position.nz!.x);
    expect(position.nz!.x).toBeLessThan(position.cmp!.x);
    expect(position.cmp!.x).toBeLessThan(position.out!.x);
  });

  test("two nodes at one depth stack in one column", () => {
    const graph = fanOut();
    graph.nodes.splice(2, 0, { id: "nz2", type: "colorNoise", data: { deviationCoefficient: 0.1 } });
    graph.edges.push({ id: "in-nz2", source: "in", target: "nz2" });
    const position = Object.fromEntries(toFlow(graph).nodes.map(({ id, position }) => [id, position]));
    expect(position.nz2!.x).toBe(position.nz!.x);
    expect(position.nz2!.y).toBeGreaterThan(position.nz!.y);
  });

  test("a cycle doesn't hang the layout", () => {
    const graph = fanOut();
    graph.edges.push({ id: "cmp-nz", source: "cmp", target: "nz" });
    expect(toFlow(graph).nodes).toHaveLength(4);
  });

  test("carries targetHandle, a plain edge stays without it", () => {
    const { edges } = toFlow(fanOut());
    expect(edges.find(({ id }) => id === "nz-cmp")).toMatchObject({ targetHandle: "top" });
    expect(edges.find(({ id }) => id === "in-nz")).not.toHaveProperty("targetHandle");
  });

  test("input and output can't be deleted, effects can", () => {
    const deletable = Object.fromEntries(toFlow(toast2signac).nodes.map(({ id, deletable }) => [id, deletable]));
    expect(deletable).toEqual({ in: false, nz: undefined, out: false });
  });
});

describe("createNode", () => {
  test("a uuid, the drop position and the initial params", () => {
    const node = createNode("colorNoise", { x: 10, y: 20 });
    expect(node.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(node.position).toEqual({ x: 10, y: 20 });
    expect(node.data).toEqual({ deviationCoefficient: PARAMS.colorNoise.deviationCoefficient.initial });
  });

  test("a hue mask starts with every param at its initial", () => {
    const { data } = createNode("selectColor", { x: 0, y: 0 });
    expect(data).toEqual({ hue: PARAMS.selectColor.hue.initial, tolerance: PARAMS.selectColor.tolerance.initial });
  });

  test("a y-rotation starts with every param at its initial", () => {
    const { data } = createNode("turn3d", { x: 0, y: 0 });
    expect(data).toEqual({
      angle: PARAMS.turn3d.angle.initial,
      focalLength: PARAMS.turn3d.focalLength.initial,
    });
  });

  test.each(["blur", "selectVivid", "selectBright", "move", "rotate", "scale", "skew", "corners", "opacity"] as const)(
    "%s starts with every param at its initial",
    (type) => {
      const initials = Object.fromEntries(Object.entries(PARAMS[type]).map(([name, { initial }]) => [name, initial]));
      expect<unknown>(createNode(type, { x: 0, y: 0 }).data).toEqual(initials);
    },
  );

  test("an isolate channel starts on red", () => {
    expect(createNode("channel", { x: 0, y: 0 }).data).toEqual({ channel: "red" });
  });

  test.each(["matrix", "fill", "tint"] as const)("%s starts with its INITIAL_DATA", (type) => {
    expect<unknown>(createNode(type, { x: 0, y: 0 }).data).toEqual(INITIAL_DATA[type]);
  });

  test("two homographies don't share one matrix array", () => {
    const a = createNode("matrix", { x: 0, y: 0 });
    const b = createNode("matrix", { x: 0, y: 0 });
    expect((a.data as { matrix: number[] }).matrix).not.toBe((b.data as { matrix: number[] }).matrix);
  });

  // every menu node, dropped as is, is a valid graph node — the server accepts it
  test.each(MENU_NODE_TYPES)("a dropped %s passes the contract", (type) => {
    const nodes = [createNode(type, { x: 0, y: 0 })];
    expect(() => toGraph(nodes, [])).not.toThrow();
  });
});

describe("toGraph", () => {
  test("round-trips a toast", () => {
    const { nodes, edges } = toFlow(toast2signac);
    expect(toGraph(nodes, edges)).toEqual(toast2signac);
  });

  test("strips ui fields", () => {
    const { nodes, edges } = toFlow(toast2signac);
    const withUi = nodes.map((node) => ({ ...node, selected: true, measured: { width: 150, height: 40 } }));
    const graph = toGraph(withUi, edges.map((edge) => ({ ...edge, animated: true })));
    expect(graph.nodes[0]).toEqual({ id: "in", type: "input", data: { imageId: null } });
    expect(graph.edges[0]).toEqual({ id: "in-nz", source: "in", target: "nz" });
  });
});

describe("layersNode graph", () => {
  test("round-trips through the flow", () => {
    const { nodes, edges } = toFlow(fanOut());
    expect<unknown>(toGraph(nodes, edges)).toEqual(fanOut());
  });

  test("xyflow's null handles don't reach the contract", () => {
    const { nodes, edges } = toFlow(fanOut());
    const fromXyflow = edges.map((edge) => ({ sourceHandle: null, targetHandle: null, ...edge }));
    expect(toGraph(nodes, fromXyflow).edges[0]).toEqual({ id: "in-nz", source: "in", target: "nz" });
  });
});

describe("drawing links", () => {
  const flow = () => toFlow(fanOut());
  const link = (source: string, target: string, targetHandle: string | null = null) => ({ source, target, targetHandle });

  test.each([
    ["into a free row", link("nz", "cmp", "bottom")],
    ["onto a taken input — it replaces the link", link("in", "out")],
    ["the same output into a second node", link("in", "cmp", "top")],
  ])("allows %s", (_, connection) => {
    const { nodes, edges } = flow();
    expect(canConnect(nodes, edges, connection)).toBe(true);
  });

  test.each([
    ["a cycle", link("cmp", "nz")],
    ["a link into the input", link("nz", "in")],
    ["a link to itself", link("nz", "nz")],
    ["a layers link without a row", link("nz", "cmp")],
  ])("refuses %s", (_, connection) => {
    const { nodes, edges } = flow();
    expect(canConnect(nodes, edges, connection)).toBe(false);
  });

  test("a new link frees its target handle — other rows keep theirs", () => {
    const ids = (edges: Edge[]) => edges.map(({ id }) => id);
    expect(ids(withoutTaken(flow().edges, link("nz", "cmp", "bottom")))).toEqual(["in-nz", "nz-cmp", "cmp-out"]);
    expect(ids(withoutTaken(flow().edges, link("in", "nz")))).toEqual(["nz-cmp", "in-cmp", "cmp-out"]);
  });

  test("a moved link stays — only the one it lands on goes", () => {
    const moved = { id: "nz-cmp", source: "nz", target: "cmp", targetHandle: "bottom" };
    expect(withoutTaken(flow().edges, moved, "nz-cmp").map(({ id }) => id)).toEqual(["in-nz", "nz-cmp", "cmp-out"]);
  });
});

describe("toast file", () => {
  const IMAGE_ID = "3f6c1a52-8e0b-4c1d-9a7e-2b5f4d6e8a90";
  const withImage = () => {
    const { nodes, edges } = toFlow(toast2signac);
    return { nodes: nodes.map((node) => (node.type === "input" ? { ...node, data: { imageId: IMAGE_ID } } : node)), edges };
  };
  const inputData = (nodes: ReturnType<typeof toFlow>["nodes"]) =>
    nodes.find((node) => node.type === "input")?.data;

  test("export drops the picture and ui fields — the graph only", () => {
    const { nodes, edges } = withImage();
    const file = JSON.parse(toToastFile(nodes, edges));
    expect(file).toEqual({ ...toast2signac });
    expect(JSON.stringify(file)).not.toContain(IMAGE_ID);
  });

  test("export → import round trip keeps the graph, the current picture stays in the input", () => {
    const { nodes, edges } = withImage();
    const imported = fromToastFile(toToastFile(nodes, edges), IMAGE_ID);
    expect(toGraph(imported.nodes, imported.edges)).toEqual(toGraph(nodes, edges));
    expect(inputData(imported.nodes)).toEqual({ imageId: IMAGE_ID });
  });

  test("import rebuilds the layout by chain order", () => {
    const { nodes } = fromToastFile(JSON.stringify(toast2signac), null);
    expect(nodes.map(({ position }) => position)).toEqual(toFlow(toast2signac).nodes.map(({ position }) => position));
  });

  const onlyInput = toast2signac.nodes.filter(({ type }) => type === "input");
  test.each([
    ["not json", "{", "not a json file"],
    ["another json", JSON.stringify({ hello: "world" }), "not a toast file"],
    ["a param out of range", JSON.stringify({ ...toast2signac, nodes: toast2signac.nodes.map((node) => (node.type === "colorNoise" ? { ...node, data: { deviationCoefficient: 2 } } : node)) }), "not a toast file"],
    ["a newer version", JSON.stringify({ ...toast2signac, version: 2 }), "not a toast file"],
    ["no output", JSON.stringify({ ...toast2signac, nodes: onlyInput, edges: [] }), "a toast needs exactly one input and one output"],
    ["two inputs", JSON.stringify({ ...toast2signac, nodes: [...toast2signac.nodes, { ...onlyInput[0], id: "in2" }] }), "a toast needs exactly one input and one output"],
    ["a cycle", JSON.stringify({ ...fanOut(), edges: [...fanOut().edges.slice(1), { id: "cmp-nz", source: "cmp", target: "nz" }] }), "the graph loops"],
    ["duplicate ids", JSON.stringify({ ...toast2signac, nodes: toast2signac.nodes.map((node) => (node.type === "selectColor" ? { ...node, id: "nz" } : node)) }), "duplicate node id"],
  ])("import rejects %s with a message for the ui", (_, text, message) => {
    expect(() => fromToastFile(text, null)).toThrow(new ToastFileError(message));
  });
});

describe("emptyFlow", () => {
  test("input → output, the picture kept, both undeletable", () => {
    const { nodes, edges } = emptyFlow("img-1");
    expect(nodes.map(({ type, data, deletable }) => ({ type, data, deletable }))).toEqual([
      { type: "input", data: { imageId: "img-1" }, deletable: false },
      { type: "output", data: {}, deletable: false },
    ]);
    expect(edges).toEqual([{ id: "in-out", source: "in", target: "out" }]);
  });
});

describe("toFlow rows", () => {
  test("parallel chains of different length run straight — a node in the row of what it pulls", async () => {
    const { toast1degas } = await import("@xtc-toaster/toasts");
    const { nodes, edges } = toFlow(toast1degas);
    const y = Object.fromEntries(nodes.map(({ id, position }) => [id, position.y]));
    // every pixel link between two chain nodes is horizontal; only the links out of the input and into the layers
    // node bend (param links into the animation node have a sourceHandle — not part of the chains)
    const bent = edges.filter(
      ({ source, target, sourceHandle }) => !sourceHandle && source !== "in" && target !== "cmp" && y[source] !== y[target],
    );
    expect(bent).toEqual([]);
  });
});

describe("NODE_CATEGORIES", () => {
  test("every menu type in exactly one category", () => {
    const listed = NODE_CATEGORIES.flatMap(({ types }) => types as readonly string[]);
    expect(listed.toSorted()).toEqual([...MENU_NODE_TYPES].toSorted());
  });
});

describe("param links", () => {
  const animated = () => ({
    version: TOAST_GRAPH_VERSION,
    nodes: [
      { id: "in", type: "input", data: { imageId: null } },
      { id: "m", type: "move", data: { x: 1, y: 2 } },
      { id: "a", type: "animation", data: { fps: 24, frames: 4, tracks: [{ id: "t1", keys: [] }, { id: "t2", keys: [] }] } },
      { id: "out", type: "output", data: {} },
    ] as GraphNode[],
    edges: [
      { id: "1", source: "in", target: "m" },
      { id: "2", source: "m", target: "out" },
      { id: "3", source: "m", sourceHandle: "x", target: "a", targetHandle: "t1" },
    ] as GraphEdge[],
  });

  test("survive toFlow → toGraph", () => {
    const { nodes, edges } = toFlow(animated());
    expect(toGraph(nodes, edges).edges).toEqual(animated().edges);
  });

  test("survive export → import, keys and the export settings too", () => {
    const graph = { ...animated(), export: { format: "mp4" as const, loop: { seconds: 2.5, wholeCycles: false } } };
    const node = graph.nodes.find(({ type }) => type === "animation")!;
    if (node.type === "animation") node.data.tracks[0]!.keys = [{ frame: 9, value: 3 }];
    const flow = toFlow(graph);
    expect(flow.export).toEqual(graph.export);
    const imported = fromToastFile(toToastFile(flow.nodes, flow.edges, flow.export), null);
    expect(toGraph(imported.nodes, imported.edges).edges).toEqual(graph.edges);
    expect(imported.nodes.find(({ id }) => id === "a")!.data).toEqual(node.data);
    expect(imported.export).toEqual(graph.export);
  });

  test("no export settings — no field in the toast", () => {
    const { nodes, edges } = toFlow(animated());
    expect(JSON.parse(toToastFile(nodes, edges, {}))).not.toHaveProperty("export");
    expect(toGraph(nodes, edges, {})).not.toHaveProperty("export");
  });

  test("don't move the chain, the animation node gets a row below it", () => {
    const { nodes } = toFlow(animated());
    const at = Object.fromEntries(nodes.map(({ id, position }) => [id, position]));
    expect(at.out!.y).toBe(at.in!.y);
    expect(at.out!.x).toBeGreaterThan(at.m!.x);
    expect(at.a!.y).toBeGreaterThan(at.in!.y);
    expect(at.a!.x).toBeGreaterThan(at.m!.x); // right of its params: the wires don't loop back
  });

  test("the animation node doesn't overlap unlinked nodes", () => {
    const graph = animated();
    graph.nodes.push({ id: "b", type: "blur", data: { radius: 1 } });
    const at = Object.fromEntries(toFlow(graph).nodes.map(({ id, position }) => [id, position]));
    expect(at.a!.y).toBeGreaterThan(at.b!.y);
  });

  test("canConnect: a param into a track yes, into a pixel input or a pixel link into a track no", () => {
    const { nodes, edges } = toFlow(animated());
    const param = { source: "m", sourceHandle: "y", target: "a", targetHandle: "t2" };
    expect(canConnect(nodes, edges, param)).toBe(true);
    expect(canConnect(nodes, edges, { source: "m", sourceHandle: "y", target: "out", targetHandle: null })).toBe(false);
    expect(canConnect(nodes, edges, { source: "m", sourceHandle: null, target: "a", targetHandle: "t2" })).toBe(false);
  });

  test("a param already linked moves to the new track, the old link goes", () => {
    const { nodes, edges } = toFlow(animated());
    const link = { source: "m", sourceHandle: "x", target: "a", targetHandle: "t2" };
    expect(canConnect(nodes, edges, link)).toBe(true);
    expect(withoutTaken(edges, link).map(({ id }) => id)).toEqual(["1", "2"]);
    // moved by its end: it stays, it isn't taken by itself
    expect(withoutTaken(edges, link, "3").map(({ id }) => id)).toEqual(["1", "2", "3"]);
  });

  test("another param's link stays", () => {
    const { edges } = toFlow(animated());
    const link = { source: "m", sourceHandle: "y", target: "a", targetHandle: "t2" };
    expect(withoutTaken(edges, link).map(({ id }) => id)).toEqual(["1", "2", "3"]);
  });
});

describe("insertOnLink", () => {
  // in → out, a free blur below; ids as the tests name them
  const chain = (...extra: GraphNode[]) => {
    const { nodes, edges } = toFlow({
      version: TOAST_GRAPH_VERSION,
      nodes: [
        { id: "in", type: "input", data: { imageId: null } },
        { id: "out", type: "output", data: {} },
        { id: "bl", type: "blur", data: { radius: 4 } },
        ...extra,
      ] as GraphNode[],
      edges: [{ id: "in-out", source: "in", target: "out" }],
    });
    return { nodes, edges };
  };
  const links = (edges: Edge[] | null) =>
    edges?.map(({ source, target, targetHandle }) => `${source}>${target}${targetHandle ? `:${targetHandle}` : ""}`).sort();

  test("a free node goes into the link: A → node → B", () => {
    const { nodes, edges } = chain();
    expect(links(insertOnLink(nodes, edges, "bl", "in-out"))).toEqual(["bl>out", "in>bl"]);
  });

  test("the link into a layers row keeps its row", () => {
    const { nodes, edges } = toFlow(fanOut());
    const free = createNode("blur", { x: 0, y: 0 });
    const result = insertOnLink([...nodes, free], edges, free.id, "nz-cmp");
    expect(links(result)).toContain(`${free.id}>cmp:top`);
    expect(links(result)).toContain(`nz>${free.id}`);
    expect(links(result)).not.toContain("nz>cmp:top");
  });

  test("a layers node takes the link into its top row", () => {
    const { nodes, edges } = chain({ id: "ly", type: "layers", data: { layers: [{ id: "a", blendMode: "normal" }, { id: "b", blendMode: "add" }] } });
    expect(links(insertOnLink(nodes, edges, "ly", "in-out"))).toEqual(["in>ly:a", "ly>out"]);
  });

  test("a node with a pixel link stays out", () => {
    const { nodes, edges } = chain();
    const linked = [...edges, { id: "in-bl", source: "in", target: "bl" }];
    expect(insertOnLink(nodes, linked, "bl", "in-out")).toBeNull();
  });

  test("a param link doesn't count — an animated node goes in", () => {
    const { nodes, edges } = chain({ id: "an", type: "animation", data: { ...INITIAL_DATA.animation, tracks: [{ id: "t", keys: [] }] } } as GraphNode);
    const animated = [...edges, { id: "bl-an", source: "bl", sourceHandle: "radius", target: "an", targetHandle: "t" }];
    expect(links(insertOnLink(nodes, animated, "bl", "in-out"))).toEqual(["bl>an:t", "bl>out", "in>bl"]);
  });

  test("input, output, animation and delay never go in; a param link takes nothing", () => {
    const { nodes, edges } = chain(
      { id: "an", type: "animation", data: { ...INITIAL_DATA.animation, tracks: [{ id: "t", keys: [] }] } } as GraphNode,
      { id: "dl", type: "delay", data: structuredClone(INITIAL_DATA.delay) } as unknown as GraphNode,
    );
    for (const id of ["an", "dl"]) expect(insertOnLink(nodes, edges, id, "in-out")).toBeNull();
    const param = [...edges, { id: "p", source: "bl", sourceHandle: "radius", target: "an", targetHandle: "t" }];
    const move = createNode("move", { x: 0, y: 0 });
    expect(insertOnLink([...nodes, move], param, move.id, "p")).toBeNull();
    expect(insertOnLink(nodes, edges, "bl", "missing")).toBeNull();
  });

  test("a layers node with no rows stays out", () => {
    const { nodes, edges } = chain({ id: "ly", type: "layers", data: { layers: [] } });
    expect(insertOnLink(nodes, edges, "ly", "in-out")).toBeNull();
  });
});

describe("linksUnder", () => {
  const rect = { x: 100, y: 100, width: 100, height: 60 };
  // a straight wire at y, a bezier as getBezierPath writes it
  const wire = (id: string, y: number) => ({ id, d: `M0,${y} C150,${y} 150,${y} 300,${y}` });

  test("the links crossing the box, the one nearest its center first", () => {
    expect(linksUnder(rect, [wire("far", 105), wire("near", 128), wire("off", 300)])).toEqual(["near", "far"]);
  });

  test("the curve counts, not the straight line between its ends", () => {
    // (0, 0) → (300, 0) bowed down: y ≈ 130–150 over the box's x — the chord at y 0 would cross a box at y 0–60
    const bowed = [{ id: "bowed", d: "M0,0 C100,200 200,200 300,0" }];
    expect(linksUnder({ ...rect, y: 0 }, bowed)).toEqual([]);
    expect(linksUnder({ ...rect, y: 120 }, bowed)).toEqual(["bowed"]);
  });

  test("a path it can't read is skipped", () => {
    expect(linksUnder(rect, [{ id: "line", d: "M0,130 L300,130" }])).toEqual([]);
  });
});

describe("linkOntoNode", () => {
  // in → nz → cmp:top, in → cmp:bottom, cmp → out; a free blur, a layers node with a free row
  const flow = () => {
    const graph = fanOut();
    graph.nodes.push(
      { id: "bl", type: "blur", data: { radius: 4 } } as GraphNode,
      { id: "ly", type: "layers", data: { layers: [{ id: "a", blendMode: "normal" }, { id: "b", blendMode: "add" }] } } as GraphNode,
      { id: "an", type: "animation", data: { ...INITIAL_DATA.animation, tracks: [] } } as GraphNode,
      { id: "dl", type: "delay", data: structuredClone(INITIAL_DATA.delay) } as unknown as GraphNode,
    );
    graph.edges.push({ id: "bl-ly", source: "bl", target: "ly", targetHandle: "a" });
    return toFlow(graph);
  };

  test("a node's frame is its input", () => {
    const { nodes, edges } = flow();
    expect(linkOntoNode(nodes, edges, "in", "bl", null)).toEqual({ source: "in", target: "bl" });
  });

  test("a taken input is replaced, like a drop on its handle", () => {
    const { nodes, edges } = flow();
    const link = linkOntoNode(nodes, edges, "bl", "out", null);
    expect(link).toEqual({ source: "bl", target: "out" });
    const next = withLink(edges, link!);
    expect(next.filter(({ target }) => target === "out").map(({ source }) => source)).toEqual(["bl"]);
  });

  test("layers: the row under the pointer, taken or not", () => {
    const { nodes, edges } = flow();
    expect(linkOntoNode(nodes, edges, "nz", "ly", "a")).toEqual({ source: "nz", target: "ly", targetHandle: "a" });
    expect(linkOntoNode(nodes, edges, "nz", "ly", "b")).toEqual({ source: "nz", target: "ly", targetHandle: "b" });
    expect(linkOntoNode(nodes, edges, "nz", "ly", "missing")).toBeNull();
  });

  test("layers: over the frame, no row — the top free row; all taken — nothing", () => {
    const { nodes, edges } = flow();
    expect(linkOntoNode(nodes, edges, "nz", "ly", null)).toEqual({ source: "nz", target: "ly", targetHandle: "b" });
    expect(linkOntoNode(nodes, edges, "bl", "cmp", null)).toBeNull();
  });

  test("the link being moved doesn't take its row", () => {
    const { nodes, edges } = flow();
    expect(linkOntoNode(nodes, edges, "nz", "cmp", null, "nz-cmp")).toEqual({ source: "nz", target: "cmp", targetHandle: "top" });
    const next = withLink(edges, { source: "nz", target: "ly", targetHandle: "b" }, "nz-cmp");
    expect(next.some(({ id }) => id === "nz-cmp")).toBe(false);
    expect(next.filter(({ target }) => target === "cmp").map(({ targetHandle }) => targetHandle)).toEqual(["bottom"]);
  });

  test("no pixel input, the wire's own node, a cycle — nothing", () => {
    const { nodes, edges } = flow();
    for (const id of ["in", "an", "dl", "missing"]) expect(linkOntoNode(nodes, edges, "nz", id, null)).toBeNull();
    expect(linkOntoNode(nodes, edges, "bl", "bl", null)).toBeNull();
    expect(linkOntoNode(nodes, edges, "cmp", "nz", null)).toBeNull();
  });
});

describe("leaveCopiesBehind", () => {
  // in → nz → cmp:top, in → cmp:bottom, cmp → out; nz's param animated
  const flow = () => {
    const graph = fanOut();
    graph.nodes.push({ id: "an", type: "animation", data: { ...INITIAL_DATA.animation, tracks: [{ id: "t", keys: [] }] } } as GraphNode);
    graph.edges.push({ id: "nz-an", source: "nz", sourceHandle: "deviationCoefficient", target: "an", targetHandle: "t" });
    return toFlow(graph);
  };
  const ids = () => {
    let n = 0;
    return () => `c${++n}`;
  };
  const links = (edges: Edge[]) =>
    edges.map(({ source, sourceHandle, target, targetHandle }) => `${source}${sourceHandle ? `.${sourceHandle}` : ""}>${target}${targetHandle ? `:${targetHandle}` : ""}`).sort();
  const valid = (nodes: Parameters<typeof toGraph>[0], edges: Edge[]) => expect(validateGraph(toGraph(nodes, edges))).toBeNull();

  test("one node: the copy left behind takes every link, the dragged one goes bare", () => {
    const { nodes, edges } = flow();
    const result = leaveCopiesBehind(nodes, edges, ["nz"], ids())!;
    expect(result.nodes.map(({ id }) => id)).toEqual([...nodes.map(({ id }) => id), "c1"]);
    const copy = result.nodes.find(({ id }) => id === "c1")!;
    const nz = nodes.find(({ id }) => id === "nz")!;
    expect(copy).toMatchObject({ type: "colorNoise", data: nz.data, position: nz.position, selected: false });
    expect(links(result.edges)).toEqual(["c1.deviationCoefficient>an:t", "c1>cmp:top", "cmp>out", "in>c1", "in>cmp:bottom"]);
    valid(result.nodes, result.edges);
  });

  test("several: links between them are kept and cloned between the copies, links out go to the copies", () => {
    const { nodes, edges } = flow();
    const result = leaveCopiesBehind(nodes, edges, ["nz", "cmp"], ids())!;
    expect(links(result.edges)).toEqual([
      "c1.deviationCoefficient>an:t",
      "c1>c2:top",
      "c2>out",
      "in>c1",
      "in>c2:bottom",
      "nz>cmp:top",
    ]);
    valid(result.nodes, result.edges);
  });

  test("the copy's data is its own", () => {
    const { nodes, edges } = flow();
    const result = leaveCopiesBehind(nodes, edges, ["cmp"], ids())!;
    const copy = result.nodes.find(({ id }) => id === "c1")!;
    expect(copy.data).not.toBe(nodes.find(({ id }) => id === "cmp")!.data);
  });

  test("input, output and animation are never copied — dragged alone, nothing", () => {
    const { nodes, edges } = flow();
    expect(leaveCopiesBehind(nodes, edges, ["in", "out", "an"], ids())).toBeNull();
    const result = leaveCopiesBehind(nodes, edges, ["in", "nz"], ids())!;
    expect(result.nodes).toHaveLength(nodes.length + 1);
    // the input only moves: its link to the dragged node is a link out of the copies, it goes to the one left
    expect(links(result.edges)).toContain("in>c1");
    valid(result.nodes, result.edges);
  });
});

describe("keepChain", () => {
  // what xyflow does on delete: the nodes and every edge touching them go, keepChain runs on the rest
  const remove = (flow: { nodes: Parameters<typeof keepChain>[0]; edges: Edge[] }, ids: string[]) => {
    const removed = { nodes: ids, edges: flow.edges.filter(({ source, target }) => ids.includes(source) || ids.includes(target)) };
    const nodes = flow.nodes.filter(({ id }) => !ids.includes(id));
    const edges = flow.edges.filter((edge) => !removed.edges.includes(edge));
    return links(keepChain(nodes, edges, removed));
  };
  const links = (edges: Edge[]) =>
    edges.map(({ source, target, targetHandle }) => `${source}>${target}${targetHandle ? `:${targetHandle}` : ""}`).sort();
  const chain = (...extra: GraphEdge[]) =>
    toFlow({
      version: TOAST_GRAPH_VERSION,
      nodes: [
        { id: "in", type: "input", data: { imageId: null } },
        { id: "bl", type: "blur", data: { radius: 4 } },
        { id: "op", type: "opacity", data: { opacity: 0.5 } },
        { id: "out", type: "output", data: {} },
        { id: "an", type: "animation", data: { ...INITIAL_DATA.animation, tracks: [{ id: "t", keys: [] }] } },
      ] as GraphNode[],
      edges: [
        { id: "in-bl", source: "in", target: "bl" },
        { id: "bl-op", source: "bl", target: "op" },
        { id: "op-out", source: "op", target: "out" },
        ...extra,
      ],
    });

  test("A → node → B becomes A → B", () => {
    expect(remove(chain(), ["bl"])).toEqual(["in>op", "op>out"]);
  });

  test("deleted together: A → n1 → n2 → B — A → B", () => {
    expect(remove(chain(), ["bl", "op"])).toEqual(["in>out"]);
  });

  test("a fan-out: A into each, a layers row keeps its row", () => {
    const { nodes, edges } = toFlow(fanOut());
    // in → nz → cmp:top — nz deleted, in goes into the top row too
    expect(remove({ nodes, edges }, ["nz"])).toEqual(["cmp>out", "in>cmp:bottom", "in>cmp:top"]);
    // bl feeds op and a layers row — in goes into both
    const fork = chain({ id: "bl-ly", source: "bl", target: "ly", targetHandle: "a" });
    const ly = { id: "ly", type: "layers", position: { x: 0, y: 0 }, data: { layers: [{ id: "a", blendMode: "normal" }] } };
    expect(remove({ nodes: [...fork.nodes, ly as (typeof fork.nodes)[number]], edges: fork.edges }, ["bl"])).toEqual([
      "in>ly:a",
      "in>op",
      "op>out",
    ]);
  });

  test("layers with several rows linked leaves nothing; with one — keeps it", () => {
    const { nodes, edges } = toFlow(fanOut());
    expect(remove({ nodes, edges }, ["cmp"])).toEqual(["in>nz"]);
    const one = edges.filter(({ id }) => id !== "in-cmp");
    expect(remove({ nodes, edges: one }, ["cmp"])).toEqual(["in>nz", "nz>out"]);
  });

  test("param links go with the node; an unlinked side leaves nothing", () => {
    const animated = chain({ id: "p", source: "bl", sourceHandle: "radius", target: "an", targetHandle: "t" });
    expect(remove(animated, ["bl"])).toEqual(["in>op", "op>out"]);
    const open = chain();
    expect(remove({ ...open, edges: open.edges.filter(({ id }) => id !== "in-bl") }, ["bl"])).toEqual(["op>out"]);
  });
});

describe("param links into a value", () => {
  // move.x already wired into the value; rotate free
  const flow = () =>
    toFlow({
      version: TOAST_GRAPH_VERSION,
      nodes: [
        { id: "in", type: "input", data: { imageId: null } },
        { id: "mv", type: "move", data: { x: 0, y: 0 } },
        { id: "rt", type: "rotate", data: { angle: 0 } },
        { id: "v", type: "value", data: { value: 10 } },
        { id: "v2", type: "value", data: { value: 0 } },
        { id: "out", type: "output", data: {} },
      ] as GraphNode[],
      edges: [
        { id: "in-mv", source: "in", target: "mv" },
        { id: "mv-rt", source: "mv", target: "rt" },
        { id: "rt-out", source: "rt", target: "out" },
        { id: "x-v", source: "mv", sourceHandle: "x", target: "v" },
      ],
    });
  const param = (source: string, sourceHandle: string, target: string) => ({ source, sourceHandle, target, targetHandle: null });

  test("a second param joins the first — the value's input takes many", () => {
    const { nodes, edges } = flow();
    expect(canConnect(nodes, edges, param("rt", "angle", "v"))).toBe(true);
    expect(withoutTaken(edges, param("rt", "angle", "v")).map(({ id }) => id)).toContain("x-v");
  });

  test("the same param into another value moves there", () => {
    const { edges } = flow();
    expect(withoutTaken(edges, param("mv", "x", "v2")).map(({ id }) => id)).not.toContain("x-v");
  });

  test("a pixel wire into a value is refused, a value's number into another value is not", () => {
    const { nodes, edges } = flow();
    expect(canConnect(nodes, edges, { source: "mv", target: "v", targetHandle: null })).toBe(false);
    expect(canConnect(nodes, edges, param("v", "value", "v2"))).toBe(true);
  });

  test("value and factor are in the menu, in a group of their own", () => {
    expect(NODE_CATEGORIES.find(({ name }) => name === "value")?.types).toEqual(["value", "factor"]);
    expect(createNode("value", { x: 0, y: 0 }).data).toEqual({ value: 0 });
    expect(createNode("factor", { x: 0, y: 0 }).data).toEqual({ factor: 0.5 });
  });

  test("a factor takes params the same way: many in, no pixels", () => {
    const { nodes, edges } = flow();
    const factor = createNode("factor", { x: 0, y: 0 });
    const all = [...nodes, factor];
    // move.x leaves the value for the factor — one place per param
    const joined = [...edges.filter(({ id }) => id !== "x-v"), { id: "x-f", source: "mv", sourceHandle: "x", target: factor.id }];
    expect(canConnect(all, joined, param("rt", "angle", factor.id))).toBe(true);
    expect(withoutTaken(joined, param("rt", "angle", factor.id)).map(({ id }) => id)).toContain("x-f");
    expect(canConnect(all, edges, { source: "mv", target: factor.id, targetHandle: null })).toBe(false);
  });
});
