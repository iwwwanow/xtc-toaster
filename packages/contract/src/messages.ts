import { z } from "zod";
import { NodeIdSchema, ToastGraphSchema } from "./graph";

export const RequestIdSchema = z.int().min(0);

// ── client → server ──────────────────────────────────────────────

export const RenderMessageSchema = z.object({
  type: z.literal("render"),
  requestId: RequestIdSchema, // grows with every request
  graph: ToastGraphSchema,
});

export const ClientMessageSchema = RenderMessageSchema;
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

export const ServerMessageSchema = z.discriminatedUnion("type", [
  RenderedMessageSchema,
  RenderErrorMessageSchema,
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
export type RenderedMessage = z.infer<typeof RenderedMessageSchema>;
export type RenderErrorMessage = z.infer<typeof RenderErrorMessageSchema>;
