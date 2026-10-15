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

const NO_PATH = "connect the input to the output";

// The path input → … → output, walked back from the output like blender: every
// node pulls its one image from the node linked into it. Nodes off the path
// (unlinked, dead-end forks) are ignored. A node on the path with several
// incoming links would need layers to merge them — sprint 4.
export const toPath = ({ nodes, edges }: ToastGraph): GraphNode[] => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (byId.size !== nodes.length) throw new GraphError("duplicate node id");

  // one of each for now — several inputs / outputs may come later
  const inputs = nodes.filter((node) => node.type === "input");
  const outputs = nodes.filter((node) => node.type === "output");
  if (inputs.length !== 1 || outputs.length !== 1) throw new GraphError("graph needs exactly one input and one output");

  const sources = new Map<NodeId, NodeId[]>();
  for (const { source, target } of edges) {
    if (!byId.has(source) || !byId.has(target)) throw new GraphError("edge points to a missing node");
    sources.set(target, [...(sources.get(target) ?? []), source]);
  }

  const path: GraphNode[] = [outputs[0]!];
  while (path[0]!.type !== "input") {
    const { id } = path[0]!;
    const [source, ...rest] = sources.get(id) ?? [];
    if (source === undefined) throw new GraphError(NO_PATH, id);
    if (rest.length > 0) throw new GraphError("a node takes one link in — merging comes with layers", id);
    if (path.some((node) => node.id === source)) throw new GraphError("the path loops", id);
    path.unshift(byId.get(source)!);
  }
  return path;
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
  const [input, ...rest] = toPath(graph) as [InputNode, ...GraphNode[]];
  const { data, width, height } = await loadInput(input, uploadsDir);

  const composition = new Composition(width, height);
  const layer = composition.createLayerFromPixelData(data);

  for (const node of rest) {
    switch (node.type) {
      case "noize":
        layer.applyEffect({ name: "noize", options: { deviationCoefficient: node.data.deviationCoefficient } });
        break;
      case "hueMask":
        // lib takes the tolerance normalized to the wheel
        layer.mask({ name: "hue", value: node.data.hue, tolerance: node.data.tolerance / 360 });
        break;
      case "output":
        return { data: composition.render(), width, height };
      case "input":
        throw new GraphError(NO_PATH, node.id); // unreachable: the path starts at the only input
    }
  }
  throw new GraphError(NO_PATH); // unreachable: the path ends with the output
};
