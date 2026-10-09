import { parseToastGraph, type ToastGraph } from "@xtc-toaster/contract";
import json from "./toast.json";

// parsed on import — a broken preset fails here, not in the ui
export const toast2signac: ToastGraph = parseToastGraph(json);
