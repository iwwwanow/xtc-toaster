1. 5.10-11.10. architecture & draft ui
   - 1 week
   - websocket-contract
   - datatypes
   - draft ui

diagram — `diagram.d2`

---

## slice: one-node toast

`input -> noize -> output`, graph is fixed (no adding / removing / relinking nodes in this sprint).

### must

- svelte flow connection, fixed graph of 3 nodes
- input node
  - upload-button → `POST /api/images` → `imageId` written into input node data
  - image change → `render` (preview) → output shows result
- noize node
  - `deviationCoefficient` is in the contract from the start
  - without stretch 1: fixed default value (0.5), not editable in ui
- output node
  - preview of the last `rendered` (stale responses dropped by `requestId`)
  - download-png-button → `render` with `size: "full"` → browser saves png
    - disabled while: input image uploading, render in progress
  - errors shown on output: upload failed, `render-error`, ws disconnected

### stretch (if time is left, strictly in order)

1. [ ] noize `deviationCoefficient` slider
   - render on slider release (`onchange`)
   - without it: fixed default value
2. [ ] live render while dragging the slider (depends on 1)
   - `oninput` + debounce ~150ms, stale responses dropped by `requestId`
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

---

## decisions

- package manager — bun only
- contract lives in a shared package `packages/contract` (`@xtc-toaster/contract`), imported by web and server via `workspace:*`
  - not in `lib`: lib is domain / pixels, the client must not pull `canvas`
  - zod schemas, types derived via `z.infer` — schema and type never diverge
  - same schema validates ws messages on server and imported toast files on client
- svelte flow nodes stay on the client; before sending, `toGraph(nodes, edges)` strips ui fields (`position`, `selected`, `measured`, …) — server does not depend on xyflow
- server is stateless: client sends the whole graph on every `render`, no sync, reconnect is free
- upload over plain HTTP, ws only for render
- preview vs full: preview = longest side ≤ 1024, full = original size (export)
- image returned as base64 png inside json — one message, optimize to binary frames later
- `version` in graph
  - `TOAST_GRAPH_VERSION` constant in contract package
  - client/server deployed together → mismatch only for a stale open tab: server answers `render-error` "reload the page"
  - main purpose — saved toast files: old version → `migrate(graph)` (written with the first v2, not now)

### upload limits

- formats: png, jpeg, webp — checked by decoding, not by extension
- max file size / max megapixels — pixel loops are js, big images are slow (numbers to pick when the server is up)
- anonymous uploads after public link (sprint 3) → need TTL / cleanup of `assets/uploads`

---

## contract

implemented as zod schemas in `packages/contract`; types below are what `z.infer` must produce.

```ts
export const TOAST_GRAPH_VERSION = 1 as const;

// ── data: graph (also the toast file format) ─────────────────────
type NodeId = string;
type ImageId = string;

type ToastGraph = {
  version: typeof TOAST_GRAPH_VERSION;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

type GraphNode =
  | { id: NodeId; type: "input"; data: { imageId: ImageId | null } }
  | { id: NodeId; type: "noize"; data: { deviationCoefficient: number } } // 0–1
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
  size: "preview" | "full";
};

// ── ws: server → client ──────────────────────────────────────────
type ServerMessage =
  | { type: "rendered"; requestId: number; width: number; height: number; png: string } // base64
  | { type: "render-error"; requestId: number; nodeId?: NodeId; message: string };
```

server rules for this slice:

- graph must be a chain `input -> … -> output`, anything else → `render-error`
- `imageId: null` or unknown id → `render-error` with `nodeId` of the input node

client rules:

- remember the last sent `requestId`, drop `rendered` / `render-error` with a smaller one

### scenario check

1. pick file → `POST` → `imageId` into input → graph changed → `render#1 preview` → output
2. (stretch) drag slider → `render#2`, `render#3` → `#2` arrives after `#3` → dropped
3. download → `render#4 full` → png saved
