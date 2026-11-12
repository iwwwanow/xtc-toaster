import { isDriver, type AnimationNode, type DelayNode, type DriverNode, type GraphEdge, type GraphNode, type GroupDefinition, type NodeId, type ToastGraph } from "./graph";
import { expandGroups, instanceOf } from "./groups";
import { paramBounds } from "./params";

// what is wrong and where — server sends it as render-error, web refuses the link; `group` — inside that group's
// definition, `nodeId` is an inner node there
export type GraphIssue = { message: string; nodeId?: NodeId; group?: string };

// The link rules zod can't check: one link per target handle, handles only on layers rows and
// animation tracks, no cycles / self-links, nothing into the input or out of the output, exactly
// one input and output, at most one animation node, its keys and param links (animationIssue,
// paramLinkIssue). The whole graph, dead branches too — web and server judge a graph the same way.
// The first issue found or null.
// TODO: call it from ToastGraphSchema.superRefine — one entry point, fromToastFile's own checks go; stays a
// plain function for web canConnect, nodeId must reach the issue — docs/backlog/2026-11-01_validate-graph-into-zod.md
// a param link: from a numeric param of the source's type or out of a delay row, into a track or a delay row; into a
// value or a factor — from a numeric param only (a delay shifts a track's time, they have none), their one unnamed input
const paramLinkIssue = (
  from: GraphNode,
  to: AnimationNode | DelayNode | DriverNode,
  { sourceHandle, targetHandle }: GraphEdge,
): GraphIssue | null => {
  if (sourceHandle === undefined) return { message: "link a param", nodeId: to.id };
  if (from.type === "delay") {
    if (isDriver(to)) return { message: "a delay links only into a track or a delay", nodeId: from.id };
    if (!from.data.rows.some(({ id }) => id === sourceHandle)) return { message: "link out of a delay row", nodeId: from.id };
  } else if (!paramBounds(from.type, sourceHandle)) return { message: "only a numeric param can be animated", nodeId: from.id };
  if (isDriver(to)) return targetHandle === undefined ? null : { message: `a ${to.type} has one input`, nodeId: to.id };
  if (to.type === "delay")
    return to.data.rows.some(({ id }) => id === targetHandle) ? null : { message: "link a delay row", nodeId: to.id };
  const track = to.data.tracks.find(({ id }) => id === targetHandle);
  if (!track) return { message: "link a track", nodeId: to.id };
  return null;
};

// one key per frame of a track. Allowed: a track without a link, like a layers row; a key past `frames` (frames is
// only what gets rendered) or out of the param's bounds (graphAtFrame clamps) — shortening or rewiring loses nothing
const animationIssue = ({ id, data: { tracks } }: AnimationNode): GraphIssue | null => {
  for (const { keys } of tracks) {
    if (new Set(keys.map(({ frame }) => frame)).size !== keys.length) return { message: "two keys on one frame", nodeId: id };
  }
  return null;
};

const validatePlain = ({ nodes, edges }: Pick<ToastGraph, "nodes" | "edges">): GraphIssue | null => {
  const byId = new Map<NodeId, GraphNode>();
  for (const node of nodes) {
    if (byId.has(node.id)) return { message: "duplicate node id", nodeId: node.id };
    byId.set(node.id, node);
  }

  // one of each for now — several inputs / outputs may come later
  const inputs = nodes.filter((node) => node.type === "input");
  const outputs = nodes.filter((node) => node.type === "output");
  if (inputs.length !== 1 || outputs.length !== 1) return { message: "graph needs exactly one input and one output" };

  const animations = nodes.filter((node) => node.type === "animation");
  if (animations.length > 1) return { message: "only one animation node in a graph", nodeId: animations[1]!.id };
  const issue = animations[0] && animationIssue(animations[0]);
  if (issue) return issue;

  const taken = new Set<string>();
  const animated = new Set<string>();
  const next = new Map<NodeId, NodeId[]>();
  for (const link of edges) {
    const { source, sourceHandle, target, targetHandle } = link;
    const from = byId.get(source);
    const to = byId.get(target);
    if (!from || !to) return { message: "edge points to a missing node" };
    if (source === target) return { message: "a node can't link to itself", nodeId: source };
    if (to.type === "input") return { message: "nothing links into the input", nodeId: target };
    if (from.type === "output") return { message: "nothing links out of the output", nodeId: source };
    if (from.type === "animation") return { message: "nothing links out of the animation node", nodeId: source };

    if (to.type === "animation" || to.type === "delay" || isDriver(to)) {
      const issue = paramLinkIssue(from, to, link);
      if (issue) return issue;
      // a param (or a delay row) feeds one track or one value: a second would fight it for the value
      const param = `${source}\0${sourceHandle}`;
      if (animated.has(param)) return { message: "one track per param", nodeId: target };
      animated.add(param);
    } else if (from.type === "delay") return { message: "a delay links only into a track or a delay", nodeId: source };
    else if (sourceHandle !== undefined) return { message: "a param links only into a track, a delay, a value or a factor", nodeId: source };
    else if (isDriver(from)) return { message: `a ${from.type} links only its param`, nodeId: source };

    if (to.type === "layers") {
      if (!to.data.layers.some(({ id }) => id === targetHandle)) return { message: "link a layer row", nodeId: target };
    } else if (to.type !== "animation" && to.type !== "delay" && !isDriver(to) && targetHandle !== undefined)
      return { message: "only layers rows and animation tracks take a handle", nodeId: target };

    // a node's input, each layers row and each track take one link; a value's or a factor's — any number of params
    const handle = `${target}\0${targetHandle ?? ""}`;
    if (!isDriver(to) && taken.has(handle)) return { message: "one link per input", nodeId: target };
    taken.add(handle);
    next.set(source, [...(next.get(source) ?? []), target]);
  }

  // depth-first: a node met again while still on the stack closes a cycle
  const state = new Map<NodeId, "open" | "done">();
  const loopAt = (id: NodeId): NodeId | null => {
    if (state.get(id) === "done") return null;
    if (state.get(id) === "open") return id;
    state.set(id, "open");
    for (const target of next.get(id) ?? []) {
      const found = loopAt(target);
      if (found) return found;
    }
    state.set(id, "done");
    return null;
  };
  for (const { id } of nodes) {
    const nodeId = loopAt(id);
    if (nodeId) return { message: "the graph loops", nodeId };
  }
  return null;
};

// what may not sit inside a group's definition: no nesting in v1, the one animation node stays outside, the toast's
// input / output are the root's
const NOT_IN_A_GROUP = new Set<GraphNode["type"]>(["group", "animation", "input", "output"]);

// a definition's own links, judged like a graph: its groupInput / groupOutput stand for the input / output
const definitionIssue = (definition: GroupDefinition): GraphIssue | null => {
  const at = (issue: GraphIssue): GraphIssue => ({ ...issue, group: definition.id });
  const count = (type: GraphNode["type"]) => definition.nodes.filter((node) => node.type === type).length;
  if (count("groupInput") !== 1 || count("groupOutput") !== 1) return at({ message: "a group needs one group input and one group output" });
  const misplaced = definition.nodes.find(({ type }) => NOT_IN_A_GROUP.has(type));
  if (misplaced) return at({ message: `no ${misplaced.type} inside a group`, nodeId: misplaced.id });
  const asGraph = definition.nodes.map((node): GraphNode => {
    if (node.type === "groupInput") return { id: node.id, type: "input", data: { imageId: null } };
    if (node.type === "groupOutput") return { id: node.id, type: "output", data: {} };
    return node;
  });
  const issue = validatePlain({ nodes: asGraph, edges: definition.edges });
  if (issue) return at(issue);
  const ids = new Set<string>();
  for (const { id, node, param } of definition.params) {
    if (ids.has(id)) return at({ message: "duplicate group param id" });
    ids.add(id);
    const inner = definition.nodes.find(({ id }) => id === node);
    if (!inner || !paramBounds(inner.type, param)) return at({ message: "a group param shows a numeric param of a node inside", nodeId: node });
  }
  return null;
};

// The group rules zod can't check (docs/sprints/sprint-5.spec.md, «node groups»): unique definitions, each one sound
// (definitionIssue), group inputs / outputs only inside, an instance names an existing definition and only its params,
// within their bounds; links into an instance take no handle, links out of one leave an exposed param or its output
const groupsIssue = ({ nodes, edges, groups = [] }: ToastGraph): GraphIssue | null => {
  const definitions = new Map<string, GroupDefinition>();
  for (const definition of groups) {
    if (definitions.has(definition.id)) return { message: "duplicate group id", group: definition.id };
    definitions.set(definition.id, definition);
    const issue = definitionIssue(definition);
    if (issue) return issue;
  }
  for (const node of nodes) {
    if (node.type === "groupInput" || node.type === "groupOutput") return { message: "a group input / output only inside a group", nodeId: node.id };
    if (node.type !== "group") continue;
    const definition = definitions.get(node.data.group);
    if (!definition) return { message: "a group that isn't there", nodeId: node.id };
    for (const [id, value] of Object.entries(node.data.params ?? {})) {
      const param = definition.params.find((param) => param.id === id);
      const inner = param && definition.nodes.find(({ id }) => id === param.node);
      const bounds = inner && paramBounds(inner.type, param.param);
      if (!bounds) return { message: "not a param of this group", nodeId: node.id };
      if (value < bounds.min || value > bounds.max) return { message: `${id} out of its bounds`, nodeId: node.id };
    }
  }
  // an instance's links: one unnamed pixel input, a param out of an exposed param only — expandGroups would drop the rest
  const instances = new Map(nodes.flatMap((node) => (node.type === "group" ? [[node.id, definitions.get(node.data.group)!]] : [])));
  for (const { source, sourceHandle, target, targetHandle } of edges) {
    if (instances.has(target) && targetHandle !== undefined) return { message: "a group has one input", nodeId: target };
    const from = instances.get(source);
    if (from && sourceHandle !== undefined && !from.params.some(({ id }) => id === sourceHandle))
      return { message: "not a param of this group", nodeId: source };
  }
  return null;
};

// The link rules zod can't check, over the whole toast: the groups first (groupsIssue), then the graph with them
// expanded (validatePlain) — an issue on an expanded node points at its instance
export const validateGraph = (graph: ToastGraph): GraphIssue | null => {
  const issue = groupsIssue(graph);
  if (issue) return issue;
  const plain = validatePlain(expandGroups(graph));
  return plain?.nodeId ? { ...plain, nodeId: instanceOf(graph, plain.nodeId) } : plain;
};
