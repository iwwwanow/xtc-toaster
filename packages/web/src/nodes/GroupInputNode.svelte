<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import type { FlowNodeOf } from "../graph";

  // inside a group: where the pixels wired into its instance come in; one per group, never deleted
  let {}: NodeProps<FlowNodeOf<"groupInput">> = $props();
</script>

<Handle type="source" position={Position.Right} />
<fieldset class="frame">
  <legend><h6>group input</h6></legend>
  <div class="field__hint_ai-generated">the picture wired into the group</div>
</fieldset>
