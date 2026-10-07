# Pexels API-ключ в публичной истории

Pexels — бесплатный фотосток (pexels.com) с API для поиска и скачивания фото/видео. В марте 2026 через него качались ассеты для мозаики (`scripts/download-pexels.sh`, `mosaic collect-assets` в старом CLI) — отсюда `assets/downloaded/` и `assets/dataset/`. Сейчас не используется.

`.env` с `PEXELS_API_KEY` был закоммичен 2026-03-27 и до 2026-10-07 лежал в репо; репо `iwwwanow/xtc-toaster` публичный, так что ключ скомпрометирован. Из индекса убран, но в истории остаётся до чистки через filter-repo — `docs/backlog/2026-10-07_lfs-heavy-assets-history-cleanup.md`.

Сделать: отозвать/перевыпустить ключ в кабинете Pexels (pexels.com/api). Если API снова понадобится — новый ключ только в незакоммиченном `.env`.
