import type { RgbaArray } from "../interfaces";
import type { ColorValue } from "../interfaces";
import type { HexString } from "../interfaces";

import { hexToRgb } from "./hex-to-rgb.util";

export const hexToRgba = (
  hex: HexString,
  alpha: ColorValue = 255,
): RgbaArray => {
  const RbgArray = hexToRgb(hex);
  return [...RbgArray, alpha];
};
