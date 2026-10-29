import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fromToastFile, ToastFileError } from "./graph";

// test toasts (tests/toasts/, opened in dev with ?toast=<name>) stay importable as the contract moves;
// broken-* ones are there to be refused
const TOASTS_DIR = resolve(import.meta.dir, "../../../tests/toasts");
const files = readdirSync(TOASTS_DIR).filter((file) => file.endsWith(".json"));

describe("test toasts", () => {
  test("found", () => expect(files.length).toBeGreaterThan(0));

  test.each(files)("%s", (file) => {
    const text = readFileSync(resolve(TOASTS_DIR, file), "utf8");
    if (file.startsWith("broken-")) expect(() => fromToastFile(text, null)).toThrow(ToastFileError);
    else expect(() => fromToastFile(text, null)).not.toThrow();
  });
});
