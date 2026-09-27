import { Matrix } from "../utils/matrix";
import type { ImageRawDataArray, LayerDimensions, Quad } from "../types";

// Solve n×n system Ax=b via Gaussian elimination with partial pivoting.
const gaussianElimination = (A: number[][], b: number[]): number[] => {
  const n = A.length;
  const aug = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-10) throw new Error("Homography: singular system");
    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / pivot;
      for (let k = col; k <= n; k++) aug[row][k] -= factor * aug[col][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    x[row] = aug[row][n];
    for (let col = row + 1; col < n; col++) x[row] -= aug[row][col] * x[col];
    x[row] /= aug[row][row];
  }
  return x;
};

// Build 3×3 homography Matrix from 4 src→dst point pairs.
// Uses row-vector convention: [X,Y,W] = [x,y,1] × H, h22=1.
const homographyFromPairs = (
  srcPts: [number, number][],
  dstPts: [number, number][],
): Matrix => {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = srcPts[i];
    const [dx, dy] = dstPts[i];
    A.push([x, y, 1, 0, 0, 0, -dx * x, -dx * y]);
    b.push(dx);
    A.push([0, 0, 0, x, y, 1, -dy * x, -dy * y]);
    b.push(dy);
  }
  const [h00, h01, h02, h10, h11, h12, h20, h21] = gaussianElimination(A, b);
  return new Matrix(3, 3, [h00, h10, h20, h01, h11, h21, h02, h12, 1]);
};

export const homographyFromQuad = (dimensions: LayerDimensions, corners: Quad): Matrix => {
  const { width, height } = dimensions;
  const srcPts: [number, number][] = [
    [0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1],
  ];
  const dstPts = corners.map(({ x, y }): [number, number] => [x, y]);
  return homographyFromPairs(srcPts, dstPts);
};

// Backward-mapped homography: for each output pixel finds its source via H_inv.
// The coordinate math here survives the Zig port unchanged — libvips has no
// vips_perspective (docs/backlog/2026-09-06_libvips-signature-verification.md).
// Only the tail changes in 4d: instead of copying src pixels directly, Zig
// writes (srcX, srcY) into a map image and hands it to vips_mapim, which does
// the actual (bilinear) resampling.
export const applyHomographyTransform = (
  data: ImageRawDataArray,
  dimensions: LayerDimensions,
  matrix: Matrix,
): ImageRawDataArray => {
  const { width, height } = dimensions;
  const output = new Uint8ClampedArray(data.length);
  const inv = Matrix.inverse(matrix);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pt = new Matrix(3, 1, [x, y, 1]);
      const mapped = Matrix.multiply(pt, inv);
      const W = mapped.getItem(2, 0);
      if (Math.abs(W) < 1e-10) continue;
      const srcX = Math.round(mapped.getItem(0, 0) / W);
      const srcY = Math.round(mapped.getItem(1, 0) / W);
      if (srcX < 0 || srcX >= width || srcY < 0 || srcY >= height) continue;
      const si = (srcY * width + srcX) * 4;
      const di = (y * width + x) * 4;
      output[di] = data[si];
      output[di + 1] = data[si + 1];
      output[di + 2] = data[si + 2];
      output[di + 3] = data[si + 3];
    }
  }
  return output;
};

/**
 * Перспективный поворот вокруг оси Y — обратное отображение (dest -> src).
 *
 *   denom  = f − dx'·tan(a)
 *   x_src  = cx + dx'·f / (cos(a)·denom)
 *   y_src  = cy + dy'·f / denom
 */
export const applyYRotationPerspective = (
  data: ImageRawDataArray,
  dimensions: LayerDimensions,
  angleRad: number,
  focalLength: number,
): ImageRawDataArray => {
  const { width, height } = dimensions;
  const output = new Uint8ClampedArray(data.length);
  const cx = width / 2;
  const cy = height / 2;
  const tanA = Math.tan(angleRad);
  const cosA = Math.cos(angleRad);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const denom = focalLength - dx * tanA;

      if (denom <= 0) continue;

      const srcX = Math.round(cx + (dx * focalLength) / (cosA * denom));
      const srcY = Math.round(cy + (dy * focalLength) / denom);

      if (srcX < 0 || srcX >= width || srcY < 0 || srcY >= height) continue;

      const srcIndex = (srcY * width + srcX) * 4;
      const destIndex = (y * width + x) * 4;

      output[destIndex] = data[srcIndex];
      output[destIndex + 1] = data[srcIndex + 1];
      output[destIndex + 2] = data[srcIndex + 2];
      output[destIndex + 3] = data[srcIndex + 3];
    }
  }

  return output;
};
