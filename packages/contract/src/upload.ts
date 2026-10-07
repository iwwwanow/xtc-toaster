import { z } from "zod";
import { ImageIdSchema } from "./graph";

// POST /api/images   multipart, field "file"

// 201
export const UploadResponseSchema = z.object({
  imageId: ImageIdSchema,
  width: z.int().positive(),
  height: z.int().positive(),
});
export type UploadResponse = z.infer<typeof UploadResponseSchema>;

// 400
export const UploadErrorSchema = z.object({
  error: z.enum(["unsupported-format", "too-large"]),
});
export type UploadError = z.infer<typeof UploadErrorSchema>;

export const UPLOAD_MAX_MEGAPIXELS = 2;
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
