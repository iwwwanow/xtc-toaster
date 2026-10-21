import { stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

// the web build (`vite build` → packages/web/dist) from the same origin as /api and /ws.
// No client router — "/" is index.html, anything else must be a file of the build.
export const createStaticHandler = (dir: string) => {
  const root = resolve(dir);

  return async (req: Request): Promise<Response> => {
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("not found", { status: 404 });

    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url).pathname);
    } catch {
      return new Response("not found", { status: 404 });
    }
    if (pathname === "/") pathname = "/index.html";

    const path = resolve(root, `.${pathname}`);
    if (!path.startsWith(root + sep)) return new Response("not found", { status: 404 });
    if (!(await stat(path).catch(() => null))?.isFile()) return new Response("not found", { status: 404 });

    // vite hashes everything under /assets; index.html must be revalidated to pick up a release
    const cacheControl = pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
    return new Response(Bun.file(path), { headers: { "cache-control": cacheControl } });
  };
};
