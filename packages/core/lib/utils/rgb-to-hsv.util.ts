import type { RgbArray } from "../interfaces";
import type { HsvArray } from "../interfaces";
import type { HueValue } from "../interfaces";
import type { SaturationValue } from "../interfaces";
import type { ValueValue } from "../interfaces";

export const rgbToHsv = ([r, g, b]: RgbArray): HsvArray => {
  const normalizedR = r / 255;
  const normalizedG = g / 255;
  const normalizedBlue = b / 255;

  const max = Math.max(normalizedR, normalizedG, normalizedBlue);
  const min = Math.min(normalizedR, normalizedG, normalizedBlue);

  let hue: HueValue = 0;
  let saturation: SaturationValue;
  let value: ValueValue = max;

  const d = max - min;

  saturation = max === 0 ? 0 : d / max;

  if (max === min) {
    hue = 0; // Achromatic
  } else {
    switch (max) {
      case normalizedR:
        hue =
          (normalizedG - normalizedBlue) / d +
          (normalizedG < normalizedBlue ? 6 : 0);
        break;
      case normalizedG:
        hue = (normalizedBlue - normalizedR) / d + 2;
        break;
      case normalizedBlue:
        hue = (normalizedR - normalizedG) / d + 4;
        break;
    }

    hue /= 6;
  }

  return [hue * 360, saturation * 100, value * 100];
};
