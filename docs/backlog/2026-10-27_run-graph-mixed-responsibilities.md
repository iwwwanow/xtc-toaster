# run-graph.ts смешивает ответственности — первый на рефактор

В `packages/server/src/run-graph.ts` всё в одном файле: обход графа (`toPath`, в спринте 4 его заменит вычисление DAG от output с памятью по `nodeId` и composer), перевод единиц contract → lib (`focalLengthPx`, `percentPx`, `perspectiveCorners`, `tanDeg`, `CHANNEL`), чтение картинки из uploads (`loadInput`), раздача нод по вызовам lib (`applyNode`), оркестрация (`runGraph`) и `GraphError`. После composer файл станет ещё толще.

Решение пользователя (27.10): в спринте 4 пишем как есть, но на ручном ревью и рефакторинге (спринт 7) этот файл идёт первым. Возможная разбивка: обход графа (возможно, рядом с `validateGraph` в contract), отдельный модуль перевода единиц, `loadInput` к uploads, `applyNode` + `runGraph` как исполнитель. Заодно связано с `docs/backlog/2026-10-19_split-web-server-contract.md` и с переездом `codec.ts` в lib.
