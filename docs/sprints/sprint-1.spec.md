1. 5.10-11.10. architecture & draft ui
   - 1 week
   - websocket-contract
   - datatypes
   - draft ui

diagram — `sprint-1.diagram.d2`

---

## slice: one-node toast

`input -> noize -> output`, graph is fixed (no adding / removing / relinking nodes in this sprint).

### must

- svelte flow connection, fixed graph of 3 nodes — loaded from toast `toast-2_signac` on page open
- input node
  - upload-button → `POST /api/images` → `imageId` written into input node data
- noize node
  - `deviationCoefficient` is in the contract from the start
  - without stretch 1: fixed default value (0.5), not editable in ui
- output node
  - shows the last `rendered` png (only the response to the last sent `requestId`)
  - download-png-button saves the png of the last `rendered` — no extra request, the file is exactly what output shows
  - errors shown on output: upload failed, `render-error`, ws disconnected

### empty state

- while input `imageId` is `null` (page just opened, graph from signac) the client sends no `render`
- output shows an empty state "upload an image", download-png-button locked

### render lifecycle

- every change of ui state that affects the graph (new `imageId`, param value) → new `render` with a new `requestId`
- render always restarts: the newest request wins, responses to older ones are dropped by the client
- server: renders are sync js loops and can't be aborted mid-way → per connection keep at most one pending request; a newer one replaces it; when the current render finishes, only the latest pending one runs (real abort = worker, later)

### ui lock

- while an upload or a render is in progress, the whole ui is locked: upload-button, node params, download-png-button
- exception — stretch 2: the slider stays live during render (each move restarts the render, see render lifecycle); download stays locked until the last render arrives

### ws reconnect

- the client reconnects by itself with a growing pause: 1 → 2 → 4 → … capped at 10 s
- while there is no connection: output shows "ws disconnected", the whole ui is locked
- after reconnect: if `imageId` is set, the client re-sends the current graph as a new `render`
- a response that was in flight when the connection dropped is lost — nothing to recover, server is stateless

### stretch (if time is left, strictly in order)

1. [ ] noize `deviationCoefficient` slider
   - render on slider release (`onchange`)
   - without it: fixed default value
2. [ ] live render while dragging the slider (depends on 1) — the killer feature, contract is built for it from day one
   - `oninput` + debounce ~150ms, slider not locked during render, stale responses dropped by `requestId`
   - without it: render on release from 1

contract does not change for stretch — only the moment the client sends `render`.

### not in this sprint

- export toast / import toast — sprint 2
  - export = `ToastGraph` json with `imageId: null` (toast is a preset, not a picture)
  - import is required, otherwise export is useless; validated with the same schema
- live render on graph structure change (add / remove / relink nodes) — not planned
- several inputs on output (layers) — sprint 4
  - edges into output get `targetHandle` (layer index), output `data` gets per-layer `blendMode` / `opacity`
- animatable params — sprint 5
  - param becomes `number | Keyframes`, `version: 2` + `migrate(graph)`
- s3 for uploads — later, for now `assets/uploads/<imageId>`
- images over 2 MP, binary ws frames instead of base64 — later (see upload limits)
- webp — `canvas` can't decode it (`loadImage` → "Unsupported image type")
- EXIF orientation — `canvas` ignores it, phone jpegs come out rotated; known, not fixed now

---

## decisions

- package manager — bun only
- `lib` is not changed in sprint 1, used as is
- web — svelte + vite SPA with `@xyflow/svelte` (no sveltekit: backend is the bun server, no ssr needed)
- one origin for web and server, relative `/api` and `/ws` everywhere, no build env, no cors
  - dev: vite `server.proxy` → bun (`/api`, `/ws` with `ws: true`)
  - prod: reverse proxy in front (nginx / caddy / traefik): `/` → web `dist`, `/api` + `/ws` → bun
  - ws url built from `location` (`ws:` / `wss:` + `location.host` + `/ws`)
  - details — `docs/backlog/2026-10-06_deploy-reverse-proxy-single-origin.md`
- a toast is a `ToastGraph` preset (no picture, `imageId: null`) — the default graph on page open is toast `toast-2_signac`, not a literal inside web
- contract lives in a shared package `packages/contract` (`@xtc-toaster/contract`), imported by web and server via `workspace:*`
  - not in `lib`: lib is domain / pixels, the client must not pull `canvas`
  - zod schemas, types derived via `z.infer` — schema and type never diverge
  - same schema validates ws messages on server and imported toast files on client
- svelte flow nodes stay on the client; before sending, `toGraph(nodes, edges)` strips ui fields (`position`, `selected`, `measured`, …) — server does not depend on xyflow
- graph executor — `packages/server/src/run-graph.ts` on top of `lib` (`Layer` + noize effect)
- image codec on the server — `canvas` used directly, declared in `server` deps (not only transitively through lib)
  - upload: `loadImage` from the buffer → format check by decoding + megapixel limit
  - render: pixels via `imageFileToRawData` from lib, png via `canvas.toBuffer("image/png")` (lib only has `rawDataToImageFile`, which writes to a file)
  - temporary: moves into lib in a later iteration — `docs/backlog/2026-10-06_image-codec-into-lib.md`
- server is stateless: client sends the whole graph on every `render`, no sync, reconnect is free
- upload over plain HTTP, ws only for render
- one render = one picture: server renders at the stored image size, browser scales it down with css, download saves the same bytes
  - no preview / full split: noize uses `Math.random`, two renders of the same graph never match, and per-pixel noise looks different at another scale
- image returned as base64 png inside json — one message, optimize to binary frames later
- `version` in graph
  - `TOAST_GRAPH_VERSION` constant in contract package
  - client/server deployed together → mismatch only for a stale open tab: server answers `render-error` "reload the page"
  - main purpose — saved toast files: old version → `migrate(graph)` (written with the first v2, not now)

### upload limits

- formats: png, jpeg — checked by decoding, not by extension
- max 2 MP (width × height) → `400 too-large`
  - why: noisy png barely compresses (~4 bytes/px), base64 ×1.33, bun ws message limit is 16 MB → ~3 MP fits; 2 MP leaves headroom and keeps js pixel loops fast
  - phone photos (~12 MP) are rejected for now — raise together with binary frames / downscale on upload
- max file size 10 MB → `400 too-large`
- anonymous uploads after public link (sprint 3) → need TTL / cleanup of `assets/uploads`

### definition of done — tests

- `contract`: unit tests on parsing — valid graph, missing `edges`, foreign `version`, non-uuid `imageId`, `deviationCoefficient` outside 0–1
- `toasts`: the schema accepts `toast-2_signac`
- `server`: one integration test — upload `poppies.jpg` → `render` over ws → `rendered` with the right size

---

## repo structure

```
packages/
  contract/   @xtc-toaster/contract — shared interfaces, depends only on zod
    src/constants.ts  TOAST_GRAPH_VERSION, upload limits
    src/graph.ts      ToastGraph, GraphNode, GraphEdge, parseToastGraph
    src/messages.ts   ClientMessage, ServerMessage, parseClientMessage
    src/upload.ts     upload response / error types
    src/index.ts
  lib/        @xtc-toaster/lib — pixels, not changed in this sprint
  toasts/     @xtc-toaster/toasts — toasts
    src/toasts/toast-1_degas/    cli script on top of lib (old form, stays as is)
    src/toasts/toast-2_signac/   graph toast: input → noize (0.5) → output
      toast.json                   the toast itself, same format as an exported toast file (sprint 2)
      index.ts                     export const signac: ToastGraph = parseToastGraph(json)
  server/     @xtc-toaster/server — Bun.serve
    src/index.ts      POST /api/images, /ws
    src/run-graph.ts  graph executor on top of lib
  web/        @xtc-toaster/web — svelte + vite SPA
```

dependencies (`workspace:*`):

- `contract` ← `toasts`, `server`, `web`
- `lib` ← `toasts` (degas only), `server`
- `toasts` ← `web` — only through subpath `@xtc-toaster/toasts/toast-2_signac`
  - never through the package root: degas runs on import (top-level script) and pulls `lib` → `canvas` into the browser
  - toasts `package.json` gets `exports` per toast
- `web` never imports `lib`

toast forms:

- target form of a toast — `ToastGraph`; signac is the first one
- degas stays a script until the nodes it needs (mask, tint, blur, transform, layers, animation) exist in the contract — then it becomes a graph too
- `toast.json` is parsed by the same schema as ws messages and imported files → a broken preset fails at import, plus a unit test in toasts

node positions are not in the toast: svelte flow positions for the fixed 3-node chain are computed in web (left to right by chain order).

---

## contract

implemented as zod schemas in `packages/contract`; types below are what `z.infer` must produce.

```ts
export const TOAST_GRAPH_VERSION = 1 as const;

// ── data: graph (also the toast file format) ─────────────────────
type NodeId = string;
type ImageId = string; // uuid — z.string().uuid(), server builds a file path from it

type ToastGraph = {
  version: typeof TOAST_GRAPH_VERSION;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

type GraphNode =
  | { id: NodeId; type: "input"; data: { imageId: ImageId | null } }
  | { id: NodeId; type: "noize"; data: { deviationCoefficient: number } } // z.number().min(0).max(1)
  | { id: NodeId; type: "output"; data: {} };

type GraphEdge = { id: string; source: NodeId; target: NodeId };

// ── upload: plain HTTP ───────────────────────────────────────────
// POST /api/images   multipart, field "file"
// 201 → { imageId: ImageId; width: number; height: number }
// 400 → { error: "unsupported-format" | "too-large" }

// ── ws: client → server ──────────────────────────────────────────
type ClientMessage = {
  type: "render";
  requestId: number; // grows with every request
  graph: ToastGraph;
};

// ── ws: server → client ──────────────────────────────────────────
type ServerMessage =
  | { type: "rendered"; requestId: number; width: number; height: number; png: string } // base64
  | { type: "render-error"; requestId: number | null; nodeId?: NodeId; message: string };
  // requestId: null — the message was not parseable enough to read it
```

server rules for this slice:

- read `requestId` from the raw message first (if it is a number), then validate the rest; any validation failure → `render-error` with that `requestId` or `null`
- wrong `version` → `render-error` "reload the page"
- graph must be a chain `input -> … -> output`, anything else → `render-error`
- `imageId: null` or unknown id → `render-error` with `nodeId` of the input node
- param out of range → `render-error` with `nodeId` of that node (caught by the schema, never reaches `lib`)

client rules:

- remember the last sent `requestId`, drop `rendered` / `render-error` with a different one
- `render-error` with `requestId: null` → shown on output as is

### scenario check

0. open page → graph from signac, `imageId: null` → no `render`, output empty, download locked
1. pick file → `POST` → `imageId` into input → graph changed → `render#1` → ui locked → `rendered#1` → output, ui unlocked
2. (stretch 2) drag slider → `render#2`, `render#3`, `render#4` → server is busy with `#2`, `#4` replaces pending `#3` → `#2` arrives → dropped → `#4` arrives → output
3. download → saves the png of `#4` from memory, no request
4. ws drops → ui locked, "ws disconnected" → reconnect after 1 s → current graph re-sent as `render#5` → output
