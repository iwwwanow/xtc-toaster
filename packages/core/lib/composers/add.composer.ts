import { Pixel } from "../classes";

export const addCompose = (
  bgLayerData: Uint8ClampedArray,
  fgLayerData: Uint8ClampedArray,
) => {
  let output = new Array(bgLayerData.length);

  for (let pixelIndex = 0; pixelIndex < bgLayerData.length; pixelIndex += 4) {
    const bgPixelData = Pixel.getDataFromUintArray(pixelIndex, bgLayerData);
    const fgPixelData = Pixel.getDataFromUintArray(pixelIndex, fgLayerData);

    const bgPixel = new Pixel(bgPixelData);
    const fgPixel = new Pixel(fgPixelData);

    const resultRedPixel = Math.min(
      1.0,
      bgPixel.nc.r + fgPixel.nc.r * fgPixel.nc.a,
    );
    const resultGreenPixel = Math.min(
      1.0,
      bgPixel.nc.g + fgPixel.nc.g * fgPixel.nc.a,
    );
    const resultBluePixel = Math.min(
      1.0,
      bgPixel.nc.b + fgPixel.nc.b * fgPixel.nc.a,
    );

    const resultNormalPixel = [
      resultRedPixel,
      resultGreenPixel,
      resultBluePixel,
      255,
    ];
    const resultPixel = resultNormalPixel.map((c) => c * 255);

    output.splice(pixelIndex, 4, ...resultPixel);
  }

  return new Uint8ClampedArray(output);
};
