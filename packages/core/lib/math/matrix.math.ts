import type { RgbaArray } from "../interfaces";

export class Matrix {
  width: number;
  height: number;
  data: Array<number> | Array<RgbaArray>;

  constructor(width: number, height: number, data: Array<number>) {
    if (width * height !== data.length) {
      throw new Error("incorrect matrix length");
    }

    this.width = width;
    this.height = height;
    this.data = data;
  }

  getItem(column: number, row: number): number | RgbaArray {
    const index = this.width * row + column;
    return this.data[index];
  }

  setItem(column: number, row: number, value: number | RgbaArray): void {
    if (column < 0 || column >= this.width || row < 0 || row >= this.height) {
      return;
    }

    const index = this.width * row + column;
    this.data[index] = value;
  }

  static multiply(matrix1: Matrix, matrix2: Matrix): Matrix {
    if (matrix1.width !== matrix2.height) {
      throw new Error("matrix unconsistent");
    }

    const resultMatrixWidth = matrix2.width;
    const resultMatrixHeight = matrix1.height;

    const resultMatrixLength = resultMatrixHeight * resultMatrixWidth;
    const resultMatrixData = new Array(resultMatrixLength);

    const resultMatrix = new Matrix(
      resultMatrixWidth,
      resultMatrixHeight,
      resultMatrixData,
    );

    for (let column = 0; column < resultMatrixWidth; column++) {
      for (let row = 0; row < resultMatrixHeight; row++) {
        let sum = 0;
        for (let k = 0; k < matrix1.width; k++) {
          const matrix1Item = matrix1.getItem(k, row);
          const matrix2Item = matrix2.getItem(column, k);

          if (typeof matrix1Item !== "number")
            throw new Error("matrix item is not number. cant multiply it");
          if (typeof matrix2Item !== "number")
            throw new Error("matrix item is not number. cant multiply it");

          sum += matrix1Item * matrix2Item;
        }
        resultMatrix.setItem(column, row, sum);
      }
    }

    return resultMatrix;
  }
}
