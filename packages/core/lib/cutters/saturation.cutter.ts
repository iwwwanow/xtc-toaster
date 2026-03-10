import { cutHsv } from "./hsv.cutter";

const SATURATION_TOLERANCE = 0.1;

export const cutSaturation = (
  data: Uint8ClampedArray,
  neededSaturation: number,
): Uint8ClampedArray =>
  cutHsv(data, 1, neededSaturation / 100, SATURATION_TOLERANCE, false);
