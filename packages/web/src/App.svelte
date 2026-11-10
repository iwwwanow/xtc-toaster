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

  // every graph change → new render; reconnect re-sends the current graph; no image → no render. Not during an
  // export (the server would drop it for the render); once it's done the current graph is sent again — a render
  // waiting on the server when the export came was replaced by it
  $effect(() => {
    void session.graphKey;
    if (session.connected && session.imageId !== null && session.exporting === null) untrack(() => session.render());
  });

  // the editor survives a reload — saved once a drag / a typing burst settles, not on every frame; the same moment
  // makes a step of the undo history
  const SAVE_DELAY_MS = 300;
  $effect(() => {
    const text = toSaved(session.nodes, session.edges, session.exportSettings);
    const timer = setTimeout(() => {
      save(text);
      session.recordHistory(text);
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  });

  // Ctrl+Z — undo, Ctrl+Shift+Z / Ctrl+Y — redo; by the key's place (event.code), so the Cyrillic layout works too.
  // Inside a field the browser undoes the typing itself
  const isField = (target: EventTarget | null) =>
    target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
  const onkeydown = (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || isField(event.target)) return;
    const redo = (event.code === "KeyZ" && event.shiftKey) || (event.code === "KeyY" && !event.shiftKey);
    const undo = event.code === "KeyZ" && !event.shiftKey;
    if (!undo && !redo) return;
    event.preventDefault();
    if (undo) session.undo();
    else session.redo();
  };
</script>

<svelte:window {onkeydown} />

<!-- the provider lets Editor use useSvelteFlow (drop position, delete) outside SvelteFlow's children -->
<SvelteFlowProvider>
  <Editor />
</SvelteFlowProvider>
