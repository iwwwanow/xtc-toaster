import type { NodeTypes } from "@xyflow/svelte";
import BlurNode from "./BlurNode.svelte";
import FillNode from "./FillNode.svelte";
import HomographyNode from "./HomographyNode.svelte";
import HueMaskNode from "./HueMaskNode.svelte";
import InputNode from "./InputNode.svelte";
import HueNoiseNode from "./HueNoiseNode.svelte";
import IsolateChannelNode from "./IsolateChannelNode.svelte";
import OpacityNode from "./OpacityNode.svelte";
import OutputNode from "./OutputNode.svelte";
import PerspectiveNode from "./PerspectiveNode.svelte";
import RotateNode from "./RotateNode.svelte";
import SaturationMaskNode from "./SaturationMaskNode.svelte";
import ScaleNode from "./ScaleNode.svelte";
import SkewNode from "./SkewNode.svelte";
import TintNode from "./TintNode.svelte";
import TranslateNode from "./TranslateNode.svelte";
import ValueMaskNode from "./ValueMaskNode.svelte";
import YRotationNode from "./YRotationNode.svelte";

// one component per contract node type
export const nodeTypes = {
  input: InputNode,
  hueNoise: HueNoiseNode,
  hueMask: HueMaskNode,
  yRotation: YRotationNode,
  blur: BlurNode,
  saturationMask: SaturationMaskNode,
  valueMask: ValueMaskNode,
  isolateChannel: IsolateChannelNode,
  translate: TranslateNode,
  rotate: RotateNode,
  scale: ScaleNode,
  skew: SkewNode,
  perspective: PerspectiveNode,
  homography: HomographyNode,
  fill: FillNode,
  tint: TintNode,
  opacity: OpacityNode,
  output: OutputNode,
} satisfies NodeTypes;
