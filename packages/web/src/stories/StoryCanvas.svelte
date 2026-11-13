<script lang="ts">
  import { Background, SvelteFlow, SvelteFlowProvider } from "@xyflow/svelte";
  import LinkEdge from "../edges/LinkEdge.svelte";
  import { nodeTypes } from "../nodes";
  import { session } from "../session.svelte";
  import { useStory, type StoryState } from "./load.svelte";

  // A canvas with the real nodes of a toast and nothing else — no menu, panels or arrange: the nodes as they look.
  // Reloaded whenever the story's args change
  let props: StoryState = $props();
  const story = useStory(() => props);
  const edgeTypes = { default: LinkEdge };
</script>

{#if story.error}
  <pre>{story.error}</pre>
{:else if story.ready}
  <!-- as Editor's wrapper: the whole page, xyflow's own node border off -->
  <div style="position: fixed; inset: 0; --xy-node-border: none; --xy-node-border-selected: none">
    <SvelteFlowProvider>
      <SvelteFlow bind:nodes={session.nodes} bind:edges={session.edges} {nodeTypes} {edgeTypes} fitView fitViewOptions={{ maxZoom: 1 }}>
        <Background />
      </SvelteFlow>
    </SvelteFlowProvider>
  </div>
{:else}
  <p>loading…</p>
{/if}
