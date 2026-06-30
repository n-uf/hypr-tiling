import { describe, expect, it } from "@jest/globals";
import {
  commandRequiredCapability,
  isCommandEnabled,
  keyboardActionToCommand,
  tabDoubleClickMaximizeCommand,
} from "../commands";
import type { TilingCommandGates } from "../commands";
import { resolveMaximizeToggle } from "../pane-switching";
import type { TilingCommand, TilingKeyboardAction } from "../types";

/**
 * Pure unit coverage for the command contract (HT-API-COMMAND-KEYBOARD-SURFACE
 * half A): the command→capability gate (`commandRequiredCapability` /
 * `isCommandEnabled`) and the fixed-keymap→command bridge
 * (`keyboardActionToCommand`).
 */

const ALL_ENABLED: TilingCommandGates = {
  maximizeEnabled: true,
  paneSwitchingEnabled: true,
  focusEnabled: true,
  rearrangeEnabled: true,
  sizingEnabled: true,
  acquireSpaceEnabled: true,
  resizeEnabled: true,
  layoutEnabled: true,
  groupingEnabled: true,
};

const ALL_DISABLED: TilingCommandGates = {
  maximizeEnabled: false,
  paneSwitchingEnabled: false,
  focusEnabled: false,
  rearrangeEnabled: false,
  sizingEnabled: false,
  acquireSpaceEnabled: false,
  resizeEnabled: false,
  layoutEnabled: false,
  groupingEnabled: false,
};

describe("commandRequiredCapability (command → capability gate map)", (): void => {
  it("maps focus commands to focusEnabled", (): void => {
    expect(commandRequiredCapability({ kind: "focus-pane", leafId: "a" })).toBe("focusEnabled");
    expect(commandRequiredCapability({ kind: "focus-direction", direction: "left" })).toBe("focusEnabled");
    expect(commandRequiredCapability({ kind: "focus-current-or-last" })).toBe("focusEnabled");
  });

  it("maps cycle / jump commands to paneSwitchingEnabled", (): void => {
    expect(commandRequiredCapability({ kind: "focus-cycle", direction: "next" })).toBe("paneSwitchingEnabled");
    expect(commandRequiredCapability({ kind: "focus-jump", paneNumber: 3 })).toBe("paneSwitchingEnabled");
  });

  it("maps maximize family to maximizeEnabled", (): void => {
    expect(commandRequiredCapability({ kind: "toggle-maximize" })).toBe("maximizeEnabled");
    expect(commandRequiredCapability({ kind: "maximize" })).toBe("maximizeEnabled");
    expect(commandRequiredCapability({ kind: "restore" })).toBe("maximizeEnabled");
  });

  it("maps move-mode / swap / insert commands to rearrangeEnabled", (): void => {
    expect(commandRequiredCapability({ kind: "enter-move-mode" })).toBe("rearrangeEnabled");
    expect(commandRequiredCapability({ kind: "move-aim", direction: "up" })).toBe("rearrangeEnabled");
    expect(commandRequiredCapability({ kind: "commit-move-mode" })).toBe("rearrangeEnabled");
    expect(commandRequiredCapability({ kind: "cancel-move-mode" })).toBe("rearrangeEnabled");
    expect(commandRequiredCapability({ kind: "swap-panes", sourceLeafId: "a", targetLeafId: "b" })).toBe("rearrangeEnabled");
    expect(
      commandRequiredCapability({ kind: "insert-adjacent", sourceLeafId: "a", targetLeafId: "b", placement: "left" }),
    ).toBe("rearrangeEnabled");
  });

  it("maps acquire-space / set-sizing / resize commands to their gates", (): void => {
    expect(commandRequiredCapability({ kind: "acquire-space", direction: "right" })).toBe("acquireSpaceEnabled");
    expect(commandRequiredCapability({ kind: "set-sizing", mode: "flexible" })).toBe("sizingEnabled");
    expect(commandRequiredCapability({ kind: "set-split-ratio", splitId: "s", ratio: 0.5 })).toBe("resizeEnabled");
    expect(commandRequiredCapability({ kind: "toggle-split-axis", splitId: "s" })).toBe("resizeEnabled");
  });

  it("maps the master/stack layout commands to layoutEnabled", (): void => {
    expect(commandRequiredCapability({ kind: "set-layout-mode", mode: "master" })).toBe("layoutEnabled");
    expect(commandRequiredCapability({ kind: "cycle-layout-mode" })).toBe("layoutEnabled");
    expect(commandRequiredCapability({ kind: "set-master-count", count: 2 })).toBe("layoutEnabled");
    expect(commandRequiredCapability({ kind: "adjust-master-count", delta: 1 })).toBe("layoutEnabled");
    expect(commandRequiredCapability({ kind: "set-master-orientation", orientation: "top" })).toBe("layoutEnabled");
    expect(commandRequiredCapability({ kind: "cycle-master-orientation" })).toBe("layoutEnabled");
    expect(commandRequiredCapability({ kind: "adjust-master-ratio", delta: 0.05 })).toBe("layoutEnabled");
  });
});

describe("isCommandEnabled (gate evaluation)", (): void => {
  it("is true for every command when all gates are enabled", (): void => {
    const commands: ReadonlyArray<TilingCommand> = [
      { kind: "focus-pane", leafId: "a" },
      { kind: "focus-cycle", direction: "next" },
      { kind: "toggle-maximize" },
      { kind: "swap-panes", sourceLeafId: "a", targetLeafId: "b" },
      { kind: "acquire-space", direction: "left" },
      { kind: "set-sizing", mode: "flexible" },
      { kind: "set-split-ratio", splitId: "s", ratio: 0.4 },
    ];
    for (const command of commands) {
      expect(isCommandEnabled(command, ALL_ENABLED)).toBe(true);
    }
  });

  it("is false for every gated command when all gates are disabled", (): void => {
    const commands: ReadonlyArray<TilingCommand> = [
      { kind: "focus-pane", leafId: "a" },
      { kind: "focus-cycle", direction: "next" },
      { kind: "toggle-maximize" },
      { kind: "swap-panes", sourceLeafId: "a", targetLeafId: "b" },
      { kind: "acquire-space", direction: "left" },
      { kind: "set-sizing", mode: "flexible" },
      { kind: "toggle-split-axis", splitId: "s" },
    ];
    for (const command of commands) {
      expect(isCommandEnabled(command, ALL_DISABLED)).toBe(false);
    }
  });

  it("gates independently per capability", (): void => {
    const onlyFocus: TilingCommandGates = { ...ALL_DISABLED, focusEnabled: true };
    expect(isCommandEnabled({ kind: "focus-direction", direction: "down" }, onlyFocus)).toBe(true);
    expect(isCommandEnabled({ kind: "focus-cycle", direction: "next" }, onlyFocus)).toBe(false);
    expect(isCommandEnabled({ kind: "toggle-maximize" }, onlyFocus)).toBe(false);
  });

  it("gates the master/stack commands behind layoutEnabled only", (): void => {
    const onlyLayout: TilingCommandGates = { ...ALL_DISABLED, layoutEnabled: true };
    expect(isCommandEnabled({ kind: "cycle-layout-mode" }, onlyLayout)).toBe(true);
    expect(isCommandEnabled({ kind: "adjust-master-ratio", delta: 0.05 }, onlyLayout)).toBe(true);
    expect(isCommandEnabled({ kind: "cycle-layout-mode" }, ALL_DISABLED)).toBe(false);
  });
});

describe("tabDoubleClickMaximizeCommand (tab double-click → maximize toggle)", (): void => {
  it("builds a toggle-maximize command targeting the tab's leaf explicitly", (): void => {
    expect(tabDoubleClickMaximizeCommand("b")).toEqual({ kind: "toggle-maximize", leafId: "b" });
  });

  it("is gated by maximizeEnabled (no-op when maximize is disabled)", (): void => {
    expect(isCommandEnabled(tabDoubleClickMaximizeCommand("b"), ALL_ENABLED)).toBe(true);
    const maximizeOff: TilingCommandGates = { ...ALL_ENABLED, maximizeEnabled: false };
    expect(isCommandEnabled(tabDoubleClickMaximizeCommand("b"), maximizeOff)).toBe(false);
  });

  it("a tab double-click maximizes the leaf, and a second double-click restores it", (): void => {
    // Models the renderer's dispatch path: each tab double-click dispatches
    // `tabDoubleClickMaximizeCommand(leafId)` → the `toggle-maximize` arm folds
    // the maximized-leaf state through `resolveMaximizeToggle(current, leafId)`.
    const command: TilingCommand = tabDoubleClickMaximizeCommand("b");
    expect(command.kind === "toggle-maximize" && command.leafId).toBe("b");

    // First double-click: nothing maximized → leaf "b" maximizes.
    const afterFirst: string | null = resolveMaximizeToggle(null, "b");
    expect(afterFirst).toBe("b");

    // Second double-click on the same tab: the maximized leaf restores.
    const afterSecond: string | null = resolveMaximizeToggle(afterFirst, "b");
    expect(afterSecond).toBeNull();
  });

  it("targets the tab's own leaf regardless of which pane is focused (converges with Alt+Enter)", (): void => {
    // The keyboard `toggle-maximize` (no leafId) falls back to the focused leaf;
    // the tab double-click pins the leaf explicitly, so double-clicking tab "c"
    // while "a" is maximized maximizes "c" (not the focused pane).
    expect(tabDoubleClickMaximizeCommand("c")).toEqual({ kind: "toggle-maximize", leafId: "c" });
    expect(resolveMaximizeToggle("a", "c")).toBe("c");
  });
});

describe("keyboardActionToCommand (fixed-keymap → command bridge)", (): void => {
  it("bridges previous-pane / next-pane to focus-cycle with direction", (): void => {
    expect(keyboardActionToCommand({ kind: "previous-pane" })).toEqual({ kind: "focus-cycle", direction: "previous" });
    expect(keyboardActionToCommand({ kind: "next-pane" })).toEqual({ kind: "focus-cycle", direction: "next" });
  });

  it("bridges jump-to-pane carrying the dynamic pane number", (): void => {
    expect(keyboardActionToCommand({ kind: "jump-to-pane", paneNumber: 5 })).toEqual({ kind: "focus-jump", paneNumber: 5 });
  });

  it("bridges focus-direction preserving the direction", (): void => {
    const action: TilingKeyboardAction = { kind: "focus-direction", direction: "right" };
    expect(keyboardActionToCommand(action)).toEqual({ kind: "focus-direction", direction: "right" });
  });

  it("bridges the remaining 1:1 actions", (): void => {
    expect(keyboardActionToCommand({ kind: "toggle-maximize" })).toEqual({ kind: "toggle-maximize" });
    expect(keyboardActionToCommand({ kind: "restore" })).toEqual({ kind: "restore" });
    expect(keyboardActionToCommand({ kind: "focus-current-or-last" })).toEqual({ kind: "focus-current-or-last" });
    expect(keyboardActionToCommand({ kind: "enter-move-mode" })).toEqual({ kind: "enter-move-mode" });
  });

  it("bridges the master/stack keyboard actions to their commands (preserving deltas)", (): void => {
    expect(keyboardActionToCommand({ kind: "cycle-layout-mode" })).toEqual({ kind: "cycle-layout-mode" });
    expect(keyboardActionToCommand({ kind: "cycle-master-orientation" })).toEqual({ kind: "cycle-master-orientation" });
    expect(keyboardActionToCommand({ kind: "adjust-master-count", delta: 1 })).toEqual({ kind: "adjust-master-count", delta: 1 });
    expect(keyboardActionToCommand({ kind: "adjust-master-count", delta: -1 })).toEqual({ kind: "adjust-master-count", delta: -1 });
    expect(keyboardActionToCommand({ kind: "adjust-master-ratio", delta: 0.05 })).toEqual({ kind: "adjust-master-ratio", delta: 0.05 });
    expect(keyboardActionToCommand({ kind: "adjust-master-ratio", delta: -0.05 })).toEqual({ kind: "adjust-master-ratio", delta: -0.05 });
  });
});
