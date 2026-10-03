import { describe, expect, test } from "bun:test";
import { Composition } from "./composition";
import { Color } from "./color";

describe("Composition factory methods", () => {
  test("createBlankLayer yields a fully transparent layer sized to the composition", () => {
    const composition = new Composition(1, 2);
    const layer = composition.createBlankLayer();
    expect([...layer.imageData]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  test("createColorLayer fills every pixel with the given color", () => {
    const composition = new Composition(2, 1);
    const layer = composition.createColorLayer(Color.fromRgb([1, 2, 3]));
    expect([...layer.imageData]).toEqual([1, 2, 3, 255, 1, 2, 3, 255]);
  });

  test("duplicateLayer copies the buffer and top-level options; edits don't leak back", () => {
    const composition = new Composition(1, 1);
    const original = composition.createColorLayer(Color.fromRgb([9, 9, 9]));
    original.setOpacity(0.5);

    const duplicate = composition.duplicateLayer(original);
    duplicate.fill(Color.fromRgb([0, 0, 0]));

    duplicate.setOpacity(0.1);

    expect([...original.imageData]).toEqual([9, 9, 9, 255]);
    expect(original.options).toEqual({ opacity: 0.5 });
  });

  test("createLayerFromPixelData wraps the given buffer without copying", () => {
    const composition = new Composition(1, 1);
    const pixels = new Uint8ClampedArray([1, 2, 3, 4]);
    expect(composition.createLayerFromPixelData(pixels).imageData).toBe(pixels);
  });
});

describe("Composition.render", () => {
  test("a single opaque layer renders as-is", () => {
    const composition = new Composition(1, 1);
    composition.createColorLayer(Color.fromRgb([5, 6, 7]));
    expect([...composition.render()]).toEqual([5, 6, 7, 255]);
  });

  test("layers merge back-to-front with normal blending", () => {
    const composition = new Composition(1, 1);
    composition.createColorLayer(Color.fromRgb([255, 255, 255]));
    composition.createColorLayer(Color.fromRgb([0, 0, 255]));
    expect([...composition.render()]).toEqual([0, 0, 255, 255]);
  });

  test("opacity is baked into alpha before merging", () => {
    const composition = new Composition(1, 1);
    composition.createColorLayer(Color.fromRgb([0, 0, 0]));
    const fg = composition.createColorLayer(Color.fromRgb([255, 255, 255]));
    fg.setOpacity(0.5);

    // alpha 255·0.5 = 127.5 → 128 in Uint8ClampedArray, then 255·128/255 = 128
    expect([...composition.render()]).toEqual([128, 128, 128, 255]);
  });

  test("add blend mode sums layers additively", () => {
    const composition = new Composition(1, 1);
    composition.createColorLayer(Color.fromRgb([50, 0, 0]));
    const fg = composition.createColorLayer(Color.fromRgb([100, 0, 0]));
    fg.setBlendMode("add");
    expect([...composition.render()]).toEqual([150, 0, 0, 255]);
  });

  test("lch-hue blend mode recolors the layers below", () => {
    const composition = new Composition(1, 1);
    composition.createColorLayer(Color.fromRgb([180, 120, 100]));
    composition.createColorLayer(Color.fromRgb([60, 90, 200])).setBlendMode("lch-hue");
    expect([...composition.render()]).toEqual([130, 130, 181, 255]);
  });

  test("opacity does not modify the layer's own buffer", () => {
    const composition = new Composition(1, 1);
    const layer = composition.createColorLayer(Color.fromRgb([1, 2, 3]));
    layer.setOpacity(0.5);
    composition.render();
    expect([...layer.imageData]).toEqual([1, 2, 3, 255]);
  });

  test("layer order matters for normal blending (top layer wins)", () => {
    const composition = new Composition(1, 1);
    composition.createColorLayer(Color.fromRgb([0, 0, 255]));
    composition.createColorLayer(Color.fromRgb([255, 255, 255]));
    expect([...composition.render()]).toEqual([255, 255, 255, 255]);
  });

  test("an empty composition renders a fully transparent buffer", () => {
    const composition = new Composition(1, 1);
    expect([...composition.render()]).toEqual([0, 0, 0, 0]);
  });
});
