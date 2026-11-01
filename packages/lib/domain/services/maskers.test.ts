import { describe, expect, test } from "bun:test";
import { selectColor, selectVivid, selectBright, channel } from "./maskers";
import { Channel } from "../types";

const pixel = (r: number, g: number, b: number, a = 255) =>
  new Uint8ClampedArray([r, g, b, a]);

describe("selectColor", () => {
  test("exact hue match yields full alpha, RGB untouched", () => {
    const data = pixel(255, 0, 0); // hue 0
    const result = selectColor(data, 0);
    expect([...result]).toEqual([255, 0, 0, 255]);
  });

  test("opposite hue (wraps circularly) falls outside tolerance", () => {
    const data = pixel(255, 0, 0); // hue 0
    const result = selectColor(data, 180);
    expect(result[3]).toBe(0);
  });

  test("the band wraps around 0°/360° in both directions", () => {
    // hue ≈ 355° vs target 5°, and hue ≈ 5° vs target 355° — 10° apart through 0
    expect(selectColor(pixel(255, 0, 21), 5, 0.05)[3]).toBe(177);
    expect(selectColor(pixel(255, 21, 0), 355, 0.05)[3]).toBe(177);
  });

  test("grays have no hue and are never selected", () => {
    expect(selectColor(pixel(128, 128, 128), 0)[3]).toBe(0);
    expect(selectColor(pixel(255, 255, 255), 0)[3]).toBe(0);
    expect(selectColor(pixel(0, 0, 0), 0)[3]).toBe(0);
  });

  test("the match weight is scaled by saturation (pale colors count partially)", () => {
    // pale red: hue 0, saturation 50% → half of the full match
    expect(selectColor(pixel(255, 128, 128), 0)[3]).toBe(127);
  });
});

describe("selectVivid", () => {
  test("matching saturation yields full alpha", () => {
    const data = pixel(255, 0, 0); // saturation 100
    expect(selectVivid(data, 100)[3]).toBe(255);
  });

  test("far-off saturation yields zero alpha", () => {
    const data = pixel(255, 0, 0);
    expect(selectVivid(data, 0)[3]).toBe(0);
  });

  test("custom tolerance widens the band", () => {
    const data = pixel(255, 128, 128); // saturation ≈ 49.8
    expect(selectVivid(data, 70)[3]).toBe(0); // default tolerance 0.1
    expect(selectVivid(data, 70, 0.4)[3]).toBeGreaterThan(0);
  });
});

describe("selectBright", () => {
  test("matching value yields full alpha", () => {
    const data = pixel(255, 0, 0); // value 100
    expect(selectBright(data, 100)[3]).toBe(255);
  });

  test("far-off value yields zero alpha", () => {
    const data = pixel(255, 0, 0);
    expect(selectBright(data, 0)[3]).toBe(0);
  });

  test("quadratic falloff: halfway to the band edge gives 1 − 0.5² = 0.75", () => {
    // value 40%, target 45%, tolerance 0.1 → diff 0.05 = half-band
    expect(selectBright(pixel(102, 102, 102), 45, 0.1)[3]).toBe(191);
  });

  test("RGB is preserved even where the mask is empty", () => {
    expect([...selectBright(pixel(10, 20, 30, 200), 100)]).toEqual([10, 20, 30, 0]);
  });

  test("input alpha is replaced, not multiplied", () => {
    expect(selectBright(pixel(255, 0, 0, 40), 100)[3]).toBe(255);
  });

  test("tolerance 0 selects exact matches only", () => {
    expect(selectBright(pixel(255, 0, 0), 100, 0)[3]).toBe(255);
    expect(selectBright(pixel(254, 0, 0), 100, 0)[3]).toBe(0);
  });
});

describe("channel", () => {
  test("moves the channel's raw value into alpha and flags RGB by channel", () => {
    const data = pixel(10, 20, 30, 40);
    expect([...channel(data, Channel.Green)]).toEqual([0, 255, 0, 20]);
    expect([...channel(data, Channel.Red)]).toEqual([255, 0, 0, 10]);
    expect([...channel(data, Channel.Blue)]).toEqual([0, 0, 255, 30]);
  });

  test("alpha channel keeps alpha and blanks RGB to black", () => {
    expect([...channel(pixel(10, 20, 30, 40), Channel.Alpha)]).toEqual([0, 0, 0, 40]);
  });
});
