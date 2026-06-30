import { describe, expect, it } from "@jest/globals";
import {
  addLeafToGroup,
  annexDirection,
  collectGroups,
  cycleActiveGroupMember,
  findGroupById,
  findGroupContainingLeaf,
  findLeafById,
  groupLeaves,
  isStructurallyValidLayout,
  readGroupMemberIds,
  readLeafNodeIds,
  removeMemberFromGroup,
  setActiveGroupMember,
  ungroupNode,
} from "../state";
import type { TilingGrowConstraints } from "../state";
import { collectLeafFootprints } from "../leaf-geometry";
import type { DynamicLeafFootprint } from "../leaf-geometry";
import { resolveProjectedDropLayout } from "../projected-layout";
import { buildGroupTabStripMergeIntent, resolveDropIntent } from "../drop-intent-resolver";
import type {
  DynamicDropIntentState,
  DynamicZoneGeometryConfig,
} from "../drop-intent-resolver";
import { commandRequiredCapability, keyboardActionToCommand } from "../commands";
import { matchKeymapAction, resolveKeymap } from "../pane-switching";
import type { TilingKeymapActionGuards } from "../pane-switching";
import type {
  DynamicGroupNode,
  DynamicLayoutConfig,
  DynamicLayoutNode,
  DynamicLeafNode,
  DynamicSplitNode,
  ResolvedTilingKeymap,
  TilingKeyboardEventLike,
} from "../types";

/**
 * HT-GROUP-TABBED-STACKING — pure tests for the group/member domain model: the
 * six reducers, the group tree-helpers, group geometry (a group is ONE slot,
 * only its active member has a footprint), the drag-into-group drop intent, and
 * the group commands/keybindings. All assertions are on pure functions; no DOM.
 */

function leaf(id: string): DynamicLeafNode {
  return { kind: "leaf", id, tileId: `tile-${id}` };
}

function hsplit(
  id: string,
  first: DynamicLayoutNode,
  second: DynamicLayoutNode,
  ratio: number = 0.5,
): DynamicSplitNode {
  return { kind: "split", id, axis: "horizontal", ratio, first, second };
}

function clone(node: DynamicLayoutNode): DynamicLayoutNode {
  return JSON.parse(JSON.stringify(node)) as DynamicLayoutNode;
}

function asGroup(node: DynamicLayoutNode): DynamicGroupNode {
  if (node.kind !== "group") {
    throw new Error(`expected a group node, got ${node.kind}`);
  }
  return node;
}

function memberIds(group: DynamicGroupNode): ReadonlyArray<string> {
  return group.members.map((member: DynamicLeafNode): string => member.id);
}

// A 3-leaf right-leaning dwindle tree: split(a, split(b, c)).
function threeLeafTree(): DynamicSplitNode {
  return hsplit("root", leaf("a"), hsplit("inner", leaf("b"), leaf("c")));
}

describe("groupLeaves (fold N leaves into one slot)", (): void => {
  it("wraps two leaves into a group occupying the anchor's slot, anchor active", (): void => {
    const tree: DynamicSplitNode = threeLeafTree();
    const next: DynamicLayoutNode = groupLeaves(tree, ["a", "b"]);
    const group: DynamicGroupNode | null = findGroupById(next, "group-a");
    expect(group).not.toBeNull();
    expect(memberIds(group as DynamicGroupNode)).toEqual(["a", "b"]);
    expect((group as DynamicGroupNode).activeMemberId).toBe("a");
    // c survived; b was extracted from the inner split which then collapsed.
    expect(findLeafById(next, "c")).not.toBeNull();
    expect(isStructurallyValidLayout(next)).toBe(true);
  });

  it("folds three leaves into one group in the requested member order", (): void => {
    const tree: DynamicSplitNode = threeLeafTree();
    const next: DynamicLayoutNode = groupLeaves(tree, ["a", "b", "c"]);
    const group: DynamicGroupNode = asGroup(findGroupById(next, "group-a") as DynamicLayoutNode);
    expect(memberIds(group)).toEqual(["a", "b", "c"]);
    // The whole tree is now a single group slot.
    expect(next.kind).toBe("group");
  });

  it("accepts an explicit group id", (): void => {
    const next: DynamicLayoutNode = groupLeaves(threeLeafTree(), ["a", "b"], {
      groupId: "grp-x",
    });
    expect(findGroupById(next, "grp-x")).not.toBeNull();
  });

  it("honors an explicit host: the group occupies the host slot, host first + active", (): void => {
    // Default host is the first id (`a`); an explicit `hostLeafId: "b"` instead
    // anchors the group at `b`'s slot with `b` first and active.
    const next: DynamicLayoutNode = groupLeaves(threeLeafTree(), ["a", "b"], {
      hostLeafId: "b",
    });
    const group: DynamicGroupNode = asGroup(findGroupById(next, "group-b") as DynamicLayoutNode);
    expect(memberIds(group)).toEqual(["b", "a"]);
    expect(group.activeMemberId).toBe("b");
    expect(isStructurallyValidLayout(next)).toBe(true);
  });

  it("deduplicates repeated leaf ids before counting members", (): void => {
    const next: DynamicLayoutNode = groupLeaves(threeLeafTree(), ["a", "a", "b"]);
    const group: DynamicGroupNode = asGroup(findGroupById(next, "group-a") as DynamicLayoutNode);
    expect(memberIds(group)).toEqual(["a", "b"]);
  });

  it("returns the layout unchanged for fewer than two resolvable leaves", (): void => {
    const tree: DynamicSplitNode = threeLeafTree();
    expect(groupLeaves(tree, ["a"])).toBe(tree);
    expect(groupLeaves(tree, ["a", "ghost"])).toBe(tree);
    expect(groupLeaves(tree, [])).toBe(tree);
  });

  it("does not mutate the input tree", (): void => {
    const tree: DynamicSplitNode = threeLeafTree();
    const snapshot: DynamicLayoutNode = clone(tree);
    groupLeaves(tree, ["a", "b", "c"]);
    expect(tree).toEqual(snapshot);
  });

  it("flattens a host-is-group-member selection into ONE flat group (dissolve + fold, no nesting)", (): void => {
    // `b` is a member of `group-b` ({b, a}); grouping host `b` with the loose `c`
    // DISSOLVES group-b and folds {b, a, c} into one flat group at `b`'s slot —
    // host `b` first + active, then its dissolved mate `a`, then `c`. No pane is
    // lost and there is no nested group.
    const grouped: DynamicLayoutNode = groupLeaves(threeLeafTree(), ["b", "a"]);
    expect(findGroupById(grouped, "group-b")).not.toBeNull();
    const next: DynamicLayoutNode = groupLeaves(grouped, ["b", "c"], { hostLeafId: "b" });
    expect(collectGroups(next)).toHaveLength(1);
    const group: DynamicGroupNode = asGroup(findGroupById(next, "group-b") as DynamicLayoutNode);
    expect(memberIds(group)).toEqual(["b", "a", "c"]);
    expect(group.activeMemberId).toBe("b");
    // Every original leaf present, all flat leaves (no group-in-group).
    expect(readGroupMemberIds(next).slice().sort()).toEqual(["a", "b", "c"]);
    for (const member of group.members) {
      expect(findLeafById(next, member.id)?.kind).toBe("leaf");
    }
    expect(isStructurallyValidLayout(next)).toBe(true);
  });
});

describe("ungroupNode (explode a group back to a split chain)", (): void => {
  it("explodes a group into a dwindle split chain of its members", (): void => {
    const grouped: DynamicLayoutNode = groupLeaves(threeLeafTree(), ["a", "b", "c"]);
    const next: DynamicLayoutNode = ungroupNode(grouped, "group-a");
    expect(collectGroups(next)).toHaveLength(0);
    expect(readLeafNodeIds(next).slice().sort()).toEqual(["a", "b", "c"]);
    expect(isStructurallyValidLayout(next)).toBe(true);
  });

  it("returns the layout unchanged for an unknown group id", (): void => {
    const grouped: DynamicLayoutNode = groupLeaves(threeLeafTree(), ["a", "b"]);
    expect(ungroupNode(grouped, "nope")).toBe(grouped);
  });
});

describe("addLeafToGroup (drag-into-group commit)", (): void => {
  it("extracts a sibling leaf and appends it as the now-active member", (): void => {
    const grouped: DynamicLayoutNode = groupLeaves(threeLeafTree(), ["a", "b"]);
    const next: DynamicLayoutNode = addLeafToGroup(grouped, "group-a", "c");
    const group: DynamicGroupNode = asGroup(findGroupById(next, "group-a") as DynamicLayoutNode);
    expect(memberIds(group)).toEqual(["a", "b", "c"]);
    expect(group.activeMemberId).toBe("c");
    expect(findGroupContainingLeaf(next, "c")).not.toBeNull();
    expect(isStructurallyValidLayout(next)).toBe(true);
  });

  it("is a no-op when the source is already a member of the group", (): void => {
    const grouped: DynamicLayoutNode = groupLeaves(threeLeafTree(), ["a", "b"]);
    expect(addLeafToGroup(grouped, "group-a", "b")).toBe(grouped);
  });

  it("returns the layout unchanged for an absent group", (): void => {
    const grouped: DynamicLayoutNode = groupLeaves(threeLeafTree(), ["a", "b"]);
    expect(addLeafToGroup(grouped, "ghost", "c")).toBe(grouped);
  });
});

describe("removeMemberFromGroup (re-seat a member as a sibling)", (): void => {
  it("re-seats a removed member beside the surviving group", (): void => {
    const grouped: DynamicLayoutNode = groupLeaves(threeLeafTree(), ["a", "b", "c"]);
    const next: DynamicLayoutNode = removeMemberFromGroup(grouped, "group-a", "c");
    const group: DynamicGroupNode = asGroup(findGroupById(next, "group-a") as DynamicLayoutNode);
    expect(memberIds(group)).toEqual(["a", "b"]);
    expect(findLeafById(next, "c")).not.toBeNull();
    expect(findGroupContainingLeaf(next, "c")).toBeNull();
    expect(isStructurallyValidLayout(next)).toBe(true);
  });

  it("collapses the group to a bare leaf when only one member would remain", (): void => {
    const grouped: DynamicLayoutNode = groupLeaves(threeLeafTree(), ["a", "b"]);
    const next: DynamicLayoutNode = removeMemberFromGroup(grouped, "group-a", "b");
    expect(collectGroups(next)).toHaveLength(0);
    expect(readLeafNodeIds(next).slice().sort()).toEqual(["a", "b", "c"]);
  });

  it("moves the active flag off a removed active member", (): void => {
    const grouped: DynamicLayoutNode = groupLeaves(threeLeafTree(), ["a", "b", "c"]);
    const activeOnB: DynamicLayoutNode = setActiveGroupMember(grouped, "group-a", "b");
    const next: DynamicLayoutNode = removeMemberFromGroup(activeOnB, "group-a", "b");
    const group: DynamicGroupNode = asGroup(findGroupById(next, "group-a") as DynamicLayoutNode);
    expect(group.activeMemberId).not.toBe("b");
    expect(memberIds(group)).toContain(group.activeMemberId);
  });

  it("returns the layout unchanged for an absent group or member", (): void => {
    const grouped: DynamicLayoutNode = groupLeaves(threeLeafTree(), ["a", "b"]);
    expect(removeMemberFromGroup(grouped, "ghost", "a")).toBe(grouped);
    expect(removeMemberFromGroup(grouped, "group-a", "ghost")).toBe(grouped);
  });
});

describe("setActiveGroupMember (tab activation)", (): void => {
  it("activates the requested member tab", (): void => {
    const grouped: DynamicLayoutNode = groupLeaves(threeLeafTree(), ["a", "b", "c"]);
    const next: DynamicLayoutNode = setActiveGroupMember(grouped, "group-a", "c");
    expect(asGroup(findGroupById(next, "group-a") as DynamicLayoutNode).activeMemberId).toBe("c");
  });

  it("returns the same reference when the member is already active", (): void => {
    const grouped: DynamicLayoutNode = groupLeaves(threeLeafTree(), ["a", "b"]);
    expect(setActiveGroupMember(grouped, "group-a", "a")).toBe(grouped);
  });

  it("returns the same reference for a member absent from the group", (): void => {
    const grouped: DynamicLayoutNode = groupLeaves(threeLeafTree(), ["a", "b"]);
    expect(setActiveGroupMember(grouped, "group-a", "ghost")).toBe(grouped);
  });
});

describe("cycleActiveGroupMember (tab ring wraparound)", (): void => {
  it("advances the active member forward with wraparound", (): void => {
    const grouped: DynamicLayoutNode = groupLeaves(threeLeafTree(), ["a", "b", "c"]);
    const afterNext: DynamicLayoutNode = cycleActiveGroupMember(grouped, "group-a", "next");
    expect(asGroup(findGroupById(afterNext, "group-a") as DynamicLayoutNode).activeMemberId).toBe("b");
    const wrapped: DynamicLayoutNode = cycleActiveGroupMember(
      setActiveGroupMember(grouped, "group-a", "c"),
      "group-a",
      "next",
    );
    expect(asGroup(findGroupById(wrapped, "group-a") as DynamicLayoutNode).activeMemberId).toBe("a");
  });

  it("advances the active member backward with wraparound", (): void => {
    const grouped: DynamicLayoutNode = groupLeaves(threeLeafTree(), ["a", "b", "c"]);
    const wrapped: DynamicLayoutNode = cycleActiveGroupMember(grouped, "group-a", "previous");
    expect(asGroup(findGroupById(wrapped, "group-a") as DynamicLayoutNode).activeMemberId).toBe("c");
  });
});

describe("group tree-helpers", (): void => {
  it("collectGroups / findGroupContainingLeaf / readGroupMemberIds enumerate group membership", (): void => {
    const grouped: DynamicLayoutNode = groupLeaves(threeLeafTree(), ["a", "b"]);
    expect(collectGroups(grouped)).toHaveLength(1);
    expect(findGroupContainingLeaf(grouped, "b")?.id).toBe("group-a");
    expect(findGroupContainingLeaf(grouped, "c")).toBeNull();
    expect(readGroupMemberIds(grouped).slice().sort()).toEqual(["a", "b"]);
  });

  it("findLeafById reaches members nested inside a group", (): void => {
    const grouped: DynamicLayoutNode = groupLeaves(threeLeafTree(), ["a", "b"]);
    expect(findLeafById(grouped, "b")?.id).toBe("b");
  });

  it("readLeafNodeIds reports only the active member of a group (outer-slot view)", (): void => {
    const grouped: DynamicLayoutNode = groupLeaves(threeLeafTree(), ["a", "b"]);
    expect(readLeafNodeIds(grouped).slice().sort()).toEqual(["a", "c"]);
  });
});

describe("isStructurallyValidLayout (group invariants)", (): void => {
  const a: DynamicLeafNode = leaf("a");
  const b: DynamicLeafNode = leaf("b");

  it("accepts a well-formed group (≥1 member, unique ids, active present)", (): void => {
    const group: DynamicGroupNode = { kind: "group", id: "g", members: [a, b], activeMemberId: "a" };
    expect(isStructurallyValidLayout(group)).toBe(true);
  });

  it("rejects an empty group", (): void => {
    const group: DynamicGroupNode = { kind: "group", id: "g", members: [], activeMemberId: "a" };
    expect(isStructurallyValidLayout(group)).toBe(false);
  });

  it("rejects a group whose activeMemberId is not among its members", (): void => {
    const group: DynamicGroupNode = { kind: "group", id: "g", members: [a, b], activeMemberId: "ghost" };
    expect(isStructurallyValidLayout(group)).toBe(false);
  });

  it("rejects a group with duplicate member ids", (): void => {
    const group: DynamicGroupNode = {
      kind: "group",
      id: "g",
      members: [leaf("a"), leaf("a")],
      activeMemberId: "a",
    };
    expect(isStructurallyValidLayout(group)).toBe(false);
  });
});

describe("group geometry — a group is ONE slot (active member only)", (): void => {
  const GAP_FREE_CONFIG: DynamicLayoutConfig = { gapPx: 0, minPaneSizePx: 0, handleSizePx: 0 };

  function footprintMap(
    node: DynamicLayoutNode,
    width: number,
    height: number,
  ): ReadonlyMap<string, DynamicLeafFootprint> {
    const map = new Map<string, DynamicLeafFootprint>();
    for (const footprint of collectLeafFootprints(node, 0, 0, width, height, GAP_FREE_CONFIG)) {
      map.set(footprint.leafId, footprint);
    }
    return map;
  }

  it("gives the active member the group's full footprint and inactive members none", (): void => {
    const group: DynamicGroupNode = {
      kind: "group",
      id: "g",
      members: [leaf("a"), leaf("b"), leaf("c")],
      activeMemberId: "b",
    };
    const map = footprintMap(group, 1000, 800);
    expect(map.size).toBe(1);
    expect(map.get("b")).toEqual({ leafId: "b", left: 0, top: 0, width: 1000, height: 800 });
    expect(map.has("a")).toBe(false);
    expect(map.has("c")).toBe(false);
  });

  it("places a group inside a split into the split's sub-rect (active member only)", (): void => {
    const group: DynamicGroupNode = {
      kind: "group",
      id: "g",
      members: [leaf("b"), leaf("c")],
      activeMemberId: "b",
    };
    const tree: DynamicSplitNode = hsplit("root", leaf("a"), group, 0.5);
    const map = footprintMap(tree, 1000, 800);
    expect(map.get("a")).toEqual({ leafId: "a", left: 0, top: 0, width: 500, height: 800 });
    expect(map.get("b")).toEqual({ leafId: "b", left: 500, top: 0, width: 500, height: 800 });
    expect(map.has("c")).toBe(false);
  });
});

describe("drag-into-group drop intent", (): void => {
  const CONFIG: DynamicZoneGeometryConfig = {
    centerRatio: 0.34,
    centerMinPx: 24,
    hysteresisPx: 6,
    devicePixelRatio: 1,
  };

  function centerBodyDrop(): DynamicDropIntentState {
    return resolveDropIntent({
      leafId: "b",
      paneLocalX: 100,
      paneLocalY: 100,
      paneSize: { width: 200, height: 200 },
      axisPath: [],
      geometryConfig: CONFIG,
      previousZone: null,
      evaluateZone: (): { isValid: boolean; rejectionReason: string | null } => ({
        isValid: true,
        rejectionReason: null,
      }),
    });
  }

  // The center (swap) zone is group-agnostic — `resolveDropIntent` no longer
  // takes a `targetIsGroup` flag, so a center drop on a group body is `swap`
  // just like a center drop on a leaf. Add-to-group (`group-merge`) is reachable
  // ONLY through the group's tab strip (`buildGroupTabStripMergeIntent`).
  function tabStripMergeDrop(): DynamicDropIntentState {
    return buildGroupTabStripMergeIntent({
      activeMemberLeafId: "b",
      evaluateCenter: (): { isValid: boolean; rejectionReason: string | null } => ({
        isValid: true,
        rejectionReason: null,
      }),
    });
  }

  it("classifies a valid center body drop as swap (never group-merge)", (): void => {
    expect(centerBodyDrop().action).toBe("swap");
  });

  it("classifies a tab-strip drop as group-merge", (): void => {
    expect(tabStripMergeDrop().action).toBe("group-merge");
  });

  it("projects a tab-strip group-merge drop through addLeafToGroup", (): void => {
    const grouped: DynamicLayoutNode = groupLeaves(threeLeafTree(), ["a", "b"]);
    const dropState: DynamicDropIntentState = tabStripMergeDrop();
    const projected: DynamicLayoutNode | null = resolveProjectedDropLayout(grouped, "c", dropState);
    expect(projected).not.toBeNull();
    const group: DynamicGroupNode = asGroup(
      findGroupById(projected as DynamicLayoutNode, "group-a") as DynamicLayoutNode,
    );
    expect(memberIds(group)).toEqual(["a", "b", "c"]);
    expect(group.activeMemberId).toBe("c");
  });
});

describe("group commands + keybindings (Phase 2 surface)", (): void => {
  it("gates every grouping command behind the grouping capability", (): void => {
    expect(commandRequiredCapability({ kind: "group-leaves", leafIds: ["a", "b"] })).toBe("groupingEnabled");
    expect(commandRequiredCapability({ kind: "toggle-group" })).toBe("groupingEnabled");
    expect(commandRequiredCapability({ kind: "ungroup" })).toBe("groupingEnabled");
    expect(commandRequiredCapability({ kind: "add-to-group", groupId: "g", sourceLeafId: "a" })).toBe("groupingEnabled");
    expect(commandRequiredCapability({ kind: "remove-from-group", groupId: "g", memberId: "a" })).toBe("groupingEnabled");
    expect(commandRequiredCapability({ kind: "group-tab-cycle", direction: "next" })).toBe("groupingEnabled");
    expect(commandRequiredCapability({ kind: "group-tab-jump", memberNumber: 2 })).toBe("groupingEnabled");
  });

  it("bridges the grouping keyboard actions to their commands", (): void => {
    expect(keyboardActionToCommand({ kind: "toggle-group" })).toEqual({ kind: "toggle-group" });
    expect(keyboardActionToCommand({ kind: "group-tab-cycle", direction: "next" })).toEqual({
      kind: "group-tab-cycle",
      direction: "next",
    });
    expect(keyboardActionToCommand({ kind: "group-tab-cycle", direction: "previous" })).toEqual({
      kind: "group-tab-cycle",
      direction: "previous",
    });
  });

  it("matches the default group chords (Alt+G group, Alt+K/J tab cycle)", (): void => {
    const keymap: ResolvedTilingKeymap = resolveKeymap(undefined);
    // Grouping chords are matched unconditionally (gated at dispatch), so the
    // maximize/paneSwitching/focus/rearrange guards are irrelevant here.
    const guards: TilingKeymapActionGuards = {
      maximizeEnabled: false,
      paneSwitchingEnabled: false,
      focusEnabled: false,
      rearrangeEnabled: false,
    };
    const altG: TilingKeyboardEventLike = { code: "KeyG", key: "g", altKey: true, ctrlKey: false, metaKey: false, shiftKey: false };
    const altK: TilingKeyboardEventLike = { code: "KeyK", key: "k", altKey: true, ctrlKey: false, metaKey: false, shiftKey: false };
    const altJ: TilingKeyboardEventLike = { code: "KeyJ", key: "j", altKey: true, ctrlKey: false, metaKey: false, shiftKey: false };
    expect(matchKeymapAction(altG, keymap, guards)).toEqual({ kind: "toggle-group" });
    expect(matchKeymapAction(altK, keymap, guards)).toEqual({ kind: "group-tab-cycle", direction: "next" });
    expect(matchKeymapAction(altJ, keymap, guards)).toEqual({ kind: "group-tab-cycle", direction: "previous" });
  });
});

describe("master layout + group interaction (a group slot inside a master split)", (): void => {
  const GAP_FREE_CONFIG: DynamicLayoutConfig = { gapPx: 0, minPaneSizePx: 0, handleSizePx: 0 };

  function footprintMap(
    node: DynamicLayoutNode,
    width: number,
    height: number,
  ): ReadonlyMap<string, DynamicLeafFootprint> {
    const map = new Map<string, DynamicLeafFootprint>();
    for (const footprint of collectLeafFootprints(node, 0, 0, width, height, GAP_FREE_CONFIG)) {
      map.set(footprint.leafId, footprint);
    }
    return map;
  }

  it("resolves a master split whose stack slot is a group (active member only, full slot rect)", (): void => {
    // root master split, masterCount 1, left orientation, ratio 0.5:
    //   master = leaf a (left half); stack = group{b,c active c} (right half).
    const group: DynamicGroupNode = {
      kind: "group",
      id: "g",
      members: [leaf("b"), leaf("c")],
      activeMemberId: "c",
    };
    const tree: DynamicSplitNode = {
      ...hsplit("root", leaf("a"), group, 0.5),
      layoutMode: "master",
      masterCount: 1,
      masterOrientation: "left",
    };
    const map = footprintMap(tree, 1000, 800);
    // master area is the left 500px column (one slot fills it vertically).
    expect(map.get("a")).toEqual({ leafId: "a", left: 0, top: 0, width: 500, height: 800 });
    // the group slot occupies the right 500px stack column; only the ACTIVE
    // member (c) is laid out, inactive b has no footprint.
    expect(map.get("c")).toEqual({ leafId: "c", left: 500, top: 0, width: 500, height: 800 });
    expect(map.has("b")).toBe(false);
  });
});

describe("directional annex + group interaction (group-aware — whole-group relocation)", (): void => {
  const CONSTRAINTS: TilingGrowConstraints = {
    containerSizePx: 1200,
    gapPx: 8,
    minPaneSizePx: 80,
  };

  it("relocates the WHOLE group as a unit off-axis; the group survives, no member orphaned", (): void => {
    // layout: split(horizontal, group{a,b active a}, c). Active pane c annexes
    // left. The eviction is now SLOT-granular: the group in the vector is
    // relocated as ONE unit (resolved via its outer-slot id `a` to the whole
    // group node), so both members ride along inside the surviving group and the
    // off-axis re-seed grafts the group intact (closes the audit's annex×group
    // KNOWN-LIMITATION).
    const group: DynamicGroupNode = {
      kind: "group",
      id: "g",
      members: [leaf("a"), leaf("b")],
      activeMemberId: "a",
    };
    const tree: DynamicSplitNode = hsplit("root", group, leaf("c"), 0.5);
    const next: DynamicLayoutNode = annexDirection(tree, "c", "left", CONSTRAINTS);
    // No pane is lost (annex is total) and the tree stays structurally valid.
    expect(readGroupMemberIds(next).slice().sort()).toEqual(["a", "b"]);
    expect(isStructurallyValidLayout(next)).toBe(true);
    // The group SURVIVED as a unit — exactly one group, both members intact,
    // active member preserved.
    const groups: ReadonlyArray<DynamicGroupNode> = collectGroups(next);
    expect(groups).toHaveLength(1);
    expect(groups[0].members.map((member: DynamicLeafNode): string => member.id).sort()).toEqual(["a", "b"]);
    expect(groups[0].activeMemberId).toBe("a");
    // The outer layout sees the surviving group (by active member) + c only.
    expect(readLeafNodeIds(next).slice().sort()).toEqual(["a", "c"]);
  });
});
