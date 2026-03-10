import { Composition } from "../../lib";
import { Layer } from "../../lib";
import { Channel } from "../../lib";

const CANVAS_ID = "canvas-1";
const IMG_QUERY_SELECTOR = "#source-1";
const IMAGE_WIDTH = 300;
const IMAGE_HEIGHT = 400;

const drawPoppies1 = () => {
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
  composition.addLayer(redLayer);

  const greenLayer = new Layer(greenLayerArrayData);
  composition.addLayer(greenLayer);

  const blueLayer = new Layer(blueLayerArrayData);
  composition.addLayer(blueLayer);

  composition.render();
};

drawPoppies1();
