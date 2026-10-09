import { describe, expect, test } from "bun:test";
import { reconnectDelay, wsUrl } from "./socket";

describe("reconnectDelay", () => {
  test("1 → 2 → 4 → … capped at 10 s", () => {
    expect([0, 1, 2, 3, 4, 5].map(reconnectDelay)).toEqual([1000, 2000, 4000, 8000, 10_000, 10_000]);
  });
});

describe("wsUrl", () => {
  test("same origin, wss behind https", () => {
    expect(wsUrl({ protocol: "http:", host: "localhost:5173" })).toBe("ws://localhost:5173/ws");
    expect(wsUrl({ protocol: "https:", host: "xtc.example" })).toBe("wss://xtc.example/ws");
  });
});
