# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Bun only — no npm / pnpm.

Dependencies: always the latest released version, pinned exactly (`"zod": "4.6.5"`, never `^` / `~`). Check the latest with `bun pm view <pkg> version` before adding. `bunfig.toml` sets `install.exact = true`, so `bun add` pins on its own.

```bash
bun install          # install workspace deps
bun run typecheck    # each package's own `typecheck` via `bun run --filter` (one root tsconfig.json, packages extend it)
bun run toast-1      # bake toast-1 (degas) → baked/*.mp4
bun run web:dev      # vite dev server, proxies /api + /ws to SERVER_HOST (default localhost:3000)
bun run server:dev   # bun server with --watch: POST /api/images, /ws (PORT=3000, UPLOADS_DIR=assets/uploads)
bun run --filter @xtc-toaster/web typecheck   # svelte-check — web pins typescript 6 (svelte-check can't run on TS 7)

cp .env.example .env && docker compose up -d   # dev stack: install → server + web, ui on http://localhost:$WEB_PORT
```

Docker compose (`docker-compose.yml`) is the dev stack: sources mounted, node_modules and uploads in named volumes, only web is published, vite reaches the server as `server:3000`. A new package in `packages/*` needs its own node_modules volume there.

Tests: `bun test` in `packages/lib` — unit tests sit next to the code (`*.test.ts`), integration/visual tests in `packages/lib/tests/`. The visual run writes every filter applied to `tests/fixtures/poppies.jpg` into `tests/output/` (gitignored, overwritten each run; `filters/_contact-sheet.png` shows all of them). Golden hashes of the toast-1 pipeline live in `tests/__snapshots__/` — update with `bun test --update-snapshots` only after an intentional change. `packages/server`: unit tests next to the code, integration in `tests/server.test.ts` (real `Bun.serve` on a random port, uploads into `tests/output/uploads`). No linting tools are configured.

## Repo structure

Bun workspace, packages in `packages/*`:

- `lib` (`@xtc-toaster/lib`) — pixel processing, DDD-lite: `domain/` (entities, services, utils), `infrastructure/` (image I/O via `canvas`, ffmpeg video assembly), `application/` (`Toast` — stub). Not compiled: `main.ts` exports `.ts` source directly
- `contract` (`@xtc-toaster/contract`) — shared zod schemas / types: toast graph, ws messages, upload (unit tests next to the code)
- `toasts` (`@xtc-toaster/toasts`) — toasts. Graph toasts are exported from the root barrel (`toast2signac`). `toast-1_degas` is a CLI script on top of lib (runs on import — never import it from other packages, never put it into the barrel)
- `server` (`@xtc-toaster/server`) — `Bun.serve`: `POST /api/images` (upload into `assets/uploads/<imageId>`), `/ws` (render a `ToastGraph`, per-connection latest-wins queue). `run-graph.ts` executes the chain on top of lib; `codec.ts` is the only place touching `canvas` directly (temporary, moves into lib)

Sprint 1 also builds `web` (Svelte + Vite SPA) and `toast-2_signac` (first toast in graph form). Target structure, dependency rules and the ws/http contract — `docs/sprints/sprint-1.spec.md` (the spec wins over this file).

## Project-wide conventions

- **Barrel exports.** A package exposes one entry — `"exports": { ".": "<barrel>" }` (`src/index.ts`, lib: `main.ts`) — and other packages import only from the package root, never subpaths or deep paths. Inside a package, a folder with a public surface gets its own `index.ts` barrel. A barrel never re-exports a module with side effects on import (e.g. `toast-1_degas`).
- **Output file naming.** Every file the project produces for the user (render downloads, baked videos, exports) is named `<toast>_<YYYYMMDD-HHmmss>.<ext>` — `<toast>` is the toast directory name, timestamp in local time. Example: `toast-2_signac_20261009-153012.png`.

## lib architecture

Zero-DOM: everything works on raw `Uint8ClampedArray` RGBA (`ImageRawDataArray`), the browser/canvas is only touched in `infrastructure/`.

1. `imageFileToRawData(path, scale)` → pixels + dimensions
2. `Composition(width, height)` creates layers: `createLayerFromPixelData`, `createBlankLayer`, `createColorLayer`, `duplicateLayer`
3. `Layer` — pixel data + options: `mask` (hue / saturation / value with falloff), `isolateChannel`, `fill`, `tint`, `applyEffect` (`noize`, `blur`), `setTransform` (translate / rotate / scale / skew / homography / perspective), `setBlendMode`, `setOpacity`
4. `Composition.render()` reduces layers in creation order through composers: `normal` (alpha), `add`, `lch-hue`
5. `rawDataToImageFile` / `assembleVideo` / `loopVideoTo` — export

Public surface is `domain/entities` + `domain/types`; services and utils are internal (called only from Layer / Composition). Full spec — `docs/specs/domain.spec.ts`.

### Conventions

- colors normalized to `0–1` internally, `0–255` in storage
- HSL is `0–1` for all components; HSV is H in degrees (0–360), S/V in percent (0–100) — inherited from legacy, kept for 1:1 parity
- `noize` uses `Math.random` — rendering a graph with it is not deterministic
- `canvas` can't decode webp and ignores EXIF orientation

## Docs

- `docs/sprints/` — current sprint spec + d2 diagram (`d2 --watch docs/sprints/sprint-1.diagram.d2 docs/sprints/sprint-1.diagram.svg`)
- `docs/backlog/` — open ideas, frozen plans, tech debt (native Zig + Skia backend, hot-loop allocations, lib tech debt, …)
- `docs/diary/` — session logs
- `docs/specs/` — lib specs
