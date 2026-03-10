import { Composition } from "../../lib";
import { Layer } from "../../lib";

const CANVAS_ID = "canvas-4";
const IMG_QUERY_SELECTOR = "#source-4";
const IMAGE_WIDTH = 300;
const IMAGE_HEIGHT = 400;

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

  let currentLevel = 0;
  const levelStep = 1;
  let animationFrameId: number | null = null;
  let isAnimating = true;

  const updateAnimation = () => {
    if (!isAnimating) return;

    // TODO: зачем я прокидываю original image data, если она и так есть в composition?
    const levelLayerArrayData = composition.cutValue(
      // const levelLayerArrayData = composition.cutSaturation(
      originalImageData,
      currentLevel,
    );
    const levelLayer = new Layer(levelLayerArrayData);

    composition.clearLayers();
    composition.addLayer(levelLayer);
    composition.render();

    currentLevel = (currentLevel + levelStep) % 100;
    animationFrameId = requestAnimationFrame(updateAnimation);
  };

  animationFrameId = requestAnimationFrame(updateAnimation);
};

drawPoppies4();
