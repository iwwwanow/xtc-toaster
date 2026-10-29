import type { GraphNode, NodeId, ToastGraph } from "./graph";

// what is wrong and where — server sends it as render-error, web refuses the link
export type GraphIssue = { message: string; nodeId?: NodeId };

// The link rules zod can't check: one link per target handle, handles only on composer rows,
// no cycles / self-links, nothing into the input or out of the output, exactly one input and
// output. The whole graph, dead branches too — web and server judge a graph the same way.
// The first issue found or null.
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

  const taken = new Set<string>();
  const next = new Map<NodeId, NodeId[]>();
  for (const { source, target, targetHandle } of edges) {
    const from = byId.get(source);
    const to = byId.get(target);
    if (!from || !to) return { message: "edge points to a missing node" };
    if (source === target) return { message: "a node can't link to itself", nodeId: source };
    if (to.type === "input") return { message: "nothing links into the input", nodeId: target };
    if (from.type === "output") return { message: "nothing links out of the output", nodeId: source };

    if (to.type === "composer") {
      if (!to.data.layers.some(({ id }) => id === targetHandle)) return { message: "link a layer row", nodeId: target };
    } else if (targetHandle !== undefined) return { message: "only composer rows take a handle", nodeId: target };

    // a node's input and each composer row take one link
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
