import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createCanvas } from "canvas";
import { resolve } from "node:path";
import { imageFileToRawData, rawDataToImageFile } from "../infrastructure";
import type { ImageRawDataArray, LayerDimensions } from "../domain/types";

export const FIXTURE_PATH = resolve(import.meta.dirname, "fixtures/poppies.jpg");

// gitignored; every run wipes its own subdirectory first, so results always reflect the latest run
export const OUTPUT_ROOT = resolve(import.meta.dirname, "output");

export const resetOutputDir = async (name: string): Promise<string> => {
  const dir = resolve(OUTPUT_ROOT, name);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  return dir;
};

export const loadFixture = () => imageFileToRawData(FIXTURE_PATH);

export const savePng = (dir: string, name: string, data: ImageRawDataArray, dimensions: LayerDimensions) =>
  rawDataToImageFile(data, dimensions, resolve(dir, `${name}.png`));

export const sha256 = (data: ImageRawDataArray): string =>
  createHash("sha256").update(data).digest("hex");

export const alphaChannel = (data: ImageRawDataArray): number[] =>
  [...data].filter((_, i) => i % 4 === 3);

// All results on one sheet: checkerboard under each tile so transparency is
// visible (a plain viewer shows it as black or white and hides mask edges).
export const writeContactSheet = async (
  dir: string,
  entries: Array<{ name: string; data: ImageRawDataArray }>,
  { width, height }: LayerDimensions,
  columns = 7,
): Promise<void> => {
  const labelHeight = 18;
  const rows = Math.ceil(entries.length / columns);
  const sheet = createCanvas(columns * width, rows * (height + labelHeight));
  const ctx = sheet.getContext("2d");
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, sheet.width, sheet.height);

  const tile = createCanvas(width, height);
  const tileCtx = tile.getContext("2d");

  entries.forEach(({ name, data }, index) => {
    const x = (index % columns) * width;
    const y = Math.floor(index / columns) * (height + labelHeight);

    const cell = 8;
    for (let cy = 0; cy < height; cy += cell) {
      for (let cx = 0; cx < width; cx += cell) {
        ctx.fillStyle = ((cx + cy) / cell) % 2 === 0 ? "#bbb" : "#888";
        ctx.fillRect(x + cx, y + labelHeight + cy, Math.min(cell, width - cx), Math.min(cell, height - cy));
      }
    }

    const imageData = tileCtx.createImageData(width, height);
    imageData.data.set(data);
    tileCtx.putImageData(imageData, 0, 0);
    ctx.drawImage(tile, x, y + labelHeight);

    ctx.fillStyle = "#eee";
    ctx.font = "12px sans-serif";
    ctx.fillText(name, x + 4, y + 13, width - 8);
  });

  await writeFile(resolve(dir, "_contact-sheet.png"), sheet.toBuffer("image/png"));
};

// share of bytes that differ — a cheap "did the filter do anything" check
export const changedRatio = (a: ImageRawDataArray, b: ImageRawDataArray): number => {
  let changed = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) changed++;
  return changed / a.length;
};
