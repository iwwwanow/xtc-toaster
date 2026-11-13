# 2026-11-11 — ноды value и factor

Первая часть пункта «groups + value» (`docs/planning.md`, спринт 5). Идея и решения — `docs/backlog/2026-11-09_node-groups-variables.md`, разделы 10.11 и 11.11. Ветка `feat/value` от master (после слияния `feat/undo-redo`, `v0.10.0`).

## Решения (с пользователем, 11.11)

- **Направление — `param → value`.** Провод идёт от параметра к тому, что его задаёт, как `param → track` и `param → delay → track`. Обратное направление дало бы параметрам входящие провода, а для контракта и ui это новый механизм.
- **Число сырое**, как Value в blender: каждый параметр берёт его как есть и обрезает по своим границам. Диапазон поля −1000…1000, шаг 0.01: тянуть грубо, точное значение — вводом.
- **Доля 0–1 — отдельная нода `factor`**, не режим value: число в value всегда значит одно и то же. Порядок: value → factor → группы.

## Как сделано

- **Контракт.** `PARAMS.value.value` (−1000…1000, начальное 0). Поэтому value автоматически стала типом меню, `createNode` её создаёт, а её число — обычный числовой параметр: его можно вести в дорожку, через delay, в другую value. `ValueNodeSchema` (`{ value }`).
- **`validateGraph`.** Принимает `param → value` в безымянный вход, много проводов в один вход (правило «one link per input» для value не действует). Отказывает пиксельному проводу в value и из неё, проводу в именованный handle, нечисловому параметру, строке delay → value (у value нет своего времени, которое delay мог бы сдвинуть). Один параметр ведёт в одно место: дорожка, delay или value, не в две. Петлю value → value ловит общая проверка циклов. Текст ошибки «a param links only into the animation node» стал «… into a track, a delay or a value».
- **Значения на кадре — `drivenValues(graph, frame)`** в `animation.ts` контракта: сначала дорожки (`animatedValues`), потом value. Анимированная value двигает все свои параметры, value → value отдаёт число последней в цепочке. Работает и без ноды animation: статичный рендер тоже получает число. `graphAtFrame` теперь на `drivenValues`. `animatedValues` остаётся только про дорожки: на нём `hasAnimatedParams` (кнопка экспорта), и анимированная value туда попадает.
- **Сервер.** В `run-graph.ts` value только сужает тип, как delay: на пути пикселей её нет, число уже в параметрах (`graphAtFrame` в экспорте). Статичный рендер получает от web граф кадра без value.
- **Web.**
  - `withoutAnimation` выкидывает и value: в рендер уходит граф кадра без неё, значит, смена числа рендерит только через изменившиеся параметры.
  - `withoutTaken`: параметр в безымянный вход (это может быть только value) не вытесняет уже подключённые, но сам параметр уходит со старого места, как с дорожки.
  - Слайдеры: `session.animatedValue` теперь на `drivenValues`, так что поле параметра под value показывает её число и заблокировано, в подсказке «set by a value node» (`session.valueDriven`).
  - `ValueNode.svelte`: вход слева (пунктирные провода параметров), поле `value` с handle справа — в дорожку или другую value.
  - Посев: первый параметр, подключённый к пустой value, отдаёт ей своё значение (`session.seedValue` в `onbeforeconnect` / `onbeforereconnect`). Картинка не прыгает, как с первым ключом дорожки. Это тот же шаг истории, что и провод.
  - Меню: своя группа `value` (позже туда же factor), подсказка «one number for every param wired into it».
- Тестовый тост `tests/toasts/value.json` (строка в README).

## Проверено

- Typecheck всех пакетов. Тесты: contract 208 (+20: валидация value, `graphAtFrame` с обрезкой по границам, без animation, анимированная value, value → value), server 129 (+1: параметр через value рендерится как со значением), web 190 (+6: второй параметр не вытесняет первый, тот же параметр переезжает, пиксельный провод отклонён и value → value принимается, меню; `withoutAnimation` выкидывает value; `value.json` проходит импорт), lib, toasts зелёные.
- Headless Chrome (скрипт `value.ts` в scratchpad сессии):
  - `?toast=value`: на кадре 0 `move.x`, `skew.x`, `rotate.angle` = −40, поля заблокированы, подсказка «set by a value node»; у самой value — «animated». `move.y` подключён к value — добавился, остальные провода на месте, `y` = −40. Undo вернул. Пиксельный провод от выхода move на вход value отклонён;
  - `?toast=more-nodes`: value из меню (синтетический DragEvent) — 0; `skew.x` (15) подключён — value стала 15. Один Ctrl+Z убрал и провод, и число.
- Экспорт gif с анимированной value руками и в браузере не гонял. Путь покрыт тестами: `graphAtFrame` + `runGraph` на сервере.

## Подводные камни

- На `?toast=value` value после раскладки наезжает на output: высота output меряется до загрузки картинки. Это то же, что в `2026-11-10_delay-node.md`, value ни при чём.
- Тянуть поле value по диапазону ±1000 грубо (пиксель ≈ 13, с Shift ≈ 1.3). Точное значение — вводом. Так решено. Если в руках будет неудобно, можно сделать шаг перетаскивания не от диапазона.

## Factor (в тот же день, следом)

- **Что делает.** Подключается так же, как value: `param → factor`, много параметров в один вход. Параметр берёт `min + factor · (max − min)` своего диапазона, factor 0…1 (начальное 0.5). Поэтому вместе двигаются параметры в разных единицах: на 0.25 rotate −90, blur 5, opacity 0.25.
- **Контракт.** `FactorNodeSchema`, `PARAMS.factor.factor`, тип `DriverNode = ValueNode | FactorNode` и `isDriver` в `graph.ts`. Все правила `validateGraph` для value стали правилами для обеих нод. В `animation.ts` `driverValues` вместо разбора одной value: `give(driver, bounds)` — что нода отдаёт параметру с такими границами (value — число с обрезкой, factor — доля диапазона). Если сама нода подключена к другой, её собственный параметр берёт то, что та отдаёт его границам, и передаёт дальше. Value → factor даёт число, обрезанное до 0…1; factor → value — долю от ±1000. Собственный параметр у обеих называется как тип (`value.value`, `factor.factor`), отсюда `paramBounds(type, type)`.
- **Web.** `FactorNode.svelte` (копия `ValueNode` с полем `factor`, шаг 0.01). Меню: группа `value` — `value`, `factor`. Подсказка поля параметра: «set by a value node» / «set by a factor node» (`session.driverOf`). Посев: первый параметр, подключённый к пустому factor, отдаёт ему своё место в диапазоне (`(v − min) / (max − min)`), картинка не меняется. `withoutAnimation` выкидывает обе ноды (`isDriver`).
- **Проверено.** Contract 213 (+5: доля диапазона, концы 0 / 1, анимированный factor, value ↔ factor, валидация), web 192 (+2), server 129. Headless Chrome (`factor.ts` в scratchpad): `?toast=factor` на кадре 0 — angle 0 / radius 10 / opacity 0.5, поля заблокированы с «set by a factor node»; на `end` — 180 / 20 / 1. Factor из меню — 0.5; `skew.x` = 15 (−60…60) подключён — factor 0.625, skew остался 15. Один Ctrl+Z убрал провод и вернул 0.5. Тестовый тост `tests/toasts/factor.json`.

## Остаток

- Руками пользователь не смотрел, строки QA — `tests/toasts/README.md` (`value`, `factor`).
- Ветка `feat/value` не слита и не запушена.
- Дальше: группы (`docs/backlog/2026-11-09_node-groups-variables.md`, v1 согласован 10.11). Value / factor внутри группы удобно выводить наружу как один параметр.
