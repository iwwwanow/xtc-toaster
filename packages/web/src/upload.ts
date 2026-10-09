import { UploadErrorSchema, UploadResponseSchema, type UploadResponse } from "@xtc-toaster/contract";

// POST /api/images — multipart, field "file"; throws with the response payload as `cause`
export const uploadImage = async (file: File): Promise<UploadResponse> => {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch("/api/images", { method: "POST", body });
  const payload: unknown = await response.json().catch(() => null);

  if (response.status === 201) return UploadResponseSchema.parse(payload);
  const error = UploadErrorSchema.safeParse(payload);
  throw new Error(error.success ? error.data.error : `http ${response.status}`, { cause: payload });
};
