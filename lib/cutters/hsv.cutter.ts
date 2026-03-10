import { rgbToHsv } from "../utils";
import { Pixel } from "../classes";

/**
 * Extract pixels by HSV component proximity with quadratic falloff.
 * @param componentIndex - 0=hue, 1=saturation, 2=value
 * @param target - normalized 0–1
 * @param tolerance - normalized 0–1, half-width of the selection band
 * @param circular - whether the component wraps around (true for hue only)
 */
export const cutHsv = (
  data: Uint8ClampedArray,
  componentIndex: 0 | 1 | 2,
  target: number,
  tolerance: number,
  circular: boolean,
): Uint8ClampedArray => {
  const scale = componentIndex === 0 ? 360 : 100;
  const output = new Uint8ClampedArray(data.length);

  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = Pixel.getDataFromUintArray(i, data);
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
