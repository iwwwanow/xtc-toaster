import { describe, expect, test } from "bun:test";
import { INITIAL_DATA, type ComposerLayer } from "@xtc-toaster/contract";
import { addLayer, layerName, moveLayer, removeLayer, removeLayerEdges, renameLayer, setBlendMode, toggleLayer } from "./composer";

const layers = (): ComposerLayer[] => [
  { id: "a", blendMode: "add" },
  { id: "b", blendMode: "normal" },
  { id: "c", blendMode: "lch-hue" },
];
const ids = (list: ComposerLayer[]) => list.map(({ id }) => id);

describe("composer rows", () => {
  test("a new row goes on top, normal, with an id not in use", () => {
    const added = addLayer(INITIAL_DATA.composer.layers);
    expect(added[0]).toEqual({ id: "layer-3", blendMode: "normal" });
    expect(ids(added.slice(1))).toEqual(["layer-2", "layer-1"]);
  });

  test("a removed row's id is not handed out again while a later one lives", () => {
    const [, ...rest] = addLayer(addLayer(INITIAL_DATA.composer.layers)); // layer-4 on top, then layer-3
    const added = addLayer(rest.filter(({ id }) => id !== "layer-1"));
    expect(new Set(ids(added)).size).toBe(added.length);
  });

  test("remove, blend mode", () => {
    expect(ids(removeLayer(layers(), "b"))).toEqual(["a", "c"]);
    expect(setBlendMode(layers(), "b", "add")[1]).toEqual({ id: "b", blendMode: "add" });
  });

  test("the name comes from the id until the user sets one — it moves with the row", () => {
    expect(layerName({ id: "layer-3", blendMode: "normal" })).toBe("layer 3");
    expect(layerName(moveLayer(renameLayer(layers(), "a", " poppies "), 0, 2)[2]!)).toBe("poppies");
  });

  test("an empty name or the id-derived one drops the name", () => {
    const named = renameLayer([{ id: "layer-1", blendMode: "normal" }], "layer-1", "poppies");
    expect(renameLayer(named, "layer-1", "  ")[0]).toEqual({ id: "layer-1", blendMode: "normal" });
    expect(renameLayer(named, "layer-1", "layer 1")[0]).toEqual({ id: "layer-1", blendMode: "normal" });
  });

  test("hide / show: visible false only while hidden", () => {
    const hidden = toggleLayer(layers(), "b");
    expect(hidden[1]).toEqual({ id: "b", blendMode: "normal", visible: false });
    expect(toggleLayer(hidden, "b")[1]).toEqual({ id: "b", blendMode: "normal" });
  });

  test.each([
    [0, 2, ["b", "c", "a"]],
    [2, 0, ["c", "a", "b"]],
    [1, 1, ["a", "b", "c"]],
  ])("row %p dropped at %p", (from, to, order) => {
    expect(ids(moveLayer(layers(), from, to))).toEqual(order);
  });

  test("removing a row drops only its link", () => {
    const edges = [
      { id: "1", source: "x", target: "cmp", targetHandle: "a" },
      { id: "2", source: "y", target: "cmp", targetHandle: "b" },
      { id: "3", source: "x", target: "other", targetHandle: "a" },
    ];
    expect(removeLayerEdges(edges, "cmp", "a").map(({ id }) => id)).toEqual(["2", "3"]);
  });
});
