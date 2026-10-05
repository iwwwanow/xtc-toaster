# 2026-10-05 — спринт 1: контракт, спека и диаграмма первого среза

Первый день спринта 1 (5.10–11.10, «architecture & draft ui»: websocket-contract, datatypes, draft ui) по плану из `iwwwanow_notes/projects/xtc-toaster.planning.md`. Пользователь набросал спеку и d2-диаграмму первого среза (один нод-фильтр между input и output), но плохо понимал, как сформулировать контракт. Сессия ушла на разбор дыр в наброске и фиксацию решений — кода ещё нет.

## Как выводили контракт

Не «придумывать формат», а пройти пользовательский сценарий по шагам и на каждом ответить: кто инициирует, что шлёт, что получает, что может пойти не так. Отдельно — **данные** (граф: что пользователь собрал, он же файл toast) и **сообщения** (глаголы над данными). В контракт попадает только то, что нужно серверу; позиции нод и прочий UI остаются на клиенте.

Дыры исходного наброска, которые закрыли:

- в JSON не было `id` у нод и `edges` — Svelte Flow граф не построит, а на втором слое (спринт 4) всё бы сломалось
- `filePath` в input-ноде противоречил «в ответ — image id»; стало `imageId`
- grayscale в lib нет и у него нет параметров — не проверяет главное (правка параметра → пересчёт); взяли **noize** (`deviationCoefficient`)
- «render on websocket sync» не определён: нет debounce, нет отбрасывания устаревших ответов, непонятно, кто держит состояние
- кнопка звалась render, а по клику скачивала
- не было состояний ошибок и версии формата

## Решения

Всё зафиксировано в `docs/sprints/spec.md` и `docs/sprints/diagram.d2` — там же сам контракт, здесь только суть:

- срез `input → noize → output`, граф фиксированный
- must: загрузка → рендер превью; кнопка download png (`render` с `size: "full"`); ошибки на output. Noize без stretch — с фиксированным значением 0.5
- stretch по порядку: (1) слайдер `deviationCoefficient`, рендер по отпусканию; (2) live-рендер при перетаскивании (debounce ~150 мс + `requestId`). Контракт от stretch не меняется — меняется только момент отправки `render`. Пользователь хочет видеть, как output перерисовывается при изменении value, — это и есть stretch 2
- загрузка по HTTP (`POST /api/images`), ws — только рендер; сервер stateless, клиент шлёт граф целиком
- контракт — в отдельном пакете `packages/contract` (`@xtc-toaster/contract`, `workspace:*`), не в `lib`; схемы на **zod**, типы через `z.infer`; тот же парсер валидирует ws на сервере и импортированный toast на клиенте
- `TOAST_GRAPH_VERSION` — константа в contract; для клиента/сервера нужна только на случай устаревшей вкладки, главное назначение — сохранённые toast-файлы и будущий `migrate(graph)`
- Svelte Flow ноды живут на клиенте, перед отправкой `toGraph(nodes, edges)` срезает UI-поля
- export/import toast — спринт 2 (при экспорте `imageId: null`; без импорта экспорт бесполезен); слои — спринт 4 (`targetHandle` + `blendMode`/`opacity` на output); анимируемые параметры — спринт 5 (`number | Keyframes`, `version: 2`)
- менеджер пакетов — только bun

## Сделано в репо

Ветка `sprint/1-architecture-draft-ui` от master, два коммита, не запушена:

- `9d2ad83` — удалены `packages/web` (будет нарисован заново на Svelte Flow), `pnpm-lock.yaml`, `package-lock.json`, `pnpm-workspace.yaml`, черновик `docs/specs/animation.spec.ts`; в пустой `packages/server/package.json` — минимальный манифест `@xtc-toaster/server` (без него `bun install` падал); `bun.lock` пересобран, 180 тестов lib зелёные
- `e70ff51` — `docs/sprints/spec.md` и `docs/sprints/diagram.d2` (d2 компилируется)

## Подводные камни

- **GPG снова висел** — кеш агента остыл. Команда для своего терминала: `echo t | gpg --clearsign >/dev/null`. Постоянный фикс (pinentry-gnome3) предложен, не применён.
- **`git add` по пути уже застейдженного удаления** (`packages/web` нет на диске) падает с `pathspec did not match` — и если дальше по цепочке идёт `git add другого && git commit`, застейдженное уезжает не в тот коммит. Случилось, откатил `reset --soft` и пересобрал. Застейдженные удаления в `git add` не перечислять.
- `web:dev` в корневом `package.json` и сервис `web` в `docker-compose.yml` ссылаются на `@xtc-toaster/web`, которого сейчас нет — оживут, когда новый web заведётся под тем же именем.

## Остаток спринта 1

- `packages/contract`: zod-схемы + типы по `docs/sprints/spec.md`, `TOAST_GRAPH_VERSION`, `parseToastGraph`, `parseClientMessage`; unit-тесты на парсинг (валидный граф, без `edges`, чужая версия, мусор)
- `packages/server`: `Bun.serve` — `POST /api/images` (png/jpeg/webp, проверка декодированием, лимиты размера/мегапикселей — выбрать) + ws `render` → `rendered | render-error`
- серверный исполнитель графа: цепочка input → noize → output поверх `lib` (класс `Toast` из остатка 03.10), превью ≤1024 по длинной стороне
- новый `packages/web` на SvelteKit + `@xyflow/svelte`: три ноды, upload, превью, download png, ошибки; `toGraph()`
- stretch: слайдер noize, затем live-рендер
- из остатка 03.10 по-прежнему висят: per-pixel аллокации в hot loops, единицы `MaskParams`, `pivot`, удаление `test/lib-coverage` на origin
