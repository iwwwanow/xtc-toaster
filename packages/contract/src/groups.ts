import type { GraphEdge, GraphNode, GroupDefinition, GroupNode, NodeId, ToastGraph } from "./graph";
import { paramBounds, type ParamBounds } from "./params";

// an expanded inner node's id: `<instance>/<inner>` — an issue there is shown on the instance (instanceOf)
export const GROUP_SEPARATOR = "/";
export const innerId = (instance: NodeId, inner: NodeId) => `${instance}${GROUP_SEPARATOR}${inner}`;

const isInstance = (node: GraphNode | undefined): node is GroupNode => node?.type === "group";
const isGroupEnd = ({ type }: GraphNode) => type === "groupInput" || type === "groupOutput";

// an exposed param: what is wired into the group input's row `id` — an inner node's `param`, a delay's row (the param
// behind it plays `frames` later) or an inner instance's exposed param (its row id); on the instance a field and a
// param output, both named by the row id
export type GroupParam = { id: string; node: NodeId; param: string };

// the params a definition exposes, in its group input's row order; an unwired row exposes nothing
export const exposedParams = ({ nodes, edges }: Pick<GroupDefinition, "nodes" | "edges">): GroupParam[] => {
  const input = nodes.find((node) => node.type === "groupInput");
  if (input?.type !== "groupInput") return [];
  return input.data.rows.flatMap(({ id }) => {
    const link = edges.find(({ target, targetHandle }) => target === input.id && targetHandle === id);
    return link?.sourceHandle === undefined ? [] : [{ id, node: link.source, param: link.sourceHandle }];
  });
};

// the param a link out of `node`'s `param` inside a definition carries, back through any delays: the node and the
// param it sets — an inner instance's row is one too. Null — a delay row nothing is wired into
export const behindDelays = (
  { nodes, edges }: Pick<GroupDefinition, "nodes" | "edges">,
  node: NodeId,
  param: string,
): { node: GraphNode; param: string } | null => {
  // bounded: validateGraph refuses a loop, an unvalidated definition mustn't hang
  for (let step = 0; step <= nodes.length; step++) {
    const found = nodes.find(({ id }) => id === node);
    if (!found) return null;
    if (found.type !== "delay") return { node: found, param };
    const link = edges.find(({ target, targetHandle }) => target === node && targetHandle === param);
    if (link?.sourceHandle === undefined) return null;
    ({ source: node, sourceHandle: param } = { source: link.source, sourceHandle: link.sourceHandle });
  }
  return null;
};

// An exposed param as an instance takes it (nested groups, 19.11): the param it ends at — through delays and inner
// instances down to a plain node's — its bounds and the value it has there: an inner instance's own one on the way
// wins over the node's. The inner `node` and `param` — the plain node the row ends at. Null — it ends at nothing
// numeric (a missing node, an unwired delay row, a definition that isn't there)
export type ExposedEnd = { node: GraphNode; param: string; bounds: ParamBounds; value: number };
export const exposedEnd = (groups: readonly GroupDefinition[], definition: GroupDefinition, row: string): ExposedEnd | null => {
  const walk = (definition: GroupDefinition, row: string, depth: number): ExposedEnd | null => {
    const exposed = exposedParams(definition).find(({ id }) => id === row);
    const end = exposed && behindDelays(definition, exposed.node, exposed.param);
    if (!end || depth > groups.length) return null;
    if (end.node.type === "group") {
      const { group, params } = end.node.data;
      const inner = groups.find(({ id }) => id === group);
      const found = inner && walk(inner, end.param, depth + 1);
      return found ? { ...found, value: params?.[end.param] ?? found.value } : null;
    }
    const bounds = paramBounds(end.node.type, end.param);
    const value = (end.node.data as Record<string, unknown>)[end.param];
    return bounds && typeof value === "number" ? { node: end.node, param: end.param, bounds, value } : null;
  };
  return walk(definition, row, 0);
};

// the instance an expanded node came from, or the id itself — a root node
export const instanceOf = (graph: ToastGraph, id: NodeId): NodeId => {
  const instance = graph.nodes.find((node) => isInstance(node) && id.startsWith(`${node.id}${GROUP_SEPARATOR}`));
  return instance?.id ?? id;
};

type End = { node: NodeId; handle?: string };

// A plain graph out of one with groups (docs/sprints/sprint-5.spec.md, «node groups»): every instance becomes copies of
// its definition's nodes (`<instance>/<inner>`, the instance's own param values written in), the inside's links copied;
// a pixel link into an instance goes to what its groupInput feeds, one out of it leaves from what feeds its groupOutput
// (groupInput → groupOutput straight — A → B); a param link out of an instance leaves what is wired into its row (a
// node's param, a delay row, an inner instance's row). An instance inside one (nested, 19.11) is copied as an instance
// and expanded on the next pass — `<outer>/<inner>/<node>`. No groups, no group nodes left. Assumes validateGroups
// passed — what doesn't resolve (a missing definition, …) is dropped, a loop of definitions stops after a pass per
// definition. `only` — expand just these instances, one level (web's ungroup), the rest stay as they are, `groups` too;
// `id` — the id an inner node or link of an instance gets (default `<instance>/<inner>`)
export type ExpandOptions = { only?: ReadonlySet<NodeId>; id?: (instance: NodeId, inner: string) => string };
export const expandGroups = (graph: ToastGraph, options: ExpandOptions = {}): ToastGraph => {
  if (options.only) return expandOnce(graph, options);
  const { groups, ...rest } = graph;
  if (!graph.nodes.some(isInstance)) return groups ? rest : graph;
  let expanded = graph;
  for (let pass = 0; pass <= (groups ?? []).length && expanded.nodes.some(isInstance); pass++) expanded = expandOnce(expanded, options);
  const { groups: _, ...plain } = expanded;
  return { ...plain, nodes: plain.nodes.filter((node) => !isInstance(node)) };
};

// one level of expandGroups: the instances (or `only` these) into their insides, the groups kept
const expandOnce = (graph: ToastGraph, { only, id: idOf = innerId }: ExpandOptions): ToastGraph => {
  const { groups } = graph;
  const instances = graph.nodes.filter((node) => isInstance(node) && (!only || only.has(node.id))) as GroupNode[];
  const expanded = new Set(instances.map(({ id }) => id));
  if (instances.length === 0) return graph;

  const definitions = new Map<string, GroupDefinition>((groups ?? []).map((group) => [group.id, group]));
  const exposed = new Map<string, GroupParam[]>((groups ?? []).map((group) => [group.id, exposedParams(group)]));
  const byId = new Map<NodeId, GraphNode>(graph.nodes.map((node) => [node.id, node]));
  const definitionOf = (id: NodeId) => {
    const node = byId.get(id);
    return isInstance(node) && expanded.has(id) ? definitions.get(node.data.group) : undefined;
  };
  const endOfType = (definition: GroupDefinition, type: "groupInput" | "groupOutput") =>
    definition.nodes.find((node) => node.type === type)?.id;

  // where a link leaving `node`'s `handle` really starts. Through an instance's groupInput → groupOutput it is what
  // feeds the instance; bounded by `depth` — a loop of instances is validateGraph's to refuse, not to hang here
  const sourcesOf = (node: NodeId, handle: string | undefined, depth = 0): End[] => {
    const definition = definitionOf(node);
    if (!definition) return [{ node, ...(handle !== undefined && { handle }) }];
    if (depth > graph.nodes.length) return [];
    if (handle !== undefined) {
      const param = exposed.get(definition.id)!.find(({ id }) => id === handle);
      return param ? [{ node: idOf(node, param.node), handle: param.param }] : [];
    }
    const output = endOfType(definition, "groupOutput");
    const input = endOfType(definition, "groupInput");
    return definition.edges
      .filter(({ target, sourceHandle }) => target === output && sourceHandle === undefined)
      .flatMap(({ source }) =>
        source === input
          ? graph.edges
              .filter(({ target, sourceHandle }) => target === node && sourceHandle === undefined)
              .flatMap((into) => sourcesOf(into.source, into.sourceHandle, depth + 1))
          : [{ node: idOf(node, source) }],
      );
  };
  // where a link into `node`'s `handle` really ends: an instance's — what its groupInput feeds, except its groupOutput
  // (that pass-through is the source side's, sourcesOf)
  const targetsOf = (node: NodeId, handle: string | undefined): End[] => {
    const definition = definitionOf(node);
    if (!definition) return [{ node, ...(handle !== undefined && { handle }) }];
    const input = endOfType(definition, "groupInput");
    const output = endOfType(definition, "groupOutput");
    return definition.edges
      .filter(({ source, target, sourceHandle }) => source === input && target !== output && sourceHandle === undefined)
      .map(({ target, targetHandle }) => ({ node: idOf(node, target), ...(targetHandle !== undefined && { handle: targetHandle }) }));
  };

  const nodes: GraphNode[] = graph.nodes.filter(({ id }) => !expanded.has(id));
  const edges: GraphEdge[] = [];
  for (const instance of instances) {
    const definition = definitions.get(instance.data.group);
    if (!definition) continue;
    // the instance's own values, each into the param its row ends at behind any delays — an inner instance's row
    // goes into that instance's own values
    const own = new Map<NodeId, Record<string, number>>();
    for (const { id, node, param } of exposed.get(definition.id)!) {
      const end = instance.data.params?.[id] !== undefined && behindDelays(definition, node, param);
      if (end) own.set(end.node.id, { ...own.get(end.node.id), [end.param]: instance.data.params![id]! });
    }
    for (const node of definition.nodes) {
      if (isGroupEnd(node)) continue;
      const values = own.get(node.id) ?? {};
      const data = isInstance(node) ? { ...node.data, params: { ...node.data.params, ...values } } : { ...node.data, ...values };
      nodes.push({ ...node, id: idOf(instance.id, node.id), data: own.has(node.id) ? data : node.data } as GraphNode);
    }
    const ends = new Set(definition.nodes.filter(isGroupEnd).map(({ id }) => id));
    for (const edge of definition.edges) {
      if (ends.has(edge.source) || ends.has(edge.target)) continue;
      edges.push({ ...edge, id: idOf(instance.id, edge.id), source: idOf(instance.id, edge.source), target: idOf(instance.id, edge.target) });
    }
  }
  for (const edge of graph.edges) {
    const from = sourcesOf(edge.source, edge.sourceHandle);
    const to = targetsOf(edge.target, edge.targetHandle);
    const plain = !definitionOf(edge.source) && !definitionOf(edge.target);
    if (plain) {
      edges.push(edge);
      continue;
    }
    from.forEach((source, i) =>
      to.forEach((target, j) =>
        edges.push({
          id: `${edge.id}${GROUP_SEPARATOR}${i}.${j}`,
          source: source.node,
          target: target.node,
          ...(source.handle !== undefined && { sourceHandle: source.handle }),
          ...(target.handle !== undefined && { targetHandle: target.handle }),
        }),
      ),
    );
  }
  return { ...graph, nodes, edges };
};
