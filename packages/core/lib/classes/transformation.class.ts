import { TransformType } from "./transformation.interfaces";
import type { TransformParams } from "./transformation.interfaces";
import type { SkewParams } from "./transformation.interfaces";
import type { ScaleParams } from "./transformation.interfaces";
import type { RotateParams } from "./transformation.interfaces";
import type { TranslateParams } from "./transformation.interfaces";
import { Matrix } from "../math";
import { Pixel } from "./pixel.class";
import type { TransformTypeParams } from "./transformation.interfaces";

export class Transformation {
  type: TransformType;
  params: TransformTypeParams;
  affineMatrix: Matrix;

  constructor({ type, params }: TransformParams) {
    this.type = type;
    this.params = params;

    this.affineMatrix = new Matrix(3, 3, [1, 0, 0, 0, 1, 0, 0, 0, 1]);

    this.setAffineMatrix(type);
  }

  process(
    data: Uint8ClampedArray,
    width: number,
    height: number,
  ): Uint8ClampedArray {
    const resultMatrix = new Matrix(
      width,
      height,
      new Array(width * height).fill([0, 0, 0, 0]),
    );

    for (let pixelIndex = 0; pixelIndex < data.length; pixelIndex += 4) {
      const pixelValue = Pixel.getDataFromUintArray(pixelIndex, data);

      const pixelNum = pixelIndex / 4;
      const pixelX = pixelNum % width;
      const pixelY = Math.floor(pixelNum / width);

      const currentPixelMatrix = new Matrix(3, 1, [pixelX, pixelY, 1]);

      const multiplyedMatix = Matrix.multiply(
        currentPixelMatrix,
        this.affineMatrix,
      );
      const [transletedX, transletedY] = multiplyedMatix.data;

      if (typeof transletedX === "number" && typeof transletedY === "number") {
        resultMatrix.setItem(
          Math.round(transletedX),
          Math.round(transletedY),
          pixelValue,
        );
      }
    }

    return new Uint8ClampedArray(resultMatrix.data.flat(1));
  }

  private setAffineMatrix(type: TransformType) {
    let params;

    switch (type) {
      case TransformType.Skew:
        params = this.params as SkewParams;
        this.affineMatrix = this.getSkewMatrix(params.tx, params.ty);
        break;
      case TransformType.Scale:
        params = this.params as ScaleParams;
        this.affineMatrix = this.getScaleMatrix(params.scaleX, params.scaleY);
        break;
      case TransformType.Rotate:
        params = this.params as RotateParams;
        const radians = (Math.PI / 180) * params.alpha;
        this.affineMatrix = this.getRotateMatrix(radians);
        break;
      case TransformType.Translate:
        params = this.params as TranslateParams;
        this.affineMatrix = this.getTranslateMatrix(params.tx, params.ty);
        break;
      default:
        throw new Error("transform type incorrect");
    }
  }

  private getSkewMatrix(tx: number, ty: number): Matrix {
    return new Matrix(3, 3, [1, tx, 0, ty, 1, 0, 0, 0, 1]);
  }

  private getScaleMatrix(scaleX: number, scaleY: number): Matrix {
    return new Matrix(3, 3, [scaleX, 0, 0, 0, scaleY, 0, 0, 0, 1]);
  }

  private getRotateMatrix(radians: number): Matrix {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return new Matrix(3, 3, [cos, -sin, 0, sin, cos, 0, 0, 0, 1]);
  }

  private getTranslateMatrix(tx: number, ty: number): Matrix {
    return new Matrix(3, 3, [1, 0, 0, 0, 1, 0, tx, ty, 1]);
  }
}
