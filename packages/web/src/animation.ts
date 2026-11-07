import type { Edge } from "@xyflow/svelte";
import { animatedValues, valueAtFrame, type AnimationNode, type AnimationTrack, type ToastGraph } from "@xtc-toaster/contract";
import { NODE_LABELS, type FlowNode, type MenuNodeType } from "./graph";

// Animation tracks, top first, and their keys. Pure — session and the node apply the result to the node data.

type AnimationData = AnimationNode["data"];

// a track id is its handle id, like a layers row
const nextId = (tracks: readonly AnimationTrack[]): string => {
  let n = tracks.length + 1;
  while (tracks.some(({ id }) => id === `track-${n}`)) n++;
  return `track-${n}`;
};

// a new row goes on top, right under the button
export const addTrack = (tracks: readonly AnimationTrack[]): AnimationTrack[] => [
  { id: nextId(tracks), keys: [] },
  ...tracks,
];

export const removeTrack = (tracks: readonly AnimationTrack[], id: string): AnimationTrack[] =>
  tracks.filter((track) => track.id !== id);

const withKeys = (
  tracks: readonly AnimationTrack[],
  id: string,
  keys: (keys: AnimationTrack["keys"]) => AnimationTrack["keys"],
): AnimationTrack[] => tracks.map((track) => (track.id === id ? { ...track, keys: keys(track.keys) } : track));

// keys stay sorted by frame in the file — easier to read; a frame already taken keeps its key
export const addKey = (tracks: readonly AnimationTrack[], id: string, frame: number, value: number): AnimationTrack[] =>
  withKeys(tracks, id, (keys) =>
    keys.some((key) => key.frame === frame) ? keys : [...keys, { frame, value }].toSorted((a, b) => a.frame - b.frame),
  );

export const removeKey = (tracks: readonly AnimationTrack[], id: string, frame: number): AnimationTrack[] =>
  withKeys(tracks, id, (keys) => keys.filter((key) => key.frame !== frame));

export const setKeyValue = (tracks: readonly AnimationTrack[], id: string, frame: number, value: number): AnimationTrack[] =>
  withKeys(tracks, id, (keys) => keys.map((key) => (key.frame === frame ? { ...key, value } : key)));

// null — the frame is taken by another key of the track: nothing gets overwritten by a typed number
export const moveKey = (tracks: readonly AnimationTrack[], id: string, from: number, to: number): AnimationTrack[] | null => {
  const track = tracks.find((track) => track.id === id);
  if (from !== to && track?.keys.some((key) => key.frame === to)) return null;
  return withKeys(tracks, id, (keys) =>
    keys.map((key) => (key.frame === from ? { ...key, frame: to } : key)).toSorted((a, b) => a.frame - b.frame),
  );
};

// a link into an empty track makes its first key; a track with keys keeps them as they are
export const seedTrack = (tracks: readonly AnimationTrack[], id: string, frame: number, value: number): AnimationTrack[] =>
  withKeys(tracks, id, (keys) => (keys.length === 0 ? [{ frame, value }] : keys));

export const trackLink = (edges: readonly Edge[], nodeId: string, trackId: string): Edge | undefined =>
  edges.find(({ target, targetHandle }) => target === nodeId && targetHandle === trackId);

// the value a param has in the node's own data
export const paramValue = (nodes: readonly FlowNode[], nodeId: string, param: string): number | null => {
  const value = (nodes.find(({ id }) => id === nodeId)?.data as Record<string, unknown> | undefined)?.[param];
  return typeof value === "number" ? value : null;
};

// the param's name from the link (`move.x`), no link — from the id (`track 3`)
export const trackName = (nodes: readonly FlowNode[], edges: readonly Edge[], nodeId: string, trackId: string): string => {
  const link = trackLink(edges, nodeId, trackId);
  const type = link && nodes.find(({ id }) => id === link.source)?.type;
  if (!type || !link?.sourceHandle) return trackId.replaceAll("-", " ");
  return `${NODE_LABELS[type as MenuNodeType] ?? type}.${link.sourceHandle}`;
};

// what a new key takes: the track's value on that frame, a track without keys — the param's own value
export const keyValueAt = (track: AnimationTrack, frame: number, paramOwn: number | null): number | null =>
  valueAtFrame(track.keys, frame) ?? paramOwn;

// the timeline goes as far as the rendered frames or the last key past them, whichever is later
export const timelineEnd = ({ frames, tracks }: AnimationData): number =>
  Math.max(frames, ...tracks.flatMap(({ keys }) => keys.map(({ frame }) => frame + 1)));

// a label every 5 frames; the count is bounded, a key on a far frame doesn't make thousands of them
const MAX_RULER_LABELS = 200;
export const rulerLabels = (end: number): number[] => {
  const step = Math.max(5, Math.ceil(end / MAX_RULER_LABELS / 5) * 5);
  return Array.from({ length: Math.ceil(end / step) }, (_, index) => index * step);
};

// the playhead stops at the last rendered frame
export const clampPlayhead = (frame: number, frames: number): number => Math.max(0, Math.min(frames - 1, frame));

// play: the frame after this one, the last goes back to the first
export const nextFrame = (frame: number, frames: number): number => (clampPlayhead(frame, frames) + 1) % frames;

// what one frame's render needs: no animation node, no param links. Fps, keys elsewhere, track order don't touch
// the picture, so they don't change this graph and don't start a render
export const withoutAnimation = (graph: ToastGraph): ToastGraph => ({
  ...graph,
  nodes: graph.nodes.filter(({ type }) => type !== "animation"),
  edges: graph.edges.filter(({ sourceHandle }) => sourceHandle === undefined),
});

// a gif worth exporting: some linked track with keys drives a param — else every frame is the same picture.
// A track's value holds before its first key and after its last, so frame 0 tells
export const hasAnimatedParams = (graph: ToastGraph): boolean => animatedValues(graph, 0).size > 0;
