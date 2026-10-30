<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import { PARAMS } from "@xtc-toaster/contract";
  import { NODE_LABELS, type FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";
  import Slider from "./Slider.svelte";

  let { id, data }: NodeProps<FlowNodeOf<"translate">> = $props();
</script>

<Handle type="target" position={Position.Left} />
<fieldset class="frame">
  <legend>{NODE_LABELS.translate}</legend>
  <Slider
    label="x (% of width)"
    bounds={PARAMS.translate.x}
    step={1}
    value={data.x}
    onchange={(x) => session.setNodeData(id, { ...data, x })}
  />
  <Slider
    label="y (% of height)"
    bounds={PARAMS.translate.y}
    step={1}
    value={data.y}
    onchange={(y) => session.setNodeData(id, { ...data, y })}
  />
</fieldset>
<Handle type="source" position={Position.Right} />
