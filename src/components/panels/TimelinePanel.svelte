<script lang="ts">
  import { onMount } from "svelte";
  import { timelineStore } from "../../stores/timeline.store.svelte";
  import type { Track } from "../../stores/timeline.store.svelte";
  import type { FCurveKeyframe } from "../../lib/bezier";

  // ── layout constants ───────────────────────────────────────────────────────
  const RULER_H   = 24;
  const TRACK_H   = 28;
  const LABEL_W   = 120;
  const DIAMOND_R = 5;

  let canvas: HTMLCanvasElement;
  let container: HTMLDivElement;
  let dpr = 1;

  // view state (visible frame range)
  let viewStart = $state(timelineStore.frameStart - 2);
  let viewEnd   = $state(timelineStore.frameEnd + 2);

  // drag state
  type DragTarget =
    | { type: "scrubber" }
    | { type: "keyframe"; trackId: string; kfId: string; startFrame: number; startX: number };
  let drag = $state<DragTarget | null>(null);

  // ── coordinate transforms ──────────────────────────────────────────────────

  function frameToX(frame: number, w: number): number {
    return ((frame - viewStart) / (viewEnd - viewStart)) * w;
  }

  function xToFrame(x: number, w: number): number {
    return viewStart + (x / w) * (viewEnd - viewStart);
  }

  function trackY(i: number): number {
    return RULER_H + i * TRACK_H + TRACK_H / 2;
  }

  // ── rendering ──────────────────────────────────────────────────────────────

  function draw() {
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // background
    ctx.fillStyle = "#1e1e1e";
    ctx.fillRect(0, 0, w, h);

    // track row backgrounds
    timelineStore.tracks.forEach((_, i) => {
      const y = RULER_H + i * TRACK_H;
      ctx.fillStyle = i % 2 === 0 ? "#232323" : "#262626";
      ctx.fillRect(0, y, w, TRACK_H);
    });

    // ruler background
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, w, RULER_H);

    // ruler ticks + labels
    drawRuler(ctx, w);

    // track center lines
    timelineStore.tracks.forEach((_, i) => {
      const y = trackY(i);
      ctx.strokeStyle = "#3a3a3a";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    });

    // keyframe diamonds
    timelineStore.tracks.forEach((track, i) => {
      const y = trackY(i);
      for (const kf of track.keyframes) {
        const x = frameToX(kf.frame, w);
        drawDiamond(ctx, x, y, DIAMOND_R, track.color);
      }
    });

    // scrubber
    const sx = frameToX(timelineStore.currentFrame, w);
    ctx.strokeStyle = "#e8c45d";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, h); ctx.stroke();

    // scrubber handle triangle
    ctx.fillStyle = "#e8c45d";
    ctx.beginPath();
    ctx.moveTo(sx - 6, 0);
    ctx.lineTo(sx + 6, 0);
    ctx.lineTo(sx, 10);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawRuler(ctx: CanvasRenderingContext2D, w: number) {
    const range = viewEnd - viewStart;
    const step = pickStep(range, w);

    const first = Math.ceil(viewStart / step) * step;

    ctx.strokeStyle = "#555";
    ctx.fillStyle = "#888";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";

    for (let f = first; f <= viewEnd; f += step) {
      const x = frameToX(f, w);
      ctx.beginPath();
      ctx.moveTo(x, RULER_H - 6);
      ctx.lineTo(x, RULER_H);
      ctx.stroke();
      ctx.fillText(String(f), x, RULER_H - 8);
    }
  }

  function pickStep(range: number, w: number): number {
    const minPx = 40; // min pixels between labels
    const candidates = [1, 2, 5, 10, 25, 50, 100, 200, 500];
    for (const s of candidates) {
      if ((s / range) * w >= minPx) return s;
    }
    return candidates[candidates.length - 1];
  }

  function drawDiamond(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    color: string,
  ) {
    ctx.fillStyle = color;
    ctx.strokeStyle = "#fff3";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // ── resize observer ────────────────────────────────────────────────────────

  onMount(() => {
    dpr = window.devicePixelRatio || 1;

    const ro = new ResizeObserver(() => resize());
    ro.observe(container);

    return () => ro.disconnect();
  });

  function resize() {
    if (!canvas || !container) return;
    dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width  = rect.width  + "px";
    canvas.style.height = rect.height + "px";
    draw();
  }

  // ── reactivity ─────────────────────────────────────────────────────────────

  $effect(() => {
    // track reactive deps
    timelineStore.currentFrame;
    timelineStore.tracks;
    viewStart; viewEnd;
    draw();
  });

  // ── pointer interaction ────────────────────────────────────────────────────

  function canvasX(e: PointerEvent): number {
    return (e.clientX - canvas.getBoundingClientRect().left) / dpr;
  }
  function canvasY(e: PointerEvent): number {
    return (e.clientY - canvas.getBoundingClientRect().top) / dpr;
  }
  function cw(): number { return canvas.width / dpr; }

  function hitKf(
    px: number,
    py: number,
    tracks: Track[],
  ): { track: Track; kf: FCurveKeyframe } | null {
    const w = cw();
    for (let i = 0; i < tracks.length; i++) {
      const ty = trackY(i);
      for (const kf of tracks[i].keyframes) {
        const kx = frameToX(kf.frame, w);
        if (Math.abs(px - kx) <= DIAMOND_R + 2 && Math.abs(py - ty) <= DIAMOND_R + 2) {
          return { track: tracks[i], kf };
        }
      }
    }
    return null;
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    const px = canvasX(e);
    const py = canvasY(e);
    const w = cw();

    // hit scrubber handle
    const sx = frameToX(timelineStore.currentFrame, w);
    if (py < RULER_H + 4 && Math.abs(px - sx) < 8) {
      drag = { type: "scrubber" };
      canvas.setPointerCapture(e.pointerId);
      return;
    }

    // hit keyframe
    const hit = hitKf(px, py, timelineStore.tracks);
    if (hit) {
      drag = { type: "keyframe", trackId: hit.track.id, kfId: hit.kf.id, startFrame: hit.kf.frame, startX: px };
      canvas.setPointerCapture(e.pointerId);
      return;
    }

    // click ruler or track → set frame
    if (px >= 0) {
      timelineStore.setFrame(Math.round(xToFrame(px, w)));
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag) return;
    const px = canvasX(e);
    const w = cw();

    if (drag.type === "scrubber") {
      timelineStore.setFrame(Math.round(xToFrame(px, w)));
    } else if (drag.type === "keyframe") {
      const dFrame = xToFrame(px, w) - xToFrame(drag.startX, w);
      timelineStore.moveKeyframe(drag.trackId, drag.kfId, dFrame, 0);
      // update startX to avoid compounding delta
      drag = { ...drag, startX: px };
    }
  }

  function onPointerUp() {
    drag = null;
  }

  // scroll to zoom
  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const px = canvasX(e as unknown as PointerEvent);
    const w = cw();
    const pivotFrame = xToFrame(px, w);
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    const newRange = (viewEnd - viewStart) * factor;
    const ratio = (pivotFrame - viewStart) / (viewEnd - viewStart);
    viewStart = pivotFrame - ratio * newRange;
    viewEnd   = pivotFrame + (1 - ratio) * newRange;
  }
</script>

<div class="panel">
  <!-- toolbar -->
  <div class="toolbar">
    <button class="tbtn" onclick={timelineStore.stop}   title="Stop">⏹</button>
    <button class="tbtn" onclick={timelineStore.play}   title="Play"  class:active={timelineStore.playing}>▶</button>
    <button class="tbtn" onclick={timelineStore.pause}  title="Pause" class:active={!timelineStore.playing}>⏸</button>
    <span class="frame-num">{Math.round(timelineStore.currentFrame)}</span>
    <span class="sep">/</span>
    <span class="frame-num dim">{timelineStore.frameEnd}</span>
    <span class="fps">{timelineStore.fps} fps</span>
  </div>

  <div class="body">
    <!-- track labels -->
    <div class="labels">
      <div class="label-ruler"></div>
      {#each timelineStore.tracks as track}
        <div class="label-row" style="height:{TRACK_H}px">
          <span class="dot" style="background:{track.color}"></span>
          {track.label}
        </div>
      {/each}
    </div>

    <!-- canvas -->
    <div class="canvas-wrap" bind:this={container}>
      <canvas
        bind:this={canvas}
        onpointerdown={onPointerDown}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
        onwheel={onWheel}
      ></canvas>
    </div>
  </div>
</div>

<style>
  .panel {
    width: 100%; height: 100%;
    display: grid;
    grid-template-rows: 28px 1fr;
    overflow: hidden;
    background: #1e1e1e;
  }
  .toolbar {
    display: flex; align-items: center; gap: 4px;
    padding: 0 8px;
    background: var(--color-header);
    border-bottom: 1px solid var(--color-border);
  }
  .tbtn {
    background: none; border: none; color: var(--color-text);
    cursor: pointer; font-size: 13px; padding: 2px 4px; border-radius: 3px;
  }
  .tbtn:hover { background: #3a3a3a; }
  .tbtn.active { color: var(--color-accent); }
  .frame-num { font-size: 12px; font-variant-numeric: tabular-nums; min-width: 28px; text-align: right; }
  .frame-num.dim { color: var(--color-text-dim); }
  .sep { color: var(--color-text-dim); font-size: 11px; }
  .fps { margin-left: auto; font-size: 11px; color: var(--color-text-dim); }

  .body {
    display: grid;
    grid-template-columns: 120px 1fr;
    overflow: hidden;
  }
  .labels {
    background: #1a1a1a;
    border-right: 1px solid var(--color-border);
    overflow: hidden;
  }
  .label-ruler { height: 24px; border-bottom: 1px solid var(--color-border); }
  .label-row {
    display: flex; align-items: center; gap: 6px;
    padding: 0 8px;
    font-size: 11px; color: var(--color-text);
    border-bottom: 1px solid #2a2a2a;
  }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

  .canvas-wrap {
    position: relative; overflow: hidden;
    cursor: crosshair;
  }
  canvas { display: block; }
</style>
