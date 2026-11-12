import type { Edge, XYPosition } from "@xyflow/svelte";
import { expandGroups, paramBounds, validateGraph, type GroupParam, type ParamBounds } from "@xtc-toaster/contract";
import { NODE_LABELS, scopeOf, toGraph, type FlowGroup, type FlowNode, type FlowNodeOf, type MenuNodeType } from "./graph";

// Node groups in the editor (docs/sprints/sprint-5.spec.md, «node groups»): a definition's inside is a level of its
// own, an instance at the root stands for it. Pure — session applies the result

type Instance = FlowNodeOf<"group">;
const isInstance = (node: FlowNode | undefined): node is Instance => node?.type === "group";

// the ui name of a node: a group's instance by its group's name, the rest by type (NODE_LABELS)
export const nodeLabel = (node: FlowNode, groups: readonly FlowGroup[] = []): string => {
  if (isInstance(node)) return groups.find(({ id }) => id === node.data.group)?.name ?? "group";
  return NODE_LABELS[node.type as MenuNodeType] ?? node.type.replace(/^group(I|O)/, (_, c: string) => `group ${c.toLowerCase()}`);
};

// an exposed param as an instance shows it: the inner node, its param, the bounds and the inner node's own value
export type Exposed = GroupParam & { bounds: ParamBounds; value: number };
export const exposedParams = (group: FlowGroup | undefined): Exposed[] =>
  (group?.params ?? []).flatMap((param) => {
    const inner = group!.nodes.find(({ id }) => id === param.node);
    const bounds = inner && paramBounds(inner.type, param.param);
    const value = (inner?.data as Record<string, unknown> | undefined)?.[param.param];
    return bounds && typeof value === "number" ? [{ ...param, bounds, value }] : [];
  });

export const groupOf = (groups: readonly FlowGroup[], node: FlowNode | undefined): FlowGroup | undefined =>
  isInstance(node) ? groups.find(({ id }) => id === node.data.group) : undefined;

// a numeric param's bounds on a node of the level — an instance's exposed one by its inner node
export const paramBoundsOf = (groups: readonly FlowGroup[], node: FlowNode | undefined, param: string): ParamBounds | null => {
  if (!node) return null;
  if (!isInstance(node)) return paramBounds(node.type, param);
  return exposedParams(groupOf(groups, node)).find(({ id }) => id === param)?.bounds ?? null;
};

// the value a param has in the node's own data — an instance's: its own one, else the inner node's
export const ownParamValue = (groups: readonly FlowGroup[], node: FlowNode | undefined, param: string): number | null => {
  if (isInstance(node)) {
    const exposed = exposedParams(groupOf(groups, node)).find(({ id }) => id === param);
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

// A group made from the selected nodes of the root (blender's Ctrl+G, 10.11): they move into a new definition, an
// instance takes their place. What crossed the selection's border:
// - pixel links in — all from one source (one output may feed several nodes inside): the group input feeds those
//   nodes, the source feeds the instance;
// - pixel links out — all from one node inside: it feeds the group output, the instance feeds what it fed;
// - param links out (into a track, a delay, a value, a factor) — exposed params, wired out of the instance.
// Refused, with the reason: nothing selected, input / output / animation / a group in it, pixels from two sources or
// out of two nodes, a param wired in from outside, a delay wired out. The new toast passes validateGraph.
// The root, the groups and the new group's and instance's ids, or the reason it can't
export const groupSelection = (
  { nodes, edges, groups }: Root,
  selected: readonly string[],
  newId: () => string = () => crypto.randomUUID(),
): Grouped | { error: string } => {
  const inside = nodes.filter(({ id }) => selected.includes(id));
  if (inside.length === 0) return { error: "select the nodes to group" };
  const ids = new Set(inside.map(({ id }) => id));
  const stays = inside.find(({ type }) => ["input", "output", "animation"].includes(type));
  if (stays) return { error: `the ${stays.type} stays outside a group` };
  if (inside.some(({ type }) => type === "group")) return { error: "no group inside a group yet" };

  const within = edges.filter(({ source, target }) => ids.has(source) && ids.has(target));
  const into = edges.filter(({ source, target }) => !ids.has(source) && ids.has(target));
  const out = edges.filter(({ source, target }) => ids.has(source) && !ids.has(target));
  if (into.some(({ sourceHandle }) => sourceHandle)) return { error: "a param wired in from outside — wire it inside the group" };
  const sources = new Set(into.map(({ source }) => source));
  if (sources.size > 1) return { error: "a group takes pixels from one node" };
  const pixelOut = out.filter(({ sourceHandle }) => !sourceHandle);
  if (new Set(pixelOut.map(({ source }) => source)).size > 1) return { error: "a group gives pixels out of one node" };
  const paramOut = out.filter(({ sourceHandle }) => sourceHandle);
  const byId = new Map(inside.map((node) => [node.id, node]));
  if (paramOut.some(({ source }) => byId.get(source)?.type === "delay")) return { error: "a delay wired out of a group — not yet" };

  // an exposed param is named as its param, numbered when two share it: `x`, `x 2`
  const params: GroupParam[] = [];
  const exposedOf = new Map<string, string>();
  for (const { source, sourceHandle } of paramOut) {
    const key = `${source}\0${sourceHandle}`;
    if (exposedOf.has(key)) continue;
    let id = sourceHandle!;
    for (let n = 2; params.some((param) => param.id === id); n++) id = `${sourceHandle} ${n}`;
    params.push({ id, node: source, param: sourceHandle! });
    exposedOf.set(key, id);
  }

  const group = newId();
  const instance = newId();
  const input = newId();
  const output = newId();
  const box = boxOf(inside);
  const middle = (box.top + box.bottom) / 2;
  const definition: FlowGroup = {
    id: group,
    name: nextGroupName(groups),
    params,
    nodes: [
      { id: input, type: "groupInput", position: { x: box.left - NODE_GAP_X, y: middle }, data: {}, deletable: false },
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
    ],
  };
  const source = [...sources][0];
  const rootEdges: Edge[] = [
    ...edges.filter(({ source, target }) => !ids.has(source) && !ids.has(target)),
    ...(source === undefined ? [] : [{ id: `${source}-${instance}`, source, target: instance }]),
    ...pixelOut.map((edge) => ({ ...edge, id: `${instance}-${edge.id}`, source: instance })),
    ...paramOut.map((edge) => ({
      ...edge,
      id: `${instance}-${edge.id}`,
      source: instance,
      sourceHandle: exposedOf.get(`${edge.source}\0${edge.sourceHandle}`)!,
    })),
  ];
  const root: Root = {
    nodes: [
      ...nodes.filter(({ id }) => !ids.has(id)),
      { ...createInstance(group, { x: box.left, y: box.top }, instance), selected: true },
    ],
    edges: rootEdges,
    groups: [...groups, definition],
  };
  const issue = validateGraph(scopeOf(root, null)(toGraph(root.nodes, root.edges)));
  if (issue) return { error: issue.message };
  return { ...root, group, instance };
};

// The instance back into its nodes (blender's Alt+G): copies of its group's inside under new ids, its own param values
// written in, wired where it stood (the contract's expandGroups for this one instance). The group stays — other
// instances and the left menu keep it. Null — not an instance
export const ungroup = (
  { nodes, edges, groups }: Root,
  instanceId: string,
  newId: () => string = () => crypto.randomUUID(),
): Root | null => {
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
  return {
    nodes: graph.nodes.map((node) => {
      const was = placed.get(node.id)!;
      return { ...was, id: node.id, data: node.data, ...(added.has(node.id) && { selected: true }) } as FlowNode;
    }),
    edges: graph.edges as Edge[],
    groups,
  };
};
