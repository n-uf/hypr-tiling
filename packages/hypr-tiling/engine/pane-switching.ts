import type {
  TilingFocusDirection,
  TilingMovePlacement,
  ResolvedTilingKeyChord,
  ResolvedTilingKeyChordModifiers,
  ResolvedTilingKeymap,
  TilingKeyChord,
  TilingKeyChordModifiers,
  TilingKeyboardAction,
  TilingKeyboardEventLike,
  TilingKeyboardModifierState,
  TilingKeymap,
  TilingPaneCycleDirection,
  TilingPaneSwitcherState,
} from "./types";

export type { TilingPaneCycleDirection } from "./types";

/**
 * Documented keymap defaults. Matching keys off the PHYSICAL `KeyboardEvent.code`
 * (not the produced `event.key`), so the bindings hold on macOS / Arc where the
 * Option(Alt) modifier rewrites `event.key` into dead-key glyphs. These are
 * deliberately browser-graceful: they never collide with `F11` (`F11`),
 * `Ctrl/Cmd+W` (`KeyW`), `Ctrl/Cmd+T` (`KeyT`), or `Ctrl+Tab` (`Tab`). Every
 * binding is Alt-based (or bare `Escape`), and matching requires an EXACT
 * modifier state, so e.g. `Cmd+1` (`Digit1`+Meta, a browser tab shortcut) never
 * matches the Alt-only jump family.
 */
export const TILING_KEYMAP_DEFAULTS: ResolvedTilingKeymap = {
  toggleMaximize: { code: "Enter", alt: true, ctrl: false, meta: false, shift: false },
  restore: { code: "Escape", alt: false, ctrl: false, meta: false, shift: false },
  previousPane: { code: "BracketLeft", alt: true, ctrl: false, meta: false, shift: false },
  nextPane: { code: "BracketRight", alt: true, ctrl: false, meta: false, shift: false },
  jumpToPane: { alt: true, ctrl: false, meta: false, shift: false },
  // Directional focus uses BARE arrows: the renderer's document listener is
  // engagement-gated (focus/pointer within the instance) and ignores form-field
  // targets, so the arrows only steal the page scroll while a tiling instance is
  // actually engaged. Matching on `event.code` keeps them layout-independent.
  focusLeft: { code: "ArrowLeft", alt: false, ctrl: false, meta: false, shift: false },
  focusRight: { code: "ArrowRight", alt: false, ctrl: false, meta: false, shift: false },
  focusUp: { code: "ArrowUp", alt: false, ctrl: false, meta: false, shift: false },
  focusDown: { code: "ArrowDown", alt: false, ctrl: false, meta: false, shift: false },
  // Move-mode entry is `Alt+M` — Alt-based + exact-modifier matched, so it never
  // collides with `Cmd/Ctrl+M` (browser/OS minimize) the way a bare key would.
  enterMoveMode: { code: "KeyM", alt: true, ctrl: false, meta: false, shift: false },
  // MRU focus toggle is `Alt+\`` (code `Backquote`) — Alt-based + exact-modifier
  // matched, so it never collides with a bare key or a browser/OS shortcut. On
  // macOS Alt+` is a dead key in `event.key`, but `event.code` is always
  // `"Backquote"`, so matching on the physical code keeps it layout-independent.
  focusCurrentOrLast: { code: "Backquote", alt: true, ctrl: false, meta: false, shift: false },
  // Master/stack layout commands (HT-LAYOUT-MASTER-STACK). All Alt-based +
  // exact-modifier so they never collide with bare keys or browser/OS shortcuts.
  cycleLayoutMode: { code: "KeyL", alt: true, ctrl: false, meta: false, shift: false },
  // Alt+Shift+O (not bare Alt+O): Chrome/Edge on Windows/Linux reserve Alt+O for
  // the browser menu ("Customize and control …"), so the keydown never reaches
  // the page. Shift breaks the menu accelerator while staying Alt-based.
  cycleMasterOrientation: { code: "KeyO", alt: true, ctrl: false, meta: false, shift: true },
  incrementMasterCount: { code: "Equal", alt: true, ctrl: false, meta: false, shift: false },
  decrementMasterCount: { code: "Minus", alt: true, ctrl: false, meta: false, shift: false },
  incrementMasterRatio: { code: "Period", alt: true, ctrl: false, meta: false, shift: false },
  decrementMasterRatio: { code: "Comma", alt: true, ctrl: false, meta: false, shift: false },
  // Grouping / tabbed-stacking (HT-GROUP-TABBED-STACKING). All Alt-based +
  // exact-modifier so they never collide with bare keys or browser/OS shortcuts.
  toggleGroup: { code: "KeyG", alt: true, ctrl: false, meta: false, shift: false },
  groupTabNext: { code: "KeyK", alt: true, ctrl: false, meta: false, shift: false },
  groupTabPrevious: { code: "KeyJ", alt: true, ctrl: false, meta: false, shift: false },
};

const JUMP_TO_PANE_MIN: number = 1;
const JUMP_TO_PANE_MAX: number = 9;
const DIGIT_CODE_PATTERN: RegExp = /^Digit([1-9])$/;

/**
 * Resolve a single chord. `undefined`/`null` → the fallback default. A supplied
 * chord fully specifies itself: unspecified modifiers resolve to `false` (NOT
 * inherited from the fallback), so a custom code never silently carries the
 * default's modifiers.
 */
function resolveKeyChord(
  chord: TilingKeyChord | undefined | null,
  fallback: ResolvedTilingKeyChord,
): ResolvedTilingKeyChord {
  if (chord == null) {
    return fallback;
  }
  return {
    code: chord.code,
    alt: chord.alt ?? false,
    ctrl: chord.ctrl ?? false,
    meta: chord.meta ?? false,
    shift: chord.shift ?? false,
  };
}

function resolveKeyChordModifiers(
  modifiers: TilingKeyChordModifiers | undefined | null,
  fallback: ResolvedTilingKeyChordModifiers,
): ResolvedTilingKeyChordModifiers {
  if (modifiers == null) {
    return fallback;
  }
  return {
    alt: modifiers.alt ?? false,
    ctrl: modifiers.ctrl ?? false,
    meta: modifiers.meta ?? false,
    shift: modifiers.shift ?? false,
  };
}

/**
 * Resolve a public keymap to a fully-resolved keymap. `undefined`/`null` → the
 * documented defaults; a partial keymap merges at the action level (supplying
 * one binding leaves the others at their defaults).
 */
export function resolveKeymap(keymap?: TilingKeymap | null): ResolvedTilingKeymap {
  return {
    toggleMaximize: resolveKeyChord(keymap?.toggleMaximize, TILING_KEYMAP_DEFAULTS.toggleMaximize),
    restore: resolveKeyChord(keymap?.restore, TILING_KEYMAP_DEFAULTS.restore),
    previousPane: resolveKeyChord(keymap?.previousPane, TILING_KEYMAP_DEFAULTS.previousPane),
    nextPane: resolveKeyChord(keymap?.nextPane, TILING_KEYMAP_DEFAULTS.nextPane),
    jumpToPane: resolveKeyChordModifiers(keymap?.jumpToPane, TILING_KEYMAP_DEFAULTS.jumpToPane),
    focusLeft: resolveKeyChord(keymap?.focusLeft, TILING_KEYMAP_DEFAULTS.focusLeft),
    focusRight: resolveKeyChord(keymap?.focusRight, TILING_KEYMAP_DEFAULTS.focusRight),
    focusUp: resolveKeyChord(keymap?.focusUp, TILING_KEYMAP_DEFAULTS.focusUp),
    focusDown: resolveKeyChord(keymap?.focusDown, TILING_KEYMAP_DEFAULTS.focusDown),
    enterMoveMode: resolveKeyChord(keymap?.enterMoveMode, TILING_KEYMAP_DEFAULTS.enterMoveMode),
    focusCurrentOrLast: resolveKeyChord(keymap?.focusCurrentOrLast, TILING_KEYMAP_DEFAULTS.focusCurrentOrLast),
    cycleLayoutMode: resolveKeyChord(keymap?.cycleLayoutMode, TILING_KEYMAP_DEFAULTS.cycleLayoutMode),
    cycleMasterOrientation: resolveKeyChord(
      keymap?.cycleMasterOrientation,
      TILING_KEYMAP_DEFAULTS.cycleMasterOrientation,
    ),
    incrementMasterCount: resolveKeyChord(
      keymap?.incrementMasterCount,
      TILING_KEYMAP_DEFAULTS.incrementMasterCount,
    ),
    decrementMasterCount: resolveKeyChord(
      keymap?.decrementMasterCount,
      TILING_KEYMAP_DEFAULTS.decrementMasterCount,
    ),
    incrementMasterRatio: resolveKeyChord(
      keymap?.incrementMasterRatio,
      TILING_KEYMAP_DEFAULTS.incrementMasterRatio,
    ),
    decrementMasterRatio: resolveKeyChord(
      keymap?.decrementMasterRatio,
      TILING_KEYMAP_DEFAULTS.decrementMasterRatio,
    ),
    toggleGroup: resolveKeyChord(keymap?.toggleGroup, TILING_KEYMAP_DEFAULTS.toggleGroup),
    groupTabNext: resolveKeyChord(keymap?.groupTabNext, TILING_KEYMAP_DEFAULTS.groupTabNext),
    groupTabPrevious: resolveKeyChord(
      keymap?.groupTabPrevious,
      TILING_KEYMAP_DEFAULTS.groupTabPrevious,
    ),
  };
}

/**
 * Exact-match a keyboard event against a resolved chord. The key identity is
 * compared on the PHYSICAL `event.code` (so macOS Option-glyph rewrites of
 * `event.key` are irrelevant); all four modifiers are compared exactly.
 */
export function matchKeyChord(event: TilingKeyboardEventLike, chord: ResolvedTilingKeyChord): boolean {
  return (
    event.code === chord.code &&
    event.altKey === chord.alt &&
    event.ctrlKey === chord.ctrl &&
    event.metaKey === chord.meta &&
    event.shiftKey === chord.shift
  );
}

/**
 * Resolve a `Digit1`..`Digit9` press under the jump-to-pane modifier set.
 * Returns the 1-based pane number, or `null` when the modifiers don't match
 * exactly or the physical code is not a `Digit1`..`Digit9`. Matching on
 * `event.code` is what makes the jump family work on macOS, where `Alt+1`
 * produces a glyph in `event.key` (e.g. `"¡"`) but always `"Digit1"` in
 * `event.code`.
 * @internal
 */
export function matchJumpToPaneNumber(
  event: TilingKeyboardEventLike,
  modifiers: ResolvedTilingKeyChordModifiers,
): number | null {
  if (
    event.altKey !== modifiers.alt ||
    event.ctrlKey !== modifiers.ctrl ||
    event.metaKey !== modifiers.meta ||
    event.shiftKey !== modifiers.shift
  ) {
    return null;
  }
  const match: RegExpExecArray | null = DIGIT_CODE_PATTERN.exec(event.code);
  if (match == null) {
    return null;
  }
  const digit: number = Number.parseInt(match[1], 10);
  if (digit < JUMP_TO_PANE_MIN || digit > JUMP_TO_PANE_MAX) {
    return null;
  }
  return digit;
}

/** Capability enable flags consulted while matching a keyboard action. */
export interface TilingKeymapActionGuards {
  /** Gates the maximize/restore actions (`toggleMaximize` / `restore`). */
  maximizeEnabled: boolean;
  /** Gates the pane-switching actions (`previousPane` / `nextPane` / `jumpToPane`). */
  paneSwitchingEnabled: boolean;
  /** Gates the directional focus actions (`focusLeft/Right/Up/Down`). */
  focusEnabled: boolean;
  /** Gates move-mode entry (`enterMoveMode`); mirrors the drag-rearrange gate. */
  rearrangeEnabled: boolean;
}

const ARROW_FOCUS_DIRECTIONS: ReadonlyArray<{ chord: keyof Pick<ResolvedTilingKeymap, "focusLeft" | "focusRight" | "focusUp" | "focusDown">; direction: TilingFocusDirection }> = [
  { chord: "focusLeft", direction: "left" },
  { chord: "focusRight", direction: "right" },
  { chord: "focusUp", direction: "up" },
  { chord: "focusDown", direction: "down" },
];

/**
 * Resolve a keyboard event to a logical tiling action, honoring capability
 * enable flags. Returns `null` when no binding matches or the owning capability
 * is disabled — the caller then leaves the event alone (no `preventDefault`),
 * keeping unhandled keys browser-graceful.
 */
export function matchKeymapAction(
  event: TilingKeyboardEventLike,
  keymap: ResolvedTilingKeymap,
  guards: TilingKeymapActionGuards,
): TilingKeyboardAction | null {
  if (guards.maximizeEnabled) {
    if (matchKeyChord(event, keymap.toggleMaximize)) {
      return { kind: "toggle-maximize" };
    }
    if (matchKeyChord(event, keymap.restore)) {
      return { kind: "restore" };
    }
  }
  if (guards.paneSwitchingEnabled) {
    if (matchKeyChord(event, keymap.previousPane)) {
      return { kind: "previous-pane" };
    }
    if (matchKeyChord(event, keymap.nextPane)) {
      return { kind: "next-pane" };
    }
    const paneNumber: number | null = matchJumpToPaneNumber(event, keymap.jumpToPane);
    if (paneNumber != null) {
      return { kind: "jump-to-pane", paneNumber };
    }
  }
  if (guards.rearrangeEnabled && matchKeyChord(event, keymap.enterMoveMode)) {
    return { kind: "enter-move-mode" };
  }
  if (guards.focusEnabled) {
    if (matchKeyChord(event, keymap.focusCurrentOrLast)) {
      return { kind: "focus-current-or-last" };
    }
    for (const arrow of ARROW_FOCUS_DIRECTIONS) {
      if (matchKeyChord(event, keymap[arrow.chord])) {
        return { kind: "focus-direction", direction: arrow.direction };
      }
    }
  }
  // Master/stack layout chords (HT-LAYOUT-MASTER-STACK). Matched unconditionally
  // here; the `layoutEnabled` capability gate is applied at dispatch
  // (`isCommandEnabled`), so a disabled layout capability stays browser-graceful
  // (the renderer's command tail skips `preventDefault` on the no-op).
  if (matchKeyChord(event, keymap.cycleLayoutMode)) {
    return { kind: "cycle-layout-mode" };
  }
  if (matchKeyChord(event, keymap.cycleMasterOrientation)) {
    return { kind: "cycle-master-orientation" };
  }
  if (matchKeyChord(event, keymap.incrementMasterCount)) {
    return { kind: "adjust-master-count", delta: 1 };
  }
  if (matchKeyChord(event, keymap.decrementMasterCount)) {
    return { kind: "adjust-master-count", delta: -1 };
  }
  if (matchKeyChord(event, keymap.incrementMasterRatio)) {
    return { kind: "adjust-master-ratio", delta: 0.05 };
  }
  if (matchKeyChord(event, keymap.decrementMasterRatio)) {
    return { kind: "adjust-master-ratio", delta: -0.05 };
  }
  // Grouping / tabbed-stacking chords (HT-GROUP-TABBED-STACKING). Matched
  // unconditionally; the `groupingEnabled` capability gate is applied at dispatch
  // (`isCommandEnabled`), so a disabled grouping capability stays browser-graceful.
  if (matchKeyChord(event, keymap.toggleGroup)) {
    return { kind: "toggle-group" };
  }
  if (matchKeyChord(event, keymap.groupTabNext)) {
    return { kind: "group-tab-cycle", direction: "next" };
  }
  if (matchKeyChord(event, keymap.groupTabPrevious)) {
    return { kind: "group-tab-cycle", direction: "previous" };
  }
  return null;
}

/**
 * Map a move-mode focus direction onto the `insertLeafAdjacent` placement edge
 * of the chosen destination. Moving a pane toward a direction lands it on the
 * SAME-named edge of the neighbor in that direction: e.g. in `[A|B]` with `A`
 * the source, moving `right` selects `B` as the target and inserts `A` on `B`'s
 * `right` → `[B|A]` (A relocated rightward). `left → "left"`, `right →
 * "right"`, `up → "top"`, `down → "bottom"`.
 */
export function directionToPlacement(direction: TilingFocusDirection): TilingMovePlacement {
  if (direction === "left") {
    return "left";
  }
  if (direction === "right") {
    return "right";
  }
  if (direction === "up") {
    return "top";
  }
  return "bottom";
}

/** Next index with wraparound. `currentIndex < 0` → first index. @internal */
export function cycleNextIndex(currentIndex: number, count: number): number {
  if (count <= 0) {
    return -1;
  }
  if (currentIndex < 0) {
    return 0;
  }
  return (currentIndex + 1) % count;
}

/** Previous index with wraparound. `currentIndex < 0` → last index. @internal */
export function cyclePreviousIndex(currentIndex: number, count: number): number {
  if (count <= 0) {
    return -1;
  }
  if (currentIndex < 0) {
    return count - 1;
  }
  return (currentIndex - 1 + count) % count;
}

/**
 * Map a 1-based pane number to a 0-based index. Out-of-range (or non-integer)
 * requests are a no-op (return `null`) — NOT clamped to the nearest pane.
 * @internal
 */
export function jumpToPaneIndex(paneNumber: number, count: number): number | null {
  if (!Number.isInteger(paneNumber)) {
    return null;
  }
  if (paneNumber < 1 || paneNumber > count) {
    return null;
  }
  return paneNumber - 1;
}

/**
 * Resolve the cycled (next/previous, wraparound) leaf id, or `null` if empty.
 * @internal
 */
export function resolveCycledPaneId(
  leafIds: ReadonlyArray<string>,
  currentLeafId: string | null,
  direction: TilingPaneCycleDirection,
): string | null {
  const count: number = leafIds.length;
  if (count === 0) {
    return null;
  }
  const currentIndex: number = currentLeafId == null ? -1 : leafIds.indexOf(currentLeafId);
  const nextIndex: number = direction === "next"
    ? cycleNextIndex(currentIndex, count)
    : cyclePreviousIndex(currentIndex, count);
  if (nextIndex < 0 || nextIndex >= count) {
    return null;
  }
  return leafIds[nextIndex];
}

/**
 * Resolve the jump-to-N leaf id (1-based), or `null` when out of range (no-op).
 *
 * @example
 * Wire your own "jump to pane N" buttons against the leaf order from
 * {@link queryTilingLayout}, dispatching the built-in `focus-jump` command:
 *
 * ```tsx
 * import { queryTilingLayout, resolveJumpedPaneId } from "@n-uf/hypr-tiling";
 *
 * const { leafIds } = queryTilingLayout(layout);
 * leafIds.forEach((_, i) => {
 *   const paneNumber = i + 1;
 *   const targetLeafId = resolveJumpedPaneId(leafIds, paneNumber); // null → out of range
 *   // render a button that dispatches { kind: "focus-jump", paneNumber } when targetLeafId != null
 * });
 * ```
 */
export function resolveJumpedPaneId(
  leafIds: ReadonlyArray<string>,
  paneNumber: number,
): string | null {
  const index: number | null = jumpToPaneIndex(paneNumber, leafIds.length);
  if (index == null) {
    return null;
  }
  return leafIds[index];
}

/**
 * Resolve the next maximized-leaf state from a toggle on `focusedLeafId`:
 * - no focused pane → unchanged (returns the current maximized id);
 * - toggling the already-maximized pane → restore (`null`);
 * - otherwise → maximize the focused pane.
 */
export function resolveMaximizeToggle(
  currentMaximizedLeafId: string | null,
  focusedLeafId: string | null,
): string | null {
  if (focusedLeafId == null) {
    return currentMaximizedLeafId;
  }
  if (currentMaximizedLeafId === focusedLeafId) {
    return null;
  }
  return focusedLeafId;
}

// --- macOS Cmd+Tab-style pane switcher (pure state transitions) ------------

/** Whether a chord requires at least one held modifier (the switcher needs one to commit on release). */
export function chordRequiresModifier(chord: ResolvedTilingKeyChord): boolean {
  return chord.alt || chord.ctrl || chord.meta || chord.shift;
}

/** Whether a modifier set requires at least one held modifier. */
export function hasAnyModifier(modifiers: ResolvedTilingKeyChordModifiers): boolean {
  return modifiers.alt || modifiers.ctrl || modifiers.meta || modifiers.shift;
}

/**
 * Open the switcher from a cycle press: seed from the focused pane and advance
 * once in `direction` (so the first `Alt+]` already highlights the next pane,
 * matching the macOS Cmd+Tab feel). Returns `null` when there are no panes.
 * @internal
 */
export function openPaneSwitcher(
  leafIds: ReadonlyArray<string>,
  focusedLeafId: string | null,
  direction: TilingPaneCycleDirection,
  holdModifiers: ResolvedTilingKeyChordModifiers,
): TilingPaneSwitcherState | null {
  const selectedLeafId: string | null = resolveCycledPaneId(leafIds, focusedLeafId, direction);
  if (selectedLeafId == null) {
    return null;
  }
  return { selectedLeafId, holdModifiers };
}

/**
 * Advance the open switcher's highlight one step in `direction` (wraparound).
 * @internal
 */
export function advancePaneSwitcher(
  leafIds: ReadonlyArray<string>,
  state: TilingPaneSwitcherState,
  direction: TilingPaneCycleDirection,
): TilingPaneSwitcherState {
  const nextLeafId: string | null = resolveCycledPaneId(leafIds, state.selectedLeafId, direction);
  if (nextLeafId == null) {
    return state;
  }
  return { ...state, selectedLeafId: nextLeafId };
}

/**
 * Set the open switcher's highlight to a 1-based pane number. Out-of-range
 * requests are a no-op (the highlight is unchanged), mirroring the
 * non-clamping jump semantics.
 * @internal
 */
export function jumpPaneSwitcher(
  leafIds: ReadonlyArray<string>,
  state: TilingPaneSwitcherState,
  paneNumber: number,
): TilingPaneSwitcherState {
  const jumpedLeafId: string | null = resolveJumpedPaneId(leafIds, paneNumber);
  if (jumpedLeafId == null) {
    return state;
  }
  return { ...state, selectedLeafId: jumpedLeafId };
}

/**
 * The pane id to activate when the switcher commits.
 * @internal
 */
export function commitPaneSwitcher(state: TilingPaneSwitcherState): string {
  return state.selectedLeafId;
}

/**
 * Whether the switcher should commit given the post-keyup modifier state: it
 * commits as soon as ANY of the modifiers it was opened under is no longer
 * held. (Default flow: opened under Alt → commits when Alt is released.)
 * @internal
 */
export function isSwitcherHoldReleased(
  event: TilingKeyboardModifierState,
  holdModifiers: ResolvedTilingKeyChordModifiers,
): boolean {
  if (holdModifiers.alt && !event.altKey) {
    return true;
  }
  if (holdModifiers.ctrl && !event.ctrlKey) {
    return true;
  }
  if (holdModifiers.meta && !event.metaKey) {
    return true;
  }
  if (holdModifiers.shift && !event.shiftKey) {
    return true;
  }
  return false;
}
