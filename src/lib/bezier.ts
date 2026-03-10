export interface Vec2 { x: number; y: number; }

export interface FCurveKeyframe {
  id: string;
  frame: number;
  value: number;
  handleIn: Vec2;   // absolute frame/value coords
  handleOut: Vec2;  // absolute frame/value coords
  mode: "auto" | "free" | "linear";
}

// ── cubic bezier ──────────────────────────────────────────────────────────────

function cubic(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

/** Find t such that Bx(t) ≈ targetX via binary search */
function solveT(targetX: number, x0: number, x1: number, x2: number, x3: number): number {
  let lo = 0, hi = 1;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    if (cubic(mid, x0, x1, x2, x3) < targetX) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// ── public API ────────────────────────────────────────────────────────────────

/** Evaluate F-curve at given frame */
export function evaluateCurve(frame: number, kfs: FCurveKeyframe[]): number {
  if (kfs.length === 0) return 0;
  if (kfs.length === 1 || frame <= kfs[0].frame) return kfs[0].value;
  if (frame >= kfs[kfs.length - 1].frame) return kfs[kfs.length - 1].value;

  let i = 0;
  while (i < kfs.length - 2 && kfs[i + 1].frame <= frame) i++;

  const k0 = kfs[i], k1 = kfs[i + 1];
  const t = solveT(frame, k0.frame, k0.handleOut.x, k1.handleIn.x, k1.frame);
  return cubic(t, k0.value, k0.handleOut.y, k1.handleIn.y, k1.value);
}

/** Sample a bezier segment for canvas rendering */
export function sampleSegment(k0: FCurveKeyframe, k1: FCurveKeyframe, n = 48): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push({
      x: cubic(t, k0.frame, k0.handleOut.x, k1.handleIn.x, k1.frame),
      y: cubic(t, k0.value, k0.handleOut.y, k1.handleIn.y, k1.value),
    });
  }
  return pts;
}

/** Catmull-Rom–style auto handles */
export function autoHandles(kfs: FCurveKeyframe[]): FCurveKeyframe[] {
  return kfs.map((kf, i) => {
    const prev = kfs[i - 1];
    const next = kfs[i + 1];

    let slope: number;
    if (prev && next)     slope = (next.value - prev.value) / (next.frame - prev.frame);
    else if (next)        slope = (next.value - kf.value) / (next.frame - kf.frame);
    else if (prev)        slope = (kf.value - prev.value) / (kf.frame - prev.frame);
    else                  slope = 0;

    const outX = next ? kf.frame + (next.frame - kf.frame) / 3 : kf.frame;
    const inX  = prev ? kf.frame - (kf.frame - prev.frame) / 3 : kf.frame;

    return {
      ...kf,
      handleOut: { x: outX, y: kf.value + slope * (outX - kf.frame) },
      handleIn:  { x: inX,  y: kf.value + slope * (inX  - kf.frame) },
    };
  });
}

/** Linear handles (straight lines between keyframes) */
export function linearHandles(kfs: FCurveKeyframe[]): FCurveKeyframe[] {
  return kfs.map((kf, i) => {
    const prev = kfs[i - 1];
    const next = kfs[i + 1];

    const outX = next ? kf.frame + (next.frame - kf.frame) / 3 : kf.frame;
    const outY = next ? kf.value + (next.value - kf.value) / 3 : kf.value;
    const inX  = prev ? kf.frame - (kf.frame - prev.frame) / 3 : kf.frame;
    const inY  = prev ? kf.value - (kf.value - prev.value) / 3 : kf.value;

    return { ...kf, handleOut: { x: outX, y: outY }, handleIn: { x: inX, y: inY } };
  });
}

let _kfId = 0;
export const newKfId = () => `kf_${++_kfId}`;
