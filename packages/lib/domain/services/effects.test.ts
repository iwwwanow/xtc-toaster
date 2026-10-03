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

  test("current behavior: transparent black bleeds into color (straight alpha)", () => {
    const result = boxBlur(px(255, 0, 0, 255, 0, 0, 0, 0), 2, 1, 1);
    expect([...result]).toEqual([128, 0, 0, 128, 128, 0, 0, 128]);
  });

  // Баг-кандидат №6 (docs/backlog/2026-10-03_lib-test-audit.md): без premultiplied
  // alpha прозрачный чёрный затемняет цвет на краях маски. Ожидание — красный
  // остаётся красным, меняется только alpha.
  test.failing("premultiplied blur keeps the color of a half-covered edge", () => {
    const result = boxBlur(px(255, 0, 0, 255, 0, 0, 0, 0), 2, 1, 1);
    expect(result[0]).toBe(255);
  });
});

describe("addHueNoise", () => {
  afterEach(() => {
    (Math.random as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  test("rejects deviationCoefficient outside 0..1", () => {
    const data = px(255, 0, 0, 255);
    expect(() => addHueNoise(data, { deviationCoefficient: -0.1, preserveAlpha: true })).toThrow();
    expect(() => addHueNoise(data, { deviationCoefficient: 1.1, preserveAlpha: true })).toThrow();
  });

  test("deviation 0 is an identity for colors, grays and partial alpha", () => {
    const data = px(255, 0, 0, 255, 12, 200, 99, 128, 128, 128, 128, 255, 0, 0, 0, 0);
    const result = addHueNoise(data, { deviationCoefficient: 0, preserveAlpha: true });
    expect([...result]).toEqual([...data]);
  });

  test("shifts hue by +deviation when random() is at its max", () => {
    spyOn(Math, "random").mockReturnValue(1);
    // red (hue 0) + 1/3 turn → green
    const result = addHueNoise(px(255, 0, 0, 255), { deviationCoefficient: 1 / 3, preserveAlpha: true });
    expect([...result]).toEqual([0, 255, 0, 255]);
  });

  test("wraps negative hue shifts around the circle", () => {
    spyOn(Math, "random").mockReturnValue(0);
    // red (hue 0) − 1/3 turn → hue 2/3 → blue
    const result = addHueNoise(px(255, 0, 0, 255), { deviationCoefficient: 1 / 3, preserveAlpha: true });
    expect([...result]).toEqual([0, 0, 255, 255]);
  });

  test("grays have no hue to shift and stay gray", () => {
    spyOn(Math, "random").mockReturnValue(1);
    const result = addHueNoise(px(77, 77, 77, 255), { deviationCoefficient: 0.5, preserveAlpha: true });
    expect([...result]).toEqual([77, 77, 77, 255]);
  });

  test("returns a new buffer and keeps the input intact", () => {
    const data = px(255, 0, 0, 255);
    const result = addHueNoise(data, { deviationCoefficient: 0.2, preserveAlpha: true });
    expect(result).not.toBe(data);
    expect([...data]).toEqual([255, 0, 0, 255]);
  });

  // Баг №1: обе ветки preserveAlpha пишут одно и то же значение — опция
  // ни на что не влияет (унаследовано из legacy layer.class.ts). Какое поведение
  // нужно при false — решение открыто; тест фиксирует только, что разница должна быть.
  test.failing("preserveAlpha: false behaves differently from true", () => {
    const data = px(255, 0, 0, 100);
    const keep = addHueNoise(data, { deviationCoefficient: 0, preserveAlpha: true });
    const drop = addHueNoise(data, { deviationCoefficient: 0, preserveAlpha: false });
    expect([...drop]).not.toEqual([...keep]);
  });
});
