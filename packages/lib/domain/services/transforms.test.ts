import { describe, expect, test } from "bun:test";
import { applyYRotationPerspective } from "./transforms";

describe("applyYRotationPerspective", () => {
  test("angle=0 is an identity mapping", () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
    const result = applyYRotationPerspective(data, { width: 3, height: 1 }, 0, 600);
    expect([...result]).toEqual([...data]);
  });
});
