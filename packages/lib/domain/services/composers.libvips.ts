// Заменяется вызовом vips_composite2 при переносе на Zig/libvips (4d) —
// см. docs/specs/lib.spec.md, раздел "Функции — куда переезжает". Портировать
// не нужно, только вызвать биндинг с нужным VipsBlendMode.

import { readNormalizedPixel } from "../utils/pixel-io";
import { alphaComposing } from "../utils/alpha-composing";
import type { ImageRawDataArray } from "../types";

export const alphaCompose = (
  bgData: ImageRawDataArray,
  fgData: ImageRawDataArray,
): ImageRawDataArray => {
  const output = new Uint8ClampedArray(bgData.length);

  for (let i = 0; i < bgData.length; i += 4) {
    const [bgR, bgG, bgB, bgA] = readNormalizedPixel(bgData, i);
    const [fgR, fgG, fgB, fgA] = readNormalizedPixel(fgData, i);

    const resultAlpha = fgA + bgA * (1 - fgA);

    output[i] = alphaComposing(fgR, fgA, bgR, bgA, resultAlpha) * 255;
    output[i + 1] = alphaComposing(fgG, fgA, bgG, bgA, resultAlpha) * 255;
    output[i + 2] = alphaComposing(fgB, fgA, bgB, bgA, resultAlpha) * 255;
    output[i + 3] = resultAlpha * 255;
  }

  return output;
};

export const addCompose = (
  bgData: ImageRawDataArray,
  fgData: ImageRawDataArray,
): ImageRawDataArray => {
  const output = new Uint8ClampedArray(bgData.length);

  for (let i = 0; i < bgData.length; i += 4) {
    const [bgR, bgG, bgB] = readNormalizedPixel(bgData, i);
    const [fgR, fgG, fgB, fgA] = readNormalizedPixel(fgData, i);

    output[i] = Math.min(1, bgR + fgR * fgA) * 255;
    output[i + 1] = Math.min(1, bgG + fgG * fgA) * 255;
    output[i + 2] = Math.min(1, bgB + fgB * fgA) * 255;
    output[i + 3] = 255;
  }

  return output;
};
