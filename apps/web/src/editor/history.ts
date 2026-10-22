import { applyPatches, enablePatches, produceWithPatches, type Draft, type Patch } from "immer";

enablePatches();

export const HISTORY_LIMIT = 60;

export type HistoryEntry = {
  patches: Patch[];
  inverse: Patch[];
};

export type History<T> = {
  present: T;
  past: HistoryEntry[];
  future: HistoryEntry[];
};

type HistoryValue = Record<string, unknown>;

export function createHistory<T extends HistoryValue>(present: T): History<T> {
  return { present, past: [], future: [] };
}

export function editHistory<T extends HistoryValue>(history: History<T>, recipe: (draft: Draft<T>) => void): History<T> {
  const [next, patches, inverse] = produceWithPatches(history.present, recipe);
  if (patches.length === 0) return history;
  return {
    present: next,
    past: [...history.past, { patches, inverse }].slice(-HISTORY_LIMIT),
    future: [],
  };
}

export function undoHistory<T extends HistoryValue>(history: History<T>): History<T> {
  const entry = history.past[history.past.length - 1];
  if (!entry) return history;
  return {
    present: applyPatches(history.present, entry.inverse),
    past: history.past.slice(0, -1),
    future: [entry, ...history.future],
  };
}

export function redoHistory<T extends HistoryValue>(history: History<T>): History<T> {
  const entry = history.future[0];
  if (!entry) return history;
  return {
    present: applyPatches(history.present, entry.patches),
    past: [...history.past, entry].slice(-HISTORY_LIMIT),
    future: history.future.slice(1),
  };
}
