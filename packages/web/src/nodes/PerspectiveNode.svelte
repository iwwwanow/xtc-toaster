<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import { PARAMS } from "@xtc-toaster/contract";
  import { NODE_LABELS, type FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";
  import Slider from "./Slider.svelte";

  let { id, data }: NodeProps<FlowNodeOf<"perspective">> = $props();
</script>

<Handle type="target" position={Position.Left} />
<fieldset>
  <legend>{NODE_LABELS.perspective}</legend>
  <Slider
    label="top-left x (%)"
    bounds={PARAMS.perspective.topLeftX}
    step={1}
    value={data.topLeftX}
    onchange={(topLeftX) => session.setNodeData(id, { ...data, topLeftX })}
  />
  <Slider
    label="top-left y (%)"
    bounds={PARAMS.perspective.topLeftY}
    step={1}
    value={data.topLeftY}
    onchange={(topLeftY) => session.setNodeData(id, { ...data, topLeftY })}
  />
  <Slider
    label="top-right x (%)"
    bounds={PARAMS.perspective.topRightX}
    step={1}
    value={data.topRightX}
    onchange={(topRightX) => session.setNodeData(id, { ...data, topRightX })}
  />
  <Slider
    label="top-right y (%)"
    bounds={PARAMS.perspective.topRightY}
    step={1}
    value={data.topRightY}
    onchange={(topRightY) => session.setNodeData(id, { ...data, topRightY })}
  />
  <Slider
    label="bottom-right x (%)"
    bounds={PARAMS.perspective.bottomRightX}
    step={1}
    value={data.bottomRightX}
    onchange={(bottomRightX) => session.setNodeData(id, { ...data, bottomRightX })}
  />
  <Slider
    label="bottom-right y (%)"
    bounds={PARAMS.perspective.bottomRightY}
    step={1}
    value={data.bottomRightY}
    onchange={(bottomRightY) => session.setNodeData(id, { ...data, bottomRightY })}
  />
  <Slider
    label="bottom-left x (%)"
    bounds={PARAMS.perspective.bottomLeftX}
    step={1}
    value={data.bottomLeftX}
    onchange={(bottomLeftX) => session.setNodeData(id, { ...data, bottomLeftX })}
  />
  <Slider
    label="bottom-left y (%)"
    bounds={PARAMS.perspective.bottomLeftY}
    step={1}
    value={data.bottomLeftY}
    onchange={(bottomLeftY) => session.setNodeData(id, { ...data, bottomLeftY })}
  />
</fieldset>
<Handle type="source" position={Position.Right} />
