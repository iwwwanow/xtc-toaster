# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Vite dev server
npm run typecheck  # TypeScript type checking (no emit)
npm run build      # Type check + production build
npm run preview    # Preview production build
```

No test framework is set up. There are no linting tools configured.

## Architecture

A canvas-based image composition playground for pixel-level image processing experiments. Zero production dependencies — uses only native browser Canvas and ImageData APIs.

### Rendering Pipeline

Layers are created, processed, then reduced into a final image on canvas:

1. **Source image** → loaded into canvas → read as `ImageData` (`Uint8ClampedArray`, 4 bytes/pixel RGBA)
2. **Cutters** (`/lib/cutters/`) → extract subsets of pixel data by channel or color property (hue, saturation, value)
3. **Layer** (`/lib/classes/layer.class.ts`) → wraps pixel data with blend mode, opacity, effects, and transform
4. **Effects** → applied via `Layer.addEffect()` (e.g., `LayerEffect.Noize` for hue noise)
5. **Reducer** (`/lib/reducers/merged-layer.reducer.ts`) → merges layers pairwise using a composer
6. **Composers** (`/lib/composers/`) → implement blend modes: `alpha` (normal compositing) and `add` (additive)
7. **Composition** (`/lib/classes/composition.class.ts`) → orchestrates the whole pipeline, owns the canvas

### Key Conventions

- Colors are normalized to `0–1` range internally, `0–255` in `Uint8ClampedArray` storage
- Color space utilities live in `/lib/utils/`: RGB↔HSL↔HSV↔hex conversions
- Blend modes are selected via `BlendMod` enum on each layer
- Demo compositions live in `/compositions/composition-N/index.ts` and are linked from `index.html`

### In-Progress / Known Issues (from planning.md)

- Layer ordering affects the final result but shouldn't — there's a known bug in the compositing math to revisit
- `transformed-layers` mapper is incomplete
- Naming: cutters should be called `cut` not `level`
