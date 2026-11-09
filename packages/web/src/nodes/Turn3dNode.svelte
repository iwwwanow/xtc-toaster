<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import { PARAMS } from "@xtc-toaster/contract";
  import { NODE_LABELS, type FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";
  import Slider from "./Slider.svelte";

  let { id, data }: NodeProps<FlowNodeOf<"turn3d">> = $props();
</script>

<Handle type="target" position={Position.Left} />
<Handle type="source" position={Position.Right} />
<fieldset class="frame">
  <legend><h6>{NODE_LABELS.turn3d}</h6></legend>
  <Slider
    label="angle"
    node={id}
    param="angle"
    bounds={PARAMS.turn3d.angle}
    step={1}
    value={data.angle}
    onchange={(angle) => session.setNodeData(id, { ...data, angle })}
  />
  <Slider
    label="focal mm"
    hint="focal length, mm (35 mm equivalent)"
    node={id}
    param="focalLength"
    bounds={PARAMS.turn3d.focalLength}
    step={1}
    value={data.focalLength}
    onchange={(focalLength) => session.setNodeData(id, { ...data, focalLength })}
  />
</fieldset>
