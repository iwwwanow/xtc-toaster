<script lang="ts">
  import type { AreaNode } from "../../stores/layout.store.svelte";
  import ViewportPanel from "../panels/ViewportPanel.svelte";
  import TimelinePanel from "../panels/TimelinePanel.svelte";
  import FCurvePanel from "../panels/FCurvePanel.svelte";
  import LayersPanel from "../panels/LayersPanel.svelte";
  import PropertiesPanel from "../panels/PropertiesPanel.svelte";
  import CodeEditorPanel from "../panels/CodeEditorPanel.svelte";

  const PANEL_LABELS: Record<string, string> = {
    viewport: "Viewport",
    timeline: "Timeline",
    fcurve: "F-Curve",
    layers: "Layers",
    properties: "Properties",
    editor: "Editor",
  };

  let { node }: { node: AreaNode } = $props();
</script>

<div class="area">
  <header class="area-header">
    <span class="area-label">{PANEL_LABELS[node.type]}</span>
  </header>
  <div class="area-content">
    {#if node.type === "viewport"}
      <ViewportPanel />
    {:else if node.type === "timeline"}
      <TimelinePanel />
    {:else if node.type === "fcurve"}
      <FCurvePanel />
    {:else if node.type === "layers"}
      <LayersPanel />
    {:else if node.type === "properties"}
      <PropertiesPanel />
    {:else if node.type === "editor"}
      <CodeEditorPanel />
    {/if}
  </div>
</div>

<style>
  .area {
    display: grid;
    grid-template-rows: 24px 1fr;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--color-panel);
    border: 1px solid var(--color-border);
    box-sizing: border-box;
  }
  .area-header {
    display: flex;
    align-items: center;
    padding: 0 8px;
    background: var(--color-header);
    border-bottom: 1px solid var(--color-border);
    user-select: none;
  }
  .area-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-text-dim);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .area-content {
    overflow: hidden;
    min-width: 0;
    min-height: 0;
  }
</style>
