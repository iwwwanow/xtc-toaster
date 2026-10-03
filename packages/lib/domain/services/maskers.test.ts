import { describe, expect, test } from "bun:test";
import { hueMask, saturationMask, valueMask, isolateChannel } from "./maskers";
import { Channel } from "../types";

const pixel = (r: number, g: number, b: number, a = 255) =>
  new Uint8ClampedArray([r, g, b, a]);

describe("hueMask", () => {
  test("exact hue match yields full alpha, RGB untouched", () => {
    const data = pixel(255, 0, 0); // hue 0
    const result = hueMask(data, 0);
    expect([...result]).toEqual([255, 0, 0, 255]);
  });

  test("opposite hue (wraps circularly) falls outside tolerance", () => {
    const data = pixel(255, 0, 0); // hue 0
    const result = hueMask(data, 180);
    expect(result[3]).toBe(0);
  });

  test("the band wraps around 0°/360° in both directions", () => {
    // hue ≈ 355° vs target 5°, and hue ≈ 5° vs target 355° — 10° apart through 0
    expect(hueMask(pixel(255, 0, 21), 5, 0.05)[3]).toBe(177);
    expect(hueMask(pixel(255, 21, 0), 355, 0.05)[3]).toBe(177);
  });

  // Баг №2: у серых/белых/чёрных hue = 0 по определению → они целиком попадают
  // в маску красного. Ожидание: пиксель без насыщенности не матчится по hue.
  test.failing("grays are not selected by a hue mask", () => {
    expect(hueMask(pixel(128, 128, 128), 0)[3]).toBe(0);
  });
});

describe("saturationMask", () => {
  test("matching saturation yields full alpha", () => {
    const data = pixel(255, 0, 0); // saturation 100
    expect(saturationMask(data, 100)[3]).toBe(255);
  });

  test("far-off saturation yields zero alpha", () => {
    const data = pixel(255, 0, 0);
    expect(saturationMask(data, 0)[3]).toBe(0);
  });

  test("custom tolerance widens the band", () => {
    const data = pixel(255, 128, 128); // saturation ≈ 49.8
    expect(saturationMask(data, 70)[3]).toBe(0); // default tolerance 0.1
    expect(saturationMask(data, 70, 0.4)[3]).toBeGreaterThan(0);
  });
});

describe("valueMask", () => {
  test("matching value yields full alpha", () => {
    const data = pixel(255, 0, 0); // value 100
    expect(valueMask(data, 100)[3]).toBe(255);
  });

  test("far-off value yields zero alpha", () => {
    const data = pixel(255, 0, 0);
    expect(valueMask(data, 0)[3]).toBe(0);
  });

  test("quadratic falloff: halfway to the band edge gives 1 − 0.5² = 0.75", () => {
    // value 40%, target 45%, tolerance 0.1 → diff 0.05 = half-band
    expect(valueMask(pixel(102, 102, 102), 45, 0.1)[3]).toBe(191);
  });

  test("RGB is preserved even where the mask is empty", () => {
    expect([...valueMask(pixel(10, 20, 30, 200), 100)]).toEqual([10, 20, 30, 0]);
  });

  test("input alpha is replaced, not multiplied", () => {
    expect(valueMask(pixel(255, 0, 0, 40), 100)[3]).toBe(255);
  });

  // Баг №3: tolerance 0 → 0/0 = NaN → alpha 0 даже при точном совпадении.
  test.failing("tolerance 0 still selects an exact match", () => {
    expect(valueMask(pixel(255, 0, 0), 100, 0)[3]).toBe(255);
  });
});

describe("isolateChannel", () => {
  test("moves the channel's raw value into alpha and flags RGB by channel", () => {
    const data = pixel(10, 20, 30, 40);
    expect([...isolateChannel(data, Channel.Green)]).toEqual([0, 255, 0, 20]);
    expect([...isolateChannel(data, Channel.Red)]).toEqual([255, 0, 0, 10]);
    expect([...isolateChannel(data, Channel.Blue)]).toEqual([0, 0, 255, 30]);
  });

  test("alpha channel keeps alpha and blanks RGB to black", () => {
    expect([...isolateChannel(pixel(10, 20, 30, 40), Channel.Alpha)]).toEqual([0, 0, 0, 40]);
  });
});
