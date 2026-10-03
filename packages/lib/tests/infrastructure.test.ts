// Интеграционные тесты infrastructure: декод/энкод через node-canvas и
// ffmpeg-обвязка. Результаты (gif/mp4) — в tests/output/infrastructure/,
// перезаписываются при каждом прогоне. Без ffmpeg/ffprobe в PATH ffmpeg-часть пропускается.
import { beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  assembleGif,
  assembleVideo,
  imageFileToRawData,
  loopVideoTo,
  rawDataToImageFile,
  speedUpVideo,
} from "../infrastructure";
import { addHueNoise } from "../domain/services";
import type { ImageRawDataArray } from "../domain/types";
import { FIXTURE_PATH, alphaChannel, resetOutputDir } from "./helpers";

const hasFfmpeg =
  spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;

type Probe = { width: number; height: number; frames: number; duration: number };

const probe = (path: string): Probe => {
  const result = spawnSync("ffprobe", [
    "-v", "error",
    "-count_frames",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height,nb_read_frames:format=duration",
    "-of", "json",
    path,
  ]);
  const json = JSON.parse(result.stdout.toString());
  const stream = json.streams[0];
  return {
    width: stream.width,
    height: stream.height,
    frames: Number(stream.nb_read_frames),
    duration: Number(json.format.duration),
  };
};

let outDir: string;

beforeAll(async () => {
  outDir = await resetOutputDir("infrastructure");
});

describe("imageFileToRawData", () => {
  test("decodes the fixture to RGBA at its native size", async () => {
    const { data, width, height } = await imageFileToRawData(FIXTURE_PATH);
    expect([width, height]).toEqual([250, 359]);
    expect(data.length).toBe(250 * 359 * 4);
    expect(alphaChannel(data).every((a) => a === 255)).toBe(true); // JPEG has no alpha
  });

  test("scale resizes with rounding", async () => {
    const { data, width, height } = await imageFileToRawData(FIXTURE_PATH, 0.5);
    expect([width, height]).toEqual([125, 180]); // 359 · 0.5 = 179.5 → 180
    expect(data.length).toBe(125 * 180 * 4);
  });

  test("a missing file rejects", async () => {
    expect(imageFileToRawData(resolve(outDir, "nope.jpg"))).rejects.toThrow();
  });
});

describe("rawDataToImageFile", () => {
  test("opaque pixels round-trip through PNG losslessly", async () => {
    const { data, width, height } = await imageFileToRawData(FIXTURE_PATH);
    const path = resolve(outDir, "roundtrip.png");
    await rawDataToImageFile(data, { width, height }, path);
    const back = await imageFileToRawData(path);
    expect([back.width, back.height]).toEqual([width, height]);
    expect(Buffer.compare(Buffer.from(back.data), Buffer.from(data))).toBe(0);
  });

  test("fully transparent pixels stay transparent", async () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]);
    const path = resolve(outDir, "transparent.png");
    await rawDataToImageFile(data, { width: 2, height: 1 }, path);
    const back = await imageFileToRawData(path);
    expect([...back.data]).toEqual([255, 0, 0, 255, 0, 0, 0, 0]);
  });

  // node-canvas хранит пиксели premultiplied — полупрозрачные цвета теряют
  // точность при записи/чтении. Фиксируем, что потеря есть, но небольшая.
  test("semi-transparent colors survive within premultiplication error", async () => {
    const data = new Uint8ClampedArray([200, 100, 50, 30]);
    const path = resolve(outDir, "semi-transparent.png");
    await rawDataToImageFile(data, { width: 1, height: 1 }, path);
    const back = await imageFileToRawData(path);
    expect(back.data[3]).toBe(30);
    [0, 1, 2].forEach((i) => expect(Math.abs(back.data[i] - data[i])).toBeLessThanOrEqual(8));
  });
});

describe.skipIf(!hasFfmpeg)("ffmpeg assembly", () => {
  // 6 кадров hue-noise по фикстуре в половинном размере — видно глазами, что кадры разные
  let frames: ImageRawDataArray[];
  let width: number;
  let height: number;

  beforeAll(async () => {
    const fixture = await imageFileToRawData(FIXTURE_PATH, 0.5);
    width = fixture.width;
    height = fixture.height;
    frames = Array.from({ length: 6 }, (_, i) =>
      addHueNoise(fixture.data, { deviationCoefficient: i * 0.05 }),
    );
  });

  test("assembleGif writes every frame at the source size", async () => {
    const path = resolve(outDir, "noise.gif");
    await assembleGif(frames, width, height, 6, path);
    expect(probe(path)).toMatchObject({ width, height, frames: 6 });
  });

  test("assembleVideo pads odd dimensions to even for libx264", async () => {
    const path = resolve(outDir, "noise.mp4");
    await assembleVideo(frames, width, height, 6, path); // 125×180 → 126×180
    const info = probe(path);
    expect([info.width, info.height]).toEqual([126, 180]);
    expect(info.frames).toBe(6);
    expect(info.duration).toBeCloseTo(1, 1);
  });

  test("loopVideoTo repeats the clip and cuts exactly at the target length", async () => {
    const path = resolve(outDir, "noise_looped-3s.mp4");
    await loopVideoTo(resolve(outDir, "noise.mp4"), 3, path);
    const info = probe(path);
    expect(info.frames).toBe(18); // 3 s · 6 fps
    expect(info.duration).toBeCloseTo(3, 2);
  });

  test("speedUpVideo divides the duration by the speed factor, keeping the frame rate", async () => {
    const path = resolve(outDir, "noise_looped_x2.mp4");
    await speedUpVideo(resolve(outDir, "noise_looped-3s.mp4"), 2, path);
    const info = probe(path);
    expect(info.frames).toBe(9); // every other frame of 18, still 6 fps
    expect(info.duration).toBeCloseTo(1.5, 2);
  });

  test("ffmpeg failures reject with its stderr", async () => {
    expect(loopVideoTo(resolve(outDir, "missing.mp4"), 1, resolve(outDir, "never.mp4"))).rejects.toThrow(/ffmpeg exited/);
  });
});
