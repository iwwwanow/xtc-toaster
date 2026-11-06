import type { ServerWebSocket, WebSocketHandler } from "bun";
import {
  ClientMessageSchema,
  type ClientMessage,
  RequestIdSchema,
  type RenderErrorMessage,
  type ServerMessage,
} from "@xtc-toaster/contract";
import { renderAnimation } from "../../application/render-animation";
import { GraphError } from "../../application/run-graph";
import { createAnimationJob, removeFrames, removeGif } from "../repository/animations";
import { render } from "../workers/render-queue";

// Renders run in a worker and can't be aborted → per connection one render
// runs, at most one waits; a newer message replaces the waiting one. A render-animation is one long entry:
// a render sent during it waits, and a later message replaces a waiting render-animation — the client sends
// nothing while it exports.
export type WsData = {
  busy: boolean;
  pending: string | null;
};

export const initialWsData = (): WsData => ({ busy: false, pending: null });

type RenderError = Omit<RenderErrorMessage, "type">;

const readRequestId = (raw: unknown): number | null => {
  const requestId = (raw as { requestId?: unknown } | null)?.requestId;
  return RequestIdSchema.safeParse(requestId).success ? (requestId as number) : null;
};

// nodes[i] in a zod path → the id the client sent for that node, if any
const readNodeId = (raw: unknown, path: PropertyKey[]): string | undefined => {
  if (path[0] !== "graph" || path[1] !== "nodes" || typeof path[2] !== "number") return undefined;
  const id = (raw as { graph: { nodes: Array<{ id?: unknown }> } }).graph.nodes[path[2]]?.id;
  return typeof id === "string" ? id : undefined;
};

export type RenderOptions = {
  uploadsDir: string;
  // linked layers rows over one render; unset — RENDER_MAX_LAYERS_DEFAULT
  maxLayers?: number;
  // frames of one render-animation; unset — RENDER_MAX_FRAMES_DEFAULT
  maxFrames?: number;
};

type Send = (message: ServerMessage) => void;

// each frame is its own entry in the render queue: renders of other connections wait one frame, not the clip
const animate = async (graph: ClientMessage["graph"], requestId: number, send: Send, options: RenderOptions) => {
  const { uploadsDir, maxLayers, maxFrames } = options;
  const job = await createAnimationJob(uploadsDir);
  try {
    await renderAnimation({
      graph,
      renderFrameTo: (graph, outPath) => render({ graph, uploadsDir, maxLayers, outPath }).then(() => {}),
      framesDir: job.framesDir,
      outputPath: job.gifPath,
      maxFrames,
      onFrame: (frame, frames) => send({ type: "animation-progress", requestId, frame, frames }),
    });
  } catch (e) {
    await removeGif(job);
    throw e;
  } finally {
    await removeFrames(job);
  }
  return `/api/animations/${job.id}.gif`;
};

const handleMessage = async (text: string, send: Send, options: RenderOptions): Promise<ServerMessage> => {
  const error = (e: RenderError): ServerMessage => ({ type: "render-error", ...e });

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return error({ requestId: null, message: "invalid json" });
  }

  const requestId = readRequestId(raw);
  const parsed = ClientMessageSchema.safeParse(raw);
  if (!parsed.success) {
    const { issues } = parsed.error;
    const versionMismatch = issues.some(({ path }) => path[0] === "graph" && path[1] === "version");
    if (versionMismatch) return error({ requestId, message: "reload the page" });

    const [{ path, message }] = issues as [(typeof issues)[number]];
    const nodeId = readNodeId(raw, path);
    return error({ requestId, ...(nodeId && { nodeId }), message: `${path.join(".")}: ${message}` });
  }

  const { graph } = parsed.data;
  try {
    if (parsed.data.type === "render-animation") {
      const url = await animate(graph, parsed.data.requestId, send, options);
      return { type: "animation-rendered", requestId: parsed.data.requestId, url };
    }
    const { width, height, png } = await render({ graph, uploadsDir: options.uploadsDir, maxLayers: options.maxLayers });
    // never without png: no outPath
    return { type: "rendered", requestId: parsed.data.requestId, width, height, png: png! };
  } catch (e) {
    if (e instanceof GraphError) return error({ requestId, ...(e.nodeId && { nodeId: e.nodeId }), message: e.message });
    return error({ requestId, message: e instanceof Error ? e.message : String(e) });
  }
};

type Handle = (text: string, send: Send) => Promise<ServerMessage>;
type Socket = Pick<ServerWebSocket<WsData>, "data" | "readyState" | "send">;

const drain = async (ws: Socket, handle: Handle) => {
  if (ws.data.busy) return;
  ws.data.busy = true;
  try {
    while (ws.data.pending !== null) {
      const text = ws.data.pending;
      ws.data.pending = null;
      // the client may be gone — its response is lost, server is stateless
      const send = (message: ServerMessage) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
      };
      send(await handle(text, send));
    }
  } finally {
    ws.data.busy = false;
  }
};

// a newer message replaces the waiting one; starts draining if idle
export const enqueue = (ws: Socket, text: string, handle: Handle): void => {
  ws.data.pending = text;
  void drain(ws, handle);
};

export const createWsHandler = (options: RenderOptions): WebSocketHandler<WsData> => ({
  data: initialWsData(),
  message(ws, message) {
    const text = typeof message === "string" ? message : message.toString();
    enqueue(ws, text, (t, send) => handleMessage(t, send, options));
  },
});