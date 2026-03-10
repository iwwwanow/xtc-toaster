import { cutHsv } from "./hsv.cutter";

const VALUE_TOLERANCE = 0.1;

export const cutValue = (
  data: Uint8ClampedArray,
  neededValue: number,
): Uint8ClampedArray =>
  cutHsv(data, 2, neededValue / 100, VALUE_TOLERANCE, false);
