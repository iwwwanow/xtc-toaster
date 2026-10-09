import type { Edge, Node } from "@xyflow/svelte";
import {
  parseToastGraph,
  TOAST_GRAPH_VERSION,
  type GraphNode,
  type NodeId,
  type ToastGraph,
} from "@xtc-toaster/contract";

// svelte flow node per contract node type — data stays exactly the contract data
export type FlowNodeOf<T extends GraphNode["type"]> = Node<Extract<GraphNode, { type: T }>["data"], T>;
export type FlowNode = { [T in GraphNode["type"]]: FlowNodeOf<T> }[GraphNode["type"]];

const NODE_GAP_X = 300;

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

export const toFlow = (graph: ToastGraph): { nodes: FlowNode[]; edges: Edge[] } => {
  const order = chainOrder(graph);
  const nodes = graph.nodes.map(
    (node) => ({ ...node, position: { x: order.indexOf(node.id) * NODE_GAP_X, y: 0 } }) as FlowNode,
  );
  const edges = graph.edges.map(({ id, source, target }) => ({ id, source, target }));
  return { nodes, edges };
};

// strips ui fields (position, selected, measured, …) — server does not depend on xyflow
export const toGraph = (nodes: FlowNode[], edges: Edge[]): ToastGraph =>
  parseToastGraph({
    version: TOAST_GRAPH_VERSION,
    nodes: nodes.map(({ id, type, data }) => ({ id, type, data })),
    edges: edges.map(({ id, source, target }) => ({ id, source, target })),
  });
