<script lang="ts">
  import ViewportPanel from "./components/panels/ViewportPanel.svelte";
  import CodeEditorPanel from "./components/panels/CodeEditorPanel.svelte";

  let ratio = $state(0.48);
  let dragging = false;
  let root: HTMLDivElement;

  function onDividerDown(e: PointerEvent) {
    dragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onDividerMove(e: PointerEvent) {
    if (!dragging) return;
    const rect = root.getBoundingClientRect();
    ratio = Math.min(0.82, Math.max(0.18, (e.clientX - rect.left) / rect.width));
  }
  function onDividerUp() { dragging = false; }
</script>

<div class="app" bind:this={root}>
  <div class="pane" style="width:{ratio * 100}%">
    <ViewportPanel />
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="divider"
    onpointerdown={onDividerDown}
    onpointermove={onDividerMove}
    onpointerup={onDividerUp}
  ></div>

  <div class="pane" style="flex:1; min-width:0">
    <CodeEditorPanel />
  </div>
</div>

<style>
  .app {
    width: 100vw; height: 100vh;
    display: flex;
    overflow: hidden;
    background: var(--color-bg);
  }
  .pane { height: 100%; overflow: hidden; }
  .divider {
    width: 4px; height: 100%; flex-shrink: 0;
    background: var(--color-border);
    cursor: col-resize;
    transition: background 0.15s;
  }
  .divider:hover { background: var(--color-accent); }
</style>
