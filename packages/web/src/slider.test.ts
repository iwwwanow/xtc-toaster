import { describe, expect, test } from "bun:test";
import { PARAMS } from "@xtc-toaster/contract";
import { dragDelta, fillPercent, formatValue, parseTyped, snap } from "./slider";

const scale = PARAMS.scale.x; // 0.1–3
const angle = PARAMS.rotate.angle; // -180–180

describe("drag field", () => {
  test("snap — on the step grid from min, clamped, no float noise", () => {
    expect(snap(0.77, scale, 0.05)).toBe(0.75);
    expect(snap(0.1 + 0.2, scale, 0.05)).toBe(0.3);
    expect(snap(5, scale, 0.05)).toBe(3);
    expect(snap(-400, angle, 1)).toBe(-180);
    expect(snap(14.6, angle, 1)).toBe(15);
  });

  test("dragging the field's width covers the whole range; shift — ten times slower", () => {
    expect(dragDelta(100, 100, angle, false)).toBe(360);
    expect(dragDelta(-50, 100, angle, false)).toBe(-180);
    expect(dragDelta(100, 100, angle, true)).toBeCloseTo(36);
  });

  test("a typed value is clamped, not snapped; a comma works; junk is refused", () => {
    expect(parseTyped("0.333", scale)).toBe(0.333);
    expect(parseTyped("1,5", scale)).toBe(1.5);
    expect(parseTyped("999", angle)).toBe(180);
    expect(parseTyped("", angle)).toBeNull();
    expect(parseTyped("  ", angle)).toBeNull();
    expect(parseTyped("abc", angle)).toBeNull();
  });

  test("the value shows the step's decimals; a finer typed one is not rounded away", () => {
    expect(formatValue(0.75, 0.05)).toBe("0.75");
    expect(formatValue(1, 0.05)).toBe("1.00");
    expect(formatValue(15, 1)).toBe("15");
    expect(formatValue(0.333, 0.05)).toBe("0.333");
    expect(formatValue(15.5, 1)).toBe("15.5");
  });

  test("the fill is where the value sits in the range", () => {
    expect(fillPercent(0, angle)).toBe(50);
    expect(fillPercent(-180, angle)).toBe(0);
    expect(fillPercent(3, scale)).toBe(100);
  });
});
