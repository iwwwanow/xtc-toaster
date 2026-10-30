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
<fieldset class="frame">
  <legend>{NODE_LABELS.isolateChannel}</legend>
  <!-- a pick, not a range: the change is the release — renders right away like a slider release -->
  <label class="field_ai-generated">
    <span class="field__label_ai-generated">channel</span>
    <select class="nodrag select_ai-generated input-sm_ai-generated" value={data.channel} disabled={session.locked} {onchange}>
      {#each CHANNELS as channel (channel)}
        <option value={channel}>{channel}</option>
      {/each}
    </select>
  </label>
</fieldset>
<Handle type="source" position={Position.Right} />
