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

// a new row goes on top, right under the button; `at` — before that row (a linked one: on top of its group)
export const addTrack = (tracks: readonly AnimationTrack[], at = 0): AnimationTrack[] => [
  ...tracks.slice(0, at),
  { id: nextId(tracks), keys: [] },
  ...tracks.slice(at),
];

// where a track linked to a param of `source` (the node behind any delays) goes: on top of that node's group, so the
// group stays in place; the node has no track yet — on top of everything, as `+ track`
export const linkedTrackIndex = (
  nodes: readonly FlowNode[],
  edges: readonly Edge[],
  nodeId: string,
  tracks: readonly AnimationTrack[],
  source: string,
): number => {
  const index = tracks.findIndex((track) => trackParam(nodes, edges, nodeId, track.id)?.node.id === source);
  return index === -1 ? 0 : index;
};

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

// Dragging keys, blender's G on the dope sheet: a key of one track, or every key a group has on one frame (its
// summary diamond). Whole frames from 0; a frame another key of a moved track holds is refused — nothing gets
// overwritten — so the dragged key waits on the last free frame it passed (dragKeyTo)

// the frames the keys moved from `from` may not land on: the other keys of those tracks
export const blockedFrames = (tracks: readonly AnimationTrack[], ids: readonly string[], from: number): Set<number> =>
  new Set(
    tracks
      .filter(({ id, keys }) => ids.includes(id) && keys.some(({ frame }) => frame === from))
      .flatMap(({ keys }) => keys.map(({ frame }) => frame).filter((frame) => frame !== from)),
  );

// where a dragged key stands now: the frame under the pointer, or the last one it stood on if that's taken
export const dragKeyTo = (blocked: ReadonlySet<number>, current: number, wanted: number): number =>
  blocked.has(wanted) ? current : Math.max(0, wanted);

// the keys of `ids` on `from` → `to`, together; null — some track has another key on `to`
export const moveKeys = (
  tracks: readonly AnimationTrack[],
  ids: readonly string[],
  from: number,
  to: number,
): AnimationTrack[] | null => {
  let moved: AnimationTrack[] | null = [...tracks];
  for (const id of ids) {
    if (!moved.find((track) => track.id === id)?.keys.some(({ frame }) => frame === from)) continue;
    moved = moveKey(moved, id, from, to);
    if (!moved) return null;
  }
  return moved;
};

// a link into an empty track makes its first key; a track with keys keeps them as they are
export const seedTrack = (tracks: readonly AnimationTrack[], id: string, frame: number, value: number): AnimationTrack[] =>
  withKeys(tracks, id, (keys) => (keys.length === 0 ? [{ frame, value }] : keys));

export const trackLink = (edges: readonly Edge[], nodeId: string, trackId: string): Edge | undefined =>
  edges.find(({ target, targetHandle }) => target === nodeId && targetHandle === trackId);

// The param behind a param output — itself, or through the delays on the way back: its node, name and the frames
// the delays shift it by (contract's paramSources over the flow). Null — a delay row nothing is wired into
export type ParamOf = { node: FlowNode; param: string; shift: number };
export const paramOf = (
  nodes: readonly FlowNode[],
  edges: readonly Edge[],
  source: string,
  sourceHandle: string | null | undefined,
): ParamOf | null => {
  let shift = 0;
  // bounded: a loop of delays is refused (canConnect), an unchecked one mustn't hang
  for (let step = 0; sourceHandle && step <= nodes.length; step++) {
    const node = nodes.find(({ id }) => id === source);
    if (!node) return null;
    if (node.type !== "delay") return { node, param: sourceHandle, shift };
    shift += node.data.frames;
    const row = sourceHandle;
    const link = edges.find(({ target, targetHandle }) => target === node.id && targetHandle === row);
    if (!link) return null;
    ({ source, sourceHandle } = link);
  }
  return null;
};

// the param a track drives, through any delays
export const trackParam = (nodes: readonly FlowNode[], edges: readonly Edge[], nodeId: string, trackId: string): ParamOf | null => {
  const link = trackLink(edges, nodeId, trackId);
  return link ? paramOf(nodes, edges, link.source, link.sourceHandle) : null;
};

// `move.x`; a shift shows after it — `move.x +3`
export const paramLabel = ({ node, param, shift }: ParamOf): string =>
  `${NODE_LABELS[node.type as MenuNodeType] ?? node.type}.${param}${shiftLabel(shift)}`;
const shiftLabel = (shift: number) => (shift === 0 ? "" : ` ${shift > 0 ? "+" : "−"}${Math.abs(shift)}`);

// the value a param has in the node's own data
export const paramValue = (nodes: readonly FlowNode[], nodeId: string, param: string): number | null => {
  const value = (nodes.find(({ id }) => id === nodeId)?.data as Record<string, unknown> | undefined)?.[param];
  return typeof value === "number" ? value : null;
};

// the param's name from the link (`move.x`, through a delay `move.x +3`), no link — from the id (`track 3`)
export const trackName = (nodes: readonly FlowNode[], edges: readonly Edge[], nodeId: string, trackId: string): string => {
  const param = trackParam(nodes, edges, nodeId, trackId);
  return param ? paramLabel(param) : trackId.replaceAll("-", " ");
};

// Tracks grouped by the node they animate, as blender's channel groups: a group per source node, in the order
// of its first track; tracks inside in their own order. Unlinked tracks — a group of their own, on top (where
// `+ track` puts a new one). A group is named by its node's type, numbered when the type repeats (`corners 2`);
// a row by its param (`x`, through a delay `x +3`). A track behind a delay goes to the group of the param's node.
// Derived from the links — nothing of it is in the toast
export const UNLINKED_GROUP = "unlinked";
export type TrackRow = { track: AnimationTrack; index: number; name: string };
export type TrackGroup = { id: string; name: string; rows: TrackRow[] };

export const trackGroups = (
  nodes: readonly FlowNode[],
  edges: readonly Edge[],
  nodeId: string,
  tracks: readonly AnimationTrack[],
): TrackGroup[] => {
  const groups = new Map<string, { type: string | null; rows: TrackRow[] }>();
  tracks.forEach((track, index) => {
    const param = trackParam(nodes, edges, nodeId, track.id);
    const id = param ? param.node.id : UNLINKED_GROUP;
    const name = param ? `${param.param}${shiftLabel(param.shift)}` : track.id.replaceAll("-", " ");
    const group = groups.get(id) ?? { type: param ? param.node.type : null, rows: [] };
    group.rows.push({ track, index, name });
    groups.set(id, group);
  });
  const typeCount = new Map<string, number>();
  for (const { type } of groups.values()) if (type) typeCount.set(type, (typeCount.get(type) ?? 0) + 1);
  const seen = new Map<string, number>();
  const named = [...groups].map(([id, { type, rows }]): TrackGroup => {
    if (!type) return { id, name: UNLINKED_GROUP, rows };
    const label = NODE_LABELS[type as MenuNodeType] ?? type;
    const n = (seen.get(type) ?? 0) + 1;
    seen.set(type, n);
    return { id, name: typeCount.get(type)! > 1 ? `${label} ${n}` : label, rows };
  });
  return [...named.filter(({ id }) => id === UNLINKED_GROUP), ...named.filter(({ id }) => id !== UNLINKED_GROUP)];
};

// a group's summary row: one diamond per frame some track of the group has a key on
export const groupKeyFrames = (group: TrackGroup): number[] =>
  [...new Set(group.rows.flatMap(({ track }) => track.keys.map(({ frame }) => frame)))].toSorted((a, b) => a - b);

// what a new key takes: the track's value on that frame, a track without keys — the param's own value
export const keyValueAt = (track: AnimationTrack, frame: number, paramOwn: number | null): number | null =>
  valueAtFrame(track.keys, frame) ?? paramOwn;

// the timeline goes as far as the rendered frames or the last key past them, whichever is later
export const timelineEnd = ({ frames, tracks }: AnimationData): number =>
  Math.max(frames, ...tracks.flatMap(({ keys }) => keys.map(({ frame }) => frame + 1)));

// Timeline zoom: px a frame takes. Fit (blender's View All) by default — the frames fill the timeline's width;
// Ctrl+wheel steps it around the cursor, between ZOOM.min and ZOOM.max (or the fit, if that's wider)
export const ZOOM = { min: 4, max: 64, step: 1.25 } as const;

export const fitPxPerFrame = (width: number, end: number): number => Math.max(ZOOM.min, width / Math.max(1, end));

export const zoomPxPerFrame = (px: number, direction: 1 | -1, fit: number): number =>
  Math.min(Math.max(ZOOM.max, fit), Math.max(ZOOM.min, px * ZOOM.step ** direction));

// a label every 1 / 2 / 5 / 10 / 20 / 50 / … frames — the smallest step that keeps labels RULER_LABEL_PX apart;
// the count is bounded, a key on a far frame doesn't make millions of them
const RULER_LABEL_PX = 32;
const MAX_RULER_LABELS = 200;
export const rulerStep = (pxPerFrame: number, end: number): number => {
  if (!(pxPerFrame > 0)) throw new RangeError(`rulerStep: px per frame ${pxPerFrame}`);
  for (let magnitude = 1; ; magnitude *= 10) {
    for (const step of [1, 2, 5].map((n) => n * magnitude)) {
      if (step * pxPerFrame >= RULER_LABEL_PX && end / step <= MAX_RULER_LABELS) return step;
    }
  }
};

export const rulerLabels = (end: number, pxPerFrame: number): number[] => {
  const step = rulerStep(pxPerFrame, end);
  return Array.from({ length: Math.ceil(end / step) }, (_, index) => index * step);
};

// the frame under a point `x` px into the timeline's content
export const frameAt = (x: number, pxPerFrame: number): number => Math.max(0, Math.floor(x / pxPerFrame));

// blender's jump to keyframe: the nearest key of any track before / after the frame, among the rendered frames
// (the playhead stops at the last one); null — none that way
const renderedKeyFrames = ({ frames, tracks }: Pick<AnimationData, "frames" | "tracks">): number[] =>
  [...new Set(tracks.flatMap(({ keys }) => keys.map(({ frame }) => frame)))].filter((frame) => frame < frames);

export const prevKeyFrame = (data: Pick<AnimationData, "frames" | "tracks">, frame: number): number | null => {
  const before = renderedKeyFrames(data).filter((key) => key < frame);
  return before.length > 0 ? Math.max(...before) : null;
};

export const nextKeyFrame = (data: Pick<AnimationData, "frames" | "tracks">, frame: number): number | null => {
  const after = renderedKeyFrames(data).filter((key) => key > frame);
  return after.length > 0 ? Math.min(...after) : null;
};

// the playhead stops at the last rendered frame
export const clampPlayhead = (frame: number, frames: number): number => Math.max(0, Math.min(frames - 1, frame));

// play: the frame after this one, the last goes back to the first
export const nextFrame = (frame: number, frames: number): number => (clampPlayhead(frame, frames) + 1) % frames;

// what one frame's render needs: no animation node, no delays, no value nodes, no param links. Fps, keys elsewhere,
// track order, a delay's shift or a value's number once applied don't touch the picture, so they don't change this
// graph and don't start a render
export const withoutAnimation = ({ export: _, ...graph }: ToastGraph): ToastGraph => ({
  ...graph,
  nodes: graph.nodes.filter(({ type }) => type !== "animation" && type !== "delay" && type !== "value"),
  edges: graph.edges.filter(({ sourceHandle }) => sourceHandle === undefined),
});

// a gif worth exporting: some linked track with keys drives a param — else every frame is the same picture.
// A track's value holds before its first key and after its last, so frame 0 tells
export const hasAnimatedParams = (graph: ToastGraph): boolean => animatedValues(graph, 0).size > 0;
