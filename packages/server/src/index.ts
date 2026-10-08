import { resolve } from "node:path";
import { createServer } from "./server";

const server = await createServer({
  port: Number(process.env.PORT ?? 3000),
  uploadsDir: process.env.UPLOADS_DIR ?? resolve(import.meta.dirname, "../../../assets/uploads"),
});

console.log(`server listening on ${server.url}`);
