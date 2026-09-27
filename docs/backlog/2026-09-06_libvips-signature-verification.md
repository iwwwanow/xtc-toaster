# Сверка реальных сигнатур libvips перед 4a-2

Перед тем как писать `vips/bindings.zig` (planning.md 4a-2), решили сначала перепроверить всю таблицу "Функции — куда переезжает" из `docs/specs/lib.spec.md` руками — не по памяти/бэклогу `docs/backlog/2026-08-30_sharp-libvips-integration.md`, а по реальным заголовкам, экспортируемым символам и реестру операций установленного libvips.

## Метод проверки

Три независимых источника на установленном libvips **8.18.6** (Arch, `pacman -Qs vips`):
1. `grep` по `/usr/include/vips/*.h` на точные сигнатуры.
2. `nm -D /usr/lib/libvips.so | grep ...` — реально экспортируемые символы (не только заголовки — заголовок может объявлять то, чего нет в конкретной сборке, и наоборот).
3. `vips -l` — полный реестр зарегистрированных операций (GObject-интроспекция, самый надёжный источник, не зависит от того, попала ли функция в публичный `.h`).

## Результат

| Функция из старого списка | Существует? | Комментарий |
|---|---|---|
| `vips_boxblur` | **Нет** | Ни в заголовках, ни в `nm`, ни в `vips -l`. Единственный реальный blur-вызов — `vips_gaussblur`. Старая формулировка "boxblur/gaussblur" в lib.spec.md и planning.md была неверной с самого начала (бэклог от 2026-08-30 просто предположил существование по аналогии с другими либами, не проверил) |
| `vips_gaussblur` | Да | `int vips_gaussblur(VipsImage *in, VipsImage **out, double sigma, ...)`, confirmed symbol |
| `vips_composite2` | Да | `int vips_composite2(VipsImage *base, VipsImage *overlay, VipsImage **out, VipsBlendMode mode, ...)` |
| `vips_composite` | Да | `int vips_composite(VipsImage **in, VipsImage **out, int n, int *mode, ...)` |
| `vips_affine` | Да, но не в той форме, что предполагалась | `int vips_affine(VipsImage *in, VipsImage **out, double a, double b, double c, double d, ...)` — берёт только 2×2 линейную часть (`a,b,c,d`) **позиционно**, не полную 3×3-матрицу. Трансляция — через опциональные именованные varargs-параметры (`odx`/`ody` и т.п., см. `VipsImage8.h`: `affine(std::vector<double> matrix, VOption *options)` в C++-обёртке принимает именно 2×2 + отдельные options) |
| `vips_perspective` | **Нет** | Ни в заголовках, ни в `nm`, ни в `vips -l`. Не существует и никогда не появлялось под этим именем в текущей ветке libvips (8.x). Это был центральный вызов, на который опирался весь план для `applyHomographyTransform`/`applyYRotationPerspective` — **план был построен на несуществующей функции**, требовалась ревизия прежде чем писать биндинги |
| `vips_extract_band` | Да | `int vips_extract_band(VipsImage *in, VipsImage **out, int band, ...)` |
| `vips_bandjoin_const` | Да | `int vips_bandjoin_const(VipsImage *in, VipsImage **out, double *c, int n, ...)` |
| `vips_image_new_from_buffer` | Да | `VipsImage *vips_image_new_from_buffer(const void *buf, size_t len, const char *option_string, ...)` |
| `vips_image_write_to_buffer` | Да | `int vips_image_write_to_buffer(VipsImage *in, const char *suffix, void **buf, size_t *size, ...)` |

## Замена для perspective/гомографии — `vips_mapim`

Реальный механизм произвольного геометрического warp'а в libvips — `int vips_mapim(VipsImage *in, VipsImage **out, VipsImage *index, ...)` ("resample with a map image"): `index` — картинка, задающая для каждого выходного пикселя исходные координаты во входном изображении (per-pixel remap, обычно 2-band float image: x,y). vips сам гомографию не считает — он просто ресемплит по готовой карте (опции: `interpolate`/`background`/`premultiplied`/`extend`, см. `VImage8.h`).

Это меняет границу ответственности для гомографии по сравнению со старым планом:
- **Было (неверно)**: Zig решает гомографию по 4 точкам → одна готовая функция `vips_perspective(matrix)` применяет её.
- **Стало**: Zig решает гомографию по 4 точкам (без изменений — `homographyFromPairs`/`gaussianElimination` как и планировалось) **и дополнительно сам строит map-картинку** — применяет обратную матрицу к координатам каждого выходного пикселя, пишет результат в буфер, оборачивает его как `VipsImage` (`vips_image_new_from_memory`) — и только эта готовая карта идёт в `vips_mapim`. `applyYRotationPerspective` (angle/focalLength → 3×3-матрица) идёт по тому же пути.

Точный формат index-image (band count, `VipsBandFormat` — предположительно `VIPS_FORMAT_FLOAT`, 2 банда) не проверен руками (нужен реальный `zig build`/тестовый вызов в 4a-2), намеренно оставлен как "уточнить при реализации", а не зафиксирован как факт без проверки.

## Побочная находка — variadic ABI

Почти все операции libvips — GObject-style variadic, `NULL`-terminated (`G_GNUC_NULL_TERMINATED` в заголовках): сигнатура вида `fn(..., ...)`с опциональными именованными параметрами (`"property_name", value, ..., NULL`), а не фиксированный список. Это относится ко всем перечисленным выше функциям без исключения. При написании `vips/bindings.zig` (4a-2) это означает: `extern "c" fn ... (..., ...) callconv(.C) c_int` с завершающим Zig-varargs, и на месте вызова — явный `NULL`-сентинел последним аргументом. Раньше это нигде явно не проговаривалось.

## Итог

`docs/specs/lib.spec.md` и `docs/planning.md` (пункт 4a-2) обновлены на месте: убран `vips_boxblur`, `vips_perspective` заменён на `vips_mapim` + пояснение про самодельную map-картинку, добавлено предупреждение про variadic ABI. Старый бэклог `docs/backlog/2026-08-30_sharp-libvips-integration.md` не редактировался (историческая запись), расхождение зафиксировано здесь как отдельная, более поздняя проверка.

Следующий шаг — реализация 4a-2 (`vips/bindings.zig`) по исправленному списку, с реальным `zig build` для проверки каждой сигнатуры (включая пробную сборку/использование index-image для `vips_mapim`), а не только чтением заголовков.
