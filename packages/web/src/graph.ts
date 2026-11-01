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
// ui name of a node type — the menu item and the node's legend: the contract type in words (decided 01.11 —
// one name in web, contract, server and lib; turn3d reads «3d turn»)
export const NODE_LABELS = {
  selectColor: "select color",
  selectVivid: "select vivid",
  selectBright: "select bright",
  channel: "channel",
  fill: "fill",
  tint: "tint",
  colorNoise: "color noise",
  opacity: "opacity",
  blur: "blur",
  move: "move",
  rotate: "rotate",
  scale: "scale",
  skew: "skew",
  turn3d: "3d turn",
  corners: "corners",
  matrix: "matrix",
  layers: "layers",
} as const satisfies Record<MenuNodeType, string>;

// one phrase «what the node does» — a tooltip on the menu item
export const NODE_HINTS = {
  selectColor: "keeps pixels of one color, the rest goes transparent",
  selectVivid: "keeps vivid (or dull) pixels",
  selectBright: "keeps light (or dark) pixels",
  channel: "keeps one of red / green / blue / alpha",
  fill: "paints the whole picture one color",
  tint: "paints what's visible, keeps transparency",
  colorNoise: "shifts every pixel's color at random",
  opacity: "makes the picture see-through",
  blur: "softens the picture",
  move: "shifts the picture",
  rotate: "turns the picture around its center",
  scale: "makes the picture bigger or smaller",
  skew: "leans the picture",
  turn3d: "turns the picture like a card",
  corners: "drags the four corners",
  matrix: "a raw 3×3 transform, for experts",
  layers: "stacks pictures with blend modes",
} as const satisfies Record<MenuNodeType, string>;

// the left menu, a rule between groups; every menu type in exactly one (graph.test.ts)
export const NODE_CATEGORIES = [
  { name: "select", types: ["selectColor", "selectVivid", "selectBright", "channel"] },
  { name: "color", types: ["fill", "tint", "colorNoise", "opacity"] },
  { name: "effect", types: ["blur"] },
  { name: "move", types: ["move", "rotate", "scale", "skew", "turn3d", "corners", "matrix"] },
  { name: "layers", types: ["layers"] },
] as const satisfies readonly { name: string; types: readonly MenuNodeType[] }[];
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

// what the input reaches by columns, the rest in a row below everything. A node takes the row of what it
// pulls when that cell is free — parallel chains (a layers node's rows) run straight, not crossing — else the
// next free row below
export const toFlow = (graph: ToastGraph): { nodes: FlowNode[]; edges: Edge[] } => {
  const column = columns(graph);
  const sources = new Map<NodeId, NodeId[]>();
  for (const { source, target } of graph.edges) sources.set(target, [...(sources.get(target) ?? []), source]);
  const taken = new Map<number, Set<number>>();
  const row = new Map<NodeId, number>();
  const reached = graph.nodes.filter(({ id }) => column.has(id));
  // left to right, so a node's sources are placed before it; sort is stable — graph order within a column
  for (const { id } of reached.toSorted((a, b) => column.get(a.id)! - column.get(b.id)!)) {
    const x = column.get(id)!;
    const cells = taken.get(x) ?? new Set<number>();
    taken.set(x, cells);
    const from = sources.get(id)?.find((source) => row.has(source));
    let y = from === undefined ? 0 : row.get(from)!;
    while (cells.has(y)) y++;
    cells.add(y);
    row.set(id, y);
  }
  const offRow = (Math.max(0, ...row.values()) + 1) * ROW_GAP_Y;
  let off = 0;
  const nodes = graph.nodes.map((node) => {
    const x = column.get(node.id);
    const position =
      x === undefined ? { x: off++ * NODE_GAP_X, y: offRow } : { x: x * NODE_GAP_X, y: row.get(node.id)! * ROW_GAP_Y };
    return { ...node, position, ...(isFixed(node.type) && { deletable: false }) } as FlowNode;
  });
  return { nodes, edges: graph.edges.map(toGraphEdge) };
};

// «clear graph»: input → output, the picture stays
export const emptyFlow = (imageId: string | null) =>
  toFlow({
    version: TOAST_GRAPH_VERSION,
    nodes: [
      { id: "in", type: "input", data: { imageId } },
      { id: "out", type: "output", data: {} },
    ],
    edges: [{ id: "in-out", source: "in", target: "out" }],
  });

export const createNode =(type: MenuNodeType, position: XYPosition): FlowNode => {
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

// drops the link already in the connection's target handle (a node's input, a layers row) — a new one
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
