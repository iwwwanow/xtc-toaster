import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { GraphNode, ToastGraph } from "@xtc-toaster/contract";
import { imageFileToRawData } from "@xtc-toaster/lib";
import { toast1degas } from "@xtc-toaster/toasts";
import { runGraph } from "../src/application/run-graph";

// toast-1 (degas) as a graph against the lib golden test of the script's recipe — the same picture, the same
// hash: `frame t=0` in packages/lib/tests/__snapshots__/pipeline.golden.test.ts.snap. That snapshot changes
// on purpose → change it here too.
const GOLDEN_T0 = "3a0027536a75ae018be57d480cd53684974560d36b981c339dc86b10b1eb12a3";

const FIXTURE_PATH = resolve(import.meta.dirname, "../../lib/tests/fixtures/poppies.jpg");
const IMAGE_ID = "6a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const [WIDTH, HEIGHT] = [250, 359]; // poppies.jpg — the lib golden test pins it

const loadImage = () => imageFileToRawData(FIXTURE_PATH);

// the toast as it is, the picture put into the input
const withPicture = (graph: ToastGraph, patch: (node: GraphNode) => GraphNode = (node) => node): ToastGraph => ({
  ...graph,
  nodes: graph.nodes.map((node) => patch(node.type === "input" ? { ...node, data: { imageId: IMAGE_ID } } : node)),
});

const hash = async (graph: ToastGraph) =>
  createHash("sha256")
    .update((await runGraph(graph, loadImage, 7)).data)
    .digest("hex");

describe("toast-1 degas as a graph", () => {
  test("7 layers rows — renders under RENDER_MAX_LAYERS 7", async () => {
    const { width, height } = await runGraph(withPicture(toast1degas), loadImage, 7);
    expect([width, height]).toEqual([WIDTH, HEIGHT]);
  });

  // two differences from the script, both in what the toast stores, not in how it renders:
  // - blur is px in the contract; the script takes % of the width → on poppies 1 / 1 / 0, not 8 / 4 / 2;
  // - the script's t = 0 corners are the frame (0…width), the server maps 100 % to the last pixel (width - 1)
  //   so untouched corners are the identity — the script stretches each masked layer by w / (w - 1).
  // with the script's numbers put back the graph gives the script's frame bit for bit
  test("with the script's blur radii and corners — the golden hash of t = 0", async () => {
    const radius: Record<string, number> = { "blurred-blur": 1, "purple-blur": 1, "red-blur": 0 };
    const [x, y] = [(100 * WIDTH) / (WIDTH - 1), (100 * HEIGHT) / (HEIGHT - 1)];
    const graph = withPicture(toast1degas, (node) => {
      if (node.type === "blur") return { ...node, data: { radius: radius[node.id]! } };
      if (node.type === "corners") {
        return { ...node, data: { ...node.data, topRightX: x, bottomRightX: x, bottomRightY: y, bottomLeftY: y } };
      }
      return node;
    });
    expect(await hash(graph)).toBe(GOLDEN_T0);
  });
});
