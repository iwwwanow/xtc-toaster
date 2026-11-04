import type { AnimationNode, GraphEdge, GraphNode, NodeId, ToastGraph } from "./graph";
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
// a param link: from a numeric param of the source's type, into a track, the keys within the param's bounds
const paramLinkIssue = (from: GraphNode, to: AnimationNode, { sourceHandle, targetHandle }: GraphEdge): GraphIssue | null => {
  if (sourceHandle === undefined) return { message: "link a param", nodeId: to.id };
  const bounds = paramBounds(from.type, sourceHandle);
  if (!bounds) return { message: "only a numeric param can be animated", nodeId: from.id };
  const track = to.data.tracks.find(({ id }) => id === targetHandle);
  if (!track) return { message: "link a track", nodeId: to.id };
  if (track.keys.some(({ value }) => value < bounds.min || value > bounds.max))
    return { message: "a key is out of the param's bounds", nodeId: to.id };
  return null;
};

// keys on the node's frames, one per frame of a track; a track without a link is allowed, like a layers row
const animationIssue = ({ id, data: { frames, tracks } }: AnimationNode): GraphIssue | null => {
  for (const { keys } of tracks) {
    if (keys.some(({ frame }) => frame >= frames)) return { message: "a key is past the last frame", nodeId: id };
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

    if (to.type === "animation") {
      const issue = paramLinkIssue(from, to, link);
      if (issue) return issue;
      const param = `${source}\0${sourceHandle}`;
      if (animated.has(param)) return { message: "one track per param", nodeId: target };
      animated.add(param);
    } else if (sourceHandle !== undefined) return { message: "a param links only into the animation node", nodeId: source };

    if (to.type === "layers") {
      if (!to.data.layers.some(({ id }) => id === targetHandle)) return { message: "link a layer row", nodeId: target };
    } else if (to.type !== "animation" && targetHandle !== undefined)
      return { message: "only layers rows and animation tracks take a handle", nodeId: target };

    // a node's input, each layers row and each track take one link
    const handle = `${target}\0${targetHandle ?? ""}`;
    if (taken.has(handle)) return { message: "one link per input", nodeId: target };
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
