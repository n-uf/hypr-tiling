/**
 * Public keyboard-binding registry (HT-API-COMMAND-KEYBOARD-SURFACE, half B).
 *
 * The chord→command registration surface — the Hyprland `bind` analog. Distinct
 * from the fixed `TilingKeymap` chord overrides (which only RE-CHORD the built-in
 * action set): a binding maps an ARBITRARY chord to an ARBITRARY `TilingCommand`,
 * so a consumer can wire any shortcut to any tiler action (including programmatic
 * commands like swap / split-ratio).
 *
 * Pure + DOM-less. The renderer's keydown resolves a command in this order:
 * consumer bindings (first match wins, so they augment / override defaults) →
 * default keymap bindings (unless `replaceDefaults`) → the jump-to-pane Alt+1..9
 * family (kept in the keymap path since the digit is dynamic) → capability gate.
 *
 * Cross-ref: `_agent/command-keyboard-api-design.md` §3; `commands.ts`
 * (`keyboardActionToCommand` + `isCommandEnabled`); `pane-switching.ts`
 * (`matchKeyChord` + `matchKeymapAction`).
 */

import { matchKeyChord } from "./pane-switching";
import type {
  ResolvedTilingKeyChord,
  ResolvedTilingKeymap,
  TilingCommand,
  TilingKeyBinding,
  TilingKeyChord,
  TilingKeyboardEventLike,
} from "./types";

/**
 * Resolve a (possibly partial) binding chord to a fully-explicit chord: absent
 * modifiers resolve to `false` (the chord fully specifies its modifier
 * requirements, never inheriting them), matching `resolveKeyChord` in
 * `pane-switching.ts`.
 */
function resolveBindingChord(chord: TilingKeyChord): ResolvedTilingKeyChord {
  return {
    code: chord.code,
    alt: chord.alt ?? false,
    ctrl: chord.ctrl ?? false,
    meta: chord.meta ?? false,
    shift: chord.shift ?? false,
  };
}

/**
 * The command of the FIRST binding whose chord matches `event` (exact modifier
 * match on the physical `event.code`), or `null` when none match. First-match
 * semantics make binding order significant: an earlier binding wins a chord
 * collision. Capability gating is applied by the caller (`isCommandEnabled`),
 * not here — this is pure chord resolution.
 */
export function matchKeyBinding(
  event: TilingKeyboardEventLike,
  bindings: ReadonlyArray<TilingKeyBinding>,
): TilingCommand | null {
  for (const binding of bindings) {
    if (matchKeyChord(event, resolveBindingChord(binding.chord))) {
      return binding.command;
    }
  }
  return null;
}

/**
 * The default chord→command bindings derived from a resolved keymap — the
 * built-in action set expressed as the binding registry (so a consumer can
 * introspect / extend it). The jump-to-pane Alt+1..9 family is intentionally
 * EXCLUDED: its digit is dynamic, so it stays in the `matchKeymapAction` path
 * rather than being enumerated as nine static bindings.
 */
export function defaultKeyBindings(keymap: ResolvedTilingKeymap): ReadonlyArray<TilingKeyBinding> {
  return [
    { chord: keymap.toggleMaximize, command: { kind: "toggle-maximize" } },
    { chord: keymap.restore, command: { kind: "restore" } },
    { chord: keymap.previousPane, command: { kind: "focus-cycle", direction: "previous" } },
    { chord: keymap.nextPane, command: { kind: "focus-cycle", direction: "next" } },
    { chord: keymap.focusLeft, command: { kind: "focus-direction", direction: "left" } },
    { chord: keymap.focusRight, command: { kind: "focus-direction", direction: "right" } },
    { chord: keymap.focusUp, command: { kind: "focus-direction", direction: "up" } },
    { chord: keymap.focusDown, command: { kind: "focus-direction", direction: "down" } },
    { chord: keymap.enterMoveMode, command: { kind: "enter-move-mode" } },
    { chord: keymap.focusCurrentOrLast, command: { kind: "focus-current-or-last" } },
    // Master/stack layout commands (HT-LAYOUT-MASTER-STACK). The `splitId` is
    // omitted so each resolves against the ROOT split at dispatch time.
    { chord: keymap.cycleLayoutMode, command: { kind: "cycle-layout-mode" } },
    { chord: keymap.cycleMasterOrientation, command: { kind: "cycle-master-orientation" } },
    { chord: keymap.incrementMasterCount, command: { kind: "adjust-master-count", delta: 1 } },
    { chord: keymap.decrementMasterCount, command: { kind: "adjust-master-count", delta: -1 } },
    { chord: keymap.incrementMasterRatio, command: { kind: "adjust-master-ratio", delta: 0.05 } },
    { chord: keymap.decrementMasterRatio, command: { kind: "adjust-master-ratio", delta: -0.05 } },
    // Grouping / tabbed-stacking commands (HT-GROUP-TABBED-STACKING). `toggle-group`
    // resolves against the focused pane; the tab-cycle chords against the focused
    // group, all at dispatch time.
    { chord: keymap.toggleGroup, command: { kind: "toggle-group" } },
    { chord: keymap.groupTabNext, command: { kind: "group-tab-cycle", direction: "next" } },
    { chord: keymap.groupTabPrevious, command: { kind: "group-tab-cycle", direction: "previous" } },
  ];
}

const WORKSPACE_ALT_MODIFIERS: Omit<TilingKeyChord, "code"> = {
  alt: true,
  ctrl: false,
  meta: false,
  shift: false,
};

const WORKSPACE_ALT_SHIFT_MODIFIERS: Omit<TilingKeyChord, "code"> = {
  alt: true,
  ctrl: false,
  meta: false,
  shift: true,
};

/**
 * Optional workspace-navigation key-binding fragment. Hosts merge it into
 * `interaction.keyBindings.bindings` — it is **not** part of
 * `defaultKeyBindings` / `TILING_KEYMAP_DEFAULTS` (no default chords;
 * hosts opt in). `switch-workspace` uses 1-based `index` (and)
 * `move-leaf-to-workspace` uses `direction`) so the fragment does not need a
 * live workspace set at construction time; the set-mode wrapper resolves
 * those against the current tab order at dispatch.
 *
 * - `Alt+ArrowLeft` / `Alt+ArrowRight` → `cycle-workspace` previous / next
 * - `Alt+Digit1`..`Alt+Digit9` → `switch-workspace` to the n-th workspace
 * - `Alt+Shift+ArrowLeft` / `Alt+Shift+ArrowRight` → `move-leaf-to-workspace`
 *   previous / next with `follow: true`
 */
export const WORKSPACE_KEY_BINDINGS: ReadonlyArray<TilingKeyBinding> = [
  {
    chord: { ...WORKSPACE_ALT_MODIFIERS, code: "ArrowLeft" },
    command: { kind: "cycle-workspace", direction: "previous" },
  },
  {
    chord: { ...WORKSPACE_ALT_MODIFIERS, code: "ArrowRight" },
    command: { kind: "cycle-workspace", direction: "next" },
  },
  {
    chord: { ...WORKSPACE_ALT_MODIFIERS, code: "Digit1" },
    command: { kind: "switch-workspace", index: 1 },
  },
  {
    chord: { ...WORKSPACE_ALT_MODIFIERS, code: "Digit2" },
    command: { kind: "switch-workspace", index: 2 },
  },
  {
    chord: { ...WORKSPACE_ALT_MODIFIERS, code: "Digit3" },
    command: { kind: "switch-workspace", index: 3 },
  },
  {
    chord: { ...WORKSPACE_ALT_MODIFIERS, code: "Digit4" },
    command: { kind: "switch-workspace", index: 4 },
  },
  {
    chord: { ...WORKSPACE_ALT_MODIFIERS, code: "Digit5" },
    command: { kind: "switch-workspace", index: 5 },
  },
  {
    chord: { ...WORKSPACE_ALT_MODIFIERS, code: "Digit6" },
    command: { kind: "switch-workspace", index: 6 },
  },
  {
    chord: { ...WORKSPACE_ALT_MODIFIERS, code: "Digit7" },
    command: { kind: "switch-workspace", index: 7 },
  },
  {
    chord: { ...WORKSPACE_ALT_MODIFIERS, code: "Digit8" },
    command: { kind: "switch-workspace", index: 8 },
  },
  {
    chord: { ...WORKSPACE_ALT_MODIFIERS, code: "Digit9" },
    command: { kind: "switch-workspace", index: 9 },
  },
  {
    chord: { ...WORKSPACE_ALT_SHIFT_MODIFIERS, code: "ArrowLeft" },
    command: { kind: "move-leaf-to-workspace", direction: "previous", follow: true },
  },
  {
    chord: { ...WORKSPACE_ALT_SHIFT_MODIFIERS, code: "ArrowRight" },
    command: { kind: "move-leaf-to-workspace", direction: "next", follow: true },
  },
];
