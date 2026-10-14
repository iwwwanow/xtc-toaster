// Param bounds per node type: zod schemas validate against them, ui sliders use them,
// `initial` is what a node dropped from the menu starts with.
export type ParamBounds = { readonly min: number; readonly max: number; readonly initial: number };

export const PARAMS = {
  noize: {
    deviationCoefficient: { min: 0, max: 1, initial: 0.5 },
  },
} as const satisfies Record<string, Record<string, ParamBounds>>;
