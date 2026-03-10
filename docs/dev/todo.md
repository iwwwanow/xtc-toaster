# Dev TODO

Рабочий план разработки GUI-приложения.
Стек: Svelte 5 · Vite · TypeScript · Tauri 2.0

---

## 0. Фундамент (текущий спринт)

- [x] Svelte 5 + Vite config
- [x] BSP-layout система (PanelTree / PanelSplit / PanelArea)
- [x] Drag-to-resize dividers
- [x] Blender-dark тема (CSS variables)
- [x] Стубы всех панелей
- [x] Упрощённый layout: только Viewport + Editor, draggable divider
- [x] Убраны Timeline / FCurve / Layers / Properties из основного UI

---

## 1. Панели — UI

### 1.1 Viewport
- [ ] Подключить `Composition` к canvas-элементу внутри ViewportPanel
- [ ] Загрузка изображения (drag&drop или file picker)
- [ ] Fit-to-panel масштабирование (сохранить пропорции)
- [ ] Zoom + pan (колёсико / middle drag)
- [ ] Показывать разрешение и fps

### 1.2 Layers
- [ ] Список слоёв из store
- [ ] Drag для изменения порядка
- [ ] Opacity slider на каждый слой
- [ ] BlendMode dropdown (normal / add)
- [ ] Кнопки: добавить / удалить слой
- [ ] Видимость (eye icon)
- [ ] Выделение активного слоя

### 1.3 Properties
- [ ] Показывает параметры выбранного слоя
- [ ] Параметры cutters (hue, saturation, value, tolerance)
- [ ] Трансформации (translate X/Y, scale, rotate)
- [ ] Эффекты (Noize: deviation, preserveAlpha)

### 1.4 Timeline
- [x] Ruler (линейка кадров) с масштабом
- [x] Scrubber (текущий кадр, drag)
- [x] Tracks — по одному на каждый анимируемый параметр
- [x] Keyframe ромбики на треке (click to select, drag to move)
- [x] Воспроизведение: play / pause / stop
- [x] Scroll-to-zoom frame range
- [ ] Добавление / удаление keyframe (I — insert, Del)
- [ ] Snap to frame при drag
- [ ] Задать диапазон: start frame / end frame / fps (инпуты)

### 1.5 F-Curve Editor
- [x] Сетка (grid) с осями frame / value
- [x] Рендер кривых Безье (ctx.bezierCurveTo)
- [x] Выбор keyframe — показать tangent handles
- [x] Drag keyframe (move frame + value)
- [x] Drag handles для редактирования кривой
- [x] Auto / Free tangent modes
- [x] Zoom + pan (scroll, alt+drag, shift/ctrl modifier)
- [x] Fit view button
- [ ] Snap to frame при drag
- [ ] Добавление keyframe (Ctrl+Click)

### 1.6 Code Editor
- [x] CodeMirror 6 — TS syntax, one-dark тема
- [x] Run / Stop кнопки
- [x] top-level await (async IIFE wrap)
- [x] Вывод ошибок под редактором
- [x] exportGIF({ frames, fps, onFrame }) в контексте скрипта
- [x] Docs overlay (кнопка ?)
- [ ] Вкладки (tabs)
- [ ] Сохранение скрипта в localStorage

---

## 2. Состояние (Stores)

- [ ] `composition.store` — текущая Composition, imageData
- [ ] `layers.store` — массив Layer со всеми параметрами
- [ ] `timeline.store` — currentFrame, fps, playing, frameRange
- [ ] `keyframes.store` — `Map<parameterId, Keyframe[]>`
- [ ] `selection.store` — выбранные keyframes, выбранный слой
- [ ] `editor.store` — tabs, active tab, code content

---

## 3. Анимация

- [ ] Система параметров: каждый параметр слоя имеет уникальный `parameterId`
- [ ] Интерполяция по F-кривой (Bezier evaluate at t)
- [ ] `animationEngine` — на каждый requestAnimationFrame вычисляет значения параметров из keyframes и применяет к слоям
- [ ] Экспорт анимации как PNG-последовательность
- [ ] Экспорт как WebM/GIF (через MediaRecorder или ffmpeg-wasm)

---

## 4. Lib — доделки и баги

- [ ] **Баг**: порядок слоёв влияет на итог (ошибка в compositing math)
- [ ] `transformedLayersMapper` — реализовать translate / scale / rotate
- [ ] `cutChannel` — перепроверить alpha логику
- [ ] Добавить `cutHsv` как публичный API (tolerance как параметр)
- [ ] Минимальный test-case: 4×4 картинка, проверить compositing вручную

---

## 5. Tauri 2.0

- [ ] `cargo tauri init` — инициализация
- [ ] Настроить `tauri.conf.json`: окно без chrome, min-size
- [ ] File system plugin — открыть/сохранить проект (JSON)
- [ ] Нативные диалоги — file picker для загрузки изображений
- [ ] Auto-updater
- [ ] Сборка: `npm run tauri build`

---

## 6. Формат проекта

- [ ] Определить схему `.cpj` (Canvas Project JSON)
  ```json
  {
    "version": 1,
    "composition": { "width": 300, "height": 400 },
    "layers": [...],
    "keyframes": {...},
    "timeline": { "fps": 30, "start": 0, "end": 120 },
    "scripts": [{ "name": "main.ts", "code": "..." }]
  }
  ```
- [ ] Сохранение / загрузка проекта
- [ ] Auto-save

---

## 7. UX / Polish

- [ ] Горячие клавиши (пробел — play, F — fit viewport, и др.)
- [ ] Контекстное меню (RMB на keyframe, на слое)
- [ ] Drag-из-угла-панели для разделения / слияния (полный Blender-style)
- [ ] Тема: возможность переключить light / dark
- [ ] Onboarding: пустое состояние с подсказками

---

## Порядок работы (playground)

1. Code Editor панель (добавить тип, layout, CodeMirror)
2. Viewport подключение (Composition → canvas)
3. Layers panel интерактив
4. Stores (composition, layers, timeline)
5. Timeline UI
6. F-Curve базовая версия
7. Animation engine
8. Tauri
9. Формат проекта

---
---

# Platform — Preset Marketplace

Платформа для хранения и применения пресетов обработки изображений.
Пресет — TypeScript-скрипт, использующий canvas-lib из этого репозитория.

## Архитектура

```
┌─────────────────────────────────────────────────────┐
│  CLI (Node.js/TS)        Web (Go + HTMX + Alpine.js) │
│    ↓ HTTP API               ↓ HTTP API               │
│         Go Backend (REST API + Web server)           │
│                   ↓                                  │
│              SQLite Database                         │
└─────────────────────────────────────────────────────┘

Preset execution: ВСЕГДА на стороне клиента (CLI или браузер).
Сервер только хранит код и метаданные. Не исполняет JS.
```

**Стек:**
- `backend/`   — Go, `net/http`, `modernc.org/sqlite` (pure Go, без CGO)
- `cli/`       — Node.js/TypeScript, `node-canvas`, `gifenc`, `commander`
- `web/`       — Go templates + HTMX + Alpine.js, CSS из `global.css` (Blender-dark)

---

## P-0. База данных (SQLite schema)

```sql
CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,          -- bcrypt
  api_key       TEXT UNIQUE NOT NULL,   -- sha256 hex, для CLI auth
  created_at    INTEGER NOT NULL        -- unix timestamp
);

CREATE TABLE presets (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  slug        TEXT NOT NULL,            -- url-friendly, уникальный per user
  name        TEXT NOT NULL,
  description TEXT,
  code        TEXT NOT NULL,            -- TypeScript исходник
  preview_gif BLOB,                     -- GIF 512px, генерируется клиентом
  is_public   INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_presets_user_slug ON presets(user_id, slug);
```

- [ ] Написать `backend/db/schema.sql`
- [ ] Миграции: простой `schema_version` + apply-if-not-exists подход
- [ ] `backend/db/db.go` — init, открытие, WAL mode

---

## P-1. Go Backend (API)

Единый бинарник — и API, и веб-сервер.

### Auth
- [ ] `POST /api/auth/register` — username, email, password → генерирует api_key
- [ ] `POST /api/auth/login`    — email + password → возвращает api_key
- [ ] Middleware: `Authorization: Bearer <api_key>` для защищённых роутов

### Presets API
- [ ] `GET    /api/presets`               — публичные пресеты (пагинация)
- [ ] `GET    /api/presets/:user/:slug`   — один пресет
- [ ] `POST   /api/presets`              — загрузить пресет (auth) — multipart: code + preview_gif
- [ ] `PUT    /api/presets/:user/:slug`   — обновить (auth, owner)
- [ ] `DELETE /api/presets/:user/:slug`  — удалить (auth, owner)
- [ ] `GET    /api/presets/:user/:slug/preview` — скачать GIF превью

### Users API
- [ ] `GET /api/users/:username/presets` — пресеты пользователя

---

## P-2. CLI (`canvas-cli`)

**Стек:** Node.js/TS, `commander`, `node-canvas`, `gifenc`, `chalk`, `ora`

**Расположение:** `cli/` в корне репо

### Команды

```bash
canvas-cli auth login           # email + password → сохраняет api_key в ~/.canvas/config.json
canvas-cli auth logout
canvas-cli auth whoami

canvas-cli preset push <file.ts>          # загрузить / обновить пресет
  --name "My Preset"
  --desc "Описание"
  --preview <image.jpg>         # генерирует GIF превью из этого изображения

canvas-cli preset list                    # свои пресеты
canvas-cli preset list --public           # все публичные

canvas-cli preset apply <user/slug> <image.jpg> [--output out.jpg]
  # исполняет пресет через node-canvas, сохраняет результат

canvas-cli preset preview <user/slug>     # скачивает GIF превью, открывает или выводит в терминал
```

### Локальное исполнение пресетов
- [ ] `cli/src/runner.ts` — загружает пресет-код, исполняет через `node-canvas`
  - Инжектирует те же globals что и браузер: `Layer`, `BlendMod`, `cutHue`, etc.
  - Использует `createCanvas` из `node-canvas` вместо DOM canvas
- [ ] Генерация GIF превью: `cli/src/preview-gen.ts` — прогоняет N кадров, пишет через `gifenc`, 512px

### Терминальный предпросмотр изображений
- [ ] Проверить наличие `chafa` / `viu` / `kitty +kitten icat` — использовать если есть
- [ ] Fallback: сохранить в `/tmp/`, открыть через `xdg-open` / `open`
- [ ] Опция `--open-browser` — открыть в браузере

### Config
- [ ] `~/.canvas/config.json` — `{ apiUrl, apiKey, username }`
- [ ] `cli/src/config.ts` — read/write конфига

---

## P-3. Web (`/web`)

**Стек:** Go templates + HTMX + Alpine.js + CSS (Blender-dark из `global.css`)

### Страницы

- [ ] `/`                     — витрина публичных пресетов (grid карточек)
- [ ] `/preset/:user/:slug`   — страница пресета: превью GIF, код (read-only), кнопка Apply
- [ ] `/apply/:user/:slug`    — загрузить изображение → применить пресет в браузере → скачать
- [ ] `/u/:username`          — профиль пользователя, его пресеты
- [ ] `/login`, `/register`   — формы (HTMX submit)
- [ ] `/dashboard`            — мои пресеты, кнопки edit/delete (auth)

### Apply flow (браузерный, без сервера)
Пресет исполняется в браузере точно так же как в playground:
- [ ] Загрузить код пресета с API
- [ ] Создать `<canvas>`, запустить через `new Function()` (тот же механизм что в CodeEditorPanel)
- [ ] Показать результат, предложить скачать PNG/GIF

### UI компоненты
- [ ] Карточка пресета: превью GIF (автовоспроизведение on-hover), имя, автор, описание
- [ ] Кнопка копирования slug (`user/preset-name`)
- [ ] Пагинация через HTMX (`hx-get`, `hx-swap`)
- [ ] Upload форма (drag&drop изображения для Apply)

---

## P-4. Preview GIF — спецификация

- Размер: 512 × 512 px (или пропорционально fit)
- Длина: 2–5 секунд, 15–24 fps
- Генерируется: через `gifenc` (уже используется в playground)
- CLI генерирует при `preset push --preview image.jpg`
- Браузер генерирует при публикации через web UI
- Загружается как `multipart/form-data` поле `preview_gif`
- Хранится в SQLite как BLOB (до ~2 MB на пресет)

---

## Порядок реализации платформы

1. **P-0** DB schema + Go backend скелет (router, db init)
2. **P-1** API: auth (register/login/api_key)
3. **P-1** API: presets CRUD
4. **P-2** CLI: config + auth команды
5. **P-2** CLI: `preset push` (без превью)
6. **P-2** CLI: `runner.ts` — node-canvas исполнение
7. **P-2** CLI: `preview-gen.ts` + `preset push --preview`
8. **P-2** CLI: `preset apply`, `preset list`, `preset preview`
9. **P-3** Web: layout + витрина (статичная)
10. **P-3** Web: auth страницы
11. **P-3** Web: apply flow (браузерное исполнение)
12. **P-3** Web: dashboard
