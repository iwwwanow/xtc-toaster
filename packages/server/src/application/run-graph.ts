import {
  validateGraph,
  type AnimationNode,
  type DelayNode,
  type LayersNode,
  type GraphEdge,
  type GraphNode,
  type InputNode,
  type ChannelNode,
  type NodeId,
  type OutputNode,
  type CornersNode,
  type ToastGraph,
} from "@xtc-toaster/contract";
import {
  Channel,
  Color,
  Composition,
  type ImageRawDataArray,
  type Layer,
  type LayerDimensions,
  type Quad,
} from "@xtc-toaster/lib";

// The port to where pictures live, the adapter comes from outside (render-worker.ts); null — no such picture
export type LoadImage = (imageId: string) => Promise<({ data: ImageRawDataArray } & LayerDimensions) | null>;

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

// a hidden layers row is skipped like an unlinked one: its chain isn't evaluated, its layer isn't counted
const shownLinks = ({ data: { layers } }: LayersNode, links: GraphEdge[]) =>
  links.filter(({ targetHandle }) => layers.find(({ id }) => id === targetHandle)?.visible !== false);

// the layer cap when RENDER_MAX_LAYERS is unset; prod sets 8 (measured 29.10 — docs/diary/2026-10-29_sprint-4-qa-and-measurement.md)
export const RENDER_MAX_LAYERS_DEFAULT = 4;

// The output's ancestry, walked back from it like blender: how many links pull each node's
// result. Nodes off it (unlinked, dead-end forks) are ignored. Fails before any pixel work: a
// node on the way without its link, a layers node without a linked row, too many layers.
const ancestry = (byId: Map<NodeId, GraphNode>, into: Map<NodeId, GraphEdge[]>, outputId: NodeId, maxLayers: number) => {
  const pulls = new Map<NodeId, number>();
  const queue = [outputId];
  let layers = 0;
  for (const id of queue) {
    const node = byId.get(id)!;
    const linked = into.get(id) ?? [];
    const links = node.type === "layers" ? shownLinks(node, linked) : linked;
    if (node.type === "layers") {
      if (linked.length === 0) throw new GraphError("link a layer", id);
      if (links.length === 0) throw new GraphError("show a layer", id);
      // over all layers nodes of the render — a per-node cap is bypassed by nesting
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
export const cornersQuad = (corners: CornersNode["data"], { width, height }: LayerDimensions): Quad => {
  const at = (x: number, y: number) => ({ x: (x / 100) * (width - 1), y: (y / 100) * (height - 1) });
  return [
    at(corners.topLeftX, corners.topLeftY),
    at(corners.topRightX, corners.topRightY),
    at(corners.bottomRightX, corners.bottomRightY),
    at(corners.bottomLeftX, corners.bottomLeftY),
  ];
};

const CHANNEL: Record<ChannelNode["data"]["channel"], Channel> = {
  red: Channel.Red,
  green: Channel.Green,
  blue: Channel.Blue,
  alpha: Channel.Alpha,
};

const loadInput = async ({ id, data: { imageId } }: InputNode, loadImage: LoadImage) => {
  if (imageId === null) throw new GraphError("upload an image", id);
  const image = await loadImage(imageId);
  if (!image) throw new GraphError("image not found", id);
  return image;
};

type Applied = { node: Exclude<GraphNode, InputNode | LayersNode | AnimationNode | DelayNode | OutputNode>; layer: Layer } & LayerDimensions;

// one node onto the layer; opacity is returned, not applied — lib keeps one opacity per layer and
// bakes it at render, so the chain multiplies its opacity nodes here
const applyNode = ({ node, layer, width, height }: Applied, opacity: number): number => {
  switch (node.type) {
    case "colorNoise":
      layer.colorNoise({ deviationCoefficient: node.data.deviationCoefficient });
      break;
    case "selectColor":
      // lib takes the tolerance normalized to the wheel
      layer.selectColor({ hue: node.data.hue, tolerance: node.data.tolerance / 360 });
      break;
    case "turn3d":
      // contract has mm, lib takes px of the image
      layer.turn3d({ angle: node.data.angle, focalLength: focalLengthPx(node.data.focalLength, { width, height }) });
      break;
    case "blur":
      layer.blur({ radius: node.data.radius });
      break;
    case "selectVivid":
      // contract has percent for both, lib takes the tolerance normalized
      layer.selectVivid({ saturation: node.data.saturation, tolerance: node.data.tolerance / 100 });
      break;
    case "selectBright":
      layer.selectBright({ value: node.data.value, tolerance: node.data.tolerance / 100 });
      break;
    case "channel":
      layer.channel(CHANNEL[node.data.channel]);
      break;
    case "move":
      // contract has percent of the image size, lib takes px
      layer.move({ x: percentPx(node.data.x, width), y: percentPx(node.data.y, height) });
      break;
    case "rotate":
      layer.rotate({ angle: node.data.angle });
      break;
    case "scale":
      layer.scale({ x: node.data.x, y: node.data.y });
      break;
    case "skew":
      // contract has degrees, lib takes the shear factor
      layer.skew({ x: tanDeg(node.data.x), y: tanDeg(node.data.y) });
      break;
    case "corners":
      layer.corners(cornersQuad(node.data, { width, height }));
      break;
    case "matrix":
      layer.matrix(node.data.matrix);
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

// what flows along an edge: pixels + the chain's opacity, baked into the layer at a layers node / the output
type Flow = { data: ImageRawDataArray; opacity: number };

// Evaluation pulled from the output, each node once per render. A node pulled by several links
// hands every link but the last a copy and the last its own buffer — lib ops are eager and some
// (fill / tint) write in place, so consumers never share a buffer.
export const runGraph = async (
  graph: ToastGraph,
  loadImage: LoadImage,
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
  const { data, width, height } = await loadInput(input, loadImage);

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

  // linked shown rows bottom → top; the bottom row's blend mode has nothing under it
  const compose = ({ data: { layers } }: LayersNode, links: GraphEdge[]): Flow => {
    const composition = new Composition(width, height);
    for (const { id, blendMode, visible } of [...layers].reverse()) {
      const link = links.find(({ targetHandle }) => targetHandle === id);
      if (!link || visible === false) continue;
      const flow = pull(link.source);
      const layer = composition.createLayerFromPixelData(flow.data);
      if (flow.opacity < 1) layer.opacity(flow.opacity);
      layer.setBlendMode(blendMode);
    }
    return { data: composition.render(), opacity: 1 };
  };

  // ancestry() checked every node on the way has its links
  const evaluate = (node: GraphNode): Flow => {
    if (node.type === "input") return { data, opacity: 1 };
    const links = into.get(node.id)!;
    if (node.type === "layers") return compose(node, links);

    const flow = pull(links[0]!.source);
    // the animation node, a delay, a value and a factor are never on the way (no pixel links out of them), this only
    // narrows the type — what a value or a factor gives is already in the params (graphAtFrame)
    if (node.type === "output" || node.type === "animation" || node.type === "delay" || node.type === "value" || node.type === "factor")
      return flow;
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
  if (opacity < 1) layer.opacity(opacity);
  return { data: composition.render(), width, height };
};