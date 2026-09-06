# Планирование

## DDD-lite → Zig+Skia перенос domain-части (`packages/lib`)

Полный контекст решений: `docs/diary/2026-08-28_ddd-lite-go-ffi-planning.md`, `docs/diary/2026-08-29_domain-spec-review.md`, `docs/diary/2026-08-29_domain-ts-implementation.md`, `docs/diary/2026-08-31_render-stack-architecture-decision.md`. Спека — `docs/specs/domain.spec.ts`. Финальная архитектура — `docs/backlog/2026-08-31_final-render-export-stack-architecture.md` (отменяет более ранний план на libvips, `docs/backlog/2026-08-30_sharp-libvips-integration.md`).

- [x] 1. Довести `docs/specs/domain.spec.ts` до состояния "готово к реализации"
- [x] 2. Ревью спецификации, подбить детали
- [x] 3. Написать домен на TS в `packages/lib/domain/` (Color, utils, domain-services, Layer, Composition) с unit-тестами на composers/maskers/transform — фикстуры переиспользуются как golden-values для Zig-порта
- [ ] 4. Перенос домена — **не 1:1 порт всего в Zig**, а разделение: пиксельный низкий уровень (blur, affine/perspective resample, normal/add blend) → **libvips** (Фаза 1, CPU); оркестрация (Layer/Composition) и уникальная математика без готового аналога (HSV-маска с falloff, hue-noise, lch-hue compose, решение гомографии по 4 точкам) → **Zig**. GPU (Фаза 2) — отдельный decoupled трек, не блокирует доставку, см. 4e. Полная инвентаризация по платформам — `docs/diary/2026-08-31_render-stack-architecture-decision.md`; обоснование выбора libvips вместо Skia — `docs/backlog/2026-09-06_gpu-render-stack-skia-alternatives.md`
  - [x] ~~4a-0. Спайк: достать рабочий libskia~~ — **тупиковая ветка, закрыта 2026-09-06**. Рабочий бинарник добыт (`rust-skia/skia-binaries`, GPU-бэкенд Vulkan+GL подтверждён `nm`), но путь требовал написания C++-шима (`sk_capi` в дропе нет) — отклонено, весь Skia-план отменён в пользу libvips
  - [ ] 4a-1. Слинковать `libvips` в `lib-native` через `build.zig` (pkg-config, системный пакет — вендоринг/fetch-скрипт не нужен, libvips есть в дистрибутивах)
  - [ ] 4a-2. `vips/bindings.zig` — extern-объявления под нужное подмножество C API libvips (`vips_boxblur`/`vips_gaussblur`, `vips_composite2`/`vips_composite`, `vips_affine`, `vips_perspective`, `vips_extract_band`/`vips_bandjoin_const`, `vips_image_new_from_buffer`/`vips_image_write_to_buffer`) — без шима, у libvips родной C API
  - [ ] 4a-3. Спецификация нужных методов libvips + FFI-ручек Bun, с юз-кейсами (готовит пользователь руками)
  - [ ] 4b. Схемы границ Bun/Zig/libvips/ffmpeg
  - [ ] 4c. Рефакторинг текущей структуры `packages/lib/domain/services/` под новую архитектуру — делать **до** переноса, не одновременно
  - [ ] 4d. Профилировать и убрать per-pixel аллокации `Matrix` в `transforms.ts` (`applyAffineTransform`/`applyHomographyTransform`) — вероятная причина ~8.3 сек/кадр на рендере от 2026-08-30; актуально до переноса, снимется архитектурно после (Zig не аллоцирует так в hot path)
  - [ ] 4e. Фаза 2 (после того, как 4a-4d прокатаны на CPU и покрыты тестами) — точечный GPU-переезд проверенных маршрутов, отдельный decoupled трек с целью обучения GPU-программированию, не блокирует доставку. Кандидат — `wgpu-native`. Низкий приоритет, без дедлайна; необязателен, если CPU окажется достаточно быстрым на реальных размерах картинок
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
