import { z } from "zod";
import { TOAST_GRAPH_VERSION } from "./constants";

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

export const NoizeNodeSchema = z.object({
  id: NodeIdSchema,
  type: z.literal("noize"),
  data: z.object({ deviationCoefficient: z.number().min(0).max(1) }),
});

export const OutputNodeSchema = z.object({
  id: NodeIdSchema,
  type: z.literal("output"),
  data: z.object({}),
});

export const GraphNodeSchema = z.discriminatedUnion("type", [
  InputNodeSchema,
  NoizeNodeSchema,
  OutputNodeSchema,
]);
export type GraphNode = z.infer<typeof GraphNodeSchema>;
export type InputNode = z.infer<typeof InputNodeSchema>;
export type NoizeNode = z.infer<typeof NoizeNodeSchema>;
export type OutputNode = z.infer<typeof OutputNodeSchema>;

export const GraphEdgeSchema = z.object({
  id: z.string().min(1),
  source: NodeIdSchema,
  target: NodeIdSchema,
});
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

// also the toast file format (presets, export / import)
export const ToastGraphSchema = z.object({
  version: z.literal(TOAST_GRAPH_VERSION),
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
});
export type ToastGraph = z.infer<typeof ToastGraphSchema>;

// throws ZodError
export const parseToastGraph = (data: unknown): ToastGraph =>
  ToastGraphSchema.parse(data);
