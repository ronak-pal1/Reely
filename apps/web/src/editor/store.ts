import { applyPatchOps, type PatchOpInput, type Project } from "@reelio/timeline-schema";
import { create } from "zustand";
import { createHistory, editHistory, redoHistory, undoHistory, type History } from "./history";

export type RailId = "template" | "text" | "audio" | "effects" | "filter" | "media" | "stickers";
export type SaveState = "saved" | "saving" | "dirty" | "error";
export type Selection = { trackId: string; clipId: string } | null;

type DocumentState = { project: Project };

type EditorState = {
  history: History<DocumentState> | null;
  gesture: History<DocumentState> | null;
  frame: number;
  playing: boolean;
  selected: Selection;
  pixelsPerFrame: number;
  canvasZoom: number;
  snap: boolean;
  safeZone: boolean;
  rail: RailId;
  saveState: SaveState;
  notice: string | null;
  load: (project: Project) => void;
  apply: (ops: PatchOpInput[]) => void;
  beginGesture: () => void;
  previewOps: (ops: PatchOpInput[]) => void;
  commitGesture: () => void;
  cancelGesture: () => void;
  replaceProject: (project: Project) => void;
  undo: () => void;
  redo: () => void;
  setFrame: (frame: number) => void;
  setPlaying: (playing: boolean) => void;
  setSelected: (selected: Selection) => void;
  setPixelsPerFrame: (pixelsPerFrame: number) => void;
  setCanvasZoom: (canvasZoom: number) => void;
  setSnap: (snap: boolean) => void;
  setSafeZone: (safeZone: boolean) => void;
  setRail: (rail: RailId) => void;
  setSaveState: (saveState: SaveState) => void;
  setNotice: (notice: string | null) => void;
};

function selectionStillValid(project: Project, selected: Selection): Selection {
  if (!selected) return null;
  const track = project.tracks.find((item) => item.id === selected.trackId);
  if (!track?.clips.some((clip) => clip.id === selected.clipId)) return null;
  return selected;
}

export const useEditor = create<EditorState>((set) => ({
  history: null,
  gesture: null,
  frame: 0,
  playing: false,
  selected: null,
  pixelsPerFrame: 2,
  canvasZoom: 0.68,
  snap: true,
  safeZone: false,
  rail: "media",
  saveState: "saved",
  notice: null,
  load: (project) =>
    set({
      history: createHistory({ project }),
      frame: 0,
      playing: false,
      selected: null,
      saveState: "saved",
      notice: null,
      gesture: null,
    }),
  apply: (ops) =>
    set((state) => {
      if (!state.history) return {};
      try {
        const history = editHistory(state.history, (draft) => {
          draft.project = applyPatchOps(draft.project, ops);
        });
        if (history === state.history) return {};
        return {
          history,
          saveState: "dirty" as const,
          notice: null,
          selected: selectionStillValid(history.present.project, state.selected),
        };
      } catch (error) {
        return { notice: error instanceof Error ? error.message : "Edit failed" };
      }
    }),
  beginGesture: () => set((state) => ({ gesture: state.history })),
  previewOps: (ops) =>
    set((state) => {
      if (!state.gesture) return {};
      try {
        const project = applyPatchOps(state.gesture.present.project, ops);
        return { history: { ...state.gesture, present: { project } }, notice: null };
      } catch (error) {
        return { notice: error instanceof Error ? error.message : "Edit failed" };
      }
    }),
  commitGesture: () =>
    set((state) => {
      if (!state.gesture || !state.history) return { gesture: null };
      const history = editHistory(state.gesture, (draft) => {
        draft.project = state.history?.present.project ?? draft.project;
      });
      return {
        history,
        gesture: null,
        saveState: history === state.gesture ? state.saveState : ("dirty" as const),
        selected: selectionStillValid(history.present.project, state.selected),
      };
    }),
  cancelGesture: () =>
    set((state) => ({
      history: state.gesture ?? state.history,
      gesture: null,
    })),
  replaceProject: (project) =>
    set((state) => {
      if (!state.history) return { history: createHistory({ project }), saveState: "dirty" as const };
      const history = editHistory(state.history, (draft) => {
        draft.project = project;
      });
      if (history === state.history) return {};
      return { history, saveState: "dirty" as const, notice: null, selected: null };
    }),
  undo: () =>
    set((state) => {
      if (!state.history) return {};
      const history = undoHistory(state.history);
      if (history === state.history) return {};
      return {
        history,
        saveState: "dirty" as const,
        selected: selectionStillValid(history.present.project, state.selected),
      };
    }),
  redo: () =>
    set((state) => {
      if (!state.history) return {};
      const history = redoHistory(state.history);
      if (history === state.history) return {};
      return {
        history,
        saveState: "dirty" as const,
        selected: selectionStillValid(history.present.project, state.selected),
      };
    }),
  setFrame: (frame) => set({ frame: Math.max(0, Math.round(frame)) }),
  setPlaying: (playing) => set({ playing }),
  setSelected: (selected) => set({ selected }),
  setPixelsPerFrame: (pixelsPerFrame) => set({ pixelsPerFrame: Math.min(12, Math.max(0.35, pixelsPerFrame)) }),
  setCanvasZoom: (canvasZoom) => set({ canvasZoom: Math.min(1.4, Math.max(0.35, canvasZoom)) }),
  setSnap: (snap) => set({ snap }),
  setSafeZone: (safeZone) => set({ safeZone }),
  setRail: (rail) => set({ rail }),
  setSaveState: (saveState) => set({ saveState }),
  setNotice: (notice) => set({ notice }),
}));
