import type { RgbArray } from "../interfaces";
import type { HexString } from "../interfaces";

export const hexToRgb = (hex: HexString): RgbArray => {
  hex = hex.replace(/^#/, "");

  let r: number, g: number, b: number;

  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else if (hex.length === 6) {
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  } else {
    throw new Error("Invalid HEX color format");
  }

  return [r, g, b];
};
