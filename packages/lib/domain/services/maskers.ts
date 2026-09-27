import { readPixel } from "../utils/pixel-io";
import { rgbToHsv } from "../utils/color-space";
import type { ImageRawDataArray } from "../types";

const HUE_TOLERANCE = 0.02;
const SATURATION_TOLERANCE = 0.1;
const VALUE_TOLERANCE = 0.1;

/**
 * Extract pixels by HSV component proximity with quadratic falloff.
 * RGB is left untouched — alpha becomes the match weight (0-255).
 */
export const hsvMask = (
  data: ImageRawDataArray,
  componentIndex: 0 | 1 | 2, // 0=hue, 1=saturation, 2=value
  target: number, // normalized 0-1
  tolerance: number, // normalized 0-1, half-width of the selection band
  circular: boolean, // true only for hue — the band wraps around (0 and 360 are neighbors)
): ImageRawDataArray => {
  const scale = componentIndex === 0 ? 360 : 100;
  const output = new Uint8ClampedArray(data.length);

  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = readPixel(data, i);
    const hsv = rgbToHsv([r, g, b]);
    const pixelNorm = hsv[componentIndex] / scale;

    let diff = Math.abs(target - pixelNorm);
    if (circular && diff > 0.5) diff = 1 - diff;

    let alpha = 0;
    if (diff <= tolerance) {
      const t = diff / tolerance;
      alpha = 1 - t * t;
    }

    output[i] = r;
    output[i + 1] = g;
    output[i + 2] = b;
    output[i + 3] = Math.round(alpha * 255);
  }

  return output;
};

export const hueMask = (data: ImageRawDataArray, hue: number, tolerance = HUE_TOLERANCE): ImageRawDataArray =>
  hsvMask(data, 0, hue / 360, tolerance, true);

export const saturationMask = (data: ImageRawDataArray, saturation: number, tolerance = SATURATION_TOLERANCE): ImageRawDataArray =>
  hsvMask(data, 1, saturation / 100, tolerance, false);

export const valueMask = (data: ImageRawDataArray, value: number, tolerance = VALUE_TOLERANCE): ImageRawDataArray =>
  hsvMask(data, 2, value / 100, tolerance, false);
