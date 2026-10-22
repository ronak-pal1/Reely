import { ProjectSchema, type Project } from "./schema.js";

export function createDemoProject(): Project {
  return ProjectSchema.parse({
    schemaVersion: 1,
    id: "demo-project",
    name: "Outfit Check",
    fps: 30,
    width: 1080,
    height: 1920,
    aspect: "9:16",
    background: "#000000",
    tracks: [
      {
        id: "track-video",
        type: "video",
        name: "Video",
        clips: [
          {
            id: "clip-bg",
            name: "Title plate",
            from: 0,
            durationInFrames: 180,
            props: { backgroundColor: "#14081f" },
            effects: [{ id: "fx-vignette", type: "vignette", intensity: 0.65 }],
          },
        ],
      },
      {
        id: "track-text",
        type: "text",
        name: "Text",
        clips: [
          {
            id: "clip-title",
            name: "Title",
            from: 0,
            durationInFrames: 180,
            transform: { x: 0, y: -220, scale: 1, rotate: 0, opacity: 1 },
            props: {
              text: "REELIO",
              fontFamily: "Inter",
              fontWeight: 760,
              fontSize: 120,
              letterSpacing: -2,
              align: "center",
              color: "#FFFFFF",
              animation: "pop",
            },
          },
        ],
      },
      {
        id: "track-caption",
        type: "caption",
        name: "Captions",
        clips: [
          {
            id: "clip-caption",
            name: "Hook",
            from: 0,
            durationInFrames: 180,
            transform: { x: 0, y: 560, scale: 1, rotate: 0, opacity: 1 },
            props: {
              text: "Stop the scroll",
              fontFamily: "Inter",
              fontWeight: 700,
              fontSize: 64,
              align: "center",
              color: "#FFFFFF",
              captionStyle: "wordHighlight",
              words: [
                { text: "Stop", startMs: 0, endMs: 420 },
                { text: "the", startMs: 420, endMs: 680 },
                { text: "scroll", startMs: 680, endMs: 1400 },
              ],
            },
          },
        ],
      },
      { id: "track-audio", type: "audio", name: "Audio", clips: [] },
      { id: "track-sticker", type: "sticker", name: "Stickers", clips: [] },
      { id: "track-effect", type: "effect", name: "Effects", clips: [] },
    ],
    markers: [{ id: "marker-hook", frame: 12, label: "Hook" }],
  });
}
