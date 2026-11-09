<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import { PARAMS } from "@xtc-toaster/contract";
  import { NODE_LABELS, type FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";
  import Slider from "./Slider.svelte";

  let { id, data }: NodeProps<FlowNodeOf<"skew">> = $props();
</script>

<Handle type="target" position={Position.Left} />
<Handle type="source" position={Position.Right} />
<fieldset class="frame">
  <legend><h6>{NODE_LABELS.skew}</h6></legend>
  <Slider
    label="x °"
    hint="x, degrees"
    node={id}
    param="x"
    bounds={PARAMS.skew.x}
    step={1}
    value={data.x}
    onchange={(x) => session.setNodeData(id, { ...data, x })}
  />
  <Slider
    label="y °"
    hint="y, degrees"
    node={id}
    param="y"
    bounds={PARAMS.skew.y}
    step={1}
    value={data.y}
    onchange={(y) => session.setNodeData(id, { ...data, y })}
  />
</fieldset>
