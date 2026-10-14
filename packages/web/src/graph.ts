import type { Edge, Node, XYPosition } from "@xyflow/svelte";
import {
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

// node types of the left menu: everything with params; input and output are fixed
export type MenuNodeType = keyof typeof PARAMS;
export const MENU_NODE_TYPES = Object.keys(PARAMS) as MenuNodeType[];
// drag & drop from the menu onto the canvas carries the node type under this mime
export const NODE_TYPE_MIME = "application/x-xtc-node-type";
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
  const data = Object.fromEntries(Object.entries(PARAMS[type]).map(([name, { initial }]) => [name, initial]));
  return { id: crypto.randomUUID(), type, position, data } as FlowNode;
};

// strips ui fields (position, selected, measured, …) — server does not depend on xyflow
export const toGraph = (nodes: FlowNode[], edges: Edge[]): ToastGraph =>
  parseToastGraph({
    version: TOAST_GRAPH_VERSION,
    nodes: nodes.map(({ id, type, data }) => ({ id, type, data })),
    edges: edges.map(({ id, source, target }) => ({ id, source, target })),
  });
