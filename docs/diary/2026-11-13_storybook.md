# 2026-11-13 — Storybook для ручной настройки ui

Пользователь будет перерисовывать ui руками (`CLAUDE.md`, «Sprint process»). Storybook сделан, чтобы видеть каждую ноду и состояние отдельно и сразу видеть правки `app.css` / uiu. Перед этим `feat/groups` влита в master (`5d5ff53`), отработанные ветки удалены (`feat/groups`, `feat/value`, на origin ещё `docs/sprint-5-plan`, `feat/animation-web`). `feat/lib-native*` не влиты — замороженный нативный бэкенд, оставлены. Ветка `feat/storybook`.

## Как устроено

- **Пакеты.** `storybook` и `@storybook/svelte-vite` 10.6.7, точные версии. Peer-зависимости принимают Svelte 5 и Vite 8. Отдельный svelte-аддон не нужен: stories — обычные `.stories.ts` (CSF), их проверяет тот же `svelte-check` (`.storybook` добавлен в `include` tsconfig). Телеметрия выключена (`core.disableTelemetry`). Storybook подхватывает `vite.config.ts` пакета: svelte, favicon, dev-плагины.
- **Настоящие компоненты, настоящая session.** Ноды берут данные из глобального `session`, а не из props, и рисуют точки xyflow — им нужен контекст `SvelteFlow`. Поэтому story не мокает компонент, а загружает тост в session (`load.svelte.ts`, `session.importToast` — с той же проверкой, что импорт файла). `StoryCanvas` — холст xyflow только с нодами (обёртка как у Editor: `position: fixed`, рамка xyflow выключена), `StoryEditor` — весь `App` с меню, панелями, таймлайном и undo.
- **Аргументы.** `toast` — имя из `tests/toasts` или `single(type)`: одна нода с данными по умолчанию (`createNode`, как из меню) между input и output без связей — contract такое пропускает. `open` — открыть группу. `connected` — без него `session.locked`, все поля заблокированы. `picture` — фиктивный uuid в input (импорт ставит imageId сессии, поэтому после импорта, затем `restartHistory`) и `poppies.jpg` из фикстур lib как отрендеренная картинка. `renderError` / `errorNode` — отказ сервера.
- **Stories.** `Nodes`: `All` (`all-nodes`), по одной на каждый тип меню, и состояния — `Animated`, `DrivenByValue`, `DrivenByFactor`, `DelayRows`, `GroupInstances`, `GroupInside`, `RenderError`, `Rendered`, `Disconnected`. `Editor`: весь редактор, тост выбирается в контролах из всех `tests/toasts` кроме `broken-*`.
- **Dev compose.** Сервис `storybook` (`bun run storybook --ci --host 0.0.0.0`), порт `STORYBOOK_PORT` (6006). Бинарь Storybook запускается в образе `oven/bun` без node.

## Подводные камни

- **`state_unsafe_mutation`.** Первый вариант грузил тост через `{#await loadStory(props)}` в шаблоне. Svelte 5 запрещает менять состояние из шаблона, падали все stories. Загрузка — в `$effect` (`useStory`).
- **Рендер без сервера.** `App` на каждую правку вызывает `session.render()`, тот ставит `rendering = true`, и без ответа сервера редактор остаётся заблокированным. `StoryEditor` сразу сбрасывает `rendering` — как будто сервер ответил той же картинкой.
- **`imageId` — uuid.** `"story"` не прошёл схему, импорт отказал. Фиктивный id — нулевой uuid v4.
- **Найден баг приложения.** В output ошибка рендера читалась `move:only a numeric param…`: `{#if}{name}: {/if}` — svelte обрезает пробел в конце блока. Исправлено строкой-шаблоном, отдельный коммит `cf71796`.

## Проверено

- Typecheck web (stories в нём), тесты всех пакетов.
- Headless Chrome: все 32 story по `iframe.html?id=…` — и с локального `bun run storybook`, и из контейнера. Ноды на месте, ошибок в консоли нет. Состояния срабатывают: заблокированы анимированные поля и поля под value / factor, в `Disconnected` — все. Скриншоты `Editor` (картинка в output), `RenderError` (текст ошибки), `GroupInside`.
- Не проверял: hmr при правке `app.css` внутри контейнера (bind mount, inotify — должно работать), сборку `storybook build`.

## Осталось

- Пользователю — посмотреть http://localhost:6006 и сказать, каких состояний не хватает (панели по отдельности, выделение, тулбар выделения, зоны при перетаскивании — сейчас только в `Editor`).
- Слить `feat/storybook` в master, когда пользователь посмотрит.
