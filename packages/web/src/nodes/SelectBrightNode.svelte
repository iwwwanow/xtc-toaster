<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import { PARAMS } from "@xtc-toaster/contract";
  import { NODE_LABELS, type FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";
  import Slider from "./Slider.svelte";

  let { id, data }: NodeProps<FlowNodeOf<"selectBright">> = $props();
</script>

<Handle type="target" position={Position.Left} />
<Handle type="source" position={Position.Right} />
<fieldset class="frame">
  <legend><h6>{NODE_LABELS.selectBright}</h6></legend>
  <Slider
    label="value"
    node={id}
    param="value"
    bounds={PARAMS.selectBright.value}
    step={1}
    value={data.value}
    onchange={(value) => session.setNodeData(id, { ...data, value })}
  />
  <Slider
    label="tolerance"
    node={id}
    param="tolerance"
    bounds={PARAMS.selectBright.tolerance}
    step={1}
    value={data.tolerance}
    onchange={(tolerance) => session.setNodeData(id, { ...data, tolerance })}
  />
</fieldset>
