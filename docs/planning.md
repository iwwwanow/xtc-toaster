# xtc-toaster-1.0

## signac-toast

- hue mask. value change on animation frame
- layer y-rotation with perspective
- trail-effect

## release - 28.11

## readiness criteria

- [ ] public link available
- [ ] project works with all current backend filters
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
- [ ] project renders animation
- [ ] 3 toasts available for usage (ready, portfolio works too)

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
3. [ ] 19.10-25.10. hosting - public access
   - 1 week
   - user test
   - 19.10: spec written — `docs/sprints/sprint-3.spec.md`: one image (Bun serves `dist`), CI test → semantic-release → ghcr, Renovate + doco-cd on `ru-timeweb`, uploads TTL + quota (disk budget 1–2 GB), user test — the sister, 3 pictures; stretch — the rest of the single-layer nodes first
   - [x] 20.10: CI — test (`docker build --target test`) on every branch, `master` → semantic-release → ghcr; `v0.1.0` tagged by hand, first release `v0.1.1` (`ghcr.io/iwwwanow/xtc-toaster:0.1.1`, public)
   - [x] 21.10: app — `/healthz`, `HOST`, `STATIC_DIR`, uploads TTL + quota, image healthcheck; dev compose checked by hand (sprint 2 scenario), `feat/server-prod` merged → `0.2.0`
   - [ ] infra: DNS, caddy `127.0.0.1:8097`, stack with `0.2.0` (`iwwwanow_infrastructure`, own branch)
     - 21.10 decided: the container stays root, hardened in the stack — `cap_drop: ALL`, `read_only` + tmpfs, `no-new-privileges`; `USER bun` later, with the server review — `docs/backlog/2026-10-21_container-non-root-user.md`
     - 22.10: infra pushed: DNS record (applied — in the Timeweb API, but at the end of the session their NS still don't serve it), caddy, stack `stacks/ru-timeweb/xtc-toaster` with `0.2.0`. Next session first: DNS on the NS (else — the Timeweb panel), caddy certificate, the DoD scenario on prod. `0.2.0` checked locally under the stack limits (read-only, no caps, 512m): upload + 2 MP render 1.1–1.7 s, `healthy`. Old images — doco-cd `prune_images` (default true), check on the host after the first update. infra secrets moved pass → Vaultwarden (`rbw`)
   - [ ] Renovate on infra + one `fix` through the whole chain + rollback
     - 22.10 decided: owo evix isn't pinned to `1.7.0` — updates, but only within `1.x` (`allowedVersions: "<2"` for `ghcr.io/iwwwanow/owo`)
   - [ ] own test on prod, then the user test (the sister)
   - [ ] favicon — the public link should have one; lowest priority in the sprint (after the stretch)
   - [ ] app version in the bottom-right corner of the ui — to see which version is hosted; the very last item of the sprint (after the favicon)
   - details — `docs/diary/2026-10-21_sprint-3-ci-cd-and-server-prod.md`
4. [ ] 26.10-01.11. two-layers toast
   - 1 week
   - layer composing on output node
   - export picture (png)
   - connection validation — `docs/backlog/2026-10-13_node-connection-validation.md`
   - cut if behind:
     - (#4) blend-modes: normal + add only
5. [ ] 02.11-15.11. animation node with export (timeline node)
   - 2 weeks
   - extend contract
   - without live-preview
   - render current frame view
   - export animated pucture (mp4/gif)
   - cut if behind:
     - (#1) export gif only, no mp4
     - (#6) last resort: animation → 1.1, release static toasts
6. [ ] 16.11-22.11. result testing
   - 1 week
   - 3 toasts
   - new user test
   - final fixes
   - cut if behind:
     - (#5) 2 toasts instead of 3
7. [ ] 23.11-29.11. free buffer

## cut-list

разнесён по спринтам (`cut if behind`), `#N` — приоритет: режем с меньшего номера.

## next-release-features:

1. animation node with live-preview (timeline node)
   - live preview animated picture
2. live render while dragging a param slider (sprint 1 stretch 2)
   - client: `oninput` + debounce, slider stays live during render
   - server: done 11.10 — render in a worker thread, latest-wins holds for bursts — `docs/backlog/2026-10-11_render-pipeline-evolution.md`

## tools:

### websocket - client-server protocol

### skia - gpu rendering. dont spent more than 3 hrs time, if current state is note ready

### svelte-flow - nodes rendering on client
