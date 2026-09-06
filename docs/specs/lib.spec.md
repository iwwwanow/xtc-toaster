# lib — структура, ответственность слоёв, функции

Фиксирует архитектуру рендер/экспорт-стека. Изначальное решение (2026-08-31/2026-09-06) выбирало Skia как источник пиксельного низкого уровня; Skia-путь **отменён 2026-09-06** — дошёл до рабочего бинарника (`rust-skia/skia-binaries`), но требовал написания C++-шима (`sk_capi` в дропе нет), что отклонено. Взамен — **libvips** (Фаза 1, CPU, готовый C API, без шима). GPU — отдельная, decoupled Фаза 2, необязательная, без дедлайна. Полный ход разбора — `docs/diary/2026-08-31_render-stack-architecture-decision.md`, обоснование финального выбора — `docs/backlog/2026-09-06_gpu-render-stack-skia-alternatives.md`, детальная сверка API libvips с текущим TS-кодом — `docs/backlog/2026-08-30_sharp-libvips-integration.md`.

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

  lib-native/                      # НЕ npm-пакет для потребителей — Zig-исходники + libvips,
    src/                           # собираются в .so/.dylib, который lib грузит через dlopen
      root.zig                     # экспортируемые C-ABI функции (список см. ниже)
      composition.zig              # порт Composition — состояние, оркестрация
      layer.zig                    # порт Layer — состояние, оркестрация
      services/
        maskers.zig                 # hsv/hue/sat/value-маски + falloff
        noise.zig                   # hue-noise
        lch_compose.zig             # lch-hue compose
        transform_math.zig          # сборка/решение матриц (гомография по 4 точкам и т.п.)
      image_io.zig                  # decode/encode через vips_image_new_from_buffer/vips_image_write_to_buffer — заменяет node-canvas
      utils/
        matrix.zig                  # 3×3-алгебра, без аллокаций в hot path
        color_space.zig             # hsl/hsv/lab конвертации
      vips/
        bindings.zig                 # extern-объявления напрямую в libvips C API (`vips/vips.h`) — без шима, у vips уже родной C API
    build.zig                        # линкует системную libvips на этапе сборки (pkg-config, обычная линковка — не dlopen)

  toasts/                           # без изменений, потребитель Toast
```

`lib-native` — сиблинг `lib` внутри `packages/*` (не вложен в `lib`) — свой тулчейн (Zig, не tsc), свой билд (`build.zig`, не `package.json`), попадает в существующий workspace-glob `packages/*` как есть.

## Источник libvips — решено 2026-09-06

В отличие от Skia, вендоринг не нужен: libvips пакуется во всех основных дистрибутивах (`pacman -S libvips` на Arch — уже используемый дистрибутив, `apt`/`brew` эквиваленты для других машин). `build.zig` линкует системную `libvips` через `pkg-config` на этапе сборки — обычная линковка через C-ABI, никакого `fetch-skia.sh`-аналога, никакого `vendor/`-каталога в `.gitignore`.

**Почему без шима**: у libvips есть родной, документированный C API (`vips/vips.h`) — Zig вызывает его функции напрямую через `extern "C"`, без промежуточного C++-слоя. Это и есть причина отказа от Skia — GPU-бэкенд Skia стоил ровно того шима, который здесь не нужен вообще.

**Вес**: сам libvips — 30.87 MiB (installed size), обязательные C-зависимости (cfitsio, fftw, libexif, libarchive, libimagequant, librsvg, libwebp, openexr, highway, pango, libcgif, cairo, lcms2, openjpeg2) — ещё ≈46 MiB. Опциональные форматные модули (heif/imagemagick/openslide/poppler/jxl) — ещё ≈49 MiB, для нашего пайплайна (RGBA-буфер, blur/geometry/composite) не нужны — можно смело исключать из сборки, если размер станет важен (не актуально сейчас, единственный потребитель — сам разработчик).

**GPU (Фаза 2) — decoupled, не блокирует эту спеку.** libvips сам CPU-only (SIMD через highway/orc, без CUDA/Vulkan/Metal). Точечный переезд отдельных, уже прокатанных на CPU и покрытых тестами маршрутов на GPU — отдельный трек с целью обучения GPU-программированию, без давления дедлайна доставки тостера. Кандидат — `wgpu-native` (чистый C API, `webgpu.h`, готовые Linux-бинарники, WGSL-шейдеры как текст без build-time тулчейна). Полная сравнительная таблица альтернатив — `docs/backlog/2026-09-06_gpu-render-stack-skia-alternatives.md`.

## Ответственность слоёв

| Слой | Роль |
|---|---|
| **libvips** | Тупой калькулятор пикселей, CPU. Не хранит состояние между вызовами, не знает про "слои" — просто "примени эту операцию к этому буферу". Вызывается из Zig обычной линковкой (`build.zig` линкует `libvips` через pkg-config на этапе сборки — не dlopen, не syscall, обычный вызов функции через родной C-ABI) |
| **Zig** (`lib-native`) | Держит состояние: какие слои есть, в каком порядке, opacity/blend/трансформация каждого. Содержит математику без готового libvips-эквивалента (HSV-маска с falloff, hue-noise, lch-hue compose, решение гомографии по 4 точкам). Дёргает libvips там, где есть готовый примитив, считает сам — где нет. Экспортирует C-ABI функции, которые Bun грузит через `dlopen` (в рантайме, не на этапе сборки — Bun не знает заранее, какую `.so` подгружать) |
| **Bun/TS** (`lib`) | Никогда не трогает пиксели напрямую. Держит хэндлы (указатели/id) на Zig-объекты, дёргает FFI-функции через `bun:ffi`, занимается файлами/процессами (ffmpeg-subprocess)/публичным API (`Toast`) |

## Функции — куда переезжает текущий функционал

### libvips (вызывается из Zig)

| Текущий код | libvips-эквивалент |
|---|---|
| `boxBlur` (effects.ts, ручной two-pass) | `vips_boxblur`/`vips_gaussblur` |
| `alphaCompose`/`addCompose` (composers.ts) | `vips_composite2(bg, fg, mode)` — весь набор Photoshop/SVG blend-мод встроен из коробки; для стека из N слоёв со стандартными модами есть множественная форма `vips_composite`, схлопывающая весь reducer за один вызов |
| `isolateChannel` (maskers.ts) | `vips_extract_band` + `vips_bandjoin_const` |
| `applyAffineTransform` | `vips_affine` — backward-mapped, без дыр (текущий TS-вариант forward-mapped и потому дырявый) |
| `applyHomographyTransform` | `vips_perspective(matrix)` — матрица подаётся готовая, саму гомографию по 4 точкам vips не решает, остаётся в Zig |
| `applyYRotationPerspective` | сводится к 3×3-матрице (angle, focalLength → матрица), дальше через `vips_perspective` |
| `imageFileToRawData`/`rawDataToImageFile` (node-canvas) | `vips_image_new_from_buffer` (декод) / `vips_image_write_to_buffer` (энкод) — node-canvas убирается целиком |

### Zig (`lib-native`) — оркестрация + математика без libvips-аналога

**Оркестрация:**
- `Composition`: `constructor`, `createLayerFromPixelData`, `createBlankLayer`, `createColorLayer`, `duplicateLayer`, `render` (dispatch по blend mode: normal/add → libvips, lch-hue → свой код)
- `Layer`: `constructor`, `setBlendMode`, `setOpacity`, `setTransform` (dispatch affine/homography → libvips, сборка матрицы — своя), `applyEffect` (blur → libvips, noize → свой), `mask` (hue/saturation/value — свой), `isolateChannel`, `fill`, `tint` (тривиальные, свои)

**Своя математика (у libvips нет готового вызова, только кубики под композицию — либо принципиально не его слой):**
- `hsvMask`/`hueMask`/`saturationMask`/`valueMask` (maskers.ts) — полоса по HSV-компоненту с квадратичным затуханием и circular wrap для hue; у vips нет единой операции под это, только `colourspace(HSV)` + `relational_const` + арифметика как примитивы
- `addHueNoise` (effects.ts) — у vips нет HSL как colourspace (только HSV и LCh) — нужен либо переезд на LCh-hue-noise, либо HSL руками
- `lchHueCompose` (composers.ts, hue из FG + L/C из BG) — не входит в стандартный enum blend-мод vips
- `getAffineMatrix`, `gaussianElimination`, `homographyFromPairs`, `homographyFromQuad` (transforms.ts) — решение системы по 4 точкам → матрица, чистая линейная алгебра, не image processing
- `Matrix` (utils) — стек-аллоцируется, снимает баг per-pixel аллокаций
- `rgbToHsl`/`hslToRgb`/`rgbToHsv`/`rgbToLab`/`labToRgb`/`getChannelIndex` (color-space.ts)
- **Доменная модель слоёв целиком** (`Layer`: opacity→alpha bake, порядок, привязка эффектов к слою) — оркестрация, не pixel-processing функция, у C-либы её в принципе быть не может

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
layer_apply_effect_noize(handle, deviation, preserve_alpha)
layer_mask_hue(handle, value, tolerance)
layer_mask_saturation(handle, value, tolerance)
layer_mask_value(handle, value, tolerance)
layer_isolate_channel(handle, channel_enum)
layer_fill(handle, r, g, b, a)
layer_tint(handle, r, g, b)
layer_get_image_data(handle) -> ptr, len   // только когда TS реально нужны байты
```

Zig ↔ libvips — внутренняя граница, Bun её не видит (Bun никогда не говорит с libvips напрямую).
