import type { RgbaArray } from "../interfaces";

export const getSolidColorData = (
  dataLength: number,
  [r, g, b, a]: RgbaArray,
): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(dataLength);

  for (let i = 0; i < dataLength; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }

  return data;
};
