import { join } from "node:path";
import type { GraphNode, InputNode, IsolateChannelNode, NodeId, PerspectiveNode, ToastGraph } from "@xtc-toaster/contract";
import {
  Channel,
  Color,
  Composition,
  imageFileToRawData,
  type ImageRawDataArray,
  type Layer,
  type LayerDimensions,
  type Quad,
} from "@xtc-toaster/lib";

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

// 35 mm equivalent like a blender camera with sensor fit Auto: the 36 mm sensor
// spans the larger side of the image, so a lens frames portrait and landscape alike
export const focalLengthPx = (mm: number, { width, height }: LayerDimensions) =>
  (mm / 36) * Math.max(width, height);

// contract percent of the image size → lib px
export const percentPx = (percent: number, size: number) => (percent / 100) * size;

const tanDeg = (degrees: number) => Math.tan((Math.PI / 180) * degrees);

// contract percent of the image → lib px, TL TR BR BL; 0 / 100 % are the first / last pixel,
// so the untouched corners give exactly the identity (lib maps the source corners the same way)
export const perspectiveCorners = (corners: PerspectiveNode["data"], { width, height }: LayerDimensions): Quad => {
  const at = (x: number, y: number) => ({ x: (x / 100) * (width - 1), y: (y / 100) * (height - 1) });
  return [
    at(corners.topLeftX, corners.topLeftY),
    at(corners.topRightX, corners.topRightY),
    at(corners.bottomRightX, corners.bottomRightY),
    at(corners.bottomLeftX, corners.bottomLeftY),
  ];
};

const CHANNEL: Record<IsolateChannelNode["data"]["channel"], Channel> = {
  red: Channel.Red,
  green: Channel.Green,
  blue: Channel.Blue,
  alpha: Channel.Alpha,
};

const loadInput = async ({ id, data: { imageId } }: InputNode, uploadsDir: string) => {
  if (imageId === null) throw new GraphError("upload an image", id);
  // imageId is a uuid (contract) — safe to build a path from
  const path = join(uploadsDir, imageId);
  if (!(await Bun.file(path).exists())) throw new GraphError("image not found", id);
  return imageFileToRawData(path);
};

type Applied = { node: Exclude<GraphNode, InputNode>; layer: Layer } & LayerDimensions;

// one node onto the layer; opacity is returned, not applied — lib keeps one opacity per layer and
// bakes it at render, so the chain multiplies its opacity nodes here
const applyNode = ({ node, layer, width, height }: Applied, opacity: number): number => {
  switch (node.type) {
    case "hueNoise":
      layer.applyEffect({ name: "hueNoise", options: { deviationCoefficient: node.data.deviationCoefficient } });
      break;
    case "hueMask":
      // lib takes the tolerance normalized to the wheel
      layer.mask({ name: "hue", value: node.data.hue, tolerance: node.data.tolerance / 360 });
      break;
    case "yRotation":
      // contract has mm, lib takes px of the image
      layer.setTransform({
        name: "yRotation",
        params: { angle: node.data.angle, focalLength: focalLengthPx(node.data.focalLength, { width, height }) },
      });
      break;
    case "blur":
      layer.applyEffect({ name: "blur", options: { radius: node.data.radius } });
      break;
    case "saturationMask":
      // contract has percent for both, lib takes the tolerance normalized
      layer.mask({ name: "saturation", value: node.data.saturation, tolerance: node.data.tolerance / 100 });
      break;
    case "valueMask":
      layer.mask({ name: "value", value: node.data.value, tolerance: node.data.tolerance / 100 });
      break;
    case "isolateChannel":
      layer.isolateChannel(CHANNEL[node.data.channel]);
      break;
    case "translate":
      // contract has percent of the image size, lib takes px
      layer.setTransform({
        name: "translate",
        params: { tx: percentPx(node.data.x, width), ty: percentPx(node.data.y, height) },
      });
      break;
    case "rotate":
      layer.setTransform({ name: "rotate", params: { alpha: node.data.angle } });
      break;
    case "scale":
      layer.setTransform({ name: "scale", params: { scaleX: node.data.x, scaleY: node.data.y } });
      break;
    case "skew":
      // contract has degrees, lib takes the shear factor; lib's ty leans the verticals, tx the horizontals
      layer.setTransform({ name: "skew", params: { tx: tanDeg(node.data.y), ty: tanDeg(node.data.x) } });
      break;
    case "perspective":
      layer.setTransform({ name: "perspective", params: { corners: perspectiveCorners(node.data, { width, height }) } });
      break;
    case "homography":
      layer.setTransform({ name: "homography", params: { matrix: node.data.matrix } });
      break;
    case "fill":
      layer.fill(Color.fromHex(node.data.color));
      break;
    case "tint":
      layer.tint(Color.fromHex(node.data.color));
      break;
    case "opacity":
      return opacity * node.data.opacity;
    case "output":
      break;
  }
  return opacity;
};

export const runGraph = async (
  graph: ToastGraph,
  uploadsDir: string,
): Promise<{ data: ImageRawDataArray } & LayerDimensions> => {
  const [input, ...rest] = toPath(graph) as [InputNode, ...GraphNode[]];
  const { data, width, height } = await loadInput(input, uploadsDir);

  const composition = new Composition(width, height);
  const layer = composition.createLayerFromPixelData(data);
  let opacity = 1;

  for (const node of rest) {
    if (node.type === "input") throw new GraphError(NO_PATH, node.id); // unreachable: the path starts at the only input
    if (node.type === "output") {
      if (opacity < 1) layer.setOpacity(opacity);
      return { data: composition.render(), width, height };
    }
    try {
      opacity = applyNode({ node, layer, width, height }, opacity);
    } catch (error) {
      // lib throws plain errors (a singular matrix of a degenerate perspective / homography) — point them at the node
      throw error instanceof GraphError ? error : new GraphError(error instanceof Error ? error.message : String(error), node.id);
    }
  }
  throw new GraphError(NO_PATH); // unreachable: the path ends with the output
};
