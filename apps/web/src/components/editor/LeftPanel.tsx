"use client";

import {
  ClipSchema,
  migrateProject,
  type CaptionStyle,
  type Clip,
  type Effect,
  type EffectType,
  type TextAnimation,
  type TransitionType,
} from "@reelio/timeline-schema";
import { useEffect, useState } from "react";
import { ApiError, api, uploadBinary, type TemplateCard } from "@/lib/api";
import { clipFromAsset, endOfTrack, findClip, trackForContent, type MediaAsset } from "@/editor/media";
import { STICKERS } from "@/editor/stickers";
import { useEditor, type RailId } from "@/editor/store";

const fieldClass = "rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm text-ink";

const CAPTION_STYLES: CaptionStyle[] = [
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
];

const ANIMATIONS: TextAnimation[] = ["none", "fade", "slide", "pop", "wipe", "karaoke", "wordHighlight", "popIn"];
const TRANSITIONS: TransitionType[] = ["none", "fade", "slide", "zoom", "whip"];
const LUTS = ["none", "warm", "cool", "bw", "vivid", "teal", "film"] as const;
const EFFECTS: EffectType[] = ["fisheye", "glitch", "zoomPunch", "shake", "blur", "vignette", "grain"];

type LeftPanelProps = {
  projectId: string;
  rail: RailId;
  assets: MediaAsset[];
  templates: TemplateCard[];
  onAssets: () => Promise<void>;
};

export function LeftPanel({ projectId, rail, assets, templates, onAssets }: LeftPanelProps) {
  const project = useEditor((state) => state.history?.present.project ?? null);
  const selected = useEditor((state) => state.selected);
  const frame = useEditor((state) => state.frame);
  const apply = useEditor((state) => state.apply);
  const replaceProject = useEditor((state) => state.replaceProject);
  const setSelected = useEditor((state) => state.setSelected);
  const setNotice = useEditor((state) => state.setNotice);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const found = project && selected ? findClip(project, selected.clipId) : null;

  async function uploadFile(file: File) {
    setBusy(true);
    setNotice(null);
    try {
      const contentType = file.type || "application/octet-stream";
      const created = await api<{ asset: { id: string }; upload: { url: string } }>("/assets", {
        method: "POST",
        body: JSON.stringify({ filename: file.name, contentType, bytes: file.size, projectId }),
      });
      await uploadBinary(created.upload.url, file, contentType);
      await api(`/assets/${created.asset.id}/confirm`, { method: "POST" });
      await onAssets();
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function recordVoice() {
    if (recording) {
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunks, { type });
        void uploadFile(new File([blob], `voiceover-${Date.now()}.webm`, { type }));
      };
      recorder.start();
      setRecording(true);
      const stop = () => {
        if (recorder.state !== "inactive") recorder.stop();
        setRecording(false);
        window.removeEventListener("reelio-stop-record", stop);
      };
      window.addEventListener("reelio-stop-record", stop);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Microphone unavailable");
    }
  }

  function addAsset(asset: MediaAsset) {
    if (!project || asset.status !== "ready") return;
    const type = trackForContent(asset.contentType);
    const track = project.tracks.find((item) => item.type === type && !item.locked);
    if (!track) {
      setNotice(`No unlocked ${type} track`);
      return;
    }
    const clip = clipFromAsset(asset, endOfTrack(project, track.id), project.fps);
    apply([{ op: "add_clip", trackId: track.id, clip }]);
    setSelected({ trackId: track.id, clipId: clip.id });
  }

  function addText() {
    if (!project) return;
    const track = project.tracks.find((item) => item.type === "text" && !item.locked);
    if (!track) return;
    const clip = ClipSchema.parse({
      id: crypto.randomUUID(),
      name: "Text",
      from: frame,
      durationInFrames: project.fps * 2,
      props: {
        text: "Your line",
        fontFamily: "Inter",
        fontWeight: 700,
        fontSize: 72,
        letterSpacing: 0,
        align: "center",
        color: "#FFFFFF",
        animation: "pop",
      },
    });
    apply([{ op: "add_clip", trackId: track.id, clip }]);
    setSelected({ trackId: track.id, clipId: clip.id });
  }

  function addSticker(src: string, label: string) {
    if (!project) return;
    const track = project.tracks.find((item) => item.type === "sticker" && !item.locked);
    if (!track) return;
    const clip = ClipSchema.parse({
      id: crypto.randomUUID(),
      name: label,
      from: frame,
      durationInFrames: project.fps * 2,
      props: { sticker: label, imageSrc: src },
    });
    apply([{ op: "add_clip", trackId: track.id, clip }]);
    setSelected({ trackId: track.id, clipId: clip.id });
  }

  function setProp(path: string, value: unknown) {
    if (!found) return;
    apply([{ op: "set_prop", trackId: found.trackId, clipId: found.clip.id, path, value }]);
  }

  async function applyTemplate(templateId: string) {
    if (!project) return;
    const response = await api<{ template: { timeline: unknown; name: string } }>(`/templates/${templateId}`);
    const timeline = migrateProject(response.template.timeline);
    replaceProject({
      ...timeline,
      id: project.id,
      name: project.name,
    });
    setNotice(`Applied ${response.template.name}. Undo restores the previous timeline.`);
  }

  return (
    <aside className="flex h-full min-h-0 flex-col gap-4 overflow-auto border-r border-line bg-surface p-4">
      {rail === "media" ? (
        <>
          <label className="inline-flex w-fit cursor-pointer rounded-xl bg-accent px-3 py-2 text-sm text-white">
            {busy ? "Uploading" : "Add media"}
            <input
              type="file"
              accept="video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,audio/mp4,audio/webm,image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void uploadFile(file);
              }}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            {assets.map((asset) => {
              const used = project?.tracks.some((track) => track.clips.some((clip) => clip.props.assetId === asset.id));
              return (
                <button
                  key={asset.id}
                  type="button"
                  draggable={asset.status === "ready"}
                  onDragStart={(event) => event.dataTransfer.setData("application/x-reelio-asset", asset.id)}
                  onClick={() => addAsset(asset)}
                  className="overflow-hidden rounded-xl border border-line bg-surface-2 text-left"
                >
                  {asset.urls?.thumb ? (
                    <img src={asset.urls.thumb} alt="" className="aspect-video w-full object-cover" />
                  ) : (
                    <div className="flex aspect-video items-center justify-center text-[10px] text-mute">{asset.status}</div>
                  )}
                  <span className="block truncate px-2 py-1 text-[11px]">
                    {used ? "✓ " : ""}
                    {asset.filename}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {rail === "text" ? (
        <>
          <button type="button" className="rounded-xl bg-accent px-3 py-2 text-sm text-white" onClick={addText}>
            Add text
          </button>
          {found ? <TextControls key={found.clip.id} clip={found.clip} onChange={setProp} /> : <p className="text-sm text-mute">Select a text clip to edit it.</p>}
          <div className="flex flex-wrap gap-2">
            {CAPTION_STYLES.map((style) => (
              <button key={style} type="button" className="rounded-full border border-line px-2 py-1 text-[11px]" onClick={() => setProp("props.captionStyle", style)}>
                {style}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {rail === "audio" ? (
        <>
          <button
            type="button"
            className="rounded-xl border border-line px-3 py-2 text-sm"
            onClick={() => {
              if (recording) {
                window.dispatchEvent(new Event("reelio-stop-record"));
                return;
              }
              void recordVoice();
            }}
          >
            {recording ? "Stop voiceover" : "Record voiceover"}
          </button>
          <p className="text-xs text-mute">Uploads land in the media bin. Drag one onto the audio track.</p>
          {found ? (
            <div className="flex flex-col gap-3">
              <Range key={`${found.clip.id}-volume`} label="Volume" min={0} max={2} step={0.05} value={found.clip.volume} onCommit={(value) => setProp("volume", value)} />
              <Range key={`${found.clip.id}-fade-in`} label="Fade in frames" min={0} max={found.clip.durationInFrames} step={1} value={found.clip.fadeInFrames} onCommit={(value) => setProp("fadeInFrames", value)} />
              <Range key={`${found.clip.id}-fade-out`} label="Fade out frames" min={0} max={found.clip.durationInFrames} step={1} value={found.clip.fadeOutFrames} onCommit={(value) => setProp("fadeOutFrames", value)} />
            </div>
          ) : null}
        </>
      ) : null}

      {rail === "effects" && found ? (
        <EffectList key={found.clip.id} clip={found.clip} onReplace={(effects) => setProp("effects", effects)} />
      ) : null}
      {rail === "effects" && !found ? <p className="text-sm text-mute">Select a clip to add an effect.</p> : null}

      {rail === "filter" && found ? (
        <div className="flex flex-col gap-2">
          {LUTS.map((lut) => (
            <button
              key={lut}
              type="button"
              className="rounded-lg border border-line px-3 py-2 text-left text-sm"
              onClick={() => setLut(found.clip.effects, lut, (effects) => setProp("effects", effects))}
            >
              {lut}
            </button>
          ))}
        </div>
      ) : null}

      {rail === "stickers" ? (
        <div className="grid grid-cols-3 gap-2">
          {STICKERS.map((sticker) => (
            <button key={sticker.id} type="button" className="rounded-xl border border-line bg-black p-2" onClick={() => addSticker(sticker.src, sticker.label)}>
              <img src={sticker.src} alt={sticker.label} className="aspect-square w-full" />
            </button>
          ))}
        </div>
      ) : null}

      {rail === "template" ? (
        <div className="flex flex-col gap-2">
          {templates.map((template) => (
            <button key={template.id} type="button" className="rounded-xl border border-line px-3 py-3 text-left" onClick={() => void applyTemplate(template.id)}>
              <span className="text-[10px] uppercase tracking-wide text-accent">{template.category}</span>
              <span className="mt-1 block text-sm">{template.name}</span>
              <span className="mt-1 block text-xs text-mute">{template.description}</span>
            </button>
          ))}
        </div>
      ) : null}

      {found ? (
        <div className="mt-auto flex flex-col gap-3 border-t border-line pt-3">
          <Range key={`${found.clip.id}-speed`} label="Speed" min={0.25} max={4} step={0.05} value={found.clip.speed} onCommit={(value) => setProp("speed", value)} />
          <Range key={`${found.clip.id}-opacity`} label="Opacity" min={0} max={1} step={0.05} value={found.clip.transform.opacity} onCommit={(value) => setProp("transform.opacity", value)} />
          <label className="flex flex-col gap-1 text-xs text-mute">
            Transition in
            <select
              className={fieldClass}
              value={found.clip.transitionIn?.type ?? "none"}
              onChange={(event) =>
                setProp("transitionIn", {
                  type: event.target.value,
                  durationInFrames: event.target.value === "none" ? 0 : Math.round((project?.fps ?? 30) / 2),
                })
              }
            >
              {TRANSITIONS.map((transition) => (
                <option key={transition} value={transition}>
                  {transition}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="rounded-lg border border-line px-2 py-1 text-xs"
            onClick={() => {
              if (!project) return;
              const local = Math.max(0, frame - found.clip.from);
              const keys = found.clip.keyframes.scale ?? [];
              setProp(
                "keyframes.scale",
                [...keys.filter((key) => key.frame !== local), { frame: local, value: found.clip.transform.scale, easing: "easeInOut" }].sort(
                  (a, b) => a.frame - b.frame,
                ),
              );
            }}
          >
            Keyframe scale at playhead
          </button>
        </div>
      ) : null}
    </aside>
  );
}

function TextControls({ clip, onChange }: { clip: Clip; onChange: (path: string, value: unknown) => void }) {
  const [text, setText] = useState(clip.props.text ?? "");
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-xs text-mute">
        Text
        <textarea
          className={fieldClass}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => onChange("props.text", text)}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-mute">
        Font
        <select className={fieldClass} value={clip.props.fontFamily ?? "Inter"} onChange={(event) => onChange("props.fontFamily", event.target.value)}>
          {["Inter", "Arial", "Georgia", "Impact", "Courier New"].map((font) => (
            <option key={font}>{font}</option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-mute">
          Weight
          <input className={fieldClass} type="number" min={300} max={900} step={100} defaultValue={clip.props.fontWeight ?? 700} onBlur={(event) => onChange("props.fontWeight", Number(event.target.value))} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-mute">
          Size
          <input className={fieldClass} type="number" min={12} max={240} defaultValue={clip.props.fontSize ?? 64} onBlur={(event) => onChange("props.fontSize", Number(event.target.value))} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-mute">
        Letter spacing
        <input className={fieldClass} type="number" defaultValue={clip.props.letterSpacing ?? 0} onBlur={(event) => onChange("props.letterSpacing", Number(event.target.value))} />
      </label>
      <div className="flex gap-2">
        {(["left", "center", "right"] as const).map((align) => (
          <button key={align} type="button" className="rounded-lg border border-line px-2 py-1 text-xs" onClick={() => onChange("props.align", align)}>
            {align}
          </button>
        ))}
      </div>
      <label className="flex items-center justify-between text-xs text-mute">
        Color
        <input type="color" value={toColor(clip.props.color)} onChange={(event) => onChange("props.color", event.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-mute">
        Animation
        <select className={fieldClass} value={clip.props.animation ?? "none"} onChange={(event) => onChange("props.animation", event.target.value)}>
          {ANIMATIONS.map((animation) => (
            <option key={animation}>{animation}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function Range({
  label,
  min,
  max,
  step,
  value,
  onCommit,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="flex flex-col gap-1 text-xs text-mute">
      {label} · {Number(draft.toFixed(2))}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(event) => setDraft(Number(event.target.value))}
        onPointerUp={() => onCommit(draft)}
        onBlur={() => onCommit(draft)}
      />
    </label>
  );
}

function EffectList({ clip, onReplace }: { clip: Clip; onReplace: (effects: Effect[]) => void }) {
  return (
    <div className="flex flex-col gap-3">
      {EFFECTS.map((type) => {
        const current = clip.effects.find((effect) => effect.type === type);
        return (
          <div key={type} className="rounded-lg border border-line p-2">
            <button
              type="button"
              className="text-sm"
              onClick={() => {
                if (current) onReplace(clip.effects.filter((effect) => effect.id !== current.id));
                else onReplace([...clip.effects, { id: crypto.randomUUID(), type, intensity: 0.6 }]);
              }}
            >
              {current ? "Remove" : "Add"} {type}
            </button>
            {current ? (
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                defaultValue={current.intensity}
                onPointerUp={(event) =>
                  onReplace(clip.effects.map((effect) => (effect.id === current.id ? { ...effect, intensity: Number(event.currentTarget.value) } : effect)))
                }
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function setLut(effects: Effect[], lut: (typeof LUTS)[number], onReplace: (effects: Effect[]) => void) {
  const rest = effects.filter((effect) => effect.type !== "lut");
  if (lut === "none") {
    onReplace(rest);
    return;
  }
  onReplace([...rest, { id: crypto.randomUUID(), type: "lut", intensity: 0.8, props: { lut } }]);
}

function toColor(value: string | undefined): string {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#ffffff";
}
