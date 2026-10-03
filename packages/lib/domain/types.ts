export enum Channel {
  Red = "red",
  Green = "green",
  Blue = "blue",
  Alpha = "alpha",
}

export type BlendMode = "normal" | "add" | "lch-hue";
export type Opacity = number; // 0-1

export type ImageRawDataArray = Uint8ClampedArray;
export type HexString = string;
export type RgbPixel = [number, number, number];
export type RgbaPixel = [number, number, number, number];
export type RgbaNormalizedPixel = [number, number, number, number]; // 0-1, с alpha
// HSL — нормализован (H/S/L все 0-1). HSV — H в градусах (0-360), S/V в процентах (0-100).
// Разные конвенции унаследованы от legacy-реализации, сохранены для 1:1 портирования.
export type HslPixel = [number, number, number];
export type HsvPixel = [number, number, number];

export interface LayerDimensions {
  readonly width: number;
  readonly height: number;
}

// Clockwise from top-left: TL, TR, BR, BL
export type Point2D = { x: number; y: number };
export type Quad = [Point2D, Point2D, Point2D, Point2D];

export type Transform =
  | { name: "translate"; params: { tx: number; ty: number } }
  | { name: "rotate"; params: { alpha: number } }
  | { name: "scale"; params: { scaleX: number; scaleY: number } }
  | { name: "skew"; params: { tx: number; ty: number } }
  | { name: "homography"; params: { matrix: number[] } }    // 9 elements, row-major 3×3
  | { name: "perspective"; params: { corners: Quad } };     // TL TR BR BL in output space

// isolateChannel сюда не входит — не маска, другая операция
export type MaskParams =
  | { name: "hue"; value: number; tolerance?: number }
  | { name: "saturation"; value: number; tolerance?: number }
  | { name: "value"; value: number; tolerance?: number };

export type EffectParams =
  | { name: "noize"; options: { deviationCoefficient: number } }
  | { name: "blur"; options: { radius: number } };

export interface LayerOptions {
  blendMode?: BlendMode;
  opacity?: Opacity;
  transform?: Transform;
}
