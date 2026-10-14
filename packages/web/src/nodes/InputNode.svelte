<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import type { FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";

  // node data is not used here — state lives in session
  let {}: NodeProps<FlowNodeOf<"input">> = $props();

  const onchange = async ({ currentTarget }: Event & { currentTarget: HTMLInputElement }) => {
    const file = currentTarget.files?.[0];
    // a rejected file must not stay shown as chosen
    if (file && !(await session.upload(file))) currentTarget.value = "";
  };
</script>

<fieldset>
  <legend>input</legend>
  <input class="nodrag" type="file" accept="image/png,image/jpeg" disabled={session.locked} {onchange} />
  {#if session.uploadError}
    <div style="color: crimson">{session.uploadError}</div>
  {/if}
</fieldset>
<Handle type="source" position={Position.Right} />
