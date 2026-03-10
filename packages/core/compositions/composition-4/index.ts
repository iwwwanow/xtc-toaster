import { Composition } from "../../lib";
import { Layer } from "../../lib";

import { TransformType } from "../../lib";

const CANVAS_ID = "canvas-4";
const IMG_QUERY_SELECTOR = "#source-4";
const IMAGE_WIDTH = 128;
const IMAGE_HEIGHT = 128;

export const drawPoppies4 = () => {
  const composition = new Composition({
    canvasId: CANVAS_ID,
    imgQuerySelector: IMG_QUERY_SELECTOR,
    options: {
      width: IMAGE_WIDTH,
      height: IMAGE_HEIGHT,
    },
  });

  composition.init();

  const originalImageData = composition.imageData?.data;
  if (!originalImageData) throw new Error("image data not defined");

  const whiteLayer = new Layer(originalImageData.map(() => 255));
  composition.addLayer(whiteLayer);

  const opacityLayer = new Layer(originalImageData);
  // opacityLayer.setTransform({type: TransformType.Translate, x: 50, y: 25});
  // opacityLayer.setTransform({ type: TransformType.Rotate, alpha: 60 });
  // opacityLayer.setTransform({
  //   type: TransformType.Scale,
  //   scaleX: 2,
  //   scaleY: 0.5,
  // });

  opacityLayer.setTransform({
    type: TransformType.Skew,
    params: {
      tx: 0.5,
      ty: 0,
    },
  });

  opacityLayer.setOpacity(1);
  composition.addLayer(opacityLayer);
  composition.render();
};

drawPoppies4();
