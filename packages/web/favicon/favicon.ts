import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import type { HtmlTagDescriptor, Plugin } from "vite";

// The source is an Inkscape document with two pages, labeled "light" and "dark" (opaque, square).
// Browsers that take svg get both, switched by prefers-color-scheme; every raster file is the light one.
// Runs under node too (`vite build`) — no Bun APIs here.

type Page = { label: string; x: number; y: number; width: number; height: number };

export type Favicons = {
  files: Record<string, string | Buffer>;
  tags: HtmlTagDescriptor[];
};

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

const readPages = (source: string): Page[] =>
  [...source.matchAll(/<inkscape:page\b[^>]*>/g)].map(([tag]) => ({
    label: attr(tag, "inkscape:label") ?? "",
    x: Number(attr(tag, "x") ?? 0),
    y: Number(attr(tag, "y") ?? 0),
    width: Number(attr(tag, "width")),
    height: Number(attr(tag, "height")),
  }));

const findPage = (pages: Page[], label: string) => {
  const page = pages.find((p) => p.label === label);
  if (!page) throw new Error(`favicon: no Inkscape page labeled "${label}"`);
  return page;
};

// the drawing without the Inkscape editor state — the output declares no inkscape / sodipodi namespaces
const readBody = (source: string) => {
  const open = source.match(/<svg\b[^>]*>/);
  const end = source.lastIndexOf("</svg>");
  if (!open || open.index === undefined || end === -1) throw new Error("favicon: not an svg");
  return source
    .slice(open.index + open[0].length, end)
    .replace(/<sodipodi:namedview\b[^>]*\/>|<sodipodi:namedview\b[\s\S]*?<\/sodipodi:namedview>/g, "")
    .replace(/<metadata\b[\s\S]*?<\/metadata>/g, "")
    .replace(/\s(?:inkscape|sodipodi):[\w-]+="[^"]*"/g, "")
    .replace(/\n\s*\n/g, "\n")
    .trim();
};

const viewBox = (p: Page) => `${p.x} ${p.y} ${p.width} ${p.height}`;

const pageSvg = (body: string, page: Page) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${page.width}" height="${page.height}" viewBox="${viewBox(page)}">\n${body}\n</svg>\n`;

// nested <svg> clips to its viewBox, so each one shows only its page
const themedSvg = (body: string, light: Page, dark: Page) =>
  [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${light.width} ${light.height}">`,
    "<style>.dark{display:none}@media (prefers-color-scheme:dark){.light{display:none}.dark{display:inline}}</style>",
    `<svg class="light" width="100%" height="100%" viewBox="${viewBox(light)}">\n${body}\n</svg>`,
    `<svg class="dark" width="100%" height="100%" viewBox="${viewBox(dark)}">\n${body}\n</svg>`,
    "</svg>\n",
  ].join("\n");

const png = (svg: string, size: number) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();

// an .ico may hold a png as is: ICONDIR (6 bytes) + one ICONDIRENTRY (16 bytes) + the png
const ico = (image: Buffer, size: number) => {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  header.writeUInt8(size % 256, 6); // width, 0 = 256
  header.writeUInt8(size % 256, 7); // height
  header.writeUInt16LE(1, 10); // color planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(image.length, 14);
  header.writeUInt32LE(header.length, 18); // offset of the png
  return Buffer.concat([header, image]);
};

export const generateFavicons = async (source: string): Promise<Favicons> => {
  const pages = readPages(source);
  const light = findPage(pages, "light");
  const dark = findPage(pages, "dark");
  const body = readBody(source);
  const lightSvg = pageSvg(body, light);

  // fixed names (favicon.ico must sit at the root anyway), the source hash busts the browser's favicon cache
  const v = `?v=${createHash("sha256").update(source).digest("hex").slice(0, 8)}`;
  const manifest = {
    name: "xtc-toaster",
    short_name: "xtc-toaster",
    icons: [192, 512].map((size) => ({ src: `/icon-${size}.png${v}`, sizes: `${size}x${size}`, type: "image/png" })),
  };

  const files = {
    "favicon.ico": ico(await png(lightSvg, 32), 32),
    "icon.svg": themedSvg(body, light, dark),
    "apple-touch-icon.png": await png(lightSvg, 180),
    "icon-192.png": await png(lightSvg, 192),
    "icon-512.png": await png(lightSvg, 512),
    "manifest.webmanifest": `${JSON.stringify(manifest, null, 2)}\n`,
  };

  const link = (attrs: Record<string, string>): HtmlTagDescriptor => ({ tag: "link", attrs, injectTo: "head" });
  const tags = [
    link({ rel: "icon", href: `/favicon.ico${v}`, sizes: "32x32" }),
    link({ rel: "icon", href: `/icon.svg${v}`, type: "image/svg+xml" }),
    link({ rel: "apple-touch-icon", href: `/apple-touch-icon.png${v}` }),
    link({ rel: "manifest", href: `/manifest.webmanifest${v}` }),
  ];

  return { files, tags };
};

const CONTENT_TYPES: Record<string, string> = {
  "favicon.ico": "image/x-icon",
  "icon.svg": "image/svg+xml",
  "apple-touch-icon.png": "image/png",
  "icon-192.png": "image/png",
  "icon-512.png": "image/png",
  "manifest.webmanifest": "application/manifest+json",
};

// generated on every dev start / build — nothing generated is committed, so a new svg is the new favicon
export const favicon = (sourcePath: string): Plugin => {
  let favicons: Promise<Favicons> | undefined;
  const load = () => (favicons = readFile(sourcePath, "utf8").then(generateFavicons));
  const get = () => favicons ?? load();

  return {
    name: "favicon",
    configureServer(server) {
      server.watcher.add(sourcePath);
      server.watcher.on("change", (path) => {
        if (path !== sourcePath) return;
        load();
        server.ws.send({ type: "full-reload" });
      });
      server.middlewares.use(async (req, res, next) => {
        const name = new URL(req.url ?? "/", "http://localhost").pathname.slice(1);
        if (!(name in CONTENT_TYPES)) return next();
        try {
          res.setHeader("content-type", CONTENT_TYPES[name]);
          res.end((await get()).files[name]);
        } catch (error) {
          next(error);
        }
      });
    },
    buildStart() {
      this.addWatchFile(sourcePath);
    },
    transformIndexHtml: async () => (await get()).tags,
    async generateBundle() {
      for (const [fileName, source] of Object.entries((await get()).files)) {
        this.emitFile({ type: "asset", fileName, source });
      }
    },
  };
};
