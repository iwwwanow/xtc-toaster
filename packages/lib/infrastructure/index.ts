export { assembleGif, assembleVideo, loopVideoTo, speedUpVideo } from "./assemble-gif";
export { decodeImage, decodePixels, encodePng, isPngOrJpeg } from "./image-codec";
import { createCanvas, loadImage } from "canvas";
import { writeFile } from "fs/promises";
import type { ImageRawDataArray, LayerDimensions } from "../domain/types";

export async function imageFileToRawData(
  path: string,
  scale: number = 1.0
): Promise<{ data: ImageRawDataArray } & LayerDimensions> {
  const img = await loadImage(path);
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  return { data: data as ImageRawDataArray, width, height };
}

export async function rawDataToImageFile(
  data: ImageRawDataArray,
  dimensions: LayerDimensions,
  outputPath: string
): Promise<void> {
  const canvas = createCanvas(dimensions.width, dimensions.height);
  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(dimensions.width, dimensions.height);
  imageData.data.set(data);
  ctx.putImageData(imageData, 0, 0);
  const buffer = canvas.toBuffer("image/png");
  await writeFile(outputPath, buffer);
}
