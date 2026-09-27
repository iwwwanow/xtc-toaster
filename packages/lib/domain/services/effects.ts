import { readNormalizedPixel } from "../utils/pixel-io";
import { rgbToHsl, hslToRgb } from "../utils/color-space";
import type { ImageRawDataArray } from "../types";

type HueNoiseOptions = { deviationCoefficient: number; preserveAlpha: boolean };

export const addHueNoise = (
  data: ImageRawDataArray,
  options: HueNoiseOptions,
): ImageRawDataArray => {
  const { deviationCoefficient, preserveAlpha } = options;

  if (deviationCoefficient < 0 || deviationCoefficient > 1) {
    throw new Error("deviationCoefficient должен быть в диапазоне 0-1");
  }

  const output = new Uint8ClampedArray(data.length);

  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = readNormalizedPixel(data, i);
    let [h, s, l] = rgbToHsl([r, g, b]);

    const noise = (Math.random() * 2 - 1) * deviationCoefficient;
    h = (h + noise) % 1.0;
    if (h < 0) h += 1.0;

    const [newR, newG, newB] = hslToRgb([h, s, l]);

    output[i] = newR * 255;
    output[i + 1] = newG * 255;
    output[i + 2] = newB * 255;
    output[i + 3] = preserveAlpha ? a * 255 : data[i + 3];
  }

  return output;
};
