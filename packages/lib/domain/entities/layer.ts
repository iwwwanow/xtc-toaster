import { boxBlur, colorNoise } from "../services/effects";
import { channel, selectBright, selectColor, selectVivid } from "../services/maskers";
import {
  applyAffineTransform,
  applyHomographyTransform,
  applyYRotationPerspective,
  homographyFromQuad,
} from "../services/transforms";
import { Matrix } from "../utils/matrix";
import type { Color } from "./color";
import type { BlendMode, Channel, ImageRawDataArray, LayerDimensions, LayerOptions, Opacity, Quad } from "../types";

// Flat: one method per graph node type, named the same (contract → server → lib, decided 01.11).
// Every operation is eager — it rewrites imageData at once, in call order; only opacity and the blend
// mode are kept and applied by Composition.render(). Units are lib's (px, 0–1 tolerances) — the server
// converts the contract's percent / mm.
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

  // --- select: RGB as is, alpha = the match weight (quadratic falloff) ---

  // hue in degrees (0–360), tolerance normalized to the wheel (0–1); grays don't count
  selectColor({ hue, tolerance }: { hue: number; tolerance?: number }): void {
    this._imageData = selectColor(this._imageData, hue, tolerance);
  }

  // saturation in percent (0–100), tolerance 0–1
  selectVivid({ saturation, tolerance }: { saturation: number; tolerance?: number }): void {
    this._imageData = selectVivid(this._imageData, saturation, tolerance);
  }

  // value (HSV brightness) in percent (0–100), tolerance 0–1
  selectBright({ value, tolerance }: { value: number; tolerance?: number }): void {
    this._imageData = selectBright(this._imageData, value, tolerance);
  }

  // one channel: the pixel turns that channel's pure color, the channel's value goes into alpha
  channel(channelName: Channel): void {
    this._imageData = channel(this._imageData, channelName);
  }

  // --- color ---

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

  // shifts every pixel's hue at random by up to deviationCoefficient (0–1) of the wheel — Math.random
  colorNoise({ deviationCoefficient }: { deviationCoefficient: number }): void {
    this._imageData = colorNoise(this._imageData, { deviationCoefficient });
  }

  // kept, not applied here: Composition.render() bakes it (0 — transparent, 1 — as is)
  opacity(opacity: Opacity): void {
    this._options.opacity = opacity;
  }

  // --- effect ---

  // box blur, radius in px
  blur({ radius }: { radius: number }): void {
    this._imageData = boxBlur(this._imageData, this.dimensions.width, this.dimensions.height, radius);
  }

  // --- move: backward mapping, rotate / scale / skew around the image center ---

  // px
  move({ x, y }: { x: number; y: number }): void {
    this._imageData = applyAffineTransform(this._imageData, this.dimensions, { name: "move", x, y });
  }

  // degrees
  rotate({ angle }: { angle: number }): void {
    this._imageData = applyAffineTransform(this._imageData, this.dimensions, { name: "rotate", angle });
  }

  // factors
  scale({ x, y }: { x: number; y: number }): void {
    this._imageData = applyAffineTransform(this._imageData, this.dimensions, { name: "scale", x, y });
  }

  // shear factors (tan of the lean angle): x leans the verticals, y the horizontals
  skew({ x, y }: { x: number; y: number }): void {
    this._imageData = applyAffineTransform(this._imageData, this.dimensions, { name: "skew", x, y });
  }

  // a perspective turn around the vertical axis: angle in degrees, focalLength in px
  turn3d({ angle, focalLength }: { angle: number; focalLength: number }): void {
    this._imageData = applyYRotationPerspective(this._imageData, this.dimensions, (Math.PI / 180) * angle, focalLength);
  }

  // where the picture's corners land, px: TL TR BR BL
  corners(corners: Quad): void {
    this._imageData = applyHomographyTransform(this._imageData, this.dimensions, homographyFromQuad(this.dimensions, corners));
  }

  // a raw 3×3 homography, row-major, [x, y, 1] · H — the translation is the last row
  matrix(matrix: number[]): void {
    this._imageData = applyHomographyTransform(this._imageData, this.dimensions, new Matrix(3, 3, matrix));
  }

  // --- layers: how the layer lies on the ones below (a layers node row) ---

  setBlendMode(blendMode: BlendMode): void {
    this._options.blendMode = blendMode;
  }
}
