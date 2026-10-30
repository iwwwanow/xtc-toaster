<script lang="ts">
  import { Panel } from "@xyflow/svelte";
  import { MENU_NODE_TYPES, NODE_LABELS, NODE_TYPE_MIME } from "../graph";

  const ondragstart = (event: DragEvent, type: string) => {
    event.dataTransfer?.setData(NODE_TYPE_MIME, type);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  };
</script>

<Panel position="top-left">
  <fieldset class="frame">
    <legend>nodes</legend>
    {#each MENU_NODE_TYPES as type (type)}
      <!-- dragged onto the canvas, not clicked — a button only by its look (uiu), hover included -->
      <div
        class="btn_ai-generated btn-sm_ai-generated"
        draggable="true"
        role="listitem"
        style="justify-content: flex-start; cursor: grab"
        ondragstart={(event) => ondragstart(event, type)}
      >
        {NODE_LABELS[type]}
      </div>
    {/each}
  </fieldset>
</Panel>
