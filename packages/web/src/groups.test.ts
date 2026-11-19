import { describe, expect, test } from "bun:test";
import type { Edge } from "@xyflow/svelte";
import { expandGroups, TOAST_GRAPH_VERSION, validateGraph, type ToastGraph } from "@xtc-toaster/contract";
import { paramLabel, trackGroups } from "./animation";
import { canConnect, scopeOf, toFlow, toGraph, type FlowGroup, type FlowNode } from "./graph";
import {
  createInstance,
  exposedParams,
  groupSelection,
  holds,
  nodeLabel,
  nextGroupName,
  ownParamValue,
  paramBoundsOf,
  ungroup,
  withoutUnexposed,
  type Grouped,
} from "./groups";
import { fromSaved, toSaved } from "./persist";

// in → blur → opacity → out, opacity's param on a track; a value drives blur's radius
const toast = (): ToastGraph => ({
  version: TOAST_GRAPH_VERSION,
  nodes: [
    { id: "in", type: "input", data: { imageId: null } },
    { id: "bl", type: "blur", data: { radius: 4 } },
    { id: "op", type: "opacity", data: { opacity: 0.5 } },
    { id: "out", type: "output", data: {} },
    { id: "anim", type: "animation", data: { fps: 24, frames: 4, tracks: [{ id: "t1", keys: [{ frame: 0, value: 0.2 }] }] } },
    { id: "v", type: "value", data: { value: 7 } },
    { id: "free", type: "opacity", data: { opacity: 1 } },
  ],
  edges: [
    { id: "1", source: "in", target: "bl" },
    { id: "2", source: "bl", target: "op" },
    { id: "3", source: "op", target: "out" },
    { id: "4", source: "op", sourceHandle: "opacity", target: "anim", targetHandle: "t1" },
    { id: "5", source: "bl", sourceHandle: "radius", target: "v" },
  ],
});
const root = (graph = toast()) => {
  const flow = toFlow(graph);
  return { nodes: flow.nodes, edges: flow.edges, groups: flow.groups ?? [] };
};
const ids = (prefix = "id") => {
  let n = 0;
  return () => `${prefix}${++n}`;
};
const links = (edges: readonly Edge[]) =>
  edges
    .map(({ source, sourceHandle, target, targetHandle }) => `${source}${sourceHandle ? `.${sourceHandle}` : ""}>${target}${targetHandle ? `:${targetHandle}` : ""}`)
    .sort();
const grouped = (selected: string[], graph = toast()): Grouped => {
  const result = groupSelection(root(graph), selected, null, ids());
  if ("error" in result) throw new Error(result.error);
  return result;
};
const whole = ({ nodes, edges, groups }: { nodes: FlowNode[]; edges: Edge[]; groups: FlowGroup[] }) => toGraph(nodes, edges, undefined, groups);

describe("groupSelection", () => {
  test("the selection into a group: pixels in and out through the instance, a param wired out — a group input row", () => {
    const result = grouped(["bl", "op"]);
    // id1 group, id2 instance, id3 group input, id4 group output
    expect(result.group).toBe("id1");
    expect(result.instance).toBe("id2");
    expect(result.nodes.map(({ id }) => id).sort()).toEqual(["anim", "free", "id2", "in", "out", "v"]);
    // a row per param wired out, in the links' order, a free one under them
    expect(links(result.edges)).toEqual(["id2.row-1>anim:t1", "id2.row-2>v", "id2>out", "in>id2"]);
    const [definition] = result.groups;
    expect(definition!.name).toBe("group 1");
    const input = definition!.nodes.find(({ type }) => type === "groupInput")!;
    expect(input.data).toEqual({ rows: [{ id: "row-1" }, { id: "row-2" }, { id: "row-3" }] });
    expect(input.deletable).toBe(false);
    expect(links(definition!.edges)).toEqual(["bl.radius>id3:row-2", "bl>op", "id3>bl", "op.opacity>id3:row-1", "op>id4"]);
    expect(exposedParams(result.groups, definition).map(({ id, name }) => [id, name])).toEqual([
      ["row-1", "opacity.opacity"],
      ["row-2", "blur.radius"],
    ]);
    expect(validateGraph(whole(result))).toBeNull();
  });

  test("renders the same as before: the expanded toast is the old one under new ids", () => {
    const expanded = expandGroups(whole(grouped(["bl", "op"])));
    expect(expanded.nodes.map(({ id }) => id).sort()).toEqual(["anim", "free", "id2/bl", "id2/op", "in", "out", "v"]);
    expect(links(expanded.edges as Edge[])).toEqual(["id2/bl.radius>v", "id2/bl>id2/op", "id2/op.opacity>anim:t1", "id2/op>out", "in>id2/bl"]);
  });

  test("one source feeding two nodes inside: the group input feeds both, the instance takes one link", () => {
    const graph = toast();
    graph.nodes.push({ id: "ly", type: "layers", data: { layers: [{ id: "a", blendMode: "normal" }, { id: "b", blendMode: "normal" }] } });
    graph.edges = [
      { id: "1", source: "in", target: "bl" },
      { id: "2", source: "in", target: "ly", targetHandle: "b" },
      { id: "3", source: "bl", target: "ly", targetHandle: "a" },
      { id: "4", source: "ly", target: "out" },
    ];
    const result = grouped(["bl", "ly"], graph);
    expect(links(result.edges)).toEqual(["id2>out", "in>id2"]);
    expect(links(result.groups[0]!.edges)).toEqual(["bl>ly:a", "id3>bl", "id3>ly:b", "ly>id4"]);
  });

  test("a node with nothing in or out: an instance with no links, nothing wired inside", () => {
    const result = grouped(["free"]);
    expect(links(result.edges).filter((link) => link.includes("id2"))).toEqual([]);
    expect(result.groups[0]!.edges).toEqual([]);
  });

  test.each([
    [[], "select the nodes to group"],
    [["in", "bl"], "the input stays outside a group"],
    [["anim"], "the animation stays outside a group"],
    [["free"], null],
  ])("%j → %s", (selected, error) => {
    const result = groupSelection(root(), selected, null, ids());
    expect("error" in result ? result.error : null).toBe(error);
  });

  test("pixels from two sources, or out of two nodes — refused", () => {
    const graph = toast();
    graph.nodes.push({ id: "ly", type: "layers", data: { layers: [{ id: "a", blendMode: "normal" }, { id: "b", blendMode: "normal" }] } });
    graph.edges = [
      { id: "1", source: "in", target: "bl" },
      { id: "2", source: "bl", target: "op" },
      { id: "3", source: "op", target: "ly", targetHandle: "a" },
      { id: "4", source: "bl", target: "ly", targetHandle: "b" },
      { id: "5", source: "ly", target: "out" },
    ];
    expect(groupSelection(root(graph), ["ly"], null, ids())).toEqual({ error: "a group takes pixels from one node" });
    expect(groupSelection(root(graph), ["bl", "op"], null, ids())).toEqual({ error: "a group gives pixels out of one node" });
  });

  test("a param wired in from outside — refused", () => {
    expect(groupSelection(root(), ["v"], null, ids())).toEqual({ error: "a param wired in from outside — wire it inside the group" });
    // wired inside the selection — stays inside
    expect(groupSelection(root(), ["bl", "v"], null, ids())).not.toHaveProperty("error");
  });

  test("a delay in the selection goes in: its row wired out — a group input row, the param plays later", () => {
    const graph = toast();
    graph.nodes.push({ id: "d", type: "delay", data: { frames: 2, rows: [{ id: "r1" }] } });
    graph.edges = [
      ...graph.edges.filter(({ id }) => id !== "4"),
      { id: "6", source: "op", sourceHandle: "opacity", target: "d", targetHandle: "r1" },
      { id: "7", source: "d", sourceHandle: "r1", target: "anim", targetHandle: "t1" },
    ];
    const result = grouped(["bl", "op", "d"], graph);
    expect(links(result.edges)).toContain("id2.row-2>anim:t1");
    const param = exposedParams(result.groups, result.groups[0]).find(({ node }) => node === "d");
    expect(param).toMatchObject({ id: "row-2", node: "d", param: "r1", name: "opacity.opacity +2", type: "opacity", endParam: "opacity", path: ["op"] });
    expect(param!.bounds).toMatchObject({ min: 0, max: 1 });
    expect(validateGraph(whole(result))).toBeNull();
    // the instance's own value goes into the param behind the delay
    const nodes = result.nodes.map((node) => (node.type === "group" ? { ...node, data: { ...node.data, params: { "row-2": 0.25 } } } : node));
    const plain = expandGroups(whole({ ...result, nodes }));
    expect(plain.nodes.find(({ id }) => id === "id2/op")?.data).toEqual({ opacity: 0.25 });
  });

  test("an instance in the selection nests: its param wired out — the outer group's row", () => {
    const first = grouped(["bl", "op"]);
    const result = groupSelection(first, ["id2"], null, ids("n"));
    if ("error" in result) throw new Error(result.error);
    expect(result.groups.map(({ name }) => name)).toEqual(["group 1", "group 2"]);
    const outer = result.groups[1]!;
    expect(outer.nodes.find(({ id }) => id === "id2")?.type).toBe("group");
    const exposed = exposedParams(result.groups, outer);
    expect(exposed.map(({ name, path, endParam }) => [name, path, endParam])).toEqual([
      ["group 1.opacity.opacity", ["id2", "op"], "opacity"],
      ["group 1.blur.radius", ["id2", "bl"], "radius"],
    ]);
    expect(validateGraph(whole(result))).toBeNull();
    // expanded all the way down: the picture goes through blur and opacity
    const plain = expandGroups(whole(result));
    expect(plain.nodes.filter(({ type }) => type === "blur" || type === "opacity").map(({ id }) => id.split("/").length).sort()).toEqual([1, 3, 3]);
  });

  test("inside a group: the selection nests there, the open group's input row wired to the new instance", () => {
    const first = grouped(["bl", "op"]);
    // id1 group, id2 instance, id3 group input, id4 group output; now `op` inside id1 into a group of its own
    // n1 group, n2 instance, n3 its group input, n4 its group output
    const result = groupSelection(first, ["op"], "id1", ids("n"));
    if ("error" in result) throw new Error(result.error);
    const [outer, inner] = result.groups;
    expect(inner!.nodes.map(({ id }) => id).sort()).toEqual(["n3", "n4", "op"]);
    // within group 1: bl → the new instance → group output; the instance's row exposed in group 1's row-1
    expect(links(outer!.edges)).toEqual(["bl.radius>id3:row-2", "bl>n2", "id3>bl", "n2.row-1>id3:row-1", "n2>id4"]);
    // the root is as it was
    expect(result.nodes).toBe(first.nodes);
    expect(validateGraph(whole(result))).toBeNull();
    expect(exposedParams(result.groups, outer).map(({ name }) => name)).toEqual(["group 2.opacity.opacity", "blur.radius"]);
    // and back: ungroup inside group 1 puts opacity there again
    const back = ungroup(result, "n2", "id1", ids("b"))!;
    expect(back.groups[0]!.nodes.map(({ type }) => type).sort()).toEqual(["blur", "groupInput", "groupOutput", "opacity"]);
    expect(validateGraph(whole(back))).toBeNull();
  });

  test("a group input / output in the selection — refused", () => {
    const first = grouped(["bl", "op"]);
    expect(groupSelection(first, ["id3", "bl"], "id1", ids())).toEqual({ error: "the group input stays outside a group" });
  });

  test("holds: a group, the groups inside it, at any depth", () => {
    const first = grouped(["bl", "op"]);
    const result = groupSelection(first, ["id2"], null, ids("n"));
    if ("error" in result) throw new Error(result.error);
    const [inner, outer] = result.groups;
    expect(holds(result.groups, outer!.id, inner!.id)).toBe(true);
    expect(holds(result.groups, inner!.id, outer!.id)).toBe(false);
    expect(holds(result.groups, inner!.id, inner!.id)).toBe(true);
  });

  test("a row unwired deep inside goes up: the outer group's row and the root's links out of it", () => {
    const first = grouped(["bl", "op"]);
    const result = groupSelection(first, ["id2"], null, ids("n"));
    if ("error" in result) throw new Error(result.error);
    // group 1 stops exposing opacity: group 2's row for it ends nowhere, the root's track loses its link
    const groups = result.groups.map((group, i) => (i === 0 ? { ...group, edges: group.edges.filter(({ targetHandle }) => targetHandle !== "row-1") } : group));
    const pruned = withoutUnexposed({ nodes: result.nodes, edges: result.edges, groups });
    expect(pruned.edges.some(({ target }) => target === "anim")).toBe(false);
    expect(pruned.groups[1]!.edges.some(({ sourceHandle }) => sourceHandle === "row-1")).toBe(false);
    expect(validateGraph(whole(pruned))).toBeNull();
  });

  test("the next group is `group 2`", () => {
    const result = grouped(["bl", "op"]);
    const again = groupSelection(result, ["free"], null, () => crypto.randomUUID());
    expect("error" in again ? null : again.groups.map(({ name }) => name)).toEqual(["group 1", "group 2"]);
  });
});

describe("ungroup", () => {
  test("an instance back into its nodes under new ids, its own values in, wired where it stood", () => {
    const result = grouped(["bl", "op"]);
    const nodes = result.nodes.map((node) => (node.type === "group" ? { ...node, data: { ...node.data, params: { "row-2": 9 } } } : node));
    const back = ungroup({ ...result, nodes }, result.instance, null, ids())!;
    expect(links(back.edges)).toEqual(["id1.radius>v", "id1>id2", "id2.opacity>anim:t1", "id2>out", "in>id1"]);
    expect(back.nodes.find(({ id }) => id === "id1")?.data).toEqual({ radius: 9 });
    expect(back.nodes.find(({ id }) => id === "id2")?.data).toEqual({ opacity: 0.5 });
    expect(back.nodes.filter(({ selected }) => selected).map(({ id }) => id).sort()).toEqual(["id1", "id2"]);
    // the group stays — other instances, the menu
    expect(back.groups).toHaveLength(1);
    expect(validateGraph(whole(back))).toBeNull();
  });

  test("the inside keeps its layout, its corner where the instance stood", () => {
    const result = grouped(["bl", "op"]);
    const nodes = result.nodes.map((node) => (node.type === "group" ? { ...node, position: { x: 1000, y: 2000 } } : node));
    const inner = result.groups[0]!.nodes.filter(({ type }) => type === "blur" || type === "opacity");
    const back = ungroup({ ...result, nodes }, result.instance, null, ids())!;
    const dx = inner[1]!.position.x - inner[0]!.position.x;
    expect(back.nodes.find(({ id }) => id === "id1")?.position).toEqual({ x: 1000, y: 2000 });
    expect(back.nodes.find(({ id }) => id === "id2")?.position.x).toBe(1000 + dx);
  });

  test("not an instance — null", () => {
    expect(ungroup(root(), "bl")).toBeNull();
  });
});

describe("inside a group", () => {
  test("a link inside is judged with every instance: a cycle inside refused, a link to the group output fine", () => {
    const result = grouped(["bl", "op"]);
    const definition = result.groups[0]!;
    const scope = scopeOf(result, definition.id);
    expect(canConnect(definition.nodes, definition.edges, { source: "op", target: "bl" }, scope)).toBe(false);
    expect(canConnect(definition.nodes, definition.edges, { source: "bl", target: "id4" }, scope)).toBe(true);
    // the group output takes nothing out of it
    expect(canConnect(definition.nodes, definition.edges, { source: "id4", target: "bl" }, scope)).toBe(false);
  });

  test("at the root, a link out of an instance's exposed param is a param link", () => {
    const result = grouped(["bl", "op"]);
    const scope = scopeOf(result, null);
    const edges = result.edges.filter(({ target }) => target !== "v");
    expect(canConnect(result.nodes, edges, { source: "id2", sourceHandle: "row-2", target: "v" }, scope)).toBe(true);
    expect(canConnect(result.nodes, edges, { source: "id2", sourceHandle: "row-3", target: "v" }, scope)).toBe(false);
  });

  test("inside, a param wired into the group input's free row is exposed; into the group output — refused", () => {
    // `free` alone: id1 group, id2 instance, id3 group input (one free row), id4 group output
    const result = grouped(["free"]);
    const definition = result.groups[0]!;
    const scope = scopeOf(result, definition.id);
    const expose = { source: "free", sourceHandle: "opacity", target: "id3", targetHandle: "row-1" };
    expect(canConnect(definition.nodes, definition.edges, expose, scope)).toBe(true);
    expect(canConnect(definition.nodes, definition.edges, { ...expose, targetHandle: "ghost" }, scope)).toBe(false);
    expect(canConnect(definition.nodes, definition.edges, { source: "free", sourceHandle: "opacity", target: "id4" }, scope)).toBe(false);
  });

  test("a row unwired inside: the instances lose their own value and their links out of it", () => {
    const result = grouped(["bl", "op"]);
    const nodes = result.nodes.map((node) => (node.type === "group" ? { ...node, data: { ...node.data, params: { "row-1": 0.3, "row-2": 9 } } } : node));
    const groups = result.groups.map((group) => ({ ...group, edges: group.edges.filter(({ targetHandle }) => targetHandle !== "row-2") }));
    const pruned = withoutUnexposed({ nodes: nodes as FlowNode[], edges: result.edges, groups });
    expect(links(pruned.edges)).toEqual(["id2.row-1>anim:t1", "id2>out", "in>id2"]);
    expect(pruned.nodes.find(({ id }) => id === "id2")?.data).toEqual({ group: "id1", params: { "row-1": 0.3 } });
    expect(validateGraph(whole({ ...pruned, groups }))).toBeNull();
    // nothing to take — the same arrays back
    const same = withoutUnexposed({ nodes: nodes as FlowNode[], edges: result.edges, groups: result.groups });
    expect(same.nodes).toBe(nodes as FlowNode[]);
    expect(same.edges).toBe(result.edges);
    expect(same.groups).toBe(result.groups);
  });
});

describe("an instance's params", () => {
  test("own value, else the inner node's; the inner node's bounds", () => {
    const result = grouped(["bl", "op"]);
    const instance = result.nodes.find(({ type }) => type === "group")!;
    expect(ownParamValue(result.groups, instance, "row-2")).toBe(4);
    const own = { ...instance, data: { group: result.group, params: { "row-2": 12 } } } as FlowNode;
    expect(ownParamValue(result.groups, own, "row-2")).toBe(12);
    expect(ownParamValue(result.groups, own, "row-3")).toBeNull();
    expect(paramBoundsOf(result.groups, instance, "row-2")).toEqual({ min: 0, max: 20, initial: 4 });
  });

  test("labels: an instance by its group's name, the ends readable", () => {
    const result = grouped(["bl", "op"]);
    const [definition] = result.groups;
    expect(nodeLabel(result.nodes.find(({ type }) => type === "group")!, result.groups)).toBe("group 1");
    expect(definition!.nodes.map((node) => nodeLabel(node)).sort()).toEqual(["blur", "group input", "group output", "opacity"]);
  });

  test("a track on an exposed param is in the group's channel group", () => {
    const result = grouped(["bl", "op"]);
    const anim = result.nodes.find(({ type }) => type === "animation")!;
    const tracks = anim.type === "animation" ? anim.data.tracks : [];
    expect(trackGroups(result.nodes, result.edges, "anim", tracks, result.groups).map(({ name, rows }) => [name, rows.map(({ name }) => name)])).toEqual([
      ["group 1", ["opacity.opacity"]],
    ]);
    const instance = result.nodes.find(({ type }) => type === "group")!;
    expect(paramLabel({ node: instance, param: "row-2", shift: 0 }, result.groups)).toBe("group 1.blur.radius");
  });

  test("nextGroupName skips the taken numbers; createInstance — no own values", () => {
    expect(nextGroupName([{ name: "group 1" }, { name: "group 3" }] as FlowGroup[])).toBe("group 2");
    expect(createInstance("g", { x: 1, y: 2 }, "i")).toEqual({ id: "i", type: "group", position: { x: 1, y: 2 }, data: { group: "g" } });
  });
});

describe("saved with groups", () => {
  test("the groups and where their nodes stand survive a reload", () => {
    const result = grouped(["bl", "op"]);
    const groups = result.groups.map((group) => ({
      ...group,
      nodes: group.nodes.map((node) => (node.id === "bl" ? { ...node, position: { x: 123, y: 456 } } : node)),
    }));
    const flow = fromSaved(toSaved(result.nodes, result.edges, undefined, groups))!;
    expect(flow.groups?.map(({ id, name }) => [id, name])).toEqual([["id1", "group 1"]]);
    expect(flow.groups?.[0]?.nodes.find(({ id }) => id === "bl")?.position).toEqual({ x: 123, y: 456 });
    expect(toGraph(flow.nodes, flow.edges, undefined, flow.groups)).toEqual(whole(result));
  });

  test("toFlow lays a group's inside out from its group input, the ends not deletable", () => {
    const flow = toFlow(whole(grouped(["bl", "op"])));
    const inside = flow.groups![0]!.nodes;
    const x = (id: string) => inside.find((node) => node.id === id)!.position.x;
    expect(x("id3")).toBeLessThan(x("bl"));
    expect(x("bl")).toBeLessThan(x("op"));
    expect(x("op")).toBeLessThan(x("id4"));
    expect(inside.filter(({ deletable }) => deletable === false).map(({ id }) => id).sort()).toEqual(["id3", "id4"]);
  });
});
