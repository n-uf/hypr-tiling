import { describe, expect, it } from "@jest/globals";
import {
  MULTI_SELECT_GROUP_MIN_MEMBERS,
  canGroupMultiSelection,
  isMultiSelectModifierActive,
  pruneMultiSelection,
  resolveMultiSelectGroupCommand,
  resolveMultiSelectGroupHost,
  toggleLeafMultiSelection,
} from "../core/multi-selection";
import {
  collectGroups,
  findGroupById,
  findGroupContainingLeaf,
  findLeafById,
  groupLeaves,
  isStructurallyValidLayout,
  readGroupMemberIds,
  readLeafNodeIds,
} from "../core/state";
import type {
  TilingGroupNode,
  TilingLayoutNode,
  TilingLeafNode,
  TilingSplitNode,
  TilingCommand,
} from "../core/types";

/**
 * Pure model for the Alt/Opt+click header → group flow
 * (`paneSwitching.multiSelectGrouping`). The renderer is `"use client"` + DOM
 * and cannot render under the node-only jest harness, so these cover the
 * decision logic the renderer wires (selection toggle / prune / groupability /
 * the reused `group-leaves` command) directly on the pure functions.
 */

function leaf(id: string): TilingLeafNode {
  return { kind: "leaf", id, tileId: `tile-${id}` };
}

function hsplit(
  id: string,
  first: TilingLayoutNode,
  second: TilingLayoutNode,
): TilingSplitNode {
  return { kind: "split", id, axis: "horizontal", ratio: 0.5, first, second };
}

function vsplit(
  id: string,
  first: TilingLayoutNode,
  second: TilingLayoutNode,
): TilingSplitNode {
  return { kind: "split", id, axis: "vertical", ratio: 0.5, first, second };
}

// A 3-leaf right-leaning dwindle tree: split(a, split(b, c)).
function threeLeafTree(): TilingSplitNode {
  return hsplit("root", leaf("a"), hsplit("inner", leaf("b"), leaf("c")));
}

// Mirrors the homepage `INITIAL_LAYOUT` shape (apps/web/src/page.tsx): a nested
// split tree where the candidate group members `features` and `install` live in
// DIFFERENT branches (features under `mid`, install under `far`). This is the
// cross-branch case the reproduction screenshot exercised (03 FEATURES + 05
// INSTALL), not a toy adjacent pair.
function homepageTree(): TilingSplitNode {
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

describe("isMultiSelectModifierActive (plain vs Alt/Opt click discriminator)", (): void => {
  it("is true for an Alt/Opt press (altKey)", (): void => {
    expect(isMultiSelectModifierActive({ altKey: true })).toBe(true);
  });

  it("is false for a plain (no-modifier) click", (): void => {
    expect(isMultiSelectModifierActive({ altKey: false })).toBe(false);
  });

  // The modifier was UNIFIED on Alt/Opt — Cmd (meta) / Ctrl alone no longer
  // select. The event shape narrowed to `{ altKey }`, so a meta/ctrl-only event
  // (altKey false) is a plain click.
  it("is false for a meta/ctrl-only press (no longer the multi-select chord)", (): void => {
    expect(isMultiSelectModifierActive({ altKey: false })).toBe(false);
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

  it("is TRUE when a selected group member can flatten with a loose pane", (): void => {
    // Group {b, a} first (host b → group-b), then select that group's member `b`
    // plus the loose `c`: under the flatten rework this dissolves group-b and
    // folds {b, a, c} into one flat group — a real change, so it is groupable.
    const grouped: TilingLayoutNode = groupLeaves(threeLeafTree(), ["b", "a"]);
    expect(canGroupMultiSelection(grouped, new Set<string>(["b", "c"]))).toBe(true);
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

  it("threads an explicit host through as the group-leaves hostLeafId", (): void => {
    const command: TilingCommand | null = resolveMultiSelectGroupCommand(
      new Set<string>(["c", "a", "b"]),
      "b",
    );
    expect(command).toEqual({
      kind: "group-leaves",
      leafIds: ["c", "a", "b"],
      hostLeafId: "b",
    });
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
    const grouped: TilingLayoutNode = groupLeaves(threeLeafTree(), command.leafIds);
    const group: TilingGroupNode | null = findGroupById(grouped, "group-a");
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
    const grouped: TilingLayoutNode = groupLeaves(homepageTree(), command.leafIds);

    // Exactly ONE group in the whole tree.
    const groups: ReadonlyArray<TilingGroupNode> = collectGroups(grouped);
    expect(groups.length).toBe(1);

    // That group holds EXACTLY the two selected leaves, in selection order, with
    // the anchor (`features`) active — i.e. a usable two-tab stack.
    const group: TilingGroupNode = groups[0];
    expect(group.members.map((m: TilingLeafNode): string => m.id)).toEqual([
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
    const grouped: TilingLayoutNode = groupLeaves(threeLeafTree(), command.leafIds);
    // group-a's active member is the anchor `a`; `b` is folded inside, so the
    // outer-slot leaf view is [a, c] — `b` is gone from it.
    const outerIds: ReadonlyArray<string> = readLeafNodeIds(grouped);
    expect(outerIds.slice().sort()).toEqual(["a", "c"]);
    expect(pruneMultiSelection(new Set<string>(["a", "b"]), outerIds)).toEqual(new Set<string>(["a"]));
  });
});

describe("resolveMultiSelectGroupHost (host slot for the merged group)", (): void => {
  it("returns null for an empty selection (nothing to host)", (): void => {
    expect(resolveMultiSelectGroupHost(new Set<string>(), null, null)).toBeNull();
    expect(resolveMultiSelectGroupHost(new Set<string>(), "a", "a")).toBeNull();
  });

  it("the clicked pane (in selection) wins — the header Group button path", (): void => {
    // Even when a DIFFERENT pane is focused, the clicked pane is the host.
    expect(
      resolveMultiSelectGroupHost(new Set<string>(["a", "b", "c"]), "c", "a"),
    ).toBe("c");
  });

  it("Alt+G (no click) hosts the focused pane WHEN it is in the selection", (): void => {
    expect(
      resolveMultiSelectGroupHost(new Set<string>(["a", "b", "c"]), null, "b"),
    ).toBe("b");
  });

  it("Alt+G (no click) falls back to the first-selected when focus is not in the selection", (): void => {
    expect(
      resolveMultiSelectGroupHost(new Set<string>(["b", "a", "c"]), null, "z"),
    ).toBe("b");
    expect(
      resolveMultiSelectGroupHost(new Set<string>(["b", "a", "c"]), null, null),
    ).toBe("b");
  });

  it("ignores a clicked id that is not in the selection (falls through)", (): void => {
    expect(
      resolveMultiSelectGroupHost(new Set<string>(["a", "b"]), "ghost", "b"),
    ).toBe("b");
  });
});

describe("groupLeaves flatten rework (any combination → ONE flat group at the host slot)", (): void => {
  // A homepage layout where `features` + `model` already form a group and the
  // rest are loose, to exercise group-touching flattens with a known shape.
  function withFeaturesModelGroup(): TilingLayoutNode {
    return groupLeaves(homepageTree(), ["features", "model"], { hostLeafId: "features" });
  }

  it("loose+loose: folds two loose panes into one flat group at the clicked host slot", (): void => {
    const next: TilingLayoutNode = groupLeaves(homepageTree(), ["features", "install"], {
      hostLeafId: "install",
    });
    const groups: ReadonlyArray<TilingGroupNode> = collectGroups(next);
    expect(groups.length).toBe(1);
    // Host `install` is first (active) then the remaining selection.
    expect(groups[0].members.map((m: TilingLeafNode): string => m.id)).toEqual([
      "install",
      "features",
    ]);
    expect(groups[0].activeMemberId).toBe("install");
    // The merged group occupies the host (`install`) slot id.
    expect(groups[0].id).toBe("group-install");
    expect(isStructurallyValidLayout(next)).toBe(true);
  });

  it("loose+group: selecting any one member pulls in the WHOLE group, flattened with the loose pane", (): void => {
    const base: TilingLayoutNode = withFeaturesModelGroup();
    // Select the loose `install` (host) plus ONE member (`features`) of the group.
    const next: TilingLayoutNode = groupLeaves(base, ["install", "features"], {
      hostLeafId: "install",
    });
    const groups: ReadonlyArray<TilingGroupNode> = collectGroups(next);
    expect(groups.length).toBe(1);
    // Host first, then the loose-host has no group-mates, then the touched
    // group's FULL membership (features, model) in existing order.
    expect(groups[0].members.map((m: TilingLeafNode): string => m.id)).toEqual([
      "install",
      "features",
      "model",
    ]);
    expect(findGroupContainingLeaf(next, "model")?.id).toBe("group-install");
    expect(isStructurallyValidLayout(next)).toBe(true);
  });

  it("member-of-group host: hosts at the dissolved group's slot, host first then its mates", (): void => {
    const base: TilingLayoutNode = withFeaturesModelGroup();
    // Host is `features`, itself a member of group-features-model; add loose `install`.
    const next: TilingLayoutNode = groupLeaves(base, ["features", "install"], {
      hostLeafId: "features",
    });
    const groups: ReadonlyArray<TilingGroupNode> = collectGroups(next);
    expect(groups.length).toBe(1);
    // Host `features` first, then its (now-dissolved) group-mate `model`, then `install`.
    expect(groups[0].members.map((m: TilingLeafNode): string => m.id)).toEqual([
      "features",
      "model",
      "install",
    ]);
    expect(groups[0].activeMemberId).toBe("features");
    expect(isStructurallyValidLayout(next)).toBe(true);
  });

  it("group+group: dissolves BOTH groups into one flat group (no nesting)", (): void => {
    // First group {features, model}; then group {intro, usecases}.
    let base: TilingLayoutNode = groupLeaves(homepageTree(), ["features", "model"], {
      hostLeafId: "features",
    });
    base = groupLeaves(base, ["intro", "usecases"], { hostLeafId: "intro" });
    expect(collectGroups(base).length).toBe(2);
    // Select one member of EACH group; host = features.
    const next: TilingLayoutNode = groupLeaves(base, ["features", "intro"], {
      hostLeafId: "features",
    });
    const groups: ReadonlyArray<TilingGroupNode> = collectGroups(next);
    expect(groups.length).toBe(1);
    expect(groups[0].members.map((m: TilingLeafNode): string => m.id)).toEqual([
      "features",
      "model",
      "intro",
      "usecases",
    ]);
    // No nested group: every member resolves to a real leaf, none to a group.
    for (const member of groups[0].members) {
      expect(findLeafById(next, member.id)?.kind).toBe("leaf");
    }
    expect(isStructurallyValidLayout(next)).toBe(true);
  });

  it("host slot follows the clicked pane: a different click changes the host/active tab", (): void => {
    const hostFeatures: TilingLayoutNode = groupLeaves(
      homepageTree(),
      ["features", "install"],
      { hostLeafId: "features" },
    );
    const hostInstall: TilingLayoutNode = groupLeaves(
      homepageTree(),
      ["features", "install"],
      { hostLeafId: "install" },
    );
    expect(collectGroups(hostFeatures)[0].activeMemberId).toBe("features");
    expect(collectGroups(hostFeatures)[0].members[0].id).toBe("features");
    expect(collectGroups(hostInstall)[0].activeMemberId).toBe("install");
    expect(collectGroups(hostInstall)[0].members[0].id).toBe("install");
  });
});
