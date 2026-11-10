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

// What the value nodes put into `data` on a frame: every param wired into a value takes its number — after the tracks,
// so an animated value moves them all — clamped to the param's bounds. A value wired into another value takes that
// one's number, and so do its params. `animated` — the tracks' values on this frame (animatedValues)
const valueNodeValues = (graph: ToastGraph, animated: Map<NodeId, Record<string, number>>): Map<NodeId, Record<string, number>> => {
  const values = new Map<NodeId, Record<string, number>>();
  const byId = new Map<NodeId, GraphNode>(graph.nodes.map((node) => [node.id, node]));
  const links = graph.edges.filter(({ target, sourceHandle }) => sourceHandle !== undefined && byId.get(target)?.type === "value");
  if (links.length === 0) return values;
  const wiredInto = new Map<NodeId, NodeId>();
  for (const { source, target } of links) if (byId.get(source)?.type === "value") wiredInto.set(source, target);
  const numberOf = (id: NodeId): number | null => {
    // bounded: validateGraph refuses a loop, an unvalidated graph mustn't hang
    for (let step = 0; wiredInto.has(id) && step <= graph.nodes.length; step++) id = wiredInto.get(id)!;
    const node = byId.get(id);
    return node?.type === "value" ? (animated.get(id)?.value ?? node.data.value) : null;
  };
  for (const { source, sourceHandle, target } of links) {
    const value = numberOf(target);
    const bounds = paramBounds(byId.get(source)?.type ?? "", sourceHandle!);
    if (value === null || !bounds) continue;
    values.set(source, { ...values.get(source), [sourceHandle!]: Math.min(bounds.max, Math.max(bounds.min, value)) });
  }
  return values;
};

// Everything that sets a param on a frame instead of its own field: the tracks (animatedValues), then the value nodes.
// node → param → value; a param has one or the other, never both (validateGraph: one track or value per param)
export const drivenValues = (graph: ToastGraph, frame: number): Map<NodeId, Record<string, number>> => {
  const animated = animatedValues(graph, frame);
  const values = new Map(animated);
  for (const [node, params] of valueNodeValues(graph, animated)) values.set(node, { ...values.get(node), ...params });
  return values;
};

// The same graph with the driven values (tracks, value nodes) put into `data` — one function for web and server, a
// frame then goes through the plain render. The animation, delay and value nodes and their links stay: the render
// never reaches them
export const graphAtFrame = (graph: ToastGraph, frame: number): ToastGraph => {
  const values = drivenValues(graph, frame);
  if (values.size === 0) return graph;
  const nodes = graph.nodes.map((node) => {
    const driven = values.get(node.id);
    return driven ? ({ ...node, data: { ...node.data, ...driven } } as GraphNode) : node;
  });
  return { ...graph, nodes };
};
