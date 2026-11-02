// Buffer-level image codec: the pieces of `canvas` the server (and anything
// without files on disk) needs to decode / encode images. Moved from
// packages/server/src/codec.ts — docs/backlog/2026-10-06_image-codec-into-lib.md.
import { createCanvas, loadImage } from "canvas";
import type { ImageRawDataArray, LayerDimensions } from "../domain/types";

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

// png / jpeg bytes → RGBA; throws if the bytes are not a decodable image
export const decodePixels = async (bytes: Buffer): Promise<{ data: ImageRawDataArray } & LayerDimensions> => {
  const image = await loadImage(bytes);
  const { width, height } = image;
  const ctx = createCanvas(width, height).getContext("2d");
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, width, height);
  return { data: data as ImageRawDataArray, width, height };
};

export const encodePng = (data: ImageRawDataArray, { width, height }: LayerDimensions): Buffer => {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(width, height);
  imageData.data.set(data);
  ctx.putImageData(imageData, 0, 0);
  return canvas.toBuffer("image/png");
};