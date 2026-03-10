import { Hono } from "hono";

const auth = new Hono();

// POST /auth/login
// Body: { login: string, password: string }
// Returns: { token: string }
// TODO: verify credentials from SQLite, return real JWT/token
auth.post("/login", async (c) => {
  const { login, password } = await c.req.json<{
    login: string;
    password: string;
  }>();

  // stub: accept any non-empty credentials
  if (!login || !password) {
    return c.json({ error: "login and password are required" }, 400);
  }

  return c.json({ token: "stub-token" });
});

export default auth;
