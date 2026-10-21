import { beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { makeRoom, removeExpired } from "./uploads-cleanup";

const DIR = resolve(import.meta.dirname, "../tests/output/uploads-cleanup");
const HOUR = 3_600_000;
const NOW = Date.now();

// `name`, `size` bytes, modified `ageHours` ago
const put = async (name: string, size: number, ageHours: number) => {
  const path = join(DIR, name);
  await writeFile(path, new Uint8Array(size));
  const time = new Date(NOW - ageHours * HOUR);
  await utimes(path, time, time);
};

const names = async () => (await readdir(DIR)).sort();

beforeEach(async () => {
  await rm(DIR, { recursive: true, force: true });
  await mkdir(DIR, { recursive: true });
});

describe("removeExpired", () => {
  test("removes files older than the ttl, keeps the rest", async () => {
    await put("old", 10, 25);
    await put("fresh", 10, 1);
    expect(await removeExpired(DIR, 24 * HOUR, NOW)).toBe(1);
    expect(await names()).toEqual(["fresh"]);
  });

  test("empty dir — nothing to do", async () => {
    expect(await removeExpired(DIR, HOUR, NOW)).toBe(0);
  });
});

describe("makeRoom", () => {
  test("under the quota — nothing goes", async () => {
    await put("a", 30, 2);
    await put("b", 30, 1);
    expect(await makeRoom(DIR, 40, 100)).toBe(0);
    expect(await names()).toEqual(["a", "b"]);
  });

  test("over the quota — the oldest go first, until the new file fits", async () => {
    await put("oldest", 30, 3);
    await put("middle", 30, 2);
    await put("newest", 30, 1);
    expect(await makeRoom(DIR, 50, 100)).toBe(2);
    expect(await names()).toEqual(["newest"]);
  });

  test("a file bigger than the quota clears everything", async () => {
    await put("a", 30, 1);
    expect(await makeRoom(DIR, 200, 100)).toBe(1);
    expect(await names()).toEqual([]);
  });
});
