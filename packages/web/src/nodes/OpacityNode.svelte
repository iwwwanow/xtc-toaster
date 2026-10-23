<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import { PARAMS } from "@xtc-toaster/contract";
  import { NODE_LABELS, type FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";
  import Slider from "./Slider.svelte";

  let { id, data }: NodeProps<FlowNodeOf<"opacity">> = $props();
</script>

<Handle type="target" position={Position.Left} />
<fieldset>
  <legend>{NODE_LABELS.opacity}</legend>
  <Slider
    label="opacity"
    bounds={PARAMS.opacity.opacity}
    step={0.05}
    value={data.opacity}
    onchange={(opacity) => session.setNodeData(id, { ...data, opacity })}
  />
</fieldset>
<Handle type="source" position={Position.Right} />
