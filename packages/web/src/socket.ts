import { ServerMessageSchema, type ClientMessage, type ServerMessage } from "@xtc-toaster/contract";

const RECONNECT_MAX_MS = 10_000;

// 1 → 2 → 4 → … capped at 10 s
export const reconnectDelay = (attempt: number) => Math.min(1000 * 2 ** attempt, RECONNECT_MAX_MS);

// one origin with the server — no build env
export const wsUrl = ({ protocol, host }: Pick<Location, "protocol" | "host">) =>
  `${protocol === "https:" ? "wss:" : "ws:"}//${host}/ws`;

type Handlers = {
  onOpen: () => void;
  onClose: (event: CloseEvent) => void;
  onMessage: (message: ServerMessage) => void;
};

// render socket that reconnects by itself
export const connectSocket = (url: string, { onOpen, onClose, onMessage }: Handlers) => {
  let socket: WebSocket;
  let attempt = 0;

  const connect = () => {
    socket = new WebSocket(url);
    socket.onopen = () => {
      attempt = 0;
      onOpen();
    };
    socket.onclose = (event) => {
      onClose(event);
      setTimeout(connect, reconnectDelay(attempt++));
    };
    socket.onmessage = ({ data }) => {
      let raw: unknown;
      try {
        raw = JSON.parse(data);
      } catch {
        return console.error("invalid server message", data);
      }
      const parsed = ServerMessageSchema.safeParse(raw);
      if (!parsed.success) return console.error("invalid server message", raw, parsed.error);
      onMessage(parsed.data);
    };
  };

  connect();
  return { send: (message: ClientMessage) => socket.send(JSON.stringify(message)) };
};
