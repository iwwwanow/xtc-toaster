import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { addHueNoise, boxBlur } from "./effects";

const px = (...values: number[]) => new Uint8ClampedArray(values);

describe("boxBlur", () => {
  test("radius 0 returns an equal copy, not the same buffer", () => {
    const data = px(10, 20, 30, 40, 50, 60, 70, 80);
    const result = boxBlur(data, 2, 1, 0);
    expect(result).not.toBe(data);
    expect([...result]).toEqual([...data]);
  });

  test("radius is rounded; below 0.5 and negative radii behave as 0", () => {
    const data = px(0, 0, 0, 255, 255, 255, 255, 255);
    expect([...boxBlur(data, 2, 1, 0.4)]).toEqual([...data]);
    expect([...boxBlur(data, 2, 1, -3)]).toEqual([...data]);
  });

  test("a flat color stays unchanged", () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < data.length; i += 4) data.set([12, 34, 56, 255], i);
    expect([...boxBlur(data, 4, 4, 2)]).toEqual([...data]);
  });

  test("averages only in-bounds neighbours (edges use a smaller window)", () => {
    // 3×1, red channel 0 / 90 / 180, radius 1:
    // x0 = (0+90)/2, x1 = (0+90+180)/3, x2 = (90+180)/2
    const data = px(0, 0, 0, 255, 90, 0, 0, 255, 180, 0, 0, 255);
    const result = boxBlur(data, 3, 1, 1);
    expect([result[0], result[4], result[8]]).toEqual([45, 90, 135]);
  });

  test("blurs vertically as well as horizontally", () => {
    // 1×3 column — only the vertical pass can mix these pixels
    const data = px(0, 0, 0, 255, 90, 0, 0, 255, 180, 0, 0, 255);
    const result = boxBlur(data, 1, 3, 1);
    expect([result[0], result[4], result[8]]).toEqual([45, 90, 135]);
  });

  test("premultiplied: a half-covered edge keeps its color, only alpha drops", () => {
    const result = boxBlur(px(255, 0, 0, 255, 0, 0, 0, 0), 2, 1, 1);
    expect([...result]).toEqual([255, 0, 0, 128, 255, 0, 0, 128]);
  });

  test("premultiplied: a low-alpha pixel barely tints an opaque neighbour", () => {
    // opaque white next to a near-transparent red: straight averaging would give ~(255,128,128)
    const result = boxBlur(px(255, 255, 255, 255, 255, 0, 0, 10), 2, 1, 1);
    expect([result[0], result[1], result[2]]).toEqual([255, 245, 245]);
  });

  test("fully transparent areas stay transparent black", () => {
    const result = boxBlur(new Uint8ClampedArray(3 * 4), 3, 1, 1);
    expect([...result]).toEqual(new Array(12).fill(0));
  });
});

describe("addHueNoise", () => {
  afterEach(() => {
    (Math.random as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  test("rejects deviationCoefficient outside 0..1", () => {
    const data = px(255, 0, 0, 255);
    expect(() => addHueNoise(data, { deviationCoefficient: -0.1 })).toThrow();
    expect(() => addHueNoise(data, { deviationCoefficient: 1.1 })).toThrow();
  });

  test("deviation 0 is an identity for colors, grays and partial alpha", () => {
    const data = px(255, 0, 0, 255, 12, 200, 99, 128, 128, 128, 128, 255, 0, 0, 0, 0);
    const result = addHueNoise(data, { deviationCoefficient: 0 });
    expect([...result]).toEqual([...data]);
  });

  test("shifts hue by +deviation when random() is at its max", () => {
    spyOn(Math, "random").mockReturnValue(1);
    // red (hue 0) + 1/3 turn → green
    const result = addHueNoise(px(255, 0, 0, 255), { deviationCoefficient: 1 / 3 });
    expect([...result]).toEqual([0, 255, 0, 255]);
  });

  test("wraps negative hue shifts around the circle", () => {
    spyOn(Math, "random").mockReturnValue(0);
    // red (hue 0) − 1/3 turn → hue 2/3 → blue
    const result = addHueNoise(px(255, 0, 0, 255), { deviationCoefficient: 1 / 3 });
    expect([...result]).toEqual([0, 0, 255, 255]);
  });

  test("grays have no hue to shift and stay gray", () => {
    spyOn(Math, "random").mockReturnValue(1);
    const result = addHueNoise(px(77, 77, 77, 255), { deviationCoefficient: 0.5 });
    expect([...result]).toEqual([77, 77, 77, 255]);
  });

  test("returns a new buffer and keeps the input intact", () => {
    const data = px(255, 0, 0, 255);
    const result = addHueNoise(data, { deviationCoefficient: 0.2 });
    expect(result).not.toBe(data);
    expect([...data]).toEqual([255, 0, 0, 255]);
  });

  test("alpha is always preserved", () => {
    spyOn(Math, "random").mockReturnValue(1);
    const result = addHueNoise(px(255, 0, 0, 100), { deviationCoefficient: 1 / 3 });
    expect(result[3]).toBe(100);
  });
});
