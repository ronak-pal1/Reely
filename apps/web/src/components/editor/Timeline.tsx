"use client";

import { projectDurationInFrames, type Clip, type PatchOpInput, type Project, type Track } from "@reelio/timeline-schema";
import { useRef } from "react";
import { assetIdFrom, type MediaAsset } from "@/editor/media";
import { useEditor } from "@/editor/store";
import { formatTimecode, snapValue } from "@/editor/time";

type TimelineProps = {
  assets: MediaAsset[];
  onDropAsset: (assetId: string, trackId: string, frame: number) => void;
};

export function Timeline({ assets, onDropAsset }: TimelineProps) {
  const project = useEditor((state) => state.history?.present.project ?? null);
  const frame = useEditor((state) => state.frame);
  const pixelsPerFrame = useEditor((state) => state.pixelsPerFrame);
  const snap = useEditor((state) => state.snap);
  const selected = useEditor((state) => state.selected);
  const setFrame = useEditor((state) => state.setFrame);
  const setSelected = useEditor((state) => state.setSelected);
  const setPixelsPerFrame = useEditor((state) => state.setPixelsPerFrame);
  const setSnap = useEditor((state) => state.setSnap);
  const apply = useEditor((state) => state.apply);
  const beginGesture = useEditor((state) => state.beginGesture);
  const previewOps = useEditor((state) => state.previewOps);
  const commitGesture = useEditor((state) => state.commitGesture);
  const cancelGesture = useEditor((state) => state.cancelGesture);
  const scroller = useRef<HTMLDivElement>(null);

  if (!project) return null;
  const timeline = project;
  const duration = Math.max(projectDurationInFrames(timeline), frame + timeline.fps, timeline.fps * 8);
  const laneWidth = duration * pixelsPerFrame + 160;

  function frameAt(clientX: number): number {
    const root = scroller.current;
    if (!root) return 0;
    const rect = root.getBoundingClientRect();
    const x = clientX - rect.left + root.scrollLeft - 144;
    return Math.max(0, Math.round(x / pixelsPerFrame));
  }

  function pointsFor(clipId: string): number[] {
    const points = [0, frame, ...timeline.markers.map((marker) => marker.frame)];
    for (const track of timeline.tracks) {
      for (const clip of track.clips) {
        if (clip.id === clipId) continue;
        points.push(clip.from, clip.from + clip.durationInFrames);
      }
    }
    return points;
  }

  return (
    <section className="flex min-h-0 flex-col border-t border-line bg-surface">
      <div className="flex items-center gap-3 border-b border-line px-3 py-2 text-xs">
        <span className="text-mute">{formatTimecode(frame, project.fps)}</span>
        <button type="button" className="rounded-md border border-line px-2 py-1" onClick={() => splitAtPlayhead(project, frame, selected, apply)}>
          Split
        </button>
        <button
          type="button"
          className="rounded-md border border-line px-2 py-1"
          onClick={() => {
            if (!selected) return;
            apply([{ op: "delete", trackId: selected.trackId, clipId: selected.clipId }]);
          }}
        >
          Delete
        </button>
        <button
          type="button"
          className={`rounded-md border px-2 py-1 ${snap ? "border-accent text-ink" : "border-line text-mute"}`}
          onClick={() => setSnap(!snap)}
        >
          Snap
        </button>
        <label className="ml-auto flex items-center gap-2 text-mute">
          Timeline
          <input
            type="range"
            min={35}
            max={800}
            value={Math.round(pixelsPerFrame * 100)}
            onChange={(event) => setPixelsPerFrame(Number(event.target.value) / 100)}
          />
        </label>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-auto">
        <div className="relative" style={{ width: 144 + laneWidth }}>
          <div
            className="sticky top-0 z-20 flex h-7 border-b border-line bg-elev"
            onPointerDown={(event) => setFrame(frameAt(event.clientX))}
          >
            <div className="sticky left-0 z-30 w-36 border-r border-line bg-elev" />
            <div className="relative h-full flex-1">
              {Array.from({ length: Math.ceil(duration / project.fps) + 1 }, (_, index) => (
                <span
                  key={index}
                  className="absolute top-1 text-[10px] text-mute"
                  style={{ left: index * project.fps * pixelsPerFrame }}
                >
                  {formatTimecode(index * project.fps, project.fps)}
                </span>
              ))}
              {project.markers.map((marker) => (
                <button
                  key={marker.id}
                  type="button"
                  title={marker.label}
                  className="absolute top-0 h-full w-2 bg-accent"
                  style={{ left: marker.frame * pixelsPerFrame }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setFrame(marker.frame);
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    apply([{ op: "delete_marker", markerId: marker.id }]);
                  }}
                />
              ))}
            </div>
          </div>
          {project.tracks.map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              assets={assets}
              pixelsPerFrame={pixelsPerFrame}
              laneWidth={laneWidth}
              selectedId={selected?.clipId ?? null}
              onSelect={(clipId) => setSelected({ trackId: track.id, clipId })}
              onDrop={(event) => {
                const assetId = event.dataTransfer.getData("application/x-reelio-asset");
                if (!assetId) return;
                onDropAsset(assetId, track.id, frameAt(event.clientX));
              }}
              onClipPointerDown={(clip, event) => {
                if (track.locked || event.button !== 0) return;
                const mode = edgeMode(event);
                const startX = event.clientX;
                const origin = { from: clip.from, duration: clip.durationInFrames, trim: clip.trimStart };
                setSelected({ trackId: track.id, clipId: clip.id });
                beginGesture();
                const move = (pointer: PointerEvent) => {
                  const delta = Math.round((pointer.clientX - startX) / pixelsPerFrame);
                  if (mode === "body") {
                    let next = Math.max(0, origin.from + delta);
                    if (snap) next = Math.round(snapValue(next, pointsFor(clip.id), Math.max(1, 8 / pixelsPerFrame)));
                    previewOps([{ op: "move", trackId: track.id, clipId: clip.id, toFrame: next }]);
                    return;
                  }
                  const trimmed = trimClip(clip, origin, delta, mode, assets, project.fps);
                  if (trimmed) previewOps([{ op: "trim", trackId: track.id, clipId: clip.id, ...trimmed }]);
                };
                const up = (pointer: PointerEvent) => {
                  window.removeEventListener("pointermove", move);
                  window.removeEventListener("pointerup", up);
                  const delta = Math.round((pointer.clientX - startX) / pixelsPerFrame);
                  if (delta === 0) {
                    cancelGesture();
                    return;
                  }
                  if (mode === "body") {
                    let next = Math.max(0, origin.from + delta);
                    if (snap) next = Math.round(snapValue(next, pointsFor(clip.id), Math.max(1, 8 / pixelsPerFrame)));
                    const element = document.elementFromPoint(pointer.clientX, pointer.clientY);
                    const destination = element?.closest("[data-track-id]")?.getAttribute("data-track-id") ?? track.id;
                    previewOps([{ op: "move", trackId: track.id, clipId: clip.id, toTrackId: destination, toFrame: next }]);
                  }
                  commitGesture();
                };
                window.addEventListener("pointermove", move);
                window.addEventListener("pointerup", up);
              }}
            />
          ))}
          <button
            type="button"
            aria-label="Playhead"
            className="absolute bottom-0 top-7 z-30 w-3 -translate-x-1/2 cursor-ew-resize"
            style={{ left: 144 + frame * pixelsPerFrame }}
            onPointerDown={(event) => {
              event.stopPropagation();
              const move = (pointer: PointerEvent) => setFrame(frameAt(pointer.clientX));
              const up = () => {
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
              };
              window.addEventListener("pointermove", move);
              window.addEventListener("pointerup", up);
            }}
          >
            <span className="mx-auto block h-full w-px bg-accent" />
          </button>
        </div>
      </div>
    </section>
  );
}

function TrackRow({
  track,
  assets,
  pixelsPerFrame,
  laneWidth,
  selectedId,
  onSelect,
  onDrop,
  onClipPointerDown,
}: {
  track: Track;
  assets: MediaAsset[];
  pixelsPerFrame: number;
  laneWidth: number;
  selectedId: string | null;
  onSelect: (clipId: string) => void;
  onDrop: (event: React.DragEvent) => void;
  onClipPointerDown: (clip: Clip, event: React.PointerEvent) => void;
}) {
  const apply = useEditor((state) => state.apply);
  return (
    <div
      data-track-id={track.id}
      className="flex h-16 border-b border-line"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDrop(event);
      }}
    >
      <div className="sticky left-0 z-20 flex w-36 shrink-0 flex-col justify-center gap-1 border-r border-line bg-surface px-2">
        <span className="truncate text-xs">{track.name}</span>
        <div className="flex gap-1 text-[10px] text-mute">
          <TrackToggle label={track.locked ? "Unlock" : "Lock"} onClick={() => apply([{ op: "set_track", trackId: track.id, locked: !track.locked }])} />
          <TrackToggle label={track.hidden ? "Show" : "Hide"} onClick={() => apply([{ op: "set_track", trackId: track.id, hidden: !track.hidden }])} />
          <TrackToggle label={track.muted ? "Unmute" : "Mute"} onClick={() => apply([{ op: "set_track", trackId: track.id, muted: !track.muted }])} />
        </div>
      </div>
      <div className={`relative h-full ${track.hidden ? "opacity-40" : ""}`} style={{ width: laneWidth }}>
        {track.clips.map((clip) => {
          const asset = assets.find((item) => item.id === (clip.props.assetId ?? assetIdFrom(clip.src)));
          return (
            <button
              key={clip.id}
              type="button"
              className={`absolute top-2 h-12 overflow-hidden rounded-md border text-left text-[10px] ${
                selectedId === clip.id ? "border-accent" : "border-white/10"
              } ${track.type === "audio" ? "bg-accent/30" : "bg-surface-2"}`}
              style={{
                left: clip.from * pixelsPerFrame,
                width: Math.max(8, clip.durationInFrames * pixelsPerFrame),
                backgroundImage: track.type === "video" && asset?.urls?.strip ? `url(${asset.urls.strip})` : undefined,
                backgroundSize: "auto 100%",
              }}
              onPointerDown={(event) => onClipPointerDown(clip, event)}
              onClick={() => onSelect(clip.id)}
            >
              <span className="block truncate bg-black/40 px-1 py-0.5">{clip.name ?? track.name}</span>
              {track.type === "audio" && asset?.waveform?.length ? <Waveform peaks={asset.waveform} /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TrackToggle({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="rounded border border-line px-1 py-0.5" onClick={onClick}>
      {label}
    </button>
  );
}

function Waveform({ peaks }: { peaks: number[] }) {
  const max = Math.max(...peaks, 0.01);
  return (
    <span className="flex h-6 items-end gap-px px-1">
      {peaks.slice(0, 48).map((peak, index) => (
        <span key={index} className="w-px bg-white/80" style={{ height: `${Math.max(8, (peak / max) * 100)}%` }} />
      ))}
    </span>
  );
}

function edgeMode(event: React.PointerEvent): "start" | "end" | "body" {
  const bounds = event.currentTarget.getBoundingClientRect();
  if (event.clientX - bounds.left < 8) return "start";
  if (bounds.right - event.clientX < 8) return "end";
  return "body";
}

function trimClip(
  clip: Clip,
  origin: { from: number; duration: number; trim: number },
  delta: number,
  mode: "start" | "end",
  assets: MediaAsset[],
  fps: number,
): { from: number; durationInFrames: number; trimStart: number } | null {
  const assetId = clip.props.assetId ?? assetIdFrom(clip.src);
  const asset = assets.find((item) => item.id === assetId);
  const sourceFrames = asset?.durationSeconds ? asset.durationSeconds * fps : null;
  if (mode === "end") {
    let duration = Math.max(1, origin.duration + delta);
    if (sourceFrames !== null) duration = Math.min(duration, Math.max(1, (sourceFrames - origin.trim) / clip.speed));
    return { from: origin.from, durationInFrames: Math.round(duration), trimStart: origin.trim };
  }
  const from = Math.max(0, origin.from + delta);
  const consumed = from - origin.from;
  const duration = origin.duration - consumed;
  const trimStart = origin.trim + consumed * clip.speed;
  if (duration < 1 || trimStart < 0) return null;
  if (sourceFrames !== null && trimStart + duration * clip.speed > sourceFrames + 1) return null;
  return { from, durationInFrames: Math.round(duration), trimStart: Number(trimStart.toFixed(3)) };
}

function splitAtPlayhead(
  project: Project,
  frame: number,
  selected: { trackId: string; clipId: string } | null,
  apply: (ops: PatchOpInput[]) => void,
) {
  const preferred = selected
    ? project.tracks.find((track) => track.id === selected.trackId)?.clips.find((clip) => clip.id === selected.clipId)
    : null;
  const preferredTrack = selected ? project.tracks.find((track) => track.id === selected.trackId) : null;
  if (preferred && preferredTrack && frame > preferred.from && frame < preferred.from + preferred.durationInFrames) {
    apply([{ op: "split", trackId: preferredTrack.id, clipId: preferred.id, atFrame: frame }]);
    return;
  }
  for (const track of project.tracks) {
    const clip = track.clips.find((item) => frame > item.from && frame < item.from + item.durationInFrames);
    if (clip) {
      apply([{ op: "split", trackId: track.id, clipId: clip.id, atFrame: frame }]);
      return;
    }
  }
}
