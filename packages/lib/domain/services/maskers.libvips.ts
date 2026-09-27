// Заменяется вызовом vips_extract_band + vips_bandjoin_const при переносе на
// Zig/libvips (4d) — см. docs/specs/lib.spec.md, раздел "Функции — куда
// переезжает". Портировать не нужно, только вызвать биндинги.

import { getChannelIndex } from "../utils/color-space";
import { Channel, type ImageRawDataArray } from "../types";

// НЕ маска: RGB заменяется на цвет-индикатор канала, значение канала уходит в alpha.
export const isolateChannel = (data: ImageRawDataArray, channel: Channel): ImageRawDataArray => {
  const neededColorIndex = getChannelIndex(channel);
  const output = new Uint8ClampedArray(data.length);

  for (let i = 0; i < data.length; i += 4) {
    output[i + 3] = data[i + neededColorIndex];
    output[i] = neededColorIndex === 0 ? 255 : 0;
    output[i + 1] = neededColorIndex === 1 ? 255 : 0;
    output[i + 2] = neededColorIndex === 2 ? 255 : 0;
  }

  return output;
};
