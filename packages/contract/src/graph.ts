import { z } from "zod";
import { LAYER_NAME_MAX, TOAST_GRAPH_VERSION } from "./constants";
import { ANIMATION_FPS, BLEND_MODES, CHANNELS, PARAMS, type ParamBounds } from "./params";

const ranged = ({ min, max }: ParamBounds) => z.number().min(min).max(max);

const uniqueIds = (what: string) => (rows: { id: string }[], ctx: z.RefinementCtx) => {
  rows.forEach(({ id }, index) => {
    if (rows.findIndex((row) => row.id === id) !== index)
      ctx.addIssue({ code: "custom", path: [index, "id"], message: `duplicate ${what} id` });
  });
};

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
    layers: z.array(LayerRowSchema).min(1).superRefine(uniqueIds("layer")),
  }),
});

// a value on a frame; frames count from 0, as the playhead. Whether the frame fits the node's `frames` and the
// value fits the linked param — validateGraph
export const AnimationKeySchema = z.object({ frame: z.int().min(0), value: z.number() });

// keys in any order; the param a track animates is the link into it (source + sourceHandle → targetHandle = id)
export const AnimationTrackSchema = z.object({ id: z.string().min(1), keys: z.array(AnimationKeySchema) });

// one or the other, absent — the format's default. Strict: a plain object would drop one of the two in silence
export const AnimationLoopSchema = z.union([
  z.strictObject({ reps: z.int().min(1) }),
  z.strictObject({ seconds: z.number().positive() }),
]);

// no pixels in or out: the output's ancestry never reaches it, a frame is the graph with values put into `data`
// (graphAtFrame). No max frames here — the cap is a server env (RENDER_MAX_FRAMES), per render
export const AnimationNodeSchema = z.object({
  id: NodeIdSchema,
  type: z.literal("animation"),
  data: z.object({
    fps: z.int().min(ANIMATION_FPS.min).max(ANIMATION_FPS.max),
    frames: z.int().min(1),
    loop: AnimationLoopSchema.optional(),
    tracks: z.array(AnimationTrackSchema).superRefine(uniqueIds("track")),
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
  AnimationNodeSchema,
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
export type AnimationNode = z.infer<typeof AnimationNodeSchema>;
export type AnimationTrack = z.infer<typeof AnimationTrackSchema>;
export type AnimationKey = z.infer<typeof AnimationKeySchema>;
export type AnimationLoop = z.infer<typeof AnimationLoopSchema>;
export type OutputNode = z.infer<typeof OutputNodeSchema>;

export const GraphEdgeSchema = z.object({
  id: z.string().min(1),
  source: NodeIdSchema,
  target: NodeIdSchema,
  // a param link into the animation node: the param's name; a pixel link has no field
  sourceHandle: z.string().min(1).optional(),
  // a layers edge: the layer row it goes into; a param link: the track; every other node has one unnamed handle (no field)
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
