import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";

// TODO: replace with real token lookup from SQLite
const STUB_TOKEN = "stub-token";

export async function authMiddleware(c: Context, next: Next) {
  const auth = c.req.header("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }
  const token = auth.slice(7);
  if (token !== STUB_TOKEN) {
    throw new HTTPException(401, { message: "Invalid token" });
  }
  await next();
}
