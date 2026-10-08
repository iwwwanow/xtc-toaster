// Temporary: the server talks to canvas directly because lib only has
// file-based codec functions. Everything canvas-related lives here so it can
// move into lib in one piece — docs/backlog/2026-10-06_image-codec-into-lib.md
import { createCanvas, loadImage } from "canvas";
import type { ImageRawDataArray, LayerDimensions } from "@xtc-toaster/lib";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

const startsWith = (bytes: Uint8Array, signature: number[]) =>
  signature.every((byte, i) => bytes[i] === byte);

// canvas also decodes gif / svg — only png and jpeg are allowed
export const isPngOrJpeg = (bytes: Uint8Array): boolean =>
  startsWith(bytes, PNG_SIGNATURE) || startsWith(bytes, JPEG_SIGNATURE);

// throws if the bytes are not a decodable image
export const decodeImage = async (bytes: Buffer): Promise<LayerDimensions> => {
  const image = await loadImage(bytes);
  return { width: image.width, height: image.height };
};

export const encodePng = (data: ImageRawDataArray, { width, height }: LayerDimensions): Buffer => {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(width, height);
  imageData.data.set(data);
  ctx.putImageData(imageData, 0, 0);
  return canvas.toBuffer("image/png");
};
