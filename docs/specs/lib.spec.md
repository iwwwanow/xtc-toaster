# lib — структура, ответственность слоёв, функции

Фиксирует финальную архитектуру рендер/экспорт-стека (решение от 2026-08-31/2026-09-06). Отменяет более ранний план на libvips (`docs/backlog/2026-08-30_sharp-libvips-integration.md`). Полный ход разбора — `docs/diary/2026-08-31_render-stack-architecture-decision.md`, `docs/backlog/2026-08-31_final-render-export-stack-architecture.md`.

## Структура директорий

```
packages/
  lib/                            # публичный TS-пакет (@xtc-toaster/lib), собирается в npm
    domain/
      types.ts                    # TS-типы, зеркалящие FFI-контракт (enum'ы, формы параметров)
      entities/
        color.ts                  # тривиальный value-type, остаётся чистым TS
    application/
      toast.ts                    # класс Toast — импорт/экспорт/анимация/статика
    infrastructure/
      ffi/
        native.ts                 # bun:ffi dlopen + таблица символов lib-native
        composition.binding.ts    # тонкий proxy-класс над FFI-хэндлом
        layer.binding.ts          # тонкий proxy-класс над FFI-хэндлом
        contract.test.ts          # тест на рассинхрон сигнатур с lib-native
      ffmpeg/
        assemble-gif.ts           # без изменений — ffmpeg-subprocess
    main.ts

  lib-native/                      # НЕ npm-пакет для потребителей — Zig-исходники + Skia,
    src/                           # собираются в .so/.dylib, который lib грузит через dlopen
      root.zig                     # экспортируемые C-ABI функции (список см. ниже)
      composition.zig              # порт Composition — состояние, оркестрация
      layer.zig                    # порт Layer — состояние, оркестрация
      services/
        maskers.zig                 # hsv/hue/sat/value-маски + falloff
        noise.zig                   # hue-noise
        lch_compose.zig             # lch-hue compose
        transform_math.zig          # сборка/решение матриц
      image_io.zig                  # decode/encode через SkCodec — заменяет node-canvas
      utils/
        matrix.zig                  # 3×3-алгебра, без аллокаций в hot path
        color_space.zig             # hsl/hsv/lab конвертации
      skia/
        bindings.zig                 # extern-объявления в libskia C-API (sk_capi)
    build.zig                        # линкует с libskia на этапе сборки (не dlopen — обычная линковка)

  toasts/                           # без изменений, потребитель Toast
```

`lib-native` — сиблинг `lib` внутри `packages/*` (не вложен в `lib`) — свой тулчейн (Zig, не tsc), свой билд (`build.zig`, не `package.json`), попадает в существующий workspace-glob `packages/*` как есть.

## Ответственность слоёв

| Слой | Роль |
|---|---|
| **Skia** | Тупой калькулятор пикселей. Не хранит состояние между вызовами, не знает про "слои" — просто "примени эту матрицу/blur/blend к этому буферу". Вызывается из Zig обычной линковкой (`build.zig` линкует `libskia` на этапе сборки — не dlopen, не syscall, обычный вызов функции через C-ABI шим `sk_capi`) |
| **Zig** (`lib-native`) | Держит состояние: какие слои есть, в каком порядке, opacity/blend/трансформация каждого. Содержит математику без готового Skia-эквивалента (HSV-маска с falloff, hue-noise, lch-hue compose, решение гомографии по 4 точкам). Дёргает Skia там, где есть готовый примитив, считает сам — где нет. Экспортирует C-ABI функции, которые Bun грузит через `dlopen` (в рантайме, не на этапе сборки — Bun не знает заранее, какую `.so` подгружать) |
| **Bun/TS** (`lib`) | Никогда не трогает пиксели напрямую. Держит хэндлы (указатели/id) на Zig-объекты, дёргает FFI-функции через `bun:ffi`, занимается файлами/процессами (ffmpeg-subprocess)/публичным API (`Toast`) |

## Функции — куда переезжает текущий функционал

### Skia (вызывается из Zig)

| Текущий код | Skia-эквивалент |
|---|---|
| `boxBlur` (effects.ts) | `SkImageFilters::Blur` |
| `alphaCompose` (composers.ts) | `SkBlendMode::kSrcOver` |
| `addCompose` | `SkBlendMode::kPlus` |
| `applyAffineTransform` | `SkMatrix` + `drawImage` (backward-mapped) |
| `applyHomographyTransform` | тот же путь — `SkMatrix` умеет перспективу в той же структуре, affine и homography идут одним вызовом |
| `imageFileToRawData`/`rawDataToImageFile` (node-canvas) | `SkCodec` (декод) / `SkPngEncoder` и т.п. (энкод) — node-canvas убирается целиком |

### Zig (`lib-native`) — оркестрация + математика без Skia-аналога

**Оркестрация:**
- `Composition`: `constructor`, `createLayerFromPixelData`, `createBlankLayer`, `createColorLayer`, `duplicateLayer`, `render` (dispatch по blend mode: normal/add → Skia, lch-hue → свой код)
- `Layer`: `constructor`, `setBlendMode`, `setOpacity`, `setTransform` (dispatch affine/homography → Skia, сборка матрицы — своя), `applyEffect` (blur → Skia, noize → свой), `mask` (hue/saturation/value — свой), `isolateChannel`, `fill`, `tint` (тривиальные, свои)

**Своя математика:**
- `hsvMask`/`hueMask`/`saturationMask`/`valueMask` (maskers.ts)
- `addHueNoise` (effects.ts)
- `lchHueCompose` (composers.ts)
- `getAffineMatrix`, `gaussianElimination`, `homographyFromPairs`, `homographyFromQuad` (transforms.ts)
- `applyYRotationPerspective` — сводится к 3×3-матрице, дальше через Skia
- `Matrix` (utils) — стек-аллоцируется, снимает баг per-pixel аллокаций
- `rgbToHsl`/`hslToRgb`/`rgbToHsv`/`rgbToLab`/`labToRgb`/`getChannelIndex` (color-space.ts)

### Bun/TS (`lib`) — не мигрирует

- `assembleGif`/`assembleVideo`/`loopVideoTo` (infrastructure/assemble-gif.ts) — ffmpeg-subprocess, узкий typed-контракт по флагам
- `Toast` (application/toast.ts) — оркестрация Composition/Layer через FFI-хэндлы, импорт/анимация/экспорт/статика
- `Color` (entities/color.ts) — тривиальный value-type, hex-парсинг перед пересечением FFI-границы

## FFI-контракт Bun ↔ Zig (handle-паттерн)

Bun держит только хэндл (указатель/id), сырые данные — только когда реально нужны байты:

```
composition_create(width, height) -> handle
composition_destroy(handle)
composition_create_layer_from_pixels(handle, ptr, len) -> layer_handle
composition_create_blank_layer(handle) -> layer_handle
composition_create_color_layer(handle, r, g, b, a) -> layer_handle
composition_duplicate_layer(handle, layer_handle) -> layer_handle
composition_render(handle) -> ptr, len

layer_set_blend_mode(handle, mode_enum)
layer_set_opacity(handle, opacity)
layer_set_transform_affine(handle, kind_enum, ...params)
layer_set_transform_homography(handle, matrix_ptr /* f64[9] */)
layer_set_transform_perspective(handle, corners_ptr /* f64[8] */)
layer_apply_effect_blur(handle, radius)
layer_apply_effect_noize(handle, deviation)
layer_mask_hue(handle, value, tolerance)
layer_mask_saturation(handle, value, tolerance)
layer_mask_value(handle, value, tolerance)
layer_isolate_channel(handle, channel_enum)
layer_fill(handle, r, g, b, a)
layer_tint(handle, r, g, b)
layer_get_image_data(handle) -> ptr, len   // только когда TS реально нужны байты
```

Zig ↔ Skia — внутренняя граница, Bun её не видит (Bun никогда не говорит с Skia напрямую).
