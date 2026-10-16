# 2026-10-16 — спринт 2: sensor fit как в blender, noize → hueNoise, экспорт / импорт тоста

Две правки, которые меняют смысл файла тоста, поэтому их нужно было сделать до экспорта / импорта (шаг 5). Обе смержены в `master` через `--no-ff`, не запушены.

## FocalLength: 36 мм по большей стороне (sensor fit Auto)

Вчера `focalLength` перевели в мм (эквивалент 35 мм), но сервер всегда считал `px = mm / 36 * width`. Blender по умолчанию (sensor fit Auto) кладёт 36 мм сенсора на большую сторону кадра — на портретной картинке у нас перспектива выходила сильнее, чем у того же объектива в blender. Пользователь решил делать как в blender.

Ветка `feat/y-rotation-sensor-fit-auto`. На сервере пересчёт вынесен в чистую `focalLengthPx(mm, { width, height }) = mm / 36 * max(width, height)` в `run-graph.ts`, юнит-тест на альбомную, портретную и квадратную картинку. lib и contract не тронуты (в `params.ts` только комментарий), границы 10–300 мм и старт 50 те же.

Интеграционный тест пришлось пересчитать: poppies — 250 × 359, то есть портрет. При 30° ближний край уходит в прозрачность, когда f больше ~467 px. 50 мм по ширине давали 347 px (край непрозрачный, вчерашний тест `[255, 255, 0]`), по высоте — 499 px, край стал прозрачным: `[0, 255, 0]`. Этот случай теперь и есть различающий тест («portrait: 50 mm spans the height»), а «ближний край заполняет кадр» переехал на 35 мм (349 px). Проверено мутацией: если вернуть `* width`, падают оба новых теста — юнит и интеграционный.

Следствие для пресета toast-2 (50 мм): на портретных картинках перспектива стала мягче, чем вчера.

## Переименование noize → hueNoise

По плану из `docs/backlog/2026-10-15_rename-noize-to-hue-noise.md`, ветка `refactor/rename-noize-to-hue-noise`. Тип переименован во всех слоях: lib (`EffectParams`, `Layer.applyEffect`, тесты), contract (`HueNoiseNodeSchema`, `HueNoiseNode`, `PARAMS.hueNoise`), server (`run-graph.ts` и тесты), web (`NoizeNode.svelte` → `HueNoiseNode.svelte` через `git mv`, `nodes/index.ts`, `NODE_LABELS`), пресет `toast-2_signac/toast.json`, спеки `docs/specs/domain.spec.ts` и `lib.spec.md`, CLAUDE.md. Id узлов `nz` в тестах и пресете оставлены — это просто id. `TOAST_GRAPH_VERSION` не поднимали: сохранённых файлов тостов ещё нет. Исторические записи в старых статусах спринтов не правил.

Подводный камень: zsh не разбивает `$files` на слова, поэтому `sed -i … $files` получил одну длинную строку вместо списка файлов. Повторил через `xargs`.

## Тесты

`bun run typecheck` зелёный; lib 181, contract 27, server 37, toasts 3, web 12 — зелёные. В браузере не проверял (compose не поднят) — web покрыт typecheck и тестами `toFlow` / `toGraph` от пресета.

## Экспорт / импорт тоста (шаг 5)

Ветка `feat/toast-export-import`, смержена `--no-ff`. Перед этим `master` запушен.

Чистая логика в `web/src/graph.ts`, рядом с `toFlow` / `toGraph`:

- `toToastFile(nodes, edges)` — `toGraph` (ui-поля xyflow отбрасываются), у input `imageId: null`, json с отступами, чтобы файл можно было читать и править руками. В коде комментарий со ссылкой на `docs/backlog/2026-10-13_toast-export-with-image.md` — сохранять ли картинку, пока открыто.
- `fromToastFile(text, imageId)` — `JSON.parse` + `parseToastGraph`, плюс то, на что опирается редактор и чего схема не проверяет: ровно один input и один output, уникальные id узлов. Без этой проверки файл без input ломал бы ui: загрузка картинки ни к чему бы не применялась. В input подставляется текущая картинка — тост это пресет, его применяют к уже загруженной картинке. Раскладка заново через `toFlow`. Ошибки — `ToastFileError` с коротким текстом для ui («not a json file», «not a toast file», «a toast needs exactly one input and one output», «duplicate node id»), подробности zod — в `console.error`.

`Session.exportToast()` сохраняет через `saveBlob` + `outputFileName(TOAST, "json")`. `Session.importToast(file)` подменяет `nodes` / `edges`, ошибка лежит в `importError`. В `ActionsPanel` две кнопки под download png. Import открывает скрытый `<input type="file" accept="application/json,.json">`. Значение input сбрасывается сразу, чтобы тот же файл можно было выбрать ещё раз (например, поправив его после ошибки). После удачного импорта — `fitView({ maxZoom: 1 })`: в `@xyflow/svelte` 1.7 он сам ждёт замера новых узлов (`fitViewQueued`). Кнопки export и import не блокируются при `locked`: экспорту не нужен сервер, а импорт во время рендера отработает через latest-wins.

`TOAST_GRAPH_VERSION` проверяется схемой (`z.literal(1)`), поэтому файл версии 2 сейчас просто «not a toast file». Отдельное сообщение и миграции понадобятся, когда версия впервые поднимется.

Тесты web (+10): экспорт без картинки и без ui-полей равен пресету; круг экспорт → импорт сохраняет граф, а картинка остаётся в input; импорт раскладывает узлы так же, как `toFlow`; семь отказов с текстом для ui.

Проверено headless Chrome (CDP) в docker compose. Картинка загружается через `DEBUG_IMAGE`. Экспорт скачивает `toast-2_signac_20261016-185626.json` с `imageId: null`. Импорт `input → hue mask → y-rotation → output` пересобирает граф, рендер приходит. Импорт `{"version":1,"nodes":[],"edges":[]}` показывает «a toast needs exactly one input and one output». Повторный импорт выгруженного файла возвращает пресет и стирает ошибку. В консоли ошибок нет. Сценарий DoD руками (собрать граф мышкой, download png) не прогонял — это за пользователем.

## Тесты

`bun run typecheck` зелёный; lib 181, contract 27, server 37, toasts 3, web 22 — зелёные.

## Закрытие спринта 2

Пользователь прошёл сценарий DoD руками в браузере по короткому QA-списку и подтвердил: «ок». Список: загрузка картинки; удаление нод, при этом input / output не удаляются; drag & drop из меню; связь `input → hue mask → y-rotation → output`; слайдеры; unlink двумя способами; несвязанная нода не влияет на рендер; ошибка при двух связях в одну ноду; `Controls` / `Background`; download png; export toast; импорт после перезагрузки страницы; ошибка импорта на не-json. Все пункты DoD закрыты 16.10, на два дня раньше срока. Stretch (blur, saturation / value mask, isolateChannel, translate / rotate / scale) не начинали — он остаётся под критерий готовности «все текущие фильтры бэкенда».

Дальше — спринт 3 (19.10–25.10): хостинг, публичный доступ, пользовательский тест.
