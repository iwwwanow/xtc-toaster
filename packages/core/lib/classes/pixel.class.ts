import type { Color } from "../interfaces";
import type { NormalColor } from "../interfaces";

export class Pixel {
  c: Color;
  nc: NormalColor;

  constructor(pixelData: Array<number>) {
    const [r, g, b, a] = pixelData;

    this.c = {
      r,
      g,
      b,
      a,
    };

    this.nc = {
      r: r / 255,
      g: g / 255,
      b: b / 255,
      a: a / 255,
    };
  }

  static getDataFromUintArray(
    pixelIndex: number,
    layerData: Uint8ClampedArray,
  ): [number, number, number, number] {
    return [
      layerData[pixelIndex],
      layerData[pixelIndex + 1],
      layerData[pixelIndex + 2],
      layerData[pixelIndex + 3],
    ];
  }
}
