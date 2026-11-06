import { z } from "zod";
import { NodeIdSchema, ToastGraphSchema } from "./graph";

export const RequestIdSchema = z.int().min(0);

// ── client → server ──────────────────────────────────────────────

export const RenderMessageSchema = z.object({
  type: z.literal("render"),
  requestId: RequestIdSchema, // grows with every request
  graph: ToastGraphSchema,
});

// the gif of one cycle of the graph's animation node — every frame in a row, then the result as a file over http
export const RenderAnimationMessageSchema = z.object({
  type: z.literal("render-animation"),
  requestId: RequestIdSchema,
  graph: ToastGraphSchema,
});

export const ClientMessageSchema = z.discriminatedUnion("type", [RenderMessageSchema, RenderAnimationMessageSchema]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// throws ZodError; takes already JSON-parsed data
export const parseClientMessage = (data: unknown): ClientMessage =>
  ClientMessageSchema.parse(data);

// ── server → client ──────────────────────────────────────────────

export const RenderedMessageSchema = z.object({
  type: z.literal("rendered"),
  requestId: RequestIdSchema,
  width: z.int().positive(),
  height: z.int().positive(),
  png: z.base64(),
});

export const RenderErrorMessageSchema = z.object({
  type: z.literal("render-error"),
  requestId: RequestIdSchema.nullable(), // null — the message was not parseable enough to read it
  nodeId: NodeIdSchema.optional(),
  message: z.string(),
});

// after each rendered frame of a render-animation; `frame` frames of `frames` are done
export const AnimationProgressMessageSchema = z.object({
  type: z.literal("animation-progress"),
  requestId: RequestIdSchema,
  frame: z.int().min(1),
  frames: z.int().min(1),
});

// the gif is a file: `url` is the path to GET it from (a 2 MP clip is tens of MB — too much for one ws message),
// kept on the server for a while (ANIMATION_TTL_MS on the server), the client saves it right away
export const AnimationRenderedMessageSchema = z.object({
  type: z.literal("animation-rendered"),
  requestId: RequestIdSchema,
  url: z.string().startsWith("/"),
});

export const ServerMessageSchema = z.discriminatedUnion("type", [
  RenderedMessageSchema,
  RenderErrorMessageSchema,
  AnimationProgressMessageSchema,
  AnimationRenderedMessageSchema,
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
export type RenderedMessage = z.infer<typeof RenderedMessageSchema>;
export type RenderErrorMessage = z.infer<typeof RenderErrorMessageSchema>;
export type AnimationProgressMessage = z.infer<typeof AnimationProgressMessageSchema>;
export type AnimationRenderedMessage = z.infer<typeof AnimationRenderedMessageSchema>;
