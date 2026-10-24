# One file for CI and prod (docs/sprints/sprint-3.spec.md, slice: hosting).
#   docker build --target test .   — typecheck + tests of every package, what CI runs
#   docker build .                 — runtime image: bun server on top of lib sources + the web build
# debian, not alpine: canvas prebuilds are glibc.
FROM oven/bun:1.4.2 AS base
WORKDIR /app

# all workspace deps (dev included) — for tests and the web build.
# Only manifests first, so the install layer survives source changes.
FROM base AS deps
COPY package.json bun.lock bunfig.toml ./
COPY packages/contract/package.json packages/contract/
COPY packages/lib/package.json packages/lib/
COPY packages/server/package.json packages/server/
COPY packages/toasts/package.json packages/toasts/
COPY packages/web/package.json packages/web/
RUN bun install --frozen-lockfile

# ffmpeg — packages/lib/tests/infrastructure.test.ts assembles a video; its own layer, cached in CI
FROM base AS test
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app ./
COPY . .
RUN bun run typecheck && bun run test

FROM deps AS build
COPY . .
# the semantic-release version from the docker job, shown in the ui; a local build — "dev"
ARG APP_VERSION=dev
RUN bun run --filter @xtc-toaster/web build

# server deps only (canvas, zod) — no vite / svelte / typescript
FROM base AS prod-deps
COPY --from=deps /app/package.json /app/bun.lock /app/bunfig.toml ./
COPY --from=deps /app/packages ./packages
RUN rm -rf node_modules packages/*/node_modules \
  && bun install --frozen-lockfile --production --filter @xtc-toaster/server

# no ffmpeg — the server doesn't make video
FROM base AS runtime
COPY --from=prod-deps /app ./
COPY packages/contract ./packages/contract
COPY packages/lib ./packages/lib
COPY packages/server ./packages/server
COPY --from=build /app/packages/web/dist ./packages/web/dist
ENV NODE_ENV=production
ENV PORT=3000
ENV UPLOADS_DIR=/data/uploads
ENV STATIC_DIR=/app/packages/web/dist
# no curl in the image — bun fetches /healthz itself
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/healthz`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["bun", "packages/server/src/index.ts"]
