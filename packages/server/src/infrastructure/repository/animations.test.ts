import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, readdir, rm, utimes } from "node:fs/promises";
import { join, resolve } from "node:path";
import { animationsDir, createAnimationJob, findAnimation, removeFrames, removeLeftoverFrames } from "./animations";

const UPLOADS_DIR = resolve(import.meta.dirname, "../../../tests/output/animations-repo");

beforeAll(() => rm(UPLOADS_DIR, { recursive: true, force: true }));
afterAll(() => rm(UPLOADS_DIR, { recursive: true, force: true }));

describe("animations repository", () => {
  test("a job: a frames directory, removed after; the file found by its name, typed by its format", async () => {
    const gif = await createAnimationJob(UPLOADS_DIR, "gif");
    await Bun.write(join(gif.framesDir, "frame-0000.png"), "png");
    await Bun.write(gif.filePath, "GIF89a");
    await removeFrames(gif);
    expect(await readdir(animationsDir(UPLOADS_DIR))).toEqual([`${gif.id}.gif`]);
    const found = await findAnimation(UPLOADS_DIR, gif.name);
    expect(found?.contentType).toBe("image/gif");
    expect(await found?.file.text()).toBe("GIF89a");

    const mp4 = await createAnimationJob(UPLOADS_DIR, "mp4");
    await Bun.write(mp4.filePath, "mp4");
    expect(mp4.name).toBe(`${mp4.id}.mp4`);
    expect((await findAnimation(UPLOADS_DIR, mp4.name))?.contentType).toBe("video/mp4");
    await removeFrames(mp4);
  });

  test.each(["../uploads.gif", "x.gif", `${crypto.randomUUID()}.png`, `${crypto.randomUUID()}.gif`, `${crypto.randomUUID()}.mp4`])(
    "%s → not found",
    async (name) => {
      expect(await findAnimation(UPLOADS_DIR, name)).toBeNull();
    },
  );

  test("leftover sequences go, fresh ones and every gif stay", async () => {
    const dir = animationsDir(UPLOADS_DIR);
    await mkdir(join(dir, "old-job"), { recursive: true });
    await mkdir(join(dir, "live-job"), { recursive: true });
    await Bun.write(join(dir, "old.gif"), "x");
    await Bun.write(join(dir, "fresh.gif"), "x");
    const hourAgo = new Date(Date.now() - 3_600_000);
    await utimes(join(dir, "old-job"), hourAgo, hourAgo);
    await utimes(join(dir, "old.gif"), hourAgo, hourAgo);

    expect(await removeLeftoverFrames(UPLOADS_DIR, 15 * 60_000)).toBe(1);
    const left = await readdir(dir);
    expect(left).toEqual(expect.arrayContaining(["fresh.gif", "old.gif", "live-job"]));
    expect(left).not.toContain("old-job");
  });

  test("no animations directory yet → nothing to remove", async () => {
    expect(await removeLeftoverFrames(join(UPLOADS_DIR, "none"))).toBe(0);
  });
});
