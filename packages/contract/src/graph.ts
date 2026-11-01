import { z } from "zod";
import { LAYER_NAME_MAX, TOAST_GRAPH_VERSION } from "./constants";
import { BLEND_MODES, CHANNELS, PARAMS, type ParamBounds } from "./params";

const ranged = ({ min, max }: ParamBounds) => z.number().min(min).max(max);

export const NodeIdSchema = z.string().min(1);
export type NodeId = z.infer<typeof NodeIdSchema>;

// server builds a file path from it — must stay a uuid
export const ImageIdSchema = z.uuid();
export type ImageId = z.infer<typeof ImageIdSchema>;

export const InputNodeSchema = z.object({
  id: NodeIdSchema,
  type: z.literal("input"),
  data: z.object({ imageId: ImageIdSchema.nullable() }),
});

export const HueNoiseNodeSchema = z.object({
  id: NodeIdSchema,
  type: z.literal("colorNoise"),
  data: z.object({ deviationCoefficient: ranged(PARAMS.colorNoise.deviationCoefficient) }),
});

export const HueMaskNodeSchema = z.object({
  id: NodeIdSchema,
  type: z.literal("selectColor"),
  data: z.object({ hue: ranged(PARAMS.selectColor.hue), tolerance: ranged(PARAMS.selectColor.tolerance) }),
});

export const YRotationNodeSchema = z.object({
  id: NodeIdSchema,
  type: z.literal("turn3d"),
  data: z.object({
    angle: ranged(PARAMS.turn3d.angle),
    focalLength: ranged(PARAMS.turn3d.focalLength),
  }),
});

export const BlurNodeSchema = z.object({
  id: NodeIdSchema,
  type: z.literal("blur"),
  data: z.object({ radius: ranged(PARAMS.blur.radius) }),
});

export const SaturationMaskNodeSchema = z.object({
  id: NodeIdSchema,
  type: z.literal("selectVivid"),
  data: z.object({
    saturation: ranged(PARAMS.selectVivid.saturation),
    tolerance: ranged(PARAMS.selectVivid.tolerance),
  }),
});

export const ValueMaskNodeSchema = z.object({
  id: NodeIdSchema,
  type: z.literal("selectBright"),
  data: z.object({ value: ranged(PARAMS.selectBright.value), tolerance: ranged(PARAMS.selectBright.tolerance) }),
});

export const ChannelNodeSchema = z.object({
  id: NodeIdSchema,
  type: z.literal("channel"),
  data: z.object({ channel: z.enum(CHANNELS) }),
});

export const MoveNodeSchema = z.object({
  id: NodeIdSchema,
  type: z.literal("move"),
  data: z.object({ x: ranged(PARAMS.move.x), y: ranged(PARAMS.move.y) }),
});

export const RotateNodeSchema = z.object({
  id: NodeIdSchema,
  type: z.literal("rotate"),
  data: z.object({ angle: ranged(PARAMS.rotate.angle) }),
});

export const ScaleNodeSchema = z.object({
  id: NodeIdSchema,
  type: z.literal("scale"),
  data: z.object({ x: ranged(PARAMS.scale.x), y: ranged(PARAMS.scale.y) }),
});

export const SkewNodeSchema = z.object({
  id: NodeIdSchema,
  type: z.literal("skew"),
  data: z.object({ x: ranged(PARAMS.skew.x), y: ranged(PARAMS.skew.y) }),
});

export const CornersNodeSchema = z.object({
  id: NodeIdSchema,
  type: z.literal("corners"),
  data: z.object(
    Object.fromEntries(Object.entries(PARAMS.corners).map(([name, bounds]) => [name, ranged(bounds)])) as {
      [K in keyof typeof PARAMS.corners]: z.ZodNumber;
    },
  ),
});

// 3×3, row-major, px of the image, lib convention: [x, y, 1] · H — the translation is the last row.
// No bounds: any finite numbers; a singular matrix is a render-error on the node
export const MatrixNodeSchema = z.object({
  id: NodeIdSchema,
  type: z.literal("matrix"),
  data: z.object({ matrix: z.array(z.number()).length(9) }),
});

// #rrggbb — what <input type="color"> gives
const HexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);

export const FillNodeSchema = z.object({
  id: NodeIdSchema,
  type: z.literal("fill"),
  data: z.object({ color: HexColorSchema }),
});

export const TintNodeSchema = z.object({
  id: NodeIdSchema,
  type: z.literal("tint"),
  data: z.object({ color: HexColorSchema }),
});

export const OpacityNodeSchema = z.object({
  id: NodeIdSchema,
  type: z.literal("opacity"),
  data: z.object({ opacity: ranged(PARAMS.opacity.opacity) }),
});

// a layer row: its own target handle (id) and blend mode; name — set by the user, none → derived from
// the id (it moves with the row); visible: false — skipped like an unlinked row
export const LayerRowSchema = z.object({
  id: z.string().min(1),
  blendMode: z.enum(BLEND_MODES),
  name: z.string().min(1).max(LAYER_NAME_MAX).optional(),
  visible: z.boolean().optional(),
});

// layers top first; no max here — the cap is a server env (RENDER_MAX_LAYERS), per render
export const LayersNodeSchema = z.object({
  id: NodeIdSchema,
  type: z.literal("layers"),
  data: z.object({
    layers: z
      .array(LayerRowSchema)
      .min(1)
      .superRefine((layers, ctx) => {
        layers.forEach(({ id }, index) => {
          if (layers.findIndex((layer) => layer.id === id) !== index)
            ctx.addIssue({ code: "custom", path: [index, "id"], message: "duplicate layer id" });
        });
      }),
  }),
});

export const OutputNodeSchema = z.object({
  id: NodeIdSchema,
  type: z.literal("output"),
  data: z.object({}),
});

export const GraphNodeSchema = z.discriminatedUnion("type", [
  InputNodeSchema,
  HueNoiseNodeSchema,
  HueMaskNodeSchema,
  YRotationNodeSchema,
  BlurNodeSchema,
  SaturationMaskNodeSchema,
  ValueMaskNodeSchema,
  ChannelNodeSchema,
  MoveNodeSchema,
  RotateNodeSchema,
  ScaleNodeSchema,
  SkewNodeSchema,
  CornersNodeSchema,
  MatrixNodeSchema,
  FillNodeSchema,
  TintNodeSchema,
  OpacityNodeSchema,
  LayersNodeSchema,
  OutputNodeSchema,
]);
export type GraphNode = z.infer<typeof GraphNodeSchema>;
export type InputNode = z.infer<typeof InputNodeSchema>;
export type HueNoiseNode = z.infer<typeof HueNoiseNodeSchema>;
export type HueMaskNode = z.infer<typeof HueMaskNodeSchema>;
export type YRotationNode = z.infer<typeof YRotationNodeSchema>;
export type BlurNode = z.infer<typeof BlurNodeSchema>;
export type SaturationMaskNode = z.infer<typeof SaturationMaskNodeSchema>;
export type ValueMaskNode = z.infer<typeof ValueMaskNodeSchema>;
export type ChannelNode = z.infer<typeof ChannelNodeSchema>;
export type MoveNode = z.infer<typeof MoveNodeSchema>;
export type RotateNode = z.infer<typeof RotateNodeSchema>;
export type ScaleNode = z.infer<typeof ScaleNodeSchema>;
export type SkewNode = z.infer<typeof SkewNodeSchema>;
export type CornersNode = z.infer<typeof CornersNodeSchema>;
export type MatrixNode = z.infer<typeof MatrixNodeSchema>;
export type FillNode = z.infer<typeof FillNodeSchema>;
export type TintNode = z.infer<typeof TintNodeSchema>;
export type OpacityNode = z.infer<typeof OpacityNodeSchema>;
export type LayersNode = z.infer<typeof LayersNodeSchema>;
export type LayerRow = z.infer<typeof LayerRowSchema>;
export type BlendMode = LayerRow["blendMode"];
export type OutputNode = z.infer<typeof OutputNodeSchema>;

export const GraphEdgeSchema = z.object({
  id: z.string().min(1),
  source: NodeIdSchema,
  target: NodeIdSchema,
  // a layers edge: the layer row it goes into; every other node has one unnamed handle (no field)
  targetHandle: z.string().min(1).optional(),
});
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

// also the toast file format (presets, export / import). The link rules are validateGraph, called apart —
// TODO: into a superRefine here, docs/backlog/2026-11-01_validate-graph-into-zod.md
export const ToastGraphSchema = z.object({
  version: z.literal(TOAST_GRAPH_VERSION),
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
});
export type ToastGraph = z.infer<typeof ToastGraphSchema>;

// throws ZodError
export const parseToastGraph = (data: unknown): ToastGraph =>
  ToastGraphSchema.parse(data);
