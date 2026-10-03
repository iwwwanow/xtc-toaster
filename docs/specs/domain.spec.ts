// не хочу делать на этом уровне связку с canvas из браузерного слоя. лишнее
class Composition {
  constructor(
    private width: number,
    private height: number,
    private layers: Array<Layer> = [],
  ) {}

  createLayerFromPixelData(pixelData: ImageRawDataArray): Layer {}
  createBlankLayer(): Layer {} // полностью прозрачный слой (RGBA = 0), под размер композиции
  createColorLayer(color: Color): Layer {} // createBlankLayer() + layer.fill(color)
  duplicateLayer(layer: Layer): Layer {} // deep copy: новый буфер (new Uint8ClampedArray(layer.imageData)), ни с чем памятью не делится

  // - clearLayers()

  render(): ImageRawDataArray {}
}

interface LayerDimensions {
  width: number;
  height: number;
}

class Layer {
  constructor(
    private imageData: ImageRawDataArray,
    private dimensions: LayerDimensions, // зарезервированные, неизменяемые — сеттеров нет
    private options: LayerOptions,
  ) {}

  setBlendMode(blendMode: BlendMode) {}
  setOpacity(opacity: Opacity) {}
  setTransform(transform: Transform) {}

  applyEffect(effect: EffectParams) {} // eager: сразу применяется к imageData, ничего не копится

  mask(params: MaskParams) {} // hue/saturation/value — RGB как есть, alpha = вес совпадения
  isolateChannel(channel: Channel) {} // НЕ маска, отдельная операция — см. isolateChannel ниже

  fill(color: Color) {}
  // - clearLayer()
}

class Color {
  constructor(rgbaArray: RgbaPixel) {}

  static fromHex(hex: HexString): Color {}
  static fromRgb(rgb: RgbPixel): Color {}
  static fromUintArray(data: ImageRawDataArray, pixelIndex: number): Color {}

  get normalized(): RgbaNormalizedPixel {}
  get hex(): HexString {}
}

type Transform =
  | { name: "translate"; params: { tx: number; ty: number } }
  | { name: "rotate"; params: { alpha: number } }
  | { name: "scale"; params: { scaleX: number; scaleY: number } }
  | { name: "skew"; params: { tx: number; ty: number } };

// isolateChannel сюда не входит — не маска, другая операция
type MaskParams =
  | { name: "hue"; value: number }
  | { name: "saturation"; value: number }
  | { name: "value"; value: number };

type EffectParams = {
  name: "noize";
  options: { deviationCoefficient: number }; // alpha всегда сохраняется (preserveAlpha удалён 2026-10-03)
};

interface LayerOptions {
  blendMode?: BlendMode;
  opacity?: Opacity;
  transform?: Transform;
}

enum Channel {
  Red = "red",
  Green = "green",
  Blue = "blue",
  Alpha = "alpha",
}

type BlendMode = "normal" | "add";
type Opacity = number; // 0-1

type ImageRawDataArray = Uint8ClampedArray;
type HexString = string;
type RgbPixel = [number, number, number];
type RgbaPixel = [number, number, number, number];
type RgbaNormalizedPixel = [number, number, number, number]; // 0-1, с alpha
type HslPixel = [number, number, number];
type HsvPixel = [number, number, number];

// ── domain-services ─────────────────────────────────────────────────────────
// Только из методов Layer/Composition. Примитивы на входе/выходе, ничего не
// знают о Layer/Composition/Color.

// maskers — RGB не трогают, alpha = вес совпадения (0-255)
const hsvMask = (
  data: ImageRawDataArray,
  componentIndex: 0 | 1 | 2, // 0=hue, 1=saturation, 2=value
  target: number, // normalized 0-1
  tolerance: number, // normalized 0-1, половина ширины полосы отбора
  circular: boolean, // true только для hue — полоса замкнута в кольцо (0 и 360 соседи)
): ImageRawDataArray => {};

const hueMask = (data: ImageRawDataArray, hue: number): ImageRawDataArray => {};
const saturationMask = (data: ImageRawDataArray, saturation: number): ImageRawDataArray => {};
const valueMask = (data: ImageRawDataArray, value: number): ImageRawDataArray => {};

// НЕ маска: RGB заменяется на цвет-индикатор канала, значение канала уходит в alpha.
// Другое поведение чем у masker'ов — сознательно отдельная функция, не объединяем.
const isolateChannel = (data: ImageRawDataArray, channel: Channel): ImageRawDataArray => {};

// composers — блендинг двух слоёв
const alphaCompose = (bgData: ImageRawDataArray, fgData: ImageRawDataArray): ImageRawDataArray => {};
const addCompose = (bgData: ImageRawDataArray, fgData: ImageRawDataArray): ImageRawDataArray => {};

// effects
const addHueNoise = (
  data: ImageRawDataArray,
  options: EffectParams["options"],
): ImageRawDataArray => {};

// transforms
const applyAffineTransform = (
  data: ImageRawDataArray,
  dimensions: LayerDimensions,
  transform: Transform,
): ImageRawDataArray => {};

const applyYRotationPerspective = (
  data: ImageRawDataArray,
  dimensions: LayerDimensions,
  angleRad: number,
  focalLength: number,
): ImageRawDataArray => {};

// reducer — примитивы; opacity уже должна быть запечена в alpha до вызова
const mergeLayerData = (
  dataLength: number,
  bgData: ImageRawDataArray,
  fgData: ImageRawDataArray,
  fgBlendMode: BlendMode,
): ImageRawDataArray => {};

// ── utils ────────────────────────────────────────────────────────────────────
// Domain-agnostic, лежат уровнем ниже domain-services и ничего доменного не
// импортируют — только наоборот.

// math
class Matrix {
  constructor(
    private width: number,
    private height: number,
    private data: Array<number>,
  ) {}

  getItem(column: number, row: number): number {}
  setItem(column: number, row: number, value: number) {}
  static multiply(a: Matrix, b: Matrix): Matrix {}
}

const alphaComposing = (
  fgColor: number,
  fgAlpha: number,
  bgColor: number,
  bgAlpha: number,
  resultAlpha: number,
): number => {};

// color-space-utils
const hexToRgb = (hex: HexString): RgbPixel => {};
const hexToRgba = (hex: HexString, alpha?: number): RgbaPixel => {};
const rgbToHsl = (rgb: RgbPixel): HslPixel => {};
const hslToRgb = (hsl: HslPixel): RgbPixel => {};
const rgbToHsv = (rgb: RgbPixel): HsvPixel => {};
const getChannelIndex = (channel: Channel): number => {};
