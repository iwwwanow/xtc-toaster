# LFS и тяжёлые ассеты в истории — чистка через filter-repo

LFS из истории так и не вычищен. На 2026-10-07: в HEAD под LFS 454 файла, по всей истории 495 (`assets/dataset/videos/*.mp4` и др.); в HEAD отслеживается ~11.8k файлов `assets/dataset` и 230 `assets/output`. Плюс в истории лежат крупные blob'ы мимо LFS — `batch-out/mosaic-frames-v4-*/segments.json` (до 86 МБ), `assets/*.xcf` (до 72 МБ), mp4 из `assets/downloaded/` (до 63 МБ). Pack — ~945 МБ.

`.gitattributes` (LFS-фильтры на `*.mp4`, `*.xcf`, `*.webp`) просто удалить нельзя: пока LFS-файлы в дереве, без фильтра checkout отдаст текстовые pointer-файлы вместо медиа.

Порядок, если браться:

1. Решить, что из `assets/` реально нужно в репо (`poppies.jpg`, `input.jpg`, `logo/` — вероятно да; `dataset/`, `output/`, `books/` — нет), остальное снять с учёта и бэкапнуть вне репо.
2. `git filter-repo` — убрать `assets/dataset`, `assets/output`, `assets/books`, `batch-out`, `*.xcf`, `.env` из всей истории.
3. Force-push в `master` и 16 удалённых веток (старые ветки — заодно решить, какие вообще удалить).
4. Только после этого убрать `.gitattributes` и `git lfs uninstall` локально; почистить LFS-объекты на GitHub (удаляются только вместе с репо или через поддержку).

Необратимо — делать только осознанно, отдельной сессией.
