import { describe, expect, test } from "bun:test";
import {
  applyAffineTransform,
  applyHomographyTransform,
  applyYRotationPerspective,
  homographyFromQuad,
} from "./transforms";
import { Matrix } from "../utils/matrix";
import type { Quad } from "../types";

// 3×3 grid, red channel = 10·(index+1), fully opaque — every pixel is identifiable
const grid3 = () => {
  const data = new Uint8ClampedArray(9 * 4);
  for (let i = 0; i < 9; i++) data.set([(i + 1) * 10, 0, 0, 255], i * 4);
  return data;
};

// "x,y=red" for every non-transparent pixel — compact, readable diffs
const occupied = (data: Uint8ClampedArray, width: number): string[] => {
  const cells: string[] = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]) cells.push(`${(i / 4) % width},${Math.floor(i / 4 / width)}=${data[i]}`);
  }
  return cells;
};

const matrixValues = (m: Matrix): number[] =>
  [0, 1, 2].flatMap((row) => [0, 1, 2].map((col) => m.getItem(col, row)));

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

  test("translate on both axes, negative offsets included", () => {
    const result = applyAffineTransform(grid3(), { width: 3, height: 3 }, {
      name: "translate",
      params: { tx: -1, ty: 1 },
    });
    expect(occupied(result, 3)).toEqual(["0,1=20", "1,1=30", "0,2=50", "1,2=60"]);
  });

  test("pixels transformed out of bounds are dropped (become transparent)", () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]);
    const result = applyAffineTransform(data, { width: 2, height: 1 }, {
      name: "translate",
      params: { tx: 5, ty: 0 },
    });
    expect([...result]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  test("scale grows around the image center", () => {
    // 4×1, red pixel at x=1 (left of center 1.5) — scale 2 pushes it left and doubles it
    const data = new Uint8ClampedArray(16);
    data.set([255, 0, 0, 255], 4);
    const result = applyAffineTransform(data, { width: 4, height: 1 }, {
      name: "scale",
      params: { scaleX: 2, scaleY: 1 },
    });
    expect([...result]).toEqual([255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  test("scale 2 on a 3×3 grid: the center pixel spreads, no holes", () => {
    const result = applyAffineTransform(grid3(), { width: 3, height: 3 }, {
      name: "scale",
      params: { scaleX: 2, scaleY: 2 },
    });
    expect(occupied(result, 3)).toEqual([
      "0,0=50", "1,0=50", "2,0=60", "0,1=50", "1,1=50", "2,1=60", "0,2=80", "1,2=80", "2,2=90",
    ]);
  });

  test("backward mapping leaves no holes when scaling up", () => {
    const data = new Uint8ClampedArray(16).fill(255);
    const result = applyAffineTransform(data, { width: 4, height: 1 }, {
      name: "scale",
      params: { scaleX: 2, scaleY: 1 },
    });
    expect([...result].filter((_, i) => i % 4 === 3)).toEqual([255, 255, 255, 255]);
  });

  test("rotate(90) turns the whole image counter-clockwise around its center", () => {
    const result = applyAffineTransform(grid3(), { width: 3, height: 3 }, {
      name: "rotate",
      params: { alpha: 90 },
    });
    expect(occupied(result, 3)).toEqual([
      "0,0=30", "1,0=60", "2,0=90", "0,1=20", "1,1=50", "2,1=80", "0,2=10", "1,2=40", "2,2=70",
    ]);
  });

  test("rotate(15) leaves no holes inside the rotated image", () => {
    const data = new Uint8ClampedArray(21 * 21 * 4).fill(255);
    const result = applyAffineTransform(data, { width: 21, height: 21 }, {
      name: "rotate",
      params: { alpha: 15 },
    });
    // the inscribed circle is always covered by the rotated square
    for (let y = 0; y < 21; y++) {
      for (let x = 0; x < 21; x++) {
        if ((x - 10) ** 2 + (y - 10) ** 2 <= 9 ** 2) expect(result[(y * 21 + x) * 4 + 3]).toBe(255);
      }
    }
  });

  test("rotate(360) is an identity", () => {
    const data = grid3();
    const result = applyAffineTransform(data, { width: 3, height: 3 }, {
      name: "rotate",
      params: { alpha: 360 },
    });
    expect([...result]).toEqual([...data]);
  });

  test("rotate(180) pivots around the image center", () => {
    const result = applyAffineTransform(grid3(), { width: 3, height: 3 }, {
      name: "rotate",
      params: { alpha: 180 },
    });
    expect(occupied(result, 3)).toEqual([
      "0,0=90", "1,0=80", "2,0=70", "0,1=60", "1,1=50", "2,1=40", "0,2=30", "1,2=20", "2,2=10",
    ]);
  });

  test("skew tx shears y by x around the center column (y' = y + tx·(x − cx))", () => {
    const result = applyAffineTransform(grid3(), { width: 3, height: 3 }, {
      name: "skew",
      params: { tx: 1, ty: 0 },
    });
    expect(occupied(result, 3)).toEqual(["0,0=40", "1,0=20", "0,1=70", "1,1=50", "2,1=30", "1,2=80", "2,2=60"]);
  });

  test("skew ty shears x by y around the center row (x' = x + ty·(y − cy))", () => {
    const result = applyAffineTransform(grid3(), { width: 3, height: 3 }, {
      name: "skew",
      params: { tx: 0, ty: 1 },
    });
    expect(occupied(result, 3)).toEqual(["0,0=20", "1,0=30", "0,1=40", "1,1=50", "2,1=60", "1,2=70", "2,2=80"]);
  });

  test("scale 0 collapses the image and is rejected as singular", () => {
    expect(() =>
      applyAffineTransform(grid3(), { width: 3, height: 3 }, { name: "scale", params: { scaleX: 0, scaleY: 1 } }),
    ).toThrow();
  });

  test("throws for non-affine transforms", () => {
    expect(() =>
      applyAffineTransform(grid3(), { width: 3, height: 3 }, {
        name: "homography",
        params: { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
      }),
    ).toThrow();
  });
});

describe("homographyFromQuad", () => {
  test("the image's own corners give the identity", () => {
    const m = homographyFromQuad({ width: 4, height: 3 }, [
      { x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 2 }, { x: 0, y: 2 },
    ]);
    matrixValues(m).forEach((v, i) => expect(v).toBeCloseTo([1, 0, 0, 0, 1, 0, 0, 0, 1][i], 9));
  });

  test("a shifted quad gives a translation (row-vector convention: offset in last row)", () => {
    const m = homographyFromQuad({ width: 3, height: 3 }, [
      { x: 1, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 2 }, { x: 1, y: 2 },
    ]);
    matrixValues(m).forEach((v, i) => expect(v).toBeCloseTo([1, 0, 0, 0, 1, 0, 1, 0, 1][i], 9));
  });

  test("a half-size quad gives a 0.5 scale", () => {
    const m = homographyFromQuad({ width: 5, height: 5 }, [
      { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 },
    ]);
    matrixValues(m).forEach((v, i) => expect(v).toBeCloseTo([0.5, 0, 0, 0, 0.5, 0, 0, 0, 1][i], 9));
  });

  test("maps every source corner exactly onto its target corner", () => {
    const corners: Quad = [{ x: 5, y: 3 }, { x: 90, y: 10 }, { x: 99, y: 70 }, { x: 0, y: 79 }];
    const m = homographyFromQuad({ width: 100, height: 80 }, corners);
    const src = [[0, 0], [99, 0], [99, 79], [0, 79]];
    src.forEach(([x, y], i) => {
      const p = Matrix.multiply(new Matrix(3, 1, [x, y, 1]), m);
      const w = p.getItem(2, 0);
      expect(p.getItem(0, 0) / w).toBeCloseTo(corners[i].x, 6);
      expect(p.getItem(1, 0) / w).toBeCloseTo(corners[i].y, 6);
    });
  });

  test("a degenerate quad (all corners on one line) is rejected", () => {
    expect(() =>
      homographyFromQuad({ width: 3, height: 3 }, [
        { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 },
      ]),
    ).toThrow();
  });
});

describe("applyHomographyTransform", () => {
  test("identity quad leaves the image unchanged", () => {
    const data = grid3();
    const m = homographyFromQuad({ width: 3, height: 3 }, [
      { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 },
    ]);
    expect([...applyHomographyTransform(data, { width: 3, height: 3 }, m)]).toEqual([...data]);
  });

  test("backward mapping: a translation homography shifts pixels, uncovered area is transparent", () => {
    const m = new Matrix(3, 3, [1, 0, 0, 0, 1, 0, 1, 0, 1]);
    const result = applyHomographyTransform(grid3(), { width: 3, height: 3 }, m);
    expect(occupied(result, 3)).toEqual(["1,0=10", "2,0=20", "1,1=40", "2,1=50", "1,2=70", "2,2=80"]);
  });

  test("backward mapping leaves no holes when scaling up", () => {
    const data = new Uint8ClampedArray(4 * 4 * 4).fill(255);
    const m = new Matrix(3, 3, [2, 0, 0, 0, 2, 0, 0, 0, 1]);
    const result = applyHomographyTransform(data, { width: 4, height: 4 }, m);
    expect([...result].every((v) => v === 255)).toBe(true);
  });

  test("a singular matrix is rejected", () => {
    expect(() =>
      applyHomographyTransform(grid3(), { width: 3, height: 3 }, new Matrix(3, 3, [0, 0, 0, 0, 0, 0, 0, 0, 0])),
    ).toThrow();
  });
});

describe("applyYRotationPerspective", () => {
  test("angle=0 is an identity mapping", () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
    const result = applyYRotationPerspective(data, { width: 3, height: 1 }, 0, 600);
    expect([...result]).toEqual([...data]);
  });

  test("a turned plane narrows: edge columns sample from outside and go transparent", () => {
    const data = new Uint8ClampedArray(9 * 1 * 4).fill(255);
    const result = applyYRotationPerspective(data, { width: 9, height: 1 }, Math.PI / 3, 10);
    const alphas = [...result].filter((_, i) => i % 4 === 3);
    expect(alphas[4]).toBe(255); // center column keeps its pixel
    expect(alphas.some((a) => a === 0)).toBe(true);
  });
});
