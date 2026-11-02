// The render use case: a ToastGraph → runGraph → a PNG. No HTTP/WS/worker concerns here.
import { encodePng } from "@xtc-toaster/lib";
import type { ToastGraph } from "@xtc-toaster/contract";
import { runGraph } from "./run-graph";

export const render = async (graph: ToastGraph, uploadsDir: string, maxLayers?: number) => {
  const { data, width, height } = await runGraph(graph, uploadsDir, maxLayers);
  return { png: encodePng(data, { width, height }), width, height };
};