<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import { PARAMS } from "@xtc-toaster/contract";
  import { NODE_LABELS, type FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";
  import Slider from "./Slider.svelte";

  let { id, data }: NodeProps<FlowNodeOf<"colorNoise">> = $props();
</script>

<Handle type="target" position={Position.Left} />
<Handle type="source" position={Position.Right} />
<fieldset class="frame">
  <legend><h6>{NODE_LABELS.colorNoise}</h6></legend>
  <Slider
    label="deviation"
    hint="deviation coefficient, 0–1"
    node={id}
    param="deviationCoefficient"
    bounds={PARAMS.colorNoise.deviationCoefficient}
    step={0.01}
    value={data.deviationCoefficient}
    onchange={(deviationCoefficient) => session.setNodeData(id, { deviationCoefficient })}
  />
</fieldset>
