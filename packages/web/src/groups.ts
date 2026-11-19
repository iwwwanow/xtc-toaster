import type { Edge, XYPosition } from "@xyflow/svelte";
import {
  behindDelays,
  expandGroups,
  exposedEnd,
  exposedParams as wiredParams,
  paramBounds,
  validateGraph,
  type GroupDefinition,
  type GroupParam,
  type ParamBounds,
} from "@xtc-toaster/contract";
import { levelOf, NODE_LABELS, scopeOf, toGraph, type FlowGroup, type FlowNode, type FlowNodeOf, type MenuNodeType } from "./graph";

// Node groups in the editor (docs/sprints/sprint-5.spec.md, «node groups»): a definition's inside is a level of its
// own, an instance at the root stands for it. Pure — session applies the result

type Instance = FlowNodeOf<"group">;
const isInstance = (node: FlowNode | undefined): node is Instance => node?.type === "group";

// the ui name of a node: a group's instance by its group's name, the rest by type (NODE_LABELS)
export const nodeLabel = (node: FlowNode, groups: readonly FlowGroup[] = []): string => {
  if (isInstance(node)) return groups.find(({ id }) => id === node.data.group)?.name ?? "group";
  return NODE_LABELS[node.type as MenuNodeType] ?? node.type.replace(/^group(I|O)/, (_, c: string) => `group ${c.toLowerCase()}`);
};

// the definitions as the contract takes them (xyflow's null handles dropped), once per groups array
const definitionsCache = new WeakMap<readonly FlowGroup[], GroupDefinition[]>();
const definitionsOf = (groups: readonly FlowGroup[]): GroupDefinition[] => {
  let definitions = definitionsCache.get(groups);
  if (!definitions) {
    definitions = groups.map(({ id, name, nodes, edges }) => ({ id, name, ...levelOf(nodes, edges) }));
    definitionsCache.set(groups, definitions);
  }
  return definitions;
};

// an exposed param as an instance shows it: the group input's row (`id`), what is wired into it (`node`, `param` — a
// node's param, a delay's row, an inner instance's row), its name as the group input's row shows it (`node.param`,
// through a delay `node.param +2`, through an inner instance `group 1.rotate.angle`), and where it ends (the
// contract's exposedEnd): the plain node's type and param, the ids down to it, the bounds and the value it has there
export type Exposed = GroupParam & { name: string; type: string; endParam: string; path: string[]; bounds: ParamBounds; value: number };
export const exposedParams = (groups: readonly FlowGroup[], group: FlowGroup | undefined): Exposed[] => {
  if (!group) return [];
  const definitions = definitionsOf(groups);
  const definition = definitions.find(({ id }) => id === group.id);
  if (!definition) return [];
  return wiredParams(definition).flatMap((param) => {
    const end = exposedEnd(definitions, definition, param.id);
    const behind = behindDelays(definition, param.node, param.param);
    const node = behind && group.nodes.find(({ id }) => id === behind.node.id);
    if (!end || !behind || !node) return [];
    const name = `${nodeLabel(node, groups)}.${paramName(groups, node, behind.param)}${shiftLabel(behind.shift)}`;
    return [{ ...param, name, type: end.node.type, endParam: end.param, path: end.path, bounds: end.bounds, value: end.value }];
  });
};
export const shiftLabel = (shift: number) => (shift === 0 ? "" : ` ${shift > 0 ? "+" : "−"}${Math.abs(shift)}`);

// a param's name on its node — an instance's exposed one by what it exposes (`rotate.angle`), not its row id
export const paramName = (groups: readonly FlowGroup[], node: FlowNode, param: string): string =>
  isInstance(node) ? (exposedParams(groups, groupOf(groups, node)).find(({ id }) => id === param)?.name ?? param) : param;

// What an edit inside a group takes away from its instances (12.11), wherever they stand — the root or inside
// another group (19.11): a row unwired, the param it exposed is gone, and with it each instance's own value for it
// and its links out of it — blender drops a socket's links with the socket. A link dropped inside a group may unwire
// that group's row in turn, so it goes on until nothing changes. The same arrays back when nothing goes
type Pruned = { nodes: FlowNode[]; edges: Edge[]; groups: FlowGroup[] };
export const withoutUnexposed = ({ nodes, edges, groups }: Pruned): Pruned => {
  const level = (nodes: FlowNode[], edges: Edge[], exposed: Map<string, Set<string>>) => {
    const rowsOf = (id: string) => {
      const node = nodes.find((node) => node.id === id);
      return isInstance(node) ? exposed.get(node.data.group) : undefined;
    };
    const kept = edges.filter(({ source, sourceHandle }) => !sourceHandle || (rowsOf(source)?.has(sourceHandle) ?? true));
    let changed = false;
    const pruned = nodes.map((node) => {
      const rows = isInstance(node) ? exposed.get(node.data.group) : undefined;
      const own = isInstance(node) ? node.data.params : undefined;
      if (!rows || !own || Object.keys(own).every((id) => rows.has(id))) return node;
      changed = true;
      const params = Object.fromEntries(Object.entries(own).filter(([id]) => rows.has(id)));
      return { ...node, data: { ...node.data, params } } as FlowNode;
    });
    return { nodes: changed ? pruned : nodes, edges: kept.length === edges.length ? edges : kept };
  };
  let result = { nodes, edges, groups };
  // bounded: each round that changes something drops a link; a nesting deeper than the groups is a loop
  for (let round = 0; round <= groups.length; round++) {
    const exposed = new Map(result.groups.map((group) => [group.id, new Set(exposedParams(result.groups, group).map(({ id }) => id))]));
    const root = level(result.nodes, result.edges, exposed);
    let changed = root.nodes !== result.nodes || root.edges !== result.edges;
    const next = result.groups.map((group) => {
      const inside = level(group.nodes, group.edges, exposed);
      if (inside.nodes === group.nodes && inside.edges === group.edges) return group;
      changed = true;
      return { ...group, ...inside };
    });
    if (!changed) break;
    result = { ...root, groups: next };
  }
  return result;
};

export const groupOf = (groups: readonly FlowGroup[], node: FlowNode | undefined): FlowGroup | undefined =>
  isInstance(node) ? groups.find(({ id }) => id === node.data.group) : undefined;

// a numeric param's bounds on a node of the level — an instance's exposed one by its inner node
export const paramBoundsOf = (groups: readonly FlowGroup[], node: FlowNode | undefined, param: string): ParamBounds | null => {
  if (!node) return null;
  if (!isInstance(node)) return paramBounds(node.type, param);
  return exposedParams(groups, groupOf(groups, node)).find(({ id }) => id === param)?.bounds ?? null;
};

// the value a param has in the node's own data — an instance's: its own one, else the inner node's
export const ownParamValue = (groups: readonly FlowGroup[], node: FlowNode | undefined, param: string): number | null => {
  if (isInstance(node)) {
    const exposed = exposedParams(groups, groupOf(groups, node)).find(({ id }) => id === param);
    return exposed ? (node.data.params?.[param] ?? exposed.value) : null;
  }
  const value = (node?.data as Record<string, unknown> | undefined)?.[param];
  return typeof value === "number" ? value : null;
};

// a slider's step for a param it knows only by its bounds (an exposed one): whole numbers over a wide integer range,
// hundredths for the rest (opacity, scale, factor, value)
export const stepOf = ({ min, max }: ParamBounds, type?: string): number =>
  type !== "value" && Number.isInteger(min) && Number.isInteger(max) && max - min > 10 ? 1 : 0.01;

// `group 1`, `group 2`, … — the first number no group's name has
export const nextGroupName = (groups: readonly FlowGroup[]): string => {
  let n = 1;
  while (groups.some(({ name }) => name === `group ${n}`)) n++;
  return `group ${n}`;
};

// what the left menu drags out: a node type, or `group:<id>` — an instance of that group
export type MenuItem = MenuNodeType | `group:${string}`;
const GROUP_ITEM = "group:";
export const groupItem = (group: string): MenuItem => `${GROUP_ITEM}${group}`;
export const itemGroup = (item: string): string | null => (item.startsWith(GROUP_ITEM) ? item.slice(GROUP_ITEM.length) : null);

export const createInstance = (group: string, position: XYPosition, id: string = crypto.randomUUID()): Instance => ({
  id,
  type: "group",
  position,
  data: { group },
});

const NODE_GAP_X = 400;

// the box the nodes stand in — their positions, the size where measured
const boxOf = (nodes: readonly FlowNode[]) => {
  const xs = nodes.map(({ position }) => position.x);
  const ys = nodes.map(({ position }) => position.y);
  const rights = nodes.map(({ position, measured }) => position.x + (measured?.width ?? 0));
  const bottoms = nodes.map(({ position, measured }) => position.y + (measured?.height ?? 0));
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...rights), bottom: Math.max(...bottoms) };
};

type Root = { nodes: FlowNode[]; edges: Edge[]; groups: FlowGroup[] };
export type Grouped = Root & { group: string; instance: string };

// a level of the toast — the root (`level` null) or a group's inside — read and written back
const levelIn = ({ nodes, edges, groups }: Root, level: string | null) => {
  const open = level === null ? undefined : groups.find(({ id }) => id === level);
  return open ? { nodes: open.nodes, edges: open.edges } : { nodes, edges };
};
const withLevel = (root: Root, level: string | null, nodes: FlowNode[], edges: Edge[], groups = root.groups): Root =>
  level === null
    ? { nodes, edges, groups }
    : { ...root, groups: groups.map((group) => (group.id === level ? { ...group, nodes, edges } : group)) };

// does `outer` hold an instance of `inner`, at any depth (or is it `inner`) — an instance of `outer` inside `inner`
// would be a group holding itself
export const holds = (groups: readonly FlowGroup[], outer: string, inner: string): boolean => {
  const seen = new Set<string>();
  const walk = (id: string): boolean => {
    if (id === inner) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    const group = groups.find((group) => group.id === id);
    return group?.nodes.some((node) => isInstance(node) && walk(node.data.group)) ?? false;
  };
  return walk(outer);
};

// A group made from the selected nodes of a level — the root or a group's inside, then the new group nests in it
// (blender's Ctrl+G, 10.11; nested 19.11): they move into a new definition, an instance takes their place. What
// crossed the selection's border:
// - pixel links in — all from one source (one output may feed several nodes inside): the group input feeds those
//   nodes, the source feeds the instance;
// - pixel links out — all from one node inside: it feeds the group output, the instance feeds what it fed;
// - param links out (into a track, a delay, a value, a factor, the open group's input) — exposed params: each wired
//   into a row of the group input (`row-1`, …, a free one under them), the instance's param of that row wired where it
//   went. A delay's row wired out is one too: the param behind it plays later.
// Refused, with the reason: nothing selected, input / output / animation / group input / group output in it, pixels
// from two sources or out of two nodes, a param wired in from outside. The new toast passes validateGraph.
// The root, the groups and the new group's and instance's ids, or the reason it can't
export const groupSelection = (
  root: Root,
  selected: readonly string[],
  level: string | null = null,
  newId: () => string = () => crypto.randomUUID(),
): Grouped | { error: string } => {
  const { groups } = root;
  const { nodes, edges } = levelIn(root, level);
  const inside = nodes.filter(({ id }) => selected.includes(id));
  if (inside.length === 0) return { error: "select the nodes to group" };
  const ids = new Set(inside.map(({ id }) => id));
  const stays = inside.find(({ type }) => ["input", "output", "animation", "groupInput", "groupOutput"].includes(type));
  if (stays) return { error: `the ${nodeLabel(stays, groups)} stays outside a group` };

  const within = edges.filter(({ source, target }) => ids.has(source) && ids.has(target));
  const into = edges.filter(({ source, target }) => !ids.has(source) && ids.has(target));
  const out = edges.filter(({ source, target }) => ids.has(source) && !ids.has(target));
  if (into.some(({ sourceHandle }) => sourceHandle)) return { error: "a param wired in from outside — wire it inside the group" };
  const sources = new Set(into.map(({ source }) => source));
  if (sources.size > 1) return { error: "a group takes pixels from one node" };
  const pixelOut = out.filter(({ sourceHandle }) => !sourceHandle);
  if (new Set(pixelOut.map(({ source }) => source)).size > 1) return { error: "a group gives pixels out of one node" };
  const paramOut = out.filter(({ sourceHandle }) => sourceHandle);

  // a row per param wired out (a param has one link out — the contract's «one track per param»)
  const rowOf = new Map<string, string>();
  for (const { source, sourceHandle } of paramOut) {
    const key = `${source}\0${sourceHandle}`;
    if (!rowOf.has(key)) rowOf.set(key, `row-${rowOf.size + 1}`);
  }
  const rows = [...rowOf.values(), `row-${rowOf.size + 1}`].map((id) => ({ id }));

  const group = newId();
  const instance = newId();
  const input = newId();
  const output = newId();
  const box = boxOf(inside);
  const middle = (box.top + box.bottom) / 2;
  const definition: FlowGroup = {
    id: group,
    name: nextGroupName(groups),
    nodes: [
      { id: input, type: "groupInput", position: { x: box.left - NODE_GAP_X, y: middle }, data: { rows }, deletable: false },
      ...inside.map((node) => ({ ...node, selected: false, dragging: false })),
      { id: output, type: "groupOutput", position: { x: box.right + NODE_GAP_X / 2, y: middle }, data: {}, deletable: false },
    ],
    edges: [
      ...within,
      ...into.map(({ target, targetHandle }) => {
        const link = { source: input, target, ...(targetHandle && { targetHandle }) };
        return { id: `${input}-${target}${targetHandle ?? ""}`, ...link };
      }),
      ...[...new Set(pixelOut.map(({ source }) => source))].map((source) => ({ id: `${source}-${output}`, source, target: output })),
      ...[...rowOf].map(([key, row]) => {
        const [source, sourceHandle] = key.split("\0") as [string, string];
        return { id: `${source}-${sourceHandle}-${input}-${row}`, source, sourceHandle, target: input, targetHandle: row };
      }),
    ],
  };
  const source = [...sources][0];
  const levelEdges: Edge[] = [
    ...edges.filter(({ source, target }) => !ids.has(source) && !ids.has(target)),
    ...(source === undefined ? [] : [{ id: `${source}-${instance}`, source, target: instance }]),
    ...pixelOut.map((edge) => ({ ...edge, id: `${instance}-${edge.id}`, source: instance })),
    ...paramOut.map((edge) => ({
      ...edge,
      id: `${instance}-${edge.id}`,
      source: instance,
      sourceHandle: rowOf.get(`${edge.source}\0${edge.sourceHandle}`)!,
    })),
  ];
  const levelNodes = [
    ...nodes.filter(({ id }) => !ids.has(id)),
    { ...createInstance(group, { x: box.left, y: box.top }, instance), selected: true },
  ];
  const next = withLevel(root, level, levelNodes, levelEdges, [...groups, definition]);
  const issue = validateGraph(scopeOf(next, null)(toGraph(next.nodes, next.edges)));
  if (issue) return { error: issue.message };
  return { ...next, group, instance };
};

// The instance back into its nodes (blender's Alt+G), in its level — the root or a group's inside: copies of its
// group's inside under new ids — an inner instance stays an instance — its own param values written in, wired where
// it stood (the contract's expandGroups for this one instance). The group stays — other instances and the left menu
// keep it. Null — not an instance
export const ungroup = (
  root: Root,
  instanceId: string,
  level: string | null = null,
  newId: () => string = () => crypto.randomUUID(),
): Root | null => {
  const { groups } = root;
  const { nodes, edges } = levelIn(root, level);
  const instance = nodes.find(({ id }) => id === instanceId);
  const group = groupOf(groups, instance);
  if (!instance || !group) return null;
  const renamed = new Map<string, string>();
  const id = (_: string, inner: string) => {
    if (!renamed.has(inner)) renamed.set(inner, newId());
    return renamed.get(inner)!;
  };
  const graph = expandGroups(toGraph(nodes, edges, undefined, groups), { only: new Set([instanceId]), id });
  // the inside keeps its layout, its top-left corner where the instance stood
  const inner = group.nodes.filter(({ type }) => type !== "groupInput" && type !== "groupOutput");
  const box = inner.length > 0 ? boxOf(inner) : { left: 0, top: 0 };
  const placed = new Map<string, FlowNode>(nodes.map((node) => [node.id, node]));
  for (const node of inner)
    placed.set(id(instanceId, node.id), {
      ...node,
      position: { x: instance.position.x + node.position.x - box.left, y: instance.position.y + node.position.y - box.top },
      selected: true,
    });
  const added = new Set(inner.map((node) => id(instanceId, node.id)));
  const levelNodes = graph.nodes.map((node) => {
    const was = placed.get(node.id)!;
    return { ...was, id: node.id, data: node.data, ...(added.has(node.id) && { selected: true }) } as FlowNode;
  });
  return withLevel(root, level, levelNodes, graph.edges as Edge[]);
};
