import { describe, expect, it } from "@jest/globals";
import {
  TILING_KEYMAP_DEFAULTS,
  advancePaneSwitcher,
  chordHasModifier,
  commitPaneSwitcher,
  cycleNextIndex,
  cyclePreviousIndex,
  directionToPlacement,
  isSwitcherHoldReleased,
  jumpPaneSwitcher,
  jumpToPaneIndex,
  matchJumpToPaneNumber,
  matchKeyChord,
  matchKeymapAction,
  modifiersHaveModifier,
  openPaneSwitcher,
  resolveCycledPaneId,
  resolveJumpedPaneId,
  resolveKeymap,
  resolveMaximizeToggle,
} from "../pane-switching";
import type {
  ResolvedTilingKeyChordModifiers,
  ResolvedTilingKeymap,
  TilingKeyboardAction,
  TilingKeyboardEventLike,
  TilingPaneSwitcherState,
} from "../types";

/**
 * Build a keyboard-event-like for matching. `code` is the PHYSICAL key the
 * matcher consults; `key` (the produced character) defaults to the code but can
 * be overridden to simulate the macOS Option-glyph rewrite (e.g. `Alt+]`
 * produces `code: "BracketRight"` but `key: "‘"`).
 */
function keyEvent(
  code: string,
  modifiers?: { alt?: boolean; ctrl?: boolean; meta?: boolean; shift?: boolean },
  key?: string,
): TilingKeyboardEventLike {
  return {
    code,
    key: key ?? code,
    altKey: modifiers?.alt ?? false,
    ctrlKey: modifiers?.ctrl ?? false,
    metaKey: modifiers?.meta ?? false,
    shiftKey: modifiers?.shift ?? false,
  };
}

const BOTH_ENABLED = {
  maximizeEnabled: true,
  paneSwitchingEnabled: true,
  focusEnabled: true,
  rearrangeEnabled: true,
} as const;
const ALT_MODIFIERS: ResolvedTilingKeyChordModifiers = { alt: true, ctrl: false, meta: false, shift: false };

describe("resolveKeymap (defaulting / merge)", (): void => {
  it("resolves undefined to the documented defaults", (): void => {
    expect(resolveKeymap(undefined)).toEqual(TILING_KEYMAP_DEFAULTS);
  });

  it("resolves null to the documented defaults", (): void => {
    expect(resolveKeymap(null)).toEqual(TILING_KEYMAP_DEFAULTS);
  });

  it("resolves an empty object to the documented defaults", (): void => {
    expect(resolveKeymap({})).toEqual(TILING_KEYMAP_DEFAULTS);
  });

  it("documents the expected default bindings (code-based, browser-graceful)", (): void => {
    expect(TILING_KEYMAP_DEFAULTS.toggleMaximize).toEqual({ code: "Enter", alt: true, ctrl: false, meta: false, shift: false });
    expect(TILING_KEYMAP_DEFAULTS.restore).toEqual({ code: "Escape", alt: false, ctrl: false, meta: false, shift: false });
    expect(TILING_KEYMAP_DEFAULTS.previousPane).toEqual({ code: "BracketLeft", alt: true, ctrl: false, meta: false, shift: false });
    expect(TILING_KEYMAP_DEFAULTS.nextPane).toEqual({ code: "BracketRight", alt: true, ctrl: false, meta: false, shift: false });
    expect(TILING_KEYMAP_DEFAULTS.jumpToPane).toEqual({ alt: true, ctrl: false, meta: false, shift: false });
  });

  it("merges a partial override at the action level (others stay default)", (): void => {
    const resolved: ResolvedTilingKeymap = resolveKeymap({ nextPane: { code: "Period", ctrl: true } });
    expect(resolved.nextPane).toEqual({ code: "Period", alt: false, ctrl: true, meta: false, shift: false });
    expect(resolved.previousPane).toEqual(TILING_KEYMAP_DEFAULTS.previousPane);
    expect(resolved.toggleMaximize).toEqual(TILING_KEYMAP_DEFAULTS.toggleMaximize);
  });

  it("defaults unspecified chord modifiers to false (not inherited from the default)", (): void => {
    const resolved: ResolvedTilingKeymap = resolveKeymap({ toggleMaximize: { code: "KeyM" } });
    expect(resolved.toggleMaximize).toEqual({ code: "KeyM", alt: false, ctrl: false, meta: false, shift: false });
  });

  it("overrides the jump-to-pane modifier set", (): void => {
    const resolved: ResolvedTilingKeymap = resolveKeymap({ jumpToPane: { ctrl: true } });
    expect(resolved.jumpToPane).toEqual({ alt: false, ctrl: true, meta: false, shift: false });
  });
});

describe("matchKeyChord / matchKeymapAction (physical code matching)", (): void => {
  it("matches the default maximize / restore bindings", (): void => {
    expect(matchKeyChord(keyEvent("Enter", { alt: true }), TILING_KEYMAP_DEFAULTS.toggleMaximize)).toBe(true);
    expect(matchKeyChord(keyEvent("Escape"), TILING_KEYMAP_DEFAULTS.restore)).toBe(true);
  });

  it("requires an exact modifier state (extra modifier blocks the match)", (): void => {
    expect(matchKeyChord(keyEvent("Enter", { alt: true, ctrl: true }), TILING_KEYMAP_DEFAULTS.toggleMaximize)).toBe(false);
    expect(matchKeyChord(keyEvent("Enter"), TILING_KEYMAP_DEFAULTS.toggleMaximize)).toBe(false);
  });

  it("resolves the toggle-maximize and restore actions", (): void => {
    expect(matchKeymapAction(keyEvent("Enter", { alt: true }), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toEqual({
      kind: "toggle-maximize",
    });
    expect(matchKeymapAction(keyEvent("Escape"), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toEqual({ kind: "restore" });
  });

  it("resolves the cycle and jump actions on physical codes", (): void => {
    expect(matchKeymapAction(keyEvent("BracketLeft", { alt: true }), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toEqual({
      kind: "previous-pane",
    });
    expect(matchKeymapAction(keyEvent("BracketRight", { alt: true }), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toEqual({
      kind: "next-pane",
    });
    const jump: TilingKeyboardAction | null = matchKeymapAction(keyEvent("Digit3", { alt: true }), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED);
    expect(jump).toEqual({ kind: "jump-to-pane", paneNumber: 3 });
  });

  it("matches DESPITE the macOS Option-glyph rewrite of event.key (the BUG 2 regression)", (): void => {
    // On macOS/Arc, Alt+] yields key "‘", Alt+[ yields key "“", Alt+1 yields "¡",
    // Alt+Enter still "Enter". The old event.key comparison never matched these.
    expect(matchKeymapAction(keyEvent("BracketRight", { alt: true }, "‘"), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toEqual({
      kind: "next-pane",
    });
    expect(matchKeymapAction(keyEvent("BracketLeft", { alt: true }, "“"), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toEqual({
      kind: "previous-pane",
    });
    expect(matchKeymapAction(keyEvent("Digit1", { alt: true }, "¡"), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toEqual({
      kind: "jump-to-pane",
      paneNumber: 1,
    });
    expect(matchKeymapAction(keyEvent("Digit9", { alt: true }, "º"), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toEqual({
      kind: "jump-to-pane",
      paneNumber: 9,
    });
  });

  it("returns null for disabled capability groups", (): void => {
    expect(
      matchKeymapAction(keyEvent("Enter", { alt: true }), TILING_KEYMAP_DEFAULTS, {
        maximizeEnabled: false,
        paneSwitchingEnabled: true,
        focusEnabled: true,
        rearrangeEnabled: true,
      }),
    ).toBeNull();
    expect(
      matchKeymapAction(keyEvent("BracketRight", { alt: true }), TILING_KEYMAP_DEFAULTS, {
        maximizeEnabled: true,
        paneSwitchingEnabled: false,
        focusEnabled: true,
        rearrangeEnabled: true,
      }),
    ).toBeNull();
  });

  it("does not hijack reserved browser shortcuts (matched by physical code)", (): void => {
    expect(matchKeymapAction(keyEvent("F11"), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toBeNull();
    expect(matchKeymapAction(keyEvent("KeyW", { ctrl: true }), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toBeNull();
    expect(matchKeymapAction(keyEvent("KeyW", { meta: true }), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toBeNull();
    expect(matchKeymapAction(keyEvent("KeyT", { ctrl: true }), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toBeNull();
    expect(matchKeymapAction(keyEvent("KeyT", { meta: true }), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toBeNull();
    expect(matchKeymapAction(keyEvent("Tab", { ctrl: true }), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toBeNull();
    // Cmd+1..9 (browser tab jump) uses Meta, not Alt — must not match the jump family.
    expect(matchKeymapAction(keyEvent("Digit1", { meta: true }), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toBeNull();
    // Bare Enter / Escape (no Alt) must not match the Alt+Enter maximize chord.
    expect(matchKeymapAction(keyEvent("Enter"), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toBeNull();
  });

  it("resolves the master/stack layout chords (gated at dispatch, so matched regardless of guards)", (): void => {
    expect(matchKeymapAction(keyEvent("KeyL", { alt: true }), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toEqual({
      kind: "cycle-layout-mode",
    });
    expect(matchKeymapAction(keyEvent("KeyO", { alt: true, shift: true }), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toEqual({
      kind: "cycle-master-orientation",
    });
    expect(matchKeymapAction(keyEvent("KeyO", { alt: true }), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toBeNull();
    expect(matchKeymapAction(keyEvent("Equal", { alt: true }), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toEqual({
      kind: "adjust-master-count",
      delta: 1,
    });
    expect(matchKeymapAction(keyEvent("Minus", { alt: true }), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toEqual({
      kind: "adjust-master-count",
      delta: -1,
    });
    expect(matchKeymapAction(keyEvent("Period", { alt: true }), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toEqual({
      kind: "adjust-master-ratio",
      delta: 0.05,
    });
    expect(matchKeymapAction(keyEvent("Comma", { alt: true }), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toEqual({
      kind: "adjust-master-ratio",
      delta: -0.05,
    });
  });

  it("the master chords require Alt (bare keys leave the event alone)", (): void => {
    expect(matchKeymapAction(keyEvent("KeyL"), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toBeNull();
    expect(matchKeymapAction(keyEvent("Comma"), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toBeNull();
  });
});

describe("matchKeymapAction (keyboard a11y: directional focus + move-mode entry)", (): void => {
  it("resolves the bare arrow keys to directional focus actions when focus is enabled", (): void => {
    expect(matchKeymapAction(keyEvent("ArrowLeft"), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toEqual({
      kind: "focus-direction",
      direction: "left",
    });
    expect(matchKeymapAction(keyEvent("ArrowRight"), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toEqual({
      kind: "focus-direction",
      direction: "right",
    });
    expect(matchKeymapAction(keyEvent("ArrowUp"), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toEqual({
      kind: "focus-direction",
      direction: "up",
    });
    expect(matchKeymapAction(keyEvent("ArrowDown"), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toEqual({
      kind: "focus-direction",
      direction: "down",
    });
  });

  it("does not resolve arrow keys when focus is disabled", (): void => {
    expect(
      matchKeymapAction(keyEvent("ArrowLeft"), TILING_KEYMAP_DEFAULTS, {
        maximizeEnabled: true,
        paneSwitchingEnabled: true,
        focusEnabled: false,
        rearrangeEnabled: true,
      }),
    ).toBeNull();
  });

  it("requires the arrows to be bare (a modifier disqualifies focus nav)", (): void => {
    expect(matchKeymapAction(keyEvent("ArrowLeft", { alt: true }), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toBeNull();
    expect(matchKeymapAction(keyEvent("ArrowRight", { shift: true }), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toBeNull();
  });

  it("resolves Alt+M to move-mode entry only when rearrange is enabled", (): void => {
    expect(matchKeymapAction(keyEvent("KeyM", { alt: true }), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toEqual({
      kind: "enter-move-mode",
    });
    expect(
      matchKeymapAction(keyEvent("KeyM", { alt: true }), TILING_KEYMAP_DEFAULTS, {
        maximizeEnabled: true,
        paneSwitchingEnabled: true,
        focusEnabled: true,
        rearrangeEnabled: false,
      }),
    ).toBeNull();
    // Bare M / Cmd+M must not match the Alt-only move-mode chord.
    expect(matchKeymapAction(keyEvent("KeyM"), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toBeNull();
    expect(matchKeymapAction(keyEvent("KeyM", { meta: true }), TILING_KEYMAP_DEFAULTS, BOTH_ENABLED)).toBeNull();
  });

  it("honors a custom focus binding (code-based)", (): void => {
    const resolved: ResolvedTilingKeymap = resolveKeymap({ focusLeft: { code: "KeyH" } });
    expect(matchKeymapAction(keyEvent("KeyH"), resolved, BOTH_ENABLED)).toEqual({
      kind: "focus-direction",
      direction: "left",
    });
    // The default ArrowLeft no longer matches the (re-bound) focusLeft action.
    expect(matchKeymapAction(keyEvent("ArrowLeft"), resolved, BOTH_ENABLED)).toBeNull();
  });
});

describe("directionToPlacement (move-mode arrow → insert placement edge)", (): void => {
  it("maps each direction to the same-named target edge", (): void => {
    expect(directionToPlacement("left")).toBe("left");
    expect(directionToPlacement("right")).toBe("right");
    expect(directionToPlacement("up")).toBe("top");
    expect(directionToPlacement("down")).toBe("bottom");
  });
});

describe("resolveKeymap (directional focus + move-mode defaults)", (): void => {
  it("defaults the focus arrows to bare arrow codes", (): void => {
    expect(TILING_KEYMAP_DEFAULTS.focusLeft).toEqual({ code: "ArrowLeft", alt: false, ctrl: false, meta: false, shift: false });
    expect(TILING_KEYMAP_DEFAULTS.focusRight).toEqual({ code: "ArrowRight", alt: false, ctrl: false, meta: false, shift: false });
    expect(TILING_KEYMAP_DEFAULTS.focusUp).toEqual({ code: "ArrowUp", alt: false, ctrl: false, meta: false, shift: false });
    expect(TILING_KEYMAP_DEFAULTS.focusDown).toEqual({ code: "ArrowDown", alt: false, ctrl: false, meta: false, shift: false });
  });

  it("defaults move-mode entry to Alt+M", (): void => {
    expect(TILING_KEYMAP_DEFAULTS.enterMoveMode).toEqual({ code: "KeyM", alt: true, ctrl: false, meta: false, shift: false });
  });

  it("merges a partial focus override at the action level (others stay default)", (): void => {
    const resolved: ResolvedTilingKeymap = resolveKeymap({ focusUp: { code: "KeyK" } });
    expect(resolved.focusUp).toEqual({ code: "KeyK", alt: false, ctrl: false, meta: false, shift: false });
    expect(resolved.focusDown).toEqual(TILING_KEYMAP_DEFAULTS.focusDown);
    expect(resolved.enterMoveMode).toEqual(TILING_KEYMAP_DEFAULTS.enterMoveMode);
  });

  it("defaults the master/stack chords to their Alt-based codes", (): void => {
    expect(TILING_KEYMAP_DEFAULTS.cycleLayoutMode).toEqual({ code: "KeyL", alt: true, ctrl: false, meta: false, shift: false });
    expect(TILING_KEYMAP_DEFAULTS.cycleMasterOrientation).toEqual({ code: "KeyO", alt: true, ctrl: false, meta: false, shift: true });
    expect(TILING_KEYMAP_DEFAULTS.incrementMasterCount).toEqual({ code: "Equal", alt: true, ctrl: false, meta: false, shift: false });
    expect(TILING_KEYMAP_DEFAULTS.decrementMasterCount).toEqual({ code: "Minus", alt: true, ctrl: false, meta: false, shift: false });
    expect(TILING_KEYMAP_DEFAULTS.incrementMasterRatio).toEqual({ code: "Period", alt: true, ctrl: false, meta: false, shift: false });
    expect(TILING_KEYMAP_DEFAULTS.decrementMasterRatio).toEqual({ code: "Comma", alt: true, ctrl: false, meta: false, shift: false });
  });

  it("merges a partial master-chord override (others stay default)", (): void => {
    const resolved: ResolvedTilingKeymap = resolveKeymap({ cycleLayoutMode: { code: "KeyG", alt: true } });
    expect(resolved.cycleLayoutMode).toEqual({ code: "KeyG", alt: true, ctrl: false, meta: false, shift: false });
    expect(resolved.cycleMasterOrientation).toEqual(TILING_KEYMAP_DEFAULTS.cycleMasterOrientation);
  });
});

describe("matchJumpToPaneNumber (Digit code matching)", (): void => {
  it("resolves 1..9 under the matching modifiers", (): void => {
    expect(matchJumpToPaneNumber(keyEvent("Digit1", { alt: true }), ALT_MODIFIERS)).toBe(1);
    expect(matchJumpToPaneNumber(keyEvent("Digit9", { alt: true }), ALT_MODIFIERS)).toBe(9);
  });

  it("resolves despite the Option-glyph key rewrite on macOS", (): void => {
    expect(matchJumpToPaneNumber(keyEvent("Digit5", { alt: true }, "∞"), ALT_MODIFIERS)).toBe(5);
  });

  it("rejects Digit0, non-digit codes, and mismatched modifiers", (): void => {
    expect(matchJumpToPaneNumber(keyEvent("Digit0", { alt: true }), ALT_MODIFIERS)).toBeNull();
    expect(matchJumpToPaneNumber(keyEvent("KeyA", { alt: true }), ALT_MODIFIERS)).toBeNull();
    expect(matchJumpToPaneNumber(keyEvent("Digit5"), ALT_MODIFIERS)).toBeNull();
    expect(matchJumpToPaneNumber(keyEvent("Digit5", { alt: true, ctrl: true }), ALT_MODIFIERS)).toBeNull();
    // Numpad digits are a different physical code family and are intentionally not matched.
    expect(matchJumpToPaneNumber(keyEvent("Numpad5", { alt: true }), ALT_MODIFIERS)).toBeNull();
  });
});

describe("cycleNextIndex / cyclePreviousIndex", (): void => {
  it("advances with wraparound", (): void => {
    expect(cycleNextIndex(0, 3)).toBe(1);
    expect(cycleNextIndex(1, 3)).toBe(2);
    expect(cycleNextIndex(2, 3)).toBe(0);
  });

  it("retreats with wraparound", (): void => {
    expect(cyclePreviousIndex(2, 3)).toBe(1);
    expect(cyclePreviousIndex(1, 3)).toBe(0);
    expect(cyclePreviousIndex(0, 3)).toBe(2);
  });

  it("seeds from a negative current index", (): void => {
    expect(cycleNextIndex(-1, 3)).toBe(0);
    expect(cyclePreviousIndex(-1, 3)).toBe(2);
  });

  it("returns -1 for an empty set", (): void => {
    expect(cycleNextIndex(0, 0)).toBe(-1);
    expect(cyclePreviousIndex(0, 0)).toBe(-1);
  });

  it("wraps a single-pane set onto itself", (): void => {
    expect(cycleNextIndex(0, 1)).toBe(0);
    expect(cyclePreviousIndex(0, 1)).toBe(0);
  });
});

describe("jumpToPaneIndex (clamp / no-op)", (): void => {
  it("maps in-range 1-based numbers to 0-based indices", (): void => {
    expect(jumpToPaneIndex(1, 4)).toBe(0);
    expect(jumpToPaneIndex(4, 4)).toBe(3);
  });

  it("is a no-op (null) when out of range", (): void => {
    expect(jumpToPaneIndex(9, 4)).toBeNull();
    expect(jumpToPaneIndex(0, 4)).toBeNull();
    expect(jumpToPaneIndex(1, 0)).toBeNull();
  });

  it("is a no-op (null) for non-integer requests", (): void => {
    expect(jumpToPaneIndex(2.5, 4)).toBeNull();
    expect(jumpToPaneIndex(Number.NaN, 4)).toBeNull();
  });
});

describe("resolveCycledPaneId / resolveJumpedPaneId", (): void => {
  const leafIds: ReadonlyArray<string> = ["a", "b", "c"];

  it("cycles next/previous with wraparound", (): void => {
    expect(resolveCycledPaneId(leafIds, "a", "next")).toBe("b");
    expect(resolveCycledPaneId(leafIds, "c", "next")).toBe("a");
    expect(resolveCycledPaneId(leafIds, "a", "previous")).toBe("c");
  });

  it("seeds from null current (next → first, previous → last)", (): void => {
    expect(resolveCycledPaneId(leafIds, null, "next")).toBe("a");
    expect(resolveCycledPaneId(leafIds, null, "previous")).toBe("c");
  });

  it("treats an unknown current id like null", (): void => {
    expect(resolveCycledPaneId(leafIds, "zzz", "next")).toBe("a");
  });

  it("returns null for an empty leaf set", (): void => {
    expect(resolveCycledPaneId([], "a", "next")).toBeNull();
  });

  it("resolves jump-to-N or null when out of range", (): void => {
    expect(resolveJumpedPaneId(leafIds, 2)).toBe("b");
    expect(resolveJumpedPaneId(leafIds, 3)).toBe("c");
    expect(resolveJumpedPaneId(leafIds, 4)).toBeNull();
    expect(resolveJumpedPaneId(leafIds, 0)).toBeNull();
  });
});

describe("resolveMaximizeToggle", (): void => {
  it("leaves the state unchanged when no pane is focused", (): void => {
    expect(resolveMaximizeToggle(null, null)).toBeNull();
    expect(resolveMaximizeToggle("a", null)).toBe("a");
  });

  it("maximizes the focused pane when nothing (or another pane) is maximized", (): void => {
    expect(resolveMaximizeToggle(null, "a")).toBe("a");
    expect(resolveMaximizeToggle("a", "b")).toBe("b");
  });

  it("restores (null) when toggling the already-maximized focused pane", (): void => {
    expect(resolveMaximizeToggle("a", "a")).toBeNull();
  });
});

describe("chordHasModifier / modifiersHaveModifier", (): void => {
  it("detects a held modifier on a chord", (): void => {
    expect(chordHasModifier(TILING_KEYMAP_DEFAULTS.nextPane)).toBe(true);
    expect(chordHasModifier(TILING_KEYMAP_DEFAULTS.restore)).toBe(false);
  });

  it("detects a held modifier on a modifier set", (): void => {
    expect(modifiersHaveModifier(ALT_MODIFIERS)).toBe(true);
    expect(modifiersHaveModifier({ alt: false, ctrl: false, meta: false, shift: false })).toBe(false);
  });
});

describe("pane switcher (Cmd+Tab-style) cycle / jump / commit / cancel", (): void => {
  const leafIds: ReadonlyArray<string> = ["a", "b", "c", "d"];

  it("opens seeded from the focused pane, advanced once in the direction", (): void => {
    const opened: TilingPaneSwitcherState | null = openPaneSwitcher(leafIds, "a", "next", ALT_MODIFIERS);
    expect(opened).toEqual({ selectedLeafId: "b", holdModifiers: ALT_MODIFIERS });
    const openedPrev: TilingPaneSwitcherState | null = openPaneSwitcher(leafIds, "a", "previous", ALT_MODIFIERS);
    expect(openedPrev?.selectedLeafId).toBe("d");
  });

  it("seeds from null focus (next → first, previous → last)", (): void => {
    expect(openPaneSwitcher(leafIds, null, "next", ALT_MODIFIERS)?.selectedLeafId).toBe("a");
    expect(openPaneSwitcher(leafIds, null, "previous", ALT_MODIFIERS)?.selectedLeafId).toBe("d");
  });

  it("returns null when there are no panes to switch to", (): void => {
    expect(openPaneSwitcher([], "a", "next", ALT_MODIFIERS)).toBeNull();
  });

  it("advances the highlight with wraparound and preserves hold modifiers", (): void => {
    const state: TilingPaneSwitcherState = { selectedLeafId: "c", holdModifiers: ALT_MODIFIERS };
    expect(advancePaneSwitcher(leafIds, state, "next")).toEqual({ selectedLeafId: "d", holdModifiers: ALT_MODIFIERS });
    expect(advancePaneSwitcher(leafIds, { ...state, selectedLeafId: "d" }, "next").selectedLeafId).toBe("a");
    expect(advancePaneSwitcher(leafIds, { ...state, selectedLeafId: "a" }, "previous").selectedLeafId).toBe("d");
  });

  it("jumps the highlight to a 1-based pane, no-op when out of range", (): void => {
    const state: TilingPaneSwitcherState = { selectedLeafId: "a", holdModifiers: ALT_MODIFIERS };
    expect(jumpPaneSwitcher(leafIds, state, 3).selectedLeafId).toBe("c");
    expect(jumpPaneSwitcher(leafIds, state, 9)).toBe(state); // out of range → unchanged reference
    expect(jumpPaneSwitcher(leafIds, state, 0)).toBe(state);
  });

  it("commits the current selection id", (): void => {
    expect(commitPaneSwitcher({ selectedLeafId: "c", holdModifiers: ALT_MODIFIERS })).toBe("c");
  });

  it("commits on release of any captured hold modifier (default Alt)", (): void => {
    expect(isSwitcherHoldReleased({ altKey: false, ctrlKey: false, metaKey: false, shiftKey: false }, ALT_MODIFIERS)).toBe(true);
    // Alt still held → not yet committed.
    expect(isSwitcherHoldReleased({ altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }, ALT_MODIFIERS)).toBe(false);
  });

  it("commits on release of a custom non-Alt hold modifier", (): void => {
    const metaHold: ResolvedTilingKeyChordModifiers = { alt: false, ctrl: false, meta: true, shift: false };
    expect(isSwitcherHoldReleased({ altKey: false, ctrlKey: false, metaKey: false, shiftKey: false }, metaHold)).toBe(true);
    expect(isSwitcherHoldReleased({ altKey: false, ctrlKey: false, metaKey: true, shiftKey: false }, metaHold)).toBe(false);
  });
});
