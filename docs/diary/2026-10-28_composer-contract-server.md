# 2026-10-28 — composer: contract и server

Начали с вопроса «сегодня клиент?». По плану спеки среда действительно отведена под web, но в коде вторника не оказалось: на `feat/composer` от master отличался только docs-коммит `f013e3a`. 27.10 целиком ушёл на решения (лимит слоёв из env, копии на развилке, warnings в бэклог). Значит, отставание — день. Пользователь выбрал порядок по зависимостям: сегодня contract → server, web завтра. Весь план сдвинулся на день, сдвиг записан в status спеки. master (`1379253`, docs) запушен заодно.

## Contract (`92fb7ea`)

- Нода `composer`: `data.layers: [{ id, blendMode }]`, верхний слой первым, минимум одна строка. Уникальность `id` проверяется через zod `superRefine` — путь ошибки `nodes.i.data.layers.j.id`, так что ws по-прежнему находит ноду. `BLEND_MODES` лежит в `params.ts` рядом с `CHANNELS`. `INITIAL_DATA.composer` — две строки `normal` с id `layer-1` / `layer-2`: id уникальны только внутри ноды, поэтому фиксированных достаточно.
- `edge.targetHandle` — необязательное поле. Zod выкидывает лишние ключи, поэтому старые экспорты парсятся как раньше; на это есть тест.
- `validateGraph` вынесен в отдельный `validate.ts` и возвращает первую проблему `{ message, nodeId? }` или `null`. Сервер превращает её в `GraphError`, web завтра вызовет её из `isValidConnection` на графе-кандидате. Правила: дубли id, ровно один input и один output, ребро на несуществующую ноду, самосвязь, ребро в input или из output, handle только у строк composer и только из его `layers`, одна связь на handle, циклы. Циклы ищет DFS по всему графу, мёртвые ветки тоже.
- Пришлось задеть web: `INITIAL_DATA` питает левое меню, и `NODE_LABELS` с `satisfies Record<MenuNodeType, string>` перестал проходить typecheck. Добавил подпись `composer`. Теперь composer есть в меню, но рисуется дефолтной нодой xyflow без строк, пока нет своего компонента.

## Server (`bb041bb`)

- `toPath` удалён. На его месте два прохода:
  1. `ancestry()` — BFS назад от output. Считает, сколько связей забирает результат каждой ноды, и до загрузки картинки ловит структурные ошибки: нода на пути без входа → `connect the input to the output`, composer без подключённых строк → `link a layer`, превышен лимит слоёв. Порядок ошибок остался прежним: структура раньше `upload an image`.
  2. Рекурсивный `pull()` с памятью по `nodeId`. Пока остаются потребители, отдаёт копию буфера; последний получает оригинал, и запись из памяти удаляется.
- По ребру идёт `Flow = { data, opacity }`. Каждая обычная нода оборачивает буфер в слой одноразовой `Composition` и применяет к нему `applyNode`. Opacity копится по цепочке, как раньше, и запекается в composer (`setOpacity` на слое) или в output.
- Подводный камень: сначала написал `return { data: layer.imageData, opacity: applyNode(...) }`. Свойства литерала вычисляются по порядку, и `data` брал буфер **до** операции. Нашёл при чтении кода, исправил ещё до тестов.
- Composer обходит `layers` снизу вверх, неподключённые строки пропускает, ставит `setBlendMode` у каждой строки (у нижней lib его игнорирует) и возвращает `render()` с opacity 1. Вложенный composer работает без особого случая.
- `RENDER_MAX_LAYERS` идёт по цепочке env → `ServerOptions.maxLayers` → `createWsHandler` → `RenderRequest` → worker → `runGraph(graph, dir, maxLayers)`. Значение по умолчанию — `RENDER_MAX_LAYERS_DEFAULT = 4`. Лимит считается суммой по всем composer в порядке BFS, поэтому при вложенности ошибка указывает на внутренний composer, когда переполнение происходит на нём.
- `positive()` в `index.ts` теперь считает пустую строку незаданной (`||` вместо `??`): dev compose передаёт `${RENDER_MAX_LAYERS:-}`. Это касается и `UPLOADS_*`. Мусор в значении по-прежнему роняет старт, проверил вручную.
- Тесты `run-graph.test.ts` переписаны на настоящий `runGraph`: poppies копируется в `tests/output/run-graph/<uuid>`, результат сравнивается через `Bun.hash`. Проверены структура, развилка, порядок строк, три blend mode, запекание opacity (белый на 0.5 даёт середину ±1), неподключённая строка, одна нода в обе строки, вложенность и лимит. Мутационная проверка: если убрать копию на развилке, падают 5 тестов. Плюс два ws-теста в `tests/server.test.ts`. Ловушка: `expect(promise).rejects` без `await` в bun молча проходит — расставил `await`.
- Документация: env описана в `CLAUDE.md`, `.env.example` и `docker-compose.yml`. В prod compose (`iwwwanow_infrastructure`) переменную не добавляли — значения 4 хватает до замера.

## Web (в тот же день, после /wrap)

Пользователь попросил после wrap сразу взяться за клиент, так что web сделан в тот же день, и отставание по плану ушло.

- `ComposerNode.svelte`: у каждой строки свой target handle, `id` handle совпадает с `layer.id`. Handle лежит внутри строки с `position: relative` и сдвинут `left: calc(-0.75em - 4px)` на край ноды: padding fieldset + рамка. Кнопка `+ layer` добавляет строку сверху. Подпись `layer N` позиционная, нижняя строка — 1. Select нижней строки выключен, в `title` объяснение, почему. `×` выключен, когда строка одна. После любого изменения строк вызывается `useUpdateNodeInternals` через microtask, иначе xyflow не перемеряет handle.
- Reorder — HTML5 drag & drop за `⠿`, со своим mime. На строках стоит `nodrag`, drop делает `stopPropagation`, чтобы не задеть drop нод из меню в Editor. Уложились без кнопок `↑` / `↓`.
- Чистые функции в `composer.ts`: add / remove / move / setBlendMode, `removeLayerEdges`. Id новой строки — первый свободный `layer-N`.
- `graph.ts`: `toGraphEdge` выкидывает xyflow-ный `targetHandle: null`. Раскладка: колонка — самый длинный путь от input (раунды по фронту, ограничены числом нод, так что цикл не вешает). Колонка складывается сверху вниз, недостижимые ноды идут рядом ниже. `canConnect` = `validateGraph` на графе-кандидате без zod. `withoutTaken(edges, link, keep?)` освобождает handle.
- Editor: `isValidConnection` → `session.canConnect`. `onbeforeconnect` / `onbeforereconnect` освобождают занятый handle (у reconnect сама перетаскиваемая связь остаётся). Импорт тоже прогоняется через `validateGraph`.
- Проверено в headless chrome + CDP (dev server + vite локально, compose не поднимали), со скриптом в scratchpad. Импорт toast с развилкой, tint → opacity → верхняя строка: картинка верная. Смена blend mode пересчитывает картинку. Перетаскивание строки меняет handle местами, связи едут за строками, картинка меняется. Настоящей мышью: связь на занятую строку заменяет старую, связь composer → tint (цикл) отклонена. `×` убирает строку и её связь, `+` добавляет `layer-3`.
- Мелочь: на раскладке импорта ребро input → composer проходит за нодой tint. Визуально выглядит, будто оно идёт от tint. Не правили.

## Что дальше

- 29.10: QA-лист `docs/sprints/sprint-4.qa.md` руками в dev compose; замер composer на 4 / 7 строк на 2 МП под лимитами прода (`read_only`, 512m, `cpu_shares: 256`) → prod `RENDER_MAX_LAYERS` (в `iwwwanow_infrastructure`); merge → `0.5.0` → DoD-сценарий на проде
- 30.10: uiu (ветка `feat/uiu`) — план из спеки снова на своём месте, день отыгран
- потом stretch по списку спеки (быстрые фиксы сестры, degas t=0 как граф)
