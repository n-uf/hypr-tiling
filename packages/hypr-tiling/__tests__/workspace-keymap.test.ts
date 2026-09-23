import { describe, expect, it } from "@jest/globals";
import { defaultKeyBindings, matchKeyBinding, WORKSPACE_KEY_BINDINGS } from "../engine/keybindings";
import { resolveKeymap, TILING_KEYMAP_DEFAULTS } from "../engine/pane-switching";
import type { TilingKeyBinding, TilingKeyboardEventLike } from "../engine/types";

/**
 * The H8 workspace key-binding fragment: hosts merge it in; it is not part of
 * `TILING_KEYMAP_DEFAULTS` / `defaultKeyBindings`.
 */

function keyEvent(
  code: string,
  modifiers?: { alt?: boolean; ctrl?: boolean; meta?: boolean; shift?: boolean },
): TilingKeyboardEventLike {
  return {
    code,
    key: code,
    altKey: modifiers?.alt ?? false,
    ctrlKey: modifiers?.ctrl ?? false,
    metaKey: modifiers?.meta ?? false,
    shiftKey: modifiers?.shift ?? false,
  };
}

describe("WORKSPACE_KEY_BINDINGS (opt-in fragment, not in defaults)", (): void => {
  it("resolves Alt+ArrowLeft / Alt+ArrowRight to cycle-workspace", (): void => {
    expect(matchKeyBinding(keyEvent("ArrowLeft", { alt: true }), WORKSPACE_KEY_BINDINGS)).toEqual({
      kind: "cycle-workspace",
      direction: "previous",
    });
    expect(matchKeyBinding(keyEvent("ArrowRight", { alt: true }), WORKSPACE_KEY_BINDINGS)).toEqual({
      kind: "cycle-workspace",
      direction: "next",
    });
  });

  it("resolves Alt+Digit1..9 to switch-workspace by 1-based tab index", (): void => {
    expect(matchKeyBinding(keyEvent("Digit1", { alt: true }), WORKSPACE_KEY_BINDINGS)).toEqual({
      kind: "switch-workspace",
      index: 1,
    });
    expect(matchKeyBinding(keyEvent("Digit9", { alt: true }), WORKSPACE_KEY_BINDINGS)).toEqual({
      kind: "switch-workspace",
      index: 9,
    });
  });

  it("resolves Alt+Shift+ArrowLeft / ArrowRight to move-leaf-to-workspace with follow", (): void => {
    expect(
      matchKeyBinding(keyEvent("ArrowLeft", { alt: true, shift: true }), WORKSPACE_KEY_BINDINGS),
    ).toEqual({
      kind: "move-leaf-to-workspace",
      direction: "previous",
      follow: true,
    });
    expect(
      matchKeyBinding(keyEvent("ArrowRight", { alt: true, shift: true }), WORKSPACE_KEY_BINDINGS),
    ).toEqual({
      kind: "move-leaf-to-workspace",
      direction: "next",
      follow: true,
    });
  });

  it("is not merged into TILING_KEYMAP_DEFAULTS or defaultKeyBindings", (): void => {
    const defaultKinds: ReadonlyArray<string> = defaultKeyBindings(resolveKeymap(undefined)).map(
      (binding: TilingKeyBinding): string => binding.command.kind,
    );
    expect(defaultKinds).not.toContain("switch-workspace");
    expect(defaultKinds).not.toContain("cycle-workspace");
    expect(defaultKinds).not.toContain("move-leaf-to-workspace");
    expect(defaultKinds).not.toContain("reveal-tile");
    expect(TILING_KEYMAP_DEFAULTS.focusLeft.code).toBe("ArrowLeft");
    expect(TILING_KEYMAP_DEFAULTS.focusLeft.alt).toBe(false);
    expect(matchKeyBinding(keyEvent("ArrowLeft", { alt: true }), defaultKeyBindings(resolveKeymap(undefined)))).toBeNull();
    expect(matchKeyBinding(keyEvent("Digit1", { alt: true }), defaultKeyBindings(resolveKeymap(undefined)))).toBeNull();
  });
});
