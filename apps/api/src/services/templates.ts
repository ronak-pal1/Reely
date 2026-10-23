import { applyPatchOps, createEmptyProject, type Project } from "@reelio/timeline-schema";
import { Template } from "../models.js";

function titled(name: string, text: string, caption: string): Project {
  const project = createEmptyProject({ name, aspect: "9:16" });
  const video = project.tracks.find((track) => track.type === "video");
  const textTrack = project.tracks.find((track) => track.type === "text");
  const captionTrack = project.tracks.find((track) => track.type === "caption");
  if (!video || !textTrack || !captionTrack) return project;
  return applyPatchOps(project, [
    {
      op: "add_clip",
      trackId: video.id,
      clip: {
        id: crypto.randomUUID(),
        name: "Plate",
        from: 0,
        durationInFrames: 150,
        props: { backgroundColor: "#14081f" },
        effects: [{ id: crypto.randomUUID(), type: "vignette", intensity: 0.55 }],
      },
    },
    {
      op: "add_clip",
      trackId: textTrack.id,
      clip: {
        id: crypto.randomUUID(),
        name: "Title",
        from: 0,
        durationInFrames: 150,
        transform: { x: 0, y: -180, scale: 1, rotate: 0, opacity: 1 },
        props: {
          text,
          fontFamily: "Inter",
          fontWeight: 760,
          fontSize: 92,
          align: "center",
          color: "#FFFFFF",
          animation: "pop",
        },
      },
    },
    {
      op: "add_clip",
      trackId: captionTrack.id,
      clip: {
        id: crypto.randomUUID(),
        name: "Caption",
        from: 12,
        durationInFrames: 120,
        transform: { x: 0, y: 520, scale: 1, rotate: 0, opacity: 1 },
        props: {
          text: caption,
          captionStyle: "wordHighlight",
          fontFamily: "Inter",
          fontWeight: 700,
          fontSize: 54,
          align: "center",
          color: "#FFFFFF",
          words: caption.split(" ").map((word, index) => ({
            text: word,
            startMs: index * 380,
            endMs: (index + 1) * 380,
          })),
        },
      },
    },
  ]);
}

export const BUILTIN_TEMPLATES = [
  {
    slug: "hook-title",
    name: "Hook title",
    description: "A vertical title card with a highlighted caption.",
    category: "Talking head",
    aspect: "9:16" as const,
    timeline: titled("Hook title", "Wait for it", "This is the hook"),
  },
  {
    slug: "outfit-check",
    name: "Outfit check",
    description: "Bold name plate and a karaoke caption for a fit check.",
    category: "Fashion",
    aspect: "9:16" as const,
    timeline: titled("Outfit check", "Outfit check", "Rate this fit"),
  },
  {
    slug: "listicle",
    name: "Listicle",
    description: "Three-beat caption pacing on a clean plate.",
    category: "Education",
    aspect: "9:16" as const,
    timeline: titled("Three things", "3 things", "Save this one"),
  },
];

export async function ensureTemplates(): Promise<void> {
  for (const template of BUILTIN_TEMPLATES) {
    await Template.updateOne({ slug: template.slug }, { $setOnInsert: template }, { upsert: true });
  }
}
