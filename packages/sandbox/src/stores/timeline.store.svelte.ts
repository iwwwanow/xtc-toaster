import { autoHandles, newKfId, evaluateCurve } from "../lib/bezier";
import type { FCurveKeyframe } from "../lib/bezier";

export interface Track {
  id: string;
  label: string;
  color: string;
  keyframes: FCurveKeyframe[];
  valueMin: number;
  valueMax: number;
}

// ── default demo tracks (composition-2) ──────────────────────────────────────

function makeTrack(
  id: string,
  label: string,
  color: string,
  points: Array<[number, number]>,
  min: number,
  max: number,
): Track {
  const raw = points.map(([frame, value]) => ({
    id: newKfId(),
    frame,
    value,
    handleIn: { x: frame, y: value },
    handleOut: { x: frame, y: value },
    mode: "auto" as const,
  }));
  return { id, label, color, keyframes: autoHandles(raw), valueMin: min, valueMax: max };
}

const defaultTracks: Track[] = [
  makeTrack("hue",       "Hue",        "#e87a5d", [[0, 0], [120, 360]], 0, 360),
  makeTrack("noize_dev", "Noize dev",  "#5db8e8", [[0, 0.3], [60, 0.05], [120, 0.3]], 0, 1),
];

// ── store ─────────────────────────────────────────────────────────────────────

export const timelineStore = (() => {
  let currentFrame = $state(0);
  let frameStart   = $state(0);
  let frameEnd     = $state(120);
  let fps          = $state(30);
  let playing      = $state(false);
  let tracks       = $state<Track[]>(defaultTracks);

  let _rafId: number | null = null;
  let _lastTime: number | null = null;

  // ── playback ──────────────────────────────────────────────────────────────

  function play() {
    if (playing) return;
    playing = true;
    _lastTime = null;
    _tick();
  }

  function pause() {
    playing = false;
    if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null; }
  }

  function stop() {
    pause();
    currentFrame = frameStart;
  }

  function _tick() {
    _rafId = requestAnimationFrame((now) => {
      if (!playing) return;
      if (_lastTime !== null) {
        const dt = (now - _lastTime) / 1000;
        currentFrame = currentFrame + dt * fps;
        if (currentFrame > frameEnd) currentFrame = frameStart;
      }
      _lastTime = now;
      _tick();
    });
  }

  // ── keyframe editing ──────────────────────────────────────────────────────

  function setFrame(f: number) {
    currentFrame = Math.max(frameStart, Math.min(frameEnd, f));
  }

  function moveKeyframe(trackId: string, kfId: string, dFrame: number, dValue: number) {
    tracks = tracks.map((t) => {
      if (t.id !== trackId) return t;
      const kfs = t.keyframes.map((kf) => {
        if (kf.id !== kfId) return kf;
        const df = Math.round(dFrame);
        const dv = dValue;
        return {
          ...kf,
          frame:      kf.frame + df,
          value:      kf.value + dv,
          handleIn:   { x: kf.handleIn.x  + df, y: kf.handleIn.y  + dv },
          handleOut:  { x: kf.handleOut.x + df, y: kf.handleOut.y + dv },
        };
      });
      const sorted = [...kfs].sort((a, b) => a.frame - b.frame);
      // recompute auto handles for the whole track
      return { ...t, keyframes: autoHandles(sorted) };
    });
  }

  function moveHandle(
    trackId: string,
    kfId: string,
    which: "in" | "out",
    pos: { x: number; y: number },
  ) {
    tracks = tracks.map((t) => {
      if (t.id !== trackId) return t;
      const kfs = t.keyframes.map((kf) => {
        if (kf.id !== kfId) return kf;
        return {
          ...kf,
          mode: "free" as const,
          [which === "in" ? "handleIn" : "handleOut"]: pos,
        };
      });
      return { ...t, keyframes: kfs };
    });
  }

  // ── query ─────────────────────────────────────────────────────────────────

  function getTrackValue(trackId: string): number {
    const track = tracks.find((t) => t.id === trackId);
    if (!track) return 0;
    return evaluateCurve(currentFrame, track.keyframes);
  }

  return {
    get currentFrame() { return currentFrame; },
    get frameStart()   { return frameStart; },
    get frameEnd()     { return frameEnd; },
    get fps()          { return fps; },
    get playing()      { return playing; },
    get tracks()       { return tracks; },
    setFrame,
    play,
    pause,
    stop,
    moveKeyframe,
    moveHandle,
    getTrackValue,
  };
})();
