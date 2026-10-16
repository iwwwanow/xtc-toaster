# 2026-10-16 — спринт 2: sensor fit как в blender, переименование noize → hueNoise

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

## Остаток спринта 2

До 18.10 два дня: шаг 5 — export / import toast; сценарий DoD в docker compose. После `git switch` / merge при поднятом compose — `docker compose restart web`.
