import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";

const toasts = new Hono();

// stub data
const STUB_TOASTS = [
  {
    id: "1",
    name: "hue-shift",
    description: "Shifts hue across the image",
    preview_url: "/previews/hue-shift.gif",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "2",
    name: "saturation-cut",
    description: null,
    preview_url: "/previews/saturation-cut.gif",
    created_at: "2026-01-02T00:00:00Z",
  },
];

// GET /toasts
// TODO: query from SQLite with pagination
toasts.get("/", (c) => {
  return c.json(STUB_TOASTS);
});

// GET /toasts/:id
// TODO: query single toast from SQLite
toasts.get("/:id", (c) => {
  const toast = STUB_TOASTS.find((t) => t.id === c.req.param("id"));
  if (!toast) return c.json({ error: "not found" }, 404);
  return c.json(toast);
});

// POST /toasts — requires auth
// Body: multipart/form-data { name, description?, preview (gif file) }
// TODO: save to SQLite, store preview file
toasts.post("/", authMiddleware, async (c) => {
  const body = await c.req.parseBody();
  const name = body["name"];
  const description = body["description"] ?? null;
  const preview = body["preview"];

  if (!name || typeof name !== "string") {
    return c.json({ error: "name is required" }, 400);
  }
  if (!preview) {
    return c.json({ error: "preview gif is required" }, 400);
  }

  const created: (typeof STUB_TOASTS)[0] = {
    id: String(Date.now()),
    name,
    description: typeof description === "string" ? description : null,
    preview_url: `/previews/${name}.gif`,
    created_at: new Date().toISOString(),
  };

  return c.json(created, 201);
});

export default toasts;
