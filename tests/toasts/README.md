# test toasts

Toast files (the export format, `imageId: null`) for checking the editor and the render by hand — a graph that would take minutes to build in the ui. Kept across sprints: rerun them after any change to the graph, the layers node or the render.

Open in dev: `http://localhost:5173/?toast=<name>` (file name without `.json`, or a preset — below) — the page imports the toast on open, the `DEBUG_IMAGE` picture goes into its input. Dev server only (`packages/web/vite.config.ts`, plugin `debug-toasts`); in a prod build the param does nothing. Anywhere else — the import toast button.

`broken-*` must be refused on import. `packages/web/src/test-toasts.test.ts` imports every file here: the rest must import, `broken-*` must fail — a contract change that breaks a toast turns `bun run test` red.

| toast | expect |
|---|---|
| `all-nodes` | input → blur → rotate → scale → move → channel → output; the selects unlinked below |
| `more-nodes` | input → skew → corners → matrix → tint → opacity → output; fill unlinked |
| `fork-3` | input → 3 chains → layers node (normal / add / normal, opacity in the middle chain) → output: poppies over a green add over color noise |
| `fork-fill` | fill and tint write in place — the other branches get the untouched picture: sharp red poppies over a half-transparent blue tint over gray. Poppies gone or tinted → a buffer leaked between branches |
| `limit-4` | 4 rows, one quarter each — a 2×2 collage (at the `RENDER_MAX_LAYERS` fallback of 4) |
| `limit-5` | the same + a center row → `render-error` on the layers node: over 4 layers |
| `nested-4` | layers node (2 rows) in a layers node (2 rows) = 4 → three quarters render |
| `nested-5` | 2 + 3 = 5 → `render-error` (the cap counts all layers nodes of a render) |
| `hidden-row` | fork-3 with names (`poppies`, `hue noise`) and the green `add` row hidden: poppies over hue noise, no green; the hidden row dimmed, its checkbox off |
| `unlinked-row` | the top row unlinked — skipped; poppies over the picture |
| `empty-layers` | no row linked → `render-error` on the layers node |
| `animation` | input → move → opacity → output with an animation node below: 4 tracks (a new one on top, empty and unlinked — `track 4`; `opacity.opacity`; `move.y` with a dimmed key past the end; `move.x`). Dashed wires; `x`, `y`, `opacity` fields read-only; a ruler click changes the output picture |
| `broken-animation-two-nodes` | import refused: only one animation node |
| `broken-animation-pixel-link` | import refused: a pixel link into a track |
| `broken-cycle` | import refused: a cycle (off the output path) |
| `broken-double-link` | import refused: two links into one layers row |

### presets

The toasts users get (`packages/toasts/src/toasts/<name>/toast.json`) open by their directory name too. Their tests sit next to them.

| toast | expect |
|---|---|
| [`toast-2_signac`](http://localhost:5173/?toast=toast-2_signac) | the default graph: input → color noise → select color → 3d turn → output |
| [`toast-1_degas`](http://localhost:5173/?toast=toast-1_degas) | the degas script: 7 layers rows (dark gray, blurred, light gray, blue `lch-hue`, purple / red / white select bright), a gray-turquoise picture with magenta and red in the darks. **Needs `RENDER_MAX_LAYERS=8`** in `.env` (the fallback 4 → `over 4 layers` on the layers node). At frame 0 — bit for bit with the script (`packages/server/tests/degas.test.ts`). Animated: an animation node with 24 tracks (3 `corners` × 6, 3 `move` × 2), 24 frames at 36 fps, a 15 s loop — `render animation` exports the script's movement |

A new toast: write the json by hand or build it in the ui and export; name it by what it checks, add a row here.
