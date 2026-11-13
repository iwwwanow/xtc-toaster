import type { GraphEdge, GraphNode, GroupDefinition, GroupNode, NodeId, ToastGraph } from "./graph";

// an expanded inner node's id: `<instance>/<inner>` — an issue there is shown on the instance (instanceOf)
export const GROUP_SEPARATOR = "/";
export const innerId = (instance: NodeId, inner: NodeId) => `${instance}${GROUP_SEPARATOR}${inner}`;

const isInstance = (node: GraphNode | undefined): node is GroupNode => node?.type === "group";
const isGroupEnd = ({ type }: GraphNode) => type === "groupInput" || type === "groupOutput";

// an exposed param: the inner node's `param` wired into the group input's row `id` — on the instance a field and a
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

// the instance an expanded node came from, or the id itself — a root node
export const instanceOf = (graph: ToastGraph, id: NodeId): NodeId => {
  const instance = graph.nodes.find((node) => isInstance(node) && id.startsWith(`${node.id}${GROUP_SEPARATOR}`));
  return instance?.id ?? id;
};

type End = { node: NodeId; handle?: string };

// A plain graph out of one with groups (docs/sprints/sprint-5.spec.md, «node groups»): every instance becomes copies of
// its definition's nodes (`<instance>/<inner>`, the instance's own param values written in), the inside's links copied;
// a pixel link into an instance goes to what its groupInput feeds, one out of it leaves from what feeds its groupOutput
// (groupInput → groupOutput straight — A → B); a param link out of an instance leaves the inner node's param. No groups,
// no group nodes left. Assumes validateGroups passed — what doesn't resolve (a missing definition, …) is dropped.
// `only` — expand just these instances (web's ungroup), the rest stay as they are, `groups` too; `id` — the id an inner
// node or link of an instance gets (default `<instance>/<inner>`)
export type ExpandOptions = { only?: ReadonlySet<NodeId>; id?: (instance: NodeId, inner: string) => string };
export const expandGroups = (graph: ToastGraph, { only, id: idOf = innerId }: ExpandOptions = {}): ToastGraph => {
  const { groups, ...rest } = graph;
  const instances = graph.nodes.filter((node) => isInstance(node) && (!only || only.has(node.id))) as GroupNode[];
  const expanded = new Set(instances.map(({ id }) => id));
  const kept = only ? graph : rest;
  if (instances.length === 0) return groups && !only ? rest : graph;

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
    const own = instance.data.params ?? {};
    for (const node of definition.nodes) {
      if (isGroupEnd(node)) continue;
      const values = Object.fromEntries(
        exposed.get(definition.id)!.flatMap(({ id, node: inner, param }) => (inner === node.id && id in own ? [[param, own[id]]] : [])),
      );
      nodes.push({ ...node, id: idOf(instance.id, node.id), data: { ...node.data, ...values } } as GraphNode);
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
  return { ...kept, nodes, edges };
};
