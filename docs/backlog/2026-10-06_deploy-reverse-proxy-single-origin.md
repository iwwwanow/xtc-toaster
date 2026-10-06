# Деплой: reverse proxy спереди, один origin для web и server

Решение: на проде перед всем стоит reverse proxy (nginx / caddy / traefik). `/` отдаёт собранную статику `packages/web` (`vite build` → `dist`), а `/api/*` и `/ws` проксирует на Bun (`packages/server`), для `/ws` нужен upgrade. Фронт и бэк живут на одном origin, поэтому фронт везде ходит по относительным путям. Переменная сборки (`VITE_API_URL`) не нужна, CORS на Bun не нужен, вся топология описана в конфиге прокси, и фронт о ней ничего не знает.

В dev ту же роль играет `server.proxy` в `vite.config`: `/api` → `http://localhost:3000`, `/ws` → `ws://localhost:3000` с `ws: true`. В бандл прокси не попадает. Адрес ws на клиенте собирается из `location` (`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`), а не задаётся строкой `"/ws"`: относительный путь в `new WebSocket()` понимают только свежие браузеры, и так протокол сам переключится на `wss` под https.

Отвергнутые варианты: Bun сам раздаёт `dist` (тоже один origin, но статика и API в одном процессе); разные домены для фронта и API (нужны `VITE_API_URL`, вшитый на сборке, и CORS). Вернуться к ним стоит, только если фронт уедет на CDN.

Контекст — спека первого среза `docs/sprints/sprint-1.spec.md`.
