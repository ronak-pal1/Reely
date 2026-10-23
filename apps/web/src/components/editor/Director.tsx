"use client";

import type { SessionUser } from "@/lib/api";

const SHORTCUTS = [
  ["Space", "Play or pause"],
  ["S", "Split at the playhead"],
  ["Delete", "Delete the selection"],
  ["Shift+Delete", "Ripple delete"],
  ["⌘/Ctrl+Z", "Undo"],
  ["⌘/Ctrl+Shift+Z", "Redo"],
  ["⌘/Ctrl+D", "Duplicate"],
  ["Arrows", "Step one frame"],
  ["Shift+arrows", "Step one second"],
  ["M", "Add a marker"],
];

export function Director({ user }: { user: SessionUser }) {
  return (
    <aside className="flex h-full min-h-0 flex-col gap-4 overflow-auto border-l border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Video Director</h2>
        <span className="rounded-full border border-line px-2 py-1 text-[11px] text-mute">{user.credits} credits</span>
      </div>
      <p className="text-sm text-mute">
        Suggestions show up here after the director reads the transcript and the timeline. Nothing is applied until you accept the patch.
      </p>
      <div className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs text-mute">No suggestions yet</div>
      <div className="mt-auto">
        <h3 className="text-xs uppercase tracking-wide text-mute">Shortcuts</h3>
        <ul className="mt-2 flex flex-col gap-1 text-xs">
          {SHORTCUTS.map(([keys, label]) => (
            <li key={keys} className="flex justify-between gap-3">
              <span>{label}</span>
              <span className="text-mute">{keys}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
