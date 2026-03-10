import { Layer } from "../classes";
import { BlendMod } from "../classes";

import { addCompose } from "../composers";
import { alphaCompose } from "../composers";

const getOpacityLayerData = (layer: Layer): Uint8ClampedArray => {
  return layer.data.map((value, index) => {
    if (layer.options?.opacity && index % 4 === 3)
      return value * layer.options?.opacity;
    return value;
  });
};

export const mergedLayerReducer = (
  dataLength: number,
  bgLayer: Layer,
  fgLayer: Layer,
): Layer => {
  let bgLayerData = bgLayer.data;
  let fgLayerData = fgLayer.data;

  if (bgLayer.options?.opacity) {
    bgLayerData = getOpacityLayerData(bgLayer);
  }

  if (fgLayer.options?.opacity) {
    fgLayerData = getOpacityLayerData(fgLayer);
  }

  let resultLayerData = new Uint8ClampedArray(dataLength);

  switch (fgLayer.options?.blendMod) {
    case BlendMod.add:
      resultLayerData = addCompose(bgLayerData, fgLayerData);
      break;
    default:
      resultLayerData = alphaCompose(bgLayerData, fgLayerData);
      break;
  }

  return new Layer(resultLayerData);
};
