5. 03.11-15.11. animation node with export
   - 2 weeks (02.11 went to the server refactor)
   - a separate `animation` node, without a pixel output: each track animates one numeric param
   - linear only, no live preview, the current frame on the output, export — gif only (mp4 → stretch)
   - the picture — `sprint-5.diagram.d2`
   - cut if behind:
     - (#1 of `docs/planning.md`) gif only, no mp4 — **applied up front on 03.11**
     - (#6) last resort: animation → 1.1, release static toasts

### status (2026-11-05) — contract and web (the node, keys, playhead, the current frame) done, not yet checked by the user; next — check 1 and 2, then the server

Left in web: `render animation` (step 5, needs the server). 24 tracks of degas not tried yet (step 6).

- the 29.10 sketch reviewed, its open points answered — see the decisions at the end; the discussion — `docs/diary/2026-11-03_sprint-5-planning.md`
- technical checks (memory, gif on the prod limits) are left for the implementation, on purpose — "to check while implementing" below

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

- a node's pixel output moved to the legend's line, in every node: at the node's middle it lands on a one-param node's row handle
- the render message carries the frame without the animation node and its links: fps, track order or a key elsewhere don't change the picture and don't start a render
- the animation node isn't locked by a running render (`session.animationLocked`), only by no connection and an upload: else every playhead move blocks `+ key` until its frame is rendered. `render animation` will have to lock it
- the loop switch reads `forever` / `reps` / `seconds`, not `off`: an absent `loop` is a gif that loops forever
- a key's frame typed onto another key of the track is refused, the field goes back: nothing gets overwritten
- a key's typed value stops at the linked param's bounds; an unlinked track has none
- the animation node is placed right of the params it animates, in a row of its own: wires run forward
- a track with a link but no keys drives nothing, its param stays editable

defaults (set 03.11 while fixing the plan, not asked separately — change here if wrong):

- a param with a track is read-only until stretch 3
- `loop` absent — gif loops forever
- the stretch order above, and matrix as stretch, not must
- set 04.11 with the contract: `fps` — an integer 1–100 (gif delays are 1/100 s, can widen for mp4); `loop` is strict — a file with both `reps` and `seconds` is refused; a track without a link is allowed and changes nothing, like an unlinked `layers` row
