import { join } from "node:path";
import type { GraphNode, InputNode, NodeId, ToastGraph } from "@xtc-toaster/contract";
import { Composition, imageFileToRawData, type ImageRawDataArray, type LayerDimensions } from "@xtc-toaster/lib";

// becomes render-error; nodeId points the client at the node to highlight
export class GraphError extends Error {
  constructor(
    message: string,
    readonly nodeId?: NodeId,
  ) {
    super(message);
  }
}

const NOT_A_CHAIN = "graph must be a chain input → … → output";

// Orders the nodes along the only path input → … → output. Anything that is
// not one linear chain covering every node is rejected.
export const toChain = ({ nodes, edges }: ToastGraph): GraphNode[] => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (byId.size !== nodes.length) throw new GraphError("duplicate node id");

  const inputs = nodes.filter((node) => node.type === "input");
  const outputs = nodes.filter((node) => node.type === "output");
  if (inputs.length !== 1 || outputs.length !== 1) throw new GraphError("graph needs exactly one input and one output");

  const next = new Map<NodeId, NodeId>();
  const hasIncoming = new Set<NodeId>();
  for (const { source, target } of edges) {
    if (!byId.has(source) || !byId.has(target)) throw new GraphError("edge points to a missing node");
    if (next.has(source) || hasIncoming.has(target)) throw new GraphError(NOT_A_CHAIN);
    next.set(source, target);
    hasIncoming.add(target);
  }

  const chain: GraphNode[] = [inputs[0]!];
  let current = next.get(chain[0]!.id);
  while (current !== undefined && chain.length <= nodes.length) {
    chain.push(byId.get(current)!);
    current = next.get(current);
  }

  if (chain.length !== nodes.length || chain.at(-1)!.type !== "output") throw new GraphError(NOT_A_CHAIN);
  return chain;
};

const loadInput = async ({ id, data: { imageId } }: InputNode, uploadsDir: string) => {
  if (imageId === null) throw new GraphError("upload an image", id);
  // imageId is a uuid (contract) — safe to build a path from
  const path = join(uploadsDir, imageId);
  if (!(await Bun.file(path).exists())) throw new GraphError("image not found", id);
  return imageFileToRawData(path);
};

export const runGraph = async (
  graph: ToastGraph,
  uploadsDir: string,
): Promise<{ data: ImageRawDataArray } & LayerDimensions> => {
  const [input, ...rest] = toChain(graph) as [InputNode, ...GraphNode[]];
  const { data, width, height } = await loadInput(input, uploadsDir);

  const composition = new Composition(width, height);
  const layer = composition.createLayerFromPixelData(data);

  for (const node of rest) {
    switch (node.type) {
      case "noize":
        layer.applyEffect({ name: "noize", options: { deviationCoefficient: node.data.deviationCoefficient } });
        break;
      case "output":
        return { data: composition.render(), width, height };
      case "input":
        throw new GraphError(NOT_A_CHAIN, node.id); // unreachable: toChain allows one input
    }
  }
  throw new GraphError(NOT_A_CHAIN); // unreachable: toChain ends with output
};
