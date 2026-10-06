// Toast — единая точка управления рендер/экспорт-стеком для потребителя (тостов).
// Оркеструет Composition/Layer (сейчас — напрямую из ../domain; после переноса
// домена на Zig — через infrastructure/ffi/*.binding.ts, handle-паттерн) и
// infrastructure (image-io на импорт, ffmpeg-обвязку на экспорт).
//
// Берёт на себя:
// - импорт: загрузка исходного изображения в Composition/слои
// - анимацию: сборка кадров по параметру t ∈ [0,1] — паттерн buildFrame(t) из toast-1,
//   сейчас разбросанный по CLI-коду тоста, инкапсулируется здесь
// - экспорт: сборка gif/video через infrastructure/assemble-gif.ts, loop до нужной длины
// - рендер статики: одиночный кадр без анимации
//
// Не реализован — см. docs/backlog/2026-10-06_render-boundary.md,
// docs/backlog/2026-08-31_final-render-export-stack-architecture.md
export {};
