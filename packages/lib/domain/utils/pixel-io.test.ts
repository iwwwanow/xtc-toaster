import { describe, expect, test } from "bun:test";
import { readNormalizedPixel, readPixel } from "./pixel-io";

describe("pixel-io", () => {
  const data = new Uint8ClampedArray([1, 2, 3, 4, 255, 0, 51, 102]);

  test("readPixel reads RGBA at a byte offset", () => {
    expect(readPixel(data, 4)).toEqual([255, 0, 51, 102]);
  });

  test("readNormalizedPixel divides every channel by 255", () => {
    expect(readNormalizedPixel(data, 4)).toEqual([1, 0, 0.2, 0.4]);
  });
});
