import { describe, expect, it } from "@jest/globals";
import { defaultKeyBindings, matchKeyBinding } from "../engine/keybindings";
import { cycleSplitMasterOrientation } from "../engine/state";
import { resolveKeymap } from "../engine/pane-switching";
import type {
  TilingLayoutNode,
  TilingSplitNode,
  ResolvedTilingKeymap,
  TilingKeyBinding,
  TilingKeyboardEventLike,
} from "../engine/types";

/**
 * Pure unit coverage for the public keyboard-binding registry
 * (HT-API-COMMAND-KEYBOARD-SURFACE half B): chord→command matching with
 * first-match-wins semantics (`matchKeyBinding`) and the keymap→bindings
 * projection (`defaultKeyBindings`).
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

const DEFAULT_KEYMAP: ResolvedTilingKeymap = resolveKeymap(undefined);

describe("matchKeyBinding (chord → command resolution)", (): void => {
  it("returns the command of the matching chord (exact modifier match on code)", (): void => {
    const bindings: ReadonlyArray<TilingKeyBinding> = [
      { chord: { code: "KeyS", alt: true }, command: { kind: "swap-panes", sourceLeafId: "a", targetLeafId: "b" } },
    ];
    expect(matchKeyBinding(keyEvent("KeyS", { alt: true }), bindings)).toEqual({
      kind: "swap-panes",
      sourceLeafId: "a",
      targetLeafId: "b",
    });
  });

  it("returns null when no chord matches", (): void => {
    const bindings: ReadonlyArray<TilingKeyBinding> = [
      { chord: { code: "KeyS", alt: true }, command: { kind: "restore" } },
    ];
    expect(matchKeyBinding(keyEvent("KeyS"), bindings)).toBeNull();
    expect(matchKeyBinding(keyEvent("KeyX", { alt: true }), bindings)).toBeNull();
  });

  it("requires an exact modifier match (absent modifiers resolve to false)", (): void => {
    const bindings: ReadonlyArray<TilingKeyBinding> = [
      { chord: { code: "KeyM" }, command: { kind: "toggle-maximize" } },
    ];
    // bare KeyM matches
    expect(matchKeyBinding(keyEvent("KeyM"), bindings)).toEqual({ kind: "toggle-maximize" });
    // KeyM with an extra held modifier does NOT match the bare chord
    expect(matchKeyBinding(keyEvent("KeyM", { alt: true }), bindings)).toBeNull();
  });

  it("is first-match-wins on a chord collision (binding order is significant)", (): void => {
    const bindings: ReadonlyArray<TilingKeyBinding> = [
      { chord: { code: "KeyG", alt: true }, command: { kind: "focus-cycle", direction: "next" } },
      { chord: { code: "KeyG", alt: true }, command: { kind: "focus-cycle", direction: "previous" } },
    ];
    expect(matchKeyBinding(keyEvent("KeyG", { alt: true }), bindings)).toEqual({
      kind: "focus-cycle",
      direction: "next",
    });
  });

  it("returns null for an empty registry", (): void => {
    expect(matchKeyBinding(keyEvent("Enter", { alt: true }), [])).toBeNull();
  });
});

describe("defaultKeyBindings (keymap → binding registry projection)", (): void => {
  const bindings: ReadonlyArray<TilingKeyBinding> = defaultKeyBindings(DEFAULT_KEYMAP);

  it("projects the built-in action set (excluding the dynamic jump family)", (): void => {
    const kinds: ReadonlyArray<string> = bindings.map((binding: TilingKeyBinding): string => binding.command.kind);
    expect(kinds).toContain("toggle-maximize");
    expect(kinds).toContain("restore");
    expect(kinds).toContain("focus-cycle");
    expect(kinds).toContain("focus-direction");
    expect(kinds).toContain("enter-move-mode");
    expect(kinds).toContain("focus-current-or-last");
    // the Alt+1..9 jump family stays in the keymap path, not enumerated here
    expect(kinds).not.toContain("focus-jump");
  });

  it("resolves the default toggle-maximize chord (Alt+Enter) through the projected binding", (): void => {
    expect(matchKeyBinding(keyEvent("Enter", { alt: true }), bindings)).toEqual({ kind: "toggle-maximize" });
  });

  it("resolves the default focus-current-or-last chord (Alt+Backquote)", (): void => {
    expect(matchKeyBinding(keyEvent("Backquote", { alt: true }), bindings)).toEqual({ kind: "focus-current-or-last" });
  });

  it("projects both cycle directions distinctly", (): void => {
    expect(matchKeyBinding(keyEvent("BracketLeft", { alt: true }), bindings)).toEqual({
      kind: "focus-cycle",
      direction: "previous",
    });
    expect(matchKeyBinding(keyEvent("BracketRight", { alt: true }), bindings)).toEqual({
      kind: "focus-cycle",
      direction: "next",
    });
  });

  it("projects the master/stack layout commands", (): void => {
    const kinds: ReadonlyArray<string> = bindings.map((binding: TilingKeyBinding): string => binding.command.kind);
    expect(kinds).toContain("cycle-layout-mode");
    expect(kinds).toContain("cycle-master-orientation");
    expect(kinds).toContain("adjust-master-count");
    expect(kinds).toContain("adjust-master-ratio");
  });

  it("resolves the default master chords (Alt+L mode, Alt+Shift+O orientation, Alt± count, Alt., Alt, ratio)", (): void => {
    expect(matchKeyBinding(keyEvent("KeyL", { alt: true }), bindings)).toEqual({ kind: "cycle-layout-mode" });
    expect(matchKeyBinding(keyEvent("KeyO", { alt: true, shift: true }), bindings)).toEqual({ kind: "cycle-master-orientation" });
    expect(matchKeyBinding(keyEvent("KeyO", { alt: true }), bindings)).toBeNull();
    expect(matchKeyBinding(keyEvent("Equal", { alt: true }), bindings)).toEqual({ kind: "adjust-master-count", delta: 1 });
    expect(matchKeyBinding(keyEvent("Minus", { alt: true }), bindings)).toEqual({ kind: "adjust-master-count", delta: -1 });
    expect(matchKeyBinding(keyEvent("Period", { alt: true }), bindings)).toEqual({ kind: "adjust-master-ratio", delta: 0.05 });
    expect(matchKeyBinding(keyEvent("Comma", { alt: true }), bindings)).toEqual({ kind: "adjust-master-ratio", delta: -0.05 });
  });

  it("maps Alt+Shift+O to cycle-master-orientation and the reducer mutates orientation", (): void => {
    const command = matchKeyBinding(keyEvent("KeyO", { alt: true, shift: true }), bindings);
    expect(command).toEqual({ kind: "cycle-master-orientation" });
    const rootSplit: TilingSplitNode = {
      kind: "split",
      id: "root",
      axis: "horizontal",
      ratio: 0.5,
      layoutMode: "master",
      masterOrientation: "left",
      first: { kind: "leaf", id: "a", tileId: "tile-a" },
      second: { kind: "leaf", id: "b", tileId: "tile-b" },
    };
    const next: TilingLayoutNode = cycleSplitMasterOrientation(rootSplit, "root");
    expect((next as TilingSplitNode).masterOrientation).toBe("top");
  });
});
