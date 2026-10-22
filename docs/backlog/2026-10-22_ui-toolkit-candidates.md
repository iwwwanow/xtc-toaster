# Доработка интерфейса web: инструменты и дизайн-основа

Сейчас `web` — голый xyflow + html без дизайн-системы. Когда дойдём до доработки интерфейса, смотреть в сторону трёх инструментов, каждый закрывает свой слой:

- **Bits UI** — headless-компоненты под Svelte 5 (база shadcn-svelte): диалоги, меню, select, tooltip и т.п. без навязанных стилей — свою дизайн-систему можно накладывать сверху.
- **Tweakpane** — компактная панель параметров (слайдеры, цвета, точки, графики значений). Подходит для параметров нод / фильтров вместо самописных инпутов; для Svelte есть обёртка `svelte-tweakpane-ui`.
- **dockview** — докинг-раскладка: панели с табами, сплитами и перетаскиванием (граф, превью, параметры как отдельные доки). Официальные биндинги — `dockview-core` (vanilla), react, vue; под Svelte 5 есть только сторонний `dockview-svelte` (eddow, 4 версии на 2026-10) — оценить его зрелость или обернуть `dockview-core` самим.

## Дизайн-основа

Визуал интерфейса брать за основу из двух community-китов:

- **IntelliJ Platform UI Kit**
  - community: https://www.figma.com/community/file/938505862996154830/intellij-platform-ui-kit
  - копия: https://www.figma.com/design/Uqk0ohmP4OnAMsw0ayOJrh/IntelliJ-Platform-UI-Kit--Community-?node-id=0-1873
- **Blender Figma**
  - community: https://www.figma.com/community/file/1296496765373455984/blender-figma
  - копия: https://www.figma.com/design/qC5hjNiQoDHqYUYOzMZl1D/Blender-Figma.--Community-?node-id=0-1
  - Penpot, Blender Design System: https://penpot.app/penpothub/libraries-templates/blender-design-system
