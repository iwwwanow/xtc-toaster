<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import { PARAMS } from "@xtc-toaster/contract";
  import { NODE_LABELS, type FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";
  import Slider from "./Slider.svelte";

  // param → value: every param wired into its one input takes the number, clamped to its own bounds (graphAtFrame).
  // The number is a param itself — its handle on the right goes to a track (all of them move) or another value
  let { id, data }: NodeProps<FlowNodeOf<"value">> = $props();
</script>

<Handle type="target" position={Position.Left} />
<fieldset class="frame">
  <legend><h6>{NODE_LABELS.value}</h6></legend>
  <Slider
    label="value"
    hint="the number every param wired in takes, clamped to its own bounds"
    node={id}
    param="value"
    bounds={PARAMS.value.value}
    step={0.01}
    value={data.value}
    onchange={(value) => session.setNodeData(id, { value })}
  />
</fieldset>
