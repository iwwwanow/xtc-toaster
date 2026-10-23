<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import { PARAMS } from "@xtc-toaster/contract";
  import { NODE_LABELS, type FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";
  import Slider from "./Slider.svelte";

  let { id, data }: NodeProps<FlowNodeOf<"scale">> = $props();
</script>

<Handle type="target" position={Position.Left} />
<fieldset>
  <legend>{NODE_LABELS.scale}</legend>
  <Slider
    label="x"
    bounds={PARAMS.scale.x}
    step={0.05}
    value={data.x}
    onchange={(x) => session.setNodeData(id, { ...data, x })}
  />
  <Slider
    label="y"
    bounds={PARAMS.scale.y}
    step={0.05}
    value={data.y}
    onchange={(y) => session.setNodeData(id, { ...data, y })}
  />
</fieldset>
<Handle type="source" position={Position.Right} />
