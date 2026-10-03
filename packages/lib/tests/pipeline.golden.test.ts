// Golden-тест всего пайплайна: рецепт toast-1 (packages/toasts/.../toast-1_degas)
// на poppies.jpg. Хэш кадра сверяется со снапшотом в __snapshots__ — любое
// изменение математики (оптимизация hot loops, порт на Skia) его сломает.
//
// Если снапшот разошёлся:
// - сначала смотреть хэш входа: поменялся он — сменился JPEG-декодер (node-canvas/
//   libjpeg), а не наша математика;
// - намеренное изменение → глазами сравнить tests/output/pipeline/*.png и
//   обновить: `bun test --update-snapshots tests/pipeline.golden.test.ts`.
// Рецепт скопирован, а не импортирован: toast-1 — CLI-скрипт с top-level
// side effects. Расходится с тостом — обновить копию.
import { beforeAll, describe, expect, test } from "bun:test";
import { Color, Composition } from "../domain";
import type { ImageRawDataArray, LayerDimensions, Quad } from "../domain/types";
import { loadFixture, resetOutputDir, savePng, sha256 } from "./helpers";

let source: ImageRawDataArray;
let dims: LayerDimensions;
let outDir: string;

beforeAll(async () => {
  const fixture = await loadFixture();
  source = fixture.data;
  dims = { width: fixture.width, height: fixture.height };
  outDir = await resetOutputDir("pipeline");
});

const buildToast1Frame = (frame: number): ImageRawDataArray => {
  const { width, height } = dims;

  const getTransformCorners = (gapModifier: number): Quad => {
    const widthGap = (0.33 / 3) * width * gapModifier;
    const heightGap = (0.33 / 3) * height * gapModifier;
    return [
      { x: 0 + 2 * widthGap, y: 0 + 2 * heightGap },
      { x: width - 3 * widthGap, y: 0 + 3 * heightGap },
      { x: width - widthGap, y: height - heightGap },
      { x: 0, y: height },
    ];
  };
  const getBlurRadius = (blurModifier: number) => Math.round((width * blurModifier) / 100);
  const getTransformParams = ({ tx, ty }: { tx: number; ty: number }) => ({
    tx: Math.round(tx * width * 0.01),
    ty: Math.round(ty * height * 0.01),
  });

  const comp = new Composition(width, height);

  comp.createBlankLayer().fill(Color.fromHex("#a4a4a4"));

  const blurred = comp.createLayerFromPixelData(new Uint8ClampedArray(source));
  blurred.applyEffect({ name: "blur", options: { radius: getBlurRadius(0.48) } });
  blurred.setOpacity(0.8);

  const lightGray = comp.createBlankLayer();
  lightGray.fill(Color.fromHex("#ebebeb"));
  lightGray.setOpacity(0.6);

  const blueBg = comp.createBlankLayer();
  blueBg.fill(Color.fromHex("#00ffdd"));
  blueBg.setOpacity(0.8);
  blueBg.setBlendMode("lch-hue");

  const purple = comp.createLayerFromPixelData(new Uint8ClampedArray(source));
  purple.mask({ name: "value", value: 16, tolerance: 0.32 });
  purple.tint(Color.fromHex("#FF00FF"));
  purple.applyEffect({ name: "blur", options: { radius: getBlurRadius(0.24) } });
  purple.setOpacity(0.6);
  purple.setTransform({ name: "perspective", params: { corners: getTransformCorners(-0.2 * frame) } });
  purple.setTransform({ name: "translate", params: getTransformParams({ tx: 2 * frame, ty: -2 * frame }) });

  const red = comp.createLayerFromPixelData(new Uint8ClampedArray(source));
  red.mask({ name: "value", value: 12, tolerance: 0.24 });
  red.tint(Color.fromHex("#FF0000"));
  red.applyEffect({ name: "blur", options: { radius: getBlurRadius(0.1) } });
  red.setOpacity(0.8);
  red.setTransform({ name: "perspective", params: { corners: getTransformCorners(-0.1 * frame) } });
  red.setTransform({ name: "translate", params: getTransformParams({ tx: 1 * frame, ty: -1 * frame }) });

  const white = comp.createLayerFromPixelData(new Uint8ClampedArray(source));
  white.mask({ name: "value", value: 92, tolerance: 0.16 });
  white.tint(Color.fromHex("#FFFFFF"));
  white.setTransform({ name: "perspective", params: { corners: getTransformCorners(-0.05 * frame) } });
  white.setTransform({ name: "translate", params: getTransformParams({ tx: 1 * frame, ty: -1 * frame }) });

  return comp.render();
};

describe("toast-1 pipeline on poppies.jpg", () => {
  test("decoded input is stable (guards the JPEG decoder, not our math)", () => {
    expect(`${dims.width}x${dims.height}`).toBe("250x359");
    expect(sha256(source)).toMatchSnapshot();
  });

  // toast-1 passes t = i / FRAMES ∈ [0, 1) as `frame`
  for (const t of [0, 0.5, 0.95]) {
    test(`frame t=${t} matches the golden hash`, async () => {
      const frame = buildToast1Frame(t);
      await savePng(outDir, `toast-1_t${t}`, frame, dims);
      expect(sha256(frame)).toMatchSnapshot();
    });
  }

  test("rendering is deterministic (no randomness in the toast-1 recipe)", () => {
    expect(sha256(buildToast1Frame(0.5))).toBe(sha256(buildToast1Frame(0.5)));
  });
});
