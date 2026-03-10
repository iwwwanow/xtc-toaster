export enum TransformType {
  Translate = "translate",
  Rotate = "rotate",
  Scale = "scale",
  Skew = "skew",
}

export interface TranslateParams {
  tx: number;
  ty: number;
}

export interface RotateParams {
  alpha: number;
}

export interface ScaleParams {
  scaleX: number;
  scaleY: number;
}

export interface SkewParams {
  tx: number;
  ty: number;
}

export type TransformTypeParams =
  | TranslateParams
  | RotateParams
  | ScaleParams
  | SkewParams;

export type TransformParams =
  | { type: TransformType.Translate; params: TranslateParams }
  | { type: TransformType.Rotate; params: RotateParams }
  | { type: TransformType.Scale; params: ScaleParams }
  | { type: TransformType.Skew; params: SkewParams };
