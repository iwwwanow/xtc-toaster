import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

// A public upload fills the disk without these; docker can't cap a bind mount's size,
// so the app does it. An expired / evicted picture → the usual `image not found`.
export type UploadsLimits = {
  ttlMs: number;
  maxTotalBytes: number;
};

type StoredFile = { path: string; size: number; mtimeMs: number };

// oldest first
const listFiles = async (dir: string): Promise<StoredFile[]> => {
  const names = await readdir(dir);
  const files = await Promise.all(
    names.map(async (name) => {
      const path = join(dir, name);
      const info = await stat(path).catch(() => null);
      return info?.isFile() ? { path, size: info.size, mtimeMs: info.mtimeMs } : null;
    }),
  );
  return files.filter((file) => file !== null).sort((a, b) => a.mtimeMs - b.mtimeMs);
};

const remove = (files: StoredFile[]) => Promise.all(files.map(({ path }) => rm(path, { force: true })));

// files older than ttlMs go
export const removeExpired = async (dir: string, ttlMs: number, now = Date.now()) => {
  const expired = (await listFiles(dir)).filter(({ mtimeMs }) => now - mtimeMs > ttlMs);
  await remove(expired);
  return expired.length;
};

// before saving `incomingBytes`: the oldest files go until the new one fits
export const makeRoom = async (dir: string, incomingBytes: number, maxTotalBytes: number) => {
  const files = await listFiles(dir);
  let total = files.reduce((sum, { size }) => sum + size, 0) + incomingBytes;
  const evicted: StoredFile[] = [];
  for (const file of files) {
    if (total <= maxTotalBytes) break;
    evicted.push(file);
    total -= file.size;
  }
  await remove(evicted);
  return evicted.length;
};
