<script lang="ts">
  import { Panel } from "@xyflow/svelte";
  import { MENU_NODE_TYPES, NODE_TYPE_MIME } from "../graph";

  const ondragstart = (event: DragEvent, type: string) => {
    event.dataTransfer?.setData(NODE_TYPE_MIME, type);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  };
</script>

<Panel position="top-left">
  <fieldset>
    <legend>nodes</legend>
    {#each MENU_NODE_TYPES as type (type)}
      <div draggable="true" role="listitem" ondragstart={(event) => ondragstart(event, type)}>{type}</div>
    {/each}
  </fieldset>
</Panel>
