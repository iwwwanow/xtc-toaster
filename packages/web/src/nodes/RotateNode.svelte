<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import { PARAMS } from "@xtc-toaster/contract";
  import { NODE_LABELS, type FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";
  import Slider from "./Slider.svelte";

  let { id, data }: NodeProps<FlowNodeOf<"rotate">> = $props();
</script>

<Handle type="target" position={Position.Left} />
<fieldset>
  <legend>{NODE_LABELS.rotate}</legend>
  <Slider
    label="angle"
    bounds={PARAMS.rotate.angle}
    step={1}
    value={data.angle}
    onchange={(angle) => session.setNodeData(id, { ...data, angle })}
  />
</fieldset>
<Handle type="source" position={Position.Right} />
