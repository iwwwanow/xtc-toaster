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

  test("is the chain input → noize (0.5) → output", () => {
    expect(toast2signac.nodes.map(({ type }) => type)).toEqual(["input", "noize", "output"]);
    expect(toast2signac.nodes[1]?.data).toEqual({ deviationCoefficient: 0.5 });
    expect(toast2signac.edges.map(({ source, target }) => [source, target])).toEqual([
      ["in", "nz"],
      ["nz", "out"],
    ]);
  });
});
