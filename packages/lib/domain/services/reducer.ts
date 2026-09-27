import { alphaCompose, addCompose } from "./composers.libvips";
import { lchHueCompose } from "./composers";
import type { BlendMode, ImageRawDataArray } from "../types";

// Opacity уже должна быть запечена в alpha-канал до вызова — редьюсер её не читает.
export const mergeLayerData = (
  dataLength: number,
  bgData: ImageRawDataArray,
  fgData: ImageRawDataArray,
  fgBlendMode: BlendMode,
): ImageRawDataArray => {
  if (bgData.length !== dataLength || fgData.length !== dataLength) {
    throw new Error("layer data length mismatch");
  }

  switch (fgBlendMode) {
    case "add":
      return addCompose(bgData, fgData);
    case "lch-hue":
      return lchHueCompose(bgData, fgData);
    case "normal":
    default:
      return alphaCompose(bgData, fgData);
  }
};
