import { readNormalizedPixel } from "../utils/pixel-io";
import { alphaComposing } from "../utils/alpha-composing";
import { rgbToLab, labToRgb } from "../utils/color-space";
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

// Lab-хрома FG, начиная с которой hue-эффект работает в полную силу. Ниже —
// сила плавно падает до 0: у серого FG hue не определён (atan2(0,0) = 0 дал бы
// случайный красно-пурпурный сдвиг), у почти серого — шумный.
// Для ориентира: #00ffdd ≈ 57, бежевый #b4a090 ≈ 12, серо-голубой #a0a8b0 ≈ 5.
const LCH_FULL_EFFECT_CHROMA = 20;

// LCh Hue: берёт Hue из FG, Lightness и Chroma из BG. Сила эффекта = FG opacity ×
// насыщенность FG (см. LCH_FULL_EFFECT_CHROMA).
export const lchHueCompose = (
  bgData: ImageRawDataArray,
  fgData: ImageRawDataArray,
): ImageRawDataArray => {
  const output = new Uint8ClampedArray(bgData.length);

  for (let i = 0; i < bgData.length; i += 4) {
    const [bgR, bgG, bgB, bgA] = readNormalizedPixel(bgData, i);
    const [fgR, fgG, fgB, fgA] = readNormalizedPixel(fgData, i);

    const bgLab = rgbToLab([bgR, bgG, bgB]);
    const fgLab = rgbToLab([fgR, fgG, fgB]);

    const bgChroma = Math.sqrt(bgLab[1] ** 2 + bgLab[2] ** 2);
    const fgChroma = Math.sqrt(fgLab[1] ** 2 + fgLab[2] ** 2);
    const fgHue = Math.atan2(fgLab[2], fgLab[1]);
    const strength = fgA * Math.min(1, fgChroma / LCH_FULL_EFFECT_CHROMA);

    const blended = labToRgb([bgLab[0], bgChroma * Math.cos(fgHue), bgChroma * Math.sin(fgHue)]);

    output[i]     = (strength * blended[0] + (1 - strength) * bgR) * 255;
    output[i + 1] = (strength * blended[1] + (1 - strength) * bgG) * 255;
    output[i + 2] = (strength * blended[2] + (1 - strength) * bgB) * 255;
    output[i + 3] = bgA * 255;
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
