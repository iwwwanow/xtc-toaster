import type { NodeTypes } from "@xyflow/svelte";
import HueMaskNode from "./HueMaskNode.svelte";
import InputNode from "./InputNode.svelte";
import NoizeNode from "./NoizeNode.svelte";
import OutputNode from "./OutputNode.svelte";
import YRotationNode from "./YRotationNode.svelte";

// one component per contract node type
export const nodeTypes = {
  input: InputNode,
  noize: NoizeNode,
  hueMask: HueMaskNode,
  yRotation: YRotationNode,
  output: OutputNode,
} satisfies NodeTypes;
