import type { Edge } from "@xyflow/svelte";
import { LAYER_NAME_MAX, type BlendMode, type ComposerLayer } from "@xtc-toaster/contract";

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

// the shown name: the user's, else from the id ("layer-3" → "layer 3") — it moves with the row either way
export const layerName = ({ id, name }: ComposerLayer): string => name ?? id.replaceAll("-", " ");

// trimmed; empty or the id-derived name → back to no name of its own
export const renameLayer = (layers: readonly ComposerLayer[], id: string, name: string): ComposerLayer[] =>
  layers.map((layer) => {
    if (layer.id !== id) return layer;
    const { name: _, ...rest } = layer;
    const trimmed = name.trim().slice(0, LAYER_NAME_MAX);
    return trimmed && trimmed !== layerName(rest) ? { ...rest, name: trimmed } : rest;
  });

// visible: false only while hidden — a shown row has no field, like the toast files without it
export const toggleLayer = (layers: readonly ComposerLayer[], id: string): ComposerLayer[] =>
  layers.map((layer) => {
    if (layer.id !== id) return layer;
    const { visible, ...rest } = layer;
    return visible === false ? rest : { ...rest, visible: false };
  });

export const setBlendMode = (layers: readonly ComposerLayer[], id: string, blendMode: BlendMode): ComposerLayer[] =>
  layers.map((layer) => (layer.id === id ? { ...layer, blendMode } : layer));

// the row at `from` dropped at `to` (indexes before the move); the handle ids move with the rows
export const moveLayer = (layers: readonly ComposerLayer[], from: number, to: number): ComposerLayer[] => {
  const moved = [...layers];
  const [layer] = moved.splice(from, 1);
  if (layer) moved.splice(to, 0, layer);
  return moved;
};
