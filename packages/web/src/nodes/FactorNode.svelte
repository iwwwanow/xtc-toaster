<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import { PARAMS } from "@xtc-toaster/contract";
  import { NODE_LABELS, type FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";
  import Slider from "./Slider.svelte";

  // param → factor: every param wired into its one input takes this share of its own range, min + factor · (max − min)
  // (graphAtFrame). The share is a param itself — its handle on the right goes to a track (all of them move) or into a
  // value / factor
  let { id, data }: NodeProps<FlowNodeOf<"factor">> = $props();
</script>

<Handle type="target" position={Position.Left} />
<fieldset class="frame">
  <legend><h6>{NODE_LABELS.factor}</h6></legend>
  <Slider
    label="factor"
    hint="the share of its own range every param wired in takes: 0 — its min, 1 — its max"
    node={id}
    param="factor"
    bounds={PARAMS.factor.factor}
    step={0.01}
    value={data.factor}
    onchange={(factor) => session.setNodeData(id, { factor })}
  />
</fieldset>
