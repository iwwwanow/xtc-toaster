# 2026-10-03 — статус Skia, разворот на спринт интерфейса, тесты и баги `packages/lib`

Сессия началась как ревизия: в каком состоянии нативный бэк на Skia и можно ли переключаться на интерфейс, не боясь, что код развалится. Закончилась полным покрытием `packages/lib` тестами и закрытием всех найденных багов.

## Skia: собрана, кода нет, путь окончательно — Skia

27.09 Skia склонирована сабмодулем в `packages/lib-native/vendor/skia` (ветка `chrome/m155`, shallow, ~316 МБ) и собрана двумя конфигами — оба release, clang, без шрифтов/PDF/SVG/ICU/jpeg/webp, png и zlib системные:

- `out/min` — только CPU-raster, `libskia.a` 17.6 МБ
- `out/vk` — плюс Vulkan + Graphite, `libskia.a` 22.4 МБ

Поверх ничего нет: ни `build.zig`, ни `src/`, ни C-ABI шима (`sk_capi`). `zig-out/bin/lib-native-smoke` от 06.09 — smoke ещё под libvips.

В ветке `feat/lib-native` лежало решение от 06.09 — Skia отменена из-за C++-шима, выбран libvips. Сегодня закрыто: **путь — Skia, ради GPU** ("в производительность рано или поздно упрёмся, это вопрос времени и приоритетов"), шим принимается как цена GPU-пути. `feat/lib-native` — архив, не мержим.

### Оценка Skia-пути (с Opus, часы активного времени)

- C++-шим (surface из буфера, draw с blend/opacity/matrix, blur, PNG decode/encode) — 2–3 ч
- линковка в `build.zig` — 1–4 ч, главный риск: Skia собрана системным clang против libstdc++, Zig по умолчанию тащит свой libc++ — ABI-конфликт
- smoke + сверка с golden из TS-тестов — 1–2 ч
- порт оркестрации и своей математики на Zig — 6–10 ч
- Bun FFI-слой + contract-test — 3–5 ч
- подключение к `Toast`, выкинуть node-canvas — 3–5 ч
- **итого паритет на CPU ≈ 16–29 ч**; GPU (Vulkan/Graphite) — ещё 8–16 ч

GPU-рисование Skia закрывает целиком. Часы уходят на обвязку: поднять Vulkan instance/device/queue и отдать Graphite, readback кадра из VRAM, и главное — своя математика (HSV-маски, hue-noise, lch-compose): на Zig/CPU она гоняет кадр GPU→CPU→GPU. Поэтому её стоит писать на SkSL — `docs/backlog/2026-10-03_sksl-for-custom-pixel-math.md`.

## Решение по спринту

1. Спринт интерфейса — на TS-функционале из master. Нативный бэк заморожен до конца спринта.
2. UI ↔ бэк через WebSocket-сервер с серверным рендером (`packages/server`, `Bun.serve`). Сервер говорит только с `Toast` — граница, за которой TS-рендер потом подменяется нативным без изменений в UI.
3. Превью в уменьшенном разрешении, полное — только на экспорт.
4. После обкатки интерфейса — замер задержки, переключение на бэк, ускорение.

## Профиль: `Matrix` — не главная проблема

Гипотеза из planning ("8.3 с/кадр из-за per-pixel `new Matrix`") не подтвердилась. Замер на 2048×1365: `lchHueCompose` 3.2 с, `addHueNoise` 1.8 с, blur r=8 0.8 с, affine 0.74 с, perspective 0.5 с, `alphaCompose` 0.49 с, `valueMask` 0.45 с. Общая причина — аллокация массивов на каждый пиксель во **всех** сервисах (`readPixel`/`readNormalizedPixel`, `rgbToLab`/`rgbToHsl` возвращают массивы, деструктуризация). В TS память вручную не управляется и не нужно — достаточно не создавать объекты в hot loop: матрицу разворачивать в 9 чисел до цикла, пиксель читать в локальные переменные. Проход по всем циклам ≈2–3 ч, делать уже под защитой тестов. Замер выше снят до фиксов — affine теперь идёт через путь гомографии, перемерить.

## Тесты и баги `packages/lib`

Аудит показал: 58 тестов были корректны, но всё, что реально использует toast-1 (perspective, blur, lch-hue, tint), не покрывалось вообще. Таблицы — `docs/backlog/2026-10-03_lib-test-audit.md`.

Сделано (влито в master, `1d5dd7d`):

- 180 тестов в 15 файлах, ~7 с. Unit — рядом с кодом, интеграционные/визуальные — в `packages/lib/tests/`.
- Фикстура `tests/fixtures/poppies.jpg` (250×359) прогоняется через каждый фильтр → `tests/output/filters/*.png` + `_contact-sheet.png` (все результаты на одном листе, шахматка под прозрачностью). `tests/output/` в `.gitignore`, каждый прогон чистит свою поддиректорию.
- Golden: рецепт toast-1 на фикстуре, sha256 кадров против `tests/__snapshots__/`. Рецепт скопирован (toast-1 — CLI с top-level side effects) — при изменении тоста копию обновлять руками.
- Infrastructure: PNG round-trip, ffmpeg (gif/mp4/loop/speed-up) → `tests/output/infrastructure/`.

Закрыто 8 багов (решения пользователя):

| Баг | Решение |
|---|---|
| `preserveAlpha` ни на что не влиял | опция удалена, alpha сохраняется всегда |
| серые пиксели в hue-маске 0° | вес маски × насыщенность пикселя |
| `tolerance: 0` → пустая маска | точное совпадение |
| `rotate` вокруг (0,0) + дыры forward mapping | affine через backward mapping (`applyHomographyTransform`), rotate/scale/skew вокруг центра |
| `lch-hue` с серым FG перекрашивал фон | сила × min(1, хрома FG / 20) |
| blur с тёмным ореолом | premultiplied alpha, промежуточный проход во float |
| `loopVideoTo` 3 с → 3.33 с | перекодирование вместо `-c copy` |
| `speedUpVideo` x2 давал не ту длину | `setpts=PTS/k,fps=source_fps` |

Golden-хэши обновлены только после попиксельной сверки старого и нового рендера (старый — через временный `git worktree` на прошлом коммите): ~5% пикселей, максимум ±2/255 — округление blur.

## Подводные камни

- **Ветки переключались параллельно с работой** (пользователь в lazygit, stash `stage`) — мой коммит с доками попал в `feat/lib-native` и успел уехать на origin; правка `planning.md` оказалась в stash, а дописка в дневник создала обрывок в чужой ветке. Перед коммитом — `git branch --show-current` и `git status`.
- **GPG-подпись из Claude** висит на `pinentry-curses`, если пароль не в кеше агента: проверять `echo t | timeout 5 gpg --clearsign`, при таймауте — попросить прогреть кеш в своём терминале. Записано в память.
- **Fontconfig errors** при прогоне тестов — системный `/etc/fonts/conf.d/48-guessfamily.conf`, на результат не влияют (canvas рисует подписи на контакт-листе).
- **VLC не открывает mp4** — не баг файлов (H.264 High, yuv420p, ffmpeg декодирует): в системе нет `vlc-plugin-ffmpeg`.
- **Golden при намеренном изменении**: сначала глазами `tests/output/pipeline/`, лучше — diff со старым рендером, потом `bun test --update-snapshots tests/pipeline.golden.test.ts`.

## Ветки

- `master` — всё сегодняшнее; `.gitignore` скрывает `packages/lib-native/vendor/` (чекаут сабмодуля вне его ветки) — убрать строку при мерже Skia
- `feat/lib-native-skia` — сабмодуль Skia (`.gitmodules` + gitlink `6cc992a`), незаконченная фича, в master не мержим
- `feat/lib-native` — libvips-каркас, архив
- `test/lib-coverage` — влита и удалена локально, на origin ещё висит

## Остаток

- Ускорение TS: убрать per-pixel аллокации во всех hot loops, замер до/после (≈2–3 ч, golden должен остаться бит-в-бит)
- `packages/server`: заполнить пустой `package.json`, WebSocket-сервер на `Bun.serve`
- Класс `Toast` в `packages/lib/application/` — граница для сервера
- Единицы `MaskParams` (`value` в градусах/процентах, `tolerance` 0–1) — решить до того, как маски попадут в UI
- Опциональный `pivot` в `Transform` — самый низкий приоритет
- Удалить `test/lib-coverage` на origin (по желанию)
