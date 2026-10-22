import { z } from "zod";

export const SCHEMA_VERSION = 1;

export const AspectSchema = z.enum(["9:16", "1:1", "16:9"]);
export type Aspect = z.infer<typeof AspectSchema>;

export const ASPECTS: Record<Aspect, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
};

export const TrackTypeSchema = z.enum([
  "video",
  "audio",
  "text",
  "caption",
  "sticker",
  "effect",
]);
export type TrackType = z.infer<typeof TrackTypeSchema>;

export const EasingSchema = z.enum(["linear", "easeIn", "easeOut", "easeInOut"]);
export type EasingName = z.infer<typeof EasingSchema>;

export const KeyframeSchema = z.object({
  frame: z.number().int().nonnegative(),
  value: z.number(),
  easing: EasingSchema.default("linear"),
});
export type Keyframe = z.infer<typeof KeyframeSchema>;

export const KeyframesSchema = z
  .object({
    x: z.array(KeyframeSchema).optional(),
    y: z.array(KeyframeSchema).optional(),
    scale: z.array(KeyframeSchema).optional(),
    rotate: z.array(KeyframeSchema).optional(),
    opacity: z.array(KeyframeSchema).optional(),
    volume: z.array(KeyframeSchema).optional(),
  })
  .default({});
export type Keyframes = z.infer<typeof KeyframesSchema>;

export const TransformSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  scale: z.number().positive().default(1),
  rotate: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
});
export type Transform = z.infer<typeof TransformSchema>;

export const EffectTypeSchema = z.enum([
  "fisheye",
  "glitch",
  "zoomPunch",
  "shake",
  "blur",
  "lut",
  "vignette",
  "grain",
]);
export type EffectType = z.infer<typeof EffectTypeSchema>;

export const EffectSchema = z.object({
  id: z.string().min(1),
  type: EffectTypeSchema,
  intensity: z.number().min(0).max(1).default(0.5),
  props: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});
export type Effect = z.infer<typeof EffectSchema>;

export const TransitionTypeSchema = z.enum(["none", "fade", "slide", "zoom", "whip"]);
export type TransitionType = z.infer<typeof TransitionTypeSchema>;

export const TransitionSchema = z.object({
  type: TransitionTypeSchema,
  durationInFrames: z.number().int().nonnegative().default(0),
  direction: z.enum(["left", "right", "up", "down"]).optional(),
});
export type Transition = z.infer<typeof TransitionSchema>;

export const CaptionStyleSchema = z.enum([
  "classic",
  "bold",
  "karaoke",
  "wordHighlight",
  "popIn",
  "hormozi",
  "minimal",
  "outline",
  "gradient",
  "boxed",
]);
export type CaptionStyle = z.infer<typeof CaptionStyleSchema>;

export const TextAnimationSchema = z.enum([
  "none",
  "fade",
  "slide",
  "pop",
  "wipe",
  "karaoke",
  "wordHighlight",
  "popIn",
]);
export type TextAnimation = z.infer<typeof TextAnimationSchema>;

export const WordSchema = z.object({
  text: z.string(),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
});
export type WordTiming = z.infer<typeof WordSchema>;

export const ClipPropsSchema = z
  .object({
    text: z.string().optional(),
    fontFamily: z.string().optional(),
    fontWeight: z.number().optional(),
    fontSize: z.number().positive().optional(),
    letterSpacing: z.number().optional(),
    lineHeight: z.number().positive().optional(),
    align: z.enum(["left", "center", "right"]).optional(),
    color: z.string().optional(),
    backgroundColor: z.string().optional(),
    animation: TextAnimationSchema.optional(),
    captionStyle: CaptionStyleSchema.optional(),
    words: z.array(WordSchema).optional(),
    assetId: z.string().optional(),
    proxySrc: z.string().optional(),
    language: z.string().optional(),
    lut: z.enum(["none", "warm", "cool", "bw", "vivid", "teal", "film"]).optional(),
    sticker: z.string().optional(),
    imageSrc: z.string().optional(),
  })
  .strict()
  .default({});
export type ClipProps = z.infer<typeof ClipPropsSchema>;

export const ClipSchema = z.object({
  id: z.string().min(1),
  src: z.string().optional(),
  name: z.string().optional(),
  from: z.number().int().nonnegative(),
  durationInFrames: z.number().int().positive(),
  trimStart: z.number().nonnegative().default(0),
  volume: z.number().min(0).max(4).default(1),
  speed: z.number().min(0.25).max(4).default(1),
  transform: TransformSchema.default({}),
  effects: z.array(EffectSchema).default([]),
  transitionIn: TransitionSchema.optional(),
  transitionOut: TransitionSchema.optional(),
  keyframes: KeyframesSchema,
  props: ClipPropsSchema,
  fadeInFrames: z.number().int().nonnegative().default(0),
  fadeOutFrames: z.number().int().nonnegative().default(0),
});
export type Clip = z.infer<typeof ClipSchema>;

export const TrackSchema = z.object({
  id: z.string().min(1),
  type: TrackTypeSchema,
  name: z.string().min(1),
  locked: z.boolean().default(false),
  hidden: z.boolean().default(false),
  muted: z.boolean().default(false),
  clips: z.array(ClipSchema).default([]),
});
export type Track = z.infer<typeof TrackSchema>;

export const MarkerSchema = z.object({
  id: z.string().min(1),
  frame: z.number().int().nonnegative(),
  label: z.string(),
});
export type Marker = z.infer<typeof MarkerSchema>;

export const ProjectSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    id: z.string().min(1),
    name: z.string().min(1),
    fps: z.number().int().min(1).max(60),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    aspect: AspectSchema,
    background: z.string().default("#000000"),
    tracks: z.array(TrackSchema).default([]),
    markers: z.array(MarkerSchema).default([]),
  })
  .superRefine((project, ctx) => {
    const trackIds = new Set<string>();
    const clipIds = new Set<string>();
    for (const track of project.tracks) {
      if (trackIds.has(track.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate track id ${track.id}`,
        });
      }
      trackIds.add(track.id);
      for (const clip of track.clips) {
        if (clipIds.has(clip.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate clip id ${clip.id}`,
          });
        }
        clipIds.add(clip.id);
        if (clip.fadeInFrames + clip.fadeOutFrames > clip.durationInFrames) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Fades exceed duration on clip ${clip.id}`,
          });
        }
      }
    }
  });
export type Project = z.infer<typeof ProjectSchema>;

export function projectDurationInFrames(project: Project): number {
  let max = 1;
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      max = Math.max(max, clip.from + clip.durationInFrames);
    }
  }
  return max;
}

export function projectDurationSeconds(project: Project): number {
  return projectDurationInFrames(project) / project.fps;
}

export function createEmptyProject(options?: {
  id?: string;
  name?: string;
  aspect?: Aspect;
  fps?: number;
}): Project {
  const aspect = options?.aspect ?? "9:16";
  const size = ASPECTS[aspect];
  const track = (type: TrackType, name: string): Track =>
    TrackSchema.parse({
      id: crypto.randomUUID(),
      type,
      name,
      clips: [],
    });
  return ProjectSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    id: options?.id ?? crypto.randomUUID(),
    name: options?.name ?? "Untitled",
    fps: options?.fps ?? 30,
    width: size.width,
    height: size.height,
    aspect,
    background: "#000000",
    tracks: [
      track("video", "Video"),
      track("text", "Text"),
      track("audio", "Audio"),
      track("caption", "Captions"),
      track("sticker", "Stickers"),
      track("effect", "Effects"),
    ],
    markers: [],
  });
}
