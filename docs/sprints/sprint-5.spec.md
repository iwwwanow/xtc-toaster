5. 03.11-15.11. animation node with export
   - 2 weeks (02.11 went to the server refactor)
   - a separate `animation` node, without a pixel output: each track animates one numeric param
   - linear only, no live preview, the current frame on the output, export — gif only (mp4 → stretch)
   - the picture — `sprint-5.diagram.d2`
   - cut if behind:
     - (#1 of `docs/planning.md`) gif only, no mp4 — **applied up front on 03.11**
     - (#6) last resort: animation → 1.1, release static toasts

### status (2026-11-09) — must done (contract, web, server, gif export, degas animated); extended 09.11 before the release — see «extension 09.11»

Done to 08.11: contract, web (tracks, keys, playhead, `play`), server (`render-animation`, frames on disk, gif in two ffmpeg passes), `render animation` in the ui, gif on white, degas animated (24 tracks), arrange with elk. The user ran animated degas locally 09.11 — works. 09.11: the user asked for a blender-like timeline, an export dropdown with mp4, tracks grouped by node and node widths on the uiu grid **before** the release — «extension 09.11» below; the release, the prod check and the QA list come after it.

---

## slice: animation node

```
input ─► move ─┬─ x ●╌╌╌╌╌╌╌╌╌╌╌► ● move.x  ◆────◆     ┐
               └─ y ●╌╌╌╌╌╌╌╌╌╌╌► ● move.y  ◆──◆──◆    ├ animation (no output)
       ─► opacity ─ opacity ●╌╌╌► ● opacity    ◆───◆   ┘
   │
   └──► output  → the frame under the playhead; [download png]  [render animation]
```

Solid wires carry pixels as before, dashed ones bind a param to a track. Nothing leaves the animation node: `runGraph` walks back from the output and never reaches it. A frame is the same graph with the animated values put into `data`.

### must

#### contract

- `AnimationNodeSchema`, at most one in a graph:
  ```jsonc
  { "id": "anim", "type": "animation", "data": {
      "fps": 24, "frames": 48,
      "loop": { "reps": 3 },              // or { "seconds": 15 } — one or the other; absent — the format's default
      "tracks": [{ "id": "t1", "keys": [{ "frame": 0, "value": 0 }, { "frame": 47, "value": 10 }] }]
  } }
  ```
- `GraphEdgeSchema` gets an optional `sourceHandle` — the param's name. A param link: `{ source: "move-1", sourceHandle: "x", target: "anim", targetHandle: "t1" }`, built like the `layers` rows
- `validateGraph`: a link with `sourceHandle` goes only into the animation node, the node takes only such links; the handle is a numeric param of the source node's type; one track per param; keys of a track on different frames; nothing links out of the animation node. Not rules: a key past `frames`, a key out of the param's bounds, a track without a link
- `graphAtFrame(graph, frame)` in contract — one pure function for web and server: linear between keys, the nearest key's value outside them (blender's constant extrapolation), a track without keys leaves `data` as is, a value is clamped to the param's `PARAMS` bounds (the keys stay as they are)
- `TOAST_GRAPH_VERSION` stays `1`, the old `number | Keyframes` plan is dropped
- ws: `render-animation` from the client, `animation-progress` (`frame` / `frames`) and the result from the server

#### server

- current frame: nothing changes — the web sends `graphAtFrame(graph, playhead)` in the plain `render` message
- `render-animation`: `graphAtFrame` + the existing render for each frame of one cycle, in the one render worker, frames → gif through ffmpeg (`assembleGif`)
- only one cycle is rendered: the loop is a property of the file, not more frames. Gif: `reps` → the muxer's `-loop` (`0` — infinite, the default; `-1` — once), `seconds` → rounded to whole cycles, as the degas script does
- env `RENDER_MAX_FRAMES` next to `RENDER_MAX_LAYERS` — the fallback is picked from the measurement
- ffmpeg in the runtime image (`Dockerfile`, `# no ffmpeg — the server doesn't make video` goes)
- the minimum, nothing around it: no cancel, no resume after a reconnect, no frame cache

#### web

- a handle on every numeric param row
- tracks work as the `layers` rows: `+ track` adds an empty row with its handle — on top, right under the button; rows are dragged to reorder (the order doesn't change the picture); `×` removes the row with its link and keys. Nothing is created by dropping a link onto the node
- a link into an empty track makes its first key — at the playhead with the param's current value. Removing the link, or the param's node, keeps the row and its keys; relinked to another param the keys stay as they are, the frame clamps them to its bounds. No link — no `+ key`
- `AnimationNode`, inside the node, blender as the base:
  - **width** — 3 uiu grid columns, `190 × 3 + 16 × 2 = 602px`: channels — 1 column (190), keys — 2 (396)
  - **height** — grows with the tracks, as the `layers` node; no vertical scroll (removed 04.11 — `docs/backlog/2026-11-04_animation-tracks-vertical-scroll.md`)
  - **handles** — the current style: one in each channel row, out of the node's frame, as the `layers` rows; the link's `targetHandle` is the track's id
  - **scroll** — only horizontal over the timeline with the ruler moving along; the channels column stays outside it, so its handles aren't clipped. The area is `nowheel nodrag nopan`, or the canvas takes the wheel and the drag
  - **frames** — only what gets rendered: keys past the end stay, dimmed on the timeline so they can be selected and removed, and still pull the interpolation; the playhead stops at `frames - 1`
  - **top** — `fps`, `frames`, `loop` (`reps` / `seconds` / off — a switch, the other field is off), the ruler, the playhead (click on the ruler)
  - **a track row** — the param's name from the link (`move.x`), no link — `track 3`; no visibility checkbox, no blend mode; keys as diamonds, `+ key` at the playhead (the value — interpolated at that frame)
  - **the selected key** — number fields `frame` and `value`, `× key`
- a param with a track: its field is read-only and shows the value at the playhead — values are edited in the animation node
- moving the playhead → the usual render of that frame (latest-wins holds); `download png` saves that frame
- `render animation` in the actions panel: off without an animation node or with no keys; while it runs — the editor is locked (as `session.locked`), `frame n / N` on the button; when done — the gif is downloaded as `<toast>_<YYYYMMDD-HHmmss>.gif`
- a hand-written style → `TODO(uiu)` + a backlog note, as usual

#### toasts

- `tests/toasts/animation.json` + `broken-animation-*`, rows in `tests/toasts/README.md`
- `toast-1_degas` animated: 24 tracks (6 per each of 3 `corners`, 2 per each of 3 `move`), 24 frames at 36 fps. All its values are linear in `t` — linear keys cover it

### to check while implementing

Not decided, on purpose. Each one first, before the code that depends on it:

1. **Sequence on disk or straight into ffmpeg?** Streaming into stdin is the base idea: `assembleGif` / `assembleVideo` take every frame in one array (2 MP ≈ 8 MB a frame), that goes. But the current one-pass `split` + `palettegen` + `paletteuse` may hold the whole clip inside ffmpeg until the palette is ready — then stdin alone saves nothing for gif. Not measured. Alternatives: two passes (a palette first, then `paletteuse`) over a sequence on disk, or a palette from a few frames. Limits to fit: `mem_limit: 512m` with a ~430 MiB render peak at 7 rows, ffmpeg in the same container, `read_only` + tmpfs (tmpfs counts as memory), the only disk — the uploads volume
2. **Render time.** ~7.2 s a frame at 7 rows on the laptop → ~3 min for degas's 24 frames, prod is likely slower, the worker is shared. Measure on the prod limits, set `RENDER_MAX_FRAMES`; whether a queue entry is a frame (others wait one frame) or a job
3. **Gif size at 2 MP and how it reaches the client** — over ws in base64 as the png, or a file over http
4. **Gif timing** — delays are in 1/100 s, so degas's 36 fps can't be exact; `-loop` semantics for `reps`

### definition of done

- `docker build --target test .` green, `bun run test` covers `graphAtFrame` and the new `validateGraph` rules
- `+ track` makes a row, a wired param gets its first key; keys added and removed by hand; the playhead changes the output picture
- `render animation` downloads a gif that plays the keys, `reps` / `seconds` work and exclude each other
- degas animated exports on the prod limits with no OOM (`docker compose` with `mem_limit` or prod), the numbers in the diary
- a toast with animation survives export → import → reload
- `docs/sprints/sprint-5.qa.md` written (run in sprint 6)

### order

1. **04.11 wed** — contract + `graphAtFrame` + `validateGraph`, tests (the ws messages — with the server, step 4: the result's shape depends on check 3)
2. **05–08.11** — web: param handles, the animation node, keys, playhead, the current frame through the usual render
3. **09.11 mon** — check 1 and 2: measurements, the sequence decision
4. **10–11.11** — ws messages in the contract; server: `render-animation`, gif, progress, `RENDER_MAX_FRAMES`, ffmpeg in the image
5. **12.11 thu** — web: the button, progress, download, loop
6. **13.11 fri** — toasts: test ones, degas animated; the prod-limits check, release
7. **14–15.11** — stretch, the QA list, sprint close, diary

### stretch (if time is left, in order)

0. **manual ui pass** (added 07.11) — the next step once everything above is done: the user goes over the ui by hand and redraws it (`CLAUDE.md`, «Sprint process»)
1. **wires by selection** — the animation node selected: its param wires highlighted; not selected: grey, maybe thinner
2. **tracks grouped by node** — a header per source node. With 24 tracks in degas this is what makes the list readable
3. **a key indicator on number fields + autokey**, blender-like — an indicator / button of a key on the field; changing an animated field creates or updates a key at the current frame. The field stops being read-only
4. **matrix → matrix** — a track on the whole matrix, keys hold 9 numbers, each element lerped; a singular matrix on the way is the existing render-error on that frame. Needs `value: number | number[]` and 9 fields for the selected key
5. **mp4 export** — `assembleVideo` made streaming, `-pix_fmt yuv420p`, loop by `loopVideoTo`
6. dragging keys along the track

### cut if behind (in order)

1. `seconds` — only `reps`
2. the ruler click → a number field for the playhead
3. (#6 of `docs/planning.md`) animation → 1.1, release static toasts

### not in this sprint

- **vertical scroll over the tracks, min / max size of all nodes** — `docs/backlog/2026-11-04_animation-tracks-vertical-scroll.md`
- **time-window** (a vertical cut of the timeline, chains per window, a show reel) — `docs/backlog/2026-11-03_timeline-time-windows.md`
- easing, curves — an optional field on a key later, the version stays
- animating `color`, `channel`, `blendMode` — color needs an interpolation space, enums only jump
- a second output node, the preview node — `docs/backlog/2026-10-26_preview-node-and-export-settings.md`
- a blender-like bottom panel — the contract won't change if it comes later
- live preview of the animation — next release (`docs/planning.md`)
- cancelling a running export, a frame / node cache — `docs/backlog/2026-10-08_server-render-cache.md`

### decisions

answered 03.11:

- the node has no output; one `output`, no `animation-output`. It shows the frame under the playhead (render is automatic, there was never a render button), the one new button is `render animation`
- a track is one property; wiring any numeric param creates a track; linear speed
- the interface lives inside a wide node, 3 uiu columns wide, horizontal scroll over the timeline; 04.11: no vertical scroll, the height grows with the tracks, handles and styles as they are now
- keys are added and removed by hand in the ui; autokey → stretch
- `fps`, `frames`, `loop` live in the animation node; `reps` and `seconds` exclude each other; only one cycle is rendered
- export minimum: gif only
- 04.11: tracks as the `layers` rows, by hand, a new one on top; keys outlive a shorter `frames` and a removed or rewired link (the frame clamps the value) — nothing is destroyed by a setting or a wire
- keys count in frames, not seconds (as blender): a changed `fps` changes the speed — confirmed 04.11

set 05.11 with the web, not asked separately — change here if wrong (`docs/diary/2026-11-05_animation-web.md`):

- ~~a node's pixel output moved to the legend's line, in every node: at the node's middle it lands on a one-param node's row handle~~ → the bottom-right corner, 06.11
- the render message carries the frame without the animation node and its links: fps, track order or a key elsewhere don't change the picture and don't start a render
- the animation node isn't locked by a running render (`session.animationLocked`), only by no connection and an upload: else every playhead move blocks `+ key` until its frame is rendered. `render animation` will have to lock it
- the loop switch reads `forever` / `reps` / `seconds`, not `off`: an absent `loop` is a gif that loops forever
- a key's frame typed onto another key of the track is refused, the field goes back: nothing gets overwritten
- a key's typed value stops at the linked param's bounds; an unlinked track has none
- the animation node is placed right of the params it animates, in a row of its own: wires run forward
- a track with a link but no keys drives nothing, its param stays editable

answered 06.11, after the user's look:

- a node's pixel output goes to the **bottom-right corner**, not the legend's line (`docs/backlog/2026-11-05_node-output-bottom-right.md`)
- **`play`** in the animation node, next to `+ track`: one frame rendered → the playhead moves on → the next one rendered, the last frame goes back to the first; a frame stays no shorter than `1 / fps`, but as long as its render takes. A render error or a lost connection stops it. Rendering ahead and keeping the frames on the client — later, `docs/backlog/2026-11-06_play-frame-cache-on-client.md`
- check 1: **frames go to disk** first, not into ffmpeg's stdin or memory — 512 MiB with a ~430 MiB render peak leaves no room for the clip; in memory / streaming — later, `docs/backlog/2026-11-06_animation-frames-in-memory.md`
- QA isn't run during the sprint: `sprint-5.qa.md` is only written, run at the end of the release (`CLAUDE.md`)

defaults (set 03.11 while fixing the plan, not asked separately — change here if wrong):

- a param with a track is read-only until stretch 3
- `loop` absent — gif loops forever
- the stretch order above, and matrix as stretch, not must
- set 04.11 with the contract: `fps` — an integer 1–100 (gif delays are 1/100 s, can widen for mp4); `loop` is strict — a file with both `reps` and `seconds` is refused; a track without a link is allowed and changes nothing, like an unlinked `layers` row

---

## extension 09.11 — blender timeline, export dropdown, groups, widths

Asked by the user 09.11, after the must was done: these go in **before** the release (`docs/diary/2026-11-08_degas-animated-elk-arrange.md`). Answers to the open points — 09.11, in «decisions» at the end. Overrides the must above where they differ: `loop` leaves the animation node, mp4 is no longer stretch, groups (stretch 2) and key dragging (stretch 6) are in.

### the blender timeline, what we take

Blender's timeline / dope sheet, cut to what is quick here. Buttons with text, no icons; each has a `title` with its key.

| blender | here | key (animation node selected) |
|---|---|---|
| scrub: drag in the ruler | drag the playhead along the ruler, a frame rendered on every whole frame (latest-wins) | — |
| jump to start / end | `start` / `end` — frame 0 / `frames - 1` | Shift+← / Shift+→ |
| jump to keyframe | `‹ key` / `key ›` — the nearest key of any track before / after the playhead, nothing if none | ↓ / ↑ |
| step frame | `‹` / `›` — one frame, clamped to `0…frames - 1` | ← / → |
| play / pause | `play` / `stop` — as now | Space |
| current frame field | number field `frame`, typed → the playhead | — |
| start / end fields | `fps`, `frames` — as now (the start is always 0) | — |
| insert keyframe | `+ key` on the track row — as now | I — a key on every linked track of the selected key's group, else of all linked tracks |
| delete keyframe | `× key` — as now | X / Delete — the selected key; the node stays (xyflow's own Delete is off while a key is selected) |
| move keyframe (G / drag) | drag a diamond sideways, snapped to whole frames | — |
| channel groups, the summary row | a group per source node (below), its summary row shows the union of its keys; dragging a summary diamond moves every key of the group on that frame | — |
| collapse a group | `▾` / `▸` in the group's legend | — |
| View All (Home) / Ctrl+wheel zoom | fit by default: frames fill the timeline's width; Ctrl+wheel zooms around the cursor, `fit` button back | Home |

Not taken now: reverse play, multi-select / box select of keys, markers, preview range, auto-keying (stretch 3 stays), the graph editor and easing.

Rules for dragging a key:

- whole frames only, from 0, past `frames` allowed (the key dims, as now)
- a frame another key of the track holds is refused: the key stays on the last free frame it passed, nothing is overwritten (as the typed `frame` field, 05.11)
- a summary drag moves the group's keys of that frame together; refused as a whole if any of them would land on an occupied frame
- one undo step is not a thing yet — no undo in the app

### layout of the animation node, blender's order

```
┌ animation ─────────────────────────────────────────────────────────────── 6 columns, 1236px ┐
│ [+ track]  [start][‹ key][‹][play][›][key ›][end]  frame [ 12]  fps [36] frames [24] [fit]  │  header
├──────────── channels: 2 columns, 396px ───────┬──────── timeline: 4 columns, 808px ──────────┤
│                                               │ 0    4    8    12   16   20   23 │ ruler   │
│ ┌ ▾ corners 1 ────────────────────────────┐   │ ◆                          ◆     │ summary │
│●│ ⠿ topLeftX               [+ key] [×]    │   │ ◆──────────────────────────◆     │         │
│●│ ⠿ topLeftY               [+ key] [×]    │   │ ◆──────────────────────────◆     │         │
│ └─────────────────────────────────────────┘   │                 ┃ playhead        │         │
│ ┌ ▸ move 1 (2) ───────────────────────────┐   │ ◆                          ◆     │ summary │
├───────────────────────────────────────────────┴───────────────────────────────────────────────┤
│ key: frame [ 0]  value [ 12.5]  [× key]                                                       │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **width** — 6 uiu columns: `6 × 190 + 5 × 16 = 1236px`; channels 2 (396), timeline 4 (808, the gap counted in). Height grows with the tracks, no vertical scroll (04.11 stays)
- **header** — one row, blender's: `+ track` left, the transport in the middle, frame / fps / frames / `fit` right. `loop` leaves the node (→ the export dropdown)
- **`+ track` is a drop target**: a param wire dropped on it makes a new track linked to that param, in its node's group (with its first key, as a link into an empty track does). The rule «nothing is created by dropping a link onto the node» (03.11) stays for the rest of the node. A wire from a param that already has a track is refused, as now. Clicking it still makes an empty unlinked track
- **selected key** — the bottom row, as now

### tracks grouped by node

- a group = the tracks whose links come from one node; a `fieldset` with a `legend`, the node frame's look (`.frame`), nested in the channels column. The timeline mirrors it: a summary row per group's legend, then its tracks
- group name — the node type's label; two or more nodes of one type in the timeline get numbers in group order: `corners 1`, `corners 2`, … A track row shows the param only (`topLeftX`), the group already names the node
- unlinked tracks — a group of their own, `unlinked`, on top (where `+ track` puts a new one)
- order: groups in the order of their first track in `data.tracks`, tracks in `data.tracks` order inside; drag reorders inside a group only (a drop onto another group's row is refused). The contract doesn't change — groups are derived from links
- collapsed (`▸`): the rows hide, the summary row stays, every track handle of the group sits on the legend's line, so the wires still land; the name gets the count, `move 1 (2)`. Collapse state — ui only, not in the toast, not in `localStorage`
- the summary row: one diamond per frame that has a key in any track of the group; selected — if the selected key is on it

### timeline zoom

- `pxPerFrame` — ui state; default fit: `808 / timelineEnd`, at least 4 px (below that — horizontal scroll, as now)
- Ctrl+wheel: ×1.25 per step around the cursor's frame, 4…64 px; `fit` / Home back to fit. Plain wheel keeps scrolling sideways (05.11)
- the ruler labels thin out with the zoom (every 1 / 2 / 5 / 10 / … frames, at least ~32 px apart)

### export dropdown

- `render animation` gets `▾` next to it (one button group); `▾` opens a block under it in the actions panel, `▴` closes it; open / closed — ui only
- in the block: `format` — `gif` / `mp4`; `loop` — `forever` (gif) or `once` (mp4) / `reps` / `seconds`, the other field off, as the node had it. With `seconds` — a checkbox `whole cycles`, on by default (decided 09.11): on — the length rounds to whole cycles (as now); off — exactly `seconds`, the last cycle cut on a frame. The button reads `render gif` / `render mp4`; the file — `<toast>_<YYYYMMDD-HHmmss>.gif|.mp4`
- **contract**: the settings leave the animation node into the toast: `ToastGraph.export?: { format?: "gif" | "mp4"; loop?: AnimationLoop }` (absent format — gif, absent loop — the format's default). `AnimationLoop`'s seconds variant gets `wholeCycles?: boolean`, absent — `true`. `AnimationNode.data.loop` goes. Saved with export / import toast and `localStorage`. `TOAST_GRAPH_VERSION` stays 1 — pre-release, no migration (an old file with `loop` in the node: zod drops the unknown key, the loop is lost). The plain `render` message is sent without `export`: a setting changes no picture. Degas's `{ seconds: 15 }` moves to `export`
- **server**: `render-animation` reads `graph.export`. mp4 — the same frames on disk (and on white, as gif), then ffmpeg `libx264`, `-pix_fmt yuv420p`, `-movflags +faststart`, the size padded to even (yuv420p needs it), `-r fps`. mp4 has no loop flag: `reps` → the cycle repeated in the file (`-stream_loop`), `seconds` → whole cycles as gif (`gifPlays`, renamed), absent → one cycle. `seconds` with `wholeCycles: false`: mp4 — repeated and cut to `round(seconds × fps)` frames (`loopVideoTo`, as the degas script); gif — the frames on disk repeated in the sequence up to that count, the file plays once (`-loop -1`) — a longer file, no extra render. Only one cycle is rendered either way. Check the debian trixie ffmpeg has `libx264` (it should), else `libopenh264`
- `RENDER_MAX_FRAMES` counts rendered frames only — repeats cost no render

### node widths on the uiu grid

- every node is 1 uiu column wide — **190px**, like owo's card; wide nodes span whole columns with the gaps: `n × 190 + (n − 1) × 16`. Animation — 6 (1236px); `layers`, `input`, `output` — 2 (396px: the rows' controls, the picture); the rest — 1
- 190px leaves 174px inside: the number field takes the label **inside**, blender's node field: `x %` left, the value right, drag / `‹ ›` / click-to-type as now. One change in `Slider.svelte` for every node; the label shortens to fit (`x (% of width)` → `x %`, the unit's long form goes to `title`). Other controls (color, select, matrix's 9 fields) fit into 174 or take a full row
- the column width (190) and the span formula as css custom props here, marked `TODO(uiu)`: uiu has no column-width token (owo writes `190px` in `.grid`) — a backlog note
- elk arrange reads measured sizes — nothing to change there

### definition of done (extension)

- `bun run test` covers: the group derivation (order, numbering, unlinked), key drag rules (occupied frame, summary drag), prev / next key, the loop arithmetic (reps / seconds, whole cycles on / off) for gif and mp4, the `export` field in the toast schema
- in a headless browser on the dev stack, degas: the node is 1236px, 6 groups (3 `corners` × 6 tracks, 3 `move` × 2), collapse / expand keeps the wires, a key dragged, the playhead dragged, `‹ key` / `key ›` / `start` / `end` and the keys, Ctrl+wheel and `fit`, a param wire dropped on `+ track` makes a linked track
- `render mp4` downloads an mp4 that plays (`ffprobe`: h264, yuv420p, even size, the frame count = cycles × frames); gif as before
- a toast with `export` survives export → import → reload

### order (extension)

1. **09.11 mon** — this spec, the diary, planning
2. **10.11 tue** — contract (`export`, `loop` out of the node), server mp4, degas / test toasts moved; tests
3. **11.11 wed** — widths + the label inside the field; the animation node at 6 columns, the header, the transport, the playhead drag, zoom
4. **12.11 thu** — groups (fieldsets, summary rows, collapse), key drag, the hotkeys, a wire dropped on `+ track`
5. **13.11 fri** — the export dropdown; the headless pass of the DoD
6. **14.11 sat** — check 2 on prod, `sprint-5.qa.md`, merge to master, release
7. **15.11 sun** — buffer

cut if behind (extension, in order): the hotkeys → zoom (fit only) → summary drag (summary shows, doesn't drag) → mp4 (gif only, as before)

### decisions (extension)

answered 09.11:

- the export settings live in the toast, `ToastGraph.export` — not in the animation node, not browser-only (degas keeps its 15 s)
- a node is one uiu column, 190px; the number field holds its label inside, as blender's nodes
- the animation node is 6 columns, 1236px
- from blender, beyond the asked list: the whole transport, hotkeys (only with the animation node selected), timeline zoom, the group summary row and collapse

set 09.11 while writing this, not asked — change here if wrong:

- `layers`, `input`, `output` are 2 columns, the rest 1
- group names `<type> N` only when a type repeats; unlinked tracks — their own group on top
- collapse state isn't saved; zoom isn't saved
- mp4 with no loop set — one cycle
- `seconds` rounds to whole cycles by default; a `whole cycles` checkbox turns it off — exactly `seconds` (asked by the user 09.11)
- a dragged key never overwrites another key of its track
