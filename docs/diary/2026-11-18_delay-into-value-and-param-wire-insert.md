# 2026-11-18 — delay в value и delay в разрыв провода параметра

Две правки по скриншоту пользователя, сделаны прямо в master как патч: `8aa2348c fix: a delay links into a value / factor and drops onto a param wire` → `v0.11.1`.

## delay → value / factor

Провод из строки delay в value не вешался. Это был не баг, а явный запрет контракта (`paramLinkIssue`: «a delay shifts a track's time, they have none»), с тестом «rejects a delay row into it». Но смысл у такой связи есть, если value анимирован: параметр берёт его число на `frames` кадров позже. Для неанимированного value сдвиг ничего не меняет.

- `validate.ts` — запрет снят; delay по-прежнему не идёт в пиксельный вход. Петля через delay (`v → delay → v2 → v`) отказывается общей проверкой на цикл — тест добавлен.
- `animation.ts`, `driverValues` — связи в драйвер разрешаются через `paramSources` (параметр за всеми delay + суммарный сдвиг). Драйвер читается на `frame − shift`: `give(id, bounds, at)` и цепочка `value → delay → value` тоже сдвигает `at`. Треки на другом кадре берутся через `animatedAt` в `drivenValues` — кэш по кадру, `animatedValues` на каждый нужный кадр один раз.
- `seedValue` в `session.svelte.ts` — параметр, пришедший в пустой value через delay, отдаёт ему число параметра за delay (`paramOf`), а не `null`.
- Сервер берёт `graphAtFrame` из контракта — gif-экспорт сдвиг учитывает без правок.

## delay в разрыв провода параметра

Раньше `insertOnLink` знал только пиксельные провода, delay туда не пускался. Теперь в `web/src/graph.ts` два пути: `throughPixels` (как было) и `throughDelay` — провод параметра `A.param → B` становится `A.param → delay:<row> → B` через первый ряд delay, не занятый ни входом, ни выходом. Работает и с панели, и перетаскиванием готовой ноды; у delay, уже несущего параметры, занимается его свободный ряд, `withFreeRow` в `DelayNode` добавляет следующий. Свободного ряда нет — провод не подсвечивается. Провода параметров тоже bezier (`LinkEdge`), так что `linksUnder` их видит.

value / factor в разрыв провода параметра не ставятся: смысл поменялся бы (трек стал бы анимировать value). Пользователю сказано, можно добавить по просьбе.

## Проверено

- Typecheck всех пакетов, `bun run test`: contract 247, lib 190, toasts 8, web 225, server 130 — всё зелёное. Новые тесты: contract — delay → value со сдвигом, value → delay → value, валидация (принят, петля через delay отказана); web — `insertOnLink` для delay на провод в трек, в value, занятый/полный delay.
- Локально сначала падали arrange и favicon: не были установлены `elkjs` / `sharp`. После `bun install` прошли.
- Release CI на master зелёный, тег `v0.11.1`. Прод обновляет renovate сам.
- **В браузере не проверял** — ни связь delay → value, ни бросок delay на провод.

## Подводный камень

Версию прода я назвал по тексту docs-коммита («prod on v0.10.0»), а мерж `feat/groups` уже выпустил `v0.11.0`. Версию смотреть по `git tag`.

## На завтра

- Руками в браузере: animated value → delay → param (параметр отстаёт на `frames`), delay на провод `param → track` и `param → value`, undo одним шагом. Хорошо бы тестовый тост в `tests/toasts/` со строкой в README.
- Delay внутри группы по-прежнему запрещён (`NOT_IN_A_GROUP`, «нет animation, не к чему подключить»). Теперь delay может кормить value, который стоит внутри группы, — запрет можно пересмотреть, если пользователь захочет.
- Остальное по плану спринта 6: тестирование результата, QA по `docs/sprints/sprint-*.qa.md`.
