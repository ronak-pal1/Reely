import { z } from "zod";
import {
  ASPECTS,
  AspectSchema,
  ClipSchema,
  MarkerSchema,
  ProjectSchema,
  TrackSchema,
  type Clip,
  type Project,
  type Track,
} from "./schema.js";

export class PatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PatchError";
  }
}

const SETTABLE = new Set([
  "src",
  "name",
  "from",
  "durationInFrames",
  "trimStart",
  "volume",
  "speed",
  "transform",
  "effects",
  "transitionIn",
  "transitionOut",
  "props",
  "keyframes",
  "fadeInFrames",
  "fadeOutFrames",
]);

export const PatchOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add_clip"),
    trackId: z.string().min(1),
    clip: ClipSchema,
    index: z.number().int().nonnegative().optional(),
  }),
  z.object({
    op: z.literal("add_track"),
    track: TrackSchema,
    index: z.number().int().nonnegative().optional(),
  }),
  z.object({
    op: z.literal("split"),
    trackId: z.string().min(1),
    clipId: z.string().min(1),
    atFrame: z.number().int(),
  }),
  z.object({
    op: z.literal("trim"),
    trackId: z.string().min(1),
    clipId: z.string().min(1),
    from: z.number().int().nonnegative().optional(),
    durationInFrames: z.number().int().positive().optional(),
    trimStart: z.number().nonnegative().optional(),
  }),
  z.object({
    op: z.literal("delete"),
    trackId: z.string().min(1),
    clipId: z.string().min(1),
    ripple: z.boolean().optional(),
  }),
  z.object({
    op: z.literal("move"),
    trackId: z.string().min(1),
    clipId: z.string().min(1),
    toTrackId: z.string().min(1).optional(),
    toFrame: z.number().int().nonnegative(),
  }),
  z.object({
    op: z.literal("set_prop"),
    trackId: z.string().min(1),
    clipId: z.string().min(1),
    path: z.string().min(1),
    value: z.unknown(),
  }),
  z.object({
    op: z.literal("add_caption_track"),
    clips: z.array(ClipSchema),
    replace: z.boolean().optional(),
  }),
  z.object({
    op: z.literal("duplicate_clip"),
    trackId: z.string().min(1),
    clipId: z.string().min(1),
  }),
  z.object({
    op: z.literal("set_track"),
    trackId: z.string().min(1),
    locked: z.boolean().optional(),
    hidden: z.boolean().optional(),
    muted: z.boolean().optional(),
    name: z.string().min(1).optional(),
  }),
  z.object({
    op: z.literal("set_project"),
    name: z.string().min(1).optional(),
    fps: z.number().int().min(1).max(60).optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    aspect: AspectSchema.optional(),
    background: z.string().optional(),
  }),
  z.object({
    op: z.literal("add_marker"),
    marker: MarkerSchema,
  }),
  z.object({
    op: z.literal("delete_marker"),
    markerId: z.string().min(1),
  }),
]);

export type PatchOp = z.infer<typeof PatchOpSchema>;
export type PatchOpInput = z.input<typeof PatchOpSchema>;

function mustTrack(project: Project, trackId: string): Track {
  const track = project.tracks.find((item) => item.id === trackId);
  if (!track) throw new PatchError(`Track ${trackId} not found`);
  if (track.locked) throw new PatchError(`Track ${track.name} is locked`);
  return track;
}

function mustClip(track: Track, clipId: string): Clip {
  const clip = track.clips.find((item) => item.id === clipId);
  if (!clip) throw new PatchError(`Clip ${clipId} not found`);
  return clip;
}

function assertUniqueClip(project: Project, clipId: string): void {
  for (const track of project.tracks) {
    if (track.clips.some((clip) => clip.id === clipId)) {
      throw new PatchError(`Clip id ${clipId} already exists`);
    }
  }
}

function setAllowedPath(clip: Clip, path: string, value: unknown): Clip {
  const parts = path.split(".").filter((part) => part.length > 0);
  if (
    parts.length === 0 ||
    parts.some((part) => part === "__proto__" || part === "constructor" || part === "prototype")
  ) {
    throw new PatchError(`Invalid property path: ${path}`);
  }
  const root = parts[0];
  if (!root || !SETTABLE.has(root)) {
    throw new PatchError(`Cannot set ${path}`);
  }
  if (root === "speed" && parts.length === 1) {
    const speed = z.number().min(0.25).max(4).parse(value);
    const sourceFrames = clip.durationInFrames * clip.speed;
    const durationInFrames = Math.max(1, Math.round(sourceFrames / speed));
    return ClipSchema.parse({ ...clip, speed, durationInFrames });
  }
  const clone = structuredClone(clip) as Record<string, unknown>;
  let cursor: Record<string, unknown> = clone;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!key) throw new PatchError(`Invalid property path: ${path}`);
    const next = cursor[key];
    if (next === null || typeof next !== "object" || Array.isArray(next)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1];
  if (!leaf) throw new PatchError(`Invalid property path: ${path}`);
  cursor[leaf] = value;
  return ClipSchema.parse(clone);
}

function applyOne(project: Project, op: PatchOp): Project {
  const next = structuredClone(project) as Project;
  switch (op.op) {
    case "add_track": {
      if (next.tracks.some((track) => track.id === op.track.id)) {
        throw new PatchError(`Track id ${op.track.id} already exists`);
      }
      const index = op.index ?? next.tracks.length;
      next.tracks.splice(index, 0, op.track);
      break;
    }
    case "add_clip": {
      const track = mustTrack(next, op.trackId);
      assertUniqueClip(next, op.clip.id);
      const index = op.index ?? track.clips.length;
      track.clips.splice(index, 0, op.clip);
      break;
    }
    case "split": {
      const track = mustTrack(next, op.trackId);
      const clip = mustClip(track, op.clipId);
      const local = op.atFrame - clip.from;
      if (local <= 0 || local >= clip.durationInFrames) {
        throw new PatchError("Split frame is outside the clip");
      }
      const rightId = crypto.randomUUID();
      const right = ClipSchema.parse({
        ...structuredClone(clip),
        id: rightId,
        name: clip.name ? `${clip.name} (2)` : undefined,
        from: op.atFrame,
        durationInFrames: clip.durationInFrames - local,
        trimStart: clip.trimStart + local * clip.speed,
      });
      clip.durationInFrames = local;
      const index = track.clips.findIndex((item) => item.id === clip.id);
      track.clips.splice(index + 1, 0, right);
      break;
    }
    case "trim": {
      const track = mustTrack(next, op.trackId);
      const clip = mustClip(track, op.clipId);
      if (op.from !== undefined) clip.from = op.from;
      if (op.durationInFrames !== undefined) clip.durationInFrames = op.durationInFrames;
      if (op.trimStart !== undefined) clip.trimStart = op.trimStart;
      const parsed = ClipSchema.parse(clip);
      const index = track.clips.findIndex((item) => item.id === clip.id);
      track.clips[index] = parsed;
      break;
    }
    case "delete": {
      const track = mustTrack(next, op.trackId);
      const index = track.clips.findIndex((item) => item.id === op.clipId);
      if (index < 0) throw new PatchError(`Clip ${op.clipId} not found`);
      const [removed] = track.clips.splice(index, 1);
      if (op.ripple && removed) {
        for (const clip of track.clips) {
          if (clip.from >= removed.from) {
            clip.from = Math.max(0, clip.from - removed.durationInFrames);
          }
        }
      }
      break;
    }
    case "move": {
      const source = mustTrack(next, op.trackId);
      const index = source.clips.findIndex((item) => item.id === op.clipId);
      if (index < 0) throw new PatchError(`Clip ${op.clipId} not found`);
      const destinationId = op.toTrackId ?? op.trackId;
      const destination = destinationId === source.id ? source : mustTrack(next, destinationId);
      if (destination.type !== source.type) {
        throw new PatchError("Clips can only move between tracks of the same type");
      }
      const [clip] = source.clips.splice(index, 1);
      if (!clip) throw new PatchError(`Clip ${op.clipId} not found`);
      clip.from = op.toFrame;
      destination.clips.push(clip);
      destination.clips.sort((a, b) => a.from - b.from);
      break;
    }
    case "set_prop": {
      const track = mustTrack(next, op.trackId);
      const clip = mustClip(track, op.clipId);
      const updated = setAllowedPath(clip, op.path, op.value);
      const index = track.clips.findIndex((item) => item.id === clip.id);
      track.clips[index] = updated;
      break;
    }
    case "add_caption_track": {
      let track = next.tracks.find((item) => item.type === "caption" && !item.locked);
      if (!track) {
        track = TrackSchema.parse({
          id: crypto.randomUUID(),
          type: "caption",
          name: "Captions",
          clips: [],
        });
        next.tracks.push(track);
      }
      if (op.replace) track.clips = [];
      for (const clip of op.clips) {
        assertUniqueClip(next, clip.id);
        track.clips.push(clip);
      }
      break;
    }
    case "duplicate_clip": {
      const track = mustTrack(next, op.trackId);
      const clip = mustClip(track, op.clipId);
      const copy = ClipSchema.parse({
        ...structuredClone(clip),
        id: crypto.randomUUID(),
        name: clip.name ? `${clip.name} copy` : undefined,
        from: clip.from + clip.durationInFrames,
      });
      track.clips.push(copy);
      break;
    }
    case "set_track": {
      const track = next.tracks.find((item) => item.id === op.trackId);
      if (!track) throw new PatchError(`Track ${op.trackId} not found`);
      if (op.locked !== undefined) track.locked = op.locked;
      if (op.hidden !== undefined) track.hidden = op.hidden;
      if (op.muted !== undefined) track.muted = op.muted;
      if (op.name !== undefined) track.name = op.name;
      break;
    }
    case "set_project": {
      if (op.name !== undefined) next.name = op.name;
      if (op.fps !== undefined) next.fps = op.fps;
      if (op.background !== undefined) next.background = op.background;
      if (op.aspect !== undefined) {
        next.aspect = op.aspect;
        if (op.width === undefined && op.height === undefined) {
          next.width = ASPECTS[op.aspect].width;
          next.height = ASPECTS[op.aspect].height;
        }
      }
      if (op.width !== undefined) next.width = op.width;
      if (op.height !== undefined) next.height = op.height;
      break;
    }
    case "add_marker": {
      if (next.markers.some((marker) => marker.id === op.marker.id)) {
        throw new PatchError(`Marker ${op.marker.id} already exists`);
      }
      next.markers.push(op.marker);
      next.markers.sort((a, b) => a.frame - b.frame);
      break;
    }
    case "delete_marker": {
      const index = next.markers.findIndex((marker) => marker.id === op.markerId);
      if (index < 0) throw new PatchError(`Marker ${op.markerId} not found`);
      next.markers.splice(index, 1);
      break;
    }
    default: {
      const neverOp: never = op;
      throw new PatchError(`Unsupported patch ${(neverOp as { op: string }).op}`);
    }
  }
  return ProjectSchema.parse(next);
}

export function applyPatchOps(project: Project, ops: PatchOpInput[]): Project {
  const parsed = z.array(PatchOpSchema).parse(ops);
  return parsed.reduce((current, op) => applyOne(current, op), ProjectSchema.parse(project));
}

export function describePatch(op: PatchOp): string {
  switch (op.op) {
    case "add_clip":
      return `Add clip ${op.clip.name ?? op.clip.id}`;
    case "add_track":
      return `Add ${op.track.type} track ${op.track.name}`;
    case "split":
      return `Split clip at frame ${op.atFrame}`;
    case "trim":
      return `Trim clip ${op.clipId}`;
    case "delete":
      return op.ripple ? `Ripple delete clip ${op.clipId}` : `Delete clip ${op.clipId}`;
    case "move":
      return `Move clip to frame ${op.toFrame}`;
    case "set_prop":
      return `Set ${op.path}`;
    case "add_caption_track":
      return op.replace ? "Replace captions" : "Add captions";
    case "duplicate_clip":
      return `Duplicate clip ${op.clipId}`;
    case "set_track":
      return `Update track ${op.trackId}`;
    case "set_project":
      return "Update project settings";
    case "add_marker":
      return `Add marker ${op.marker.label}`;
    case "delete_marker":
      return `Delete marker ${op.markerId}`;
    default:
      return "Edit timeline";
  }
}
