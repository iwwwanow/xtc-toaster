import type { AnimationKey, GraphEdge, GraphNode, NodeId, ToastGraph } from "./graph";
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

// the param a link out of `source`'s `sourceHandle` carries, through any delays on the way back: the node, the
// param's name and the frames the delays shift it by. Null — a delay row nothing is wired into
export type ParamSource = { node: NodeId; param: string; shift: number };
export const paramSources = (graph: ToastGraph) => {
  const byId = new Map<NodeId, GraphNode>(graph.nodes.map((node) => [node.id, node]));
  const into = new Map<string, GraphEdge>();
  for (const edge of graph.edges) if (edge.targetHandle !== undefined) into.set(`${edge.target}\0${edge.targetHandle}`, edge);
  return (source: NodeId, sourceHandle: string): ParamSource | null => {
    let shift = 0;
    // bounded: validateGraph refuses a loop, an unvalidated graph mustn't hang
    for (let step = 0; step <= graph.nodes.length; step++) {
      const node = byId.get(source);
      if (node?.type !== "delay") return { node: source, param: sourceHandle, shift };
      shift += node.data.frames;
      const link = into.get(`${source}\0${sourceHandle}`);
      if (link?.sourceHandle === undefined) return null;
      ({ source, sourceHandle } = { source: link.source, sourceHandle: link.sourceHandle });
    }
    return null;
  };
};

// What the tracks put into `data` on a frame: node → param → value. A track without keys or without a link gives
// nothing; a track behind a delay is read `shift` frames earlier. A value is clamped to the param's bounds: the keys
// stay as they are, so a track rewired to another param and back loses nothing
export const animatedValues = (graph: ToastGraph, frame: number): Map<NodeId, Record<string, number>> => {
  const values = new Map<NodeId, Record<string, number>>();
  const animation = graph.nodes.find((node) => node.type === "animation");
  if (!animation) return values;

  const typeOf = new Map(graph.nodes.map(({ id, type }) => [id, type]));
  const sourceOf = paramSources(graph);
  for (const { source, sourceHandle, target, targetHandle } of graph.edges) {
    if (target !== animation.id || sourceHandle === undefined) continue;
    const from = sourceOf(source, sourceHandle);
    const track = animation.data.tracks.find(({ id }) => id === targetHandle);
    if (!from || !track) continue;
    const value = valueAtFrame(track.keys, frame - from.shift);
    const bounds = paramBounds(typeOf.get(from.node) ?? "", from.param);
    if (value === null || !bounds) continue;
    values.set(from.node, { ...values.get(from.node), [from.param]: Math.min(bounds.max, Math.max(bounds.min, value)) });
  }
  return values;
};

// The same graph with the animated values put into `data` — one function for web and server, a frame then goes
// through the plain render. The animation node and its links stay: the render never reaches them
export const graphAtFrame = (graph: ToastGraph, frame: number): ToastGraph => {
  const values = animatedValues(graph, frame);
  if (values.size === 0) return graph;
  const nodes = graph.nodes.map((node) => {
    const animated = values.get(node.id);
    return animated ? ({ ...node, data: { ...node.data, ...animated } } as GraphNode) : node;
  });
  return { ...graph, nodes };
};
