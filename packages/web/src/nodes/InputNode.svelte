<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import type { FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";

  // node data is not used here — state lives in session
  let {}: NodeProps<FlowNodeOf<"input">> = $props();

  const onchange = ({ currentTarget }: Event & { currentTarget: HTMLInputElement }) => {
    const file = currentTarget.files?.[0];
    if (file) session.upload(file);
  };
</script>

<div>input</div>
<input class="nodrag" type="file" accept="image/png,image/jpeg" disabled={session.locked} {onchange} />
<Handle type="source" position={Position.Right} />
