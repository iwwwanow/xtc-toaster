import { parseToastGraph, type ToastGraph } from "@xtc-toaster/contract";
import json from "./toast.json";

// toast-1 as a graph: the script's 7 layers as layers rows (index.ts stays the video CLI —
// it runs on import, so the barrel takes this file, never index.ts). Perspective / translate are identity
// at t = 0 in `data`; the animation node moves them as the script does (24 frames at 36 fps,
// a 15 s loop, keys at the first and last frame — every value is linear in t). Blur is in px: the script takes 0.48 /
// 0.24 / 0.1 % of the width, here — for a ~1600 px wide picture (2 MP), so 8 / 4 / 2.
// Parsed on import — a broken preset fails here, not in the ui.
export const toast1degas: ToastGraph = parseToastGraph(json);
