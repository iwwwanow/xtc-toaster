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
  // degrees, around the image center: x leans the verticals, y the horizontals (±90 would be flat)
  skew: {
    x: { min: -60, max: 60, initial: 15 },
    y: { min: -60, max: 60, initial: 0 },
  },
  // where the picture's corners land, percent of the image width / height; may go past the frame.
  // initial — a slight keystone (the top narrower) so a dropped node shows something
  perspective: {
    topLeftX: { min: -50, max: 150, initial: 10 },
    topLeftY: { min: -50, max: 150, initial: 0 },
    topRightX: { min: -50, max: 150, initial: 90 },
    topRightY: { min: -50, max: 150, initial: 0 },
    bottomRightX: { min: -50, max: 150, initial: 100 },
    bottomRightY: { min: -50, max: 150, initial: 100 },
    bottomLeftX: { min: -50, max: 150, initial: 0 },
    bottomLeftY: { min: -50, max: 150, initial: 100 },
  },
  // 0 — transparent, 1 — as is; several in a row multiply
  opacity: {
    opacity: { min: 0, max: 1, initial: 0.5 },
  },
} as const satisfies Record<string, Record<string, ParamBounds>>;

// isolateChannel picks one of these — not a range: the ui shows a select
export const CHANNELS = ["red", "green", "blue", "alpha"] as const;

// nodes whose params are not ranges — what a node dropped from the menu starts with
export const INITIAL_DATA = {
  isolateChannel: { channel: "red" },
  // identity — a raw matrix has no meaningful "something visible" start
  homography: { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
  fill: { color: "#a4a4a4" },
  tint: { color: "#ff0000" },
} as const;
