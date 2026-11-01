<script lang="ts">
  import { SvelteFlowProvider } from "@xyflow/svelte";
  // uiu first (tokens, reset, typography, components), xyflow's base styles over its reset
  import "uiu/owo.css";
  import "uiu/ai-generated.css";
  import "@xyflow/svelte/dist/base.css";
  import "./app.css";
  import { untrack } from "svelte";
  import Editor from "./Editor.svelte";
  import { save, toSaved } from "./persist";
  import { session } from "./session.svelte";

  // every graph change → new render; reconnect re-sends the current graph; no image → no render
  $effect(() => {
    void session.graphKey;
    if (session.connected && session.imageId !== null) untrack(() => session.render());
  });

  // the editor survives a reload — saved once a drag / a typing burst settles, not on every frame
  const SAVE_DELAY_MS = 300;
  $effect(() => {
    const text = toSaved(session.nodes, session.edges);
    const timer = setTimeout(() => save(text), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  });
</script>

<!-- the provider lets Editor use useSvelteFlow (drop position, delete) outside SvelteFlow's children -->
<SvelteFlowProvider>
  <Editor />
</SvelteFlowProvider>
