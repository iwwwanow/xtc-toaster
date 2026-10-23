<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import { PARAMS } from "@xtc-toaster/contract";
  import { NODE_LABELS, type FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";
  import Slider from "./Slider.svelte";

  let { id, data }: NodeProps<FlowNodeOf<"valueMask">> = $props();
</script>

<Handle type="target" position={Position.Left} />
<fieldset>
  <legend>{NODE_LABELS.valueMask}</legend>
  <Slider
    label="value"
    bounds={PARAMS.valueMask.value}
    step={1}
    value={data.value}
    onchange={(value) => session.setNodeData(id, { ...data, value })}
  />
  <Slider
    label="tolerance"
    bounds={PARAMS.valueMask.tolerance}
    step={1}
    value={data.tolerance}
    onchange={(tolerance) => session.setNodeData(id, { ...data, tolerance })}
  />
</fieldset>
<Handle type="source" position={Position.Right} />
