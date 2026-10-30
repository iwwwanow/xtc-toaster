<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import { PARAMS } from "@xtc-toaster/contract";
  import { NODE_LABELS, type FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";
  import Slider from "./Slider.svelte";

  let { id, data }: NodeProps<FlowNodeOf<"blur">> = $props();
</script>

<Handle type="target" position={Position.Left} />
<fieldset class="frame">
  <legend>{NODE_LABELS.blur}</legend>
  <Slider
    label="radius (px)"
    bounds={PARAMS.blur.radius}
    step={1}
    value={data.radius}
    onchange={(radius) => session.setNodeData(id, { ...data, radius })}
  />
</fieldset>
<Handle type="source" position={Position.Right} />
