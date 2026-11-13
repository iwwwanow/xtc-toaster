<script lang="ts">
  import { Handle, Position, useUpdateNodeInternals, type NodeProps } from "@xyflow/svelte";
  import { delayRowName, withFreeRow } from "../delay";
  import type { FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";

  // inside a group: where the pixels wired into its instance come in, and its exposed params — a row per param wired
  // into it (`node.param`), a field of that name on every instance; an unwired row exposes nothing. One per group,
  // never deleted (docs/sprints/sprint-5.spec.md, «node groups», 13.11)
  let { id, data }: NodeProps<FlowNodeOf<"groupInput">> = $props();

  // the handles are inside the rows — xyflow re-measures them once the rows change
  const updateNodeInternals = useUpdateNodeInternals();

  // always a free row at the bottom, like a delay's: a param wired into it makes the next, in the same history step
  $effect(() => {
    const rows = withFreeRow(data.rows, session.edges, id);
    if (rows === data.rows) return;
    session.setNodeData(id, { ...data, rows: [...rows] });
    queueMicrotask(() => updateNodeInternals(id));
  });
</script>

<!-- the pixel output first: xyflow gives a link without a sourceHandle the first source handle it finds -->
<Handle type="source" position={Position.Right} />
<fieldset class="frame">
  <legend><h6>group input</h6></legend>
  <div class="field__hint_ai-generated">the picture wired into the group</div>
  {#each data.rows as row (row.id)}
    {@const name = delayRowName(session.nodes, session.edges, id, row.id)}
    <div class="delay-row">
      <span class="delay-row__name" title={name}>{name}</span>
      <!-- in from a param inside (its dot on the left of its field), out as the instance's field -->
      <Handle
        type="target"
        position={Position.Right}
        id={row.id}
        style="right: calc(-1 * var(--GRID-GAP-2) - 1px - var(--param-handle-offset))"
      />
    </div>
  {/each}
</fieldset>
