import type { Edge, Node, XYPosition } from "@xyflow/svelte";
import {
  CHANNELS,
  PARAMS,
  parseToastGraph,
  TOAST_GRAPH_VERSION,
  type GraphNode,
  type NodeId,
  type ToastGraph,
} from "@xtc-toaster/contract";

// svelte flow node per contract node type — data stays exactly the contract data
export type FlowNodeOf<T extends GraphNode["type"]> = Node<Extract<GraphNode, { type: T }>["data"], T>;
export type FlowNode = { [T in GraphNode["type"]]: FlowNodeOf<T> }[GraphNode["type"]];

// node types of the left menu: everything with params; input and output are fixed.
// isolateChannel has no range — it picks one of CHANNELS
export type MenuNodeType = keyof typeof PARAMS | "isolateChannel";
export const MENU_NODE_TYPES = [...(Object.keys(PARAMS) as (keyof typeof PARAMS)[]), "isolateChannel"] as MenuNodeType[];
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
  isolateChannel: "isolate channel",
} as const satisfies Record<MenuNodeType, string>;
export const isMenuNodeType = (type: string): type is MenuNodeType => (MENU_NODE_TYPES as string[]).includes(type);

const NODE_GAP_X = 400;
const ROW_GAP_Y = 400;

// exactly one input and one output, never deleted — several of each may come later
const isFixed = (type: GraphNode["type"]) => type === "input" || type === "output";

// positions are not in the toast: left to right by chain order, starting from the input
const chainOrder = ({ nodes, edges }: ToastGraph): NodeId[] => {
  const next = new Map(edges.map(({ source, target }) => [source, target]));
  const order: NodeId[] = [];
  let current = nodes.find((node) => node.type === "input")?.id;
  while (current !== undefined && !order.includes(current)) {
    order.push(current);
    current = next.get(current);
  }
  return order;
};

// chain in the first row, nodes off the chain in a row below it
export const toFlow = (graph: ToastGraph): { nodes: FlowNode[]; edges: Edge[] } => {
  const order = chainOrder(graph);
  let offChain = 0;
  const nodes = graph.nodes.map((node) => {
    const index = order.indexOf(node.id);
    const position = index === -1 ? { x: offChain++ * NODE_GAP_X, y: ROW_GAP_Y } : { x: index * NODE_GAP_X, y: 0 };
    return { ...node, position, ...(isFixed(node.type) && { deletable: false }) } as FlowNode;
  });
  const edges = graph.edges.map(({ id, source, target }) => ({ id, source, target }));
  return { nodes, edges };
};

export const createNode = (type: MenuNodeType, position: XYPosition): FlowNode => {
  const data =
    type === "isolateChannel"
      ? { channel: CHANNELS[0] }
      : Object.fromEntries(Object.entries(PARAMS[type]).map(([name, { initial }]) => [name, initial]));
  return { id: crypto.randomUUID(), type, position, data } as FlowNode;
};

// strips ui fields (position, selected, measured, …) — server does not depend on xyflow
export const toGraph = (nodes: FlowNode[], edges: Edge[]): ToastGraph =>
  parseToastGraph({
    version: TOAST_GRAPH_VERSION,
    nodes: nodes.map(({ id, type, data }) => ({ id, type, data })),
    edges: edges.map(({ id, source, target }) => ({ id, source, target })),
  });

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

  const nodes = graph.nodes.map((node) => (node.type === "input" ? { ...node, data: { imageId } } : node));
  return toFlow({ ...graph, nodes });
};
