import { describe, expect, test } from "bun:test";
import { parseToastGraph } from "@xtc-toaster/contract";
import json from "./toast.json";
import { toast2signac } from "./index";

describe("toast-2_signac", () => {
  test("the schema accepts toast.json", () => {
    expect(() => parseToastGraph(json)).not.toThrow();
  });

  test("is a preset without a picture", () => {
    const input = toast2signac.nodes.find((node) => node.type === "input");
    expect(input?.data).toEqual({ imageId: null });
  });

  test("is the chain input → hue noise → hue mask → y-rotation → output", () => {
    expect(toast2signac.nodes.map(({ type }) => type)).toEqual(["input", "hueNoise", "hueMask", "yRotation", "output"]);
    expect(toast2signac.nodes.map(({ data }) => data).slice(1, -1)).toEqual([
      { deviationCoefficient: 0.5 },
      { hue: 0, tolerance: 30 },
      { angle: 30, focalLength: 50 },
    ]);
    expect(toast2signac.edges.map(({ source, target }) => [source, target])).toEqual([
      ["in", "nz"],
      ["nz", "hm"],
      ["hm", "yr"],
      ["yr", "out"],
    ]);
  });
});
