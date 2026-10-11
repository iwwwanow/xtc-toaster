<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import type { FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";

  let { id, data }: NodeProps<FlowNodeOf<"noize">> = $props();

  // shown while dragging, ahead of the graph; follows data whenever data changes
  let value = $derived(data.deviationCoefficient);

  const oninput = ({ currentTarget }: Event & { currentTarget: HTMLInputElement }) => {
    value = currentTarget.valueAsNumber;
  };

  // release → graph change → render
  const onchange = () => session.setNodeData(id, { deviationCoefficient: value });
</script>

<Handle type="target" position={Position.Left} />
<div>noize</div>
<label>
  deviationCoefficient: {value.toFixed(2)}
  <input
    class="nodrag"
    type="range"
    min="0"
    max="1"
    step="0.01"
    {value}
    disabled={session.locked}
    {oninput}
    {onchange}
  />
</label>
<Handle type="source" position={Position.Right} />
