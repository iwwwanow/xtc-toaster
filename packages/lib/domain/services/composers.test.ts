import { describe, expect, test } from "bun:test";
import { alphaCompose, addCompose, lchHueCompose } from "./composers";
import { rgbToLab } from "../utils/color-space";

const px = (...values: number[]) => new Uint8ClampedArray(values);

const lab = (data: Uint8ClampedArray) => rgbToLab([data[0] / 255, data[1] / 255, data[2] / 255]);
const labHue = ([, a, b]: [number, number, number]) => Math.atan2(b, a);
const labChroma = ([, a, b]: [number, number, number]) => Math.hypot(a, b);

describe("alphaCompose", () => {
  test("opaque foreground fully replaces background", () => {
    const bg = new Uint8ClampedArray([255, 255, 255, 255]);
    const fg = new Uint8ClampedArray([0, 0, 255, 255]);
    expect([...alphaCompose(bg, fg)]).toEqual([0, 0, 255, 255]);
  });

  test("fully transparent foreground leaves background untouched", () => {
    const bg = new Uint8ClampedArray([10, 20, 30, 255]);
    const fg = new Uint8ClampedArray([255, 255, 255, 0]);
    expect([...alphaCompose(bg, fg)]).toEqual([10, 20, 30, 255]);
  });

  test("half-transparent over half-transparent follows Porter-Duff source-over", () => {
    // αr = αf + αb(1−αf) ≈ 0.752; R = αf/αr ≈ 0.667; B = αb(1−αf)/αr ≈ 0.332
    expect([...alphaCompose(px(0, 0, 255, 128), px(255, 0, 0, 128))]).toEqual([170, 0, 85, 192]);
  });

  test("both layers transparent yield transparent black (no NaN leak)", () => {
    expect([...alphaCompose(px(10, 10, 10, 0), px(20, 20, 20, 0))]).toEqual([0, 0, 0, 0]);
  });

  test("processes every pixel of a multi-pixel buffer", () => {
    const bg = px(255, 255, 255, 255, 0, 0, 0, 255);
    const fg = px(0, 0, 0, 0, 255, 255, 255, 255);
    expect([...alphaCompose(bg, fg)]).toEqual([255, 255, 255, 255, 255, 255, 255, 255]);
  });
});

describe("addCompose", () => {
  test("adds foreground onto background", () => {
    const bg = new Uint8ClampedArray([50, 0, 0, 255]);
    const fg = new Uint8ClampedArray([100, 0, 0, 255]);
    expect([...addCompose(bg, fg)]).toEqual([150, 0, 0, 255]);
  });

  test("clamps sum at 255 per channel", () => {
    const bg = new Uint8ClampedArray([200, 0, 0, 255]);
    const fg = new Uint8ClampedArray([200, 0, 0, 255]);
    expect([...addCompose(bg, fg)]).toEqual([255, 0, 0, 255]);
  });

  test("weights foreground contribution by its own alpha", () => {
    const bg = new Uint8ClampedArray([0, 0, 0, 255]);
    const fg = new Uint8ClampedArray([200, 0, 0, 128]);
    const result = addCompose(bg, fg);
    expect(result[0]).toBe(100); // 200 * (128/255) rounded via Uint8ClampedArray
  });

  test("contract: result is always opaque, background alpha is ignored", () => {
    expect([...addCompose(px(0, 0, 0, 0), px(100, 50, 0, 255))]).toEqual([100, 50, 0, 255]);
  });
});

describe("lchHueCompose", () => {
  const bg = px(180, 120, 100, 255);
  const fg = px(60, 90, 200, 255);

  test("transparent foreground leaves background untouched", () => {
    expect([...lchHueCompose(bg, px(60, 90, 200, 0))]).toEqual([...bg]);
  });

  test("takes hue from the foreground, lightness and chroma from the background", () => {
    const resultLab = lab(lchHueCompose(bg, fg));
    const bgLab = lab(bg);
    // допуски покрывают квантизацию в 8 бит
    expect(resultLab[0]).toBeCloseTo(bgLab[0], 0);
    expect(labChroma(resultLab)).toBeCloseTo(labChroma(bgLab), 0);
    expect(labHue(resultLab)).toBeCloseTo(labHue(lab(fg)), 1);
  });

  test("regression values for an in-gamut pair", () => {
    expect([...lchHueCompose(bg, fg)]).toEqual([130, 130, 181, 255]);
  });

  test("foreground alpha scales the effect strength linearly in RGB", () => {
    expect([...lchHueCompose(bg, px(60, 90, 200, 128))]).toEqual([155, 125, 141, 255]);
  });

  test("keeps background alpha, foreground alpha does not leak into the result", () => {
    expect(lchHueCompose(px(180, 120, 100, 77), fg)[3]).toBe(77);
  });

  test("a gray foreground has no hue and leaves the background alone", () => {
    expect([...lchHueCompose(px(0, 0, 255, 255), px(128, 128, 128, 255))]).toEqual([0, 0, 255, 255]);
  });

  test("a low-chroma foreground applies the hue only partially", () => {
    const bgBlue = px(0, 0, 255, 255);
    const pale = lchHueCompose(bgBlue, px(180, 160, 144, 255)); // beige, chroma ≈ 12
    const vivid = lchHueCompose(bgBlue, px(180, 120, 60, 255)); // same hue family, chroma > 20
    const shift = (out: Uint8ClampedArray) => Math.abs(out[0] - 0) + Math.abs(out[1] - 0) + Math.abs(out[2] - 255);
    expect(shift(pale)).toBeGreaterThan(0);
    expect(shift(pale)).toBeLessThan(shift(vivid));
  });
});
