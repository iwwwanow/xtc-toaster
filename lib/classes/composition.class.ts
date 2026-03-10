import type { CompositionConstructor } from "./composition.interfaces";
import { cutValue } from "../cutters";
import { Channel } from "./composition.interfaces";
import { cutChannel } from "../cutters";
import { Layer } from "./layer.class";
import { cutHue } from "../cutters";
import { cutSaturation } from "../cutters";
import type { CompositionOptions } from "./composition.interfaces";
import type { HexString } from "../interfaces";
import { hexToRgba } from "../utils";
import { transformedLayersMapper } from "../mappers";
import { getSolidColorData } from "../colors";
import { mergedLayerReducer } from "../reducers";

const DEFAULT_WIDTH = 100;
const DEFAULT_HEIGHT = 100;

export class Composition {
  canvas: HTMLCanvasElement | null;
  canvasId: string;
  ctx: CanvasRenderingContext2D | null;
  img: HTMLImageElement | null;
  imgQuerySelector: string;
  layers: Array<Layer>;
  imageData: ImageData | null;
  imageDataLength: number;
  width: CompositionOptions["width"];
  height: CompositionOptions["height"];

  constructor({ canvasId, imgQuerySelector, options }: CompositionConstructor) {
    this.canvas = null;
    this.ctx = null;
    this.img = null;
    this.imgQuerySelector = imgQuerySelector;
    this.imageData = null;
    this.imageDataLength = 0;

    this.canvasId = canvasId;

    this.layers = [];

    this.width = options?.width || DEFAULT_WIDTH;
    this.height = options?.height || DEFAULT_HEIGHT;
  }

  init() {
    this.canvas = document.getElementById(
      this.canvasId,
    ) as HTMLCanvasElement | null;

    if (!this.canvas) throw new Error("canvas not defined");
    this.ctx = this.canvas.getContext("2d");

    this.img = document.querySelector(this.imgQuerySelector);

    if (!this.ctx) throw new Error("ctx not defined");
    if (!this.img) throw new Error("img not defined");
    this.ctx.drawImage(this.img, 0, 0, this.width, this.height);

    this.img.style.display = "none";

    this.imageData = this.ctx.getImageData(
      0,
      0,
      this.canvas.width,
      this.canvas.height,
    );
    this.imageDataLength = this.imageData.data.length;
  }

  addLayer(layer: Layer) {
    this.layers.push(layer);
  }

  addColorLayer(color: HexString): void {
    const rgbaArray = hexToRgba(color);
    const colorLayerData = getSolidColorData(this.imageDataLength, rgbaArray);
    const colorLayer = new Layer(colorLayerData);
    this.addLayer(colorLayer);
  }

  cutChannel(data: Uint8ClampedArray, channel: Channel): Uint8ClampedArray {
    return cutChannel(data, channel);
  }

  cutHue(data: Uint8ClampedArray, neededHue: number): Uint8ClampedArray {
    return cutHue(data, neededHue);
  }

  cutValue(data: Uint8ClampedArray, neededValue: number): Uint8ClampedArray {
    return cutValue(data, neededValue);
  }

  cutSaturation(
    data: Uint8ClampedArray,
    neededValue: number,
  ): Uint8ClampedArray {
    return cutSaturation(data, neededValue);
  }

  clearLayers() {
    this.layers = [];
  }

  private getTransformedLayers(layers: Array<Layer>): Array<Layer> {
    return layers.map((layer) =>
      transformedLayersMapper(layer, this.width, this.height),
    );
  }

  render() {
    if (!this.ctx) throw new Error("ctx is not defined");

    const transformedLayers = this.getTransformedLayers(this.layers);

    const mergedLayer = transformedLayers.reduce((bgLayer, fgLayer) =>
      mergedLayerReducer(this.imageDataLength, bgLayer, fgLayer),
    );

    const mergedLayersImageData = new ImageData(
      new Uint8ClampedArray(mergedLayer.data),
      this.width,
      this.height,
    );

    this.ctx.putImageData(mergedLayersImageData, 0, 0);
  }
}
