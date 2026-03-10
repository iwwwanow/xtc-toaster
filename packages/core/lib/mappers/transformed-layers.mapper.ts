import type { Layer } from "../classes";
import { Transformation } from "../classes";
import type { TransformParams } from "../classes";

export const transformedLayersMapper = (
  layer: Layer,
  width: number,
  height: number,
) => {
  if (!layer.options?.transform?.type) return layer;
  const { type, params } = layer.options.transform;

  if (!params) throw new Error("params not defined");

  const transformation = new Transformation({
    type,
    params,
    // TODO: fix it
  } as TransformParams);

  const processedData = transformation.process(layer.data, width, height);
  layer.setData(processedData);
  return layer;
};
