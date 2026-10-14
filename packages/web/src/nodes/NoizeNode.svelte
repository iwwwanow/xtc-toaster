<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import { PARAMS } from "@xtc-toaster/contract";
  import type { FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";
  import Slider from "./Slider.svelte";

  let { id, data }: NodeProps<FlowNodeOf<"noize">> = $props();
</script>

<Handle type="target" position={Position.Left} />
<div>noize</div>
<Slider
  label="deviationCoefficient"
  bounds={PARAMS.noize.deviationCoefficient}
  step={0.01}
  value={data.deviationCoefficient}
  onchange={(deviationCoefficient) => session.setNodeData(id, { deviationCoefficient })}
/>
<Handle type="source" position={Position.Right} />
