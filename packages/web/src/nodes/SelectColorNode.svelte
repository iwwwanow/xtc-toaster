<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import { PARAMS } from "@xtc-toaster/contract";
  import { NODE_LABELS, type FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";
  import Slider from "./Slider.svelte";

  let { id, data }: NodeProps<FlowNodeOf<"selectColor">> = $props();
</script>

<Handle type="target" position={Position.Left} />
<fieldset class="frame">
  <legend><h6>{NODE_LABELS.selectColor}</h6></legend>
  <Slider
    label="hue"
    bounds={PARAMS.selectColor.hue}
    step={1}
    value={data.hue}
    onchange={(hue) => session.setNodeData(id, { ...data, hue })}
  />
  <Slider
    label="tolerance"
    bounds={PARAMS.selectColor.tolerance}
    step={1}
    value={data.tolerance}
    onchange={(tolerance) => session.setNodeData(id, { ...data, tolerance })}
  />
</fieldset>
<Handle type="source" position={Position.Right} />
