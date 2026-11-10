import { isDriver, type AnimationNode, type DelayNode, type DriverNode, type GraphEdge, type GraphNode, type NodeId, type ToastGraph } from "./graph";
import { paramBounds } from "./params";

// what is wrong and where — server sends it as render-error, web refuses the link
export type GraphIssue = { message: string; nodeId?: NodeId };

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

export const validateGraph = ({ nodes, edges }: ToastGraph): GraphIssue | null => {
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
