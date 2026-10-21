# Контейнер от root → пользователь `bun`

Образ `xtc-toaster` сейчас работает от root: `USER` в `Dockerfile` не задан. Если через уязвимость в сервере (например, в декодере картинок `canvas`) кто-то получит выполнение кода, у него будут права root в контейнере, а это повышает шансы выбраться наружу, если найдётся уязвимость в самом docker.

В спринте 3 решили так (вариант А): root остаётся, а права режем в compose-стеке infra — `cap_drop: ALL`, `read_only: true` (+ tmpfs; писать можно только в uploads), `security_opt: no-new-privileges:true`. `Dockerfile` не меняется, лишних шагов в Ansible нет.

Позже, вместе с ревью `server` из stretch, — вариант Б: `USER bun` (uid 1000 есть в `oven/bun`) поверх ограничений А. Цена: `/srv/xtc-toaster/uploads` на `ru-timeweb` должен принадлежать uid 1000 — каталог создаёт Ansible с нужным владельцем. Ещё нужно проверить named volume uploads в dev compose: в нём уже лежат файлы, созданные от root. А + Б вместе дают максимум.

подробности — `docs/diary/2026-10-21_sprint-3-ci-cd-and-server-prod.md`
