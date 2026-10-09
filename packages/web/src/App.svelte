<script lang="ts">
  import { SvelteFlow } from "@xyflow/svelte";
  import "@xyflow/svelte/dist/style.css";
  import { untrack } from "svelte";
  import { nodeTypes } from "./nodes";
  import { session } from "./session.svelte";

  // every graph change → new render; reconnect re-sends the current graph; no image → no render
  $effect(() => {
    void session.graphKey;
    if (session.connected && session.imageId !== null) untrack(() => session.render());
  });
</script>

<!-- graph interaction is off in sprint 1: no drag, pan, zoom, select, connect, delete -->
<div style="position: fixed; inset: 0">
  <SvelteFlow
    bind:nodes={session.nodes}
    bind:edges={session.edges}
    {nodeTypes}
    fitView
    nodesDraggable={false}
    nodesConnectable={false}
    nodesFocusable={false}
    edgesFocusable={false}
    elementsSelectable={false}
    panOnDrag={false}
    panOnScroll={false}
    zoomOnScroll={false}
    zoomOnPinch={false}
    zoomOnDoubleClick={false}
    deleteKey={null}
    selectionKey={null}
    multiSelectionKey={null}
  />
</div>
