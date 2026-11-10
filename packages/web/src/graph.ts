import type { Edge, Node, XYPosition } from "@xyflow/svelte";
import {
  INITIAL_DATA,
  PARAMS,
  parseToastGraph,
  TOAST_GRAPH_VERSION,
  validateGraph,
  type AnimationExport,
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
  animation: "animation",
  delay: "delay",
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
  animation: "changes numeric params from frame to frame, one per graph",
  delay: "plays the params wired through it some frames later",
} as const satisfies Record<MenuNodeType, string>;

// the left menu, a rule between groups; every menu type in exactly one (graph.test.ts)
export const NODE_CATEGORIES = [
  { name: "select", types: ["selectColor", "selectVivid", "selectBright", "channel"] },
  { name: "color", types: ["fill", "tint", "colorNoise", "opacity"] },
  { name: "effect", types: ["blur"] },
  { name: "move", types: ["move", "rotate", "scale", "skew", "turn3d", "corners", "matrix"] },
  { name: "layers", types: ["layers"] },
  { name: "animation", types: ["animation", "delay"] },
] as const satisfies readonly { name: string; types: readonly MenuNodeType[] }[];
export const isMenuNodeType = (type: string): type is MenuNodeType => (MENU_NODE_TYPES as string[]).includes(type);

const NODE_GAP_X = 400;
const ROW_GAP_Y = 400;

// exactly one input and one output, never deleted — several of each may come later
const isFixed = (type: GraphNode["type"]) => type === "input" || type === "output";

// a param link carries a number, not pixels — it has no say in the layout
const pixelLinks = (edges: readonly GraphEdge[]) => edges.filter(({ sourceHandle }) => sourceHandle === undefined);

// positions are not in the toast: the column is the longest path from the input, so a node sits right
// of everything it pulls; a column stacks its nodes top-down in graph order
const columns = ({ nodes, edges }: ToastGraph): Map<NodeId, number> => {
  const next = new Map<NodeId, NodeId[]>();
  for (const { source, target } of pixelLinks(edges)) next.set(source, [...(next.get(source) ?? []), target]);
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

// xyflow has a handle null on a node with one unnamed handle — the contract has no field then
const toGraphEdge = ({ id, source, sourceHandle, target, targetHandle }: Edge | GraphEdge): GraphEdge => ({
  id,
  source,
  target,
  ...(sourceHandle && { sourceHandle }),
  ...(targetHandle && { targetHandle }),
});

// what the input reaches by columns, the rest in a row below everything. A node takes the row of what it
// pulls when that cell is free — parallel chains (a layers node's rows) run straight, not crossing — else the
// next free row below
// the editor's whole state that a toast holds: the graph as xyflow takes it, the export settings beside it
export type Flow = { nodes: FlowNode[]; edges: Edge[]; export?: AnimationExport };

// export settings as the toast keeps them: nothing set — no field
const exportField = (settings: AnimationExport | undefined) =>
  settings && Object.keys(settings).length > 0 ? { export: settings } : {};

export const toFlow = (graph: ToastGraph): Flow => {
  const column = columns(graph);
  const sources = new Map<NodeId, NodeId[]>();
  for (const { source, target } of pixelLinks(graph.edges)) sources.set(target, [...(sources.get(target) ?? []), source]);
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
  // the animation node is wider than a column — a row of its own, under the unlinked ones; right of the params it
  // animates, so their wires run forward and don't loop back
  const offRowCount = graph.nodes.filter(({ id, type }) => !column.has(id) && type !== "animation").length;
  const animatedColumns = graph.edges.flatMap(({ source, sourceHandle }) => (sourceHandle ? [column.get(source) ?? 0] : []));
  const place = ({ id, type }: GraphNode): XYPosition => {
    const x = column.get(id);
    if (x !== undefined) return { x: x * NODE_GAP_X, y: row.get(id)! * ROW_GAP_Y };
    if (type === "animation")
      return { x: (Math.max(-1, ...animatedColumns) + 1) * NODE_GAP_X, y: offRow + (offRowCount > 0 ? ROW_GAP_Y : 0) };
    return { x: off++ * NODE_GAP_X, y: offRow };
  };
  const nodes = graph.nodes.map((node) => {
    const position = place(node);
    return { ...node, position, ...(isFixed(node.type) && { deletable: false }) } as FlowNode;
  });
  return { nodes, edges: graph.edges.map(toGraphEdge), ...exportField(graph.export) };
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
export const toGraph = (nodes: FlowNode[], edges: Edge[], settings?: AnimationExport): ToastGraph =>
  parseToastGraph({
    version: TOAST_GRAPH_VERSION,
    nodes: nodes.map(({ id, type, data }) => ({ id, type, data })),
    edges: edges.map(toGraphEdge),
    ...exportField(settings),
  });

// a drawn link — xyflow's Connection or an Edge being moved
export type Link = Pick<Edge, "source" | "sourceHandle" | "target" | "targetHandle">;

// drops the link already in the connection's target handle (a node's input, a layers row, a track) and, for a param
// link, the one that param already has (one track per param) — a new one replaces it, like blender; `keep` — the
// link being moved there, it stays
export const withoutTaken = (edges: Edge[], { source, sourceHandle, target, targetHandle }: Link, keep?: string): Edge[] =>
  edges.filter((edge) => {
    if (edge.id === keep) return true;
    if (edge.target === target && (edge.targetHandle ?? null) === (targetHandle ?? null)) return false;
    return !(sourceHandle && edge.source === source && edge.sourceHandle === sourceHandle);
  });

// xyflow's own id for a drawn link
const linkId = ({ source, sourceHandle, target, targetHandle }: Link) =>
  `xy-edge__${source}${sourceHandle ?? ""}-${target}${targetHandle ?? ""}`;

// A node dropped onto a pixel link A → B goes into it: A → node → B, like blender's auto-attach (28.10). Only a node
// with no pixel link yet and with a pixel input and output — not input / output, not animation / delay (params only);
// a layers node takes the link into its top row. The new graph passes validateGraph like any drawn link.
// The edges with the node in the link, or null — it doesn't go there
export const insertOnLink = (nodes: FlowNode[], edges: Edge[], nodeId: string, edgeId: string): Edge[] | null => {
  const node = nodes.find(({ id }) => id === nodeId);
  const link = edges.find(({ id }) => id === edgeId);
  if (!node || !link || link.sourceHandle || link.source === nodeId || link.target === nodeId) return null;
  if (isFixed(node.type) || node.type === "animation" || node.type === "delay") return null;
  if (edges.some(({ source, sourceHandle, target }) => (source === nodeId && !sourceHandle) || target === nodeId)) return null;
  const into = node.type === "layers" ? node.data.layers[0]?.id : undefined;
  if (node.type === "layers" && into === undefined) return null;
  const before: Link = { source: link.source, target: nodeId, ...(into && { targetHandle: into }) };
  const after: Link = { source: nodeId, target: link.target, ...(link.targetHandle && { targetHandle: link.targetHandle }) };
  const next = [...edges.filter(({ id }) => id !== edgeId), { id: linkId(before), ...before }, { id: linkId(after), ...after }];
  const issue = validateGraph({
    version: TOAST_GRAPH_VERSION,
    nodes: nodes.map(({ id, type, data }) => ({ id, type, data }) as GraphNode),
    edges: next.map(toGraphEdge),
  });
  return issue ? null : next;
};

type Point = { x: number; y: number };
export type Rect = Point & { width: number; height: number };

// a link's drawn path as xyflow's getBezierPath writes it: «M sx,sy C c1x,c1y c2x,c2y tx,ty»
const parseBezier = (d: string): Point[] | null => {
  const numbers = d.match(/-?\d*\.?\d+(?:e-?\d+)?/gi)?.map(Number);
  if (!d.trimStart().startsWith("M") || !d.includes("C") || numbers?.length !== 8) return null;
  return [0, 2, 4, 6].map((i) => ({ x: numbers[i]!, y: numbers[i + 1]! }));
};

const BEZIER_SAMPLES = 64;

// the links whose drawn path crosses the rect (a dragged node's box, flow coordinates), the one passing nearest its
// center first. Paths are the `d` of the drawn links — what the user sees is what's hit
export const linksUnder = (rect: Rect, paths: readonly { id: string; d: string }[]): string[] => {
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const hits: { id: string; distance: number }[] = [];
  for (const { id, d } of paths) {
    const curve = parseBezier(d);
    if (!curve) continue;
    const [p0, p1, p2, p3] = curve as [Point, Point, Point, Point];
    let distance = Infinity;
    for (let i = 0; i <= BEZIER_SAMPLES; i++) {
      const t = i / BEZIER_SAMPLES;
      const u = 1 - t;
      const [a, b, c, e] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
      const x = a * p0.x + b * p1.x + c * p2.x + e * p3.x;
      const y = a * p0.y + b * p1.y + c * p2.y + e * p3.y;
      if (x < rect.x || x > rect.x + rect.width || y < rect.y || y > rect.y + rect.height) continue;
      distance = Math.min(distance, Math.hypot(x - center.x, y - center.y));
    }
    if (distance < Infinity) hits.push({ id, distance });
  }
  return hits.toSorted((a, b) => a.distance - b.distance).map(({ id }) => id);
};

// the same rules the server applies (contract validateGraph), on the graph as it would be with the link
// in place of the one it replaces; no zod parse — runs on every handle the dragged link passes
export const canConnect = (nodes: FlowNode[], edges: Edge[], link: Link): boolean =>
  validateGraph({
    version: TOAST_GRAPH_VERSION,
    nodes: nodes.map(({ id, type, data }) => ({ id, type, data }) as GraphNode),
    edges: [...withoutTaken(edges, link), { ...link, id: "candidate" }].map(toGraphEdge),
  }) === null;

// A pixel wire let go over a node's frame, not on a handle, goes into the node's input (30.10, done 10.11): no aiming at
// the handle. A layers node takes it into the row under the pointer — a taken one is replaced, like a drop on its
// handle — or, over the frame but no row, into its top free row; all rows taken — nothing, a row to replace is aimed at.
// No pixel input — input, animation, delay — nothing. `keep` — the link whose end is being moved there, it doesn't
// count as taking a row. The link, or null — the same rules as a drawn link (canConnect)
export const linkOntoNode = (
  nodes: FlowNode[],
  edges: Edge[],
  source: string,
  nodeId: string,
  row: string | null,
  keep?: string,
): Link | null => {
  const node = nodes.find(({ id }) => id === nodeId);
  if (!node || nodeId === source || node.type === "input" || node.type === "animation" || node.type === "delay") return null;
  const others = edges.filter(({ id }) => id !== keep);
  let targetHandle: string | undefined;
  if (node.type === "layers") {
    const taken = new Set(others.filter(({ target }) => target === nodeId).map((edge) => edge.targetHandle));
    targetHandle =
      row === null ? node.data.layers.find(({ id }) => !taken.has(id))?.id : node.data.layers.find(({ id }) => id === row)?.id;
    if (targetHandle === undefined) return null;
  }
  const link: Link = { source, target: nodeId, ...(targetHandle && { targetHandle }) };
  return canConnect(nodes, others, link) ? link : null;
};

// a link put in place of what its target had (withoutTaken); `keep` — the link being moved, it goes away
export const withLink = (edges: Edge[], link: Link, keep?: string): Edge[] => [
  ...withoutTaken(edges, link, keep).filter(({ id }) => id !== keep),
  { id: linkId(link), ...link },
];

// toast file: the graph only, imageId: null — a toast is a preset, not a picture.
// whether to save the picture too is open — docs/backlog/2026-10-13_toast-export-with-image.md
export const toToastFile = (nodes: FlowNode[], edges: Edge[], settings?: AnimationExport): string => {
  const graph = toGraph(nodes, edges, settings);
  const withoutImage = graph.nodes.map((node) => (node.type === "input" ? { ...node, data: { imageId: null } } : node));
  return `${JSON.stringify({ ...graph, nodes: withoutImage }, null, 2)}\n`;
};

// shown in the ui; the details go to console.error
export class ToastFileError extends Error {}

// same schema as ws messages, plus what the editor relies on: one input, one output, unique ids.
// the picture stays — the current imageId goes into the input
export const fromToastFile = (text: string, imageId: string | null): Flow => {
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
