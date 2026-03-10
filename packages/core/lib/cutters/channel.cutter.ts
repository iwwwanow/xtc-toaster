import type { Channel } from "../classes/composition.interfaces";
import { getChannelIndex } from "../utils";

const isNeededColor = (
  neededColorIndex: number,
  colorIndex: number,
): boolean => {
  return neededColorIndex === colorIndex;
};

export const cutChannel = (
  data: Uint8ClampedArray,
  channel: Channel,
): Uint8ClampedArray => {
  const neededColorIndex = getChannelIndex(channel);

  const output = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const redIndex = i;
    const greenIndex = i + 1;
    const blueIndex = i + 2;
    const alphaIndex = i + 3;

    const neededColorValue = data[i + neededColorIndex];
    output[alphaIndex] = neededColorValue;

    output[redIndex] = Number(isNeededColor(neededColorIndex, 0)) * 255;
    output[greenIndex] = Number(isNeededColor(neededColorIndex, 1)) * 255;
    output[blueIndex] = Number(isNeededColor(neededColorIndex, 2)) * 255;
  }

  return output;
};
