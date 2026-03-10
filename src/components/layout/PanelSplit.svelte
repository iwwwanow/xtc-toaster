<script lang="ts">
  import type { SplitNode } from "../../stores/layout.store.svelte";
  import { layoutStore } from "../../stores/layout.store.svelte";
  import PanelTree from "./PanelTree.svelte";

  let { node }: { node: SplitNode } = $props();

  const isH = $derived(node.direction === "h");

  // ── drag-to-resize ──────────────────────────────────────────────────────────
  let container: HTMLElement;

  function onDividerPointerDown(e: PointerEvent) {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);

    function onMove(ev: PointerEvent) {
      const rect = container.getBoundingClientRect();
      const ratio = isH
        ? (ev.clientX - rect.left) / rect.width
        : (ev.clientY - rect.top) / rect.height;
      layoutStore.updateRatio(node.id, Math.min(0.9, Math.max(0.1, ratio)));
    }

    function onUp() {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
    }

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  }
</script>

<div
  class="split"
  class:h={isH}
  class:v={!isH}
  bind:this={container}
  style={isH
    ? `grid-template-columns: ${node.ratio * 100}% 4px 1fr`
    : `grid-template-rows: ${node.ratio * 100}% 4px 1fr`}
>
  <div class="child"><PanelTree node={node.a} /></div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="divider"
    class:divider-h={isH}
    class:divider-v={!isH}
    onpointerdown={onDividerPointerDown}
  ></div>

  <div class="child"><PanelTree node={node.b} /></div>
</div>

<style>
  .split {
    display: grid;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  .split.h {
    grid-template-rows: 1fr;
  }
  .split.v {
    grid-template-columns: 1fr;
  }
  .child {
    overflow: hidden;
    min-width: 0;
    min-height: 0;
  }
  .divider {
    background: var(--color-border);
    z-index: 10;
    transition: background 0.1s;
  }
  .divider:hover,
  .divider:active {
    background: var(--color-accent);
  }
  .divider-h {
    cursor: col-resize;
    width: 4px;
    height: 100%;
  }
  .divider-v {
    cursor: row-resize;
    width: 100%;
    height: 4px;
  }
</style>
