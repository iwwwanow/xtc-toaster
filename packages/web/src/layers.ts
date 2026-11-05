import type { Edge } from "@xyflow/svelte";
import { LAYER_NAME_MAX, type BlendMode, type LayerRow } from "@xtc-toaster/contract";

// Layers rows, top first. Pure — session applies the result to the node data (and the edges).

// a row id is its handle id: unique within the node, never reused while the node lives — a link keeps it
const nextId = (layers: readonly LayerRow[]): string => {
  let n = layers.length + 1;
  while (layers.some(({ id }) => id === `layer-${n}`)) n++;
  return `layer-${n}`;
};

// a new row goes on top
export const addLayer = (layers: readonly LayerRow[]): LayerRow[] => [
  { id: nextId(layers), blendMode: "normal" },
  ...layers,
];

export const removeLayer = (layers: readonly LayerRow[], id: string): LayerRow[] =>
  layers.filter((layer) => layer.id !== id);

// the row's link goes with it; a track's too
export const removeRowEdges = (edges: Edge[], nodeId: string, id: string): Edge[] =>
  edges.filter(({ target, targetHandle }) => target !== nodeId || targetHandle !== id);

// the shown name: the user's, else from the id ("layer-3" → "layer 3") — it moves with the row either way
export const layerName = ({ id, name }: LayerRow): string => name ?? id.replaceAll("-", " ");

// trimmed; empty or the id-derived name → back to no name of its own
export const renameLayer = (layers: readonly LayerRow[], id: string, name: string): LayerRow[] =>
  layers.map((layer) => {
    if (layer.id !== id) return layer;
    const { name: _, ...rest } = layer;
    const trimmed = name.trim().slice(0, LAYER_NAME_MAX);
    return trimmed && trimmed !== layerName(rest) ? { ...rest, name: trimmed } : rest;
  });

// visible: false only while hidden — a shown row has no field, like the toast files without it
export const toggleLayer = (layers: readonly LayerRow[], id: string): LayerRow[] =>
  layers.map((layer) => {
    if (layer.id !== id) return layer;
    const { visible, ...rest } = layer;
    return visible === false ? rest : { ...rest, visible: false };
  });

export const setBlendMode = (layers: readonly LayerRow[], id: string, blendMode: BlendMode): LayerRow[] =>
  layers.map((layer) => (layer.id === id ? { ...layer, blendMode } : layer));

// the row at `from` dropped at `to` (indexes before the move); the handle ids move with the rows.
// Layers rows and animation tracks alike
export const moveRow = <Row>(rows: readonly Row[], from: number, to: number): Row[] => {
  const moved = [...rows];
  const [row] = moved.splice(from, 1);
  if (row) moved.splice(to, 0, row);
  return moved;
};
