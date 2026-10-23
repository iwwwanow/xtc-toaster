<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import { CHANNELS } from "@xtc-toaster/contract";
  import { NODE_LABELS, type FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";

  let { id, data }: NodeProps<FlowNodeOf<"isolateChannel">> = $props();

  const onchange = ({ currentTarget }: Event & { currentTarget: HTMLSelectElement }) =>
    session.setNodeData(id, { channel: currentTarget.value as (typeof CHANNELS)[number] });
</script>

<Handle type="target" position={Position.Left} />
<fieldset>
  <legend>{NODE_LABELS.isolateChannel}</legend>
  <!-- a pick, not a range: the change is the release — renders right away like a slider release -->
  <label style="display: block">
    channel
    <select class="nodrag" value={data.channel} disabled={session.locked} {onchange}>
      {#each CHANNELS as channel (channel)}
        <option value={channel}>{channel}</option>
      {/each}
    </select>
  </label>
</fieldset>
<Handle type="source" position={Position.Right} />
