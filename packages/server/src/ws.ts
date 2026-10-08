import type { ServerWebSocket, WebSocketHandler } from "bun";
import {
  ClientMessageSchema,
  RequestIdSchema,
  type RenderErrorMessage,
  type ServerMessage,
} from "@xtc-toaster/contract";
import { encodePng } from "./codec";
import { GraphError, runGraph } from "./run-graph";

// Renders are sync js loops and can't be aborted → per connection one render
// runs, at most one waits; a newer message replaces the waiting one.
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

const handleMessage = async (text: string, uploadsDir: string): Promise<ServerMessage> => {
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

  try {
    const { data, width, height } = await runGraph(parsed.data.graph, uploadsDir);
    const png = encodePng(data, { width, height }).toString("base64");
    return { type: "rendered", requestId: parsed.data.requestId, width, height, png };
  } catch (e) {
    if (e instanceof GraphError) return error({ requestId, ...(e.nodeId && { nodeId: e.nodeId }), message: e.message });
    return error({ requestId, message: e instanceof Error ? e.message : String(e) });
  }
};

type Handle = (text: string) => Promise<ServerMessage>;
type Socket = Pick<ServerWebSocket<WsData>, "data" | "readyState" | "send">;

const drain = async (ws: Socket, handle: Handle) => {
  if (ws.data.busy) return;
  ws.data.busy = true;
  try {
    while (ws.data.pending !== null) {
      const text = ws.data.pending;
      ws.data.pending = null;
      const response = await handle(text);
      // the client may be gone — its response is lost, server is stateless
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(response));
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

export const createWsHandler = (uploadsDir: string): WebSocketHandler<WsData> => ({
  data: initialWsData(),
  message(ws, message) {
    const text = typeof message === "string" ? message : message.toString();
    enqueue(ws, text, (t) => handleMessage(t, uploadsDir));
  },
});
