<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import { NODE_LABELS, type FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";

  let { id, data }: NodeProps<FlowNodeOf<"fill">> = $props();
</script>

<Handle type="target" position={Position.Left} />
<fieldset>
  <legend>{NODE_LABELS.fill}</legend>
  <!-- the whole picture becomes the color, alpha too — opaque; change fires when the picker closes — one render per pick, like a slider release -->
  <label style="display: block">
    color
    <input
      class="nodrag"
      type="color"
      value={data.color}
      disabled={session.locked}
      onchange={({ currentTarget }) => session.setNodeData(id, { color: currentTarget.value })}
    />
  </label>
</fieldset>
<Handle type="source" position={Position.Right} />
