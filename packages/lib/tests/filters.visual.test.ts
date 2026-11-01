// Прогон tests/fixtures/poppies.jpg через каждый фильтр — результат смотреть
// глазами в tests/output/filters/*.png (перезаписывается при каждом прогоне).
// Ассерты здесь грубые (размер, "фильтр что-то сделал"); точная математика —
// в unit-тестах рядом с domain/services.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Color, Composition } from "../domain";
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

describe("select", () => {
  test("select color 0° — red petals only (grays weighted out by saturation)", async () => {
    const out = await run("10_select-color_0", withLayer((l) => l.selectColor({ hue: 0, tolerance: 0.05 })));
    const share = maskedShare(out);
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(1);
  });

  test("select color 100° — greens", async () => {
    const out = await run("11_select-color_100", withLayer((l) => l.selectColor({ hue: 100, tolerance: 0.1 })));
    expect(maskedShare(out)).toBeGreaterThan(0);
  });

  test("select vivid 100 / 20", async () => {
    const high = await run("12_select-vivid_100", withLayer((l) => l.selectVivid({ saturation: 100, tolerance: 0.2 })));
    const low = await run("13_select-vivid_20", withLayer((l) => l.selectVivid({ saturation: 20, tolerance: 0.2 })));
    expect(maskedShare(high)).toBeGreaterThan(0);
    expect(maskedShare(low)).toBeGreaterThan(0);
  });

  test("select bright 90 / 20 (toast-1 uses it)", async () => {
    const light = await run("14_select-bright_90", withLayer((l) => l.selectBright({ value: 90, tolerance: 0.2 })));
    const dark = await run("15_select-bright_20", withLayer((l) => l.selectBright({ value: 20, tolerance: 0.2 })));
    expect(maskedShare(light)).toBeGreaterThan(0);
    expect(maskedShare(dark)).toBeGreaterThan(0);
  });

  test("channel red / green / blue / alpha", async () => {
    const channels = [Channel.Red, Channel.Green, Channel.Blue, Channel.Alpha];
    for (const [i, channel] of channels.entries()) {
      const out = await run(`2${i}_channel_${channel}`, withLayer((l) => l.channel(channel)));
      expect(maskedShare(out)).toBeGreaterThan(0);
    }
  });

  test("tint over select bright (the toast-1 recipe)", async () => {
    const out = await run(
      "16_select-bright-20_tint-magenta",
      withLayer((l) => {
        l.selectBright({ value: 20, tolerance: 0.32 });
        l.tint(Color.fromHex("#ff00ff"));
      }),
    );
    expect(out[0]).toBe(255);
    expect(out[1]).toBe(0);
  });
});

describe("effects", () => {
  test("blur radius 2 / 8", async () => {
    const soft = await run("30_blur_r2", withLayer((l) => l.blur({ radius: 2 })));
    const strong = await run("31_blur_r8", withLayer((l) => l.blur({ radius: 8 })));
    expect(changedRatio(soft, source)).toBeGreaterThan(0.3);
    expect(changedRatio(strong, source)).toBeGreaterThan(changedRatio(soft, source));
  });

  test("blur after a select — premultiplied, no dark halo at the mask edge", async () => {
    const out = await run(
      "32_mask-hue-0_blur_r4",
      withLayer((l) => {
        l.selectColor({ hue: 0, tolerance: 0.05 });
        l.blur({ radius: 4 });
      }),
    );
    expect(maskedShare(out)).toBeGreaterThan(0);
  });

  test("color noise 0.05 / 0.3 (random — differs between runs)", async () => {
    const subtle = await run(
      "33_color-noise_0.05",
      withLayer((l) => l.colorNoise({ deviationCoefficient: 0.05 })),
    );
    const loud = await run(
      "34_color-noise_0.3",
      withLayer((l) => l.colorNoise({ deviationCoefficient: 0.3 })),
    );
    expect(changedRatio(subtle, source)).toBeGreaterThan(0);
    expect(changedRatio(loud, source)).toBeGreaterThan(0);
  });
});

describe("move", () => {
  test("move", async () => {
    const out = await run(
      "40_move_20-10",
      withLayer((l) => l.move({ x: 20, y: 10 })),
    );
    expect(alphaChannel(out)[0]).toBe(0); // top-left corner uncovered
  });

  test("rotate 15° around the center", async () => {
    const out = await run("41_rotate_15", withLayer((l) => l.rotate({ angle: 15 })));
    expect(changedRatio(out, source)).toBeGreaterThan(0.3);
  });

  test("scale 1.5 around the center — fills the frame, no holes", async () => {
    const out = await run(
      "42_scale_1.5",
      withLayer((l) => l.scale({ x: 1.5, y: 1.5 })),
    );
    expect(alphaChannel(out).every((a) => a === 255)).toBe(true);
  });

  test("skew", async () => {
    const out = await run("43_skew_0.2", withLayer((l) => l.skew({ x: 0, y: 0.2 })));
    expect(changedRatio(out, source)).toBeGreaterThan(0.3);
  });

  test("corners onto a quad (toast-1)", async () => {
    const out = await run(
      "44_corners_quad",
      withLayer((l) => l.corners(insetQuad())),
    );
    expect(alphaChannel(out)[0]).toBe(0);
    expect(changedRatio(out, source)).toBeGreaterThan(0.3);
  });

  test("matrix: a raw homography with a perspective row", async () => {
    const out = await run(
      "45_matrix_raw",
      withLayer((l) =>
        l.matrix([1, 0.05, 0.0006, 0, 1, 0, 0, 0, 1]),
      ),
    );
    expect(changedRatio(out, source)).toBeGreaterThan(0.3);
  });

  test("3d turn 30°", async () => {
    const out = await run("46_turn-3d_30deg", withLayer((l) => l.turn3d({ angle: 30, focalLength: 400 })));
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
        comp.createLayerFromPixelData(new Uint8ClampedArray(source)).opacity(0.5);
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
        hue.opacity(0.8);
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
