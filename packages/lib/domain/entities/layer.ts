import { addHueNoise, boxBlur } from "../services/effects";
import {
  hueMask,
  saturationMask,
  valueMask,
  isolateChannel as isolateChannelService,
} from "../services/maskers";
import {
  applyAffineTransform,
  applyHomographyTransform,
  applyYRotationPerspective,
  homographyFromQuad,
} from "../services/transforms";
import { Matrix } from "../utils/matrix";
import type { Color } from "./color";
import type {
  BlendMode,
  Channel,
  EffectParams,
  ImageRawDataArray,
  LayerDimensions,
  LayerOptions,
  MaskParams,
  Opacity,
  Transform,
} from "../types";

export class Layer {
  private _imageData: ImageRawDataArray;
  private readonly _options: LayerOptions;

  constructor(
    imageData: ImageRawDataArray,
    private readonly dimensions: LayerDimensions,
    options: LayerOptions,
  ) {
    this._imageData = imageData;
    this._options = options;
  }

  // Read by Composition for render()/duplicateLayer() — Layer has no
  // setters for these besides the eager operations below.
  get imageData(): ImageRawDataArray {
    return this._imageData;
  }

  get options(): LayerOptions {
    return this._options;
  }

  setBlendMode(blendMode: BlendMode): void {
    this._options.blendMode = blendMode;
  }

  setOpacity(opacity: Opacity): void {
    this._options.opacity = opacity;
  }

  setTransform(transform: Transform): void {
    this._options.transform = transform;
    if (transform.name === "homography") {
      const matrix = new Matrix(3, 3, transform.params.matrix);
      this._imageData = applyHomographyTransform(this._imageData, this.dimensions, matrix);
    } else if (transform.name === "perspective") {
      const matrix = homographyFromQuad(this.dimensions, transform.params.corners);
      this._imageData = applyHomographyTransform(this._imageData, this.dimensions, matrix);
    } else if (transform.name === "yRotation") {
      const { angle, focalLength } = transform.params;
      const radians = (Math.PI / 180) * angle;
      this._imageData = applyYRotationPerspective(this._imageData, this.dimensions, radians, focalLength);
    } else {
      this._imageData = applyAffineTransform(this._imageData, this.dimensions, transform);
    }
  }

  // eager: применяется сразу к imageData, ничего не копится
  applyEffect(effect: EffectParams): void {
    switch (effect.name) {
      case "hueNoise":
        this._imageData = addHueNoise(this._imageData, effect.options);
        break;
      case "blur":
        this._imageData = boxBlur(this._imageData, this.dimensions.width, this.dimensions.height, effect.options.radius);
        break;
    }
  }

  // hue/saturation/value — RGB как есть, alpha = вес совпадения
  mask(params: MaskParams): void {
    switch (params.name) {
      case "hue":
        this._imageData = hueMask(
          this._imageData,
          params.value,
          params.tolerance,
        );
        break;
      case "saturation":
        this._imageData = saturationMask(
          this._imageData,
          params.value,
          params.tolerance,
        );
        break;
      case "value":
        this._imageData = valueMask(
          this._imageData,
          params.value,
          params.tolerance,
        );
        break;
    }
  }

  // НЕ маска, отдельная операция — см. isolateChannel в domain-services
  isolateChannel(channel: Channel): void {
    this._imageData = isolateChannelService(this._imageData, channel);
  }

  fill(color: Color): void {
    const [r, g, b, a] = color.normalized;
    for (let i = 0; i < this._imageData.length; i += 4) {
      this._imageData[i] = r * 255;
      this._imageData[i + 1] = g * 255;
      this._imageData[i + 2] = b * 255;
      this._imageData[i + 3] = a * 255;
    }
  }

  // Как fill, но сохраняет альфу — чтобы работать поверх маски.
  tint(color: Color): void {
    const [r, g, b] = color.normalized;
    for (let i = 0; i < this._imageData.length; i += 4) {
      this._imageData[i] = r * 255;
      this._imageData[i + 1] = g * 255;
      this._imageData[i + 2] = b * 255;
    }
  }
}
