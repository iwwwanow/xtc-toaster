// The render use case: a ToastGraph → runGraph → a PNG. No HTTP/WS/worker concerns here.
import { encodePng } from "@xtc-toaster/lib";
import type { ToastGraph } from "@xtc-toaster/contract";
import { runGraph, type LoadImage } from "./run-graph";

export const render = async (graph: ToastGraph, loadImage: LoadImage, maxLayers?: number) => {
  const { data, width, height } = await runGraph(graph, loadImage, maxLayers);
  return { png: encodePng(data, { width, height }), width, height };
};