import { describe, expect, it } from "vitest";
import { createDemoProject } from "./demo.js";
import { migrateProject } from "./migrate.js";
import { CREDIT_COSTS, PLANS, renderCreditCost } from "./plans.js";
import { PatchError, applyPatchOps, describePatch } from "./patches.js";
import {
  SCHEMA_VERSION,
  createEmptyProject,
  projectDurationInFrames,
} from "./schema.js";
import { resolveTransform, resolveVolume, sampleKeyframes } from "./time.js";

describe("schema", () => {
  it("creates an empty 9:16 project with the six editor tracks", () => {
    const project = createEmptyProject({ name: "Draft" });
    expect(project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(project.width).toBe(1080);
    expect(project.height).toBe(1920);
    expect(project.tracks.map((track) => track.type)).toEqual([
      "video",
      "text",
      "audio",
      "caption",
      "sticker",
      "effect",
    ]);
    expect(projectDurationInFrames(project)).toBe(1);
  });

  it("rejects speeds outside 0.25x-4x", () => {
    const project = createEmptyProject();
    const video = project.tracks[0];
    expect(video).toBeDefined();
    expect(() =>
      applyPatchOps(project, [
        {
          op: "add_clip",
          trackId: video!.id,
          clip: { id: "a", from: 0, durationInFrames: 30, speed: 8 },
        },
      ]),
    ).toThrow();
  });
});

describe("migration", () => {
  it("upgrades a versionless document and fills defaults", () => {
    const project = migrateProject({
      id: "legacy",
      name: "Legacy",
      width: 1080,
      height: 1920,
      fps: 30,
      tracks: [
        {
          id: "v",
          type: "video",
          name: "Video",
          clips: [{ id: "c", from: 0, durationInFrames: 15 }],
        },
      ],
    });
    expect(project.schemaVersion).toBe(1);
    expect(project.aspect).toBe("9:16");
    expect(project.tracks[0]?.clips[0]?.volume).toBe(1);
    expect(project.tracks[0]?.clips[0]?.transform.scale).toBe(1);
  });

  it("refuses a newer schema", () => {
    expect(() => migrateProject({ schemaVersion: 99, id: "x" })).toThrow(/newer/);
  });
});

describe("patch engine", () => {
  const base = () => {
    const project = createEmptyProject({ id: "p", name: "Edit" });
    const video = project.tracks.find((track) => track.type === "video");
    if (!video) throw new Error("missing video track");
    return {
      project: applyPatchOps(project, [
        {
          op: "add_clip",
          trackId: video.id,
          clip: {
            id: "a",
            name: "A",
            from: 0,
            durationInFrames: 90,
            trimStart: 10,
            speed: 1,
          },
        },
        {
          op: "add_clip",
          trackId: video.id,
          clip: { id: "b", name: "B", from: 90, durationInFrames: 60 },
        },
        {
          op: "add_clip",
          trackId: video.id,
          clip: { id: "c", name: "C", from: 150, durationInFrames: 30 },
        },
      ]),
      videoId: video.id,
    };
  };

  it("splits a clip and carries trim into the right half", () => {
    const { project, videoId } = base();
    const next = applyPatchOps(project, [
      { op: "split", trackId: videoId, clipId: "a", atFrame: 40 },
    ]);
    const clips = next.tracks.find((track) => track.id === videoId)?.clips ?? [];
    const left = clips.find((clip) => clip.id === "a");
    const right = clips.find((clip) => clip.id !== "a" && clip.id !== "b" && clip.id !== "c");
    expect(left?.durationInFrames).toBe(40);
    expect(left?.trimStart).toBe(10);
    expect(right?.from).toBe(40);
    expect(right?.durationInFrames).toBe(50);
    expect(right?.trimStart).toBe(50);
    expect(projectDurationInFrames(next)).toBe(180);
  });

  it("adjusts timeline duration when speed changes", () => {
    const { project, videoId } = base();
    const next = applyPatchOps(project, [
      { op: "set_prop", trackId: videoId, clipId: "a", path: "speed", value: 2 },
    ]);
    const clip = next.tracks.find((track) => track.id === videoId)?.clips.find((item) => item.id === "a");
    expect(clip?.speed).toBe(2);
    expect(clip?.durationInFrames).toBe(45);
  });

  it("ripple-deletes and closes the gap", () => {
    const { project, videoId } = base();
    const next = applyPatchOps(project, [
      { op: "delete", trackId: videoId, clipId: "b", ripple: true },
    ]);
    const clips = next.tracks.find((track) => track.id === videoId)?.clips ?? [];
    expect(clips.map((clip) => clip.id)).toEqual(["a", "c"]);
    expect(clips.find((clip) => clip.id === "c")?.from).toBe(90);
  });

  it("trims, moves, duplicates, and describes the diff", () => {
    const { project, videoId } = base();
    const trimmed = applyPatchOps(project, [
      { op: "trim", trackId: videoId, clipId: "a", durationInFrames: 40, trimStart: 4 },
      { op: "move", trackId: videoId, clipId: "c", toFrame: 200 },
      { op: "duplicate_clip", trackId: videoId, clipId: "a" },
    ]);
    const clips = trimmed.tracks.find((track) => track.id === videoId)?.clips ?? [];
    expect(clips.find((clip) => clip.id === "a")?.durationInFrames).toBe(40);
    expect(clips.find((clip) => clip.id === "c")?.from).toBe(200);
    expect(clips.some((clip) => clip.name === "A copy")).toBe(true);
    expect(describePatch({ op: "delete", trackId: videoId, clipId: "b", ripple: true })).toMatch(
      /Ripple delete/,
    );
  });

  it("sets nested props and rejects prototype paths", () => {
    const { project, videoId } = base();
    const next = applyPatchOps(project, [
      {
        op: "set_prop",
        trackId: videoId,
        clipId: "a",
        path: "transform.x",
        value: 24,
      },
      {
        op: "set_prop",
        trackId: videoId,
        clipId: "a",
        path: "props.text",
        value: "Hello",
      },
    ]);
    const clip = next.tracks.find((track) => track.id === videoId)?.clips.find((item) => item.id === "a");
    expect(clip?.transform.x).toBe(24);
    expect(clip?.props.text).toBe("Hello");
    expect(() =>
      applyPatchOps(project, [
        { op: "set_prop", trackId: videoId, clipId: "a", path: "__proto__.polluted", value: true },
      ]),
    ).toThrow(PatchError);
    expect(() =>
      applyPatchOps(project, [
        { op: "set_prop", trackId: videoId, clipId: "a", path: "id", value: "hijack" },
      ]),
    ).toThrow(PatchError);
  });

  it("refuses edits on a locked track and builds a caption track", () => {
    const { project, videoId } = base();
    const locked = applyPatchOps(project, [{ op: "set_track", trackId: videoId, locked: true }]);
    expect(() =>
      applyPatchOps(locked, [{ op: "delete", trackId: videoId, clipId: "a" }]),
    ).toThrow(/locked/);
    const captioned = applyPatchOps(project, [
      {
        op: "add_caption_track",
        replace: true,
        clips: [
          {
            id: "cap-1",
            from: 0,
            durationInFrames: 45,
            props: {
              text: "Hello world",
              captionStyle: "karaoke",
              words: [
                { text: "Hello", startMs: 0, endMs: 400 },
                { text: "world", startMs: 400, endMs: 900 },
              ],
            },
          },
        ],
      },
    ]);
    const captions = captioned.tracks.find((track) => track.type === "caption");
    expect(captions?.clips).toHaveLength(1);
    expect(captions?.clips[0]?.props.captionStyle).toBe("karaoke");
  });

  it("switches aspect and records markers", () => {
    const project = createEmptyProject();
    const next = applyPatchOps(project, [
      { op: "set_project", aspect: "1:1" },
      { op: "add_marker", marker: { id: "m", frame: 12, label: "Hook" } },
    ]);
    expect(next.width).toBe(1080);
    expect(next.height).toBe(1080);
    expect(next.markers[0]?.label).toBe("Hook");
    const removed = applyPatchOps(next, [{ op: "delete_marker", markerId: "m" }]);
    expect(removed.markers).toHaveLength(0);
  });
});

describe("keyframes and fades", () => {
  it("interpolates with easing and applies audio fades", () => {
    expect(
      sampleKeyframes(
        0,
        [
          { frame: 0, value: 0, easing: "linear" },
          { frame: 10, value: 100, easing: "linear" },
        ],
        5,
      ),
    ).toBe(50);
    const project = createEmptyProject();
    const video = project.tracks[0];
    const next = applyPatchOps(project, [
      {
        op: "add_clip",
        trackId: video!.id,
        clip: {
          id: "k",
          from: 0,
          durationInFrames: 20,
          volume: 1,
          fadeInFrames: 10,
          fadeOutFrames: 0,
          keyframes: {
            scale: [
              { frame: 0, value: 1, easing: "linear" },
              { frame: 10, value: 2, easing: "linear" },
            ],
          },
        },
      },
    ]);
    const clip = next.tracks[0]?.clips[0];
    expect(clip).toBeDefined();
    expect(resolveTransform(clip!, 5).scale).toBe(1.5);
    expect(resolveVolume(clip!, 5)).toBeCloseTo(0.5);
  });
});

describe("plans", () => {
  it("prices renders and keeps free below studio", () => {
    expect(PLANS.free.watermark).toBe(true);
    expect(PLANS.studio.maxHeight).toBe(2160);
    expect(renderCreditCost({ width: 1080, height: 1920 }, 30)).toBe(
      CREDIT_COSTS.renderPer15s[1080] * 2,
    );
    expect(renderCreditCost({ width: 720, height: 1280 }, 10)).toBe(1);
    expect(renderCreditCost({ width: 2160, height: 3840 }, 15)).toBe(4);
  });
});

describe("demo timeline", () => {
  it("is a valid vertical project the player can mount", () => {
    const demo = createDemoProject();
    expect(demo.aspect).toBe("9:16");
    expect(projectDurationInFrames(demo)).toBe(180);
    expect(demo.tracks.find((track) => track.type === "caption")?.clips[0]?.props.words).toHaveLength(
      3,
    );
  });
});
