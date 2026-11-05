<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import { PARAMS } from "@xtc-toaster/contract";
  import { NODE_LABELS, type FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";
  import Slider from "./Slider.svelte";

  let { id, data }: NodeProps<FlowNodeOf<"rotate">> = $props();
</script>

<Handle type="target" position={Position.Left} />
<Handle type="source" position={Position.Right} />
<fieldset class="frame">
  <legend><h6>{NODE_LABELS.rotate}</h6></legend>
  <Slider
    label="angle"
    node={id}
    param="angle"
    bounds={PARAMS.rotate.angle}
    step={1}
    value={data.angle}
    onchange={(angle) => session.setNodeData(id, { ...data, angle })}
  />
</fieldset>
