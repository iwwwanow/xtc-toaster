import { describe, expect, test } from "bun:test";
import { base64ToBlob, outputFileName } from "./files";

describe("outputFileName", () => {
  test("<toast>_<YYYYMMDD-HHmmss>.<ext> in local time", () => {
    const date = new Date(2026, 9, 9, 7, 5, 3);
    expect(outputFileName("toast-2_signac", "png", date)).toBe("toast-2_signac_20261009-070503.png");
  });
});

describe("base64ToBlob", () => {
  test("decodes bytes as is", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
    const blob = base64ToBlob(Buffer.from(bytes).toString("base64"), "image/png");
    expect(blob.type).toBe("image/png");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
  });
});
