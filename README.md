<p align="center">
  <img src="assets/logo/logo-color.png" alt="xtc toaster" width="220" />
</p>

# xtc toaster

Node editor for layer-based pixel processing. Upload a picture, build a toast — a graph `input → … → output` of effect, mask and transform nodes — the server renders it, download the png, export / import the toast as a file.

Status: `0.x`, 1.0 planned for 28.11. Nodes — every single-layer operation lib has: hue noise, blur; hue / saturation / value mask; isolate channel; fill, tint, opacity; translate, rotate, scale, skew, perspective, homography, y-rotation. Plan and sprints — [`docs/planning.md`](docs/planning.md), [`docs/sprints/`](docs/sprints/).

## Packages

Bun workspace, `packages/*`:

- `lib` — pixel processing on raw RGBA arrays (zero-DOM), image I/O via `canvas`, video via ffmpeg
- `contract` — shared zod schemas: toast graph, ws messages, upload
- `server` — `Bun.serve`: `POST /api/images`, `/ws` (renders a toast graph in a worker thread), `/healthz`; in prod also serves the web build
- `web` — Svelte + Vite SPA on `@xyflow/svelte`
- `toasts` — toasts: graph toasts (`toast2signac`) and the `toast-1` CLI bake

## Run

Requires Bun; ffmpeg for video (`toast-1`, lib tests).

```bash
cp .env.example .env && docker compose up -d   # dev stack, ui on http://localhost:$WEB_PORT

# or without docker
bun install
bun run server:dev   # :3000
bun run web:dev      # vite, proxies /api + /ws to the server

bun run typecheck
bun run test
bun run toast-1      # example toast → baked/*.mp4
```

Prod — one image, one bun process (web build + `/api` + `/ws` + `/healthz`):

```bash
docker build --target test .   # what CI runs: typecheck + tests
docker build -t xtc-toaster .  # runtime
docker run -p 3000:3000 xtc-toaster
```

Server env: `PORT`, `HOST`, `UPLOADS_DIR`, `UPLOADS_TTL_HOURS` (24), `UPLOADS_MAX_TOTAL_MB` (512), `STATIC_DIR`.

Releases: push to `master` → CI → semantic-release (`feat` → minor, `fix` → patch) → `ghcr.io/iwwwanow/xtc-toaster:<version>`.

## lib

```ts
import {
  Composition,
  Color,
  imageFileToRawData,
  rawDataToImageFile,
} from "@xtc-toaster/lib";

const { data, width, height } = await imageFileToRawData("in.jpg");
const comp = new Composition(width, height);

comp.createBlankLayer().fill(Color.fromHex("#a4a4a4"));

const red = comp.createLayerFromPixelData(data);
red.mask({ name: "value", value: 12, tolerance: 0.24 });
red.tint(Color.fromHex("#ff0000"));
red.applyEffect({ name: "blur", options: { radius: 4 } });

await rawDataToImageFile(comp.render(), { width, height }, "out.png");
```

- **Layer** — `mask` (hue / saturation / value), `isolateChannel`, `fill`, `tint`, `applyEffect` (`hueNoise`, `blur`), `setTransform` (translate / rotate / scale / skew / homography / perspective / yRotation), `setBlendMode` (`normal`, `add`, `lch-hue`), `setOpacity`
- **I/O** — `imageFileToRawData` / `rawDataToImageFile` (via `canvas`), `assembleVideo` / `loopVideoTo` (ffmpeg)

Spec: [`docs/specs/domain.spec.ts`](docs/specs/domain.spec.ts).
