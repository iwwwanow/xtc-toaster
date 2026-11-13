<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import type { FlowNodeOf } from "../graph";

  // inside a group: the picture its instance gives out — pixels only, the exposed params are the group input's rows;
  // one per group, never deleted
  let {}: NodeProps<FlowNodeOf<"groupOutput">> = $props();
</script>

<Handle type="target" position={Position.Left} />
<fieldset class="frame">
  <legend><h6>group output</h6></legend>
  <div class="field__hint_ai-generated">the picture the group gives out</div>
</fieldset>
