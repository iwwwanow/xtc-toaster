import type { ParamBounds } from "@xtc-toaster/contract";

// the drag field (nodes/Slider.svelte), like blender's number field: drag, arrows, click to type

// past this many px of movement a press is a drag, not a click (a click opens the text input)
export const DRAG_THRESHOLD = 3;
// shift held while dragging — this much slower
export const SLOW = 0.1;

const clamp = (value: number, { min, max }: ParamBounds) => Math.min(max, Math.max(min, value));

const decimalsOf = (step: number) => Math.max(0, -Math.floor(Math.log10(step)));

// on the step grid from min, within the bounds; toFixed drops the float noise (0.1 + 0.2)
export const snap = (value: number, bounds: ParamBounds, step: number) =>
  Number(clamp(bounds.min + Math.round((value - bounds.min) / step) * step, bounds).toFixed(decimalsOf(step)));

// the field's whole width is the whole range; dx in screen px — the width is measured on screen too
export const dragDelta = (dx: number, width: number, bounds: ParamBounds, slow: boolean) =>
  ((dx / width) * (bounds.max - bounds.min)) * (slow ? SLOW : 1);

// a typed value is taken as is (only clamped) — finer than the step is the point of typing it;
// "1,5" works too; anything unparsable → null, the old value stays
export const parseTyped = (text: string, bounds: ParamBounds): number | null => {
  const value = Number(text.trim().replace(",", "."));
  return text.trim() === "" || !Number.isFinite(value) ? null : clamp(value, bounds);
};

// the step's decimals; a typed value finer than that shows up to 4 decimals instead of a rounded lie
export const formatValue = (value: number, step: number) => {
  const fixed = value.toFixed(decimalsOf(step));
  return Number(fixed) === value ? fixed : String(Number(value.toFixed(4)));
};

// where the value sits in the range, 0–100 — the field's fill
export const fillPercent = (value: number, { min, max }: ParamBounds) => ((value - min) / (max - min)) * 100;
