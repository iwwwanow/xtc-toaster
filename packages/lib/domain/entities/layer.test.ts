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

  test("setBlendMode/setOpacity record options without touching imageData", () => {
    const layer = makeLayer([1, 2, 3, 4], 1);
    layer.setBlendMode("add");
    layer.setOpacity(0.5);
    expect(layer.options).toEqual({ blendMode: "add", opacity: 0.5 });
    expect([...layer.imageData]).toEqual([1, 2, 3, 4]);
  });

  test("setTransform applies eagerly to imageData", () => {
    const layer = makeLayer([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0], 3);
    layer.setTransform({ name: "translate", params: { tx: 1, ty: 0 } });
    expect([...layer.imageData.slice(4, 8)]).toEqual([255, 0, 0, 255]);
    expect(layer.options.transform).toEqual({ name: "translate", params: { tx: 1, ty: 0 } });
  });

  test("mask delegates to the matching HSV masker", () => {
    const layer = makeLayer([255, 0, 0, 255], 1); // hue 0, saturation 100, value 100
    layer.mask({ name: "hue", value: 0 });
    expect(layer.imageData[3]).toBe(255);
  });

  test("isolateChannel moves the channel value into alpha", () => {
    const layer = makeLayer([10, 20, 30, 40], 1);
    layer.isolateChannel(Channel.Blue);
    expect([...layer.imageData]).toEqual([0, 0, 255, 30]);
  });

  test("applyEffect(noize) replaces imageData with the effect output", () => {
    const layer = makeLayer([255, 0, 0, 255], 1);
    layer.applyEffect({ name: "noize", options: { deviationCoefficient: 0 } });
    // deviation 0 => no hue shift, output should equal input
    expect([...layer.imageData]).toEqual([255, 0, 0, 255]);
  });

  test("tint replaces RGB but keeps alpha (works on top of a mask)", () => {
    const layer = makeLayer([1, 2, 3, 0, 4, 5, 6, 128], 2);
    layer.tint(Color.fromRgb([200, 100, 50]));
    expect([...layer.imageData]).toEqual([200, 100, 50, 0, 200, 100, 50, 128]);
  });

  test("mask delegates saturation and value to their maskers", () => {
    const saturation = makeLayer([255, 0, 0, 255], 1);
    saturation.mask({ name: "saturation", value: 0 });
    expect(saturation.imageData[3]).toBe(0);

    const value = makeLayer([255, 0, 0, 255], 1);
    value.mask({ name: "value", value: 100 });
    expect(value.imageData[3]).toBe(255);
  });

  test("mask passes a custom tolerance through", () => {
    const layer = makeLayer([102, 102, 102, 255], 1); // value 40%
    layer.mask({ name: "value", value: 45, tolerance: 0.1 });
    expect(layer.imageData[3]).toBe(191);
  });

  test("applyEffect(blur) uses the layer dimensions", () => {
    const layer = makeLayer([0, 0, 0, 255, 90, 0, 0, 255, 180, 0, 0, 255], 3);
    layer.applyEffect({ name: "blur", options: { radius: 1 } });
    expect([layer.imageData[0], layer.imageData[4], layer.imageData[8]]).toEqual([45, 90, 135]);
  });

  test("setTransform(homography) applies a raw 3×3 matrix", () => {
    const layer = makeLayer([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0], 3);
    layer.setTransform({ name: "homography", params: { matrix: [1, 0, 0, 0, 1, 0, 1, 0, 1] } });
    expect([...layer.imageData.slice(4, 8)]).toEqual([255, 0, 0, 255]);
  });

  test("setTransform(perspective) maps the image onto the given corners", () => {
    // 3×3, single red pixel at (0,0); corners shifted right by 1 = translate(1, 0)
    const bytes = new Array(9 * 4).fill(0);
    bytes.splice(0, 4, 255, 0, 0, 255);
    const layer = makeLayer(bytes, 3, 3);
    layer.setTransform({
      name: "perspective",
      params: { corners: [{ x: 1, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 2 }, { x: 1, y: 2 }] },
    });
    expect([...layer.imageData.slice(0, 8)]).toEqual([0, 0, 0, 0, 255, 0, 0, 255]);
  });

  test("consecutive transforms stack; options keep only the last one", () => {
    const layer = makeLayer([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0], 3);
    layer.setTransform({ name: "translate", params: { tx: 1, ty: 0 } });
    layer.setTransform({ name: "translate", params: { tx: 1, ty: 0 } });
    expect([...layer.imageData.slice(8, 12)]).toEqual([255, 0, 0, 255]);
    expect(layer.options.transform).toEqual({ name: "translate", params: { tx: 1, ty: 0 } });
  });
});
