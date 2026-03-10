import { Hono } from "hono";
import auth from "./routes/auth.js";
import toasts from "./routes/toasts.js";

const app = new Hono();

app.get("/", (c) => c.json({ name: "xtc-toaster api", version: "0.0.0" }));
app.route("/auth", auth);
app.route("/toasts", toasts);

export default app;
