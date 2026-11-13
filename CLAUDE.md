# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Bun only — no npm / pnpm.

Dependencies: always the latest released version, pinned exactly (`"zod": "4.6.5"`, never `^` / `~`). Check the latest with `bun pm view <pkg> version` before adding. `bunfig.toml` sets `install.exact = true`, so `bun add` pins on its own.

```bash
bun install          # install workspace deps
bun run typecheck    # each package's own `typecheck` via `bun run --filter` (one root tsconfig.json, packages extend it)
bun run test         # each package's own `bun test` via `bun run --filter`
bun run toast-1      # bake toast-1 (degas) → baked/*.mp4
bun run web:dev      # web: vite dev server, proxies /api + /ws to SERVER_HOST (default localhost:3000)
bun run server:dev   # bun server with --watch: POST /api/images, /ws (PORT=3000, UPLOADS_DIR=assets/uploads)
bun run --filter @xtc-toaster/web storybook   # storybook on :6006 — the real nodes / panels / editor on toasts, no server
bun run --filter @xtc-toaster/web typecheck   # svelte-check — web pins typescript 6 (svelte-check can't run on TS 7)

cp .env.example .env && docker compose up -d   # dev stack: install → server + web, ui on http://localhost:$WEB_PORT
```

Docker compose (`docker-compose.yml`) is the dev stack: sources mounted, node_modules and uploads in named volumes, only web and storybook are published (`STORYBOOK_PORT`, default 6006), vite reaches the server as `server:3000`. `DEBUG_IMAGE` (path from the repo root, compose default `poppies.jpg`, empty — off) — the page uploads that picture on open; vite dev server only (`vite.config.ts`). A new package in `packages/*` needs its own node_modules volume there.

Prod: `Dockerfile` (multi-stage) — `docker build --target test .` is what CI runs (typecheck + `bun run test` of every package, ffmpeg 7.1 from debian trixie — not the desktop's 8), `docker build .` is the runtime image: one bun process serves the web build (`STATIC_DIR`) + `/api` + `/ws` + `/healthz`, ffmpeg inside (gif export; dev compose builds the server from the same `ffmpeg` stage). Server env: `PORT`, `HOST` (default `0.0.0.0`), `UPLOADS_DIR`, `UPLOADS_TTL_HOURS` (24), `UPLOADS_MAX_TOTAL_MB` (512), `RENDER_MAX_LAYERS` (4 — linked `layers` node rows over one render), `RENDER_MAX_FRAMES` (48 — frames of one gif export), `STATIC_DIR` (unset in dev — vite serves the page). CI — `.github/workflows/release.yml`: any branch → test, `master` → semantic-release (tags + GitHub Releases, `feat` → minor, `fix` → patch while `0.x`) → `ghcr.io/iwwwanow/xtc-toaster:<version>`.

Versions (decided 01.11):

- **app** — the semantic-release tag, the only version users see (ui corner, image tag). `0.x` until the release 28.11: never `feat!` / a `BREAKING CHANGE` footer — the default commit-analyzer makes it a major even on `0.x` and ships `1.0.0` early; a breaking change before 1.0 is a plain `feat` / `fix` / `refactor`. `1.0.0` — one deliberate `BREAKING CHANGE` commit on release day
- **toast format** (`TOAST_GRAPH_VERSION`) — stays `1` until 1.0, the format breaks freely without migrations (an old file → «not a toast file», a saved editor → the default graph). From 1.0 it is frozen: an optional field keeps the version, a breaking change is `+1` with a migration
- **packages** — private, all `0.0.0`, versioned together with the app (one image, one deploy); contract gets its own semver only if web and server ever deploy apart (`docs/backlog/2026-10-19_split-web-server-contract.md`)

Tests: `bun test` in `packages/lib` — unit tests sit next to the code (`*.test.ts`), integration/visual tests in `packages/lib/tests/`. The visual run writes every filter applied to `tests/fixtures/poppies.jpg` into `tests/output/` (gitignored, overwritten each run; `filters/_contact-sheet.png` shows all of them). Golden hashes of the toast-1 pipeline live in `tests/__snapshots__/` — update with `bun test --update-snapshots` only after an intentional change. `packages/server`: unit tests next to the code, integration in `tests/server.test.ts` (real `Bun.serve` on a random port, uploads into `tests/output/uploads`). No linting tools are configured.

Test toasts: `tests/toasts/*.json` (repo root) — graphs for checking the editor / render by hand, kept across sprints (never in `docs/`). Dev only: `http://localhost:5173/?toast=<name>` imports one on open (`vite.config.ts`, plugin `debug-toasts`). `packages/web/src/test-toasts.test.ts` imports them all — `broken-*` must be refused. What each one checks — `tests/toasts/README.md`; a new one gets a row there.

## Repo structure

Bun workspace, packages in `packages/*`:

- `lib` (`@xtc-toaster/lib`) — pixel processing, DDD-lite: `domain/` (entities, services, utils), `infrastructure/` (image I/O via `canvas`, ffmpeg video assembly), `application/` (`Toast` — stub). Not compiled: `main.ts` exports `.ts` source directly
- `contract` (`@xtc-toaster/contract`) — shared zod schemas / types: toast graph, ws messages, upload (unit tests next to the code)
- `toasts` (`@xtc-toaster/toasts`) — toasts. Graph toasts are exported from the root barrel (`toast1degas`, `toast2signac`) — each a `toast.json` in its directory. `toast-1_degas/index.ts` is a CLI script on top of lib (runs on import — never import it from other packages, never put it into the barrel); its graph is `toast-1_degas/graph.ts`
- `server` (`@xtc-toaster/server`) — `Bun.serve`: `POST /api/images` (upload into `assets/uploads/<imageId>`), `/ws` (render a `ToastGraph`, per-connection latest-wins queue). `src/index.ts` is the composition root (env → config → `createServer`). `application/run-graph.ts` evaluates the graph (a DAG pulled from the output, `layers` rows → lib layers; one node type → one lib `Layer` method) on top of lib, `application/render.ts` wraps it in `encodePng`. Pictures reach application through the `LoadImage` port (`run-graph.ts`), `render-worker.ts` plugs `loadUpload` into it — application imports nothing from infrastructure. The whole render (`runGraph` + png encoding) runs in **one** worker thread (`infrastructure/workers/render-queue.ts` → `render-worker.ts`) so ws messages reach the queue during a render — never a second worker that uses `canvas`: bun crashes (NAPI fatal error). HTTP/WS lives in `infrastructure/presentation/`, uploads files (quota / TTL / serialized save) in `infrastructure/repository/uploads.ts`. The server no longer touches `canvas` directly — the codec lives in `lib/infrastructure/image-codec.ts`

- `web` (`@xtc-toaster/web`) — Svelte + Vite SPA on `@xyflow/svelte`: fixed graph from `toast2signac`, upload, ws render, png download. Logic in plain `.ts` (`graph`, `animation`, `layers`, `session.svelte`, `socket`, `upload`, `files`), one component per node type in `src/nodes/`. Never imports `lib`. Favicon: the source is `favicon/favicon.svg` (Inkscape, two opaque pages labeled `light` / `dark`); the plugin in `favicon/favicon.ts` generates ico / svg (theme via `prefers-color-scheme`) / apple-touch / manifest pngs (light page) on every dev start and build — nothing generated is committed

Target structure, dependency rules, the ws/http contract and sprint status — `docs/sprints/sprint-1.spec.md` (the spec wins over this file).

## Project-wide conventions

- **Barrel exports.** A package exposes one entry — `"exports": { ".": "<barrel>" }` (`src/index.ts`, lib: `main.ts`) — and other packages import only from the package root, never subpaths or deep paths. Inside a package, a folder with a public surface gets its own `index.ts` barrel. A barrel never re-exports a module with side effects on import (e.g. `toast-1_degas`).
- **Output file naming.** Every file the web ui gives the user (png, gif / mp4, exported toast) is named `xtc-toaster_<YYYYMMDD-HHmmss>.<ext>`, timestamp in local time, whatever toast is open (decided 10.11 — the toast's own name was always `toast-2_signac`). Example: `xtc-toaster_20261009-153012.png`. The bake script `toast-1_degas` still names its video by the input picture (its own TODO).

## Sprint process

- **QA runs once, at the end of the release** (sprint 6, before 28.11 — decided 01.11, confirmed 06.11). During a sprint nobody runs QA, and a sprint closes without it: each sprint only writes its `docs/sprints/sprint-N.qa.md` list, the open items of every list are run all at once at the end. Checks while implementing (tests, a headless browser) are not QA and stay
- **The UI will be redrawn by the user by hand** (06.11). Until then the ui only has to work: no visual polish, no layout rework beyond what a feature needs

## Storybook — setting up the ui by hand

`packages/web/.storybook` + `src/stories` (13.11). Stories run the real components on the real `session`: `load.svelte.ts` imports a toast (a `tests/toasts` name or `single(type)` — one node with its defaults) through `session.importToast`, from an `$effect` (never from a template — `state_unsafe_mutation`). No server: `connected` unlocks the fields, `picture` puts a fake uuid into the input and lib's `poppies.jpg` in as the render, `renderError` / `errorNode` stand for the server's refusal; `StoryEditor` answers every render request at once (else App's render leaves the editor locked). `StoryCanvas` — nodes only, `StoryEditor` — the whole App. A new node type or state → a story in `nodes.stories.ts`; stories pass the web typecheck (CI).

## UI styles — uiu first

`web` takes its styles from **uiu** (`github.com/iwwwanow/uiu`: `owo.css` — tokens, reset, typography; `ai-generated.css` — components with the `_ai-generated` suffix) — a bun git dependency of `packages/web`, pinned to a release tag (`"uiu": "github:iwwwanow/uiu#vX.Y.Z"`, `import "uiu/owo.css"`); bump: the tag + `bun install`, a `chore(web): uiu vX.Y.Z` commit. uiu itself is edited in `../iwwwanow_uiu`, released there, then bumped here.

- uiu covers it → use its tokens / classes, no local copy
- uiu doesn't cover it (node frame, color / file input, xyflow chrome, …) → write the style here, mark it `/* TODO(uiu): hand-written — uiu has no <what> */` and right away add a backlog note (`/log-backlog`) to move it into uiu
- the node look stays a `fieldset` with a `legend`, its frame written by hand here from uiu's fieldset / border / font / spacing styles (a `TODO(uiu)` case)

## lib architecture

Zero-DOM: everything works on raw `Uint8ClampedArray` RGBA (`ImageRawDataArray`), the browser/canvas is only touched in `infrastructure/`.

1. `imageFileToRawData(path, scale)` → pixels + dimensions
2. `Composition(width, height)` creates layers: `createLayerFromPixelData`, `createBlankLayer`, `createColorLayer`, `duplicateLayer`
3. `Layer` — pixel data + options, **flat: one method per graph node type, the same name in web / contract / server / lib** (01.11): select — `selectColor` / `selectVivid` / `selectBright` (falloff) / `channel`; color — `fill` / `tint` / `colorNoise` / `opacity`; effect — `blur`; move — `move` / `rotate` / `scale` / `skew` / `turn3d` / `corners` / `matrix`; `setBlendMode` (a `layers` row). Units stay lib's (px, 0–1 tolerances) — the server converts the contract's percent / mm
4. `Composition.render()` reduces layers in creation order through composers: `normal` (alpha), `add`, `lch-hue`
5. `rawDataToImageFile` / `assembleVideo` / `loopVideoTo` — export

Public surface is `domain/entities` + `domain/types`; services and utils are internal (called only from Layer / Composition). Full spec — `docs/specs/domain.spec.ts`.

### Conventions

- colors normalized to `0–1` internally, `0–255` in storage
- HSL is `0–1` for all components; HSV is H in degrees (0–360), S/V in percent (0–100) — inherited from legacy, kept for 1:1 parity
- `colorNoise` uses `Math.random` — rendering a graph with it is not deterministic
- `canvas` can't decode webp and ignores EXIF orientation

## Docs

- `docs/sprints/` — current sprint spec + d2 diagram (`d2 --watch docs/sprints/sprint-1.diagram.d2 docs/sprints/sprint-1.diagram.svg`)
- `docs/backlog/` — open ideas, frozen plans, tech debt (native Zig + Skia backend, hot-loop allocations, lib tech debt, …)
- `docs/diary/` — session logs
- `docs/specs/` — lib specs
