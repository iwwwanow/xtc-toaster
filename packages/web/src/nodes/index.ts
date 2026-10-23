import type { NodeTypes } from "@xyflow/svelte";
import BlurNode from "./BlurNode.svelte";
import HueMaskNode from "./HueMaskNode.svelte";
import InputNode from "./InputNode.svelte";
import HueNoiseNode from "./HueNoiseNode.svelte";
import IsolateChannelNode from "./IsolateChannelNode.svelte";
import OutputNode from "./OutputNode.svelte";
import RotateNode from "./RotateNode.svelte";
import SaturationMaskNode from "./SaturationMaskNode.svelte";
import ScaleNode from "./ScaleNode.svelte";
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
  output: OutputNode,
} satisfies NodeTypes;
