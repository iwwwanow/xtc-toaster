import { join } from "node:path";
import {
  validateGraph,
  type ComposerNode,
  type GraphEdge,
  type GraphNode,
  type InputNode,
  type IsolateChannelNode,
  type NodeId,
  type OutputNode,
  type PerspectiveNode,
  type ToastGraph,
} from "@xtc-toaster/contract";
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

// the layer cap when RENDER_MAX_LAYERS is unset — a guess until the prod measurement (sprint 4)
export const RENDER_MAX_LAYERS_DEFAULT = 4;

// The output's ancestry, walked back from it like blender: how many links pull each node's
// result. Nodes off it (unlinked, dead-end forks) are ignored. Fails before any pixel work: a
// node on the way without its link, a composer without a linked row, too many layers.
const ancestry = (byId: Map<NodeId, GraphNode>, into: Map<NodeId, GraphEdge[]>, outputId: NodeId, maxLayers: number) => {
  const pulls = new Map<NodeId, number>();
  const queue = [outputId];
  let layers = 0;
  for (const id of queue) {
    const node = byId.get(id)!;
    const links = into.get(id) ?? [];
    if (node.type === "composer") {
      if (links.length === 0) throw new GraphError("link a layer", id);
      // over all composers of the render — a per-composer cap is bypassed by nesting
      layers += links.length;
      if (layers > maxLayers) throw new GraphError(`over ${maxLayers} layers in one render`, id);
    } else if (node.type !== "input" && links.length === 0) throw new GraphError(NO_PATH, id);

    for (const { source } of links) {
      if (!pulls.has(source)) queue.push(source);
      pulls.set(source, (pulls.get(source) ?? 0) + 1);
    }
  }
  return pulls;
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

type Applied = { node: Exclude<GraphNode, InputNode | ComposerNode | OutputNode>; layer: Layer } & LayerDimensions;

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
  }
  return opacity;
};

// what flows along an edge: pixels + the chain's opacity, baked into the layer at a composer / the output
type Flow = { data: ImageRawDataArray; opacity: number };

// Evaluation pulled from the output, each node once per render. A node pulled by several links
// hands every link but the last a copy and the last its own buffer — lib ops are eager and some
// (fill / tint) write in place, so consumers never share a buffer.
export const runGraph = async (
  graph: ToastGraph,
  uploadsDir: string,
  maxLayers = RENDER_MAX_LAYERS_DEFAULT,
): Promise<{ data: ImageRawDataArray } & LayerDimensions> => {
  const issue = validateGraph(graph);
  if (issue) throw new GraphError(issue.message, issue.nodeId);

  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const into = new Map<NodeId, GraphEdge[]>();
  for (const edge of graph.edges) into.set(edge.target, [...(into.get(edge.target) ?? []), edge]);
  // validateGraph: exactly one of each
  const input = graph.nodes.find((node) => node.type === "input")!;
  const output = graph.nodes.find((node) => node.type === "output")!;

  const pulls = ancestry(byId, into, output.id, maxLayers);
  const { data, width, height } = await loadInput(input, uploadsDir);

  const results = new Map<NodeId, Flow>();
  const pull = (id: NodeId): Flow => {
    if (!results.has(id)) results.set(id, evaluate(byId.get(id)!));
    const flow = results.get(id)!;
    const left = pulls.get(id)! - 1;
    pulls.set(id, left);
    if (left > 0) return { data: new Uint8ClampedArray(flow.data), opacity: flow.opacity };
    results.delete(id);
    return flow;
  };

  // linked rows bottom → top; the bottom row's blend mode has nothing under it
  const compose = ({ data: { layers } }: ComposerNode, links: GraphEdge[]): Flow => {
    const composition = new Composition(width, height);
    for (const { id, blendMode } of [...layers].reverse()) {
      const link = links.find(({ targetHandle }) => targetHandle === id);
      if (!link) continue;
      const flow = pull(link.source);
      const layer = composition.createLayerFromPixelData(flow.data);
      if (flow.opacity < 1) layer.setOpacity(flow.opacity);
      layer.setBlendMode(blendMode);
    }
    return { data: composition.render(), opacity: 1 };
  };

  // ancestry() checked every node on the way has its links
  const evaluate = (node: GraphNode): Flow => {
    if (node.type === "input") return { data, opacity: 1 };
    const links = into.get(node.id)!;
    if (node.type === "composer") return compose(node, links);

    const flow = pull(links[0]!.source);
    if (node.type === "output") return flow;
    const layer = new Composition(width, height).createLayerFromPixelData(flow.data);
    try {
      const opacity = applyNode({ node, layer, width, height }, flow.opacity);
      return { data: layer.imageData, opacity };
    } catch (error) {
      // lib throws plain errors (a singular matrix of a degenerate perspective / homography) — point them at the node
      throw error instanceof GraphError ? error : new GraphError(error instanceof Error ? error.message : String(error), node.id);
    }
  };

  const composition = new Composition(width, height);
  const { data: result, opacity } = evaluate(output);
  const layer = composition.createLayerFromPixelData(result);
  if (opacity < 1) layer.setOpacity(opacity);
  return { data: composition.render(), width, height };
};
