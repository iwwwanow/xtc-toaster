import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { AnimationFormat } from "@xtc-toaster/contract";

// Rendered animations live next to the uploads (the only disk in prod), in a directory of their own: per job a
// frame sequence directory, removed once the file is made, and the file (gif / mp4). The files are kept for good
// (decided 07.11) — no TTL, the uploads' quota doesn't count them. A sequence directory outlives its job only when the process dies
// mid-render; one untouched for FRAMES_TTL_MS is such a leftover (a live job writes a frame every few seconds)
export const FRAMES_TTL_MS = 15 * 60_000;

export const animationsDir = (uploadsDir: string) => join(uploadsDir, "animations");

// `name` — the file's name in the directory, also its url's last part
export type AnimationJob = { id: string; framesDir: string; name: string; filePath: string };

export const createAnimationJob = async (uploadsDir: string, format: AnimationFormat): Promise<AnimationJob> => {
  const id = crypto.randomUUID();
  const dir = animationsDir(uploadsDir);
  const name = `${id}.${format}`;
  const job = { id, framesDir: join(dir, id), name, filePath: join(dir, name) };
  await mkdir(job.framesDir, { recursive: true });
  return job;
};

export const removeFrames = (job: AnimationJob) => rm(job.framesDir, { recursive: true, force: true });

export const removeFile = (job: AnimationJob) => rm(job.filePath, { force: true });

// sequence directories of jobs cut short by a crash, untouched for ttlMs, go; the files stay
export const removeLeftoverFrames = async (uploadsDir: string, ttlMs = FRAMES_TTL_MS, now = Date.now()) => {
  const dir = animationsDir(uploadsDir);
  const names = await readdir(dir).catch(() => []);
  const expired = await Promise.all(
    names.map(async (name) => {
      const path = join(dir, name);
      const info = await stat(path).catch(() => null);
      return info?.isDirectory() && now - info.mtimeMs > ttlMs ? path : null;
    }),
  );
  const paths = expired.filter((path) => path !== null);
  await Promise.all(paths.map((path) => rm(path, { recursive: true, force: true })));
  return paths.length;
};

const FILE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(gif|mp4)$/;
const CONTENT_TYPES: Record<AnimationFormat, string> = { gif: "image/gif", mp4: "video/mp4" };

// null — not a name this server makes (the name builds the path), or it's gone
export const findAnimation = async (uploadsDir: string, name: string) => {
  const format = FILE_NAME.exec(name)?.[1] as AnimationFormat | undefined;
  if (!format) return null;
  const file = Bun.file(join(animationsDir(uploadsDir), name));
  return (await file.exists()) ? { file, contentType: CONTENT_TYPES[format] } : null;
};
