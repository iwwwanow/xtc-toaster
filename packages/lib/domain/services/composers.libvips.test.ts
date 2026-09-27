import { describe, expect, test } from "bun:test";
import { alphaCompose, addCompose } from "./composers.libvips";

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
});

describe("addCompose", () => {
  test("adds foreground onto background, clamped to opaque white", () => {
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
});
