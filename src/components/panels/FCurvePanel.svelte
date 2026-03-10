<script lang="ts">
  import { onMount } from "svelte";
  import { timelineStore } from "../../stores/timeline.store.svelte";
  import type { Track } from "../../stores/timeline.store.svelte";
  import type { FCurveKeyframe } from "../../lib/bezier";

  const HANDLE_R = 5;
  const KF_R     = 6;

  let canvas: HTMLCanvasElement;
  let container: HTMLDivElement;
  let dpr = 1;

  // view state (frame and value ranges visible in canvas)
  let vxMin = $state(-5);
  let vxMax = $state(125);
  let vyMin = $state(-20);
  let vyMax = $state(380);

  // interaction
  type Sel =
    | { type: "keyframe"; trackId: string; kfId: string }
    | null;
  let selected = $state<Sel>(null);

  type DragState =
    | { type: "pan"; lastX: number; lastY: number }
    | { type: "keyframe"; trackId: string; kfId: string; startFx: number; startFy: number; downX: number; downY: number }
    | { type: "handle"; trackId: string; kfId: string; which: "in" | "out" }
    | null;
  let dragState: DragState = null;

  // ── coordinate transforms ──────────────────────────────────────────────────

  function fw(): number { return canvas ? canvas.width / dpr : 1; }
  function fh(): number { return canvas ? canvas.height / dpr : 1; }

  function toPixel(frame: number, value: number): { x: number; y: number } {
    return {
      x: ((frame - vxMin) / (vxMax - vxMin)) * fw(),
      y: (1 - (value - vyMin) / (vyMax - vyMin)) * fh(),
    };
  }

  function fromPixel(px: number, py: number): { frame: number; value: number } {
    return {
      frame: vxMin + (px / fw()) * (vxMax - vxMin),
      value: vyMin + (1 - py / fh()) * (vyMax - vyMin),
    };
  }

  // ── draw ──────────────────────────────────────────────────────────────────

  function draw() {
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const w = fw(), h = fh();

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = "#1b1b1b";
    ctx.fillRect(0, 0, w, h);

    drawGrid(ctx, w, h);
    drawScrubber(ctx, h);

    for (const track of timelineStore.tracks) {
      drawCurve(ctx, track);
    }

    for (const track of timelineStore.tracks) {
      drawKeyframes(ctx, track);
    }

    ctx.restore();
  }

  function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 1;

    // vertical frame lines
    const xStep = pickStep(vxMax - vxMin, w, 60);
    const firstX = Math.ceil(vxMin / xStep) * xStep;
    for (let f = firstX; f <= vxMax; f += xStep) {
      const { x } = toPixel(f, 0);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      ctx.fillStyle = "#555";
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      ctx.fillText(String(Math.round(f)), x, h - 4);
    }

    // horizontal value lines
    const yStep = pickStep(vyMax - vyMin, h, 40);
    const firstY = Math.ceil(vyMin / yStep) * yStep;
    for (let v = firstY; v <= vyMax; v += yStep) {
      const { y } = toPixel(0, v);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      ctx.fillStyle = "#555";
      ctx.font = "10px monospace";
      ctx.textAlign = "left";
      ctx.fillText(v.toFixed(v % 1 === 0 ? 0 : 2), 4, y - 3);
    }

    // axis lines
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1;
    const { x: x0 } = toPixel(0, 0);
    const { y: y0 } = toPixel(0, 0);
    ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(w, y0); ctx.stroke();
  }

  function drawScrubber(ctx: CanvasRenderingContext2D, h: number) {
    const { x } = toPixel(timelineStore.currentFrame, 0);
    ctx.strokeStyle = "#e8c45d66";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }

  function drawCurve(ctx: CanvasRenderingContext2D, track: Track) {
    const kfs = track.keyframes;
    if (kfs.length === 0) return;

    ctx.strokeStyle = track.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    // segment before first kf
    if (kfs[0].frame > vxMin) {
      const { x: x0, y: y0 } = toPixel(vxMin, kfs[0].value);
      const { x: x1, y: y1 } = toPixel(kfs[0].frame, kfs[0].value);
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    }

    for (let i = 0; i < kfs.length - 1; i++) {
      const k0 = kfs[i], k1 = kfs[i + 1];
      const p0 = toPixel(k0.frame,       k0.value);
      const p1 = toPixel(k0.handleOut.x, k0.handleOut.y);
      const p2 = toPixel(k1.handleIn.x,  k1.handleIn.y);
      const p3 = toPixel(k1.frame,       k1.value);
      ctx.moveTo(p0.x, p0.y);
      ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
    }

    // segment after last kf
    const last = kfs[kfs.length - 1];
    if (last.frame < vxMax) {
      const { x: x0, y: y0 } = toPixel(last.frame, last.value);
      const { x: x1, y: y1 } = toPixel(vxMax, last.value);
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    }

    ctx.stroke();
  }

  function drawKeyframes(ctx: CanvasRenderingContext2D, track: Track) {
    for (const kf of track.keyframes) {
      const isSel = selected?.type === "keyframe" && selected.kfId === kf.id;
      const { x, y } = toPixel(kf.frame, kf.value);

      // tangent handles (only when selected)
      if (isSel) {
        const hi = toPixel(kf.handleIn.x, kf.handleIn.y);
        const ho = toPixel(kf.handleOut.x, kf.handleOut.y);

        ctx.strokeStyle = "#ffffff55";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(hi.x, hi.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ho.x, ho.y); ctx.stroke();

        // handle circles
        [hi, ho].forEach(({ x: hx, y: hy }) => {
          ctx.fillStyle = "#fff";
          ctx.strokeStyle = "#000";
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(hx, hy, HANDLE_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        });
      }

      // keyframe circle
      ctx.fillStyle = isSel ? "#fff" : track.color;
      ctx.strokeStyle = isSel ? track.color : "#fff4";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, KF_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }

  function pickStep(range: number, size: number, minPx: number): number {
    const candidates = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
    for (const s of candidates) {
      if ((s / range) * size >= minPx) return s;
    }
    return candidates[candidates.length - 1];
  }

  // ── resize ─────────────────────────────────────────────────────────────────

  onMount(() => {
    dpr = window.devicePixelRatio || 1;
    const ro = new ResizeObserver(resize);
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

  $effect(() => {
    timelineStore.currentFrame;
    timelineStore.tracks;
    selected;
    vxMin; vxMax; vyMin; vyMax;
    draw();
  });

  // ── pointer interaction ────────────────────────────────────────────────────

  function cpx(e: PointerEvent) { return (e.clientX - canvas.getBoundingClientRect().left) / dpr; }
  function cpy(e: PointerEvent) { return (e.clientY - canvas.getBoundingClientRect().top)  / dpr; }

  function hitKf(px: number, py: number): { track: Track; kf: FCurveKeyframe } | null {
    for (const track of timelineStore.tracks) {
      for (const kf of track.keyframes) {
        const { x, y } = toPixel(kf.frame, kf.value);
        if (Math.hypot(px - x, py - y) <= KF_R + 2) return { track, kf };
      }
    }
    return null;
  }

  function hitHandle(
    px: number,
    py: number,
  ): { track: Track; kf: FCurveKeyframe; which: "in" | "out" } | null {
    if (!selected || selected.type !== "keyframe") return null;
    for (const track of timelineStore.tracks) {
      for (const kf of track.keyframes) {
        if (kf.id !== selected.kfId) continue;
        const hi = toPixel(kf.handleIn.x,  kf.handleIn.y);
        const ho = toPixel(kf.handleOut.x, kf.handleOut.y);
        if (Math.hypot(px - hi.x, py - hi.y) <= HANDLE_R + 2) return { track, kf, which: "in" };
        if (Math.hypot(px - ho.x, py - ho.y) <= HANDLE_R + 2) return { track, kf, which: "out" };
      }
    }
    return null;
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // middle drag or alt+drag → pan
      dragState = { type: "pan", lastX: cpx(e), lastY: cpy(e) };
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;

    const px = cpx(e), py = cpy(e);

    // hit handle first (needs selected kf)
    const hh = hitHandle(px, py);
    if (hh) {
      dragState = { type: "handle", trackId: hh.track.id, kfId: hh.kf.id, which: hh.which };
      canvas.setPointerCapture(e.pointerId);
      return;
    }

    // hit keyframe
    const hk = hitKf(px, py);
    if (hk) {
      selected = { type: "keyframe", trackId: hk.track.id, kfId: hk.kf.id };
      const { frame, value } = fromPixel(px, py);
      dragState = {
        type: "keyframe",
        trackId: hk.track.id,
        kfId: hk.kf.id,
        startFx: hk.kf.frame,
        startFy: hk.kf.value,
        downX: frame,
        downY: value,
      };
      canvas.setPointerCapture(e.pointerId);
      return;
    }

    // click empty → deselect
    selected = null;
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragState) return;
    const px = cpx(e), py = cpy(e);

    if (dragState.type === "pan") {
      const df = ((dragState.lastX - px) / fw()) * (vxMax - vxMin);
      const dv = ((py - dragState.lastY) / fh()) * (vyMax - vyMin);
      vxMin += df; vxMax += df;
      vyMin += dv; vyMax += dv;
      dragState = { ...dragState, lastX: px, lastY: py };
      return;
    }

    if (dragState.type === "keyframe") {
      const cur = fromPixel(px, py);
      const dFrame = cur.frame - dragState.downX;
      const dValue = cur.value - dragState.downY;
      timelineStore.moveKeyframe(dragState.trackId, dragState.kfId, dFrame, dValue);
      dragState = { ...dragState, downX: cur.frame, downY: cur.value };
      return;
    }

    if (dragState.type === "handle") {
      const { frame, value } = fromPixel(px, py);
      timelineStore.moveHandle(dragState.trackId, dragState.kfId, dragState.which, { x: frame, y: value });
    }
  }

  function onPointerUp() {
    dragState = null;
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const px = cpx(e as unknown as PointerEvent);
    const py = cpy(e as unknown as PointerEvent);
    const { frame: pf, value: pv } = fromPixel(px, py);
    const factor = e.deltaY > 0 ? 1.12 : 0.88;

    if (e.shiftKey) {
      // zoom Y only
      const rv = (vyMax - vyMin) * factor;
      const ry = (pv - vyMin) / (vyMax - vyMin);
      vyMin = pv - ry * rv;
      vyMax = pv + (1 - ry) * rv;
    } else if (e.ctrlKey) {
      // zoom X only
      const rx = (pf - vxMin) / (vxMax - vxMin);
      const rn = (vxMax - vxMin) * factor;
      vxMin = pf - rx * rn;
      vxMax = pf + (1 - rx) * rn;
    } else {
      // zoom both
      const rx = (pf - vxMin) / (vxMax - vxMin);
      const ry = (pv - vyMin) / (vyMax - vyMin);
      const rn = (vxMax - vxMin) * factor;
      const rv = (vyMax - vyMin) * factor;
      vxMin = pf - rx * rn; vxMax = pf + (1 - rx) * rn;
      vyMin = pv - ry * rv; vyMax = pv + (1 - ry) * rv;
    }
  }

  function fitView() {
    let fMin = Infinity, fMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    for (const track of timelineStore.tracks) {
      for (const kf of track.keyframes) {
        fMin = Math.min(fMin, kf.frame); fMax = Math.max(fMax, kf.frame);
        vMin = Math.min(vMin, kf.value); vMax = Math.max(vMax, kf.value);
      }
    }
    if (!isFinite(fMin)) return;
    const fp = (fMax - fMin) * 0.1 || 5;
    const vp = (vMax - vMin) * 0.15 || 0.5;
    vxMin = fMin - fp; vxMax = fMax + fp;
    vyMin = vMin - vp; vyMax = vMax + vp;
  }
</script>

<div class="panel">
  <div class="toolbar">
    <span class="title">F-Curve</span>
    <button class="tbtn" onclick={fitView}>Fit</button>
    <span class="hint">scroll=zoom · alt+drag=pan · shift=zoom Y · ctrl=zoom X</span>
  </div>

  <div class="canvas-wrap" bind:this={container}>
    <canvas
      bind:this={canvas}
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onwheel={onWheel}
      style="cursor: crosshair"
    ></canvas>
  </div>
</div>

<style>
  .panel {
    width: 100%; height: 100%;
    display: grid;
    grid-template-rows: 28px 1fr;
    overflow: hidden;
    background: #1b1b1b;
  }
  .toolbar {
    display: flex; align-items: center; gap: 8px;
    padding: 0 8px;
    background: var(--color-header);
    border-bottom: 1px solid var(--color-border);
  }
  .title { font-size: 11px; color: var(--color-text-dim); font-weight: 600; }
  .tbtn {
    background: var(--color-border); border: none;
    color: var(--color-text); font-size: 11px; padding: 2px 8px;
    border-radius: 3px; cursor: pointer;
  }
  .tbtn:hover { background: var(--color-accent); }
  .hint { font-size: 10px; color: #444; margin-left: auto; }

  .canvas-wrap { position: relative; overflow: hidden; }
  canvas { display: block; }
</style>
