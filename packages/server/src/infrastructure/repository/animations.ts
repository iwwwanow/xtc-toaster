import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

// Rendered animations live next to the uploads (the only disk in prod), in a directory of their own: per job a
// frame sequence directory, removed once the gif is made, and the gif. The client fetches the gif right after
// the render — the gifs are only kept a short while, the uploads' quota doesn't count them.
export const ANIMATION_TTL_MS = 15 * 60_000;

export const animationsDir = (uploadsDir: string) => join(uploadsDir, "animations");

export type AnimationJob = { id: string; framesDir: string; gifPath: string };

export const createAnimationJob = async (uploadsDir: string): Promise<AnimationJob> => {
  const id = crypto.randomUUID();
  const dir = animationsDir(uploadsDir);
  const job = { id, framesDir: join(dir, id), gifPath: join(dir, `${id}.gif`) };
  await mkdir(job.framesDir, { recursive: true });
  return job;
};

export const removeFrames = (job: AnimationJob) => rm(job.framesDir, { recursive: true, force: true });

export const removeGif = (job: AnimationJob) => rm(job.gifPath, { force: true });

// gifs and sequence directories (a job cut short by a crash) older than ttlMs go
export const removeExpiredAnimations = async (uploadsDir: string, ttlMs = ANIMATION_TTL_MS, now = Date.now()) => {
  const dir = animationsDir(uploadsDir);
  const names = await readdir(dir).catch(() => []);
  const expired = await Promise.all(
    names.map(async (name) => {
      const path = join(dir, name);
      const info = await stat(path).catch(() => null);
      return info && now - info.mtimeMs > ttlMs ? path : null;
    }),
  );
  const paths = expired.filter((path) => path !== null);
  await Promise.all(paths.map((path) => rm(path, { recursive: true, force: true })));
  return paths.length;
};

const GIF_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.gif$/;

// null — not a gif name this server makes (the name builds the path), or it's gone
export const findGif = async (uploadsDir: string, name: string) => {
  if (!GIF_NAME.test(name)) return null;
  const file = Bun.file(join(animationsDir(uploadsDir), name));
  return (await file.exists()) ? file : null;
};
