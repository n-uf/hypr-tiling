/**
 * MRU focus history — the pure model behind the "focus current-or-last" toggle
 * (HT-NAV-MRU-FOCUS-TOGGLE; Hyprland `focuscurrentorlast` analog).
 *
 * hypr-tiling cycles a fixed reading-order ring (`resolveCycledPaneId`) with no
 * memory of WHICH pane was focused before the current one. This module adds a
 * most-recently-used stack so a consumer (or the `focus-current-or-last`
 * command) can jump back to the previously-focused pane and toggle between the
 * two — independent of tree order.
 *
 * Pure + DOM-less (the renderer holds the `FocusHistory` in a ref and pushes on
 * every focus change); unit-tested in the `node` jest environment.
 *
 * Cross-ref: `_agent/command-keyboard-api-design.md` §4;
 * `_agent/comparative-analysis/parity-report.md` §5 #8 (MRU focus-toggle gap);
 * `_agent/programme-debt/D-a11y-navigation.md` (HT-NAV-MRU-FOCUS-TOGGLE).
 */

/**
 * An ordered most-recently-used focus list. `entries` is oldest-first /
 * MOST-RECENT-LAST; the final entry is the currently-focused pane once it has
 * been pushed. Each leaf id appears at most once (a re-focus moves it to the
 * end rather than duplicating).
 */
export interface FocusHistory {
  readonly entries: ReadonlyArray<string>;
}

/** Default cap on retained history entries (older entries are dropped from the front). */
export const FOCUS_HISTORY_DEFAULT_LIMIT: number = 32;

/** An empty focus history (no panes focused yet). */
export const EMPTY_FOCUS_HISTORY: FocusHistory = { entries: [] };

/**
 * Push `leafId` as the most-recent focus. If it already appears it is MOVED to
 * the end (de-dupe, not duplicate), so the history stays a clean MRU ordering.
 * The list is capped to `limit` by dropping the oldest (front) entries. A
 * `limit <= 0` clamps to `1` (the current focus is always retained).
 */
export function pushFocusHistory(
  history: FocusHistory,
  leafId: string,
  limit: number = FOCUS_HISTORY_DEFAULT_LIMIT,
): FocusHistory {
  const withoutLeaf: ReadonlyArray<string> = history.entries.filter(
    (entry: string): boolean => entry !== leafId,
  );
  const appended: ReadonlyArray<string> = [...withoutLeaf, leafId];
  const cap: number = limit > 0 ? limit : 1;
  const entries: ReadonlyArray<string> = appended.length > cap
    ? appended.slice(appended.length - cap)
    : appended;
  return { entries };
}

/**
 * Resolve the "current-or-last" target: the most-recent entry that is NOT
 * `currentLeafId` (the previously-focused distinct pane). Returns `null` when
 * there is no such pane (empty history, or only the current pane is recorded).
 *
 * `currentLeafId == null` returns the most-recent entry outright (no current
 * focus to skip). Because focusing the returned pane pushes it to most-recent,
 * repeated toggles bounce between the two panes naturally.
 */
export function resolveFocusCurrentOrLast(
  history: FocusHistory,
  currentLeafId: string | null,
): string | null {
  for (let index: number = history.entries.length - 1; index >= 0; index -= 1) {
    const entry: string = history.entries[index];
    if (currentLeafId == null || entry !== currentLeafId) {
      return entry;
    }
  }
  return null;
}

/**
 * Drop history entries whose leaf id is no longer present in the live tree
 * (`validLeafIds`), preserving MRU order. Called after a layout change so a
 * removed pane is never returned by `resolveFocusCurrentOrLast`.
 */
export function pruneFocusHistory(
  history: FocusHistory,
  validLeafIds: ReadonlyArray<string>,
): FocusHistory {
  const valid: ReadonlySet<string> = new Set<string>(validLeafIds);
  const entries: ReadonlyArray<string> = history.entries.filter(
    (entry: string): boolean => valid.has(entry),
  );
  if (entries.length === history.entries.length) {
    return history;
  }
  return { entries };
}
