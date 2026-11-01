import { describe, expect, test } from "bun:test";
import { Layer } from "./layer";
import { Color } from "./color";
import { Channel } from "../types";

const makeLayer = (bytes: number[], width: number, height = 1) =>
  new Layer(new Uint8ClampedArray(bytes), { width, height }, {});

describe("Layer", () => {
  test("fill sets every pixel to the given color", () => {
    const layer = makeLayer([0, 0, 0, 0, 0, 0, 0, 0], 2);
    layer.fill(Color.fromRgb([10, 20, 30]));
    expect([...layer.imageData]).toEqual([10, 20, 30, 255, 10, 20, 30, 255]);
  });

  test("setBlendMode / opacity record options without touching imageData", () => {
    const layer = makeLayer([1, 2, 3, 4], 1);
    layer.setBlendMode("add");
    layer.opacity(0.5);
    expect(layer.options).toEqual({ blendMode: "add", opacity: 0.5 });
    expect([...layer.imageData]).toEqual([1, 2, 3, 4]);
  });

  test("move applies eagerly to imageData, nothing kept in options", () => {
    const layer = makeLayer([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0], 3);
    layer.move({ x: 1, y: 0 });
    expect([...layer.imageData.slice(4, 8)]).toEqual([255, 0, 0, 255]);
    expect(layer.options).toEqual({});
  });

  test("selectColor delegates to its HSV masker", () => {
    const layer = makeLayer([255, 0, 0, 255], 1); // hue 0, saturation 100, value 100
    layer.selectColor({ hue: 0 });
    expect(layer.imageData[3]).toBe(255);
  });

  test("channel moves the channel value into alpha", () => {
    const layer = makeLayer([10, 20, 30, 40], 1);
    layer.channel(Channel.Blue);
    expect([...layer.imageData]).toEqual([0, 0, 255, 30]);
  });

  test("colorNoise replaces imageData with the effect output", () => {
    const layer = makeLayer([255, 0, 0, 255], 1);
    layer.colorNoise({ deviationCoefficient: 0 });
    // deviation 0 => no hue shift, output should equal input
    expect([...layer.imageData]).toEqual([255, 0, 0, 255]);
  });

  test("tint replaces RGB but keeps alpha (works on top of a mask)", () => {
    const layer = makeLayer([1, 2, 3, 0, 4, 5, 6, 128], 2);
    layer.tint(Color.fromRgb([200, 100, 50]));
    expect([...layer.imageData]).toEqual([200, 100, 50, 0, 200, 100, 50, 128]);
  });

  test("selectVivid / selectBright delegate to their maskers", () => {
    const saturation = makeLayer([255, 0, 0, 255], 1);
    saturation.selectVivid({ saturation: 0 });
    expect(saturation.imageData[3]).toBe(0);

    const value = makeLayer([255, 0, 0, 255], 1);
    value.selectBright({ value: 100 });
    expect(value.imageData[3]).toBe(255);
  });

  test("a select passes a custom tolerance through", () => {
    const layer = makeLayer([102, 102, 102, 255], 1); // value 40%
    layer.selectBright({ value: 45, tolerance: 0.1 });
    expect(layer.imageData[3]).toBe(191);
  });

  test("blur uses the layer dimensions", () => {
    const layer = makeLayer([0, 0, 0, 255, 90, 0, 0, 255, 180, 0, 0, 255], 3);
    layer.blur({ radius: 1 });
    expect([layer.imageData[0], layer.imageData[4], layer.imageData[8]]).toEqual([45, 90, 135]);
  });

  test("matrix applies a raw 3×3 matrix", () => {
    const layer = makeLayer([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0], 3);
    layer.matrix([1, 0, 0, 0, 1, 0, 1, 0, 1]);
    expect([...layer.imageData.slice(4, 8)]).toEqual([255, 0, 0, 255]);
  });

  test("corners maps the image onto the given corners", () => {
    // 3×3, single red pixel at (0,0); corners shifted right by 1 = translate(1, 0)
    const bytes = new Array(9 * 4).fill(0);
    bytes.splice(0, 4, 255, 0, 0, 255);
    const layer = makeLayer(bytes, 3, 3);
    layer.corners([{ x: 1, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 2 }, { x: 1, y: 2 }]);
    expect([...layer.imageData.slice(0, 8)]).toEqual([0, 0, 0, 0, 255, 0, 0, 255]);
  });

  test("turn3d turns the plane around the Y axis (angle in degrees)", () => {
    const opaque = new Array(9 * 4).fill(255);
    const still = makeLayer(opaque, 9);
    still.turn3d({ angle: 0, focalLength: 600 });
    expect([...still.imageData]).toEqual(opaque);

    const turned = makeLayer(opaque, 9);
    turned.turn3d({ angle: 60, focalLength: 10 });
    const alphas = [...turned.imageData].filter((_, i) => i % 4 === 3);
    expect(alphas[4]).toBe(255); // center column keeps its pixel
    expect(alphas.some((a) => a === 0)).toBe(true); // the narrowed plane leaves transparent edges
  });

  test("consecutive moves stack", () => {
    const layer = makeLayer([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0], 3);
    layer.move({ x: 1, y: 0 });
    layer.move({ x: 1, y: 0 });
    expect([...layer.imageData.slice(8, 12)]).toEqual([255, 0, 0, 255]);
  });
});
