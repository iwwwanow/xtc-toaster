# Своя пиксельная математика — на SkSL, а не на Zig

Если нативный бэк идёт по Skia-пути и GPU (Vulkan/Graphite) в итоге нужен, операции без готового Skia-аналога — HSV-маски с falloff (`hsvMask`/`hueMask`/`saturationMask`/`valueMask`), `addHueNoise`, `lchHueCompose`, конвертации color-space — выгоднее сразу писать как SkSL runtime effects (`SkRuntimeEffect`), а не на Zig, как сейчас записано в `docs/specs/lib.spec.md`.

Почему: Zig-код работает на CPU. В GPU-пайплайне каждая такая операция между Skia-вызовами означает readback кадра из VRAM, обработку на CPU и загрузку обратно — эти пересылки съедают выигрыш GPU. SkSL-шейдер Skia исполняет и на CPU-raster, и на GPU, то есть одна реализация на оба пути. Каждый такой шейдер — порядка 20–50 строк, это per-pixel функции без состояния, ровно то, что шейдеры умеют.

Что остаётся на Zig (или вообще в TS): оркестрация Layer/Composition, сборка матриц, решение гомографии по 4 точкам — это не per-pixel работа.

Следствие для спеки 4a: Zig-часть может заметно сократиться. Не актуально, если выбор падёт на libvips (там GPU-пути нет).

Контекст — `docs/diary/2026-10-03_skia-status-and-interface-sprint.md`.
