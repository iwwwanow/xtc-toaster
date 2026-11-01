<script lang="ts">
  import { Panel } from "@xyflow/svelte";
  import { NODE_CATEGORIES, NODE_HINTS, NODE_LABELS, NODE_TYPE_MIME } from "../graph";

  const ondragstart = (event: DragEvent, type: string) => {
    event.dataTransfer?.setData(NODE_TYPE_MIME, type);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  };
</script>

<Panel position="top-left">
  <fieldset class="frame">
    <legend>nodes</legend>
    {#each NODE_CATEGORIES as { name, types } (name)}
      <!-- a labeled rule (uiu) over each group, the first included -->
      <fieldset class="hr_fieldset"><legend>{name}</legend></fieldset>
      {#each types as type (type)}
        <!-- dragged onto the canvas, not clicked — a button only by its look (uiu), hover included -->
        <span class="tooltip_ai-generated tooltip-right">
          <div
            class="btn_ai-generated btn-sm_ai-generated"
            draggable="true"
            role="listitem"
            style="justify-content: flex-start; cursor: grab"
            ondragstart={(event) => ondragstart(event, type)}
          >
            {NODE_LABELS[type]}
          </div>
          <span class="tooltip__content_ai-generated">{NODE_HINTS[type]}</span>
        </span>
      {/each}
    {/each}
  </fieldset>
</Panel>
