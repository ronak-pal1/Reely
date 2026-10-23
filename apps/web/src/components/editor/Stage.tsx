"use client";

import dynamic from "next/dynamic";
import { resolveTransform, type Project } from "@reelio/timeline-schema";
import { useRef, useState } from "react";
import type { PatchOpInput } from "@reelio/timeline-schema";
import { findClip, resolvePlayback, type MediaAsset } from "@/editor/media";
import { useEditor, type Selection } from "@/editor/store";
import { formatTimecode } from "@/editor/time";
import { projectDurationInFrames } from "@reelio/timeline-schema";

const EditorPlayer = dynamic(() => import("./EditorPlayer").then((mod) => mod.EditorPlayer), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-black" />,
});

type StageProps = {
  assets: MediaAsset[];
};

export function Stage({ assets }: StageProps) {
  const project = useEditor((state) => state.history?.present.project ?? null);
  const frame = useEditor((state) => state.frame);
  const playing = useEditor((state) => state.playing);
  const selected = useEditor((state) => state.selected);
  const canvasZoom = useEditor((state) => state.canvasZoom);
  const safeZone = useEditor((state) => state.safeZone);
  const snap = useEditor((state) => state.snap);
  const setFrame = useEditor((state) => state.setFrame);
  const setPlaying = useEditor((state) => state.setPlaying);
  const setCanvasZoom = useEditor((state) => state.setCanvasZoom);
  const setSafeZone = useEditor((state) => state.setSafeZone);
  const beginGesture = useEditor((state) => state.beginGesture);
  const previewOps = useEditor((state) => state.previewOps);
  const commitGesture = useEditor((state) => state.commitGesture);
  const boxRef = useRef<HTMLDivElement>(null);
  const [guides, setGuides] = useState({ x: false, y: false });

  if (!project) return null;
  const playback = resolvePlayback(project, assets);
  const active = activeSelection(project, selected, frame);

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-elev">
      <div className="flex items-center justify-between px-4 py-2 text-xs text-mute">
        <span>
          {Math.round(canvasZoom * 100)}% · {project.width}×{project.height}
        </span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2">
            Zoom
            <input
              type="range"
              min={35}
              max={140}
              value={Math.round(canvasZoom * 100)}
              onChange={(event) => setCanvasZoom(Number(event.target.value) / 100)}
            />
          </label>
          <button
            type="button"
            className={`rounded-full border px-2 py-1 ${safeZone ? "border-accent text-ink" : "border-line"}`}
            onClick={() => setSafeZone(!safeZone)}
          >
            Safe zone
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
        <div
          ref={boxRef}
          className="relative overflow-hidden rounded-xl bg-black shadow-glow"
          style={{
            height: `${Math.round(620 * canvasZoom)}px`,
            aspectRatio: `${project.width} / ${project.height}`,
          }}
        >
          <EditorPlayer project={playback} frame={frame} playing={playing} onFrame={setFrame} onPlaying={setPlaying} />
          {safeZone ? <SafeZones /> : null}
          {guides.x ? <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-accent" /> : null}
          {guides.y ? <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-accent" /> : null}
          {active ? (
            <SelectionBox
              project={project}
              trackId={active.trackId}
              clipId={active.clip.id}
              frame={frame}
              snap={snap}
              boxRef={boxRef}
              onGuides={setGuides}
              beginGesture={beginGesture}
              previewOps={previewOps}
              commitGesture={commitGesture}
            />
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-between px-6 pb-3 text-xs text-mute">
        <button
          type="button"
          className="rounded-full bg-accent px-4 py-1.5 text-white"
          onClick={() => setPlaying(!playing)}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <span>
          {formatTimecode(frame, project.fps)} / {formatTimecode(projectDurationInFrames(project), project.fps)}
        </span>
      </div>
    </section>
  );
}

function SafeZones() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute inset-x-0 top-0 h-[12%] border-b border-white/30 bg-black/30" />
      <div className="absolute inset-x-0 bottom-0 h-[20%] border-t border-white/30 bg-black/30" />
      <div className="absolute inset-y-[12%] right-0 w-[16%] border-l border-white/25 bg-black/20" />
    </div>
  );
}

function activeSelection(project: Project, selected: Selection, frame: number) {
  const found = findClip(project, selected?.clipId ?? null);
  if (!found) return null;
  if (found.trackId !== selected?.trackId) return null;
  const track = project.tracks.find((item) => item.id === found.trackId);
  if (!track || track.hidden || track.type === "audio" || track.type === "effect") return null;
  if (frame < found.clip.from || frame >= found.clip.from + found.clip.durationInFrames) return null;
  return found;
}

function SelectionBox({
  project,
  trackId,
  clipId,
  frame,
  snap,
  boxRef,
  onGuides,
  beginGesture,
  previewOps,
  commitGesture,
}: {
  project: Project;
  trackId: string;
  clipId: string;
  frame: number;
  snap: boolean;
  boxRef: React.RefObject<HTMLDivElement | null>;
  onGuides: (guides: { x: boolean; y: boolean }) => void;
  beginGesture: () => void;
  previewOps: (ops: PatchOpInput[]) => void;
  commitGesture: () => void;
}) {
  const found = findClip(project, clipId);
  if (!found) return null;
  const local = frame - found.clip.from;
  const transform = resolveTransform(found.clip, local);
  const track = project.tracks.find((item) => item.id === trackId);
  const widthRatio = track?.type === "text" || track?.type === "caption" ? 0.86 : track?.type === "sticker" ? 0.28 : 1;

  function scaleOfBox(): number {
    const box = boxRef.current;
    if (!box) return 1;
    return box.clientWidth / project.width;
  }

  function start(mode: "move" | "scale" | "rotate", event: React.PointerEvent) {
    event.stopPropagation();
    event.preventDefault();
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    const origin = { x: event.clientX, y: event.clientY, transform };
    const center = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    beginGesture();
    const move = (pointer: PointerEvent) => {
      const scale = scaleOfBox();
      let x = origin.transform.x;
      let y = origin.transform.y;
      let nextScale = origin.transform.scale;
      let rotate = origin.transform.rotate;
      if (mode === "move") {
        x = origin.transform.x + (pointer.clientX - origin.x) / scale;
        y = origin.transform.y + (pointer.clientY - origin.y) / scale;
        if (snap && Math.abs(x) < 16) x = 0;
        if (snap && Math.abs(y) < 16) y = 0;
        onGuides({ x: x === 0, y: y === 0 });
      } else if (mode === "scale") {
        const startDistance = Math.hypot(origin.x - center.x, origin.y - center.y) || 1;
        const nextDistance = Math.hypot(pointer.clientX - center.x, pointer.clientY - center.y) || 1;
        nextScale = Math.min(4, Math.max(0.2, origin.transform.scale * (nextDistance / startDistance)));
      } else {
        const startAngle = Math.atan2(origin.y - center.y, origin.x - center.x);
        const nextAngle = Math.atan2(pointer.clientY - center.y, pointer.clientX - center.x);
        rotate = origin.transform.rotate + ((nextAngle - startAngle) * 180) / Math.PI;
        if (snap && Math.abs(rotate) < 4) rotate = 0;
      }
      previewOps([
        {
          op: "set_prop",
          trackId,
          clipId,
          path: "transform",
          value: {
            ...origin.transform,
            x: Math.round(x),
            y: Math.round(y),
            scale: Number(nextScale.toFixed(3)),
            rotate: Math.round(rotate),
            opacity: origin.transform.opacity,
          },
        },
      ]);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onGuides({ x: false, y: false });
      commitGesture();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div
      className="absolute border border-accent"
      style={{
        left: `${50 + (transform.x / project.width) * 100}%`,
        top: `${50 + (transform.y / project.height) * 100}%`,
        width: `${widthRatio * 100}%`,
        height: track?.type === "sticker" ? "18%" : track?.type === "video" ? "100%" : "18%",
        transform: `translate(-50%, -50%) scale(${transform.scale}) rotate(${transform.rotate}deg)`,
      }}
      onPointerDown={(event) => start("move", event)}
    >
      <button
        type="button"
        aria-label="Rotate"
        className="absolute -top-6 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-white"
        onPointerDown={(event) => start("rotate", event)}
      />
      <button
        type="button"
        aria-label="Scale"
        className="absolute -bottom-1.5 -right-1.5 h-3 w-3 rounded-sm bg-white"
        onPointerDown={(event) => start("scale", event)}
      />
    </div>
  );
}
