import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, readdir, rm, utimes } from "node:fs/promises";
import { join, resolve } from "node:path";
import { animationsDir, createAnimationJob, findGif, removeExpiredAnimations, removeFrames } from "./animations";

const UPLOADS_DIR = resolve(import.meta.dirname, "../../../tests/output/animations-repo");

beforeAll(() => rm(UPLOADS_DIR, { recursive: true, force: true }));
afterAll(() => rm(UPLOADS_DIR, { recursive: true, force: true }));

describe("animations repository", () => {
  test("a job: a frames directory, removed after; the gif found by its name", async () => {
    const job = await createAnimationJob(UPLOADS_DIR);
    await Bun.write(join(job.framesDir, "frame-0000.png"), "png");
    await Bun.write(job.gifPath, "GIF89a");
    await removeFrames(job);
    expect(await readdir(animationsDir(UPLOADS_DIR))).toEqual([`${job.id}.gif`]);
    expect(await (await findGif(UPLOADS_DIR, `${job.id}.gif`))?.text()).toBe("GIF89a");
  });

  test.each(["../uploads.gif", "x.gif", `${crypto.randomUUID()}.png`, `${crypto.randomUUID()}.gif`])(
    "%s → not found",
    async (name) => {
      expect(await findGif(UPLOADS_DIR, name)).toBeNull();
    },
  );

  test("expired gifs and leftover sequences go, fresh ones stay", async () => {
    const dir = animationsDir(UPLOADS_DIR);
    await mkdir(join(dir, "old-job"), { recursive: true });
    await Bun.write(join(dir, "old.gif"), "x");
    await Bun.write(join(dir, "fresh.gif"), "x");
    const hourAgo = new Date(Date.now() - 3_600_000);
    await utimes(join(dir, "old-job"), hourAgo, hourAgo);
    await utimes(join(dir, "old.gif"), hourAgo, hourAgo);

    await removeExpiredAnimations(UPLOADS_DIR, 15 * 60_000);
    const left = await readdir(dir);
    expect(left).toContain("fresh.gif");
    expect(left).not.toContain("old.gif");
    expect(left).not.toContain("old-job");
  });

  test("no animations directory yet → nothing to remove", async () => {
    expect(await removeExpiredAnimations(join(UPLOADS_DIR, "none"))).toBe(0);
  });
});
