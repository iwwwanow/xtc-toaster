# 2026-10-19 — спринт 3: планирование хостинга и публичного доступа

Сессия планирования: спека `docs/sprints/sprint-3.spec.md` написана, все вопросы закрыты, закоммичено и запушено (`ea75200`). Кода нет.

## Что изучили

- **kanalveschaniya** — образец CI: `.github/workflows/release.yml` (semantic-release → docker build & push в ghcr, `:version` + `:latest`, amd64 + arm64), `.releaserc.json` (commit-analyzer, release-notes, github, git). Тестов в CI там нет.
- **iwwwanow_infrastructure** — doco-cd уже работает на `ru-timeweb` (роль `doco_cd`, опрос infra раз в 60 с), стеки — `stacks/ru-timeweb/<стек>/compose.yml` + `stacks/.doco-cd.ru-timeweb.yml`, всё в `network_mode: host`, caddy спереди (`stacks/ru-timeweb/caddy/Caddyfile`). Занятые порты: 8080/8081 owo, 8090 doco-cd, 8095 headscale, 8096 vaultwarden → нам 8097. DNS — `terraform/dns.tf`, `tofu.sh apply` руками. Логи docker уже ограничены ролью `docker` (10m × 3). План Renovate расписан в infra `docs/planning.md` («Обновление образов — Renovate»), ещё не подключён.
- **Хост** `ru-timeweb` (снимок 14.10): 1 vCPU, 961 MiB RAM, диск 14 ГБ, занято 71 %. Ssh из сессии не сработал (ключ не в агенте) — свежих цифр нет.

## Замеры

- Рендер 2 Мп картинки (`hueNoise → hueMask → yRotation` + png) на десктопе: пик RSS ~215 МБ, ~1,1 с. Рендеры идут по очереди в одном воркере — пользователи память не складывают → `mem_limit: 512m`.
- `vite build` пакета web работает как есть (313 кБ js) — lib в бандл не утекает.

## Решения

- «1–2 ГБ» из вводных — это **диск**, не RAM. Bind-mount docker не ограничивает → приложение само: TTL загрузок 24 ч + квота `UPLOADS_MAX_TOTAL_MB` 512. Плюс разобраться, чистит ли doco-cd старые образы после релизов.
- RAM: `mem_limit: 512m`, CPU: `cpu_shares: 256` — под нагрузкой приоритет у headscale (весь tailnet), caddy, vaultwarden.
- Один образ, Bun отдаёт `dist` + `/api` + `/ws`. Сейчас прод-сборку не отдаёт никто (в dev фронт отдаёт vite). В будущем web / server / contract разделить с изолированными версиями и обратной совместимостью — `docs/backlog/2026-10-19_split-web-server-contract.md`.
- Тесты в CI — стадия `test` в том же `Dockerfile` (`oven/bun:1.4.2` + ffmpeg, слой кешируется), а не отдельный опубликованный образ. Push в любую ветку → test, в `master` → test → release → docker. PR в этом репо нет.
- Версии `0.x` до релиза 28.11: перед первым CI руками тег `v0.1.0`, иначе semantic-release выпустит `1.0.0`.
- Только amd64 — arm не нужен.
- Renovate: на infra — must (это цепочка выкатки), на этот репо — stretch. Задержка облачного Mend в несколько часов устраивает.
- Юзер-тест — сестра (художница), 3 своих картинки, фидбэк в свободной форме. Перед ним — собственный тест пользователя на проде: производительность хоста, при необходимости уменьшить `UPLOAD_MAX_MEGAPIXELS`.
- Ссылка открытая, без basic auth.
- Stretch по порядку: оставшиеся одноуровневые ноды (критерий «все фильтры бэкенда» не покрыт ни одним спринтом) → ручное ревью и рефакторинг → Renovate на этот репо → «server unavailable» при обрыве ws.

## Остаток

Весь спринт, по порядку из спеки:

1. app: `/healthz`, `HOST`, чистка загрузок (TTL + квота), `Dockerfile` (test / build / runtime), `.dockerignore` — проверить локально
2. CI: test → release → docker; тег `v0.1.0`; первый образ в ghcr
3. infra: DNS, caddy, стек
4. Renovate на infra, один `fix` через всю цепочку + откат
5. собственный тест на проде
6. тест сестры
7. stretch
