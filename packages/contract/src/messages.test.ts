import { describe, expect, test } from "bun:test";
import { TOAST_GRAPH_VERSION } from "./constants";
import { parseClientMessage, ServerMessageSchema } from "./messages";

const graph = {
  version: TOAST_GRAPH_VERSION,
  nodes: [
    { id: "in", type: "input", data: { imageId: null } },
    { id: "out", type: "output", data: {} },
  ],
  edges: [{ id: "in-out", source: "in", target: "out" }],
};

describe("parseClientMessage", () => {
  test("accepts a render message", () => {
    const message = { type: "render", requestId: 1, graph };
    expect<unknown>(parseClientMessage(message)).toEqual(message);
  });

  test.each([-1, 1.5, "1"])("rejects requestId %p", (requestId) => {
    expect(() => parseClientMessage({ type: "render", requestId, graph })).toThrow();
  });

  test("accepts a render-animation message", () => {
    const message = { type: "render-animation", requestId: 2, graph };
    expect<unknown>(parseClientMessage(message)).toEqual(message);
  });

  test("rejects an unknown message type", () => {
    expect(() => parseClientMessage({ type: "cancel", requestId: 1, graph })).toThrow();
  });
});

describe("ServerMessageSchema", () => {
  test("accepts rendered", () => {
    const message = { type: "rendered", requestId: 1, width: 2, height: 2, png: "iVBORw0KGgo=" };
    expect<unknown>(ServerMessageSchema.parse(message)).toEqual(message);
  });

  test("accepts animation-progress and animation-rendered", () => {
    const progress = { type: "animation-progress", requestId: 2, frame: 3, frames: 24 };
    expect<unknown>(ServerMessageSchema.parse(progress)).toEqual(progress);
    const rendered = { type: "animation-rendered", requestId: 2, url: "/api/animations/x.gif" };
    expect<unknown>(ServerMessageSchema.parse(rendered)).toEqual(rendered);
  });

  test("rejects animation-progress at frame 0", () => {
    expect(() => ServerMessageSchema.parse({ type: "animation-progress", requestId: 2, frame: 0, frames: 24 })).toThrow();
  });

  test("accepts render-error with requestId: null and no nodeId", () => {
    const message = { type: "render-error", requestId: null, message: "bad json" };
    expect<unknown>(ServerMessageSchema.parse(message)).toEqual(message);
  });
});
