import { describe, expect, test } from "bun:test";
import { createRenderQueue } from "./render-queue";
import type { RenderRequest } from "./render-worker";

const scripted = new URL("../../../tests/fixtures/scripted-worker.ts", import.meta.url);
const broken = new URL("../../../tests/fixtures/broken-worker.ts", import.meta.url);

const request = (action: "reply" | "exit" | "throw") => ({ action }) as unknown as RenderRequest;

describe("render queue: a dead worker", () => {
  test("a worker alive — the reply comes back", async () => {
    const render = createRenderQueue(scripted);
    expect(await render(request("reply"))).toMatchObject({ width: 1, height: 1 });
  });

  test("the worker exits mid-render — that render fails, the next one gets a fresh worker", async () => {
    const render = createRenderQueue(scripted);
    await expect(render(request("exit"))).rejects.toThrow("render worker exited");
    expect(await render(request("reply"))).toMatchObject({ width: 1 });
  });

  test("an uncaught error in the worker — that render fails, the next one gets a fresh worker", async () => {
    const render = createRenderQueue(scripted);
    await expect(render(request("throw"))).rejects.toThrow("worker blew up");
    expect(await render(request("reply"))).toMatchObject({ width: 1 });
  });

  test("renders waiting in line get their turn after the death", async () => {
    const render = createRenderQueue(scripted);
    const [dead, next] = [render(request("exit")), render(request("reply"))];
    await expect(dead).rejects.toThrow();
    expect(await next).toMatchObject({ width: 1 });
  });

  test("a worker that can't even load — every render fails, none hangs", async () => {
    const render = createRenderQueue(broken);
    await expect(render(request("reply"))).rejects.toThrow("worker failed to load");
    await expect(render(request("reply"))).rejects.toThrow("worker failed to load");
  });
});
