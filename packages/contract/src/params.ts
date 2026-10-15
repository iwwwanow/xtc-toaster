// Param bounds per node type: zod schemas validate against them, ui sliders use them,
// `initial` is what a node dropped from the menu starts with.
export type ParamBounds = { readonly min: number; readonly max: number; readonly initial: number };

export const PARAMS = {
  noize: {
    deviationCoefficient: { min: 0, max: 1, initial: 0.5 },
  },
  // both in degrees; tolerance is the half-width of the band around hue (180 = the whole wheel)
  hueMask: {
    hue: { min: 0, max: 360, initial: 0 },
    tolerance: { min: 0, max: 180, initial: 30 },
  },
} as const satisfies Record<string, Record<string, ParamBounds>>;
