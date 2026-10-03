# Планирование

## Спринт интерфейса (текущий фокус, с 2026-10-03)

Интерфейс делаем на текущем TS-функционале из master, нативный бэк заморожен до конца спринта. Подробности — `docs/diary/2026-10-03_skia-status-and-interface-sprint.md`.

- [ ] Фикс per-pixel аллокаций `Matrix` (пункт 4d ниже) — в начале спринта, влияет на отзывчивость превью
- [ ] `packages/server` — WebSocket-сервер на `Bun.serve` с серверным рендером: клиент шлёт параметры тоста, сервер отвечает картинкой (сейчас там пустой незакоммиченный `package.json`)
- [ ] Сервер говорит только с `Toast` (пункт 7 ниже) — граница, за которой TS-рендер потом подменяется нативным без изменений в UI
- [ ] Превью в уменьшенном разрешении, полное — только на экспорт
- [ ] `packages/web` — подключить к серверу вместо собственной hue-логики в `+page.svelte`
- [ ] После обкатки — замер задержки рендера, переключение на бэк (пункт 4)

## DDD-lite → Zig+Skia перенос domain-части (`packages/lib`)

**Заморожено на время спринта интерфейса.** Skia собрана 2026-09-27 (`vendor/skia/out/min` — CPU, `out/vk` — Vulkan+Graphite), сабмодуль — в ветке `feat/lib-native-skia`, кода поверх нет. **Открытое противоречие:** в ветке `feat/lib-native` лежит решение от 2026-09-06 (libvips, фаза 1, без C++-шима; Skia отменена из-за шима) — выбрать путь при возврате к бэку. Оценка Skia-пути — ≈16–29 ч до паритета на CPU, +8–16 ч на GPU; для GPU-пути см. `docs/backlog/2026-10-03_sksl-for-custom-pixel-math.md`.

Полный контекст решений: `docs/diary/2026-08-28_ddd-lite-go-ffi-planning.md`, `docs/diary/2026-08-29_domain-spec-review.md`, `docs/diary/2026-08-29_domain-ts-implementation.md`, `docs/diary/2026-08-31_render-stack-architecture-decision.md`. Спека — `docs/specs/domain.spec.ts`. Финальная архитектура — `docs/backlog/2026-08-31_final-render-export-stack-architecture.md` (отменяет более ранний план на libvips, `docs/backlog/2026-08-30_sharp-libvips-integration.md`).

- [x] 1. Довести `docs/specs/domain.spec.ts` до состояния "готово к реализации"
- [x] 2. Ревью спецификации, подбить детали
- [x] 3. Написать домен на TS в `packages/lib/domain/` (Color, utils, domain-services, Layer, Composition) с unit-тестами на composers/maskers/transform — фикстуры переиспользуются как golden-values для Zig-порта
- [ ] 4. Перенос домена — **не 1:1 порт всего в Zig**, а разделение: пиксельный низкий уровень (blur, affine/perspective resample, normal/add blend) → **Skia**; оркестрация (Layer/Composition) и уникальная математика без готового Skia-аналога (HSV-маска с falloff, hue-noise, lch-hue compose, решение гомографии по 4 точкам) → **Zig**. Полная инвентаризация по платформам — `docs/diary/2026-08-31_render-stack-architecture-decision.md`
  - [ ] 4a. Спецификация нужных методов Skia + FFI-ручек Bun, с юз-кейсами (готовит пользователь руками)
  - [ ] 4b. Схемы границ Bun/Zig/Skia/ffmpeg
  - [ ] 4c. Рефакторинг текущей структуры `packages/lib/domain/services/` под новую архитектуру — делать **до** переноса, не одновременно
  - [ ] 4d. Профилировать и убрать per-pixel аллокации `Matrix` в `transforms.ts` (`applyAffineTransform`/`applyHomographyTransform`) — вероятная причина ~8.3 сек/кадр на рендере от 2026-08-30; актуально до переноса, снимется архитектурно после (Zig не аллоцирует так в hot path)
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
