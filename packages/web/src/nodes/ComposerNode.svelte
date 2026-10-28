<script lang="ts">
  import { Handle, Position, useUpdateNodeInternals, type NodeProps } from "@xyflow/svelte";
  import { BLEND_MODES, type BlendMode } from "@xtc-toaster/contract";
  import { addLayer, moveLayer, setBlendMode } from "../composer";
  import { NODE_LABELS, type FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";

  let { id, data }: NodeProps<FlowNodeOf<"composer">> = $props();

  // the handles are inside the rows — xyflow re-measures them once the rows change
  const updateNodeInternals = useUpdateNodeInternals();
  const setLayers = (layers: FlowNodeOf<"composer">["data"]["layers"]) => {
    session.setNodeData(id, { layers });
    queueMicrotask(() => updateNodeInternals(id));
  };

  // row drag & drop inside the node: the dragged row's index; a menu drop onto the canvas uses another mime
  const ROW_MIME = "application/x-xtc-composer-row";
  let dragged = $state<number | null>(null);
  let over = $state<number | null>(null);

  const ondragstart = (index: number) => (event: DragEvent) => {
    dragged = index;
    event.dataTransfer?.setData(ROW_MIME, String(index));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  };
  const ondragover = (index: number) => (event: DragEvent) => {
    if (dragged === null) return;
    event.preventDefault();
    over = index;
  };
  const ondrop = (index: number) => (event: DragEvent) => {
    if (dragged === null) return;
    event.preventDefault();
    event.stopPropagation();
    if (dragged !== index) setLayers(moveLayer(data.layers, dragged, index));
    dragged = over = null;
  };
  const ondragend = () => (dragged = over = null);
</script>

<fieldset>
  <legend>{NODE_LABELS.composer}</legend>
  <button class="nodrag" type="button" disabled={session.locked} onclick={() => setLayers(addLayer(data.layers))}>+ layer</button>
  <!-- the top row is the top layer -->
  {#each data.layers as layer, index (layer.id)}
    {@const bottom = index === data.layers.length - 1}
    <div
      class="nodrag"
      role="listitem"
      style="position: relative; display: flex; gap: 4px; align-items: center; margin-top: 4px"
      style:outline={over === index && dragged !== index ? "1px dashed currentColor" : "none"}
      style:opacity={dragged === index ? 0.4 : 1}
      ondragover={ondragover(index)}
      ondrop={ondrop(index)}
    >
      <!-- the row's own input, at the node's left edge (past the fieldset padding and border) -->
      <Handle type="target" position={Position.Left} id={layer.id} style="left: calc(-0.75em - 4px)" />
      <span
        draggable={!session.locked}
        role="button"
        tabindex="-1"
        title="drag to reorder"
        style="cursor: grab; user-select: none"
        ondragstart={ondragstart(index)}
        {ondragend}>⠿</span
      >
      <span style="flex: 1">layer {data.layers.length - index}</span>
      <!-- nothing under the bottom layer — its blend mode has no effect -->
      <select
        value={layer.blendMode}
        disabled={session.locked || bottom}
        title={bottom ? "the bottom layer has nothing to blend with" : "blend mode"}
        onchange={({ currentTarget }) => setLayers(setBlendMode(data.layers, layer.id, currentTarget.value as BlendMode))}
      >
        {#each BLEND_MODES as mode (mode)}
          <option value={mode}>{mode}</option>
        {/each}
      </select>
      <!-- a composer keeps at least one row (contract) -->
      <button
        type="button"
        title="remove the layer and its link"
        disabled={session.locked || data.layers.length === 1}
        onclick={() => {
          session.removeComposerLayer(id, layer.id);
          queueMicrotask(() => updateNodeInternals(id));
        }}>×</button
      >
    </div>
  {/each}
</fieldset>
<Handle type="source" position={Position.Right} />
