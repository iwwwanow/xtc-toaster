// Param bounds per node type: zod schemas validate against them, ui sliders use them,
// `initial` is what a node dropped from the menu starts with.
export type ParamBounds = { readonly min: number; readonly max: number; readonly initial: number };

export const PARAMS = {
  hueNoise: {
    deviationCoefficient: { min: 0, max: 1, initial: 0.5 },
  },
  // both in degrees; tolerance is the half-width of the band around hue (180 = the whole wheel)
  hueMask: {
    hue: { min: 0, max: 360, initial: 0 },
    tolerance: { min: 0, max: 180, initial: 30 },
  },
  // angle in degrees, ±90 is edge-on (the plane vanishes) — stop short of it;
  // focalLength in mm, 35 mm equivalent (36 mm across the larger side, like a blender camera):
  // smaller = stronger perspective
  yRotation: {
    angle: { min: -85, max: 85, initial: 30 },
    focalLength: { min: 10, max: 300, initial: 50 },
  },
  // box blur radius in px — the cost grows with it (2 MP: ~0.25 s at 4, ~0.9 s at 20 on the desktop)
  blur: {
    radius: { min: 0, max: 20, initial: 4 },
  },
  // percent; tolerance is the half-width of the band (100 = the whole range)
  saturationMask: {
    saturation: { min: 0, max: 100, initial: 100 },
    tolerance: { min: 0, max: 100, initial: 30 },
  },
  valueMask: {
    value: { min: 0, max: 100, initial: 100 },
    tolerance: { min: 0, max: 100, initial: 30 },
  },
  // percent of the image width / height — a toast shifts any picture alike, like focalLength in mm
  translate: {
    x: { min: -100, max: 100, initial: 10 },
    y: { min: -100, max: 100, initial: 0 },
  },
  // degrees, around the image center
  rotate: {
    angle: { min: -180, max: 180, initial: 15 },
  },
  // factor, around the image center
  scale: {
    x: { min: 0.1, max: 3, initial: 0.75 },
    y: { min: 0.1, max: 3, initial: 0.75 },
  },
} as const satisfies Record<string, Record<string, ParamBounds>>;

// isolateChannel picks one of these — not a range: the ui shows a select, a dropped node starts on the first
export const CHANNELS = ["red", "green", "blue", "alpha"] as const;
