import type { NodeTypes } from "@xyflow/svelte";
import HueMaskNode from "./HueMaskNode.svelte";
import InputNode from "./InputNode.svelte";
import NoizeNode from "./NoizeNode.svelte";
import OutputNode from "./OutputNode.svelte";

// one component per contract node type
export const nodeTypes = {
  input: InputNode,
  noize: NoizeNode,
  hueMask: HueMaskNode,
  output: OutputNode,
} satisfies NodeTypes;
