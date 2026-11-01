import { describe, expect, test } from "bun:test";
import { parseToastGraph, validateGraph } from "@xtc-toaster/contract";
import json from "./toast.json";
import { toast1degas } from "./graph";

describe("toast-1_degas graph", () => {
  test("the schema accepts toast.json, the graph is valid", () => {
    expect(() => parseToastGraph(json)).not.toThrow();
    expect(validateGraph(toast1degas)).toBeNull();
  });

  test("is a preset without a picture", () => {
    expect(toast1degas.nodes.find((node) => node.type === "input")?.data).toEqual({ imageId: null });
  });

  test("the script's 7 layers, top first, lch-hue on the blue one", () => {
    const composer = toast1degas.nodes.find((node) => node.type === "composer");
    expect(composer?.type === "composer" && composer.data.layers.map(({ name, blendMode }) => [name, blendMode])).toEqual([
      ["white", "normal"],
      ["red", "normal"],
      ["purple", "normal"],
      ["blue hue", "lch-hue"],
      ["light gray", "normal"],
      ["blurred", "normal"],
      ["dark gray", "normal"],
    ]);
  });
});
