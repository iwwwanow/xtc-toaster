import type { NodeTypes } from "@xyflow/svelte";
import AnimationNode from "./AnimationNode.svelte";
import BlurNode from "./BlurNode.svelte";
import ChannelNode from "./ChannelNode.svelte";
import ColorNoiseNode from "./ColorNoiseNode.svelte";
import CornersNode from "./CornersNode.svelte";
import DelayNode from "./DelayNode.svelte";
import FillNode from "./FillNode.svelte";
import InputNode from "./InputNode.svelte";
import LayersNode from "./LayersNode.svelte";
import MatrixNode from "./MatrixNode.svelte";
import MoveNode from "./MoveNode.svelte";
import OpacityNode from "./OpacityNode.svelte";
import OutputNode from "./OutputNode.svelte";
import RotateNode from "./RotateNode.svelte";
import ScaleNode from "./ScaleNode.svelte";
import SelectBrightNode from "./SelectBrightNode.svelte";
import SelectColorNode from "./SelectColorNode.svelte";
import SelectVividNode from "./SelectVividNode.svelte";
import SkewNode from "./SkewNode.svelte";
import TintNode from "./TintNode.svelte";
import ValueNode from "./ValueNode.svelte";
import FactorNode from "./FactorNode.svelte";
import GroupInputNode from "./GroupInputNode.svelte";
import GroupNode from "./GroupNode.svelte";
import GroupOutputNode from "./GroupOutputNode.svelte";
import Turn3dNode from "./Turn3dNode.svelte";

// one component per contract node type
export const nodeTypes = {
  input: InputNode,
  selectColor: SelectColorNode,
  selectVivid: SelectVividNode,
  selectBright: SelectBrightNode,
  channel: ChannelNode,
  fill: FillNode,
  tint: TintNode,
  colorNoise: ColorNoiseNode,
  opacity: OpacityNode,
  blur: BlurNode,
  move: MoveNode,
  rotate: RotateNode,
  scale: ScaleNode,
  skew: SkewNode,
  turn3d: Turn3dNode,
  corners: CornersNode,
  matrix: MatrixNode,
  layers: LayersNode,
  animation: AnimationNode,
  delay: DelayNode,
  value: ValueNode,
  factor: FactorNode,
  group: GroupNode,
  groupInput: GroupInputNode,
  groupOutput: GroupOutputNode,
  output: OutputNode,
} satisfies NodeTypes;
