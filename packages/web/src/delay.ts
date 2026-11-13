import type { Edge } from "@xyflow/svelte";
import type { DelayRow } from "@xtc-toaster/contract";
import { paramLabel, paramOf } from "./animation";
import type { FlowGroup, FlowNode } from "./graph";

// A delay's rows: param → row → track, one shift for all. Pure — the node applies the result to its data.

// a row id is its handles' id (the in and the out), like a layers row
const nextRowId = (rows: readonly DelayRow[]): string => {
  let n = rows.length + 1;
  while (rows.some(({ id }) => id === `row-${n}`)) n++;
  return `row-${n}`;
};

const isLinked = (edges: readonly Edge[], nodeId: string, rowId: string) =>
  edges.some(
    ({ source, sourceHandle, target, targetHandle }) =>
      (target === nodeId && targetHandle === rowId) || (source === nodeId && sourceHandle === rowId),
  );

// always one free row at the bottom, no + button: a param wired into it makes the next one. Rows with a link stay
// where they are, a free one between them too; free rows at the bottom collapse into one. The same array back
// when nothing changes — the node writes only a real change
export const withFreeRow = (rows: readonly DelayRow[], edges: readonly Edge[], nodeId: string): readonly DelayRow[] => {
  let end = rows.length;
  while (end > 0 && !isLinked(edges, nodeId, rows[end - 1]!.id)) end--;
  const next = [...rows.slice(0, end), rows[end] ?? { id: nextRowId(rows) }];
  return next.length === rows.length && next.every((row, index) => row === rows[index]) ? rows : next;
};

// what goes through a row: the param wired into it (`move.x`, behind another delay `move.x +2`); free — a hint
export const delayRowName = (
  nodes: readonly FlowNode[],
  edges: readonly Edge[],
  nodeId: string,
  rowId: string,
  groups: readonly FlowGroup[] = [],
): string => {
  const link = edges.find(({ target, targetHandle }) => target === nodeId && targetHandle === rowId);
  const param = link && paramOf(nodes, edges, link.source, link.sourceHandle);
  return param ? paramLabel(param, groups) : "wire a param here";
};
