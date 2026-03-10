export interface CompositionConstructor {
  canvasId: string;
  imgQuerySelector: string;
  options?: CompositionOptions;
}

export interface CompositionOptions {
  width: number;
  height: number;
}

export enum Channel {
  Red = "red",
  Green = "green",
  Blue = "blue",
  Alpha = "alpha",
}

export enum BlendMod {
  normal = "normal",
  add = "add",
}
