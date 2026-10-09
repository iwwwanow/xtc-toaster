import { parseArgs } from "util";
import { resolve, basename, extname } from "path";
import { mkdtemp, mkdir } from "fs/promises";
import { tmpdir } from "os";
import {
  Composition,
  imageFileToRawData,
  rawDataToImageFile,
  assembleVideo,
  loopVideoTo,
} from "@xtc-toaster/lib";
import { Color } from "@xtc-toaster/lib";
import type { ImageRawDataArray, Quad } from "@xtc-toaster/lib";

const SCALE = 1.0;
const FPS = 36;
const FRAMES = 24;
const TARGET_DURATION = 15;

const clipDuration = FRAMES / FPS;
const cycles = Math.round(TARGET_DURATION / clipDuration);
const exactDuration = cycles * clipDuration;

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    input: { type: "string", short: "i" },
  },
});

const inputPath =
  values.input ?? resolve(import.meta.dirname, "assets/degas-076.jpg");

const now = new Date();
const datePart =
  now.getFullYear().toString() +
  String(now.getMonth() + 1).padStart(2, "0") +
  String(now.getDate()).padStart(2, "0");
const timePart =
  String(now.getHours()).padStart(2, "0") +
  String(now.getMinutes()).padStart(2, "0") +
  String(now.getSeconds()).padStart(2, "0");
const inputStem = basename(inputPath, extname(inputPath));
// TODO: project naming is `<toast>_<YYYYMMDD-HHmmss>.<ext>` (CLAUDE.md) — rename to toast-1_degas_…,
// decide whether to keep the input stem as a suffix — docs/backlog/2026-10-09_degas-output-naming.md
const slug = `degas_${datePart}-${timePart}_${inputStem}`;

const seqDir = await mkdtemp(resolve(tmpdir(), `${slug}_frames_`));
const rawVideoPath = resolve(tmpdir(), `${slug}.mp4`);

const outDir = resolve(process.cwd(), "baked");
const outPath = resolve(outDir, `${slug}.mp4`);

await mkdir(outDir, { recursive: true });

console.log(`[toast-1/degas] input=${inputPath}`);

const { data, width, height } = await imageFileToRawData(inputPath, SCALE);

console.log(`[toast-1/degas] render size: ${width}×${height}`);

const getTransformCorners = (gapModifier: number = 0.1): Quad => {
  const widthGapBase = (0.33 / 3) * width;
  const heightGapBase = (0.33 / 3) * height;
  const widthGap = widthGapBase * gapModifier;
  const heightGap = heightGapBase * gapModifier;
  return [
    { x: 0 + 2 * widthGap, y: 0 + 2 * heightGap },
    { x: width - 3 * widthGap, y: 0 + 3 * heightGap },
    { x: width - widthGap, y: height - heightGap },
    { x: 0, y: height },
  ];
};

const getBlurRadius = (blurModifier: number): number =>
  Math.round((width * blurModifier) / 100);

const getTransformParams = ({ tx, ty }: { tx: number; ty: number }) => ({
  tx: Math.round(tx * width * 0.01),
  ty: Math.round(ty * height * 0.01),
});

const darkGrayColor = Color.fromHex("#a4a4a4");
const lightGrayColor = Color.fromHex("#ebebeb");
const blueColor = Color.fromHex("#00ffdd");

const buildFrame = (frame: number): ImageRawDataArray => {
  const comp = new Composition(width, height);

  const bg = comp.createBlankLayer();
  bg.fill(darkGrayColor);

  const blurred = comp.createLayerFromPixelData(data);
  blurred.applyEffect({
    name: "blur",
    options: { radius: getBlurRadius(0.48) },
  });
  blurred.setOpacity(0.8);

  const lightGray = comp.createBlankLayer();
  lightGray.fill(lightGrayColor);
  lightGray.setOpacity(0.6);

  const blueBg = comp.createBlankLayer();
  blueBg.fill(blueColor);
  blueBg.setOpacity(0.8);
  blueBg.setBlendMode("lch-hue");

  const purple = comp.createLayerFromPixelData(data);
  purple.mask({ name: "value", value: 16, tolerance: 0.32 });
  purple.tint(Color.fromHex("#FF00FF"));
  purple.applyEffect({
    name: "blur",
    options: { radius: getBlurRadius(0.24) },
  });
  purple.setOpacity(0.6);
  purple.setTransform({
    name: "perspective",
    params: { corners: getTransformCorners(-0.2 * frame) },
  });
  purple.setTransform({
    name: "translate",
    params: getTransformParams({ tx: 2 * frame, ty: -2 * frame }),
  });

  const red = comp.createLayerFromPixelData(data);
  red.mask({ name: "value", value: 12, tolerance: 0.24 });
  red.tint(Color.fromHex("#FF0000"));
  red.applyEffect({ name: "blur", options: { radius: getBlurRadius(0.1) } });
  red.setOpacity(0.8);
  red.setTransform({
    name: "perspective",
    params: { corners: getTransformCorners(-0.1 * frame) },
  });
  red.setTransform({
    name: "translate",
    params: getTransformParams({ tx: 1 * frame, ty: -1 * frame }),
  });

  const white = comp.createLayerFromPixelData(data);
  white.mask({ name: "value", value: 92, tolerance: 0.16 });
  white.tint(Color.fromHex("#FFFFFF"));
  white.setTransform({
    name: "perspective",
    params: { corners: getTransformCorners(-0.05 * frame) },
  });
  white.setTransform({
    name: "translate",
    params: getTransformParams({ tx: 1 * frame, ty: -1 * frame }),
  });

  return comp.render();
};

const renderedFrames: ImageRawDataArray[] = [];

for (let i = 0; i < FRAMES; i++) {
  const t = i / FRAMES;
  console.log(`[toast-1/degas] frame ${i + 1}/${FRAMES} (t=${t.toFixed(2)})`);

  const rendered = buildFrame(t);
  renderedFrames.push(rendered);

  const framePath = resolve(seqDir, `frame_${String(i).padStart(4, "0")}.png`);
  await rawDataToImageFile(rendered, { width, height }, framePath);
}

console.log(`[toast-1/degas] assembling mp4 → ${rawVideoPath}`);
await assembleVideo(renderedFrames, width, height, FPS, rawVideoPath);

console.log(
  `[toast-1/degas] looping ${cycles} cycles (${exactDuration.toFixed(2)}s) → ${outPath}`,
);
await loopVideoTo(rawVideoPath, exactDuration, outPath);

console.log("[toast-1/degas] done →", outPath);
