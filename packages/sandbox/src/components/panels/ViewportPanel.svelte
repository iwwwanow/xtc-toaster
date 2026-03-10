<script lang="ts">
  import { onMount } from "svelte";
  import { Composition } from "@xtc-toaster/core";
  import { compositionStore } from "../../stores/composition.store.svelte";

  export const CANVAS_ID = "__gui_canvas__";

  let canvas: HTMLCanvasElement;
  let imageSize = $state<{ w: number; h: number } | null>(null);


  function initComposition(img: HTMLImageElement) {
    compositionStore.stopAnimation();
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    imageSize = { w, h };
    canvas.width = w;
    canvas.height = h;

    const comp = new Composition({
      canvasId: CANVAS_ID,
      imgQuerySelector: "#__gui_img__",
      options: { width: w, height: h },
    });
    comp.init();
    compositionStore.set(comp);
  }

  function onFileChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = document.getElementById("__gui_img__") as HTMLImageElement;
    img.onload = () => initComposition(img);
    img.src = url;
  }

  onMount(() => {
    const img = document.getElementById("__gui_img__") as HTMLImageElement;
    if (img.complete && img.naturalWidth > 0) initComposition(img);
    else img.onload = () => initComposition(img);
  });
</script>

<img id="__gui_img__" src="/poppy-3.webp" alt="" style="display:none" />

<div class="viewport">
  <div class="toolbar">
    <span class="title">Viewport</span>
    <label class="btn">
      Load image
      <input type="file" accept="image/*" onchange={onFileChange} hidden />
    </label>
    {#if imageSize}
      <span class="info">{imageSize.w} × {imageSize.h} px</span>
    {/if}
  </div>

  <div class="canvas-area">
    <canvas id={CANVAS_ID} bind:this={canvas}></canvas>

  </div>
</div>

<style>
  .viewport {
    width: 100%; height: 100%;
    display: grid; grid-template-rows: 28px 1fr;
    background: var(--color-canvas-bg);
  }
  .toolbar {
    display: flex; align-items: center; gap: 8px;
    padding: 0 8px;
    background: var(--color-header);
    border-bottom: 1px solid var(--color-border);
  }
  .title { font-size: 11px; font-weight: 600; color: var(--color-text-dim); text-transform: uppercase; letter-spacing: .05em; }
  .btn {
    font-size: 11px; color: var(--color-text);
    background: var(--color-border); padding: 2px 8px;
    border-radius: 3px; cursor: pointer; user-select: none;
  }
  .btn:hover { background: var(--color-accent); }
  .info { font-size: 11px; color: var(--color-text-dim); }

  .canvas-area {
    position: relative; overflow: auto;
    display: flex; align-items: center; justify-content: center;
  }
  canvas { image-rendering: pixelated; max-width: 100%; max-height: 100%; }
</style>
