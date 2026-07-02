/**
 * Public command contract (HT-API-COMMAND-KEYBOARD-SURFACE, half A).
 *
 * `TilingCommand` (in `types.ts`) is the public API's typed dispatch-style command set
 * — the Hyprland `dispatch` analog. This module holds the PURE logic around it:
 * the command→capability gate (so a command targeting a disabled capability is a
 * safe no-op, reproducing the old `matchKeymapAction` "leave the key alone"
 * behavior) and the bridge from the internal fixed-keymap `TilingKeyboardAction`
 * to a command, so the default keymap path and the public binding registry both
 * funnel to the SAME renderer router.
 *
 * Cross-ref: `_agent/command-keyboard-api-design.md` §2; `keybindings.ts` (the
 * chord→command registry); `pane-switching.ts` (`matchKeymapAction` /
 * `TilingKeyboardAction`).
 */

import type { TilingCommand, TilingKeyboardAction } from "./types";

/**
 * The capability enable-flags a command may require. Superset of
 * `TilingKeymapActionGuards` (which only covers the keyboard-reachable actions)
 * with the sizing / acquire-space / resize gates the programmatic command set
 * also touches. The renderer builds this from its resolved capabilities.
 */
export interface TilingCommandGates {
  /** Maximize / restore commands. */
  maximizeEnabled: boolean;
  /** Pane-switching (focus-cycle / focus-jump) commands. */
  paneSwitchingEnabled: boolean;
  /** Focus selection commands. */
  focusEnabled: boolean;
  /** Drag/keyboard rearrange (move / swap / insert) commands. */
  rearrangeEnabled: boolean;
  /** Per-pane title-bar sizing (`set-sizing`) command. */
  sizingEnabled: boolean;
  /** Directional acquire-space command. */
  acquireSpaceEnabled: boolean;
  /** Divider resize (`set-split-ratio` / `toggle-split-axis`) commands. */
  resizeEnabled: boolean;
  /** Master/stack layout-mode commands (HT-LAYOUT-MASTER-STACK). */
  layoutEnabled: boolean;
  /** Group / tabbed-stacking commands (HT-GROUP-TABBED-STACKING). */
  groupingEnabled: boolean;
}

/**
 * The single capability gate a command requires, or `null` when the command is
 * unconditionally available. Used by `isCommandEnabled` to decide whether a
 * dispatch (keyboard or imperative) should run or stay a no-op.
 */
export function commandRequiredCapability(command: TilingCommand): keyof TilingCommandGates | null {
  switch (command.kind) {
    case "focus-pane":
    case "focus-direction":
    case "focus-current-or-last":
      return "focusEnabled";
    case "focus-cycle":
    case "focus-jump":
      return "paneSwitchingEnabled";
    case "toggle-maximize":
    case "maximize":
    case "restore":
      return "maximizeEnabled";
    case "enter-move-mode":
    case "move-aim":
    case "commit-move-mode":
    case "cancel-move-mode":
    case "swap-panes":
    case "insert-adjacent":
      return "rearrangeEnabled";
    case "acquire-space":
      return "acquireSpaceEnabled";
    case "set-sizing":
      return "sizingEnabled";
    case "set-split-ratio":
    case "toggle-split-axis":
      return "resizeEnabled";
    case "set-layout-mode":
    case "cycle-layout-mode":
    case "set-master-count":
    case "adjust-master-count":
    case "set-master-orientation":
    case "cycle-master-orientation":
    case "adjust-master-ratio":
      return "layoutEnabled";
    case "group-leaves":
    case "toggle-group":
    case "ungroup":
    case "add-to-group":
    case "remove-from-group":
    case "group-tab-cycle":
    case "group-tab-jump":
      return "groupingEnabled";
    default:
      return null;
  }
}

/**
 * Whether `command` would do anything given the current capability gates: `true`
 * when the command's required capability is enabled (or it requires none). A
 * keyboard binding to a disabled-capability command stays browser-graceful (the
 * caller does not `preventDefault`); an imperative `dispatch` of one is a no-op.
 *
 * @example
 * Build your own command bar / keyboard shortcut that only fires (and only
 * renders its button) when the target command is actually enabled — the gate the
 * renderer itself uses for its shortcut chips:
 *
 * ```tsx
 * import {
 *   resolveInteractionCapabilities,
 *   isCommandEnabled,
 *   type TilingCommand,
 *   type TilingCommandGates,
 *   type TilingCommandHandle,
 *   type TilingInteractionCapabilities,
 * } from "@n-uf/hypr-tiling";
 *
 * function gatesFor(interaction?: TilingInteractionCapabilities): TilingCommandGates {
 *   const caps = resolveInteractionCapabilities(interaction);
 *   return {
 *     maximizeEnabled: caps.maximize.enable,
 *     paneSwitchingEnabled: caps.paneSwitching.enable,
 *     focusEnabled: caps.focus,
 *     rearrangeEnabled: caps.rearrange,
 *     sizingEnabled: caps.paneTitleBarControls.sizing,
 *     acquireSpaceEnabled: caps.paneTitleBarControls.acquireSpace,
 *     resizeEnabled: caps.resize !== "none",
 *     layoutEnabled: caps.masterLayout,
 *     groupingEnabled: caps.grouping,
 *   };
 * }
 *
 * function MaximizeButton(props: {
 *   handle: React.RefObject<TilingCommandHandle | null>;
 *   interaction?: TilingInteractionCapabilities;
 * }) {
 *   const command: TilingCommand = { kind: "toggle-maximize" };
 *   if (!isCommandEnabled(command, gatesFor(props.interaction))) {
 *     return null; // maximize is disabled — don't render a dead control
 *   }
 *   return <button onClick={() => props.handle.current?.dispatch(command)}>Maximize</button>;
 * }
 * ```
 */
export function isCommandEnabled(command: TilingCommand, gates: TilingCommandGates): boolean {
  const required: keyof TilingCommandGates | null = commandRequiredCapability(command);
  if (required == null) {
    return true;
  }
  return gates[required];
}

/**
 * The command a tab-strip TAB double-click dispatches to toggle THAT tab's leaf
 * maximize/restore. Targets the tab's `leafId` explicitly (not the focused
 * pane), so the outcome is independent of which pane currently holds focus, and
 * routes through the SAME `toggle-maximize` command the `Alt+Enter` keybinding
 * dispatches — the pointer and keyboard paths converge on one maximize state.
 * Capability gating (`maximizeEnabled` via `isCommandEnabled`) still applies at
 * dispatch, so the double-click is a safe no-op when maximize is disabled.
 */
export function tabDoubleClickMaximizeCommand(leafId: string): TilingCommand {
  return { kind: "toggle-maximize", leafId };
}

/**
 * Bridge an internal fixed-keymap `TilingKeyboardAction` to the public command
 * set. The default keymap path resolves an action via `matchKeymapAction`, then
 * runs it through this bridge so it reaches the same `dispatchCommand` router the
 * binding registry feeds — no duplicated action logic.
 */
export function keyboardActionToCommand(action: TilingKeyboardAction): TilingCommand {
  switch (action.kind) {
    case "toggle-maximize":
      return { kind: "toggle-maximize" };
    case "restore":
      return { kind: "restore" };
    case "previous-pane":
      return { kind: "focus-cycle", direction: "previous" };
    case "next-pane":
      return { kind: "focus-cycle", direction: "next" };
    case "jump-to-pane":
      return { kind: "focus-jump", paneNumber: action.paneNumber };
    case "focus-direction":
      return { kind: "focus-direction", direction: action.direction };
    case "focus-current-or-last":
      return { kind: "focus-current-or-last" };
    case "enter-move-mode":
      return { kind: "enter-move-mode" };
    case "cycle-layout-mode":
      return { kind: "cycle-layout-mode" };
    case "cycle-master-orientation":
      return { kind: "cycle-master-orientation" };
    case "adjust-master-count":
      return { kind: "adjust-master-count", delta: action.delta };
    case "adjust-master-ratio":
      return { kind: "adjust-master-ratio", delta: action.delta };
    case "toggle-group":
      return { kind: "toggle-group" };
    case "group-tab-cycle":
      return { kind: "group-tab-cycle", direction: action.direction };
    default: {
      // Exhaustiveness guard: every `TilingKeyboardAction` kind has an explicit
      // arm above, so this is unreachable. The `never` assignment turns a future
      // unhandled action kind into a COMPILE error instead of a silent fallthrough
      // to `restore`.
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
