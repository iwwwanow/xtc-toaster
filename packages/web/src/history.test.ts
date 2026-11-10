import { describe, expect, test } from "bun:test";
import { History } from "./history";

describe("History", () => {
  test("the start is no step: nothing to undo or redo", () => {
    const history = new History("a");
    expect([history.canUndo, history.canRedo]).toEqual([false, false]);
    expect(history.undo()).toBeNull();
    expect(history.redo()).toBeNull();
  });

  test("undo walks back, redo forward, each to the edge", () => {
    const history = new History("a");
    history.record("b");
    history.record("c");
    expect(history.undo()).toBe("b");
    expect(history.undo()).toBe("a");
    expect(history.undo()).toBeNull();
    expect(history.redo()).toBe("b");
    expect(history.redo()).toBe("c");
    expect(history.redo()).toBeNull();
  });

  test("the same state again is no step", () => {
    const history = new History("a");
    expect(history.record("a")).toBe(false);
    expect(history.record("b")).toBe(true);
    expect(history.record("b")).toBe(false);
    expect(history.undo()).toBe("a");
    expect(history.canUndo).toBe(false);
  });

  test("a new edit after an undo drops the steps forward", () => {
    const history = new History("a");
    history.record("b");
    history.undo();
    history.record("c");
    expect(history.canRedo).toBe(false);
    expect(history.undo()).toBe("a");
  });

  test("an undo's echo, written a bit differently, is settled — no new step, redo still there", () => {
    const history = new History("a");
    history.record("b");
    history.undo();
    history.settle("a'");
    expect(history.record("a'")).toBe(false);
    expect(history.redo()).toBe("b");
  });

  test("keeps the last `limit` steps back", () => {
    const history = new History("0", 3);
    for (const state of ["1", "2", "3", "4", "5"]) history.record(state);
    expect([history.undo(), history.undo(), history.undo(), history.undo()]).toEqual(["4", "3", "2", null]);
  });
});
