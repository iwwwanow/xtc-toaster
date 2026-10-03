import { describe, expect, test } from "bun:test";
import { Color } from "./color";

describe("Color", () => {
  test("fromHex parses RGB and defaults alpha to opaque", () => {
    const color = Color.fromHex("#336699");
    expect(color.normalized).toEqual([0x33 / 255, 0x66 / 255, 0x99 / 255, 1]);
  });

  test("fromRgb defaults alpha to opaque", () => {
    const color = Color.fromRgb([10, 20, 30]);
    expect(color.normalized[3]).toBe(1);
  });

  test("fromUintArray reads a pixel at the given byte offset", () => {
    const data = new Uint8ClampedArray([0, 0, 0, 0, 10, 20, 30, 40]);
    const color = Color.fromUintArray(data, 4);
    expect(color.normalized).toEqual([10 / 255, 20 / 255, 30 / 255, 40 / 255]);
  });

  test("hex round-trips a color created from RGB", () => {
    const color = Color.fromRgb([0x33, 0x66, 0x99]);
    expect(color.hex).toBe("#336699");
  });

  test("fromHex accepts 3-digit hex", () => {
    expect(Color.fromHex("#f0a").hex).toBe("#ff00aa");
  });

  test("hex ignores alpha", () => {
    const data = new Uint8ClampedArray([255, 0, 16, 7]);
    expect(Color.fromUintArray(data, 0).hex).toBe("#ff0010");
  });
});
