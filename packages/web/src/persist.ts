import type { Edge, XYPosition } from "@xyflow/svelte";
import type { AnimationExport } from "@xtc-toaster/contract";
import { fromToastFile, toGraph, type Flow, type FlowGroup, type FlowNode } from "./graph";

// the editor survives a page reload: the graph with its picture, groups and export settings, and where the nodes stand
// (a group's inside — under `groupPositions`, by the group's id).
// the picture lives on the server for UPLOADS_TTL_HOURS — an expired one is the input's `image not found`
export const STORAGE_KEY = "xtc-toaster:editor";

type Positions = Record<string, XYPosition>;
type Saved = { graph: unknown; positions: Positions; groupPositions?: Record<string, Positions> };

const positionsOf = (nodes: readonly FlowNode[]): Positions =>
  Object.fromEntries(nodes.map(({ id, position: { x, y } }) => [id, { x, y }]));

export const toSaved = (nodes: FlowNode[], edges: Edge[], settings?: AnimationExport, groups: readonly FlowGroup[] = []): string =>
  JSON.stringify({
    graph: toGraph(nodes, edges, settings, groups),
    positions: positionsOf(nodes),
    ...(groups.length > 0 && { groupPositions: Object.fromEntries(groups.map(({ id, nodes }) => [id, positionsOf(nodes)])) }),
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
export const fromSaved = (text: string | null): Flow | null => {
  if (!text) return null;
  try {
    const { graph, positions, groupPositions } = JSON.parse(text) as Partial<Saved>;
    const flow = fromToastFile(JSON.stringify(graph), imageIdOf(graph));
    const placed = (nodes: FlowNode[], at: Positions | undefined) =>
      nodes.map((node) => {
        const position = at?.[node.id];
        return isPosition(position) ? { ...node, position } : node;
      });
    const groups = flow.groups?.map((group) => ({ ...group, nodes: placed(group.nodes, groupPositions?.[group.id]) }));
    return { ...flow, nodes: placed(flow.nodes, positions), ...(groups && { groups }) };
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
