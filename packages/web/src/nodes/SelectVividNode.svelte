<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import { PARAMS } from "@xtc-toaster/contract";
  import { NODE_LABELS, type FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";
  import Slider from "./Slider.svelte";

  let { id, data }: NodeProps<FlowNodeOf<"selectVivid">> = $props();
</script>

<Handle type="target" position={Position.Left} />
<fieldset class="frame">
  <legend><h6>{NODE_LABELS.selectVivid}</h6></legend>
  <Slider
    label="saturation"
    bounds={PARAMS.selectVivid.saturation}
    step={1}
    value={data.saturation}
    onchange={(saturation) => session.setNodeData(id, { ...data, saturation })}
  />
  <Slider
    label="tolerance"
    bounds={PARAMS.selectVivid.tolerance}
    step={1}
    value={data.tolerance}
    onchange={(tolerance) => session.setNodeData(id, { ...data, tolerance })}
  />
</fieldset>
<Handle type="source" position={Position.Right} />
