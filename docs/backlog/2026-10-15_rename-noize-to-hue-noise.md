# Переименовать noize → hueNoise во всём стеке

`noize` — это шум только оттенка (`addHueNoise`), имя осталось от legacy и обманывает (почему шум виден только на цветных участках — `docs/backlog/2026-10-11_noize-hue-only-on-saturated-pixels.md`). Переименовать тип во всех слоях: lib (`EffectParams` в `domain/types.ts`, `Layer.applyEffect`, спеки `docs/specs/domain.spec.ts` и `lib.spec.md`), contract (`NoizeNodeSchema`, `PARAMS.noize`), server (`run-graph.ts`, тесты), web (`NoizeNode.svelte`, `nodes/index.ts`, тесты) и `toast-2_signac/toast.json`. Пока экспорт тостов не сделан, сохранённых файлов у пользователей нет, так что `TOAST_GRAPH_VERSION` поднимать не нужно; после экспорта переименование уже потребует миграции. Подписи в ui («hue noise») поменяны отдельно 2026-10-15 — здесь только имя типа.

Сделано 2026-10-16 — `docs/diary/2026-10-16_sensor-fit-and-hue-noise-rename.md`.
