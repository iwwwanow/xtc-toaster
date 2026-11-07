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

// the gif's background: a gif pixel is either opaque or fully transparent, so a frame is flattened onto it —
// a fading layer fades into white instead of blinking out at half opacity (decided 07.11)
const GIF_BACKGROUND = "white";

// A gif from a png sequence on disk (`sequenceFrameName` in `dir`), in two passes: a palette over every frame,
// then the frames through it. ffmpeg reads one frame at a time — the one-pass split + palettegen holds the
// whole clip in memory until the palette is ready. The palette goes into `dir` too. Every frame is laid over
// GIF_BACKGROUND first (overlay in rgb — its default yuv420 would blur the colors)
export async function assembleGifFromFrames(
  dir: string,
  fps: number,
  outputPath: string,
  plays?: number,
): Promise<void> {
  const { width, height } = await pngSize(join(dir, sequenceFrameName(0)));
  const input = ["-framerate", String(fps), "-i", join(dir, "frame-%04d.png")];
  const flatten =
    `color=c=${GIF_BACKGROUND}:s=${width}x${height}:r=${fps}[bg];` +
    "[bg][0:v]overlay=shortest=1:format=rgb,format=rgb24";
  const palette = join(dir, "palette.png");
  await runFfmpeg(["-y", ...input, "-filter_complex", `${flatten},palettegen=stats_mode=full`, palette]);
  await runFfmpeg([
    "-y",
    ...input,
    "-i", palette,
    "-filter_complex", `${flatten}[flat];[flat][1:v]paletteuse=dither=sierra2_4a`,
    "-loop", String(gifLoopArg(plays)),
    outputPath,
  ]);
}
