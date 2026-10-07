# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Bun only — no npm / pnpm.

```bash
bun install          # install workspace deps
bun run typecheck    # each package's own `typecheck` via `bun run --filter` (one root tsconfig.json, packages extend it)
bun run toast-1      # bake toast-1 (degas) → baked-toasts/*.mp4
bun run web:dev      # web dev server (packages/web — being rebuilt in sprint 1)
```

Tests: `bun test` in `packages/lib` — unit tests sit next to the code (`*.test.ts`), integration/visual tests in `packages/lib/tests/`. The visual run writes every filter applied to `tests/fixtures/poppies.jpg` into `tests/output/` (gitignored, overwritten each run; `filters/_contact-sheet.png` shows all of them). Golden hashes of the toast-1 pipeline live in `tests/__snapshots__/` — update with `bun test --update-snapshots` only after an intentional change. Known bugs are pinned as `test.failing`. No linting tools are configured.

## Repo structure

Bun workspace, packages in `packages/*`:

- `lib` (`@xtc-toaster/lib`) — pixel processing, DDD-lite: `domain/` (entities, services, utils), `infrastructure/` (image I/O via `canvas`, ffmpeg video assembly), `application/` (`Toast` — stub). Not compiled: `main.ts` exports `.ts` source directly
- `toasts` (`@xtc-toaster/toasts`) — toasts. `toast-1_degas` is a CLI script on top of lib (runs on import — never import it from other packages)
- `server` (`@xtc-toaster/server`) — empty manifest, built in sprint 1

Sprint 1 adds `contract` (shared zod schemas / types), `server`, `web` (Svelte + Vite SPA) and `toast-2_signac` (first toast in graph form). Target structure, dependency rules and the ws/http contract — `docs/sprints/sprint-1.spec.md` (the spec wins over this file).

`legacy/` — the old browser playground, kept for reference, not part of the workspace.

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
