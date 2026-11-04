import type { AnimationKey, GraphNode, NodeId, ToastGraph } from "./graph";
import { paramBounds } from "./params";

// linear between keys, the nearest key's value outside them (blender's constant extrapolation); null — no keys.
// Clamped to the two keys: float noise past a bound would fail the param's schema on that one frame
export const valueAtFrame = (keys: readonly AnimationKey[], frame: number): number | null => {
  const sorted = keys.toSorted((a, b) => a.frame - b.frame);
  const after = sorted.findIndex((key) => key.frame > frame);
  if (after === 0) return sorted[0]!.value;
  if (after === -1) return sorted.at(-1)?.value ?? null;
  const { frame: fromFrame, value: from } = sorted[after - 1]!;
  const { frame: toFrame, value: to } = sorted[after]!;
  const value = from + (to - from) * ((frame - fromFrame) / (toFrame - fromFrame));
  return Math.min(Math.max(from, to), Math.max(Math.min(from, to), value));
};

// The same graph with the animated values put into `data` — one function for web and server, a frame then goes
// through the plain render. The animation node and its links stay: the render never reaches them. A track without
// keys or without a link changes nothing. A value is clamped to the param's bounds: the keys stay as they are, so a
// track rewired to another param and back loses nothing
export const graphAtFrame = (graph: ToastGraph, frame: number): ToastGraph => {
  const animation = graph.nodes.find((node) => node.type === "animation");
  if (!animation) return graph;

  const typeOf = new Map(graph.nodes.map(({ id, type }) => [id, type]));
  const values = new Map<NodeId, Record<string, number>>();
  for (const { source, sourceHandle, target, targetHandle } of graph.edges) {
    if (target !== animation.id || sourceHandle === undefined) continue;
    const track = animation.data.tracks.find(({ id }) => id === targetHandle);
    const value = track ? valueAtFrame(track.keys, frame) : null;
    const bounds = paramBounds(typeOf.get(source) ?? "", sourceHandle);
    if (value === null || !bounds) continue;
    values.set(source, { ...values.get(source), [sourceHandle]: Math.min(bounds.max, Math.max(bounds.min, value)) });
  }

  const nodes = graph.nodes.map((node) => {
    const animated = values.get(node.id);
    return animated ? ({ ...node, data: { ...node.data, ...animated } } as GraphNode) : node;
  });
  return { ...graph, nodes };
};
