import { cutHsv } from "./hsv.cutter";

const HUE_TOLERANCE = 0.02;

export const cutHue = (
  data: Uint8ClampedArray,
  neededHue: number,
): Uint8ClampedArray => cutHsv(data, 0, neededHue / 360, HUE_TOLERANCE, true);
