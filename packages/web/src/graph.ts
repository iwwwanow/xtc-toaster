import type { Edge, Node, XYPosition } from "@xyflow/svelte";
import {
  INITIAL_DATA,
  PARAMS,
  parseToastGraph,
  TOAST_GRAPH_VERSION,
  validateGraph,
  type GraphEdge,
  type GraphNode,
  type NodeId,
  type ToastGraph,
} from "@xtc-toaster/contract";

// svelte flow node per contract node type — data stays exactly the contract data
export type FlowNodeOf<T extends GraphNode["type"]> = Node<Extract<GraphNode, { type: T }>["data"], T>;
export type FlowNode = { [T in GraphNode["type"]]: FlowNodeOf<T> }[GraphNode["type"]];

// node types of the left menu: everything with params; input and output are fixed.
// PARAMS — ranges (sliders), INITIAL_DATA — the rest (a select, a color, a matrix)
export type MenuNodeType = keyof typeof PARAMS | keyof typeof INITIAL_DATA;
export const MENU_NODE_TYPES = [...Object.keys(PARAMS), ...Object.keys(INITIAL_DATA)] as MenuNodeType[];
const hasInitialData = (type: MenuNodeType): type is keyof typeof INITIAL_DATA => type in INITIAL_DATA;
// drag & drop from the menu onto the canvas carries the node type under this mime
export const NODE_TYPE_MIME = "application/x-xtc-node-type";
// ui name of a node type — the menu item and the node's legend; the type itself stays the contract key
export const NODE_LABELS = {
  hueNoise: "hue noise",
  hueMask: "hue mask",
  yRotation: "y-rotation",
  blur: "blur",
  saturationMask: "saturation mask",
  valueMask: "value mask",
  translate: "translate",
  rotate: "rotate",
  scale: "scale",
  skew: "skew",
  perspective: "perspective",
  opacity: "opacity",
  isolateChannel: "isolate channel",
  homography: "homography",
  fill: "fill",
  tint: "tint",
  composer: "composer",
} as const satisfies Record<MenuNodeType, string>;
export const isMenuNodeType = (type: string): type is MenuNodeType => (MENU_NODE_TYPES as string[]).includes(type);

const NODE_GAP_X = 400;
const ROW_GAP_Y = 400;

// exactly one input and one output, never deleted — several of each may come later
const isFixed = (type: GraphNode["type"]) => type === "input" || type === "output";

// positions are not in the toast: the column is the longest path from the input, so a node sits right
// of everything it pulls; a column stacks its nodes top-down in graph order
const columns = ({ nodes, edges }: ToastGraph): Map<NodeId, number> => {
  const next = new Map<NodeId, NodeId[]>();
  for (const { source, target } of edges) next.set(source, [...(next.get(source) ?? []), target]);
  const column = new Map<NodeId, number>();
  const input = nodes.find((node) => node.type === "input")?.id;
  if (input === undefined) return column;
  // one step deeper per round, the last round that reaches a node wins; bounded — a cycle can't hang it
  column.set(input, 0);
  let frontier = [input];
  for (let depth = 1; frontier.length > 0 && depth < nodes.length; depth++) {
    const reached = new Set<NodeId>();
    for (const id of frontier) for (const target of next.get(id) ?? []) reached.add(target);
    for (const id of reached) column.set(id, depth);
    frontier = [...reached];
  }
  return column;
};

// xyflow has targetHandle: null on a node with one unnamed handle — the contract has no field then
const toGraphEdge = ({ id, source, target, targetHandle }: Edge | GraphEdge): GraphEdge => ({
  id,
  source,
  target,
  ...(targetHandle && { targetHandle }),
});

// what the input reaches by columns, the rest in a row below everything
export const toFlow = (graph: ToastGraph): { nodes: FlowNode[]; edges: Edge[] } => {
  const column = columns(graph);
  const rows = new Map<number, number>();
  const nextRow = (x: number) => {
    const row = rows.get(x) ?? 0;
    rows.set(x, row + 1);
    return row;
  };
  const placed = graph.nodes.map((node) => {
    const x = column.get(node.id);
    return x === undefined ? null : { x: x * NODE_GAP_X, y: nextRow(x) * ROW_GAP_Y };
  });
  const offRow = Math.max(1, ...rows.values()) * ROW_GAP_Y;
  let off = 0;
  const nodes = graph.nodes.map((node, index) => {
    const position = placed[index] ?? { x: off++ * NODE_GAP_X, y: offRow };
    return { ...node, position, ...(isFixed(node.type) && { deletable: false }) } as FlowNode;
  });
  return { nodes, edges: graph.edges.map(toGraphEdge) };
};

export const createNode = (type: MenuNodeType, position: XYPosition): FlowNode => {
  const data = hasInitialData(type)
    ? structuredClone(INITIAL_DATA[type]) // a copy — the matrix array must not be shared between nodes
    : Object.fromEntries(Object.entries(PARAMS[type]).map(([name, { initial }]) => [name, initial]));
  return { id: crypto.randomUUID(), type, position, data } as FlowNode;
};

// strips ui fields (position, selected, measured, …) — server does not depend on xyflow
export const toGraph = (nodes: FlowNode[], edges: Edge[]): ToastGraph =>
  parseToastGraph({
    version: TOAST_GRAPH_VERSION,
    nodes: nodes.map(({ id, type, data }) => ({ id, type, data })),
    edges: edges.map(toGraphEdge),
  });

// a drawn link — xyflow's Connection or an Edge being moved
export type Link = Pick<Edge, "source" | "target" | "targetHandle">;

// drops the link already in the connection's target handle (a node's input, a composer row) — a new one
// replaces it, like blender; `keep` — the link being moved there, it stays
export const withoutTaken = (
  edges: Edge[],
  { target, targetHandle }: Pick<Link, "target" | "targetHandle">,
  keep?: string,
): Edge[] =>
  edges.filter(
    (edge) => edge.id === keep || edge.target !== target || (edge.targetHandle ?? null) !== (targetHandle ?? null),
  );

// the same rules the server applies (contract validateGraph), on the graph as it would be with the link
// in place of the one it replaces; no zod parse — runs on every handle the dragged link passes
export const canConnect = (nodes: FlowNode[], edges: Edge[], { source, target, targetHandle }: Link): boolean =>
  validateGraph({
    version: TOAST_GRAPH_VERSION,
    nodes: nodes.map(({ id, type, data }) => ({ id, type, data }) as GraphNode),
    edges: [...withoutTaken(edges, { target, targetHandle }), { id: "candidate", source, target, targetHandle }].map(toGraphEdge),
  }) === null;

// toast file: the graph only, imageId: null — a toast is a preset, not a picture.
// whether to save the picture too is open — docs/backlog/2026-10-13_toast-export-with-image.md
export const toToastFile = (nodes: FlowNode[], edges: Edge[]): string => {
  const graph = toGraph(nodes, edges);
  const withoutImage = graph.nodes.map((node) => (node.type === "input" ? { ...node, data: { imageId: null } } : node));
  return `${JSON.stringify({ ...graph, nodes: withoutImage }, null, 2)}\n`;
};

// shown in the ui; the details go to console.error
export class ToastFileError extends Error {}

// same schema as ws messages, plus what the editor relies on: one input, one output, unique ids.
// the picture stays — the current imageId goes into the input
export const fromToastFile = (text: string, imageId: string | null): { nodes: FlowNode[]; edges: Edge[] } => {
  let graph: ToastGraph;
  try {
    graph = parseToastGraph(JSON.parse(text));
  } catch (error) {
    console.error("toast import failed", error);
    throw new ToastFileError(error instanceof SyntaxError ? "not a json file" : "not a toast file");
  }
  const count = (type: GraphNode["type"]) => graph.nodes.filter((node) => node.type === type).length;
  if (count("input") !== 1 || count("output") !== 1) {
    throw new ToastFileError("a toast needs exactly one input and one output");
  }
  if (new Set(graph.nodes.map(({ id }) => id)).size !== graph.nodes.length) throw new ToastFileError("duplicate node id");
  // links the editor would refuse (a cycle, two into one input, …)
  const issue = validateGraph(graph);
  if (issue) throw new ToastFileError(issue.message);

  const nodes = graph.nodes.map((node) => (node.type === "input" ? { ...node, data: { imageId } } : node));
  return toFlow({ ...graph, nodes });
};
