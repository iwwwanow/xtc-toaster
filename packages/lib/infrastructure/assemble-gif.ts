import { execFile, spawn } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ImageRawDataArray } from "../domain/types";

async function pipeFrames(
  frames: ImageRawDataArray[],
  width: number,
  height: number,
  fps: number,
  args: string[]
): Promise<void> {
  const proc = spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));

  const finished = new Promise<void>((resolve, reject) => {
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}:\n${stderr.slice(-800)}`));
    });
  });

  for (const frame of frames) {
    const buf = Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength);
    const ok = proc.stdin!.write(buf);
    if (!ok) {
      await new Promise<void>((resolve) => proc.stdin!.once("drain", resolve));
    }
  }

  proc.stdin!.end();
  await finished;
}

export function assembleGif(
  frames: ImageRawDataArray[],
  width: number,
  height: number,
  fps: number,
  outputPath: string
): Promise<void> {
  const args = [
    "-y",
    "-f", "rawvideo", "-pix_fmt", "rgba",
    "-s", `${width}x${height}`,
    "-r", String(fps),
    "-i", "pipe:0",
    "-vf", `fps=${fps},split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse=dither=sierra2_4a`,
    outputPath,
  ];
  return pipeFrames(frames, width, height, fps, args);
}

export async function loopVideoTo(
  inputPath: string,
  targetSeconds: number,
  outputPath: string
): Promise<void> {
  // Re-encode instead of `-c copy`: stream copy can only cut on packet
  // boundaries and overshoots (3 s → 3.33 s), leaving a partial cycle at the
  // loop seam. Re-encoding cuts on the exact frame.
  const args = [
    "-y",
    "-stream_loop", "-1",
    "-i", inputPath,
    "-t", String(targetSeconds),
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    outputPath,
  ];
  const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
  await new Promise<void>((resolve, reject) => {
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}:\n${stderr.slice(-800)}`));
    });
  });
}

// r_frame_rate as ffprobe prints it ("30000/1001") — the fps filter takes the fraction as is
async function probeFrameRate(path: string): Promise<string> {
  const { stdout } = await promisify(execFile)("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=r_frame_rate",
    "-of", "csv=p=0",
    path,
  ]);
  return stdout.trim();
}

export async function speedUpVideo(
  inputPath: string,
  speed: number,
  outputPath: string
): Promise<void> {
  const fps = await probeFrameRate(inputPath);
  const args = [
    "-y",
    "-i", inputPath,
    // fps=<source rate> keeps the input frame rate by dropping frames; without it
    // ffmpeg duplicates frames and the clip comes out longer than duration/speed.
    // The rate is probed, not `fps=source_fps`: ffmpeg 7.1 (debian trixie, the CI
    // image) fails on it with "encoder timebase is not set"
    "-vf", `setpts=PTS/${speed},fps=${fps}`,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    outputPath,
  ];
  const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
  await new Promise<void>((resolve, reject) => {
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}:\n${stderr.slice(-800)}`));
    });
  });
}

export function assembleVideo(
  frames: ImageRawDataArray[],
  width: number,
  height: number,
  fps: number,
  outputPath: string
): Promise<void> {
  // libx264 requires even dimensions
  const w = width % 2 === 0 ? width : width + 1;
  const h = height % 2 === 0 ? height : height + 1;
  const args = [
    "-y",
    "-f", "rawvideo", "-pix_fmt", "rgba",
    "-s", `${width}x${height}`,
    "-r", String(fps),
    "-i", "pipe:0",
    "-vf", `pad=${w}:${h}`,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    outputPath,
  ];
  return pipeFrames(frames, width, height, fps, args);
}

// ffmpeg with no stdin; rejects with the tail of its stderr
function runFfmpeg(args: string[]): Promise<void> {
  const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
  return new Promise<void>((resolve, reject) => {
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}:\n${stderr.slice(-800)}`));
    });
  });
}

// a frame's file in a sequence: frame-0000.png, frame-0001.png, … — what assembleGifFromFrames reads
export const sequenceFrameName = (index: number) => `frame-${String(index).padStart(4, "0")}.png`;

// the gif muxer's -loop: how many times the clip plays, undefined — forever. ffmpeg counts repeats after the
// first play: 0 is forever, -1 plays once
export const gifLoopArg = (plays: number | undefined): number =>
  plays === undefined ? 0 : plays <= 1 ? -1 : plays - 1;

// a png's size from its IHDR chunk: width and height are the first two fields, big-endian, at bytes 16 and 20
async function pngSize(path: string): Promise<{ width: number; height: number }> {
  const header = Buffer.from(await Bun.file(path).slice(0, 24).arrayBuffer());
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

// the background of an exported animation: a gif pixel is either opaque or fully transparent, so a frame is
// flattened onto it — a fading layer fades into white instead of blinking out at half opacity (decided 07.11).
// mp4 has no alpha at all, it gets the same white
const ANIMATION_BACKGROUND = "white";

export type SequenceOptions = {
  // how many frames the file holds: the sequence repeated, the last pass cut on a frame. Absent — the sequence
  // once. Repeats cost no render: ffmpeg reads the same pngs again (-stream_loop)
  frames?: number;
};

// a png sequence as ffmpeg's input; `loop` — read it over and over (the output's -frames:v stops it)
const sequenceInput = (dir: string, fps: number, loop: boolean) => [
  ...(loop ? ["-stream_loop", "-1"] : []),
  "-framerate", String(fps),
  "-i", join(dir, "frame-%04d.png"),
];
const fileFrames = (frames: number | undefined) => (frames === undefined ? [] : ["-frames:v", String(frames)]);

// every frame laid over ANIMATION_BACKGROUND, in rgb — overlay's default yuv420 would blur the colors
const flattenFilter = async (dir: string, fps: number) => {
  const { width, height } = await pngSize(join(dir, sequenceFrameName(0)));
  return (
    `color=c=${ANIMATION_BACKGROUND}:s=${width}x${height}:r=${fps}[bg];` +
    "[bg][0:v]overlay=shortest=1:format=rgb,format=rgb24"
  );
};

export type GifOptions = SequenceOptions & {
  // how many times the player plays the file, absent — forever (the muxer's -loop, gifLoopArg)
  plays?: number;
};

// A gif from a png sequence on disk (`sequenceFrameName` in `dir`), in two passes: a palette over one pass of
// the sequence, then the frames through it. ffmpeg reads one frame at a time — the one-pass split + palettegen
// holds the whole clip in memory until the palette is ready. The palette goes into `dir` too
export async function assembleGifFromFrames(
  dir: string,
  fps: number,
  outputPath: string,
  { plays, frames }: GifOptions = {},
): Promise<void> {
  const flatten = await flattenFilter(dir, fps);
  const palette = join(dir, "palette.png");
  // the palette from one pass: a repeated pass has no new colors (and a looped input would never end)
  await runFfmpeg(["-y", ...sequenceInput(dir, fps, false), "-filter_complex", `${flatten},palettegen=stats_mode=full`, palette]);
  await runFfmpeg([
    "-y",
    ...sequenceInput(dir, fps, frames !== undefined),
    "-i", palette,
    "-filter_complex", `${flatten}[flat];[flat][1:v]paletteuse=dither=sierra2_4a`,
    ...fileFrames(frames),
    "-loop", String(gifLoopArg(plays)),
    outputPath,
  ]);
}

// An mp4 (h264, yuv420p — what every player takes) from a png sequence on disk, in one pass. yuv420p needs an
// even size: an odd side is padded by a white pixel. mp4 has no loop flag — repeats are frames in the file
export async function assembleMp4FromFrames(
  dir: string,
  fps: number,
  outputPath: string,
  { frames }: SequenceOptions = {},
): Promise<void> {
  const flatten = await flattenFilter(dir, fps);
  await runFfmpeg([
    "-y",
    ...sequenceInput(dir, fps, frames !== undefined),
    "-filter_complex", `${flatten},pad=ceil(iw/2)*2:ceil(ih/2)*2:color=${ANIMATION_BACKGROUND},format=yuv420p`,
    ...fileFrames(frames),
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    outputPath,
  ]);
}
