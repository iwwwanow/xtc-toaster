import { describe, expect, test } from "bun:test";
import type { ServerMessage } from "@xtc-toaster/contract";
import { enqueue, initialWsData } from "./ws";

type ReadyState = Parameters<typeof enqueue>[0]["readyState"];

// fake socket + a render that finishes only when the test says so
const setup = () => {
  const sent: string[] = [];
  const ws = { data: initialWsData(), readyState: WebSocket.OPEN as ReadyState, send: (m: string) => (sent.push(m), 0) };
  const started: string[] = [];
  const finishers: Array<() => void> = [];
  const handle = (text: string) => {
    started.push(text);
    return new Promise<ServerMessage>((resolve) =>
      finishers.push(() => resolve({ type: "render-error", requestId: Number(text), message: "done" })),
    );
  };
  const finishCurrent = async () => {
    finishers.shift()!();
    await Bun.sleep(0);
  };
  const sentIds = () => sent.map((m) => (JSON.parse(m) as ServerMessage).requestId);
  return { ws, handle, started, finishCurrent, sentIds };
};

describe("enqueue", () => {
  test("while busy, only the latest waiting message runs next", async () => {
    const { ws, handle, started, finishCurrent, sentIds } = setup();
    enqueue(ws, "1", handle);
    enqueue(ws, "2", handle);
    enqueue(ws, "3", handle);
    expect(started).toEqual(["1"]);

    await finishCurrent();
    expect(started).toEqual(["1", "3"]);
    await finishCurrent();
    expect(sentIds()).toEqual([1, 3]);
    expect(ws.data).toEqual({ busy: false, pending: null });
  });

  test("after going idle, the next message starts right away", async () => {
    const { ws, handle, started, finishCurrent } = setup();
    enqueue(ws, "1", handle);
    await finishCurrent();
    enqueue(ws, "2", handle);
    expect(started).toEqual(["1", "2"]);
  });

  test("a response for a closed socket is dropped", async () => {
    const { ws, handle, finishCurrent, sentIds } = setup();
    enqueue(ws, "1", handle);
    ws.readyState = WebSocket.CLOSED as ReadyState;
    await finishCurrent();
    expect(sentIds()).toEqual([]);
    expect(ws.data.busy).toBe(false);
  });
});
