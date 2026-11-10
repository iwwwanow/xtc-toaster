# xtc-toaster-1.0

## signac-toast

- hue mask. value change on animation frame
- layer y-rotation with perspective
- trail-effect — 09.11 idea: delay + duplicate nodes, `docs/backlog/2026-11-09_delay-and-duplicate-nodes-trail.md`

## release - 28.11

## readiness criteria

- [x] public link available — 23.10: https://xtc-toaster.iwwwanow.ru
- [ ] project works with all current backend filters — 23.10: every single-layer operation is a node (`feat/single-layer-nodes`, merged → `0.3.0`): batch 1 (blur, saturation / value mask, isolate channel, translate, rotate, scale) checked by the user by hand — works; batch 2 (skew, perspective, homography, fill, tint, opacity) checked by the user by hand 24.10 — works (`docs/sprints/sprint-3.qa.md`). Left for sprint 4: blend modes (need two layers)
  - effects:
  1. noize (addHueNoise): случайно сдвигает hue каждого пикселя, сила сдвига задаётся deviationCoefficient (0–1). В ui — нода «hue noise»; переименование типа в `hueNoise` — `docs/backlog/2026-10-15_rename-noize-to-hue-noise.md`.
  2. blur (boxBlur): box blur с радиусом radius.
  - masks:
  3. hue (hueMask): выделяет пиксели по оттенку (0–360°). В редакторе — нода «hue mask» (15.10).
  4. saturation (saturationMask): выделяет пиксели по насыщенности (0–100).
  5. value (valueMask): выделяет пиксели по яркости (0–100).
  - channels:
  6. isolateChannel: оставляет один канал (R/G/B/A). Цвет пикселя становится чистым цветом канала, а значение канала уходит в alpha.
  - blend-modes:
  7. normal (alphaCompose): обычное альфа-смешивание.
  8. add (addCompose): складывает цвета, результат обрезается по 1.
  9. lch-hue (lchHueCompose): берёт оттенок из верхнего слоя, яркость и насыщенность из нижнего.
  - transforms:
  10. translate: сдвиг.
  11. rotate: поворот.
  12. scale: масштаб.
  13. skew: скос.
  14. homography: перспективное искажение по готовой матрице 3×3.
  15. perspective: перспективное искажение по 4 углам.
  16. yRotation: перспективный поворот вокруг оси Y (angle в градусах, focalLength в px) — подключён к Layer 15.10, нода y-rotation в ui.
- [ ] project renders animation — 10.11: done in code, `feat/animation-server` merged → `v0.9.0` (animation node, timeline, gif / mp4); left — `v0.9.0` on prod + check 2
- [ ] 3 toasts available for usage (ready, portfolio works too) — 01.11: 2 of 3 as graphs: `toast-2_signac` (default) and `toast-1_degas` at t = 0 (bit for bit with the script); degas animated — sprint 5

## sprints:

0. [x] 3.10. audit current state of backend
   - 6 hrs max
   - every filter working state
   - skia working state
1. [x] 5.10-11.10. architecture & draft ui
   - 1 week
   - websocket-contract
   - datatypes
   - draft ui
   - done 11.10: + noize slider (render on release), server render in a worker thread; live render while dragging → next release — `docs/sprints/sprint-1.spec.md`
2. [x] 12.10-18.10. ui & one-layer toast — closed 16.10; replanned 12.10–13.10, spec `docs/sprints/sprint-2.spec.md`
   - 14.10: done — server renders the path input → output, node editor (menu drag & drop, link / unlink, delete), canvas, right panel (download png), errors visible in the ui, plain html look; left — hue mask (closes the minimum), y-rotation, export / import toast — `docs/diary/2026-10-14_sprint-2-path-render-node-editor.md`
   - 15.10: done — hue mask node (minimum closed), ui labels «hue noise» / «hue mask», one frame on input / output; left — y-rotation, export / import toast; rename `noize → hueNoise` before export ships (otherwise toast files need a migration) — `docs/diary/2026-10-15_hue-mask-node.md`
   - 15.10 evening: done — y-rotation node (lib transform → contract → server → web); left — before export ships (both change the toast file format):
     - [x] y-rotation `focalLength` in mm, 35 mm equivalent (like the blender camera): server converts `px = mm / 36 * width`, lib stays in px; bounds 10–300 mm, start 50; slider `focal length (mm)`. Now it's px of the source image — the same toast gives a different perspective on a different picture size. Done 15.10
     - [x] `focalLength` sensor fit like blender's Auto: the 36 mm span the larger side (`px = mm / 36 * max(width, height)`), not always the width — a portrait picture had a stronger perspective than the same lens in blender. Done 16.10
     - [x] rename `noize → hueNoise` — `docs/backlog/2026-10-15_rename-noize-to-hue-noise.md`. Done 16.10 — `docs/diary/2026-10-16_sensor-fit-and-hue-noise-rename.md`
     - [x] export / import toast — done 16.10, `docs/diary/2026-10-16_sensor-fit-and-hue-noise-rename.md`
     - [x] the docker compose DoD scenario by hand in the browser — checked by the user 16.10, sprint closed; stretch nodes not started
   - 1 week
   - node editor (blender geometry nodes as reference, svelte-flow only, no extra libs):
     - add node — drag & drop from the left menu
     - delete node — right click / `Delete`
     - link / unlink node
     - input & output — one each, not deletable
   - canvas: `Controls`, `Background`, pan & zoom
   - right panel: download png, export toast, import toast
   - server: render the path input → output, ignore unlinked nodes
   - nodes: hue mask, y-rotation
   - export / import toast (graph only, `imageId: null`) — picture in the export: `docs/backlog/2026-10-13_toast-export-with-image.md`
   - stretch: the rest of the single-layer nodes (blur, saturation / value mask, isolateChannel, translate / rotate / scale)
   - ui polish — a little in every sprint, starting after the user test in sprint 3
   - cut if behind:
     - (#2) export / import toast → sprint 3
     - (#3) y-rotation → sprint 4
3. [x] 19.10-25.10. hosting - public access — closed 26.10: the sister's feedback in, manual review + refactoring → sprint 7
   - 1 week
   - user test
   - 19.10: spec written — `docs/sprints/sprint-3.spec.md`: one image (Bun serves `dist`), CI test → semantic-release → ghcr, Renovate + doco-cd on `ru-timeweb`, uploads TTL + quota (disk budget 1–2 GB), user test — the sister, 3 pictures; stretch — the rest of the single-layer nodes first
   - [x] 20.10: CI — test (`docker build --target test`) on every branch, `master` → semantic-release → ghcr; `v0.1.0` tagged by hand, first release `v0.1.1` (`ghcr.io/iwwwanow/xtc-toaster:0.1.1`, public)
   - [x] 21.10: app — `/healthz`, `HOST`, `STATIC_DIR`, uploads TTL + quota, image healthcheck; dev compose checked by hand (sprint 2 scenario), `feat/server-prod` merged → `0.2.0`
   - [x] infra: DNS, caddy `127.0.0.1:8097`, stack with `0.2.0` (`iwwwanow_infrastructure`, own branch) — 23.10: https://xtc-toaster.iwwwanow.ru live, scenario checked by the user, `healthy`, 2 MP render ~1 s, memory peak 212 MiB of 512 (cgroup `memory.peak`)
     - 21.10 decided: the container stays root, hardened in the stack — `cap_drop: ALL`, `read_only` + tmpfs, `no-new-privileges`; `USER bun` later, with the server review — `docs/backlog/2026-10-21_container-non-root-user.md`
     - 22.10: infra pushed: DNS record (applied — in the Timeweb API, but at the end of the session their NS still don't serve it), caddy, stack `stacks/ru-timeweb/xtc-toaster` with `0.2.0`. Next session first: DNS on the NS (else — the Timeweb panel), caddy certificate, the DoD scenario on prod. `0.2.0` checked locally under the stack limits (read-only, no caps, 512m): upload + 2 MP render 1.1–1.7 s, `healthy`. Old images — doco-cd `prune_images` (default true), check on the host after the first update. infra secrets moved pass → Vaultwarden (`rbw`)
   - [x] Renovate on infra + one `fix` through the whole chain + rollback
     - 23.10: Renovate on infra done — owo evix 1.7.0 → 1.12.0 went PR → automerge → doco-cd, old image pruned
     - 23.10: `fix(web)` "server unavailable" went push → `0.2.1` → Renovate PR → automerge → prod in ~6 min (Renovate run started by the dashboard checkbox); rollback by revert — 45 s, Renovate reopens the bump without automerge
     - 22.10 decided: owo evix isn't pinned to `1.7.0` — updates, but only within `1.x` (`allowedVersions: "<2"` for `ghcr.io/iwwwanow/owo`)
   - [x] own test on prod — 23.10: the scenario by hand, 2 MP render ~1 s, memory peak 212 MiB of 512, the host keeps answering; `UPLOAD_MAX_MEGAPIXELS` stays 2
   - [x] user test (the sister) — 23.10 decided: async, by text (no call), open-form feedback; the message names the 2 MP limit and the EXIF rotation up front. 24.10: sent to her (on `0.4.0`), the feedback came the same evening (a +/− table) — written down and sorted 26.10: `docs/backlog/2026-10-26_sprint-3-user-test-feedback.md`; quick fixes → sprint 4 stretch 1
   - [x] stretch 1 — the rest of the single-layer nodes: `feat/single-layer-nodes` merged 23.10 → `0.3.0` (13 nodes, beyond the spec's 7 — skew, perspective, homography, fill, tint, opacity added 23.10); batch 1 checked by hand 23.10, batch 2 — 24.10 (`docs/sprints/sprint-3.qa.md`, 2б)
   - [x] favicon — 24.10: `feat/favicon` merged → `0.4.0`. Source — `packages/web/favicon/favicon.svg` (Inkscape, pages `light` / `dark`), a vite plugin generates ico / themed svg / apple-touch / manifest pngs on every dev start and build (sharp), nothing generated is committed
   - [x] app version in the bottom-right corner of the ui — 24.10, same branch: the docker job passes `APP_VERSION` (build arg) → vite `define`; dev / a local build — `dev`
   - [x] the next `feat` / `fix` release reaches prod by Renovate's own schedule, no dashboard checkbox — 24.10: `0.4.0` push 09:46 UTC → ghcr 09:48:58 → Renovate PR #7 09:49:41 (nobody ticked the box), automerged → prod 09:51 (favicon, `v0.4.0` in the corner, `/healthz` 200). `0.3.0` 23.10 went the same way, PR 4 h after the release
   - [ ] manual review + refactoring (server → contract → web → lib) — moved to the end of the sprint 24.10; 26.10 → sprint 7, the last week (the server's `run-graph` is rewritten in sprint 4 anyway)
   - 24.10 decided: no Renovate on this repo for now — infra is enough
   - details — `docs/diary/2026-10-21_sprint-3-ci-cd-and-server-prod.md`, `docs/diary/2026-10-23_sprint-3-public-link-renovate-rollback.md`, `docs/diary/2026-10-24_favicon-and-app-version.md` (+ infra: `iwwwanow_infrastructure/docs/diary/2026-10-23_xtc-toaster-stack-renovate-rbw.md`)
4. [x] 26.10-01.11. two-layers toast — closed 01.11 (QA 2.4–7 not passed by hand → sprint 6); spec `docs/sprints/sprint-4.spec.md`, diagram `docs/sprints/sprint-4.diagram.d2`; planned 26.10, work starts 27.10 — `docs/diary/2026-10-26_sprint-4-planning.md`
   - 1 week
   - ~~layer composing on output node~~ → a separate **composer** node: layer rows (handle, blend mode select, drag to reorder, `+` / `×`), the top row is the top layer; chains stay outside it. Composer as a group of nodes — `docs/backlog/2026-10-26_composer-as-node-group.md`
   - the graph is a DAG: one output → many links (fan-out), edges carry `targetHandle`; the server evaluates from the output with a memo per node
   - export picture (png) — done in sprint 2, a DoD check only
   - connection validation — `docs/backlog/2026-10-13_node-connection-validation.md`; one `validateGraph` in contract for web and server
   - uiu ui kit, spot use — the rule in `CLAUDE.md` (26.10), existing elements first; uiu is a bun git dependency `"uiu": "github:iwwwanow/uiu#v0.3.0"` (decided 26.10, a submodule dropped as more complex); the node fieldset frame — by hand here, from uiu's fieldset / border / font / spacing styles
     - done 30.10 (`feat/uiu` → `0.6.0`): uiu classes on what exists, gaps in `app.css` with `TODO(uiu)` → `docs/backlog/2026-10-30_uiu-gaps-from-web.md`; on top, from the user's look: a blender-like number field instead of range sliders, node menu items as buttons, handles easier to hit (4px square out of the frame, hit area, `connectionRadius`) — `docs/diary/2026-10-30_uiu-number-field-handles.md`
     - [x] a link dropped onto a whole node connects to its input — `docs/backlog/2026-10-30_drop-link-onto-node.md` (stretch, after checking that the handles of 30.10 are enough) → 10.11 into sprint 5, before the release; done 10.11
   - prod `RENDER_MAX_LAYERS=8` (agreed 29.10): covers degas (7 layers), peak ~430 of 512 MiB; the limit is render time (~1.2 s per row, one worker per process), not memory — `docs/diary/2026-10-29_sprint-4-qa-and-measurement.md`. In the prod compose (`iwwwanow_infrastructure`, `stacks/ru-timeweb/xtc-toaster/compose.yml`) since 30.10 (infra `60bc170`)
   - 29.10: QA sections 1 + 2.1–2.3 passed, the rest of QA → **sat 31.10** on `0.5.0` (`docs/sprints/sprint-4.qa.md`, test toasts `tests/toasts/`); measured → prod `RENDER_MAX_LAYERS=8` (below); `feat/composer` merged → `0.5.0` before QA ends (decided by the user 29.10)
   - from QA 29.10, done the same day before the merge (one contract change, both optional fields → `TOAST_GRAPH_VERSION` stays 1):
     - composer layer **name** — fixed to the layer (moves with the row, not `layer N` by position), renamable in the row
     - composer layer **`visible: boolean`** — an eye toggle in the row; a hidden row is skipped like an unlinked one (not evaluated, not counted in `RENDER_MAX_LAYERS`)
   - stretch: the sister's quick fixes → cursor lag → degas t = 0 as a graph → friendly node names
     - [x] 01.11 the sister's quick fixes (`feat/sister-quick-fixes`): the editor survives a reload (`localStorage`), `clear graph` (two clicks), `Controls` bottom-right, the upload limit in MB only (`≈ 1 MB`), tooltips on export / import / clear (500 ms delay, pure css)
     - [ ] cursor lag — not reproduced, needs Windows + Chrome like hers → the next user test (sprint 6)
     - [x] 01.11 degas t = 0 as a graph — `toast-1_degas/toast.json` (7 rows, 26 nodes); with the script's blur radii and corners put back = the lib golden hash bit for bit (`packages/server/tests/degas.test.ts`); `?toast=<preset>` in dev, list — `tests/toasts/README.md`; auto layout runs chains straight, fit view on import / clear
     - [x] 01.11 friendly node names — beyond the plan (ui labels only): **one name in web / contract / server / lib** (`selectColor`, `selectVivid`, `selectBright`, `channel`, `colorNoise`, `move`, `turn3d`, `corners`, `matrix`, `layers`), lib `Layer` flat (one method per node type), the menu grouped (select / color / effect / move / layers, labeled rules) with a one-phrase hint per node; no migration — pre-release
     - [ ] render warnings — later, after 1.0 (decided 01.11) — `docs/backlog/2026-10-27_render-warnings.md`
   - 01.11 decided — versions (`CLAUDE.md`): app semver 0.x until 28.11, no `feat!` / `BREAKING CHANGE` before it (the default analyzer would ship `1.0.0`); `TOAST_GRAPH_VERSION` stays 1 and breaks freely until 1.0, frozen after; packages `0.0.0`, versioned with the app
   - 01.11 decided — QA: the open items of `sprint-*.qa.md` aren't run each sprint (the user uses the app regularly), they pile up and run all at once in sprint 6
   - not here: preview node + export settings — after 1.0, `docs/backlog/2026-10-26_preview-node-and-export-settings.md`
   - cut if behind:
     - uiu → only the rule + tokens (goes first)
     - drag-to-reorder → `↑` / `↓`
     - (#4) blend-modes: normal + add only
5. [ ] 03.11-15.11. animation node with export
   - 2 weeks; 02.11 went to the server refactor and its review (see sprint 7)
   - plan fixed 03.11: `docs/sprints/sprint-5.spec.md`, `sprint-5.diagram.d2`; details — `docs/diary/2026-11-03_sprint-5-planning.md`
   - 04.11: [x] contract — the node, param links, `validateGraph`, `graphAtFrame`, tests; the ws messages moved to the server step. Vertical scroll over the tracks removed — the node grows with them, handles and styles as they are now (`docs/backlog/2026-11-04_animation-tracks-vertical-scroll.md`). Keys count in frames — confirmed. Next — web, 05–08.11. Details — `docs/diary/2026-11-04_animation-contract.md`
   - a separate node without a pixel output, one track = one numeric param, linear, keys by hand in the ui
   - 04.11, decided: tracks as the `layers` rows — `+ track`, a new row on top, drag to reorder, the param comes by a wire. Keys outlive a shorter `frames` and a removed or rewired link: `frames` is only the render range, a frame clamps the value to the param's bounds. Both rules left `validateGraph`
   - [x] 05.11 web: param handles, tracks, keys, playhead, the current frame through the usual render — headless browser checks passed, not yet tried by the user. Details — `docs/diary/2026-11-05_animation-web.md`
   - [x] 06.11 user look at the node: works; the pixel output → the bottom-right corner of every node; `play` added (one frame at a time; frames ahead on the client — `docs/backlog/2026-11-06_play-frame-cache-on-client.md`); the ui gets no polish — the user redraws it by hand later
   - [x] 06.11 check 1: frames on disk first (memory is too tight), in memory / stdin later — `docs/backlog/2026-11-06_animation-frames-in-memory.md`
   - [ ] gifs kept for good and outside the uploads' quota — watch the disk on `ru-timeweb` after the release
   - [ ] check 2: measured 06.11 on the laptop under 512m — degas 7 rows at 2 MP: ~5.4 s a frame, 24 frames 134 s, peak 462 MiB, no OOM; left — the same on prod, then `RENDER_MAX_FRAMES` in the stack (fallback 48)
   - [x] 06.11 ws messages `render-animation`, `animation-progress`, `animation-rendered` (the gif as a file over http); server: frames as pngs on disk, gif in two ffmpeg passes, `RENDER_MAX_FRAMES`, ffmpeg in the image — `feat/animation-server`, `docs/diary/2026-11-06_animation-play-and-server.md`
   - [x] 07.11 web: `render animation` (off without a linked track with keys), `frame n / N` on the button, the gif downloads as `<toast>_<YYYYMMDD-HHmmss>.gif`, the editor and the animation node locked during an export; gifs on the server kept for good (decided 07.11, no TTL — only leftover frame directories are cleaned) — `docs/diary/2026-11-07_animation-export-web.md`
   - [x] 07.11 gif alpha: gif has 1-bit alpha, a semi-transparent frame blinked out — every frame is flattened onto white before the palette (`assembleGifFromFrames`, decided 07.11): a fade goes into white — `docs/diary/2026-11-07_animation-export-web.md`
   - [x] 08.11 toasts: degas animated — 24 tracks (3 `corners` × 6, 3 `move` × 2), 24 frames at 36 fps, a 15 s loop; at frame 0 still bit for bit with the script. Nodes arranged with elk (`arrange.ts`): after import / `?toast=` / clear and a button in the controls. The user ran it locally 09.11 — works. `docs/diary/2026-11-08_degas-animated-elk-arrange.md`
   - [ ] 09.11 extension before the release (asked by the user) — `docs/sprints/sprint-5.spec.md`, «extension 09.11»; planning — `docs/diary/2026-11-09_sprint-5-extension-planning.md`:
     - [x] 09.11 blender timeline, first half: the header (transport `start` / `‹ key` / `‹` / `play` / `›` / `key ›` / `end`, a frame field, fps / frames, `fit`), playhead drag on the ruler, zoom (fit by default, Ctrl+wheel, `fit`); text buttons instead of icons
     - [x] 09.11 key drag (whole frames, an occupied frame refused — the key waits on the last free one) and the summary diamonds' drag (the group's keys of that frame together)
     - [x] 09.11 the export panel keeps its width in every loop mode (asked by the user)
     - [x] 09.11 a param wire dropped on `+ track` makes a linked track with its first key — on top of its node's group; a param that has a track already makes none
     - [x] 09.11 tracks grouped by source node — a fieldset per group, a summary row, collapse (the summary drag comes with the key drag)
     - [x] 09.11 arrange lines chains up by the nodes' tops, not by the bottom-right output (asked by the user) — only elk's input changes, the handles on screen stay where they are
     - [x] 09.11 export dropdown under `render animation`: `gif` / `mp4`, `loop` (reps / seconds + `whole cycles`, on by default) out of the node into the toast (`ToastGraph.export`); mp4 on the server (libx264, yuv420p)
     - [x] 09.11 node widths on the uiu grid: 190px a column, the number field's label inside; animation 6 columns (1220px), `layers` / `input` / `output` 2
     - [x] 09.11 output: a checkerboard under the picture, its edge and transparent parts show (asked by the user; another pattern — one css line, `.transparency`)
     - [x] 09.11 handles: the pixel input top-left, the output stays bottom-right; a param's output 2–4 px closer to its field; pixel in / out stay 4 px (6 px tried, looked bad)
   - [x] 10.11 the user's look at the new ui — all ok
   - [x] 10.11 the DoD of the extension in headless Chrome on degas — every item passed; found: every download is named `toast-2_signac_*` whatever toast is open → 10.11 every download is `xtc-toaster_<YYYYMMDD-HHmmss>.<ext>` (decided by the user); dev `.env` needs `RENDER_MAX_LAYERS=8` for degas — `docs/diary/2026-11-10_extension-dod-headless.md`
   - [x] 10.11 merged `feat/animation-server` → master, CI green → `v0.9.0` (ghcr image); the branch deleted locally and on origin
   - [x] 10.11 every download is named `xtc-toaster_<YYYYMMDD-HHmmss>.<ext>` (decided by the user; was always `toast-2_signac_*`)
   - [ ] `v0.9.0` on prod — the tag bumps itself: Renovate opens an automerge PR in infra (`stacks/ru-timeweb/xtc-toaster/compose.yml`) on Mend's scheduled run, a new ghcr image gives no event; sooner — the checkbox in the infra Dependency Dashboard (issue #3). 10.11 evening: prod still `0.8.0`, no PR yet
   - [ ] check 2 on prod — degas at prod limits, then `RENDER_MAX_FRAMES` in the stack (fallback 48) — 14.11, on `v0.9.0`
   - [ ] 10.11 added before the release (the user), 11–15.11 — the QA of sprint 6 covers them:
     - [x] 10.11 **undo / redo** (`feat/undo-redo`, not merged yet) — Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y by `event.code` (Cyrillic layout), browser's own undo inside fields, `undo` / `redo` buttons in the actions panel; graph edits only — not selection / viewport / playhead; import / clear + the arrange after it are one step. Everything below must land in the history as one step per action — `docs/diary/2026-11-10_undo-redo.md`, `docs/backlog/2026-11-10_undo-redo-history.md`
     - [x] 10.11 **delay** (`feat/undo-redo`, not merged) — `docs/diary/2026-11-10_delay-node.md`; was: node on param wires: `param → delay → track`, the param reads the track at `frame − d`; rows like `layers` (a pair in → out per param, a free row at the bottom), one `d` in frames for the whole node, not animated in v1; `graphAtFrame` and `trackGroups` see through it — `docs/backlog/2026-11-09_delay-and-duplicate-nodes-trail.md`
     - [x] 10.11 a node dropped onto a link goes into it (A → node → B) (`feat/undo-redo`, not merged) — a node without pixel links, not input / output / animation / delay; layers takes it into the top row; from the left menu too; the link under the dragged node is drawn thicker (2 px); a whole node drag + the insert is one history step — `docs/diary/2026-11-10_drop-node-onto-link.md`, `docs/backlog/2026-10-28_drop-node-onto-link.md`
     - [x] 10.11 a link dropped onto a whole node connects to its input (`feat/undo-redo`, not merged) — a pixel wire, new or a moved end, let go over a frame, not on a handle; a taken input is replaced; layers: the row under the pointer, over the frame — the top free row, all taken — nothing; the frame (and the row) highlighted while over it; one step. On the way: the link end at an input could no longer be grabbed (the handle's catch square covered the reconnect anchor since 30.10) — fixed — `docs/diary/2026-11-10_drop-link-onto-node.md`, `docs/backlog/2026-10-30_drop-link-onto-node.md`
     - [ ] Alt + drag a node — a copy (the selection: all of it with the links between; no outside links); Shift-box selection stays as is — `docs/backlog/2026-10-28_box-select-like-illustrator.md`
     - [ ] deleting a node linked on both sides keeps the chain: A → node → B becomes A → B (pixel links; a fan-out → A to each; param links to tracks go with the node) — `docs/backlog/2026-11-10_delete-node-keeps-chain.md`
     - [ ] action zones while dragging a node: at the bottom of the screen, one for now — `delete`; not for input / output; the whole selection if several — `docs/backlog/2026-11-10_node-drag-action-zones.md`
   - [ ] 10.11 **groups + value** into the release (the user: the fattest feature) — 13–20.11, after the six above; v1 (scope agreed 10.11): group from a selection (a toolbar over the selection — agreed; the right-click menu on a selection — maybe, no hotkeys), one pixel in / out, crossing param wires → the group's params, open by double click / `open`, back by the breadcrumb, instances from the left menu (linked), ungroup; `value` — one number wired into many params; the toast gets an optional `groups` field (`TOAST_GRAPH_VERSION` stays 1); ~4–6 days — `docs/backlog/2026-11-09_node-groups-variables.md`. Moves QA (sprint 6) to ~21–25.11, the buffer shrinks to 26–27.11
     - cut if behind: groups → 1.1, no migration needed (an optional field)
   - [ ] `docs/sprints/sprint-5.qa.md`, sprint close
   - stretch, after all of the above (07.11): manual ui pass — the user goes over the ui by hand and redraws it (`CLAUDE.md`, «Sprint process»); first in the stretch list of `docs/sprints/sprint-5.spec.md`
   - [x] extend contract
   - without live-preview
   - [x] render current frame view
   - [x] export animated picture: gif (done 07.11) + mp4 (09.11, the DoD passed 10.11)
   - not here: time-window — `docs/backlog/2026-11-03_timeline-time-windows.md`
   - cut if behind:
     - (#1) export gif only, no mp4 — applied up front on 03.11
     - (#6) last resort: animation → 1.1, release static toasts
6. [ ] 16.11-22.11. result testing
   - 1 week
   - 3 toasts
   - new user test (+ the sister's cursor lag: Windows + Chrome)
   - QA: every open item of `docs/sprints/sprint-*.qa.md` at once (sprint 4: sections 2.4–7; sprint 5 — its own list) — decided 01.11, confirmed 06.11: QA only at the end of the release, never during a sprint (`CLAUDE.md`)
   - final fixes
   - cut if behind:
     - (#5) 2 toasts instead of 3
7. [ ] 23.11-29.11. free buffer
   - manual review + refactoring of the vibe-coded code — by the user, Claude helps (moved from sprint 3 on 26.10): `server` → `contract` → `web` → `lib`, no behaviour change, tests green before and after, one package = one branch, `refactor:` commits; findings that don't fit → `docs/backlog/`. Already written down: `docs/backlog/2026-11-01_validate-graph-into-zod.md`, `docs/backlog/2026-10-06_lib-tech-debt.md`, `2026-10-06_image-codec-into-lib.md`, `2026-10-06_render-boundary.md`, `2026-10-06_ts-hot-loop-allocations.md`, `2026-10-03_lib-test-audit.md`
     - [x] 02.11 server: application / infrastructure layers, application depends on a `LoadImage` port; review fixes — a dead render worker no longer blocks the queue, `loadUpload` without the `exists()` race — `docs/diary/2026-11-02_server-layers-review-fixes.md`
     - [ ] the rest of that review, deferred whole on 02.11, to take in one go: `docs/backlog/2026-11-02_server-layers-open-points.md` (worker death not logged, no timeout on a hung render, raw errors to the client, final layer layout, …), `docs/backlog/2026-11-02_image-id-path-safety.md`; `v0.7.2` not checked on prod / in the browser
   - before the release 28.11 — the buffer first goes to whatever slipped from sprints 4–6

## cut-list

разнесён по спринтам (`cut if behind`), `#N` — приоритет: режем с меньшего номера.

## next-release-features:

1. animation node with live-preview
   - live preview animated picture
     - play at the real fps: frames rendered ahead and cached on the client — `docs/backlog/2026-11-06_play-frame-cache-on-client.md`
   - timeline hotkeys (blender-like, put off 09.11) — `docs/backlog/2026-11-09_timeline-hotkeys.md`
   - time-window: a vertical cut of the timeline, a show reel — `docs/backlog/2026-11-03_timeline-time-windows.md`
2. live render while dragging a param slider (sprint 1 stretch 2)
   - client: `oninput` + debounce, slider stays live during render
   - server: done 11.10 — render in a worker thread, latest-wins holds for bursts — `docs/backlog/2026-10-11_render-pipeline-evolution.md`
3. new nodes (ideas 09.11, not decided)
   - duplicate (N copies of a chain → a trail with delay) — put off 10.11, after groups — `docs/backlog/2026-11-09_delay-and-duplicate-nodes-trail.md`; delay and groups + value moved into the release (sprint 5 / 6 above)
   - closed 10.11: one track for many params — `value` covers it (`docs/backlog/2026-11-09_one-track-many-params.md`); composer as a frame — groups cover it
   - put off 10.11: the node list panel (`docs/backlog/2026-10-28_node-list-panel.md`), the tracks' vertical scroll with fading wires (`docs/backlog/2026-11-04_animation-tracks-vertical-scroll.md`)
   - main menu: a uiu / owo grid of the current projects (`localStorage`) with previews — `docs/backlog/2026-11-10_main-menu-projects-grid.md`
   - audio → time-windows: an audio file through an analyzer node (beats / onsets / loudness) gives the animation node ready time-windows, the chain is on inside a window and off outside — the picture blinks to the track; mp4 with the sound (10.11, raw; needs time-windows first) — `docs/backlog/2026-11-10_audio-to-time-windows.md`

## tools:

### websocket - client-server protocol

### skia - gpu rendering. dont spent more than 3 hrs time, if current state is note ready

### svelte-flow - nodes rendering on client
