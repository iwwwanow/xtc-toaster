import { Composition } from "../../lib";
import { Layer } from "../../lib";
import { LayerEffect } from "../../lib";

const CANVAS_ID = "canvas-2";
const IMG_QUERY_SELECTOR = "#source-2";
const IMAGE_WIDTH = 300;
const IMAGE_HEIGHT = 400;

const drawPoppies2 = () => {
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

  let currentHue = 0;
  const hueStep = 1;
  let animationFrameId: number | null = null;
  let isAnimating = true;

  const updateAnimation = () => {
    if (!isAnimating) return;

    // TODO: зачем я прокидываю original image data, если она и так есть в composition?
    const hueLayerArrayData = composition.cutHue(originalImageData, currentHue);
    const hueLayer = new Layer(hueLayerArrayData);
    hueLayer.addEffect(LayerEffect.Noize, {
      deviationCoefficient: 0.3,
      preserveAlpha: false,
    });

    composition.clearLayers();
    composition.addLayer(hueLayer);
    composition.render();

    currentHue = (currentHue + hueStep) % 360;
    animationFrameId = requestAnimationFrame(updateAnimation);
  };

  animationFrameId = requestAnimationFrame(updateAnimation);
};

drawPoppies2();
