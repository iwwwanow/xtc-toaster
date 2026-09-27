// Заменяется вызовом vips_affine при переносе на Zig/libvips (4d) — см.
// docs/specs/lib.spec.md, раздел "Функции — куда переезжает". vips_affine
// takes only the 2×2 linear part (a,b,c,d) positionally plus translation as
// an optional named vararg — getAffineMatrix's current 3×3/last-row-translation
// shape is specific to this file's manual forward-mapping loop and won't
// carry over as-is; expect this file's logic to be rewritten, not ported
// verbatim, once 4d lands.

import { Matrix } from "../utils/matrix";
import { readPixel } from "../utils/pixel-io";
import type { ImageRawDataArray, LayerDimensions, Transform } from "../types";

// point*M convention (row-vector on the left) — translation lives in the
// matrix's last row, not last column. Matches legacy Transformation class.
export const getAffineMatrix = (transform: Transform): Matrix => {
  switch (transform.name) {
    case "translate": {
      const { tx, ty } = transform.params;
      return new Matrix(3, 3, [1, 0, 0, 0, 1, 0, tx, ty, 1]);
    }
    case "rotate": {
      const radians = (Math.PI / 180) * transform.params.alpha;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      return new Matrix(3, 3, [cos, -sin, 0, sin, cos, 0, 0, 0, 1]);
    }
    case "scale": {
      const { scaleX, scaleY } = transform.params;
      return new Matrix(3, 3, [scaleX, 0, 0, 0, scaleY, 0, 0, 0, 1]);
    }
    case "skew": {
      const { tx, ty } = transform.params;
      return new Matrix(3, 3, [1, tx, 0, ty, 1, 0, 0, 0, 1]);
    }
    default:
      throw new Error(`getAffineMatrix called with non-affine transform: ${(transform as Transform).name}`);
  }
};

// Forward mapping (src pixel -> dest pixel), ported as-is from legacy —
// destination cells with no mapped source pixel stay transparent black
// (holes). Not fixed here; see docs/diary — known compositing quirk to
// revisit independently of the Zig port.
export const applyAffineTransform = (
  data: ImageRawDataArray,
  dimensions: LayerDimensions,
  transform: Transform,
): ImageRawDataArray => {
  const { width, height } = dimensions;
  const matrix = getAffineMatrix(transform);
  const output = new Uint8ClampedArray(data.length);

  for (let pixelIndex = 0; pixelIndex < data.length; pixelIndex += 4) {
    const pixel = readPixel(data, pixelIndex);
    const pixelNum = pixelIndex / 4;
    const srcX = pixelNum % width;
    const srcY = Math.floor(pixelNum / width);

    const point = new Matrix(3, 1, [srcX, srcY, 1]);
    const transformed = Matrix.multiply(point, matrix);

    const destX = Math.round(transformed.getItem(0, 0));
    const destY = Math.round(transformed.getItem(1, 0));

    if (destX < 0 || destX >= width || destY < 0 || destY >= height) continue;

    const destIndex = (destY * width + destX) * 4;
    output[destIndex] = pixel[0];
    output[destIndex + 1] = pixel[1];
    output[destIndex + 2] = pixel[2];
    output[destIndex + 3] = pixel[3];
  }

  return output;
};
