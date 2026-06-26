import { describe, expect, it } from "@jest/globals";
import {
  EMPTY_FOCUS_HISTORY,
  FOCUS_HISTORY_DEFAULT_LIMIT,
  pruneFocusHistory,
  pushFocusHistory,
  resolveFocusCurrentOrLast,
} from "../focus-history";
import type { FocusHistory } from "../focus-history";

/**
 * Pure unit coverage for the MRU focus model (HT-NAV-MRU-FOCUS-TOGGLE): the
 * de-duping capped push (`pushFocusHistory`), the current-or-last resolution
 * (`resolveFocusCurrentOrLast`), and the layout-change prune (`pruneFocusHistory`).
 */

function build(entries: ReadonlyArray<string>): FocusHistory {
  return { entries };
}

describe("pushFocusHistory (MRU append with de-dupe + cap)", (): void => {
  it("appends a new leaf as most-recent (last)", (): void => {
    const history: FocusHistory = pushFocusHistory(EMPTY_FOCUS_HISTORY, "a");
    expect(history.entries).toEqual(["a"]);
    expect(pushFocusHistory(history, "b").entries).toEqual(["a", "b"]);
  });

  it("moves an existing leaf to most-recent rather than duplicating", (): void => {
    const history: FocusHistory = build(["a", "b", "c"]);
    expect(pushFocusHistory(history, "a").entries).toEqual(["b", "c", "a"]);
  });

  it("caps to the limit by dropping the oldest (front) entries", (): void => {
    const history: FocusHistory = build(["a", "b", "c"]);
    expect(pushFocusHistory(history, "d", 3).entries).toEqual(["b", "c", "d"]);
  });

  it("clamps a non-positive limit to 1 (current focus always retained)", (): void => {
    const history: FocusHistory = build(["a", "b"]);
    expect(pushFocusHistory(history, "c", 0).entries).toEqual(["c"]);
    expect(pushFocusHistory(history, "c", -5).entries).toEqual(["c"]);
  });

  it("defaults the limit to FOCUS_HISTORY_DEFAULT_LIMIT", (): void => {
    let history: FocusHistory = EMPTY_FOCUS_HISTORY;
    for (let index: number = 0; index < FOCUS_HISTORY_DEFAULT_LIMIT + 5; index += 1) {
      history = pushFocusHistory(history, `leaf-${index}`);
    }
    expect(history.entries.length).toBe(FOCUS_HISTORY_DEFAULT_LIMIT);
    // the oldest 5 were dropped; the newest is last
    expect(history.entries[history.entries.length - 1]).toBe(`leaf-${FOCUS_HISTORY_DEFAULT_LIMIT + 4}`);
  });
});

describe("resolveFocusCurrentOrLast (toggle target)", (): void => {
  it("returns the most-recent entry distinct from the current pane", (): void => {
    const history: FocusHistory = build(["a", "b", "c"]);
    expect(resolveFocusCurrentOrLast(history, "c")).toBe("b");
  });

  it("returns the most-recent entry outright when current is null", (): void => {
    const history: FocusHistory = build(["a", "b", "c"]);
    expect(resolveFocusCurrentOrLast(history, null)).toBe("c");
  });

  it("returns null when the history holds only the current pane", (): void => {
    expect(resolveFocusCurrentOrLast(build(["a"]), "a")).toBeNull();
  });

  it("returns null for an empty history", (): void => {
    expect(resolveFocusCurrentOrLast(EMPTY_FOCUS_HISTORY, "a")).toBeNull();
    expect(resolveFocusCurrentOrLast(EMPTY_FOCUS_HISTORY, null)).toBeNull();
  });

  it("supports a stable two-pane bounce under repeated focus+push", (): void => {
    // focus a, then b: history ["a","b"]; current b → toggles to a
    let history: FocusHistory = pushFocusHistory(pushFocusHistory(EMPTY_FOCUS_HISTORY, "a"), "b");
    const first: string | null = resolveFocusCurrentOrLast(history, "b");
    expect(first).toBe("a");
    // focusing a pushes it → ["b","a"]; current a → toggles back to b
    history = pushFocusHistory(history, "a");
    const second: string | null = resolveFocusCurrentOrLast(history, "a");
    expect(second).toBe("b");
  });
});

describe("pruneFocusHistory (drop removed leaves, preserve MRU order)", (): void => {
  it("drops entries no longer in the live tree", (): void => {
    const history: FocusHistory = build(["a", "b", "c"]);
    expect(pruneFocusHistory(history, ["a", "c"]).entries).toEqual(["a", "c"]);
  });

  it("returns the same reference when nothing is pruned (stable identity)", (): void => {
    const history: FocusHistory = build(["a", "b"]);
    expect(pruneFocusHistory(history, ["a", "b", "z"])).toBe(history);
  });

  it("yields an empty history when no entries survive", (): void => {
    const history: FocusHistory = build(["a", "b"]);
    expect(pruneFocusHistory(history, []).entries).toEqual([]);
  });
});
