<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { EditorView, basicSetup } from "codemirror";
  import { javascript } from "@codemirror/lang-javascript";
  import { oneDark } from "@codemirror/theme-one-dark";
  import { EditorState } from "@codemirror/state";

  import { compositionStore } from "../../stores/composition.store.svelte";
  import { editorStore, HELP_TEXT } from "../../stores/editor.store.svelte";

  import { Layer, LayerEffect, BlendMod, Channel } from "../../../lib";
  import { cutHue, cutSaturation, cutValue, cutChannel } from "../../../lib";

  // ── GIF export progress (shared with ViewportPanel via binding) ────────────
  let exportProgress = $state({ active: false, current: 0, total: 0 });
  export { exportProgress };   // parent App.svelte can bind to this if needed

  // ── help overlay ───────────────────────────────────────────────────────────
  let showHelp = $state(false);

  // ── editor setup ──────────────────────────────────────────────────────────
  let editorContainer: HTMLDivElement;
  let view: EditorView;

  onMount(() => {
    view = new EditorView({
      state: EditorState.create({
        doc: editorStore.code,
        extensions: [
          basicSetup,
          javascript({ typescript: true }),
          oneDark,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) editorStore.setCode(view.state.doc.toString());
          }),
          EditorView.theme({
            "&": { height: "100%", fontSize: "12px" },
            ".cm-scroller": { overflow: "auto", fontFamily: "'JetBrains Mono', 'Fira Code', monospace" },
          }),
        ],
      }),
      parent: editorContainer,
    });
  });

  onDestroy(() => view?.destroy());

  // ── run / stop ─────────────────────────────────────────────────────────────

  function run() {
    const composition = compositionStore.instance;
    if (!composition) {
      editorStore.setError("Загрузи изображение во Viewport перед запуском");
      return;
    }
    compositionStore.stopAnimation();
    editorStore.setError(null);

    function animFrame(id: number) {
      compositionStore.setAnimFrame(id);
    }

    // wrap in async IIFE so top-level await works in scripts
    const wrappedCode = `return (async () => { ${editorStore.code} })()`;

    try {
      const fn = new Function(
        "composition",
        "Layer", "LayerEffect", "BlendMod", "Channel",
        "cutHue", "cutSaturation", "cutValue", "cutChannel",
        "animFrame",
        "exportGIF",
        wrappedCode,
      );
      fn(
        composition,
        Layer, LayerEffect, BlendMod, Channel,
        cutHue, cutSaturation, cutValue, cutChannel,
        animFrame,
        makeExportGIF(composition),
      ).catch((e: unknown) => {
        editorStore.setError(e instanceof Error ? e.message : String(e));
      });
    } catch (e) {
      editorStore.setError(e instanceof Error ? e.message : String(e));
    }
  }

  function stop() {
    compositionStore.stopAnimation();
  }

  // ── GIF export factory ─────────────────────────────────────────────────────

  function makeExportGIF(composition: InstanceType<typeof import("../../../lib").Composition>) {
    return async function exportGIF({
      frames,
      fps,
      onFrame,
    }: {
      frames: number;
      fps: number;
      onFrame: (frame: number) => void;
    }) {
      const canvas = composition.canvas;
      if (!canvas) throw new Error("Canvas не найден");

      // stop any running animation first
      compositionStore.stopAnimation();

      const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
      const gif = GIFEncoder();
      const delay = Math.round(1000 / fps);

      exportProgress = { active: true, current: 0, total: frames };

      for (let i = 0; i < frames; i++) {
        onFrame(i);

        const ctx = canvas.getContext("2d")!;
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const palette = quantize(imageData.data, 256);
        const index = applyPalette(imageData.data, palette);
        gif.writeFrame(index, canvas.width, canvas.height, { palette, delay });

        exportProgress = { active: true, current: i + 1, total: frames };

        // yield to browser every 8 frames so progress bar updates
        if (i % 8 === 7) await new Promise<void>((r) => setTimeout(r, 0));
      }

      gif.finish();
      exportProgress = { active: false, current: 0, total: 0 };

      const blob = new Blob([gif.bytes()], { type: "image/gif" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `canvas-playground-${Date.now()}.gif`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    };
  }
</script>

<div class="panel">
  <!-- toolbar -->
  <div class="toolbar">
    <span class="title">Editor</span>
    <button class="btn run"  onclick={run}>▶ Run</button>
    <button class="btn stop" onclick={stop}>■ Stop</button>
    <button class="btn help" onclick={() => (showHelp = !showHelp)} class:active={showHelp}>? Docs</button>
  </div>

  <!-- editor + help overlay -->
  <div class="body">
    <div class="cm-wrap" bind:this={editorContainer}></div>

    {#if showHelp}
      <div class="help-overlay">
        <button class="help-close" onclick={() => (showHelp = false)}>✕ закрыть</button>
        <pre class="help-text">{HELP_TEXT}</pre>
      </div>
    {/if}
  </div>

  {#if editorStore.error}
    <div class="error-bar">{editorStore.error}</div>
  {/if}
</div>

<!-- export progress is shown in ViewportPanel via shared reactive state -->
<!-- We expose exportProgress as a prop so ViewportPanel can bind to it -->
<!-- For now, duplicate the overlay here as a fallback -->
{#if exportProgress.active}
  <div class="export-global">
    <div class="export-box">
      <div class="export-label">Экспорт GIF…</div>
      <div class="export-bar-wrap">
        <div class="export-bar" style="width:{(exportProgress.current / exportProgress.total) * 100}%"></div>
      </div>
      <div class="export-count">{exportProgress.current} / {exportProgress.total} кадров</div>
    </div>
  </div>
{/if}

<style>
  .panel {
    width: 100%; height: 100%;
    display: grid; grid-template-rows: 28px 1fr auto;
    overflow: hidden; background: var(--color-panel);
  }
  .toolbar {
    display: flex; align-items: center; gap: 5px;
    padding: 0 8px;
    background: var(--color-header);
    border-bottom: 1px solid var(--color-border);
  }
  .title { font-size: 11px; font-weight: 600; color: var(--color-text-dim); text-transform: uppercase; letter-spacing: .05em; margin-right: 4px; }
  .btn {
    font-size: 11px; padding: 2px 10px;
    border: none; border-radius: 3px;
    cursor: pointer; font-family: inherit;
  }
  .run  { background: #2d5a2d; color: #8fcc8f; }
  .run:hover  { background: #3a7a3a; }
  .stop { background: #5a2d2d; color: #cc8f8f; }
  .stop:hover { background: #7a3a3a; }
  .help { background: #2d3d5a; color: #8fb0cc; margin-left: auto; }
  .help:hover, .help.active { background: #3a5a8a; color: #c0d8f0; }

  .body { position: relative; overflow: hidden; min-height: 0; }
  .cm-wrap { width: 100%; height: 100%; overflow: hidden; }

  .help-overlay {
    position: absolute; inset: 0; z-index: 10;
    background: #161b22;
    overflow-y: auto;
    padding: 0;
  }
  .help-close {
    position: sticky; top: 0; left: 0; right: 0;
    width: 100%; padding: 6px 12px;
    background: #1e2a38; border: none; border-bottom: 1px solid #2a3a4a;
    color: #8fb0cc; font-size: 11px; cursor: pointer; text-align: left;
  }
  .help-close:hover { background: #2a3a4a; }
  .help-text {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 11.5px; line-height: 1.65;
    color: #c0ccd8; padding: 16px 20px;
    white-space: pre-wrap; margin: 0;
  }

  .error-bar {
    background: #3a1a1a; color: #ff9a9a;
    font-size: 11px; padding: 4px 8px;
    border-top: 1px solid #6a2a2a;
    white-space: pre-wrap; max-height: 72px; overflow-y: auto;
  }

  /* fullscreen export overlay */
  .export-global {
    position: fixed; inset: 0; z-index: 100;
    background: #000c;
    display: flex; align-items: center; justify-content: center;
  }
  .export-box {
    background: #2a2a2a; border: 1px solid var(--color-border);
    border-radius: 6px; padding: 24px 32px;
    display: flex; flex-direction: column; gap: 12px; min-width: 240px;
  }
  .export-label { font-size: 14px; font-weight: 600; color: var(--color-text); text-align: center; }
  .export-bar-wrap { height: 6px; background: #3a3a3a; border-radius: 3px; overflow: hidden; }
  .export-bar { height: 100%; background: var(--color-accent); border-radius: 3px; transition: width .12s; }
  .export-count { font-size: 11px; color: var(--color-text-dim); text-align: center; }
</style>
