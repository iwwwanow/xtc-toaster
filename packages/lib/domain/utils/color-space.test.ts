import { describe, expect, test } from "bun:test";
import { getChannelIndex, hexToRgb, hexToRgba, hslToRgb, labToRgb, rgbToHsl, rgbToHsv, rgbToLab } from "./color-space";
import { Channel } from "../types";

describe("hexToRgb", () => {
  test("expands 3-digit hex", () => {
    expect(hexToRgb("#0f0")).toEqual([0, 255, 0]);
  });

  test("accepts hex without the leading #", () => {
    expect(hexToRgb("336699")).toEqual([0x33, 0x66, 0x99]);
  });

  test("parses 6-digit hex", () => {
    expect(hexToRgb("#336699")).toEqual([0x33, 0x66, 0x99]);
  });

  test("throws on invalid length", () => {
    expect(() => hexToRgb("#1234")).toThrow();
  });
});

describe("hexToRgba", () => {
  test("defaults alpha to 255", () => {
    expect(hexToRgba("#ffffff")).toEqual([255, 255, 255, 255]);
  });

  test("accepts explicit alpha", () => {
    expect(hexToRgba("#ffffff", 128)).toEqual([255, 255, 255, 128]);
  });
});

describe("rgbToHsl / hslToRgb (normalized 0-1)", () => {
  test("pure red", () => {
    const [h, s, l] = rgbToHsl([1, 0, 0]);
    expect(h).toBeCloseTo(0);
    expect(s).toBeCloseTo(1);
    expect(l).toBeCloseTo(0.5);
  });

  test("gray has zero saturation", () => {
    const [, s] = rgbToHsl([0.5, 0.5, 0.5]);
    expect(s).toBe(0);
  });

  test("hslToRgb of zero saturation is gray at lightness", () => {
    expect(hslToRgb([0.7, 0, 0.25])).toEqual([0.25, 0.25, 0.25]);
  });

  test("hue covers the whole circle (green 1/3, blue 2/3)", () => {
    expect(rgbToHsl([0, 1, 0])[0]).toBeCloseTo(1 / 3);
    expect(rgbToHsl([0, 0, 1])[0]).toBeCloseTo(2 / 3);
  });

  test("round-trips through hslToRgb", () => {
    const original: [number, number, number] = [0.2, 0.6, 0.9];
    const hsl = rgbToHsl(original);
    const roundTripped = hslToRgb(hsl);
    roundTripped.forEach((value, i) => expect(value).toBeCloseTo(original[i], 5));
  });
});

describe("rgbToHsv (raw 0-255 in, degrees/percent out)", () => {
  test("pure green", () => {
    const [h, s, v] = rgbToHsv([0, 255, 0]);
    expect(h).toBeCloseTo(120);
    expect(s).toBeCloseTo(100);
    expect(v).toBeCloseTo(100);
  });

  test("blue and magenta hues in degrees", () => {
    expect(rgbToHsv([0, 0, 255])[0]).toBeCloseTo(240);
    expect(rgbToHsv([255, 0, 255])[0]).toBeCloseTo(300);
  });

  test("gray has zero saturation and hue, value in percent", () => {
    const [h, s, v] = rgbToHsv([102, 102, 102]);
    expect([h, s]).toEqual([0, 0]);
    expect(v).toBeCloseTo(40);
  });

  test("black has zero saturation and value", () => {
    expect(rgbToHsv([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe("getChannelIndex", () => {
  test("maps channels to byte offsets", () => {
    expect(getChannelIndex(Channel.Red)).toBe(0);
    expect(getChannelIndex(Channel.Green)).toBe(1);
    expect(getChannelIndex(Channel.Blue)).toBe(2);
    expect(getChannelIndex(Channel.Alpha)).toBe(3);
  });
});

describe("rgbToLab / labToRgb (normalized RGB, D65)", () => {
  test("white is L=100 with no chroma", () => {
    const [L, a, b] = rgbToLab([1, 1, 1]);
    expect(L).toBeCloseTo(100, 2);
    expect(a).toBeCloseTo(0, 2);
    expect(b).toBeCloseTo(0, 2);
  });

  test("black is L=0", () => {
    expect(rgbToLab([0, 0, 0])[0]).toBeCloseTo(0, 6);
  });

  test("sRGB red matches the reference Lab value", () => {
    const [L, a, b] = rgbToLab([1, 0, 0]);
    expect(L).toBeCloseTo(53.24, 1);
    expect(a).toBeCloseTo(80.09, 1);
    expect(b).toBeCloseTo(67.2, 1);
  });

  test("round-trips through labToRgb", () => {
    const original: [number, number, number] = [0.2, 0.6, 0.9];
    labToRgb(rgbToLab(original)).forEach((value, i) => expect(value).toBeCloseTo(original[i], 6));
  });

  test("labToRgb clamps out-of-gamut colors into 0..1", () => {
    labToRgb([50, 200, -200]).forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    });
  });
});
