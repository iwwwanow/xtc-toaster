import { describe, expect, test } from "bun:test";
import { hueMask, saturationMask, valueMask } from "./maskers";

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
});
