<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import type { FlowNodeOf } from "../graph";

  let { data }: NodeProps<FlowNodeOf<"noize">> = $props();
</script>

<Handle type="target" position={Position.Left} />
<div>noize</div>
<div>deviationCoefficient: {data.deviationCoefficient}</div>
<Handle type="source" position={Position.Right} />
