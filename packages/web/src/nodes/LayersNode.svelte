<script lang="ts">
  import { Handle, Position, useUpdateNodeInternals, type NodeProps } from "@xyflow/svelte";
  import { BLEND_MODES, LAYER_NAME_MAX, type BlendMode } from "@xtc-toaster/contract";
  import { addLayer, layerName, moveRow, renameLayer, setBlendMode, toggleLayer } from "../layers";
  import { NODE_LABELS, type FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";
  import { RowDrag } from "./row-drag.svelte";

  let { id, data }: NodeProps<FlowNodeOf<"layers">> = $props();

  // the handles are inside the rows — xyflow re-measures them once the rows change
  const updateNodeInternals = useUpdateNodeInternals();
  const setLayers = (layers: FlowNodeOf<"layers">["data"]["layers"]) => {
    session.setNodeData(id, { layers });
    queueMicrotask(() => updateNodeInternals(id));
  };

  const drag = new RowDrag("application/x-xtc-layers-row", (from, to) => setLayers(moveRow(data.layers, from, to)));

  // rename in place: double-click the name → input; Enter / blur keeps, Esc drops
  let editing = $state<string | null>(null);
  const rename = (id: string, name: string) => {
    if (editing !== id) return; // Esc already closed it — the blur that follows changes nothing
    editing = null;
    setLayers(renameLayer(data.layers, id, name));
  };
  const onrenamekey = (id: string) => (event: KeyboardEvent & { currentTarget: HTMLInputElement }) => {
    if (event.key === "Enter") rename(id, event.currentTarget.value);
    if (event.key === "Escape") editing = null;
  };
</script>

<Handle type="source" position={Position.Right} />
<fieldset class="frame frame_span-2">
  <legend><h6>{NODE_LABELS.layers}</h6></legend>
  <button
    class="nodrag btn_ai-generated btn-sm_ai-generated btn-dashed_ai-generated"
    type="button"
    disabled={session.locked}
    onclick={() => setLayers(addLayer(data.layers))}>+ layer</button
  >
  <!-- the top row is the top layer -->
  {#each data.layers as layer, index (layer.id)}
    {@const bottom = index === data.layers.length - 1}
    <div
      class="nodrag"
      role="listitem"
      data-row={layer.id}
      style="position: relative; display: flex; gap: var(--GRID-GAP-4); align-items: center"
      style:outline={drag.over === index && drag.dragged !== index ? "1px dashed currentColor" : "none"}
      style:opacity={drag.dragged === index ? 0.4 : 1}
      ondragover={drag.dragover(index)}
      ondrop={drag.drop(index)}
    >
      <!-- the row's own input, out of the node's left edge like every handle (past the frame's padding and
           1px border, then the handle offset — app.css) -->
      <Handle
        type="target"
        position={Position.Left}
        id={layer.id}
        style="left: calc(-1 * var(--GRID-GAP-2) - 1px - var(--handle-offset))"
      />
      <span
        draggable={!session.locked}
        role="button"
        tabindex="-1"
        title="drag to reorder"
        style="cursor: grab; user-select: none"
        ondragstart={drag.start(index)}
        ondragend={drag.end}>⠿</span
      >
      <label class="checkbox_ai-generated">
        <input
          type="checkbox"
          checked={layer.visible !== false}
          disabled={session.locked}
          title="show / hide the layer"
          onchange={() => setLayers(toggleLayer(data.layers, layer.id))}
        />
      </label>
      {#if editing === layer.id}
        <input
          class="input_ai-generated input-sm_ai-generated"
          style="flex: 1; min-width: 0"
          maxlength={LAYER_NAME_MAX}
          value={layerName(layer)}
          {@attach (input: HTMLInputElement) => (input.focus(), input.select())}
          onkeydown={onrenamekey(layer.id)}
          onblur={({ currentTarget }) => rename(layer.id, currentTarget.value)}
        />
      {:else}
        <span
          role="textbox"
          tabindex="-1"
          title="double-click to rename"
          style="flex: 1"
          style:opacity={layer.visible === false ? 0.4 : 1}
          ondblclick={() => !session.locked && (editing = layer.id)}>{layerName(layer)}</span
        >
      {/if}
      <!-- nothing under the bottom layer — its blend mode has no effect -->
      <select
        class="select_ai-generated input-sm_ai-generated"
        style="width: auto"
        value={layer.blendMode}
        disabled={session.locked || bottom}
        title={bottom ? "the bottom layer has nothing to blend with" : "blend mode"}
        onchange={({ currentTarget }) => setLayers(setBlendMode(data.layers, layer.id, currentTarget.value as BlendMode))}
      >
        {#each BLEND_MODES as mode (mode)}
          <option value={mode}>{mode}</option>
        {/each}
      </select>
      <!-- a layers node keeps at least one row (contract) -->
      <button
        class="btn_ai-generated btn-sm_ai-generated"
        type="button"
        title="remove the layer and its link"
        disabled={session.locked || data.layers.length === 1}
        onclick={() => {
          session.removeLayerRow(id, layer.id);
          queueMicrotask(() => updateNodeInternals(id));
        }}>×</button
      >
    </div>
  {/each}
</fieldset>
