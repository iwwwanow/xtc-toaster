import type { Edge } from "@xyflow/svelte";
import type { BlendMode, ComposerLayer } from "@xtc-toaster/contract";

// Composer rows, top first. Pure — session applies the result to the node data (and the edges).

// a row id is its handle id: unique within the node, never reused while the node lives — a link keeps it
const nextId = (layers: readonly ComposerLayer[]): string => {
  let n = layers.length + 1;
  while (layers.some(({ id }) => id === `layer-${n}`)) n++;
  return `layer-${n}`;
};

// a new row goes on top
export const addLayer = (layers: readonly ComposerLayer[]): ComposerLayer[] => [
  { id: nextId(layers), blendMode: "normal" },
  ...layers,
];

export const removeLayer = (layers: readonly ComposerLayer[], id: string): ComposerLayer[] =>
  layers.filter((layer) => layer.id !== id);

// the row's link goes with it
export const removeLayerEdges = (edges: Edge[], nodeId: string, id: string): Edge[] =>
  edges.filter(({ target, targetHandle }) => target !== nodeId || targetHandle !== id);

export const setBlendMode = (layers: readonly ComposerLayer[], id: string, blendMode: BlendMode): ComposerLayer[] =>
  layers.map((layer) => (layer.id === id ? { ...layer, blendMode } : layer));

// the row at `from` dropped at `to` (indexes before the move); the handle ids move with the rows
export const moveLayer = (layers: readonly ComposerLayer[], from: number, to: number): ComposerLayer[] => {
  const moved = [...layers];
  const [layer] = moved.splice(from, 1);
  if (layer) moved.splice(to, 0, layer);
  return moved;
};
