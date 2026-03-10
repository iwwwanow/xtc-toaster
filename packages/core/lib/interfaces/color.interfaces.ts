export type ColorValue = number;
export type RgbaArray = [ColorValue, ColorValue, ColorValue, ColorValue];
export type RgbArray = [ColorValue, ColorValue, ColorValue];
export type HexString = string;

export type HueValue = number;
export type SaturationValue = number;
export type ValueValue = number;
export type LightnessValue = number;

export type HsvArray = [HueValue, SaturationValue, ValueValue];
export type HslArray = [HueValue, SaturationValue, LightnessValue];

export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface NormalColor {
  r: number;
  g: number;
  b: number;
  a: number;
}
