<script lang="ts">
  import type { LayoutNode } from "../../stores/layout.store.svelte";
  import PanelSplit from "./PanelSplit.svelte";
  import PanelArea from "./PanelArea.svelte";

  let { node }: { node: LayoutNode } = $props();
</script>

{#if node.kind === "split"}
  <PanelSplit {node} />
{:else}
  <PanelArea {node} />
{/if}
