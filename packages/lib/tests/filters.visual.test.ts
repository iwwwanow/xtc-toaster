// Прогон tests/fixtures/poppies.jpg через каждый фильтр — результат смотреть
// глазами в tests/output/filters/*.png (перезаписывается при каждом прогоне).
// Ассерты здесь грубые (размер, "фильтр что-то сделал"); точная математика —
// в unit-тестах рядом с domain/services.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Color, Composition } from "../domain";
import { applyYRotationPerspective } from "../domain/services";
import { Channel, type ImageRawDataArray, type LayerDimensions, type Quad } from "../domain/types";
import type { Layer } from "../domain/entities";
import { alphaChannel, changedRatio, loadFixture, resetOutputDir, savePng, writeContactSheet } from "./helpers";

let source: ImageRawDataArray;
let dims: LayerDimensions;
let outDir: string;
const results: Array<{ name: string; data: ImageRawDataArray }> = [];

beforeAll(async () => {
  const fixture = await loadFixture();
  source = fixture.data;
  dims = { width: fixture.width, height: fixture.height };
  outDir = await resetOutputDir("filters");
  await savePng(outDir, "00_original", source, dims);
  results.push({ name: "00_original", data: source });
});

afterAll(async () => {
  results.sort((a, b) => a.name.localeCompare(b.name));
  await writeContactSheet(outDir, results, dims);
});

// fresh composition + layer holding a private copy of the fixture
const withLayer = (apply: (layer: Layer, comp: Composition) => void): ImageRawDataArray => {
  const comp = new Composition(dims.width, dims.height);
  const layer = comp.createLayerFromPixelData(new Uint8ClampedArray(source));
  apply(layer, comp);
  return layer.imageData;
};

const renderWith = (build: (comp: Composition) => void): ImageRawDataArray => {
  const comp = new Composition(dims.width, dims.height);
  build(comp);
  return comp.render();
};

const insetQuad = (): Quad => {
  const { width: w, height: h } = dims;
  return [
    { x: w * 0.15, y: h * 0.05 },
    { x: w * 0.9, y: h * 0.15 },
    { x: w - 1, y: h - 1 },
    { x: 0, y: h * 0.85 },
  ];
};

const run = async (name: string, data: ImageRawDataArray) => {
  expect(data.length).toBe(source.length);
  await savePng(outDir, name, data, dims);
  results.push({ name, data });
  return data;
};

const maskedShare = (data: ImageRawDataArray) => {
  const alphas = alphaChannel(data);
  return alphas.filter((a) => a > 0).length / alphas.length;
};

describe("masks", () => {
  test("hue 0° — red petals only (grays weighted out by saturation)", async () => {
    const out = await run("10_mask_hue-0", withLayer((l) => l.mask({ name: "hue", value: 0, tolerance: 0.05 })));
    const share = maskedShare(out);
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(1);
  });

  test("hue 100° — greens", async () => {
    const out = await run("11_mask_hue-100", withLayer((l) => l.mask({ name: "hue", value: 100, tolerance: 0.1 })));
    expect(maskedShare(out)).toBeGreaterThan(0);
  });

  test("saturation 100 / 20", async () => {
    const high = await run("12_mask_saturation-100", withLayer((l) => l.mask({ name: "saturation", value: 100, tolerance: 0.2 })));
    const low = await run("13_mask_saturation-20", withLayer((l) => l.mask({ name: "saturation", value: 20, tolerance: 0.2 })));
    expect(maskedShare(high)).toBeGreaterThan(0);
    expect(maskedShare(low)).toBeGreaterThan(0);
  });

  test("value 90 / 20 (toast-1 uses value masks)", async () => {
    const light = await run("14_mask_value-90", withLayer((l) => l.mask({ name: "value", value: 90, tolerance: 0.2 })));
    const dark = await run("15_mask_value-20", withLayer((l) => l.mask({ name: "value", value: 20, tolerance: 0.2 })));
    expect(maskedShare(light)).toBeGreaterThan(0);
    expect(maskedShare(dark)).toBeGreaterThan(0);
  });

  test("isolateChannel red / green / blue / alpha", async () => {
    const channels = [Channel.Red, Channel.Green, Channel.Blue, Channel.Alpha];
    for (const [i, channel] of channels.entries()) {
      const out = await run(`2${i}_isolate_${channel}`, withLayer((l) => l.isolateChannel(channel)));
      expect(maskedShare(out)).toBeGreaterThan(0);
    }
  });

  test("tint over a value mask (the toast-1 recipe)", async () => {
    const out = await run(
      "16_mask-value-20_tint-magenta",
      withLayer((l) => {
        l.mask({ name: "value", value: 20, tolerance: 0.32 });
        l.tint(Color.fromHex("#ff00ff"));
      }),
    );
    expect(out[0]).toBe(255);
    expect(out[1]).toBe(0);
  });
});

describe("effects", () => {
  test("blur radius 2 / 8", async () => {
    const soft = await run("30_blur_r2", withLayer((l) => l.applyEffect({ name: "blur", options: { radius: 2 } })));
    const strong = await run("31_blur_r8", withLayer((l) => l.applyEffect({ name: "blur", options: { radius: 8 } })));
    expect(changedRatio(soft, source)).toBeGreaterThan(0.3);
    expect(changedRatio(strong, source)).toBeGreaterThan(changedRatio(soft, source));
  });

  test("blur after mask — premultiplied, no dark halo at the mask edge", async () => {
    const out = await run(
      "32_mask-hue-0_blur_r4",
      withLayer((l) => {
        l.mask({ name: "hue", value: 0, tolerance: 0.05 });
        l.applyEffect({ name: "blur", options: { radius: 4 } });
      }),
    );
    expect(maskedShare(out)).toBeGreaterThan(0);
  });

  test("hue noise 0.05 / 0.3 (random — differs between runs)", async () => {
    const subtle = await run(
      "33_hue-noise_0.05",
      withLayer((l) => l.applyEffect({ name: "noize", options: { deviationCoefficient: 0.05 } })),
    );
    const loud = await run(
      "34_hue-noise_0.3",
      withLayer((l) => l.applyEffect({ name: "noize", options: { deviationCoefficient: 0.3 } })),
    );
    expect(changedRatio(subtle, source)).toBeGreaterThan(0);
    expect(changedRatio(loud, source)).toBeGreaterThan(0);
  });
});

describe("transforms", () => {
  test("translate", async () => {
    const out = await run(
      "40_translate_20-10",
      withLayer((l) => l.setTransform({ name: "translate", params: { tx: 20, ty: 10 } })),
    );
    expect(alphaChannel(out)[0]).toBe(0); // top-left corner uncovered
  });

  test("rotate 15° around the center", async () => {
    const out = await run("41_rotate_15", withLayer((l) => l.setTransform({ name: "rotate", params: { alpha: 15 } })));
    expect(changedRatio(out, source)).toBeGreaterThan(0.3);
  });

  test("scale 1.5 around the center — fills the frame, no holes", async () => {
    const out = await run(
      "42_scale_1.5",
      withLayer((l) => l.setTransform({ name: "scale", params: { scaleX: 1.5, scaleY: 1.5 } })),
    );
    expect(alphaChannel(out).every((a) => a === 255)).toBe(true);
  });

  test("skew", async () => {
    const out = await run("43_skew_0.2", withLayer((l) => l.setTransform({ name: "skew", params: { tx: 0.2, ty: 0 } })));
    expect(changedRatio(out, source)).toBeGreaterThan(0.3);
  });

  test("perspective onto a quad (toast-1)", async () => {
    const out = await run(
      "44_perspective_quad",
      withLayer((l) => l.setTransform({ name: "perspective", params: { corners: insetQuad() } })),
    );
    expect(alphaChannel(out)[0]).toBe(0);
    expect(changedRatio(out, source)).toBeGreaterThan(0.3);
  });

  test("raw homography with a perspective row", async () => {
    const out = await run(
      "45_homography_raw",
      withLayer((l) =>
        l.setTransform({ name: "homography", params: { matrix: [1, 0.05, 0.0006, 0, 1, 0, 0, 0, 1] } }),
      ),
    );
    expect(changedRatio(out, source)).toBeGreaterThan(0.3);
  });

  test("Y-axis rotation perspective (service only, not exposed on Layer)", async () => {
    const out = await run("46_y-rotation_30deg", applyYRotationPerspective(source, dims, Math.PI / 6, 400));
    expect(changedRatio(out, source)).toBeGreaterThan(0.3);
  });
});

describe("blend modes", () => {
  const backdrop = Color.fromHex("#203040");

  test("normal at 50% opacity over a dark backdrop", async () => {
    const out = await run(
      "50_blend_normal_opacity-0.5",
      renderWith((comp) => {
        comp.createColorLayer(backdrop);
        comp.createLayerFromPixelData(new Uint8ClampedArray(source)).setOpacity(0.5);
      }),
    );
    expect(changedRatio(out, source)).toBeGreaterThan(0.3);
  });

  test("add — the image added onto itself", async () => {
    const out = await run(
      "51_blend_add_self",
      renderWith((comp) => {
        comp.createLayerFromPixelData(new Uint8ClampedArray(source));
        comp.createLayerFromPixelData(new Uint8ClampedArray(source)).setBlendMode("add");
      }),
    );
    expect(changedRatio(out, source)).toBeGreaterThan(0.3);
  });

  test("lch-hue — cyan hue over the image (toast-1 uses #00ffdd at 0.8)", async () => {
    const out = await run(
      "52_blend_lch-hue_cyan",
      renderWith((comp) => {
        comp.createLayerFromPixelData(new Uint8ClampedArray(source));
        const hue = comp.createColorLayer(Color.fromHex("#00ffdd"));
        hue.setOpacity(0.8);
        hue.setBlendMode("lch-hue");
      }),
    );
    expect(changedRatio(out, source)).toBeGreaterThan(0.3);
  });

  test("lch-hue with a gray layer — no hue to take, image unchanged", async () => {
    const out = await run(
      "53_blend_lch-hue_gray",
      renderWith((comp) => {
        comp.createLayerFromPixelData(new Uint8ClampedArray(source));
        comp.createColorLayer(Color.fromHex("#808080")).setBlendMode("lch-hue");
      }),
    );
    expect(changedRatio(out, source)).toBe(0);
  });
});
