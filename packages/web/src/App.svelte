<script lang="ts">
  import { SvelteFlowProvider } from "@xyflow/svelte";
  import "@xyflow/svelte/dist/style.css";
  import { untrack } from "svelte";
  import Editor from "./Editor.svelte";
  import { session } from "./session.svelte";

  // every graph change → new render; reconnect re-sends the current graph; no image → no render
  $effect(() => {
    void session.graphKey;
    if (session.connected && session.imageId !== null) untrack(() => session.render());
  });
</script>

<!-- the provider lets Editor use useSvelteFlow (drop position, delete) outside SvelteFlow's children -->
<SvelteFlowProvider>
  <Editor />
</SvelteFlowProvider>
