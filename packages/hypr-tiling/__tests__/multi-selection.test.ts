import { describe, expect, it } from "@jest/globals";
import {
  MULTI_SELECT_GROUP_MIN_MEMBERS,
  canGroupMultiSelection,
  isMultiSelectModifierActive,
  pruneMultiSelection,
  resolveMultiSelectGroupCommand,
  toggleLeafMultiSelection,
} from "../multi-selection";
import {
  collectGroups,
  findGroupById,
  groupLeaves,
  isStructurallyValidLayout,
  readGroupMemberIds,
  readLeafNodeIds,
} from "../state";
import type {
  DynamicGroupNode,
  DynamicLayoutNode,
  DynamicLeafNode,
  DynamicSplitNode,
  TilingCommand,
} from "../types";

/**
 * Pure model for the Cmd/Ctrl+click header → group flow
 * (`paneSwitching.multiSelectGrouping`). The renderer is `"use client"` + DOM
 * and cannot render under the node-only jest harness, so these cover the
 * decision logic the renderer wires (selection toggle / prune / groupability /
 * the reused `group-leaves` command) directly on the pure functions.
 */

function leaf(id: string): DynamicLeafNode {
  return { kind: "leaf", id, tileId: `tile-${id}` };
}

function hsplit(
  id: string,
  first: DynamicLayoutNode,
  second: DynamicLayoutNode,
): DynamicSplitNode {
  return { kind: "split", id, axis: "horizontal", ratio: 0.5, first, second };
}

function vsplit(
  id: string,
  first: DynamicLayoutNode,
  second: DynamicLayoutNode,
): DynamicSplitNode {
  return { kind: "split", id, axis: "vertical", ratio: 0.5, first, second };
}

// A 3-leaf right-leaning dwindle tree: split(a, split(b, c)).
function threeLeafTree(): DynamicSplitNode {
  return hsplit("root", leaf("a"), hsplit("inner", leaf("b"), leaf("c")));
}

// Mirrors the homepage `INITIAL_LAYOUT` shape (apps/web/src/page.tsx): a nested
// split tree where the candidate group members `features` and `install` live in
// DIFFERENT branches (features under `mid`, install under `far`). This is the
// cross-branch case the reproduction screenshot exercised (03 FEATURES + 05
// INSTALL), not a toy adjacent pair.
function homepageTree(): DynamicSplitNode {
  return hsplit(
    "root",
    vsplit("intro-col", leaf("intro"), leaf("usecases")),
    hsplit(
      "right",
      vsplit("mid", leaf("features"), leaf("model")),
      vsplit(
        "far",
        leaf("install"),
        hsplit("far-bottom", leaf("discoverability"), leaf("controls")),
      ),
    ),
  );
}

describe("isMultiSelectModifierActive (plain vs Cmd/Ctrl click discriminator)", (): void => {
  it("is true for a macOS Cmd press (metaKey)", (): void => {
    expect(isMultiSelectModifierActive({ metaKey: true, ctrlKey: false })).toBe(true);
  });

  it("is true for a Windows/Linux Ctrl press (ctrlKey)", (): void => {
    expect(isMultiSelectModifierActive({ metaKey: false, ctrlKey: true })).toBe(true);
  });

  it("is true when both modifiers are held", (): void => {
    expect(isMultiSelectModifierActive({ metaKey: true, ctrlKey: true })).toBe(true);
  });

  it("is false for a plain (no-modifier) click", (): void => {
    expect(isMultiSelectModifierActive({ metaKey: false, ctrlKey: false })).toBe(false);
  });
});

describe("toggleLeafMultiSelection (membership toggle)", (): void => {
  it("adds a leaf absent from the selection", (): void => {
    const next: Set<string> = toggleLeafMultiSelection(new Set<string>(), "a");
    expect([...next]).toEqual(["a"]);
  });

  it("removes a leaf already in the selection", (): void => {
    const next: Set<string> = toggleLeafMultiSelection(new Set<string>(["a", "b"]), "a");
    expect([...next]).toEqual(["b"]);
  });

  it("preserves insertion order so the first-selected leaf stays the anchor", (): void => {
    let selection: Set<string> = new Set<string>();
    selection = toggleLeafMultiSelection(selection, "c");
    selection = toggleLeafMultiSelection(selection, "a");
    selection = toggleLeafMultiSelection(selection, "b");
    expect([...selection]).toEqual(["c", "a", "b"]);
  });

  it("does not mutate the input set", (): void => {
    const input: ReadonlySet<string> = new Set<string>(["a"]);
    const next: Set<string> = toggleLeafMultiSelection(input, "b");
    expect([...input]).toEqual(["a"]);
    expect(next).not.toBe(input);
  });
});

describe("pruneMultiSelection (drop vanished panes)", (): void => {
  it("drops selected ids no longer present in the layout", (): void => {
    const next: Set<string> = pruneMultiSelection(new Set<string>(["a", "b", "z"]), ["a", "b", "c"]);
    expect([...next]).toEqual(["a", "b"]);
  });

  it("returns the SAME reference when nothing needs pruning (no pointless re-render)", (): void => {
    const selection: ReadonlySet<string> = new Set<string>(["a", "b"]);
    expect(pruneMultiSelection(selection, ["a", "b", "c"])).toBe(selection);
  });

  it("preserves the surviving ids in their original order", (): void => {
    const next: Set<string> = pruneMultiSelection(new Set<string>(["c", "a", "z"]), ["a", "c"]);
    expect([...next]).toEqual(["c", "a"]);
  });
});

describe("canGroupMultiSelection (groupable-right-now gate)", (): void => {
  it("is false for fewer than the minimum members", (): void => {
    expect(MULTI_SELECT_GROUP_MIN_MEMBERS).toBe(2);
    expect(canGroupMultiSelection(threeLeafTree(), new Set<string>())).toBe(false);
    expect(canGroupMultiSelection(threeLeafTree(), new Set<string>(["a"]))).toBe(false);
  });

  it("is true when ≥2 selected leaves can fold into a group", (): void => {
    expect(canGroupMultiSelection(threeLeafTree(), new Set<string>(["a", "b"]))).toBe(true);
    expect(canGroupMultiSelection(threeLeafTree(), new Set<string>(["a", "b", "c"]))).toBe(true);
  });

  it("is false when the anchor is already a group member (groupLeaves would be a no-op)", (): void => {
    // Group {b, a} first (anchor b), then try to make b the anchor of a new
    // group — `groupLeaves` aborts (b is no longer a placeable slot), so the
    // selection is reported NOT groupable rather than offering an inert button.
    const grouped: DynamicLayoutNode = groupLeaves(threeLeafTree(), ["b", "a"]);
    expect(canGroupMultiSelection(grouped, new Set<string>(["b", "c"]))).toBe(false);
  });

  it("is false when selected ids do not resolve to ≥2 real leaves", (): void => {
    expect(canGroupMultiSelection(threeLeafTree(), new Set<string>(["a", "ghost"]))).toBe(false);
  });
});

describe("resolveMultiSelectGroupCommand (reuse the existing group-leaves op)", (): void => {
  it("returns null below the minimum member count", (): void => {
    expect(resolveMultiSelectGroupCommand(new Set<string>())).toBeNull();
    expect(resolveMultiSelectGroupCommand(new Set<string>(["a"]))).toBeNull();
  });

  it("emits a group-leaves command with the selection in member order", (): void => {
    const command: TilingCommand | null = resolveMultiSelectGroupCommand(
      new Set<string>(["c", "a", "b"]),
    );
    expect(command).toEqual({ kind: "group-leaves", leafIds: ["c", "a", "b"] });
  });

  it("the emitted command actually groups via the reused groupLeaves op", (): void => {
    // End-to-end (pure): the command the Group button dispatches, fed through the
    // SAME `groupLeaves` op the renderer's `group-leaves` arm calls, folds the
    // selection into one group — verifying we reuse the op, not reimplement it.
    const command = resolveMultiSelectGroupCommand(new Set<string>(["a", "b"]));
    expect(command).not.toBeNull();
    if (command == null || command.kind !== "group-leaves") {
      throw new Error("expected a group-leaves command");
    }
    const grouped: DynamicLayoutNode = groupLeaves(threeLeafTree(), command.leafIds);
    const group: DynamicGroupNode | null = findGroupById(grouped, "group-a");
    expect(group).not.toBeNull();
    expect(readGroupMemberIds(grouped).slice().sort()).toEqual(["a", "b"]);
  });

  it("RESULT: folds a cross-branch homepage selection into exactly ONE group of exactly those members", (): void => {
    // The reproduction case: two NON-adjacent homepage panes in different
    // branches (`features` under `mid`, `install` under `far`). The Group
    // button's command, run through the reused `groupLeaves` op, must produce a
    // SINGLE group node whose members are EXACTLY the selection (anchor first,
    // active) — not merely a tree that differs from the input. The other five
    // panes stay ungrouped outer leaves.
    const command = resolveMultiSelectGroupCommand(
      new Set<string>(["features", "install"]),
    );
    if (command == null || command.kind !== "group-leaves") {
      throw new Error("expected a group-leaves command");
    }
    const grouped: DynamicLayoutNode = groupLeaves(homepageTree(), command.leafIds);

    // Exactly ONE group in the whole tree.
    const groups: ReadonlyArray<DynamicGroupNode> = collectGroups(grouped);
    expect(groups.length).toBe(1);

    // That group holds EXACTLY the two selected leaves, in selection order, with
    // the anchor (`features`) active — i.e. a usable two-tab stack.
    const group: DynamicGroupNode = groups[0];
    expect(group.members.map((m: DynamicLeafNode): string => m.id)).toEqual([
      "features",
      "install",
    ]);
    expect(group.activeMemberId).toBe("features");

    // The remaining five panes survive as ungrouped outer leaves; the outer-slot
    // view shows the group's active member (`features`) plus the untouched four.
    const outerIds: ReadonlyArray<string> = readLeafNodeIds(grouped);
    expect(outerIds.slice().sort()).toEqual(
      ["controls", "discoverability", "features", "intro", "model", "usecases"].sort(),
    );
    expect(outerIds).not.toContain("install");
    expect(isStructurallyValidLayout(grouped)).toBe(true);
  });

  it("models the post-group prune: a non-active member folded into the group leaves the outer slot set", (): void => {
    // After a successful group the renderer clears the selection outright. The
    // prune path is the backstop: a member that is no longer an OUTER-slot leaf
    // (folded inside the group, only the active member is outer-visible) is
    // dropped from any lingering selection, so it never re-highlights.
    const command = resolveMultiSelectGroupCommand(new Set<string>(["a", "b"]));
    if (command == null || command.kind !== "group-leaves") {
      throw new Error("expected a group-leaves command");
    }
    const grouped: DynamicLayoutNode = groupLeaves(threeLeafTree(), command.leafIds);
    // group-a's active member is the anchor `a`; `b` is folded inside, so the
    // outer-slot leaf view is [a, c] — `b` is gone from it.
    const outerIds: ReadonlyArray<string> = readLeafNodeIds(grouped);
    expect(outerIds.slice().sort()).toEqual(["a", "c"]);
    expect(pruneMultiSelection(new Set<string>(["a", "b"]), outerIds)).toEqual(new Set<string>(["a"]));
  });
});
