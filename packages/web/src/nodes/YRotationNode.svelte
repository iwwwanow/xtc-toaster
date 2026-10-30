<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import { PARAMS } from "@xtc-toaster/contract";
  import { NODE_LABELS, type FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";
  import Slider from "./Slider.svelte";

  let { id, data }: NodeProps<FlowNodeOf<"yRotation">> = $props();
</script>

<Handle type="target" position={Position.Left} />
<fieldset class="frame">
  <legend>{NODE_LABELS.yRotation}</legend>
  <Slider
    label="angle"
    bounds={PARAMS.yRotation.angle}
    step={1}
    value={data.angle}
    onchange={(angle) => session.setNodeData(id, { ...data, angle })}
  />
  <Slider
    label="focal length (mm)"
    bounds={PARAMS.yRotation.focalLength}
    step={1}
    value={data.focalLength}
    onchange={(focalLength) => session.setNodeData(id, { ...data, focalLength })}
  />
</fieldset>
<Handle type="source" position={Position.Right} />
