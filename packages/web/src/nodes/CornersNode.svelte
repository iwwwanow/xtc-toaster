<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import { PARAMS } from "@xtc-toaster/contract";
  import { NODE_LABELS, type FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";
  import Slider from "./Slider.svelte";

  let { id, data }: NodeProps<FlowNodeOf<"corners">> = $props();
</script>

<Handle type="target" position={Position.Left} />
<Handle type="source" position={Position.Right} />
<fieldset class="frame">
  <legend><h6>{NODE_LABELS.corners}</h6></legend>
  <Slider
    label="top-left x (%)"
    node={id}
    param="topLeftX"
    bounds={PARAMS.corners.topLeftX}
    step={1}
    value={data.topLeftX}
    onchange={(topLeftX) => session.setNodeData(id, { ...data, topLeftX })}
  />
  <Slider
    label="top-left y (%)"
    node={id}
    param="topLeftY"
    bounds={PARAMS.corners.topLeftY}
    step={1}
    value={data.topLeftY}
    onchange={(topLeftY) => session.setNodeData(id, { ...data, topLeftY })}
  />
  <Slider
    label="top-right x (%)"
    node={id}
    param="topRightX"
    bounds={PARAMS.corners.topRightX}
    step={1}
    value={data.topRightX}
    onchange={(topRightX) => session.setNodeData(id, { ...data, topRightX })}
  />
  <Slider
    label="top-right y (%)"
    node={id}
    param="topRightY"
    bounds={PARAMS.corners.topRightY}
    step={1}
    value={data.topRightY}
    onchange={(topRightY) => session.setNodeData(id, { ...data, topRightY })}
  />
  <Slider
    label="bottom-right x (%)"
    node={id}
    param="bottomRightX"
    bounds={PARAMS.corners.bottomRightX}
    step={1}
    value={data.bottomRightX}
    onchange={(bottomRightX) => session.setNodeData(id, { ...data, bottomRightX })}
  />
  <Slider
    label="bottom-right y (%)"
    node={id}
    param="bottomRightY"
    bounds={PARAMS.corners.bottomRightY}
    step={1}
    value={data.bottomRightY}
    onchange={(bottomRightY) => session.setNodeData(id, { ...data, bottomRightY })}
  />
  <Slider
    label="bottom-left x (%)"
    node={id}
    param="bottomLeftX"
    bounds={PARAMS.corners.bottomLeftX}
    step={1}
    value={data.bottomLeftX}
    onchange={(bottomLeftX) => session.setNodeData(id, { ...data, bottomLeftX })}
  />
  <Slider
    label="bottom-left y (%)"
    node={id}
    param="bottomLeftY"
    bounds={PARAMS.corners.bottomLeftY}
    step={1}
    value={data.bottomLeftY}
    onchange={(bottomLeftY) => session.setNodeData(id, { ...data, bottomLeftY })}
  />
</fieldset>
