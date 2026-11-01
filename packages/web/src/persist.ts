import type { Edge, XYPosition } from "@xyflow/svelte";
import { fromToastFile, toGraph, type FlowNode } from "./graph";

// the editor survives a page reload: the graph with its picture and where the nodes stand.
// the picture lives on the server for UPLOADS_TTL_HOURS — an expired one is the input's `image not found`
export const STORAGE_KEY = "xtc-toaster:editor";

type Saved = { graph: unknown; positions: Record<string, XYPosition> };

export const toSaved = (nodes: FlowNode[], edges: Edge[]): string =>
  JSON.stringify({
    graph: toGraph(nodes, edges),
    positions: Object.fromEntries(nodes.map(({ id, position: { x, y } }) => [id, { x, y }])),
  } satisfies Saved);

const imageIdOf = (graph: unknown): string | null => {
  const nodes = (graph as { nodes?: { type?: unknown; data?: { imageId?: unknown } }[] } | null)?.nodes;
  const imageId = Array.isArray(nodes) ? nodes.find((node) => node?.type === "input")?.data?.imageId : null;
  return typeof imageId === "string" ? imageId : null;
};

const isPosition = (value: unknown): value is XYPosition =>
  typeof value === "object" &&
  value !== null &&
  Number.isFinite((value as XYPosition).x) &&
  Number.isFinite((value as XYPosition).y);

// the same checks as an imported toast file; anything off (an old format, a hand edit) → null, the default graph
export const fromSaved = (text: string | null): { nodes: FlowNode[]; edges: Edge[] } | null => {
  if (!text) return null;
  try {
    const { graph, positions } = JSON.parse(text) as Partial<Saved>;
    const flow = fromToastFile(JSON.stringify(graph), imageIdOf(graph));
    const nodes = flow.nodes.map((node) => {
      const position = positions?.[node.id];
      return isPosition(position) ? { ...node, position } : node;
    });
    return { nodes, edges: flow.edges };
  } catch (error) {
    console.error("saved editor dropped", error);
    return null;
  }
};

// a private window, blocked site data, a full quota — the editor works, it just doesn't remember
export const loadSaved = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

export const save = (text: string) => {
  try {
    localStorage.setItem(STORAGE_KEY, text);
  } catch (error) {
    console.error("editor not saved", error);
  }
};
