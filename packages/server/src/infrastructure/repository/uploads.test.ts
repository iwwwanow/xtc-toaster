import { beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadUpload, removeExpired, saveUpload } from "./uploads";

// its own dir: beforeEach wipes it, tests/server.test.ts keeps its pictures in output/uploads
const DIR = resolve(import.meta.dirname, "../../../tests/output/uploads-repository");
const FIXTURE_PATH = resolve(import.meta.dirname, "../../../../lib/tests/fixtures/poppies.jpg");
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

describe("loadUpload", () => {
  test("decodes the stored picture", async () => {
    await saveUpload(DIR, "picture", Buffer.from(await Bun.file(FIXTURE_PATH).arrayBuffer()), 1_000_000);
    const { data, width, height } = (await loadUpload(DIR, "picture"))!;
    expect([width, height]).toEqual([250, 359]);
    expect(data.length).toBe(250 * 359 * 4);
  });

  test("a file that is gone — null, not an error", async () => {
    expect(await loadUpload(DIR, "gone")).toBeNull();
  });

  test("a broken file is still an error", async () => {
    await put("broken", 10, 1);
    await expect(loadUpload(DIR, "broken")).rejects.toThrow();
  });
});

describe("saveUpload quota", () => {
  test("under the quota — nothing goes", async () => {
    await put("a", 30, 2);
    await put("b", 30, 1);
    await saveUpload(DIR, "incoming", Buffer.from(new Uint8Array(40)), 100);
    expect(await names()).toEqual(["a", "b", "incoming"]);
  });

  test("over the quota — the oldest go first, until the new file fits", async () => {
    await put("oldest", 30, 3);
    await put("middle", 30, 2);
    await put("newest", 30, 1);
    await saveUpload(DIR, "incoming", Buffer.from(new Uint8Array(50)), 100);
    expect(await names()).toEqual(["incoming", "newest"]);
  });

  test("a file bigger than the quota clears everything", async () => {
    await put("a", 30, 1);
    await saveUpload(DIR, "incoming", Buffer.from(new Uint8Array(200)), 100);
    expect(await names()).toEqual(["incoming"]);
  });
});