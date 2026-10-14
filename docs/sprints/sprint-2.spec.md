2. 12.10-18.10. ui & one-layer toast
   - 1 week
   - node editor: add / delete / link / unlink
   - nodes: hue mask, y-rotation
   - export / import toast

### status (2026-10-14) — steps 1–2 done, minimum needs hue mask

- done 14.10: server renders the path (`toPath`), node editor + canvas, right panel with download png, render / upload errors visible in the ui, plain html look (`base.css` + a `fieldset` per node) — `docs/diary/2026-10-14_sprint-2-path-render-node-editor.md`
- checked in the browser by the user: add from the menu, link, unlink, delete
- minimum (must after "cut if behind") = steps 1–3 → only hue mask is left; then y-rotation, export / import
- decided: an upload over the limits is rejected with a visible error, never scaled down

### status (2026-10-13) — spec written, work starts

- replanned 12.10–13.10: the old plan (export png, one-node toast) was mostly closed in sprint 1 — `docs/planning.md`
- export picture (png) — done in sprint 1 (`toast-2_signac_<YYYYMMDD-HHmmss>.png`); the button moves to the right panel here

---

## slice: one-layer toast

one layer, nodes applied one after another along the path `input → … → output`. no layers, no blend modes, no branching — sprint 4.

ui & ux reference — blender geometry nodes. draft look stays: stock `@xyflow/svelte` + bare html. only svelte-flow features, no extra libraries.

### must

#### node editor

- node menu on the left (svelte-flow `Panel`), a flat list of node types, no categories
  - add = drag & drop from the menu onto the canvas, the node appears where it was dropped — https://svelteflow.dev/examples/interaction/drag-and-drop
- link = drag from a node's output handle to another node's input handle
- unlink — both ways:
  - select an edge + `Delete`
  - drag an edge end into empty space (`onreconnectend`)
- delete node — right click (`onpanecontextmenu` / node context menu) or select + `Delete`; its edges go with it
- input and output: exactly one of each, can't be deleted, not in the menu
  - code comment: several inputs / outputs are possible later
- node ids — `crypto.randomUUID()`
- any connection is allowed: every node has one image in, one image out. connection validation — sprint 4, `docs/backlog/2026-10-13_node-connection-validation.md`

#### canvas

- svelte-flow `Controls` (zoom, fit view) and `Background`
- pan, zoom, node drag and select are on (they were off in sprint 1)
- node positions (xy on the canvas) live only in the client, not in the toast / contract
  - on page open and on import nodes are laid out in a row by chain order (`toFlow`); unlinked nodes go into a separate row

#### right panel

svelte-flow `Panel` on the right, buttons stacked vertically:

- download png — moved from the output node, behaviour unchanged
- export toast
- import toast

image upload stays in the input node.

#### render

- server renders the path `input → … → output`; nodes not on the path are ignored (like blender)
- no path or a branching path → `render-error` with a clear message, shown in the ui
  - errors are still `console.error` only (sprint 1) — exception: the render error is visible in the ui, otherwise an unlinked graph looks broken
- every graph change re-renders: add, delete, link, unlink, param change
  - adding / deleting an unlinked node does not change the path — still re-renders, no dedup in this sprint

#### nodes

each node works from the menu to the picture: lib → contract (zod schema, param bounds) → server (`run-graph.ts`) → web (component with sliders + menu item). tests: contract schema (bounds), server render, lib `Layer` for y-rotation.

- hue mask — `Layer.mask({ name: "hue", value, tolerance })`, already in lib
  - params: hue 0–360, tolerance
  - one layer → the result is a png with transparency (alpha = match weight); a coloured backdrop comes with layers in sprint 4
- y-rotation — `applyYRotationPerspective` exists in lib services, not wired into `Layer`
  - lib: `yRotation` transform (angle, focalLength) + branch in `Layer.setTransform` + test
  - params: angle in degrees, focalLength

#### toast export / import

- export toast — saves the graph to `toast-2_signac_<YYYYMMDD-HHmmss>.json` with `imageId: null` (toast is a preset, not a picture)
  - code comment: whether to save the picture too is open — `docs/backlog/2026-10-13_toast-export-with-image.md`
- import toast — loads the json, validated with `parseToastGraph`; the graph is restored, the layout is rebuilt; invalid file → error shown in the ui

### definition of done

- [x] a node can be dragged from the left menu onto the canvas and appears where it was dropped
- [x] two nodes can be linked by dragging from one's output to the other's input
- [x] an edge can be removed: select + `Delete`, or drag its end into empty space
- [x] a node can be deleted by right click or `Delete`, its edges are removed with it
- [x] input and output are always one each: can't be deleted, not in the menu; code comment about several inputs / outputs later
- [x] `Controls` and `Background` are on; canvas pans and zooms
- [ ] right panel, vertical buttons: download png, export toast, import toast — download png done
- [x] server renders the path `input → … → output` and ignores unlinked nodes
- [x] no path / branching path → a clear error visible in the ui
- [x] every graph change re-renders
- [ ] hue mask and y-rotation work from the menu to the picture; tests on the schema (contract) and the render (server), y-rotation also on `Layer` (lib)
- [ ] export toast saves `toast-2_signac_<YYYYMMDD-HHmmss>.json` with `imageId: null`
- [ ] import toast restores the graph and rebuilds the layout; an invalid file → error in the ui
- [ ] `bun run typecheck` and `bun test` are green
- [ ] scenario in docker compose: upload a picture → build `input → hue mask → y-rotation → output` → download png → export toast → import it back

### order

1. server: render the path, ignore unlinked nodes
2. node editor + canvas + right panel (on the existing noize node)
3. hue mask
4. y-rotation
5. export / import toast
6. stretch

### stretch (if time is left)

the rest of the single-layer nodes — closes readiness criterion "all current backend filters" (`docs/planning.md`), which no sprint covers. same pattern as hue mask, ~1 h each:

- blur
- saturation mask, value mask
- isolateChannel
- translate, rotate, scale

ui polish — after the user test in sprint 3, not before. only what would break the test goes in here (render error visible, empty state).

### cut if behind (in order)

1. export / import toast → sprint 3
2. y-rotation → sprint 4

### not in this sprint

- layers, blend modes, branching, connection validation — sprint 4
- noize stays hue noise (`addHueNoise`), no change — `docs/backlog/2026-10-11_noize-hue-only-on-saturated-pixels.md`
- node positions in the toast file
- live render while dragging a slider — next release
