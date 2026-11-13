<script lang="ts">
  import App from "../App.svelte";
  import { session } from "../session.svelte";
  import { useStory, type StoryState } from "./load.svelte";

  // The whole editor — menu, panels, timeline, undo — on a toast. No server: App asks for a render on every edit, it
  // is answered at once with the picture already there — else the editor would stay locked, waiting
  let props: StoryState = $props();
  const story = useStory(() => props);
  $effect(() => {
    if (session.rendering) session.rendering = false;
  });
</script>

{#if story.error}
  <pre>{story.error}</pre>
{:else if story.ready}
  <App />
{:else}
  <p>loading…</p>
{/if}
