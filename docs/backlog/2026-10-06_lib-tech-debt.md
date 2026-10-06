# Мелкий техдолг lib

Ничего не блокирует, разобрать, когда снова дойдут руки до `packages/lib`:

- `valueMask` (`hsvMask` в `domain/services/maskers.ts`) спадает квадратично (`1 - t²`) — попробовать гауссов спад `exp(-t²/0.5)`, сравнить на визуальном прогоне фильтров
- опциональный `pivot: {x, y}` в `Transform` для rotate/scale/skew, по умолчанию центр кадра, как сейчас. Точка расширения помечена у `getAffineMatrix` в `domain/services/transforms.ts`. Самый низкий приоритет
- `docs/specs/segmentation.spec.ts` не проработан (mosaic-segment вне скоупа). `animation.spec.ts` удалён 2026-10-05 — анимируемые параметры теперь пойдут через граф (`number | Keyframes`, спринт 5)
- превью в терминале не работает внутри Zellij — `docs/backlog/2026-08-30_zellij-kitty-graphics-protocol.md`

Пункт старого плана «вынести `CanvasRenderer` из `Composition`» снят: после переписывания домена `Composition` не знает о canvas, `render()` возвращает пиксели (см. комментарий в `domain/entities/composition.ts`).
