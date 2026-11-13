// The render-animation use case: one cycle of the graph's animation node → a gif or an mp4. Every frame is the
// usual render of `graphAtFrame`, written as a png into a sequence on disk — the container's memory has no room
// for the clip (docs/backlog/2026-11-06_animation-frames-in-memory.md) — then lib assembles the file from it.
import { join } from "node:path";
import {
  expandGroups,
  graphAtFrame,
  type AnimationExport,
  type AnimationFormat,
  type AnimationNode,
  type ToastGraph,
} from "@xtc-toaster/contract";
import { assembleGifFromFrames, assembleMp4FromFrames, sequenceFrameName } from "@xtc-toaster/lib";
import { GraphError } from "./run-graph";

// the frame cap when RENDER_MAX_FRAMES is unset
export const RENDER_MAX_FRAMES_DEFAULT = 48;

// the port to the renderer: one frame's graph → a png at `pngPath` (render-worker.ts behind the render queue)
export type RenderFrameTo = (graph: ToastGraph, pngPath: string) => Promise<void>;

export const animationFormat = (graph: ToastGraph): AnimationFormat => graph.export?.format ?? "gif";

// What the file holds. Only one cycle is ever rendered: `frames` — the frames written into the file (the cycle
// repeated, the last pass cut on a frame; absent — the cycle once), `plays` — how many times a player plays the
// file (gif's loop flag; absent — forever; mp4 has none, its repeats are frames).
// `reps` — whole cycles; `seconds` — rounded to whole cycles (at least one, as the degas script does) unless
// `wholeCycles` is false: then exactly `seconds`, at least one frame
export type AnimationLength = { frames?: number; plays?: number };

export const animationLength = (
  { fps, frames }: Pick<AnimationNode["data"], "fps" | "frames">,
  { format = "gif", loop }: AnimationExport = {},
): AnimationLength => {
  const cycles = !loop ? 1 : "reps" in loop ? loop.reps : Math.max(1, Math.round(loop.seconds / (frames / fps)));
  const exact = loop && "seconds" in loop && loop.wholeCycles === false;
  if (exact) return { frames: Math.max(1, Math.round(loop.seconds * fps)), plays: 1 };
  if (format === "mp4") return cycles === 1 ? {} : { frames: cycles * frames };
  return loop ? { plays: cycles } : {};
};

export type RenderAnimationOptions = {
  graph: ToastGraph;
  renderFrameTo: RenderFrameTo;
  // the sequence goes here (and the palette), the caller removes it
  framesDir: string;
  // the file, in animationFormat(graph)
  outputPath: string;
  maxFrames?: number;
  // after each rendered frame: `frame` of `frames` done
  onFrame?: (frame: number, frames: number) => void;
};

export const renderAnimation = async ({
  graph,
  renderFrameTo,
  framesDir,
  outputPath,
  maxFrames = RENDER_MAX_FRAMES_DEFAULT,
  onFrame,
}: RenderAnimationOptions) => {
  const node = graph.nodes.find((node): node is AnimationNode => node.type === "animation");
  if (!node) throw new GraphError("add an animation node");
  const { fps, frames } = node.data;
  if (frames > maxFrames) throw new GraphError(`frames: at most ${maxFrames}`, node.id);

  // groups expanded once: a track wired to a group's param drives the inner node's param through the plain graphAtFrame
  const plain = expandGroups(graph);
  for (let frame = 0; frame < frames; frame++) {
    await renderFrameTo(graphAtFrame(plain, frame), join(framesDir, sequenceFrameName(frame)));
    onFrame?.(frame + 1, frames);
  }
  const length = animationLength(node.data, graph.export);
  if (animationFormat(graph) === "mp4") await assembleMp4FromFrames(framesDir, fps, outputPath, length);
  else await assembleGifFromFrames(framesDir, fps, outputPath, length);
};
