import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import { generateFavicons } from "./favicon";

// two 100×100 pages side by side, the way Inkscape saves a multi-page document
const source = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="100" height="100" viewBox="0 0 100 100" version="1.1" sodipodi:docname="favicon.svg"
   xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
   xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
   xmlns="http://www.w3.org/2000/svg">
  <sodipodi:namedview id="namedview1" pagecolor="#ffffff">
    <inkscape:page x="0" y="0" width="100" height="100" id="page1" inkscape:label="dark" />
    <inkscape:page x="200" y="0" width="100" height="100" id="page2" inkscape:label="light" />
  </sodipodi:namedview>
  <rect x="0" y="0" width="100" height="100" style="fill:#000000" inkscape:label="background" />
  <rect x="200" y="0" width="100" height="100" style="fill:#00ff9b" inkscape:label="background" />
</svg>
`;

const pixel = async (image: Buffer) => [...(await sharp(image).raw().toBuffer()).subarray(0, 3)];

describe("generateFavicons", () => {
  test("rasters are square, of their size, from the light page", async () => {
    const { files } = await generateFavicons(source);
    for (const [name, size] of [["apple-touch-icon.png", 180], ["icon-192.png", 192], ["icon-512.png", 512]] as const) {
      const image = files[name] as Buffer;
      expect(await sharp(image).metadata()).toMatchObject({ format: "png", width: size, height: size });
      expect(await pixel(image)).toEqual([0, 255, 155]);
    }
  });

  test("favicon.ico holds one 32×32 png", async () => {
    const ico = (await generateFavicons(source)).files["favicon.ico"] as Buffer;
    expect([ico.readUInt16LE(2), ico.readUInt16LE(4), ico[6], ico[7]]).toEqual([1, 1, 32, 32]);
    const png = ico.subarray(ico.readUInt32LE(18));
    expect(png.length).toBe(ico.readUInt32LE(14));
    expect(await sharp(png).metadata()).toMatchObject({ format: "png", width: 32, height: 32 });
    expect(await pixel(png)).toEqual([0, 255, 155]);
  });

  test("icon.svg shows the light page, the dark one under prefers-color-scheme: dark", async () => {
    const svg = (await generateFavicons(source)).files["icon.svg"] as string;
    expect(svg).toContain('class="light" width="100%" height="100%" viewBox="200 0 100 100"');
    expect(svg).toContain('class="dark" width="100%" height="100%" viewBox="0 0 100 100"');
    expect(svg).toContain("@media (prefers-color-scheme:dark)");
    expect(svg).not.toMatch(/inkscape|sodipodi/);
    // librsvg renders it without a dark preference — the light page
    expect(await pixel(await sharp(Buffer.from(svg)).png().toBuffer())).toEqual([0, 255, 155]);
  });

  test("the manifest and the tags point at the files, with the source hash", async () => {
    const { files, tags } = await generateFavicons(source);
    const manifest = JSON.parse(files["manifest.webmanifest"] as string);
    const v = (tags[0]?.attrs?.href as string).split("?")[1];
    expect(v).toMatch(/^v=[0-9a-f]{8}$/);
    expect(manifest.icons.map((icon: { src: string }) => icon.src)).toEqual([`/icon-192.png?${v}`, `/icon-512.png?${v}`]);
    expect(tags.map((tag) => tag.attrs?.href)).toEqual(
      ["favicon.ico", "icon.svg", "apple-touch-icon.png", "manifest.webmanifest"].map((name) => `/${name}?${v}`),
    );
    expect((await generateFavicons(source.replace("#00ff9b", "#ff0000"))).tags[0]?.attrs?.href).not.toContain(v);
  });

  test("a page missing → a clear error", async () => {
    await expect(generateFavicons(source.replace('inkscape:label="dark"', ""))).rejects.toThrow('labeled "dark"');
  });
});
