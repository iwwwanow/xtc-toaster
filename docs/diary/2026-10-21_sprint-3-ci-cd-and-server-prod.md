# 2026-10-21 — спринт 3: CI/CD и прод-режим сервера

Первая рабочая сессия спринта 3 (вечер 20.10 → ночь 21.10). CI собран по образцу kanalveschaniya и уже в `master`, вышел первый релиз. Серверная часть для прода готова в ветке, но не смержена — сначала ручная проверка dev compose.

## CI/CD — в master

Ветка `ci/release-pipeline`, смержена (`350e365`).

- `Dockerfile` из нескольких стадий на `oven/bun:1.4.2`: `deps` (`bun install --frozen-lockfile`, сначала только манифесты), `test` (ffmpeg отдельным слоем + `bun run typecheck && bun run test`), `build` (`vite build` web), `prod-deps` (`bun install --production --filter @xtc-toaster/server` — 35 МБ: только canvas и zod), `runtime` (исходники contract / lib / server + `dist`, без ffmpeg). Образ — 245 МБ.
- Тесты в CI идут **внутри `docker build`**, а не на раннере: стадия `test` заканчивается `RUN` с тестами, красный тест валит сборку → job → релиза нет. Образ стадии никуда не пушится. Локально то же самое — `docker build --target test .`. Кеш gha раздельный: `scope=test` и `scope=runtime`. С кешем повторный прогон ~30 с.
- Корневой `bun run test` — `bun run --filter '*' test`; у `lib` и `contract` появились свои скрипты `test`.
- `.github/workflows/release.yml`: push в любую ветку → `test`; `master` → `test` → `release` → `docker` (только amd64, теги `:<version>` и `:latest`).
- **`.releaserc.json` — только commit-analyzer, release-notes, github.** Выяснили, что в kanalveschaniya `@semantic-release/git` в списке есть, но ничего не делает: без плагинов changelog / npm коммитить нечего — `CHANGELOG.md` там нет, `package.json` остаётся `0.0.0`, коммитов `chore(release)` ни одного. Версии растут только в тегах и GitHub Releases, образ берёт тег оттуда же. Так и оставили: CI ничего не коммитит обратно, pull перед push не нужен. Строка в спеке поправлена.
- Тег `v0.1.0` поставлен руками на прежний master (`24eae6a`), первый прогон на master выпустил `v0.1.1` → `ghcr.io/iwwwanow/xtc-toaster:0.1.1`. Пакет в ghcr оказался публичным сразу — анонимный pull манифеста отдаёт 200, руками ничего включать не пришлось.

### ffmpeg 7.1 vs 8

Golden-хэши в контейнере совпали с десктопом. Упал другой тест — `speedUpVideo`: в образе ffmpeg 7.1.5 (debian trixie), на десктопе 8.0.1, а `fps=source_fps` на 7.1 падает с «The encoder timebase is not set». Воспроизвели в голом контейнере: явный `fps=6` работает и даёт ровно 9 кадров / 1,5 с. Починили (`fix(lib)`): частота источника берётся через `ffprobe` (`r_frame_rate`) и передаётся в фильтр явно. Тест не отключали. Этот `fix` и выпустил `0.1.1`.

## Прод-режим сервера — ветка `feat/server-prod`, не смержена

Два коммита: `feat(server)` и `build:`. CI по ветке зелёный.

- `GET /healthz` → 200 `ok`.
- `HOST` (по умолчанию `0.0.0.0`; в проде стек задаст `127.0.0.1`).
- `STATIC_DIR` — сервер отдаёт сборку web с того же адреса. Клиентского роутера нет: `/` → `index.html` (`cache-control: no-cache`), всё остальное — только существующий файл сборки, иначе 404; `/assets/*` — `immutable`. Выход за пределы `dist` (`%2e%2e`, `..%2f`) → 404. В dev переменная не задана — страницу отдаёт vite.
- Чистка загрузок (`uploads-cleanup.ts`):
  - `UPLOADS_TTL_HOURS` (24) — при старте и раз в час (`setInterval(...).unref()`, чтобы таймер не держал тесты);
  - `UPLOADS_MAX_TOTAL_MB` (512) — перед сохранением удаляются самые старые, пока новая не влезет. Сохранения идут по одному (цепочка промисов), чтобы две параллельные загрузки не посчитали одно и то же свободное место;
  - не число в этих переменных → сервер не стартует (иначе `NaN`-квота стёрла бы все загрузки).
- `Dockerfile`: `STATIC_DIR=/app/packages/web/dist` и `HEALTHCHECK` — curl в образе нет, `/healthz` дёргает сам bun (`bun -e "fetch(...)"`).
- Тесты: юнит `uploads-cleanup.test.ts`, интеграционный `tests/prod.test.ts` (healthz, статика, обход пути, квота через настоящие загрузки). Сервер 48/48.
- Проверено руками на собранном образе: главная и js отдаются; загрузка + рендер через ws работают (prod-deps хватает воркеру с canvas); квота 0,05 МБ — третья загрузка вытесняет первую; TTL 0,001 ч + рестарт — `uploads: 2 expired removed`; `docker ps` — `healthy`; `UPLOADS_MAX_TOTAL_MB=abc` — падает на старте.

Подводный камень сессии: правка через python-`replace` поменяла не ту строку — `save` стал вызывать сам себя, загрузка висела 5 с, за ней сыпались все ws-тесты. Тесты поймали сразу.

## Открытые вопросы

- Контейнер работает от root. Предложение — оставить: в стеке будут `cap_drop: ALL`, `read_only`, `no-new-privileges`. Пользователь `bun` потребует `/srv/xtc-toaster/uploads` с владельцем uid 1000 через Ansible. Не решено.

## Вечер 21.10 — ручная проверка и мерж

Dev-стек на `feat/server-prod` проверен руками: сценарий спринта 2 (загрузка → граф → png → экспорт / импорт тоста) работает, server в compose без `STATIC_DIR` жив, при старте подчистил 9 просроченных загрузок. Подводный камень: страница на `localhost:5173` была пустой — порт держал чужой стек (`onward-spartak-webview`), а наш `web` поднялся без опубликованного порта, compose не ругнулся. Локально `WEB_PORT=5174` в `.env`.

Ветка смержена в `master` (`005bfe7`) → релиз `0.2.0`. Пункт 1 списка ниже закрыт, мерж сделан; infra — завтра.

## На завтра

1. ~~Ручная проверка dev-стека на ветке `feat/server-prod`: `docker compose up -d`, сценарий спринта 2 на `http://localhost:$WEB_PORT` (upload → граф → png → экспорт / импорт тоста). Server в compose без `STATIC_DIR` и с `HOST` по умолчанию — по коду не затронут, но вживую не проверяли.~~ ✅ 21.10
2. ~~Мерж `feat/server-prod` → master → `0.2.0` ✅ 21.10; проверить job `docker` и образ~~ ✅ — CI зелёный, `ghcr.io/iwwwanow/xtc-toaster:0.2.0` есть.
3. ~~Решить root / `bun`~~ ✅ 21.10: root + `cap_drop: ALL`, `read_only`, `no-new-privileges` в стеке; `USER bun` — позже, `docs/backlog/2026-10-21_container-non-root-user.md`.
4. Infra (`iwwwanow_infrastructure`, своя ветка): `terraform/dns.tf` (`tofu.sh apply` — руками пользователя), Caddyfile `xtc-toaster.iwwwanow.ru → 127.0.0.1:8097`, стек `stacks/ru-timeweb/xtc-toaster/compose.yml` с `0.2.0` (`PORT=8097`, `HOST=127.0.0.1`, `UPLOADS_DIR`, `mem_limit: 512m`, `cpu_shares: 256`, `read_only` + tmpfs, uploads в `/srv/xtc-toaster/uploads`) + запись в `stacks/.doco-cd.ru-timeweb.yml`.
5. Дальше по спеке: Renovate на infra, `fix` через всю цепочку + откат, собственный тест на проде, тест сестры.
6. Favicon — в самый конец спринта, после stretch (добавлен в план 21.10).
