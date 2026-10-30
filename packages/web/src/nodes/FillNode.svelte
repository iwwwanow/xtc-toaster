<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import { NODE_LABELS, type FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";

  let { id, data }: NodeProps<FlowNodeOf<"fill">> = $props();
</script>

<Handle type="target" position={Position.Left} />
<fieldset class="frame">
  <legend>{NODE_LABELS.fill}</legend>
  <!-- the whole picture becomes the color, alpha too — opaque; change fires when the picker closes — one render per pick, like a slider release -->
  <label class="field_ai-generated">
    <span class="field__label_ai-generated">color</span>
    <input
      class="nodrag color-input"
      type="color"
      value={data.color}
      disabled={session.locked}
      onchange={({ currentTarget }) => session.setNodeData(id, { color: currentTarget.value })}
    />
  </label>
</fieldset>
<Handle type="source" position={Position.Right} />
