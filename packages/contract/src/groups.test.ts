import { describe, expect, test } from "bun:test";
import { graphAtFrame } from "./animation";
import { TOAST_GRAPH_VERSION } from "./constants";
import { parseToastGraph, type GraphEdge, type GraphNode, type GroupDefinition, type ToastGraph } from "./graph";
import { expandGroups, exposedParams, instanceOf } from "./groups";
import { validateGraph } from "./validate";

// a group: in → blur → opacity → out, blur's radius shown as `r` (wired into the group input's row `r`)
const blurFade = (extra: Partial<GroupDefinition> = {}): GroupDefinition => ({
  id: "bf",
  name: "blur fade",
  nodes: [
    { id: "gi", type: "groupInput", data: { rows: [{ id: "r" }, { id: "free" }] } },
    { id: "bl", type: "blur", data: { radius: 4 } },
    { id: "op", type: "opacity", data: { opacity: 0.5 } },
    { id: "go", type: "groupOutput", data: {} },
  ],
  edges: [
    { id: "a", source: "gi", target: "bl" },
    { id: "b", source: "bl", target: "op" },
    { id: "c", source: "op", target: "go" },
    { id: "p", source: "bl", sourceHandle: "radius", target: "gi", targetHandle: "r" },
  ],
  ...extra,
});
const instance = (id: string, params?: Record<string, number>, group = "bf"): GraphNode => ({
  id,
  type: "group",
  data: { group, ...(params && { params }) },
});
const toast = (nodes: GraphNode[], edges: GraphEdge[], groups: GroupDefinition[] = [blurFade()]): ToastGraph => ({
  version: TOAST_GRAPH_VERSION,
  nodes: [{ id: "in", type: "input", data: { imageId: null } }, ...nodes, { id: "out", type: "output", data: {} }],
  edges,
  groups,
});
const links = ({ edges }: ToastGraph) =>
  edges.map(({ source, sourceHandle, target, targetHandle }) => `${source}${sourceHandle ? `.${sourceHandle}` : ""}>${target}${targetHandle ? `:${targetHandle}` : ""}`).sort();
const ids = ({ nodes }: ToastGraph) => nodes.map(({ id }) => id).sort();

describe("expandGroups", () => {
  test("an instance becomes its inside, wired where it stood", () => {
    const graph = expandGroups(toast([instance("g")], [{ id: "1", source: "in", target: "g" }, { id: "2", source: "g", target: "out" }]));
    expect(ids(graph)).toEqual(["g/bl", "g/op", "in", "out"]);
    expect(links(graph)).toEqual(["g/bl>g/op", "g/op>out", "in>g/bl"]);
    expect(graph).not.toHaveProperty("groups");
    expect(validateGraph(graph)).toBeNull();
  });

  test("an instance's own param values go into the inside; a missing one — the inner node's", () => {
    const graph = expandGroups(toast([instance("g", { r: 12 }), instance("h")], []));
    expect(graph.nodes.find(({ id }) => id === "g/bl")?.data).toEqual({ radius: 12 });
    expect(graph.nodes.find(({ id }) => id === "h/bl")?.data).toEqual({ radius: 4 });
  });

  test("two instances in a row, each its own copy", () => {
    const graph = expandGroups(
      toast([instance("g"), instance("h")], [
        { id: "1", source: "in", target: "g" },
        { id: "2", source: "g", target: "h" },
        { id: "3", source: "h", target: "out" },
      ]),
    );
    expect(links(graph)).toEqual(["g/bl>g/op", "g/op>h/bl", "h/bl>h/op", "h/op>out", "in>g/bl"]);
  });

  test("only: one instance expanded under the ids it's given, the others and the groups stay", () => {
    const graph = expandGroups(
      toast([instance("g", { r: 9 }), instance("h")], [
        { id: "1", source: "in", target: "g" },
        { id: "2", source: "g", target: "h" },
        { id: "3", source: "h", target: "out" },
      ]),
      { only: new Set(["g"]), id: (_, inner) => `new-${inner}` },
    );
    expect(ids(graph)).toEqual(["h", "in", "new-bl", "new-op", "out"]);
    expect(links(graph)).toEqual(["h>out", "in>new-bl", "new-bl>new-op", "new-op>h"]);
    expect(graph.nodes.find(({ id }) => id === "new-bl")?.data).toEqual({ radius: 9 });
    expect(graph.groups).toEqual([blurFade()]);
    expect(validateGraph(graph)).toBeNull();
  });

  test("group input straight to group output passes the picture through: A → B", () => {
    const through = blurFade({
      nodes: [
        { id: "gi", type: "groupInput", data: { rows: [] } },
        { id: "go", type: "groupOutput", data: {} },
      ],
      edges: [{ id: "a", source: "gi", target: "go" }],
    });
    const graph = expandGroups(toast([instance("g")], [{ id: "1", source: "in", target: "g" }, { id: "2", source: "g", target: "out" }], [through]));
    expect(links(graph)).toEqual(["in>out"]);
  });

  test("a param link out of an instance leaves the inner node's param", () => {
    const anim: GraphNode = { id: "anim", type: "animation", data: { fps: 24, frames: 10, tracks: [{ id: "t", keys: [{ frame: 0, value: 2 }, { frame: 9, value: 20 }] }] } };
    const graph = expandGroups(
      toast([instance("g"), anim], [
        { id: "1", source: "in", target: "g" },
        { id: "2", source: "g", target: "out" },
        { id: "3", source: "g", sourceHandle: "r", target: "anim", targetHandle: "t" },
      ]),
    );
    expect(links(graph)).toContain("g/bl.radius>anim:t");
    expect(graphAtFrame(graph, 9).nodes.find(({ id }) => id === "g/bl")?.data).toEqual({ radius: 20 });
  });

  test("a graph without instances is left as it is (no groups field)", () => {
    const plain = toast([], [{ id: "1", source: "in", target: "out" }], []);
    const { groups: _, ...withoutGroups } = plain;
    expect(expandGroups(withoutGroups)).toBe(withoutGroups);
    expect(expandGroups(plain)).not.toHaveProperty("groups");
  });

  test("an expanded node points back at its instance", () => {
    expect(instanceOf(toast([instance("g")], []), "g/bl")).toBe("g");
    expect(instanceOf(toast([instance("g")], []), "in")).toBe("in");
  });
});

describe("exposedParams", () => {
  test("the wired rows in their order, an unwired one exposes nothing", () => {
    const definition = blurFade({
      nodes: [{ id: "gi", type: "groupInput", data: { rows: [{ id: "o" }, { id: "free" }, { id: "r" }] } }, ...blurFade().nodes.slice(1)],
      edges: [...blurFade().edges, { id: "q", source: "op", sourceHandle: "opacity", target: "gi", targetHandle: "o" }],
    });
    expect(exposedParams(definition)).toEqual([
      { id: "o", node: "op", param: "opacity" },
      { id: "r", node: "bl", param: "radius" },
    ]);
  });
});

describe("validateGraph with groups", () => {
  const chain = (params?: Record<string, number>) =>
    toast([instance("g", params)], [{ id: "1", source: "in", target: "g" }, { id: "2", source: "g", target: "out" }]);

  test("an instance in the chain passes", () => {
    expect(validateGraph(chain({ r: 10 }))).toBeNull();
  });

  test.each([
    ["no group output", blurFade({ nodes: blurFade().nodes.filter(({ type }) => type !== "groupOutput"), edges: blurFade().edges.slice(0, 2) })],
    ["a group inside", blurFade({ nodes: [...blurFade().nodes, instance("x")] })],
    ["the animation node inside", blurFade({ nodes: [...blurFade().nodes, { id: "an", type: "animation", data: { fps: 24, frames: 1, tracks: [] } }] })],
    ["a loop inside", blurFade({ edges: [...blurFade().edges, { id: "d", source: "op", target: "bl" }] })],
    ["a delay inside", blurFade({ nodes: [...blurFade().nodes, { id: "d", type: "delay", data: { frames: 1, rows: [] } }] })],
    ["a shown param that isn't numeric", blurFade({ edges: [...blurFade().edges.slice(0, 3), { id: "p", source: "bl", sourceHandle: "color", target: "gi", targetHandle: "r" }] })],
    ["a shown param of a missing node", blurFade({ edges: [...blurFade().edges.slice(0, 3), { id: "p", source: "ghost", sourceHandle: "radius", target: "gi", targetHandle: "r" }] })],
    ["a param into a missing row", blurFade({ edges: [...blurFade().edges.slice(0, 3), { id: "p", source: "bl", sourceHandle: "radius", target: "gi", targetHandle: "ghost" }] })],
    ["two params into one row", blurFade({ edges: [...blurFade().edges, { id: "q", source: "op", sourceHandle: "opacity", target: "gi", targetHandle: "r" }] })],
    ["one param into two rows", blurFade({ edges: [...blurFade().edges, { id: "q", source: "bl", sourceHandle: "radius", target: "gi", targetHandle: "free" }] })],
    [
      "a shown param a value inside drives too",
      blurFade({
        nodes: [...blurFade().nodes, { id: "v", type: "value", data: { value: 3 } }],
        edges: [...blurFade().edges, { id: "q", source: "bl", sourceHandle: "radius", target: "v" }],
      }),
    ],
    ["a pixel link into the group input", blurFade({ edges: [...blurFade().edges, { id: "q", source: "op", target: "gi" }] })],
  ])("refuses a definition with %s, pointing at the group", (_, definition) => {
    expect(validateGraph(toast([], [{ id: "1", source: "in", target: "out" }], [definition]))).toMatchObject({ group: "bf" });
  });

  test.each([
    ["a missing definition", toast([instance("g", undefined, "ghost")], [])],
    ["a param the group doesn't show", toast([instance("g", { z: 1 })], [])],
    ["a link out of a param the group doesn't show", toast([instance("g"), { id: "v", type: "value", data: { value: 1 } }], [{ id: "1", source: "g", sourceHandle: "z", target: "v" }])],
    ["a link into an instance's named handle", toast([instance("g")], [{ id: "1", source: "in", target: "g", targetHandle: "a" }])],
    ["a param out of its bounds", toast([instance("g", { r: 99 })], [])],
  ])("refuses an instance with %s", (_, graph) => {
    expect(validateGraph(graph)).toMatchObject({ nodeId: "g" });
  });

  test("a value's own param exposed drives every param wired into it", () => {
    const shared = blurFade({
      nodes: [...blurFade().nodes, { id: "v", type: "value", data: { value: 3 } }],
      edges: [
        ...blurFade().edges.slice(0, 3),
        { id: "q", source: "bl", sourceHandle: "radius", target: "v" },
        { id: "p", source: "v", sourceHandle: "value", target: "gi", targetHandle: "r" },
      ],
    });
    const graph = toast([instance("g", { r: 7 })], [{ id: "1", source: "in", target: "g" }, { id: "2", source: "g", target: "out" }], [shared]);
    expect(validateGraph(graph)).toBeNull();
    expect(graphAtFrame(expandGroups(graph), 0).nodes.find(({ id }) => id === "g/bl")?.data).toEqual({ radius: 7 });
  });

  test("a group input outside a group is refused", () => {
    expect(validateGraph(toast([{ id: "gi", type: "groupInput", data: { rows: [] } }], [{ id: "1", source: "in", target: "out" }]))).toMatchObject({ nodeId: "gi" });
  });

  test("an issue of the expanded graph points at the instance", () => {
    // two links into the output: one from the input, one out of the instance
    const graph = toast([instance("g")], [
      { id: "1", source: "in", target: "g" },
      { id: "2", source: "g", target: "out" },
      { id: "3", source: "in", target: "out" },
    ]);
    expect(validateGraph(graph)?.nodeId).toBe("out");
    const loop = toast([instance("g"), instance("h")], [
      { id: "1", source: "g", target: "h" },
      { id: "2", source: "h", target: "g" },
      { id: "3", source: "in", target: "out" },
    ]);
    expect(["g", "h"].includes(validateGraph(loop)?.nodeId ?? "")).toBe(true);
  });

  test("the toast file takes groups; without them it's unchanged", () => {
    expect(parseToastGraph(chain({ r: 10 })).groups).toHaveLength(1);
    const { groups: _, ...plain } = chain();
    expect(parseToastGraph(plain)).not.toHaveProperty("groups");
  });
});
