<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import { PARAMS } from "@xtc-toaster/contract";
  import { NODE_LABELS, type FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";
  import Slider from "./Slider.svelte";

  let { id, data }: NodeProps<FlowNodeOf<"blur">> = $props();
</script>

<Handle type="target" position={Position.Left} />
<Handle type="source" position={Position.Right} />
<fieldset class="frame">
  <legend><h6>{NODE_LABELS.blur}</h6></legend>
  <Slider
    label="radius (px)"
    node={id}
    param="radius"
    bounds={PARAMS.blur.radius}
    step={1}
    value={data.radius}
    onchange={(radius) => session.setNodeData(id, { ...data, radius })}
  />
</fieldset>
