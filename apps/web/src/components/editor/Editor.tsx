"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { migrateProject, projectDurationInFrames, type PatchOpInput, type Project } from "@reelio/timeline-schema";
import { ApiError, api, type SessionUser, type TemplateCard } from "@/lib/api";
import { clipFromAsset, trackForContent, type MediaAsset } from "@/editor/media";
import { useEditor, type RailId } from "@/editor/store";
import { Director } from "./Director";
import { LeftPanel } from "./LeftPanel";
import { Stage } from "./Stage";
import { Timeline } from "./Timeline";

const RAILS: { id: RailId; label: string }[] = [
  { id: "template", label: "Template" },
  { id: "text", label: "Text" },
  { id: "audio", label: "Audio" },
  { id: "effects", label: "Effects" },
  { id: "filter", label: "Filter" },
  { id: "media", label: "Media" },
  { id: "stickers", label: "Stickers" },
];

type EditorProps = {
  projectId: string;
  initial: Project;
  assets: MediaAsset[];
  user: SessionUser;
  templates: TemplateCard[];
  onAssets: () => Promise<void>;
};

export function Editor({ projectId, initial, assets, user, templates, onAssets }: EditorProps) {
  const load = useEditor((state) => state.load);
  const project = useEditor((state) => state.history?.present.project ?? null);
  const past = useEditor((state) => state.history?.past.length ?? 0);
  const future = useEditor((state) => state.history?.future.length ?? 0);
  const saveState = useEditor((state) => state.saveState);
  const notice = useEditor((state) => state.notice);
  const rail = useEditor((state) => state.rail);
  const undo = useEditor((state) => state.undo);
  const redo = useEditor((state) => state.redo);
  const apply = useEditor((state) => state.apply);
  const setRail = useEditor((state) => state.setRail);
  const setPlaying = useEditor((state) => state.setPlaying);
  const setFrame = useEditor((state) => state.setFrame);
  const setSaveState = useEditor((state) => state.setSaveState);
  const setNotice = useEditor((state) => state.setNotice);
  const [menu, setMenu] = useState(false);
  const [name, setName] = useState(initial.name);
  const [versions, setVersions] = useState<{ id: string; name: string; createdAt: string }[]>([]);

  useEffect(() => {
    load(migrateProject(initial));
  }, [projectId, load, initial]);

  useEffect(() => {
    if (project) setName(project.name);
  }, [project]);

  useEffect(() => {
    if (!project || saveState !== "dirty") return;
    const timer = window.setTimeout(() => {
      const current = useEditor.getState().history?.present.project;
      if (!current) return;
      setSaveState("saving");
      api(`/projects/${projectId}`, { method: "PATCH", body: JSON.stringify({ timeline: current }) })
        .then(() => {
          if (useEditor.getState().history?.present.project === current) setSaveState("saved");
          else setSaveState("dirty");
        })
        .catch((error: unknown) => {
          setSaveState("error");
          setNotice(error instanceof ApiError ? error.message : "Autosave failed");
        });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [project, saveState, projectId, setSaveState, setNotice]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const meta = event.metaKey || event.ctrlKey;
      const current = useEditor.getState().history?.present.project;
      if (!current) return;
      if (event.code === "Space") {
        event.preventDefault();
        setPlaying(!useEditor.getState().playing);
      } else if (event.key === "s" && !meta) {
        event.preventDefault();
        const state = useEditor.getState();
        splitSelection(current, state.frame, state.selected, state.apply);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        const selected = useEditor.getState().selected;
        if (!selected) return;
        event.preventDefault();
        apply([{ op: "delete", trackId: selected.trackId, clipId: selected.clipId, ripple: event.shiftKey }]);
      } else if (meta && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((meta && event.key.toLowerCase() === "z" && event.shiftKey) || (event.ctrlKey && event.key.toLowerCase() === "y")) {
        event.preventDefault();
        redo();
      } else if (meta && event.key.toLowerCase() === "d") {
        event.preventDefault();
        const selected = useEditor.getState().selected;
        if (selected) apply([{ op: "duplicate_clip", trackId: selected.trackId, clipId: selected.clipId }]);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const step = event.shiftKey ? current.fps : 1;
        const direction = event.key === "ArrowLeft" ? -1 : 1;
        const frame = Math.min(projectDurationInFrames(current) - 1, Math.max(0, useEditor.getState().frame + direction * step));
        setFrame(frame);
      } else if (event.key.toLowerCase() === "m" && !meta) {
        apply([{ op: "add_marker", marker: { id: crypto.randomUUID(), frame: useEditor.getState().frame, label: "Marker" } }]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [apply, redo, setFrame, setPlaying, undo]);

  useEffect(() => {
    const onLeave = (event: BeforeUnloadEvent) => {
      const state = useEditor.getState().saveState;
      if (state === "dirty" || state === "saving") event.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, []);

  async function persist() {
    const current = useEditor.getState().history?.present.project;
    if (!current) return;
    setSaveState("saving");
    await api(`/projects/${projectId}`, { method: "PATCH", body: JSON.stringify({ timeline: current }) });
    if (useEditor.getState().history?.present.project === current) setSaveState("saved");
  }

  async function saveVersion() {
    await persist();
    const response = await api<{ version: { id: string; name: string; createdAt: string } }>(`/projects/${projectId}/versions`, {
      method: "POST",
      body: JSON.stringify({ name: project?.name ?? "Version" }),
    });
    setVersions((items) => [response.version, ...items]);
    setNotice("Version saved");
  }

  if (!project) return <main className="p-8 text-sm text-mute">Opening the timeline</main>;

  return (
    <div className="flex h-dvh flex-col bg-bg text-ink">
      <p className="border-b border-line bg-surface px-4 py-2 text-center text-xs text-mute lg:hidden">
        The editor is best on a desktop screen.
      </p>
      {notice ? <p className="border-b border-line bg-surface px-4 py-1 text-xs text-mute">{notice}</p> : null}
      <div className="min-h-0 flex-1 overflow-auto">
      <div className="grid h-full min-w-[1180px] grid-cols-[76px_300px_minmax(0,1fr)_300px] grid-rows-[56px_minmax(0,1fr)_280px]">
        <header className="col-span-4 flex items-center gap-3 border-b border-line bg-elev px-3">
          <Link href="/dashboard" className="text-xs font-semibold tracking-[0.22em]">
            REELIO
          </Link>
          <input
            className="w-48 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm hover:border-line focus:border-line focus:outline-none"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => {
              const next = name.trim();
              if (next && next !== project.name) apply([{ op: "set_project", name: next }]);
              else setName(project.name);
            }}
          />
          <button type="button" className="rounded-lg border border-line px-2 py-1 text-xs disabled:opacity-40" disabled={past === 0} onClick={undo}>
            Undo
          </button>
          <button type="button" className="rounded-lg border border-line px-2 py-1 text-xs disabled:opacity-40" disabled={future === 0} onClick={redo}>
            Redo
          </button>
          <span className="text-xs text-mute">{saveState === "saving" ? "Saving" : saveState === "dirty" ? "Unsaved" : saveState === "error" ? "Save failed" : "Saved"}</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-line px-3 py-1.5 text-sm"
              onClick={() => {
                setFrame(0);
                setPlaying(true);
              }}
            >
              Preview
            </button>
            <button
              type="button"
              className="rounded-lg border border-line px-3 py-1.5 text-sm"
              onClick={() => {
                const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `${project.name.replace(/[^\w.-]+/g, "-")}.reelio.json`;
                link.click();
                URL.revokeObjectURL(url);
              }}
            >
              Download
            </button>
            <button
              type="button"
              className="rounded-lg bg-accent px-3 py-1.5 text-sm text-white"
              onClick={() => {
                void saveVersion().catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Could not save a version"));
              }}
            >
              Save version
            </button>
            <span className="rounded-full border border-line px-2 py-1 text-xs">{user.credits}</span>
            <div className="relative">
              <button type="button" className="rounded-full border border-line px-3 py-1 text-sm" onClick={() => setMenu((open) => !open)}>
                {user.name}
              </button>
              {menu ? (
                <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-line bg-surface p-2 text-sm shadow-glow">
                  <Link className="block rounded-lg px-2 py-1 hover:bg-surface-2" href="/settings">
                    Settings
                  </Link>
                  <button type="button" className="block w-full rounded-lg px-2 py-1 text-left hover:bg-surface-2" onClick={() => void saveVersion()}>
                    Save version
                  </button>
                  <button
                    type="button"
                    className="block w-full rounded-lg px-2 py-1 text-left hover:bg-surface-2"
                    onClick={() => {
                      void persist()
                        .then(() => api<{ project: { id: string } }>(`/projects/${projectId}/duplicate`, { method: "POST" }))
                        .then((response) => {
                          window.location.href = `/projects/${response.project.id}`;
                        })
                        .catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Could not duplicate"));
                    }}
                  >
                    Duplicate project
                  </button>
                  <button
                    type="button"
                    className="block w-full rounded-lg px-2 py-1 text-left hover:bg-surface-2"
                    onClick={() => {
                      void api(`/projects/${projectId}/versions`)
                        .then((response) => setVersions((response as { versions: { id: string; name: string; createdAt: string }[] }).versions))
                        .catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Could not load versions"));
                    }}
                  >
                    Show versions
                  </button>
                  {versions.map((version) => (
                    <button
                      key={version.id}
                      type="button"
                      className="block w-full truncate rounded-lg px-2 py-1 text-left text-xs text-mute hover:bg-surface-2"
                      onClick={() => {
                        void api<{ project: { timeline: unknown } }>(`/projects/${projectId}/versions/${version.id}/restore`, { method: "POST" })
                          .then((response) => {
                            useEditor.getState().replaceProject(migrateProject(response.project.timeline));
                            setNotice("Version restored");
                          })
                          .catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Could not restore"));
                      }}
                    >
                      {version.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="block w-full rounded-lg px-2 py-1 text-left hover:bg-surface-2"
                    onClick={() => {
                      void api("/auth/logout", { method: "POST" }).then(() => {
                        window.location.href = "/login";
                      });
                    }}
                  >
                    Log out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <nav className="row-start-2 flex flex-col items-center gap-1 border-r border-line bg-elev py-2">
          {RAILS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`w-16 rounded-xl px-1 py-2 text-[10px] ${rail === item.id ? "bg-accent text-white" : "text-mute"}`}
              onClick={() => setRail(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="col-start-2 row-start-2 min-h-0">
          <LeftPanel projectId={projectId} rail={rail} assets={assets} templates={templates} onAssets={onAssets} />
        </div>
        <div className="col-start-3 row-start-2 min-h-0 min-w-0">
          <Stage assets={assets} />
        </div>
        <div className="col-start-4 row-start-2 min-h-0">
          <Director user={user} />
        </div>
        <div className="col-span-4 row-start-3 min-h-0">
          <Timeline
            assets={assets}
            onDropAsset={(assetId, trackId, frame) => {
              const asset = assets.find((item) => item.id === assetId);
              const track = project.tracks.find((item) => item.id === trackId);
              if (!asset || !track || asset.status !== "ready") return;
              if (trackForContent(asset.contentType) !== track.type) {
                setNotice(`Drop ${asset.contentType} clips on a ${trackForContent(asset.contentType)} track`);
                return;
              }
              const clip = clipFromAsset(asset, frame, project.fps);
              apply([{ op: "add_clip", trackId, clip }]);
            }}
          />
        </div>
      </div>
      </div>
    </div>
  );
}

function splitSelection(
  project: Project,
  frame: number,
  selected: { trackId: string; clipId: string } | null,
  apply: (ops: PatchOpInput[]) => void,
) {
  const tracks = selected
    ? [project.tracks.find((track) => track.id === selected.trackId), ...project.tracks].filter((track): track is NonNullable<typeof track> => Boolean(track))
    : project.tracks;
  for (const track of tracks) {
    const clip = track.clips.find((item) => frame > item.from && frame < item.from + item.durationInFrames);
    if (clip) {
      apply([{ op: "split", trackId: track.id, clipId: clip.id, atFrame: frame }]);
      return;
    }
  }
}
