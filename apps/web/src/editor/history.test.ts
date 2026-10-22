import { describe, expect, it } from "vitest";
import { createHistory, editHistory, HISTORY_LIMIT, redoHistory, undoHistory } from "./history";

describe("edit history", () => {
  it("undoes and redoes more than fifty immer patches", () => {
    let history = createHistory({ n: 0 });
    for (let step = 0; step < 55; step += 1) {
      history = editHistory(history, (draft) => {
        draft.n += 1;
      });
    }
    expect(history.present.n).toBe(55);
    expect(history.past).toHaveLength(55);
    for (let step = 0; step < 55; step += 1) history = undoHistory(history);
    expect(history.present.n).toBe(0);
    expect(undoHistory(history)).toBe(history);
    history = redoHistory(history);
    expect(history.present.n).toBe(1);
  });

  it("drops edits older than the history limit", () => {
    let history = createHistory({ n: 0 });
    for (let step = 0; step < HISTORY_LIMIT + 5; step += 1) {
      history = editHistory(history, (draft) => {
        draft.n += 1;
      });
    }
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    for (let step = 0; step < HISTORY_LIMIT; step += 1) history = undoHistory(history);
    expect(history.present.n).toBe(5);
  });

  it("clears the redo stack after a new edit", () => {
    let history = createHistory({ n: 0 });
    history = editHistory(history, (draft) => {
      draft.n = 1;
    });
    history = undoHistory(history);
    history = editHistory(history, (draft) => {
      draft.n = 4;
    });
    expect(history.future).toHaveLength(0);
    expect(redoHistory(history).present.n).toBe(4);
  });
});
