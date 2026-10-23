3. 19.10-25.10. hosting — public access
   - 1 week
   - public link
   - user test

### status (2026-10-19) — spec written, work starts

- every open question answered 19.10 — the list is at the end
- the 1–2 GB limit from the brief is **disk**, not RAM (RAM on `ru-timeweb` is short too — 961 MiB)
- measured 19.10 (desktop, `runGraph` + png encode, 2 MP picture `hueNoise → hueMask → yRotation`): peak RSS ~215 MB, ~1.1 s per render; `vite build` of `packages/web` works as is (313 kB js)

### status (2026-10-21)

- CI done and on `master`: test on every branch → semantic-release → ghcr. `v0.1.0` tagged by hand, first release `v0.1.1` — the ghcr package is already public (anonymous pull works)
- golden hashes match in CI. ffmpeg in the test image is 7.1 (debian trixie) — `speedUpVideo`'s `fps=source_fps` failed there, fixed (`fix(lib)`: the source rate is probed)
- `.releaserc.json` — tags + GitHub Releases only (see the CI section)
- app part (order 1) — done: dev compose checked by hand 21.10 (sprint 2 scenario), `feat/server-prod` merged → `0.2.0`. Next — infra (order 3)
- decided 21.10: the container stays root, hardened in the stack — `cap_drop: ALL`, `read_only` + tmpfs, `no-new-privileges`. `USER bun` (needs `/srv/xtc-toaster/uploads` owned by uid 1000 via Ansible) — later, with the server review: `docs/backlog/2026-10-21_container-non-root-user.md`

### status (2026-10-22)

- infra written and pushed to infra `master` (by the user, without waiting for DNS): DNS record (`tofu apply` done — the record is in the Timeweb API), caddy block, stack with `0.2.0`, doco-cd entry. End of the session: Timeweb NS still don't serve the name (SOA serial unchanged) → no certificate, the link is dead. Tomorrow first: does the NS serve it (else — the Timeweb panel), caddy logs for the certificate, then the DoD scenario on prod
- `0.2.0` run locally with the stack limits (`read_only`, `cap_drop: ALL`, `no-new-privileges`, 512m, `cpu_shares: 256`): upload + 2 MP render `hueNoise → hueMask → yRotation` 1.1–1.7 s, `healthy`. Root without `CAP_DAC_OVERRIDE` writes only into a root-owned uploads dir — docker creates `/srv/xtc-toaster/uploads` as root, fine
- old images: doco-cd `prune_images` is true by default — likely covered, check on the host after the first Renovate update
- added: app version in the ui (stretch 6, last). One version for the whole repo — the git tag; lib isn't published, needs none

### status (2026-10-23) — the link is live

- DNS published overnight (Timeweb NS lag — hours, not minutes), caddy got the Let's Encrypt certificate on 22.10 by itself. The sprint 2 scenario checked by the user in the browser
- host (`ru-timeweb`): `0.2.0` `healthy`, `mem_limit` 512m, `cpu_shares` 256, read-only, `cap_drop: ALL`, `no-new-privileges`; uploads dir root-owned
- 3 renders of 2 MP in a row: 0.9–1.9 s each, vaultwarden answered in 27–96 ms meanwhile. Memory peak **212 MiB** of 512 — cgroup `memory.peak` since the start (the user's scenario + 5 renders of 2 MP), `oom 0`; `docker stats` (sampled ~1/s) showed only ~106 MiB — misses the render spike, read `memory.peak` instead. Idle 64 MiB. Host RAM 972 MiB, 431 available
- disk: image 353 MB + uploads quota 512 MB + logs ≤ 30 MB ≈ 0.9 GB — fits the 1–2 GB budget; whether old images go after an update — check with the first Renovate bump. `/` 40 % used
- Renovate on infra (same day): Mend app, `renovate.json` — own images automerge (`ignoreTests`: no checks on infra PRs, tests ran in the app CI), owo `allowedVersions: "<2"`. First real bump: owo evix 1.7.0 → 1.12.0 — PR merged in 2 s, doco-cd deployed in ~20 s, the old image pruned from the host → «old images don't pile up» confirmed
- the whole chain with a real `fix` (`fix(web)`: "server unavailable — reconnecting…" while the ws is down; checked in headless chrome across a server restart): push 16:54 UTC → CI test → `v0.2.1` → ghcr 16:56:46 → Renovate PR #4 16:58:33 (started by ticking the Dependency Dashboard checkbox — Mend's own schedule not seen yet) → automerged in 3 s → doco-cd: `0.2.1` `healthy` ~17:00, `0.2.0` pruned
- rollback: `git revert` of PR #4 pushed 17:00:39 → prod on `0.2.0` `healthy` at 17:01:25. Renovate reopened the bump (PR #5) right after the push but **didn't automerge it** — "a matching PR was automerged previously". So a real rollback = revert + close that PR unmerged (Renovate then skips the version until a newer one). Here the version was fine → PR #5 merged by hand, prod back on `0.2.1` at 17:02:46
- infra PRs do get one check — GitGuardian (secrets scan, an account-level app); `ignoreTests` only stops Renovate waiting

---

## slice: hosting

https://xtc-toaster.iwwwanow.ru — the same app as the docker compose dev stack, built for prod, on `ru-timeweb` next to owo and vaultwarden. Delivery chain as in kanalveschaniya plus the infra plan (`iwwwanow_infrastructure/docs/planning.md`, «Автоматизация доставки»):

```
push master → CI: typecheck + test → semantic-release → image ghcr.io/iwwwanow/xtc-toaster:<version>
  → Renovate PR in infra (automerge) → doco-cd deploys the stack
```

by hand only `git push`. no app changes beyond what deploy needs (healthcheck, static, uploads cleanup).

### must

#### app (this repo)

- `Dockerfile`, multi-stage — one file for CI tests and prod:
  - `test`: `oven/bun:1.4.2` + ffmpeg (`packages/lib/tests/infrastructure.test.ts` needs it), `bun install --frozen-lockfile`, `bun run typecheck`, `bun test` of every package. the apt layer is cached (gha cache) — ffmpeg isn't installed on every run; locally `docker build --target test .` reproduces CI
  - build: `bun install --frozen-lockfile`, `vite build` of `packages/web`
  - runtime: `oven/bun:1.4.2` (debian — `canvas` prebuilds are glibc, alpine needs musl / a build from source), sources of `server` / `lib` / `contract` (not compiled, like dev) + `dist`
  - one image, one process: Bun serves `dist` + `/api/*` + `/ws` on one port (decided 19.10 — for now; later web, server and contract split — `docs/backlog/2026-10-19_split-web-server-contract.md`)
  - no ffmpeg in the runtime — the server doesn't make video
  - `linux/amd64` only — the only target is `ru-timeweb`; arm64 under qemu would build `canvas` for nothing
- `.dockerignore` — `assets/` (1.3 GB), `node_modules`, `tests/output`, `packages/lib-native`, `.git`
- server:
  - `GET /healthz` → 200 (compose healthcheck, like kanalveschaniya)
  - `HOST` env (default `0.0.0.0` for dev, `127.0.0.1` in prod) — `network_mode: host`, outside only through caddy, like vaultwarden's `ROCKET_ADDRESS`
  - uploads cleanup — a public upload without it fills the disk (`ru-timeweb`: 14 GB, 71 % used on 14.10):
    - TTL: files in `UPLOADS_DIR` older than `UPLOADS_TTL_HOURS` (default 24) are removed on start and every hour
    - quota: `UPLOADS_MAX_TOTAL_MB` (default 512) — before saving an upload the oldest files go until the new one fits. docker can't cap a bind mount's size, so the app does it
    - an expired / evicted picture → the existing `image not found` render-error
- dev `docker-compose.yml` keeps working unchanged

#### CI (`.github/workflows/release.yml`, like kanalveschaniya)

- triggers: push to any branch → `test`; push to `master` → `test` → `release` → `docker` (work goes through local branches merged into `master`, no PRs)
- `test` job — `docker buildx build --target test` (the stage above); `release` needs it. golden hashes (`pipeline.golden.test.ts`) differ in CI → look at why, never skip silently
- `release` job — semantic-release, `.releaserc.json` as kanalveschaniya actually works: commit-analyzer, release-notes, github — the version lives in the git tag + GitHub Release, CI commits nothing back (decided 20.10: kanalveschaniya lists `@semantic-release/git`, but without the changelog / npm plugins it has nothing to commit — no `CHANGELOG.md`, `package.json` stays `0.0.0`)
- `docker` job — build & push `ghcr.io/iwwwanow/xtc-toaster:<version>` and `:latest`, gha cache
- versions stay `0.x` until the 1.0 release on 28.11: tag `v0.1.0` by hand before the first CI run (semantic-release would cut `1.0.0` otherwise) → `feat` bumps minor, `fix` patch
- the ghcr package is public — doco-cd and Renovate pull it without a token

#### infra (`iwwwanow_infrastructure`)

- DNS: `terraform/dns.tf` — `"iwwwanow.ru/xtc-toaster"` A → `local.ru_timeweb`; `terraform/tofu.sh apply` — by the user (token and state passphrase from pass)
- caddy: `xtc-toaster.iwwwanow.ru { reverse_proxy 127.0.0.1:8097 }` (8080/8081 owo, 8090 doco-cd, 8095 headscale, 8096 vaultwarden); caddy proxies the ws upgrade by itself
- stack `stacks/ru-timeweb/xtc-toaster/compose.yml` + entry in `stacks/.doco-cd.ru-timeweb.yml`:
  - image with a version tag, never `:latest` (Renovate bumps it, rollback goes back to it)
  - `network_mode: host`, `restart: unless-stopped`, `cap_drop: [ALL]`, `no-new-privileges`, `read_only: true` + `tmpfs: [/tmp]`
  - `mem_limit: 512m` — peak ~215 MB per render, renders queue in one worker (users don't add up)
  - `cpu_shares: 256` (default 1024) — a render takes the single vCPU for seconds; under contention headscale (the whole tailnet), caddy and vaultwarden win, idle — the render gets the whole core
  - uploads — `/srv/xtc-toaster/uploads` (`create_host_path: true`), **not** in backups: temporary data with a TTL
  - healthcheck on `/healthz`
- disk budget 1–2 GB for the whole service: uploads ≤ 512 MB (quota) + the image + logs (already capped by the `docker` role: `max-size 10m`, `max-file 3`). every release leaves the old image on the host — find out whether doco-cd prunes them, otherwise a periodic `docker image prune`
- Renovate on infra — the item «Обновление образов — Renovate» of the infra planning; the hosted GitHub App runs on Mend's cloud (Mend — the company behind Renovate), checks registries every few hours — fine for this sprint:
  - GitHub App, `renovate.json`: `docker-compose` manager, `ghcr.io/iwwwanow/*` — automerge (`automergeType: "pr"`), foreign images — PR only
  - owo evix isn't pinned (decided 22.10, was «stays on `1.7.0`»): updates with the rest, but only within `1.x` — `allowedVersions: "<2"` for `ghcr.io/iwwwanow/owo` (applies to the iwwwanow instance too; an owo major — by hand)
  - the Dependency Dashboard checkbox — the manual "check now" when the Mend schedule is too slow

#### user test

- one tester — the user's sister, an artist: on the public link she makes toasts from 3 different pictures of her own
- free form — what feedback she brings is part of the result; the link is open, no auth (decided 19.10)
- decided 23.10: async, by text — no call. A short message: the link, what to do (3 own pictures), how it works (the chain left to right, render on slider release, right click deletes, download png top right), the limits up front (jpg / png, ≤ 2 MP ≈ 1600×1200 — bigger ones get `too-large`; phone photos may come out rotated — EXIF), then open questions: what was unclear, did anything she got appeal to her, what was missing. The ui is raw — the message says so
- result: notes in `docs/diary/`, a ui polish list for sprints 4+ (`docs/planning.md`: "ui polish — after the user test in sprint 3")

### definition of done

- [x] https://xtc-toaster.iwwwanow.ru opens with a valid certificate; the sprint 2 scenario works there: upload → `input → hue mask → y-rotation → output` → download png → export toast → import it back
- [x] a `feat` / `fix` push to `master` reaches prod with no manual step (23.10 — the run was started by the dashboard checkbox to save time; without it — Mend's schedule): CI green → ghcr image → Renovate PR automerged → doco-cd deploys; a `docs` / `refactor` push releases nothing
- [ ] red tests or typecheck in CI → no release, no image — by `release.yml`: `release` needs `test`, `docker` needs `release`; not provoked live
- [x] the container has `mem_limit` and `cpu_shares`; a 2 MP render stays under the limit (`docker stats`), the rest of the host keeps working during it
- [x] `docker ps` shows the container `healthy`
- [x] uploads older than the TTL are removed (checked with a shortened TTL); over the quota the oldest go first (checked with a small quota) — 21.10 on the built image: TTL 0.001 h + restart, quota 0.05 MB (`docs/diary/2026-10-21_sprint-3-ci-cd-and-server-prod.md`)
- [x] the service fits the 1–2 GB disk budget: uploads quota + image + logs; old images don't pile up after releases
- [x] rollback checked once: revert of the Renovate PR → the previous version on prod
- [ ] user test done: the tester made toasts from 3 pictures on the public link, her feedback is in `docs/diary/`
- [ ] `bun run typecheck` and `bun test` green; dev docker compose works as before

### order

1. app: healthz, `HOST`, uploads cleanup, `Dockerfile`, `.dockerignore` — checked locally (`docker build` + `docker run`, the DoD scenario on localhost)
2. CI: test → release → docker; first `0.x` image in ghcr
3. infra: DNS, caddy, stack with a pinned version — the link is live
4. Renovate on infra, then one `fix` pushed through the whole chain + rollback
5. the user's own test on prod: render time and memory on the host (`docker stats`), how the 1 vCPU copes. too slow → lower `UPLOAD_MAX_MEGAPIXELS` (contract) or similar — decided then, on numbers
6. user test (the sister)
7. stretch

### stretch (if time is left, in order)

1. **the rest of the single-layer nodes** (sprint 2 stretch) — no sprint covers the readiness criterion "all current backend filters" (`docs/planning.md`), so it goes first; lib already has every one, the pattern is the hue mask one (contract schema + bounds → server `run-graph.ts` → web node + menu, tests on schema and render):
   - blur
   - saturation mask, value mask
   - isolateChannel
   - translate, rotate, scale
   - before the user test if they're done by then — more to play with
2. **manual review + refactoring** of the vibe-coded code — by the user, Claude helps:
   - order: `server` (goes public first) → `contract` → `web` → `lib`
   - rules: no behaviour change, tests green before and after, one package = one branch; findings that don't fit → `docs/backlog/`
   - commits `refactor:` — semantic-release doesn't release them, nothing reaches prod until the next `feat` / `fix`
   - already written down: `docs/backlog/2026-10-06_lib-tech-debt.md`, `2026-10-06_image-codec-into-lib.md`, `2026-10-06_render-boundary.md`, `2026-10-06_ts-hot-loop-allocations.md`, `2026-10-03_lib-test-audit.md`
3. Renovate on this repo — deps, the bun image, actions; PR only (automerge — after a few weeks without breakage). fits the "latest exact version" rule from `CLAUDE.md`
4. the ui says "server unavailable" when the ws drops (a deploy restarts the container — users see a dead page otherwise)
5. **favicon** — the public link should have one (`packages/web` has none now: no `<link rel="icon">`, no `public/`). Lowest priority in the sprint
6. **app version in the ui** — bottom-right corner, to see which version is hosted. The very last item, after the favicon. One version for the whole repo — the semantic-release git tag (= the ghcr image tag); every `package.json` stays `0.0.0`. The `docker` job knows it (`new_release_version`) → build arg → into the web build (vite `define`); dev / a local build shows `dev`

### cut if behind (in order)

1. rollback check → sprint 4
2. Renovate → the tag in infra is bumped by hand (doco-cd still deploys from git)
3. user test → sprint 4 (the link still has to be live)

### not in this sprint

- auth, rate limits, several render workers, render cache, CDN
- monitoring / alerts (infra planning: notifications on timer failures — shared, later)
- static served by the front proxy (`docs/backlog/2026-10-06_deploy-reverse-proxy-single-origin.md`) and the web / server / contract split — `docs/backlog/2026-10-19_split-web-server-contract.md`
- LFS / history cleanup, the Pexels key — `docs/backlog/2026-10-07_*`

### decisions

answered 19.10: Q1 (one image, Bun serves `dist` — for now), Q2 (disk 1–2 GB → uploads quota + image cleanup; RAM `mem_limit: 512m`, `cpu_shares: 256`; host performance — after the user's own test), Q3 (tag `v0.1.0` by hand), Q4 (Renovate: infra — must, this repo — stretch; hours of latency are fine), Q5 (one tester, 3 pictures, free form), Q6 (tests in a `test` stage of the `Dockerfile`, ffmpeg cached).

- Q7 (19.10): the link is open, no auth — not published anywhere; uploads TTL + quota, one render queue and upload limits (10 MB / 2 MP) cover abuse. If it leaks — caddy `basic_auth` (the browser's login / password dialog, a bcrypt hash in the Caddyfile), one block.
