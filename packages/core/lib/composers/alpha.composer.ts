import { Pixel } from "../classes";
import { alphaComposing } from "../math";
import type { NormalColor } from "../interfaces";

const getResultAlpha = (bgNormalAlpha: number, fgNormalAlpha: number) => {
  const resultAlpha = fgNormalAlpha + bgNormalAlpha * (1 - fgNormalAlpha);
  return resultAlpha;
};

const getResultColors = (
  bgPixel: Pixel,
  fgPixel: Pixel,
  resultAlpha: number,
) => {
  const getResultColor = (
    bgPixel: Pixel,
    fgPixel: Pixel,
    color: keyof NormalColor,
    resultAlpha: number,
  ) => {
    return alphaComposing(
      fgPixel.nc[color],
      fgPixel.nc.a,
      bgPixel.nc[color],
      bgPixel.nc.a,
      resultAlpha,
    );
  };

  const redResult = getResultColor(bgPixel, fgPixel, "r", resultAlpha);
  const greenResult = getResultColor(bgPixel, fgPixel, "g", resultAlpha);
  const blueResult = getResultColor(bgPixel, fgPixel, "b", resultAlpha);

  return [redResult, greenResult, blueResult];
};

export const alphaCompose = (
  bgLayerData: Uint8ClampedArray,
  fgLayerData: Uint8ClampedArray,
) => {
  let output = new Array(bgLayerData.length);

  for (let pixelIndex = 0; pixelIndex < bgLayerData.length; pixelIndex += 4) {
    const bgPixelData = Pixel.getDataFromUintArray(pixelIndex, bgLayerData);
    const fgPixelData = Pixel.getDataFromUintArray(pixelIndex, fgLayerData);

    const bgPixel = new Pixel(bgPixelData);
    const fgPixel = new Pixel(fgPixelData);

    const resultNormalAlpha = getResultAlpha(fgPixel.nc.a, bgPixel.nc.a);

    const resultNormalColors = getResultColors(
      bgPixel,
      fgPixel,
      resultNormalAlpha,
    );

    const resultNormalPixel = [...resultNormalColors, resultNormalAlpha];
    const resultPixel = resultNormalPixel.map((c) => c * 255);

    output.splice(pixelIndex, 4, ...resultPixel);
  }

  return new Uint8ClampedArray(output);
};
