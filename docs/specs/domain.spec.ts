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

  // flat: one method per graph node type, the same name (contract → server → lib, 01.11); every one
  // eager — rewrites imageData at once, in call order; units are lib's (px, 0–1 tolerances)

  // select — RGB как есть, alpha = вес совпадения
  selectColor(params: { hue: number; tolerance?: number }) {} // hue 0–360, tolerance 0–1 of the wheel
  selectVivid(params: { saturation: number; tolerance?: number }) {} // saturation 0–100
  selectBright(params: { value: number; tolerance?: number }) {} // value 0–100
  channel(channel: Channel) {} // НЕ маска, отдельная операция — см. channel ниже

  // color
  fill(color: Color) {}
  tint(color: Color) {} // как fill, alpha сохраняется
  colorNoise(params: { deviationCoefficient: number }) {} // Math.random
  opacity(opacity: Opacity) {} // kept in options, baked by Composition.render()

  // effect
  blur(params: { radius: number }) {} // px

  // move — backward mapping; rotate / scale / skew around the image center
  move(params: { x: number; y: number }) {} // px
  rotate(params: { angle: number }) {} // degrees
  scale(params: { x: number; y: number }) {} // factors
  skew(params: { x: number; y: number }) {} // shear factors: x leans the verticals, y the horizontals
  turn3d(params: { angle: number; focalLength: number }) {} // degrees, px
  corners(corners: Quad) {} // TL TR BR BL, px
  matrix(matrix: number[]) {} // 3×3 row-major homography

  // layers
  setBlendMode(blendMode: BlendMode) {}
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

interface LayerOptions {
  blendMode?: BlendMode;
  opacity?: Opacity;
}

enum Channel {
  Red = "red",
  Green = "green",
  Blue = "blue",
  Alpha = "alpha",
}

type BlendMode = "normal" | "add" | "lch-hue";
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

const selectColor = (data: ImageRawDataArray, hue: number, tolerance?: number): ImageRawDataArray => {};
const selectVivid = (data: ImageRawDataArray, saturation: number, tolerance?: number): ImageRawDataArray => {};
const selectBright = (data: ImageRawDataArray, value: number, tolerance?: number): ImageRawDataArray => {};

// НЕ маска: RGB заменяется на цвет-индикатор канала, значение канала уходит в alpha.
// Другое поведение чем у masker'ов — сознательно отдельная функция, не объединяем.
const channel = (data: ImageRawDataArray, channel: Channel): ImageRawDataArray => {};

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
