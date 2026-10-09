# Имя выходного файла degas не по правилу проекта

Degas пишет `baked/degas_<YYYYMMDD-HHmmss>_<inputStem>.mp4`, а правило из CLAUDE.md («Output file naming») — `<toast>_<YYYYMMDD-HHmmss>.<ext>`, то есть `toast-1_degas_<ts>.mp4`. Открытый вопрос: выкинуть имя входной картинки (degas принимает её через `-i`) или оставить суффиксом — `toast-1_degas_<ts>_<inputStem>.mp4`. Если суффикс оставлять, правило в CLAUDE.md стоит расширить необязательным `_<suffix>`, иначе degas так и останется исключением. TODO висит в `packages/toasts/src/toasts/toast-1_degas/index.ts` у строки `slug`.
