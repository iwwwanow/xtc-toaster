import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => c.json({ name: "xtc-toaster api", version: "0.0.0" }));

// TODO: GET  /toasts        — list all toasts
// TODO: GET  /toasts/:id    — toast metadata + preview
// TODO: POST /toasts        — publish new toast (auth required)

export default app;
