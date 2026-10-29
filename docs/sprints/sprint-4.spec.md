4. 26.10-01.11. two-layers toast
   - 1 week
   - ~~layer composing on output node~~ → a separate **composer** node (decided before 26.10, `sprint-4.diagram.d2`)
   - export picture (png) — done in sprint 2 (download png), only a DoD check here
   - connection validation — `docs/backlog/2026-10-13_node-connection-validation.md`
   - cut if behind:
     - (#4) blend-modes: normal + add only

### status (2026-10-29) — measured, layer name + visible, merged; QA → sat

- measurement: 4 rows ~375, 7 rows ~415 of 512 MiB, no OOM; the limit is time (~1.2 s per row) → prod `RENDER_MAX_LAYERS=8` — `docs/diary/2026-10-29_sprint-4-qa-and-measurement.md`
- QA: test toasts in `tests/toasts/` (`?toast=<name>` in dev); sections 1 + 2.1–2.3 passed; found — the layer name is positional, no `visible` → both done the same day (contract `name?` / `visible?`, server skips hidden rows, web: checkbox + rename on double-click)
- merged into master before QA ends (the user's call) → `0.5.0`; the rest of QA + section 6 (name / visible) — **sat 31.10**. Week plan shifts: 30.10 uiu as planned, 31.10 QA + stretch, 01.11 buffer / close

### status (2026-10-28) — contract, server and web done

- 27.10 went to decisions (spec, backlog), no code; 28.10 — contract + server (`92fb7ea`, `bb041bb`)
- web done the same evening (`ComposerNode`, drag reorder, `canConnect` + replace, fork layout) — the day caught up: 29.10 QA + measurement + release, 30.10 uiu, as planned

### status (2026-10-26) — spec written, work starts 27.10

- the spec was a 5-line stub; brought up to the sprint 3 shape. Open questions answered 26.10 — see the decisions at the end; the analysis — `docs/diary/2026-10-26_sprint-4-planning.md`
- sprint 3 closed 26.10: the sister's feedback received — `docs/backlog/2026-10-26_sprint-3-user-test-feedback.md`; manual review + refactoring → sprint 7 (the last week)
- 5 working days: 27.10–31.10 + 01.11 as buffer

---

## slice: composer

Several layers of one picture, each processed by its own chain, composed with a blend mode — what toast-1 (degas) does in code, now in the editor:

```
input ─┬─ opacity ─ isolate channel ──► ● layer 1  [add ▾]    ┐
       ├─ hue noise ─────────────────► ● layer 2  [normal ▾] ├ composer ●──► output
       └─────────────────────────────► ● layer 3  [normal ▾] ┘
```

the output of a node may be linked to any number of nodes (xyflow allows several edges per source handle — no multiplier node, no "duplicate output" button). A composer row = one layer: its own target handle, blend mode, drag-to-reorder. The top row is the top layer.

### must

#### contract

- edge gets an optional `targetHandle` — the composer's layer row it goes into; every other node has one unnamed handle (no field). Toast files of sprint 2–3 (no `targetHandle`) stay valid → `TOAST_GRAPH_VERSION` stays `1` (additive change)
- `composer` node: `data: { layers: [{ id, blendMode }] }` — **top first**; `id` — the handle id (unique within the node), `blendMode` — `normal` | `add` | `lch-hue`. At least 1 layer, **no max in the contract** — the cap is a server env (see server). New node — 2 layers, both `normal`
- `validateGraph` (contract, used by server **and** web `isValidConnection`) — the rules beyond the zod shape:
  - one link per target handle (a node's input, a composer row)
  - a composer edge's `targetHandle` is one of its layer ids; any other node's edge has none
  - no cycles, no self-links; nothing links into `input`, nothing out of `output`
  - checks the **whole** graph, dead branches too (decided 27.10 — simpler, the same rules for web and server; the sprint 3 test "ignores a cycle off the path" flips)
  - still exactly one input and one output
- tests next to the code — like `graph.test.ts`

#### server — the graph is a DAG, not a path

- `toPath` → evaluation pulled from the output (as now — nodes off the output's ancestry are ignored, unlinked nodes don't error), each node evaluated once per render (memo by node id)
- what flows along an edge: pixels + opacity (opacity nodes keep multiplying, as now; baked into the layer at the composer / at the output)
- fan-out: a node consumed by several nodes hands every consumer but the last a **copy**, the last gets the original and the result is dropped (memory follows live buffers, not the node count) — lib ops are eager and `fill` / `tint` write in place (the rest allocate a new array, checked 27.10)
- composer: linked rows bottom → top → `createLayerFromPixelData` + `setOpacity` + `setBlendMode`, `render()` → pixels with opacity 1. Unlinked rows are skipped; no linked row → `render-error` on the composer. The bottom row's blend mode has no effect (nothing under it) — the ui says so
- composer → composer (nesting) works for free — no special case
- layer cap — env `RENDER_MAX_LAYERS`, fallback **4** (decided 27.10): the sum of linked rows over **all** composers of one render (a per-composer cap is bypassed by nesting) → over it `render-error` on the composer that crosses it. Unmeasured guess — the 29.10 measurement sets the prod value. Documented with the other server env (`CLAUDE.md`, `.env.example`, compose)
- errors keep pointing at the node (`nodeId`)
- a chain linked into a composer row but not reaching the input → `render-error` on the dangling node, like any chain now (decided 27.10; a warning instead — stretch 5)
- tests: fan-out (input → 2 chains → composer), order (swap rows → different hash), each blend mode, opacity in a chain, unlinked row, empty composer, over `RENDER_MAX_LAYERS` (incl. nested), cycle / double link refused by `validateGraph`

#### web

- `ComposerNode.svelte`: a row per layer — drag handle `⠿`, label `layer N`, blend mode `<select>`, `×` (removes the row and its link), target handle on the left; `+` adds a row on top; one source handle. The row order is the layer order
- reorder by dragging rows inside the node (`nodrag` on the rows); if drag costs more than half a day — `↑` / `↓` buttons, drag → stretch
- `toGraph` / `toFlow` carry `targetHandle`; import lays out a branched graph by depth from the input (the chain-only `chainOrder` breaks on forks)
- `isValidConnection` via contract `validateGraph`; a link dropped on a taken handle **replaces** the old link (like blender) instead of being refused
- composer in the left menu
- export / import toast with a composer — round trip; signac and old exports import unchanged

#### ui kit — uiu (spot use)

`iwwwanow_uiu` (owo design language: `owo.css` tokens + reset + typography, `ai-generated.css` components). Count of what's missing (26.10): node frame (owo's `.hr_fieldset` is a separator, not a frame), color input, file input, dark theme, xyflow chrome (handles, `Controls`, edges) — ~5, small enough → use it.

- the rule in `CLAUDE.md` — written 26.10: uiu first; a hand-written style gets a `TODO(uiu)` comment + a backlog note (`/log-backlog`) to move it into uiu
- dependency — a **bun git dependency** in `packages/web` (decided 26.10 — simpler than a submodule: no CI / clone changes): `"uiu": "github:iwwwanow/uiu#v0.3.0"` (the latest tag on 26.10), `bun.lock` pins the commit
  - web imports the css from the package: `import "uiu/owo.css"`, `"uiu/ai-generated.css"` — vite bundles it, nothing is fetched from GitHub Pages at runtime (owo's Google Fonts `@import` stays external)
  - a bump — the tag in `package.json` + `bun install`, a `chore(web): uiu vX.Y.Z` commit; no Renovate on this repo → by hand
  - check: `bun install` takes a git repo whose root `package.json` is `private` and has no `exports` (named `iwwwanow-uiu` — the dependency key `uiu` is the folder name); the docker `deps` stage (`bun install --frozen-lockfile`) reaches GitHub; the dev compose `install` service too
  - trying uiu changes locally before a release — `bun link` from `../iwwwanow_uiu` (or a compose override mount, like owo does), never committed
  - uiu changes are made in `../iwwwanow_uiu` → released there → the tag bumped here
- **the node frame** — the fieldset with a legend **stays** (the user likes it) and is written **by hand here**, built from uiu: owo's `.hr_fieldset` (legend padding `0 4px`, lowercase, `--MEDIUM` text) + `.border` (1px, `--LIGHT` → `--DARK` on hover / selected), uiu fonts, paddings from `--GRID-GAP*`. Marked `TODO(uiu)` + a backlog note (a framed fieldset for uiu) by the rule
- spike first (≤ 2 h): owo's global reset (`* { border: none; margin: 0; padding: 0 }`) vs xyflow's own css (handles, `Controls`, edges, panels) — what it breaks and what goes back by hand
- apply to what exists: buttons (actions panel), `<select>` (isolate channel, composer blend), range sliders, number inputs (homography), the menu panel, the error / connection banners
- everything uiu doesn't cover stays as is, with `TODO(uiu)` + backlog

### definition of done

- [ ] on prod: upload → input fans out to 3 chains → composer (3 rows: `add` + `normal`, an opacity node in one chain) → output → download png (`<toast>_<timestamp>.png`)
- [ ] dragging a row to another place changes the picture; a blend mode change re-renders; `×` removes the row and its link
- [ ] invalid links can't be drawn: a second link into a taken handle replaces the first; a cycle / a link into input is refused; the server answers the same graph sent by hand with `render-error` on the node
- [ ] export toast with a composer → import it back — same graph; signac and a sprint 3 export import unchanged
- [ ] composers of 4 and 7 rows on a 2 MP picture under the prod limits (`read_only`, 512m, `cpu_shares: 256`): render time and cgroup `memory.peak` measured, peak < 512 MiB; numbers in `docs/diary/`; the prod `RENDER_MAX_LAYERS` set from them
- [ ] uiu: the rule in `CLAUDE.md`, uiu a bun git dependency on a release tag (CI and the prod image build with it), the node frame hand-written from uiu tokens, existing buttons / selects / sliders / inputs styled from it, every hand-written style — `TODO(uiu)` + a backlog note
- [ ] `bun run typecheck` and `bun run test` green; dev docker compose works; a `feat` release (`0.5.0`) reached prod by itself
- [ ] QA list `docs/sprints/sprint-4.qa.md` checked by hand (like sprint 3)

### order (week plan)

1. **27.10 tue** — contract: `targetHandle`, `composer`, `validateGraph` + tests. server: DAG evaluation + composer + tests (`feat/composer`)
2. **28.10 wed** — web: `ComposerNode` (rows, handles, `+`, `×`, blend select, reorder), `toGraph` / `toFlow` with handles, layout of forks, `isValidConnection` + replace
3. **29.10 thu** — QA list, by hand in dev compose; 4- / 7-row measurement under the prod limits → prod `RENDER_MAX_LAYERS`; merge → `0.5.0` → prod, DoD scenario on prod
4. **30.10 fri** — uiu: spike (bun git dependency in dev / docker, reset vs xyflow) → the node frame by hand from uiu tokens → apply to existing elements → backlog for the gaps (separate branch `feat/uiu`)
5. **31.10 sat** — stretch 1–2
6. **01.11 sun** — buffer / stretch 3, sprint close, diary

### stretch (if time is left, in order)

1. **the sister's quick fixes** (`docs/backlog/2026-10-26_sprint-3-user-test-feedback.md`, each ≤ 1 h):
   - `Controls` bottom-right (the version moves)
   - graph + `imageId` survive a reload — `localStorage`; an expired picture → the existing `image not found`
   - the limit in px: `max ≈ 1600×1200 px, 10 MB` instead of `2 MP, 10 MB`
   - "clear graph" — back to input → output, the picture stays; no `confirm()` dialog
   - the export button says what the .json is — a toast preset
2. **cursor lag** (the same note, item 3) — reproduce first (Windows + Chrome like hers): "thinks long, hard to hit" vs `session.locked` during a render / handle size; "the cursor turns white" — over the output picture?
3. **degas t = 0 as a graph** — `toast-1_degas` (7 layers, `lch-hue`, value masks, tint, blur, opacity) as a static toast file: the real check of the composer and the first of the "3 toasts" of sprint 6. The golden hash of `t=0` (`packages/lib/tests/pipeline.golden.test.ts`) is the target; a mismatch from param conversions (blur radius, tolerances) — look at the numbers, a visual match is acceptable, write down why. Animation (`t`) — sprint 5. Needs `RENDER_MAX_LAYERS` ≥ 7 (the fallback is 4)
4. friendly node names + one-line hints (the sister's items 4–6) — ui labels only (`NODE_LABELS`), contract types untouched; a hint via uiu `tooltip`
5. **render warnings** — `rendered` gets `warnings?: [{ message, nodeIds }]`; a composer row whose chain doesn't reach the input is skipped with a warning instead of an error, the nodes highlighted yellow. ~half a day (contract 15 min, server ~1 h, web 1–2 h) — `docs/backlog/2026-10-27_render-warnings.md`

### cut if behind (in order)

1. uiu → only the `CLAUDE.md` rule + tokens / fonts; components stay as they are
2. drag-to-reorder → `↑` / `↓` buttons
3. (#4 of `docs/planning.md`) blend modes: `normal` + `add` only

### not in this sprint

- composer as a group of nodes (subflow, chains inside its frame) — `docs/backlog/2026-10-26_composer-as-node-group.md`
- preview node + output split into preview / output with export settings — after 1.0, discussion first: `docs/backlog/2026-10-26_preview-node-and-export-settings.md`
- several input nodes (two pictures in one toast) — one input as now; collage — `docs/backlog/2026-10-17_collage-tool.md`
- animation, keyframes — sprint 5
- render cache — `docs/backlog/2026-10-08_server-render-cache.md`
- manual review + refactoring — sprint 7

### decisions

answered 26.10:

- Q1: composer — a plain node with layer rows (like blender's Mix node), the chains stay outside it. A group / subflow → backlog
- Q2: blend mode — a `<select>` on the composer row, not a node (it only means something while composing). Opacity stays a node — it already exists and multiplies along the chain
- Q3: the top row is the top layer (Photoshop / Figma); the server creates layers bottom → top
- Q5 (later the same day): uiu — a bun git dependency `"uiu": "github:iwwwanow/uiu#v0.3.0"` (a git submodule like owo's was considered and dropped — the bun dependency is simpler: no CI checkout flag, no clone ritual)
- Q6: the node frame (fieldset + legend) is written by hand here, from uiu's fieldset / border / font / spacing styles, `TODO(uiu)` + backlog
- Q4: sprint 3 closed; the sister's feedback → `/log-backlog`; manual review + refactoring → sprint 7 (the last week)
- defaults (set 26.10 while planning, not asked separately — change here if wrong): `TOAST_GRAPH_VERSION` stays `1`; one input; composer → composer allowed; unlinked rows skipped, an empty composer is an error; ~~≤ 8 layers~~ → 27.10: env `RENDER_MAX_LAYERS`, fallback 4, per render
- the diagram TODOs answered: "how to link one input to several layers" — several edges from one source handle, xyflow does it as is; "raw `Uint8ClampedArray` to the client for previews" — see the preview backlog

answered 27.10:

- the layer cap — env `RENDER_MAX_LAYERS`, fallback 4, per render (not in the contract); the web learns it later — `docs/backlog/2026-10-27_render-max-layers-to-client.md`
- `validateGraph` checks the whole graph, errors only; a row chain not reaching the input is an error for now, warnings — stretch 5
- fan-out copies: all consumers but the last
- `BLEND_MODES` lives in contract next to lib's `BlendMode` — a duplicate for now, a shared types package later — `docs/backlog/2026-10-27_contract-lib-shared-types.md`
