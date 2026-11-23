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
  insertGroupAdjacent,
  isStructurallyValidLayout,
  readGroupMemberIds,
  readLeafNodeIds,
  removeMemberFromGroup,
  setActiveGroupMember,
  ungroupNode,
} from "../engine/state";
import type { TilingGrowConstraints } from "../engine/state";
import { collectLeafFootprints } from "../engine/leaf-geometry";
import type { TilingLeafFootprint } from "../engine/leaf-geometry";
import type { TilingDropIntentState } from "../engine/drop-intent-resolver";
import { tilingDropStateOf } from "../engine/tiling-drag-tree";
import { hitRun, layoutDrag } from "./golden/cases";
import { commandRequiredCapability, keyboardActionToCommand } from "../engine/commands";
import { matchKeymapAction, resolveKeymap } from "../engine/pane-switching";
import type { TilingKeymapActionGuards } from "../engine/pane-switching";
import type {
  TilingGroupNode,
  TilingLayoutConfig,
  TilingLayoutNode,
  TilingLeafNode,
  TilingSplitNode,
  ResolvedTilingKeymap,
  TilingKeyboardEventLike,
} from "../engine/types";

/**
 * HT-GROUP-TABBED-STACKING — pure tests for the group/member domain model: the
 * six reducers, the group tree-helpers, group geometry (a group is ONE slot,
 * only its active member has a footprint), the drag-into-group drop intent, and
 * the group commands/keybindings. All assertions are on pure functions; no DOM.
 */

function leaf(id: string): TilingLeafNode {
  return { kind: "leaf", id, tileId: `tile-${id}` };
}

function hsplit(
  id: string,
  first: TilingLayoutNode,
  second: TilingLayoutNode,
  ratio: number = 0.5,
): TilingSplitNode {
  return { kind: "split", id, axis: "horizontal", ratio, first, second };
}

function clone(node: TilingLayoutNode): TilingLayoutNode {
  return JSON.parse(JSON.stringify(node)) as TilingLayoutNode;
}

function asGroup(node: TilingLayoutNode): TilingGroupNode {
  if (node.kind !== "group") {
    throw new Error(`expected a group node, got ${node.kind}`);
  }
  return node;
}

function memberIds(group: TilingGroupNode): ReadonlyArray<string> {
  return group.members.map((member: TilingLeafNode): string => member.id);
}

// A 3-leaf right-leaning dwindle tree: split(a, split(b, c)).
function threeLeafTree(): TilingSplitNode {
  return hsplit("root", leaf("a"), hsplit("inner", leaf("b"), leaf("c")));
}

describe("groupLeaves (fold N leaves into one slot)", (): void => {
  it("wraps two leaves into a group occupying the anchor's slot, anchor active", (): void => {
    const tree: TilingSplitNode = threeLeafTree();
    const next: TilingLayoutNode = groupLeaves(tree, ["a", "b"]);
    const group: TilingGroupNode | null = findGroupById(next, "group-a");
    expect(group).not.toBeNull();
    expect(memberIds(group as TilingGroupNode)).toEqual(["a", "b"]);
    expect((group as TilingGroupNode).activeMemberId).toBe("a");
    // c survived; b was extracted from the inner split which then collapsed.
    expect(findLeafById(next, "c")).not.toBeNull();
    expect(isStructurallyValidLayout(next)).toBe(true);
  });

  it("folds three leaves into one group in the requested member order", (): void => {
    const tree: TilingSplitNode = threeLeafTree();
    const next: TilingLayoutNode = groupLeaves(tree, ["a", "b", "c"]);
    const group: TilingGroupNode = asGroup(findGroupById(next, "group-a") as TilingLayoutNode);
    expect(memberIds(group)).toEqual(["a", "b", "c"]);
    // The whole tree is now a single group slot.
    expect(next.kind).toBe("group");
  });

  it("accepts an explicit group id", (): void => {
    const next: TilingLayoutNode = groupLeaves(threeLeafTree(), ["a", "b"], {
      groupId: "grp-x",
    });
    expect(findGroupById(next, "grp-x")).not.toBeNull();
  });

  it("honors an explicit host: the group occupies the host slot, host first + active", (): void => {
    // Default host is the first id (`a`); an explicit `hostLeafId: "b"` instead
    // anchors the group at `b`'s slot with `b` first and active.
    const next: TilingLayoutNode = groupLeaves(threeLeafTree(), ["a", "b"], {
      hostLeafId: "b",
    });
    const group: TilingGroupNode = asGroup(findGroupById(next, "group-b") as TilingLayoutNode);
    expect(memberIds(group)).toEqual(["b", "a"]);
    expect(group.activeMemberId).toBe("b");
    expect(isStructurallyValidLayout(next)).toBe(true);
  });

  it("deduplicates repeated leaf ids before counting members", (): void => {
    const next: TilingLayoutNode = groupLeaves(threeLeafTree(), ["a", "a", "b"]);
    const group: TilingGroupNode = asGroup(findGroupById(next, "group-a") as TilingLayoutNode);
    expect(memberIds(group)).toEqual(["a", "b"]);
  });

  it("returns the layout unchanged for fewer than two resolvable leaves", (): void => {
    const tree: TilingSplitNode = threeLeafTree();
    expect(groupLeaves(tree, ["a"])).toBe(tree);
    expect(groupLeaves(tree, ["a", "ghost"])).toBe(tree);
    expect(groupLeaves(tree, [])).toBe(tree);
  });

  it("does not mutate the input tree", (): void => {
    const tree: TilingSplitNode = threeLeafTree();
    const snapshot: TilingLayoutNode = clone(tree);
    groupLeaves(tree, ["a", "b", "c"]);
    expect(tree).toEqual(snapshot);
  });

  it("flattens a host-is-group-member selection into ONE flat group (dissolve + fold, no nesting)", (): void => {
    // `b` is a member of `group-b` ({b, a}); grouping host `b` with the loose `c`
    // DISSOLVES group-b and folds {b, a, c} into one flat group at `b`'s slot —
    // host `b` first + active, then its dissolved mate `a`, then `c`. No pane is
    // lost and there is no nested group.
    const grouped: TilingLayoutNode = groupLeaves(threeLeafTree(), ["b", "a"]);
    expect(findGroupById(grouped, "group-b")).not.toBeNull();
    const next: TilingLayoutNode = groupLeaves(grouped, ["b", "c"], { hostLeafId: "b" });
    expect(collectGroups(next)).toHaveLength(1);
    const group: TilingGroupNode = asGroup(findGroupById(next, "group-b") as TilingLayoutNode);
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
    const grouped: TilingLayoutNode = groupLeaves(threeLeafTree(), ["a", "b", "c"]);
    const next: TilingLayoutNode = ungroupNode(grouped, "group-a");
    expect(collectGroups(next)).toHaveLength(0);
    expect(readLeafNodeIds(next).slice().sort()).toEqual(["a", "b", "c"]);
    expect(isStructurallyValidLayout(next)).toBe(true);
  });

  it("returns the layout unchanged for an unknown group id", (): void => {
    const grouped: TilingLayoutNode = groupLeaves(threeLeafTree(), ["a", "b"]);
    expect(ungroupNode(grouped, "nope")).toBe(grouped);
  });
});

describe("addLeafToGroup (drag-into-group commit)", (): void => {
  it("extracts a sibling leaf and appends it as the now-active member", (): void => {
    const grouped: TilingLayoutNode = groupLeaves(threeLeafTree(), ["a", "b"]);
    const next: TilingLayoutNode = addLeafToGroup(grouped, "group-a", "c");
    const group: TilingGroupNode = asGroup(findGroupById(next, "group-a") as TilingLayoutNode);
    expect(memberIds(group)).toEqual(["a", "b", "c"]);
    expect(group.activeMemberId).toBe("c");
    expect(findGroupContainingLeaf(next, "c")).not.toBeNull();
    expect(isStructurallyValidLayout(next)).toBe(true);
  });

  it("is a no-op when the source is already a member of the group", (): void => {
    const grouped: TilingLayoutNode = groupLeaves(threeLeafTree(), ["a", "b"]);
    expect(addLeafToGroup(grouped, "group-a", "b")).toBe(grouped);
  });

  it("returns the layout unchanged for an absent group", (): void => {
    const grouped: TilingLayoutNode = groupLeaves(threeLeafTree(), ["a", "b"]);
    expect(addLeafToGroup(grouped, "ghost", "c")).toBe(grouped);
  });
});

describe("removeMemberFromGroup (re-seat a member as a sibling)", (): void => {
  it("re-seats a removed member beside the surviving group", (): void => {
    const grouped: TilingLayoutNode = groupLeaves(threeLeafTree(), ["a", "b", "c"]);
    const next: TilingLayoutNode = removeMemberFromGroup(grouped, "group-a", "c");
    const group: TilingGroupNode = asGroup(findGroupById(next, "group-a") as TilingLayoutNode);
    expect(memberIds(group)).toEqual(["a", "b"]);
    expect(findLeafById(next, "c")).not.toBeNull();
    expect(findGroupContainingLeaf(next, "c")).toBeNull();
    expect(isStructurallyValidLayout(next)).toBe(true);
  });

  it("collapses the group to a bare leaf when only one member would remain", (): void => {
    const grouped: TilingLayoutNode = groupLeaves(threeLeafTree(), ["a", "b"]);
    const next: TilingLayoutNode = removeMemberFromGroup(grouped, "group-a", "b");
    expect(collectGroups(next)).toHaveLength(0);
    expect(readLeafNodeIds(next).slice().sort()).toEqual(["a", "b", "c"]);
  });

  it("moves the active flag off a removed active member", (): void => {
    const grouped: TilingLayoutNode = groupLeaves(threeLeafTree(), ["a", "b", "c"]);
    const activeOnB: TilingLayoutNode = setActiveGroupMember(grouped, "group-a", "b");
    const next: TilingLayoutNode = removeMemberFromGroup(activeOnB, "group-a", "b");
    const group: TilingGroupNode = asGroup(findGroupById(next, "group-a") as TilingLayoutNode);
    expect(group.activeMemberId).not.toBe("b");
    expect(memberIds(group)).toContain(group.activeMemberId);
  });

  it("returns the layout unchanged for an absent group or member", (): void => {
    const grouped: TilingLayoutNode = groupLeaves(threeLeafTree(), ["a", "b"]);
    expect(removeMemberFromGroup(grouped, "ghost", "a")).toBe(grouped);
    expect(removeMemberFromGroup(grouped, "group-a", "ghost")).toBe(grouped);
  });
});

describe("setActiveGroupMember (tab activation)", (): void => {
  it("activates the requested member tab", (): void => {
    const grouped: TilingLayoutNode = groupLeaves(threeLeafTree(), ["a", "b", "c"]);
    const next: TilingLayoutNode = setActiveGroupMember(grouped, "group-a", "c");
    expect(asGroup(findGroupById(next, "group-a") as TilingLayoutNode).activeMemberId).toBe("c");
  });

  it("returns the same reference when the member is already active", (): void => {
    const grouped: TilingLayoutNode = groupLeaves(threeLeafTree(), ["a", "b"]);
    expect(setActiveGroupMember(grouped, "group-a", "a")).toBe(grouped);
  });

  it("returns the same reference for a member absent from the group", (): void => {
    const grouped: TilingLayoutNode = groupLeaves(threeLeafTree(), ["a", "b"]);
    expect(setActiveGroupMember(grouped, "group-a", "ghost")).toBe(grouped);
  });
});

describe("cycleActiveGroupMember (tab ring wraparound)", (): void => {
  it("advances the active member forward with wraparound", (): void => {
    const grouped: TilingLayoutNode = groupLeaves(threeLeafTree(), ["a", "b", "c"]);
    const afterNext: TilingLayoutNode = cycleActiveGroupMember(grouped, "group-a", "next");
    expect(asGroup(findGroupById(afterNext, "group-a") as TilingLayoutNode).activeMemberId).toBe("b");
    const wrapped: TilingLayoutNode = cycleActiveGroupMember(
      setActiveGroupMember(grouped, "group-a", "c"),
      "group-a",
      "next",
    );
    expect(asGroup(findGroupById(wrapped, "group-a") as TilingLayoutNode).activeMemberId).toBe("a");
  });

  it("advances the active member backward with wraparound", (): void => {
    const grouped: TilingLayoutNode = groupLeaves(threeLeafTree(), ["a", "b", "c"]);
    const wrapped: TilingLayoutNode = cycleActiveGroupMember(grouped, "group-a", "previous");
    expect(asGroup(findGroupById(wrapped, "group-a") as TilingLayoutNode).activeMemberId).toBe("c");
  });
});

describe("group tree-helpers", (): void => {
  it("collectGroups / findGroupContainingLeaf / readGroupMemberIds enumerate group membership", (): void => {
    const grouped: TilingLayoutNode = groupLeaves(threeLeafTree(), ["a", "b"]);
    expect(collectGroups(grouped)).toHaveLength(1);
    expect(findGroupContainingLeaf(grouped, "b")?.id).toBe("group-a");
    expect(findGroupContainingLeaf(grouped, "c")).toBeNull();
    expect(readGroupMemberIds(grouped).slice().sort()).toEqual(["a", "b"]);
  });

  it("findLeafById reaches members nested inside a group", (): void => {
    const grouped: TilingLayoutNode = groupLeaves(threeLeafTree(), ["a", "b"]);
    expect(findLeafById(grouped, "b")?.id).toBe("b");
  });

  it("readLeafNodeIds reports only the active member of a group (outer-slot view)", (): void => {
    const grouped: TilingLayoutNode = groupLeaves(threeLeafTree(), ["a", "b"]);
    expect(readLeafNodeIds(grouped).slice().sort()).toEqual(["a", "c"]);
  });
});

describe("isStructurallyValidLayout (group invariants)", (): void => {
  const a: TilingLeafNode = leaf("a");
  const b: TilingLeafNode = leaf("b");

  it("accepts a well-formed group (≥1 member, unique ids, active present)", (): void => {
    const group: TilingGroupNode = { kind: "group", id: "g", members: [a, b], activeMemberId: "a" };
    expect(isStructurallyValidLayout(group)).toBe(true);
  });

  it("rejects an empty group", (): void => {
    const group: TilingGroupNode = { kind: "group", id: "g", members: [], activeMemberId: "a" };
    expect(isStructurallyValidLayout(group)).toBe(false);
  });

  it("rejects a group whose activeMemberId is not among its members", (): void => {
    const group: TilingGroupNode = { kind: "group", id: "g", members: [a, b], activeMemberId: "ghost" };
    expect(isStructurallyValidLayout(group)).toBe(false);
  });

  it("rejects a group with duplicate member ids", (): void => {
    const group: TilingGroupNode = {
      kind: "group",
      id: "g",
      members: [leaf("a"), leaf("a")],
      activeMemberId: "a",
    };
    expect(isStructurallyValidLayout(group)).toBe(false);
  });
});

describe("group geometry — a group is ONE slot (active member only)", (): void => {
  const GAP_FREE_CONFIG: TilingLayoutConfig = { gapPx: 0, minPaneSizePx: 0, handleSizePx: 0 };

  function footprintMap(
    node: TilingLayoutNode,
    width: number,
    height: number,
  ): ReadonlyMap<string, TilingLeafFootprint> {
    const map = new Map<string, TilingLeafFootprint>();
    for (const footprint of collectLeafFootprints(node, 0, 0, width, height, GAP_FREE_CONFIG)) {
      map.set(footprint.leafId, footprint);
    }
    return map;
  }

  it("gives the active member the group's full footprint and inactive members none", (): void => {
    const group: TilingGroupNode = {
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
    const group: TilingGroupNode = {
      kind: "group",
      id: "g",
      members: [leaf("b"), leaf("c")],
      activeMemberId: "b",
    };
    const tree: TilingSplitNode = hsplit("root", leaf("a"), group, 0.5);
    const map = footprintMap(tree, 1000, 800);
    expect(map.get("a")).toEqual({ leafId: "a", left: 0, top: 0, width: 500, height: 800 });
    expect(map.get("b")).toEqual({ leafId: "b", left: 500, top: 0, width: 500, height: 800 });
    expect(map.has("c")).toBe(false);
  });
});

describe("drag-into-group drop intent", (): void => {
  // The drag's hit on a layout with the group {a, b} and a loose pane c, c dragged: the group's body is a pane like
  // any other (a center drop on it is `swap`, as on a leaf), and add-to-group (`group-merge`) is reachable only
  // through the group's tab strip (a slot per member, giving the index) or a host drop element, never the body.
  const GROUPED: TilingLayoutNode = groupLeaves(threeLeafTree(), ["a", "b"]);
  const CONFIG: TilingLayoutConfig = { gapPx: 6, handleSizePx: 4, minPaneSizePx: 96 };
  const drag = layoutDrag(GROUPED, "c", { width: 1000, height: 600 }, CONFIG, undefined, {
    strip: { top: 0, height: 28, left: 0, gap: 0, widths: new Map([["tile-a", 40], ["tile-b", 40]]) },
  })!;
  // The group is drawn as its active member, tile-a.
  const g = drag.lift.layout.get("tile-a")!;

  /** The drop state the drag hit holds at `point`, as the renderer keeps it (the drop of the held place). */
  function dropAt(x: number, y: number): TilingDropIntentState {
    const read = hitRun(drag, "lift").at({ x, y });
    if (read.held == null || read.held.kind === "home") throw new Error("nothing held");
    const state: TilingDropIntentState | null = tilingDropStateOf(GROUPED, read.held, read.mark, 1);
    if (state == null) throw new Error("no drop state");
    return state;
  }
  const centerBodyDrop = (): TilingDropIntentState => dropAt(g.x + g.width / 2, g.y + g.height / 2);
  /** Over the tab strip, in the first slot or (index undefined) past the last tab. */
  const tabStripMergeDrop = (x: number): TilingDropIntentState => dropAt(x, g.y + 10);
  /** The tree a release on the drop's held place commits: the drag's `after(place).tree`. */
  const resolveProjectedDropLayout = (_layout: TilingLayoutNode, _source: string, drop: TilingDropIntentState): TilingLayoutNode | null =>
    drop.place == null || drop.place.kind === "home" ? null : drag.after(drop.place).tree.layout;

  it("classifies a valid center body drop as swap (never group-merge)", (): void => {
    expect(centerBodyDrop().action).toBe("swap");
  });

  it("classifies a tab-strip drop as group-merge", (): void => {
    expect(tabStripMergeDrop(g.x + 10).action).toBe("group-merge");
  });

  it("projects a tab-strip group-merge drop through addLeafToGroup", (): void => {
    // Past the last tab: a join with no index, which appends.
    const dropState: TilingDropIntentState = tabStripMergeDrop(g.x + 200);
    expect(dropState.action).toBe("group-merge");
    expect(dropState.memberInsertIndex).toBeUndefined();
    const projected: TilingLayoutNode | null = resolveProjectedDropLayout(GROUPED, "c", dropState);
    expect(projected).not.toBeNull();
    const group: TilingGroupNode = asGroup(
      findGroupById(projected as TilingLayoutNode, "group-a") as TilingLayoutNode,
    );
    expect(memberIds(group)).toEqual(["a", "b", "c"]);
    expect(group.activeMemberId).toBe("c");
  });

  it("inserts a tab-strip drop at the hovered member index", (): void => {
    const dropState: TilingDropIntentState = tabStripMergeDrop(g.x + 10);
    expect(dropState.memberInsertIndex).toBe(0);
    const projected: TilingLayoutNode | null = resolveProjectedDropLayout(GROUPED, "c", dropState);
    expect(projected).not.toBeNull();
    const group: TilingGroupNode = asGroup(
      findGroupById(projected as TilingLayoutNode, "group-a") as TilingLayoutNode,
    );
    expect(memberIds(group)).toEqual(["c", "a", "b"]);
    expect(group.activeMemberId).toBe("c");
  });

  it("resolves a hovered tab's insert index and appends past the last tab", (): void => {
    expect(tabStripMergeDrop(g.x + 10).memberInsertIndex).toBe(0);
    expect(tabStripMergeDrop(g.x + 50).memberInsertIndex).toBe(1);
    expect(tabStripMergeDrop(g.x + 100).memberInsertIndex).toBeUndefined();
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
  const GAP_FREE_CONFIG: TilingLayoutConfig = { gapPx: 0, minPaneSizePx: 0, handleSizePx: 0 };

  function footprintMap(
    node: TilingLayoutNode,
    width: number,
    height: number,
  ): ReadonlyMap<string, TilingLeafFootprint> {
    const map = new Map<string, TilingLeafFootprint>();
    for (const footprint of collectLeafFootprints(node, 0, 0, width, height, GAP_FREE_CONFIG)) {
      map.set(footprint.leafId, footprint);
    }
    return map;
  }

  it("resolves a master split whose stack slot is a group (active member only, full slot rect)", (): void => {
    // root master split, masterCount 1, left orientation, ratio 0.5:
    //   master = leaf a (left half); stack = group{b,c active c} (right half).
    const group: TilingGroupNode = {
      kind: "group",
      id: "g",
      members: [leaf("b"), leaf("c")],
      activeMemberId: "c",
    };
    const tree: TilingSplitNode = {
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
    const group: TilingGroupNode = {
      kind: "group",
      id: "g",
      members: [leaf("a"), leaf("b")],
      activeMemberId: "a",
    };
    const tree: TilingSplitNode = hsplit("root", group, leaf("c"), 0.5);
    const next: TilingLayoutNode = annexDirection(tree, "c", "left", CONSTRAINTS);
    // No pane is lost (annex is total) and the tree stays structurally valid.
    expect(readGroupMemberIds(next).slice().sort()).toEqual(["a", "b"]);
    expect(isStructurallyValidLayout(next)).toBe(true);
    // The group SURVIVED as a unit — exactly one group, both members intact,
    // active member preserved.
    const groups: ReadonlyArray<TilingGroupNode> = collectGroups(next);
    expect(groups).toHaveLength(1);
    expect(groups[0].members.map((member: TilingLeafNode): string => member.id).sort()).toEqual(["a", "b"]);
    expect(groups[0].activeMemberId).toBe("a");
    // The outer layout sees the surviving group (by active member) + c only.
    expect(readLeafNodeIds(next).slice().sort()).toEqual(["a", "c"]);
  });
});

describe("a group moved onto a target it can't reach stays where it was", (): void => {
  it("insertGroupAdjacent with an unknown target returns the layout unchanged", (): void => {
    const layout: TilingLayoutNode = hsplit("root", { kind: "group", id: "g", members: [leaf("a"), leaf("b")], activeMemberId: "a" }, leaf("c"));
    expect(insertGroupAdjacent(layout, "g", "missing", "left")).toBe(layout);
  });
});

describe("a one-member group", (): void => {
  it("removeMemberFromGroup on a one-member group leaves the bare member in its slot", (): void => {
    const layout: TilingLayoutNode = hsplit("root", { kind: "group", id: "g", members: [leaf("a")], activeMemberId: "a" }, leaf("c"));
    const next: TilingLayoutNode = removeMemberFromGroup(layout, "g", "a");
    expect(next).toEqual(hsplit("root", leaf("a"), leaf("c")));
    expect(isStructurallyValidLayout(next)).toBe(true);
  });
});
