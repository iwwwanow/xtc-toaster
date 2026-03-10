import { Composition } from "../../lib";
import { Layer } from "../../lib";
import { Channel } from "../../lib";
import { BlendMod } from "../../lib";

const CANVAS_ID = "canvas-3";
const IMG_QUERY_SELECTOR = "#source-3";
const IMAGE_WIDTH = 300;
const IMAGE_HEIGHT = 400;

const drawPoppies3 = () => {
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

  const redLayerArrayData = composition.cutChannel(
    originalImageData,
    Channel.Red,
  );

  const greenLayerArrayData = composition.cutChannel(
    originalImageData,
    Channel.Green,
  );

  const blueLayerArrayData = composition.cutChannel(
    originalImageData,
    Channel.Blue,
  );

  composition.addColorLayer("#000000");

  const redLayer = new Layer(redLayerArrayData);
  redLayer.setBlendMode(BlendMod.add);
  composition.addLayer(redLayer);

  const greenLayer = new Layer(greenLayerArrayData);
  greenLayer.setBlendMode(BlendMod.add);
  composition.addLayer(greenLayer);

  const blueLayer = new Layer(blueLayerArrayData);
  blueLayer.setBlendMode(BlendMod.add);
  composition.addLayer(blueLayer);

  composition.render();
};

drawPoppies3();
