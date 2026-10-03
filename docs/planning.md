# Планирование

## Спринт интерфейса (текущий фокус, с 2026-10-03)

Интерфейс делаем на текущем TS-функционале из master, нативный бэк заморожен до конца спринта. Подробности — `docs/diary/2026-10-03_skia-status-and-interface-sprint.md`.

- [x] Добить тесты `packages/lib` до покрытия всех фильтров + golden-тест кадра toast-1 — **до** любой оптимизации hot loops. Аудит и список дыр/багов — `docs/backlog/2026-10-03_lib-test-audit.md`. Сделано (влито в master 2026-10-03): 180 тестов, визуальный прогон фикстуры по каждому фильтру в `packages/lib/tests/output/`
- [x] Баги из аудита (`docs/backlog/2026-10-03_lib-test-audit.md`) закрыты 2026-10-03 (влито в master): `preserveAlpha` удалён, hue-маска взвешивается по насыщенности, `tolerance: 0` = точное совпадение, affine через backward mapping вокруг центра (без дыр), `lch-hue` масштабируется по хроме FG, blur premultiplied, `loopVideoTo`/`speedUpVideo` дают точную длину
- [ ] Ускорение TS: убрать per-pixel аллокации во **всех** hot loops (не только `Matrix`) — `lchHueCompose` 3.2 с, `addHueNoise` 1.8 с на 2K-кадре; `Matrix`-трансформы всего 0.5–0.7 с (пункт 4d ниже, ≈2–3 ч на весь проход)
- [ ] `packages/server` — WebSocket-сервер на `Bun.serve` с серверным рендером: клиент шлёт параметры тоста, сервер отвечает картинкой (сейчас там пустой `package.json`)
- [ ] Сервер говорит только с `Toast` (пункт 7 ниже) — граница, за которой TS-рендер потом подменяется нативным без изменений в UI
- [ ] Превью в уменьшенном разрешении, полное — только на экспорт
- [ ] `packages/web` — подключить к серверу вместо собственной hue-логики в `+page.svelte`
- [ ] После обкатки — замер задержки рендера, переключение на бэк (пункт 4)

## DDD-lite → Zig+Skia перенос domain-части (`packages/lib`)

**Заморожено на время спринта интерфейса.** Skia собрана 2026-09-27 (`vendor/skia/out/min` — CPU, `out/vk` — Vulkan+Graphite), сабмодуль — в ветке `feat/lib-native-skia`, кода поверх нет. **Путь — Skia** (решено 2026-10-03): решение от 2026-09-06 в ветке `feat/lib-native` (libvips, без C++-шима) отменено — вернулись к Skia ради GPU, в производительность рано или поздно упрёмся; C++-шим принимается как цена GPU-пути. Оценка Skia-пути — ≈16–29 ч до паритета на CPU, +8–16 ч на GPU; для GPU-пути см. `docs/backlog/2026-10-03_sksl-for-custom-pixel-math.md`.

Полный контекст решений: `docs/diary/2026-08-28_ddd-lite-go-ffi-planning.md`, `docs/diary/2026-08-29_domain-spec-review.md`, `docs/diary/2026-08-29_domain-ts-implementation.md`, `docs/diary/2026-08-31_render-stack-architecture-decision.md`. Спека — `docs/specs/domain.spec.ts`. Финальная архитектура — `docs/backlog/2026-08-31_final-render-export-stack-architecture.md` (отменяет более ранний план на libvips, `docs/backlog/2026-08-30_sharp-libvips-integration.md`).

- [x] 1. Довести `docs/specs/domain.spec.ts` до состояния "готово к реализации"
- [x] 2. Ревью спецификации, подбить детали
- [x] 3. Написать домен на TS в `packages/lib/domain/` (Color, utils, domain-services, Layer, Composition) с unit-тестами на composers/maskers/transform — фикстуры переиспользуются как golden-values для Zig-порта
- [ ] 4. Перенос домена — **не 1:1 порт всего в Zig**, а разделение: пиксельный низкий уровень (blur, affine/perspective resample, normal/add blend) → **Skia**; оркестрация (Layer/Composition) и уникальная математика без готового Skia-аналога (HSV-маска с falloff, hue-noise, lch-hue compose, решение гомографии по 4 точкам) → **Zig**. Полная инвентаризация по платформам — `docs/diary/2026-08-31_render-stack-architecture-decision.md`
  - [ ] 4a. Спецификация нужных методов Skia + FFI-ручек Bun, с юз-кейсами (готовит пользователь руками)
  - [ ] 4b. Схемы границ Bun/Zig/Skia/ffmpeg
  - [ ] 4c. Рефакторинг текущей структуры `packages/lib/domain/services/` под новую архитектуру — делать **до** переноса, не одновременно
  - [ ] 4d. Профилировать и убрать per-pixel аллокации `Matrix` в `transforms.ts` (`applyAffineTransform`/`applyHomographyTransform`) — **гипотеза не подтвердилась** (замер 2026-10-03, 2048×1365: affine 0.74 с, perspective 0.51 с, при `lchHueCompose` 3.2 с и `addHueNoise` 1.8 с) — `Matrix` даёт ~10–15% кадра, основная цена — аллокации массивов на пиксель во всех сервисах (`readNormalizedPixel`, `rgbToLab`/`rgbToHsl` возвращают массивы), см. задачу ускорения в спринте; актуально до переноса, снимется архитектурно после (Zig не аллоцирует так в hot path)
- [ ] 5. Биндинг-слой (`packages/lib/infrastructure/ffi/*.binding.ts`, handle-паттерн, contract-test на рассинхрон сигнатур) — граница Bun↔Zig; список экспортируемых функций — там же в диневнике
- [ ] 6. Bun-инфра (dev-loop через `watchexec`, package setup для `lib-native` — Zig-пакет вне npm-воркспейса, собирается в `.so`/`.dylib`)
- [ ] 7. TS-класс `Toast` в `packages/lib/application/` — единая точка управления: импорт/экспорт/анимация/рендер статики. Заменяет более ранний план "переписать тосты под `bake(layer, ...)`"
- [ ] 8. Инициализировать `package.json` для `packages/lib` + настроить GitHub Actions на сборку npm-пакета — низкий приоритет, делать последним (после того как есть что собирать)

### Реальный техдолг (не блокирует перенос)

- [ ] Вынести `CanvasRenderer` отдельно от `Composition` — легаси мешает DOM/canvas-код с доменной логикой
- [ ] `animation.spec.ts` / `segmentation.spec.ts` — не проработаны, следующая итерация (mosaic-segment вне скоупа)
- [ ] `valueMask` — рассмотреть замену квадратичного спада на Гауссов (`exp(-t²/0.5)`)
- [ ] Превью в терминале не работает внутри Zellij — `docs/backlog/2026-08-30_zellij-kitty-graphics-protocol.md`
- [ ] Заменить `node-canvas` (decode/encode изображений) на Skia (`SkCodec`/encoders через Zig) — решено 2026-09-06, не заводим вторую нативную зависимость на ту же задачу. `imageFileToRawData`/`rawDataToImageFile` переезжают в `lib-native` вместе с остальным Skia-путём

### Самый низкий приоритет

- [ ] Опциональный `pivot: {x, y}` в `Transform` для rotate/scale/skew (по умолчанию — центр кадра, как сейчас). Точка расширения помечена комментарием у `getAffineMatrix` в `packages/lib/domain/services/transforms.ts`
