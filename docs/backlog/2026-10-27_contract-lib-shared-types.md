# Типы домена дублируются в contract и lib — нужен общий пакет

Одни и те же понятия описаны дважды: каналы — `CHANNELS` (строки, `packages/contract/src/params.ts`) и `Channel` (enum в lib); с composer (спринт 4) — `BLEND_MODES` в contract и `BlendMode` в lib (`packages/lib/domain/types.ts`). Contract не может импортировать lib (web не тянет lib, contract общий для web и server), поэтому списки живут раздельно, а сверяет их только сервер: маппинг `CHANNEL` в `run-graph.ts` и передача blend mode в lib. Новый режим, добавленный в одно место, всплывёт ошибкой typecheck на сервере, а не в момент добавления.

Идея (решено 27.10 — делать потом): вынести такие перечисления в третий, более базовый пакет без зависимостей (условно `@xtc-toaster/types` / `domain-types`), который импортируют и lib, и contract. Заодно решить, остаётся ли `Channel` TS-enum'ом или становится строковым union, как в contract. Связано с `docs/backlog/2026-10-19_split-web-server-contract.md`.
