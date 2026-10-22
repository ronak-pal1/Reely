import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Asset } from "../models.js";
import { deleteObject, putObject, readObject } from "./storage.js";

export const ALLOWED_MEDIA_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/wav",
  "audio/mp4",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

type Probe = {
  durationSeconds: number;
  width?: number;
  height?: number;
  hasAudio: boolean;
  hasVideo: boolean;
};

function run(command: string, args: string[], stdin?: Buffer): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const stderr = Buffer.concat(err).toString();
      if (code !== 0) {
        reject(new Error(`${command} exited ${code}: ${stderr.slice(-500)}`));
        return;
      }
      resolve({ stdout: Buffer.concat(out), stderr });
    });
    if (stdin) child.stdin.end(stdin);
    else child.stdin.end();
  });
}

async function probe(file: string): Promise<Probe> {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    file,
  ]);
  const parsed = JSON.parse(stdout.toString()) as {
    format?: { duration?: string };
    streams?: { codec_type?: string; width?: number; height?: number }[];
  };
  const video = parsed.streams?.find((stream) => stream.codec_type === "video");
  const audio = parsed.streams?.some((stream) => stream.codec_type === "audio") ?? false;
  return {
    durationSeconds: Number(parsed.format?.duration ?? 0),
    width: video?.width,
    height: video?.height,
    hasAudio: audio,
    hasVideo: Boolean(video),
  };
}

async function waveformPeaks(file: string): Promise<number[]> {
  const { stdout } = await run("ffmpeg", [
    "-v",
    "error",
    "-i",
    file,
    "-ac",
    "1",
    "-ar",
    "8000",
    "-f",
    "f32le",
    "pipe:1",
  ]);
  const samples = new Float32Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.length / 4));
  const buckets = 120;
  if (samples.length === 0) return [];
  const size = Math.max(1, Math.floor(samples.length / buckets));
  const peaks: number[] = [];
  for (let i = 0; i < buckets; i += 1) {
    let max = 0;
    const start = i * size;
    const end = Math.min(samples.length, start + size);
    for (let j = start; j < end; j += 1) {
      const value = Math.abs(samples[j] ?? 0);
      if (value > max) max = value;
    }
    peaks.push(Number(max.toFixed(4)));
  }
  return peaks;
}

export async function processAsset(assetId: string): Promise<void> {
  const asset = await Asset.findById(assetId);
  if (!asset || asset.deletedAt) return;
  asset.status = "processing";
  asset.error = undefined;
  await asset.save();
  const dir = await mkdtemp(path.join(tmpdir(), "reelio-"));
  try {
    const source = await readObject(asset.storageKey);
    const input = path.join(dir, "source");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(input, source);
    const info = await probe(input);
    asset.durationSeconds = info.durationSeconds;
    asset.width = info.width;
    asset.height = info.height;
    if (info.hasAudio || asset.contentType.startsWith("audio/")) {
      asset.waveform = await waveformPeaks(input);
    }
    if (info.hasVideo) {
      const proxy = path.join(dir, "proxy.mp4");
      const thumb = path.join(dir, "thumb.jpg");
      const strip = path.join(dir, "strip.jpg");
      await run("ffmpeg", [
        "-y",
        "-i",
        input,
        "-vf",
        "scale=540:-2",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "28",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        proxy,
      ]);
      await run("ffmpeg", ["-y", "-ss", "0.2", "-i", input, "-frames:v", "1", "-vf", "scale=270:-2", thumb]);
      await run("ffmpeg", [
        "-y",
        "-i",
        input,
        "-vf",
        "fps=1,scale=120:-2,tile=8x1",
        "-frames:v",
        "1",
        strip,
      ]);
      const proxyKey = `${asset.storageKey}.proxy.mp4`;
      const thumbKey = `${asset.storageKey}.thumb.jpg`;
      const stripKey = `${asset.storageKey}.strip.jpg`;
      await putObject(proxyKey, await readFile(proxy), "video/mp4");
      await putObject(thumbKey, await readFile(thumb), "image/jpeg");
      await putObject(stripKey, await readFile(strip), "image/jpeg");
      asset.proxyKey = proxyKey;
      asset.thumbnailKey = thumbKey;
      asset.filmstripKey = stripKey;
    } else if (asset.contentType.startsWith("image/")) {
      const thumbKey = `${asset.storageKey}.thumb.jpg`;
      const thumb = path.join(dir, "thumb.jpg");
      await run("ffmpeg", ["-y", "-i", input, "-vf", "scale=270:-2", thumb]);
      await putObject(thumbKey, await readFile(thumb), "image/jpeg");
      asset.thumbnailKey = thumbKey;
    }
    asset.status = "ready";
    await asset.save();
  } catch (error) {
    asset.status = "failed";
    asset.error = error instanceof Error ? error.message : "Media processing failed";
    await asset.save();
    throw error;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function removeAssetFiles(asset: {
  storageKey: string;
  proxyKey?: string | null;
  thumbnailKey?: string | null;
  filmstripKey?: string | null;
}): Promise<void> {
  const keys = [asset.storageKey, asset.proxyKey, asset.thumbnailKey, asset.filmstripKey].filter(
    (key): key is string => Boolean(key),
  );
  await Promise.all(keys.map((key) => deleteObject(key)));
}
