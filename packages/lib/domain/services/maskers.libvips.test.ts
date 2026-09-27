import { describe, expect, test } from "bun:test";
import { isolateChannel } from "./maskers.libvips";
import { Channel } from "../types";

const pixel = (r: number, g: number, b: number, a = 255) =>
  new Uint8ClampedArray([r, g, b, a]);

describe("isolateChannel", () => {
  test("moves the channel's raw value into alpha and flags RGB by channel", () => {
    const data = pixel(10, 20, 30, 40);
    expect([...isolateChannel(data, Channel.Green)]).toEqual([0, 255, 0, 20]);
    expect([...isolateChannel(data, Channel.Red)]).toEqual([255, 0, 0, 10]);
    expect([...isolateChannel(data, Channel.Blue)]).toEqual([0, 0, 255, 30]);
  });
});
