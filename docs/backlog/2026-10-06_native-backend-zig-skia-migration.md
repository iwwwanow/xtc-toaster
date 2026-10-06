# Перенос domain-части lib на Zig + Skia (заморожено)

Заморожено, пока делается веб-интерфейс. Путь — Skia (решено 2026-10-03): решение от 2026-09-06 про libvips без C++-шима (ветка `feat/lib-native`) отменено ради GPU, а C++-шим принимается как цена GPU-пути. Skia собрана 2026-09-27 (`vendor/skia/out/min` — CPU, `out/vk` — Vulkan+Graphite), сабмодуль лежит в ветке `feat/lib-native-skia`, кода поверх него нет. Оценка: ≈16–29 ч до паритета на CPU и ещё +8–16 ч на GPU.

Разделение — не порт 1:1. Пиксельный низкий уровень (blur, affine/perspective resample, normal/add blend) уходит в Skia. Оркестрация (Layer/Composition) и математика без готового аналога в Skia (HSV-маска с falloff, hue-noise, lch-hue compose, гомография по 4 точкам) уходит в Zig, а для GPU-пути лучше сразу в SkSL — `docs/backlog/2026-10-03_sksl-for-custom-pixel-math.md`. Шаги:

- спека нужных методов Skia и FFI-ручек Bun с юз-кейсами (готовит пользователь руками)
- схемы границ Bun / Zig / Skia / ffmpeg
- рефакторинг `packages/lib/domain/services/` под новую архитектуру — **до** переноса, не одновременно
- биндинг-слой `packages/lib/infrastructure/ffi/*.binding.ts`: handle-паттерн и contract-test на рассинхрон сигнатур
- Bun-инфра: dev-loop через `watchexec`, `lib-native` как Zig-пакет вне npm-воркспейса, собирается в `.so`/`.dylib`
- замена `node-canvas` (декодирование и кодирование изображений) на Skia (`SkCodec` и энкодеры через Zig), без второй нативной зависимости на ту же задачу. Заодно закроет webp и поворот по EXIF, которые `canvas` не умеет (см. `docs/sprints/sprint-1.spec.md`)
- последним и с низким приоритетом: `package.json` для `packages/lib` и GitHub Actions на сборку npm-пакета

Когда интерфейс обкатается: замерить задержку рендера и переключить сервер на нативный бэк через границу рендера — `docs/backlog/2026-10-06_render-boundary.md`.

Контекст решений: `docs/diary/2026-08-28_ddd-lite-go-ffi-planning.md`, `docs/diary/2026-08-29_domain-spec-review.md`, `docs/diary/2026-08-29_domain-ts-implementation.md`, `docs/diary/2026-08-31_render-stack-architecture-decision.md`, `docs/diary/2026-10-03_skia-status-and-interface-sprint.md`. Спека — `docs/specs/domain.spec.ts`, финальная архитектура — `docs/backlog/2026-08-31_final-render-export-stack-architecture.md`.
