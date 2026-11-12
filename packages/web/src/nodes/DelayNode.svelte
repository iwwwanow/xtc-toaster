<script lang="ts">
  import { Handle, Position, useUpdateNodeInternals, type NodeProps } from "@xyflow/svelte";
  import { DELAY_FRAMES } from "@xtc-toaster/contract";
  import { delayRowName, withFreeRow } from "../delay";
  import { NODE_LABELS, type FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";
  import Slider from "./Slider.svelte";

  // param → a row → a track: every param wired through plays `frames` later (graphAtFrame). No pixels in or out
  let { id, data }: NodeProps<FlowNodeOf<"delay">> = $props();

  // the handles are inside the rows — xyflow re-measures them once the rows change
  const updateNodeInternals = useUpdateNodeInternals();

  // always a free row at the bottom: a param wired into it makes the next. It lands in the same history step as the
  // link that asked for it — both settle within one save
  $effect(() => {
    const rows = withFreeRow(data.rows, session.edges, id);
    if (rows === data.rows) return;
    session.setNodeData(id, { ...data, rows: [...rows] });
    queueMicrotask(() => updateNodeInternals(id));
  });
</script>

<fieldset class="frame">
  <legend><h6>{NODE_LABELS.delay}</h6></legend>
  <Slider
    label="frames"
    hint="frames later the params play (negative — earlier)"
    bounds={DELAY_FRAMES}
    step={1}
    value={data.frames}
    onchange={(frames) => session.setNodeData(id, { ...data, frames })}
  />
  {#each data.rows as row (row.id)}
    {@const name = delayRowName(session.nodes, session.edges, id, row.id, session.groups)}
    <div class="delay-row">
      <!-- in from a param, out to a track — both out of the node's edges, like a layers row's input -->
      <Handle
        type="target"
        position={Position.Left}
        id={row.id}
        style="left: calc(-1 * var(--GRID-GAP-2) - 1px - var(--handle-offset))"
      />
      <span class="delay-row__name" title={name}>{name}</span>
      <Handle
        type="source"
        position={Position.Right}
        id={row.id}
        style="right: calc(-1 * var(--GRID-GAP-2) - 1px - var(--param-handle-offset))"
      />
    </div>
  {/each}
</fieldset>
