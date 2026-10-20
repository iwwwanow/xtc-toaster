import { join } from "node:path";
import {
  UPLOAD_MAX_BYTES,
  UPLOAD_MAX_MEGAPIXELS,
  type UploadError,
  type UploadResponse,
} from "@xtc-toaster/contract";
import { decodeImage, isPngOrJpeg } from "./codec";
import { makeRoom } from "./uploads-cleanup";

const uploadError = (error: UploadError["error"]) =>
  Response.json({ error } satisfies UploadError, { status: 400 });

// one save at a time: two concurrent uploads must not count the same free space
let saving: Promise<unknown> = Promise.resolve();

const save = (uploadsDir: string, imageId: string, bytes: Buffer, maxTotalBytes: number) => {
  const run = saving.then(async () => {
    await makeRoom(uploadsDir, bytes.length, maxTotalBytes);
    await Bun.write(join(uploadsDir, imageId), bytes);
  });
  saving = run.catch(() => {});
  return run;
};

// POST /api/images — multipart, field "file"
export const handleUpload = async (req: Request, uploadsDir: string, maxTotalBytes: number): Promise<Response> => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return uploadError("unsupported-format");
  if (file.size > UPLOAD_MAX_BYTES) return uploadError("too-large");

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!isPngOrJpeg(bytes)) return uploadError("unsupported-format");

  const dimensions = await decodeImage(bytes).catch(() => null);
  if (!dimensions) return uploadError("unsupported-format");
  const { width, height } = dimensions;
  if (width * height > UPLOAD_MAX_MEGAPIXELS * 1_000_000) return uploadError("too-large");

  // no extension — canvas detects the format from the content
  const imageId = crypto.randomUUID();
  await save(uploadsDir, imageId, bytes, maxTotalBytes);

  return Response.json({ imageId, width, height } satisfies UploadResponse, { status: 201 });
};
