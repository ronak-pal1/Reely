import { createEmptyProject } from "@reelio/timeline-schema";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditor } from "./store";

describe("editor store", () => {
  beforeEach(() => {
    useEditor.getState().load(createEmptyProject({ name: "Undo" }));
  });

  it("keeps more than fifty undo steps on the timeline", () => {
    for (let step = 0; step < 55; step += 1) {
      useEditor.getState().apply([{ op: "add_marker", marker: { id: `m-${step}`, frame: step, label: String(step) } }]);
    }
    expect(useEditor.getState().history?.present.project.markers).toHaveLength(55);
    expect(useEditor.getState().saveState).toBe("dirty");
    for (let step = 0; step < 55; step += 1) useEditor.getState().undo();
    expect(useEditor.getState().history?.present.project.markers).toHaveLength(0);
    useEditor.getState().redo();
    expect(useEditor.getState().history?.present.project.markers).toHaveLength(1);
  });

  it("rejects a patch that targets a missing clip", () => {
    const trackId = useEditor.getState().history?.present.project.tracks[0]?.id;
    useEditor.getState().apply([{ op: "delete", trackId: trackId ?? "missing", clipId: "missing" }]);
    expect(useEditor.getState().notice).toMatch(/not found/i);
    expect(useEditor.getState().history?.past).toHaveLength(0);
  });
});
