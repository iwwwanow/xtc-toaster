import { describe, expect, test } from "bun:test";
import { applyAffineTransform } from "./transforms.libvips";

describe("applyAffineTransform", () => {
  test("translate(0,0) is a no-op", () => {
    // 3x1 image, single red pixel at x=0
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
    const result = applyAffineTransform(data, { width: 3, height: 1 }, {
      name: "translate",
      params: { tx: 0, ty: 0 },
    });
    expect([...result]).toEqual([...data]);
  });

  test("translate shifts a pixel by (tx, ty)", () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
    const result = applyAffineTransform(data, { width: 3, height: 1 }, {
      name: "translate",
      params: { tx: 1, ty: 0 },
    });
    expect([...result.slice(0, 4)]).toEqual([0, 0, 0, 0]);
    expect([...result.slice(4, 8)]).toEqual([255, 0, 0, 255]);
    expect([...result.slice(8, 12)]).toEqual([0, 0, 0, 0]);
  });

  test("pixels transformed out of bounds are dropped (become transparent)", () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]);
    const result = applyAffineTransform(data, { width: 2, height: 1 }, {
      name: "translate",
      params: { tx: 5, ty: 0 },
    });
    expect([...result]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  test("scale doubles coordinate offsets", () => {
    // 4x1 image, red pixel at x=1
    const data = new Uint8ClampedArray(16);
    data.set([255, 0, 0, 255], 4);
    const result = applyAffineTransform(data, { width: 4, height: 1 }, {
      name: "scale",
      params: { scaleX: 2, scaleY: 1 },
    });
    expect([...result.slice(8, 12)]).toEqual([255, 0, 0, 255]);
  });
});
