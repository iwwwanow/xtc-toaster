<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import { NODE_LABELS, type FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";

  let { id, data }: NodeProps<FlowNodeOf<"homography">> = $props();

  // a field left empty or unparsable keeps the old number — the graph only takes finite numbers
  const onchange = (index: number, { currentTarget }: Event & { currentTarget: HTMLInputElement }) => {
    const value = currentTarget.valueAsNumber;
    if (!Number.isFinite(value)) return void (currentTarget.value = String(data.matrix[index]));
    session.setNodeData(id, { matrix: data.matrix.map((old, i) => (i === index ? value : old)) });
  };
</script>

<Handle type="target" position={Position.Left} />
<fieldset class="frame">
  <legend>{NODE_LABELS.homography}</legend>
  <!-- raw 3×3, row-major, px of the image: [x, y, 1] · H — the last row is the translation -->
  <div style="display: grid; grid-template-columns: repeat(3, 72px); gap: var(--GRID-GAP-4)">
    {#each data.matrix as value, index (index)}
      <input
        class="nodrag input_ai-generated input-sm_ai-generated"
        type="number"
        step="any"
        {value}
        disabled={session.locked}
        onchange={(event) => onchange(index, event)}
      />
    {/each}
  </div>
</fieldset>
<Handle type="source" position={Position.Right} />
