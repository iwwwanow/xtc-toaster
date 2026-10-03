import { describe, expect, test } from "bun:test";
import { Matrix } from "./matrix";

describe("Matrix", () => {
  test("getItem/setItem address row-major storage", () => {
    const m = new Matrix(3, 2, [1, 2, 3, 4, 5, 6]);
    expect(m.getItem(0, 0)).toBe(1);
    expect(m.getItem(2, 1)).toBe(6);

    m.setItem(1, 0, 99);
    expect(m.getItem(1, 0)).toBe(99);
  });

  test("setItem ignores out-of-bounds writes", () => {
    const m = new Matrix(2, 2, [0, 0, 0, 0]);
    m.setItem(-1, 0, 1);
    m.setItem(0, 2, 1);
    expect(m.getItem(0, 0)).toBe(0);
  });

  test("throws on inconsistent length", () => {
    expect(() => new Matrix(2, 2, [1, 2, 3])).toThrow();
  });

  test("multiply: row-vector times 3x3 identity is a no-op", () => {
    const point = new Matrix(3, 1, [5, 7, 1]);
    const identity = new Matrix(3, 3, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const result = Matrix.multiply(point, identity);
    expect(result.getItem(0, 0)).toBe(5);
    expect(result.getItem(1, 0)).toBe(7);
    expect(result.getItem(2, 0)).toBe(1);
  });

  test("multiply: row-vector times translate matrix", () => {
    const point = new Matrix(3, 1, [5, 7, 1]);
    // point*M convention (see domain/services/transforms.ts): translate stores [tx,ty] in row 2.
    const translate = new Matrix(3, 3, [1, 0, 0, 0, 1, 0, 3, -2, 1]);
    const result = Matrix.multiply(point, translate);
    expect(result.getItem(0, 0)).toBe(8);
    expect(result.getItem(1, 0)).toBe(5);
  });

  test("multiply throws on incompatible dimensions", () => {
    const a = new Matrix(2, 2, [1, 2, 3, 4]);
    const b = new Matrix(3, 3, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(() => Matrix.multiply(a, b)).toThrow();
  });

  test("inverse: A · inverse(A) = I", () => {
    const a = new Matrix(3, 3, [2, 1, 0, 0.5, 3, 0, 4, -2, 1]);
    const product = Matrix.multiply(a, Matrix.inverse(a));
    const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    [0, 1, 2].forEach((row) =>
      [0, 1, 2].forEach((col) => expect(product.getItem(col, row)).toBeCloseTo(identity[row * 3 + col], 12)),
    );
  });

  test("inverse of a translation negates the offset", () => {
    const inv = Matrix.inverse(new Matrix(3, 3, [1, 0, 0, 0, 1, 0, 3, -2, 1]));
    expect(inv.getItem(0, 2)).toBeCloseTo(-3, 12);
    expect(inv.getItem(1, 2)).toBeCloseTo(2, 12);
  });

  test("inverse throws on a singular matrix", () => {
    expect(() => Matrix.inverse(new Matrix(3, 3, [1, 2, 3, 2, 4, 6, 0, 0, 1]))).toThrow();
  });

  test("inverse is only implemented for 3×3", () => {
    expect(() => Matrix.inverse(new Matrix(2, 2, [1, 0, 0, 1]))).toThrow();
  });
});
