import { describe, expect, it } from "@jest/globals";
import {
  axisStackedLeafCount,
  growLeafToward,
  insertLeafAdjacent,
  isStructurallyValidLayout,
  moveLeafToRoot,
  moveLeafToSplitContainer,
  normalizeStaticAxisFill,
  readLeafNodeIds,
  removeLeafTile,
  setLeafSizing,
  swapLeafTiles,
  toggleSplitAxis,
  updateSplitRatio,
} from "../state";
import type { TilingGrowConstraints } from "../state";
import {
  isStaticAlongSplitAxis,
  resolveBinarySplitDistribution,
} from "../pane-sizing";
import type { BinarySplitDistribution, SplitChildMainSizing } from "../pane-sizing";
import type {
  TilingLayoutNode,
  TilingLeafNode,
  TilingMovePlacement,
  TilingSplitNode,
  TilingPaneSizing,
} from "../types";

function leaf(id: string, tileId: string): TilingLeafNode {
  return { kind: "leaf", id, tileId };
}

/**
 * Base fixture tree:
 *
 *   root (split, horizontal, 0.5)
 *   ├── A           (leaf, tile-a)
 *   └── s2 (split, vertical, 0.5)
 *       ├── B       (leaf, tile-b)
 *       └── C       (leaf, tile-c)
 */
function baseLayout(): TilingSplitNode {
  return {
    kind: "split",
    id: "root",
    axis: "horizontal",
    ratio: 0.5,
    first: leaf("A", "tile-a"),
    second: {
      kind: "split",
      id: "s2",
      axis: "vertical",
      ratio: 0.5,
      first: leaf("B", "tile-b"),
      second: leaf("C", "tile-c"),
    },
  };
}

function clone(node: TilingLayoutNode): TilingLayoutNode {
  return JSON.parse(JSON.stringify(node)) as TilingLayoutNode;
}

function expectInputNotMutated(
  mutation: (layout: TilingLayoutNode) => TilingLayoutNode,
): void {
  const input: TilingLayoutNode = baseLayout();
  const snapshot: TilingLayoutNode = clone(input);
  mutation(input);
  expect(input).toEqual(snapshot);
}

function findLeaf(node: TilingLayoutNode, leafId: string): TilingLeafNode | null {
  if (node.kind === "leaf") {
    return node.id === leafId ? node : null;
  }
  if (node.kind === "group") {
    return node.members.find((member: TilingLeafNode): boolean => member.id === leafId) ?? null;
  }
  return findLeaf(node.first, leafId) ?? findLeaf(node.second, leafId);
}

function findSplit(node: TilingLayoutNode, splitId: string): TilingSplitNode | null {
  if (node.kind === "leaf" || node.kind === "group") {
    return null;
  }
  if (node.id === splitId) {
    return node;
  }
  return findSplit(node.first, splitId) ?? findSplit(node.second, splitId);
}

describe("swapLeafTiles", (): void => {
  it("swaps only the tile assignments and preserves tree shape", (): void => {
    const next: TilingLayoutNode = swapLeafTiles(baseLayout(), "A", "C");
    expect(findLeaf(next, "A")?.tileId).toBe("tile-c");
    expect(findLeaf(next, "C")?.tileId).toBe("tile-a");
    // Untouched leaf keeps its tile; split topology and ids are unchanged.
    expect(findLeaf(next, "B")?.tileId).toBe("tile-b");
    expect(findSplit(next, "root")?.axis).toBe("horizontal");
    expect(findSplit(next, "s2")?.ratio).toBe(0.5);
  });

  it("returns the layout unchanged when both ids are identical", (): void => {
    const input: TilingLayoutNode = baseLayout();
    expect(swapLeafTiles(input, "A", "A")).toBe(input);
  });

  it("returns the layout unchanged when a leaf id does not exist", (): void => {
    const next: TilingLayoutNode = swapLeafTiles(baseLayout(), "A", "ghost");
    expect(findLeaf(next, "A")?.tileId).toBe("tile-a");
  });

  it("does not mutate the input tree", (): void => {
    expectInputNotMutated((layout: TilingLayoutNode): TilingLayoutNode =>
      swapLeafTiles(layout, "A", "C"),
    );
  });
});

describe("updateSplitRatio", (): void => {
  it("updates the targeted split ratio only", (): void => {
    const next: TilingLayoutNode = updateSplitRatio(baseLayout(), "s2", 0.3);
    expect(findSplit(next, "s2")?.ratio).toBe(0.3);
    expect(findSplit(next, "root")?.ratio).toBe(0.5);
  });

  it("clamps ratios above and below the [0.05, 0.95] bounds", (): void => {
    expect(findSplit(updateSplitRatio(baseLayout(), "root", 5), "root")?.ratio).toBe(0.95);
    expect(findSplit(updateSplitRatio(baseLayout(), "root", -3), "root")?.ratio).toBe(0.05);
  });

  it("falls back to 0.5 for a non-finite ratio", (): void => {
    expect(findSplit(updateSplitRatio(baseLayout(), "root", Number.NaN), "root")?.ratio).toBe(0.5);
  });

  it("returns a leaf node unchanged", (): void => {
    const onlyLeaf: TilingLeafNode = leaf("solo", "tile-solo");
    expect(updateSplitRatio(onlyLeaf, "anything", 0.4)).toBe(onlyLeaf);
  });

  it("does not mutate the input tree", (): void => {
    expectInputNotMutated((layout: TilingLayoutNode): TilingLayoutNode =>
      updateSplitRatio(layout, "root", 0.2),
    );
  });
});

describe("toggleSplitAxis", (): void => {
  it("flips the axis of the targeted split", (): void => {
    const next: TilingLayoutNode = toggleSplitAxis(baseLayout(), "root");
    expect(findSplit(next, "root")?.axis).toBe("vertical");
    // sibling split axis untouched.
    expect(findSplit(next, "s2")?.axis).toBe("vertical");
  });

  it("flips a nested split independently", (): void => {
    const next: TilingLayoutNode = toggleSplitAxis(baseLayout(), "s2");
    expect(findSplit(next, "s2")?.axis).toBe("horizontal");
    expect(findSplit(next, "root")?.axis).toBe("horizontal");
  });

  it("returns the layout unchanged for an unknown split id", (): void => {
    const next: TilingLayoutNode = toggleSplitAxis(baseLayout(), "ghost");
    expect(findSplit(next, "root")?.axis).toBe("horizontal");
    expect(findSplit(next, "s2")?.axis).toBe("vertical");
  });

  it("does not mutate the input tree", (): void => {
    expectInputNotMutated((layout: TilingLayoutNode): TilingLayoutNode =>
      toggleSplitAxis(layout, "root"),
    );
  });
});

describe("insertLeafAdjacent", (): void => {
  it("inserts the source beside the target, preserving the parent split axis", (): void => {
    const next: TilingLayoutNode = insertLeafAdjacent(baseLayout(), "A", "C", "right");
    // A is extracted from root; root collapses to s2. C becomes a split with A as second.
    const newSplit: TilingSplitNode | null = findSplit(next, "split-A-C-right");
    expect(newSplit).not.toBeNull();
    expect(newSplit?.axis).toBe("vertical"); // preserved from parent split s2
    expect(newSplit?.first.kind).toBe("leaf");
    expect((newSplit?.first as TilingLeafNode).id).toBe("C");
    expect((newSplit?.second as TilingLeafNode).id).toBe("A");
    // The extracted source is no longer a direct child of the old root position.
    expect(findLeaf(next, "A")).not.toBeNull();
    expect(findLeaf(next, "B")).not.toBeNull();
  });

  it("places the inserted leaf first for left/top placements", (): void => {
    const next: TilingLayoutNode = insertLeafAdjacent(baseLayout(), "A", "C", "top", {
      preserveParentSplitAxis: false,
    });
    const newSplit: TilingSplitNode | null = findSplit(next, "split-A-C-top");
    expect(newSplit?.axis).toBe("vertical"); // inferred from top/bottom placement
    expect((newSplit?.first as TilingLeafNode).id).toBe("A");
    expect((newSplit?.second as TilingLeafNode).id).toBe("C");
  });

  it("infers a horizontal axis from left/right placement when not preserving parent axis", (): void => {
    const next: TilingLayoutNode = insertLeafAdjacent(baseLayout(), "A", "C", "left", {
      preserveParentSplitAxis: false,
    });
    expect(findSplit(next, "split-A-C-left")?.axis).toBe("horizontal");
  });

  it("clamps an out-of-range split ratio into [0.05, 0.95]", (): void => {
    const high: TilingLayoutNode = insertLeafAdjacent(baseLayout(), "A", "C", "right", {
      splitRatio: 5,
    });
    expect(findSplit(high, "split-A-C-right")?.ratio).toBe(0.95);
    const low: TilingLayoutNode = insertLeafAdjacent(baseLayout(), "A", "C", "right", {
      splitRatio: -2,
    });
    expect(findSplit(low, "split-A-C-right")?.ratio).toBe(0.05);
  });

  it("returns the layout unchanged when source and target are identical", (): void => {
    const input: TilingLayoutNode = baseLayout();
    expect(insertLeafAdjacent(input, "A", "A", "right")).toBe(input);
  });

  it("returns the layout unchanged when the source cannot be extracted (single-leaf root)", (): void => {
    const onlyLeaf: TilingLeafNode = leaf("solo", "tile-solo");
    expect(insertLeafAdjacent(onlyLeaf, "solo", "other", "right")).toBe(onlyLeaf);
  });

  it("does not mutate the input tree", (): void => {
    expectInputNotMutated((layout: TilingLayoutNode): TilingLayoutNode =>
      insertLeafAdjacent(layout, "A", "C", "right"),
    );
  });
});

describe("moveLeafToRoot", (): void => {
  it("wraps the extracted source and the remaining tree under a new root split", (): void => {
    const next: TilingLayoutNode = moveLeafToRoot(baseLayout(), "B", "first");
    expect(next.kind).toBe("split");
    const root: TilingSplitNode = next as TilingSplitNode;
    expect(root.id).toBe("root-move-B");
    expect((root.first as TilingLeafNode).id).toBe("B");
    // The remainder keeps A and C; B was removed from s2.
    expect(findLeaf(root.second, "A")).not.toBeNull();
    expect(findLeaf(root.second, "C")).not.toBeNull();
    expect(findLeaf(root.second, "B")).toBeNull();
  });

  it("orders the remainder first for the 'second' placement", (): void => {
    const next: TilingLayoutNode = moveLeafToRoot(baseLayout(), "B", "second");
    const root: TilingSplitNode = next as TilingSplitNode;
    expect((root.second as TilingLeafNode).id).toBe("B");
  });

  it("clamps the new root ratio", (): void => {
    const next: TilingLayoutNode = moveLeafToRoot(baseLayout(), "B", "first", { splitRatio: 9 });
    expect((next as TilingSplitNode).ratio).toBe(0.95);
  });

  it("returns the layout unchanged when the source leaf is missing", (): void => {
    const input: TilingLayoutNode = baseLayout();
    expect(moveLeafToRoot(input, "ghost", "first")).toBe(input);
  });

  it("does not mutate the input tree", (): void => {
    expectInputNotMutated((layout: TilingLayoutNode): TilingLayoutNode =>
      moveLeafToRoot(layout, "B", "first"),
    );
  });
});

describe("moveLeafToSplitContainer", (): void => {
  it("inserts the extracted source as a nested branch of the target split", (): void => {
    const next: TilingLayoutNode = moveLeafToSplitContainer(baseLayout(), "A", "s2", "first");
    const nestedSplit: TilingSplitNode | null = findSplit(next, "s2-insert-A");
    expect(nestedSplit).not.toBeNull();
    expect(nestedSplit?.axis).toBe("vertical"); // adopts the container axis
    expect((nestedSplit?.first as TilingLeafNode).id).toBe("A");
    expect((nestedSplit?.second as TilingLeafNode).id).toBe("B");
    // C remains the second branch of s2.
    expect(findLeaf(next, "C")).not.toBeNull();
  });

  it("orders the existing branch first for the 'second' placement", (): void => {
    const next: TilingLayoutNode = moveLeafToSplitContainer(baseLayout(), "A", "s2", "second");
    const nestedSplit: TilingSplitNode | null = findSplit(next, "s2-insert-A");
    expect((nestedSplit?.first as TilingLeafNode).id).toBe("C");
    expect((nestedSplit?.second as TilingLeafNode).id).toBe("A");
  });

  it("returns the layout unchanged when the source leaf is missing", (): void => {
    const input: TilingLayoutNode = baseLayout();
    expect(moveLeafToSplitContainer(input, "ghost", "s2", "first")).toBe(input);
  });

  it("does not mutate the input tree", (): void => {
    expectInputNotMutated((layout: TilingLayoutNode): TilingLayoutNode =>
      moveLeafToSplitContainer(layout, "A", "s2", "first"),
    );
  });
});

function leafIdsOf(node: TilingLayoutNode): ReadonlyArray<string> {
  if (node.kind === "leaf") {
    return [node.id];
  }
  if (node.kind === "group") {
    return node.members.map((member: TilingLeafNode): string => member.id);
  }
  return [...leafIdsOf(node.first), ...leafIdsOf(node.second)];
}

/**
 * Deeper fixture for nested-collapse coverage:
 *
 *   root (split, horizontal, 0.5)
 *   ├── A                 (leaf, tile-a)
 *   └── s2 (split, vertical, 0.5)
 *       ├── s3 (split, horizontal, 0.5)
 *       │   ├── B         (leaf, tile-b)
 *       │   └── D         (leaf, tile-d)
 *       └── C             (leaf, tile-c)
 */
function nestedLayout(): TilingSplitNode {
  return {
    kind: "split",
    id: "root",
    axis: "horizontal",
    ratio: 0.5,
    first: leaf("A", "tile-a"),
    second: {
      kind: "split",
      id: "s2",
      axis: "vertical",
      ratio: 0.5,
      first: {
        kind: "split",
        id: "s3",
        axis: "horizontal",
        ratio: 0.5,
        first: leaf("B", "tile-b"),
        second: leaf("D", "tile-d"),
      },
      second: leaf("C", "tile-c"),
    },
  };
}

describe("removeLeafTile", (): void => {
  it("removes a top-level leaf and promotes its sibling subtree into the root slot", (): void => {
    // A is the root's first child; removing it collapses root → its sibling s2.
    const next: TilingLayoutNode = removeLeafTile(baseLayout(), "A");
    expect(next.kind).toBe("split");
    expect((next as TilingSplitNode).id).toBe("s2");
    expect(findLeaf(next, "A")).toBeNull();
    expect(findLeaf(next, "B")?.tileId).toBe("tile-b");
    expect(findLeaf(next, "C")?.tileId).toBe("tile-c");
  });

  it("removes a nested leaf and collapses its now-single-child parent split", (): void => {
    // B is the first child of s2; removing it collapses s2 → C takes s2's slot,
    // so the root becomes [A | C] and the s2 split node disappears.
    const next: TilingLayoutNode = removeLeafTile(baseLayout(), "B");
    expect(findSplit(next, "s2")).toBeNull();
    expect(findLeaf(next, "B")).toBeNull();
    const root: TilingSplitNode = next as TilingSplitNode;
    expect(root.id).toBe("root");
    expect((root.first as TilingLeafNode).id).toBe("A");
    expect((root.second as TilingLeafNode).id).toBe("C");
  });

  it("collapses a deeply-nested single-child parent (sibling promoted up one level)", (): void => {
    // B is the first child of s3; removing it collapses s3 → D takes s3's slot
    // as the first child of s2. s3 disappears; A, C, D remain.
    const next: TilingLayoutNode = removeLeafTile(nestedLayout(), "B");
    expect(findSplit(next, "s3")).toBeNull();
    expect(findLeaf(next, "B")).toBeNull();
    const s2: TilingSplitNode | null = findSplit(next, "s2");
    expect(s2).not.toBeNull();
    expect((s2?.first as TilingLeafNode).id).toBe("D");
    expect([...leafIdsOf(next)].sort()).toEqual(["A", "C", "D"]);
  });

  it("returns the layout unchanged when removing the root leaf (no parent to collapse)", (): void => {
    const onlyLeaf: TilingLeafNode = leaf("solo", "tile-solo");
    expect(removeLeafTile(onlyLeaf, "solo")).toBe(onlyLeaf);
  });

  it("returns the layout unchanged for an unknown leaf id", (): void => {
    const input: TilingLayoutNode = baseLayout();
    expect(removeLeafTile(input, "ghost")).toBe(input);
  });

  it("does not mutate the input tree", (): void => {
    expectInputNotMutated((layout: TilingLayoutNode): TilingLayoutNode =>
      removeLeafTile(layout, "B"),
    );
  });
});

describe("live detach drag — frozen detach tree + commit-on-release (Hyprland model)", (): void => {
  const INSERTION_OPTIONS = { preserveParentSplitAxis: false, splitRatio: 0.5 } as const;

  // Models the live (Hyprland) commit path: detach the source ONCE on pickup
  // (`removeLeafTile`, the frozen display tree), resolve the drop intent against
  // that frozen tree (source excluded → no self-target; target must be present),
  // then commit ONCE on release by applying the SAME reducer the preview path
  // uses to the ORIGINAL layout. Throws if the frozen-tree invariants are broken.
  function liveDetachCommit(
    layout: TilingLayoutNode,
    sourceLeafId: string,
    targetLeafId: string,
    action: "swap" | "edge-insert",
    placement: TilingMovePlacement,
  ): TilingLayoutNode {
    const frozen: TilingLayoutNode = removeLeafTile(layout, sourceLeafId);
    const frozenIds: ReadonlyArray<string> = leafIdsOf(frozen);
    if (frozenIds.includes(sourceLeafId)) {
      throw new Error("frozen detach tree must exclude the dragged source (no self-target)");
    }
    if (!frozenIds.includes(targetLeafId)) {
      throw new Error("frozen detach tree must contain the resolved drop target");
    }
    return action === "swap"
      ? swapLeafTiles(layout, sourceLeafId, targetLeafId)
      : insertLeafAdjacent(layout, sourceLeafId, targetLeafId, placement, INSERTION_OPTIONS);
  }

  it("swap intent: live detach commit equals the preview swap commit", (): void => {
    const layout: TilingSplitNode = baseLayout();
    const live: TilingLayoutNode = liveDetachCommit(layout, "A", "C", "swap", "right");
    const preview: TilingLayoutNode = swapLeafTiles(layout, "A", "C");
    expect(live).toEqual(preview);
  });

  it("edge-insert intent: live detach commit equals the preview edge-insert commit", (): void => {
    const layout: TilingSplitNode = baseLayout();
    const live: TilingLayoutNode = liveDetachCommit(layout, "A", "C", "edge-insert", "right");
    const preview: TilingLayoutNode = insertLeafAdjacent(layout, "A", "C", "right", INSERTION_OPTIONS);
    expect(live).toEqual(preview);
  });

  it("nested edge-insert intent also converges (live commit == preview commit)", (): void => {
    const layout: TilingSplitNode = nestedLayout();
    const live: TilingLayoutNode = liveDetachCommit(layout, "B", "C", "edge-insert", "bottom");
    const preview: TilingLayoutNode = insertLeafAdjacent(layout, "B", "C", "bottom", INSERTION_OPTIONS);
    expect(live).toEqual(preview);
  });

  it("the frozen detach tree excludes the source so a self-target is impossible", (): void => {
    const frozen: TilingLayoutNode = removeLeafTile(baseLayout(), "A");
    expect(leafIdsOf(frozen)).not.toContain("A");
    expect([...leafIdsOf(frozen)].sort()).toEqual(["B", "C"]);
  });

  it("frozen-provisional stability: re-resolving the same source yields a structurally identical frozen tree", (): void => {
    const layout: TilingSplitNode = baseLayout();
    const firstResolve: TilingLayoutNode = removeLeafTile(layout, "A");
    const secondResolve: TilingLayoutNode = removeLeafTile(layout, "A");
    // The frozen tree is a pure function of (layout, source) — independent of any
    // prior reflow or pointer motion — so a re-resolution is deep-equal and the
    // resolved target lookup is stable across resolutions.
    expect(secondResolve).toEqual(firstResolve);
    expect(findLeaf(secondResolve, "C")).toEqual(findLeaf(firstResolve, "C"));
  });

  it("cancel restores the original: the prop tree is never mutated pre-commit", (): void => {
    const layout: TilingSplitNode = baseLayout();
    const snapshot: TilingLayoutNode = clone(layout);
    // Pickup computes the frozen provisional; cancel simply discards it. The
    // original layout the renderer falls back to must be structurally unchanged.
    removeLeafTile(layout, "A");
    expect(layout).toEqual(snapshot);
  });
});

describe("axisStackedLeafCount (sibling along-axis minimum factor)", (): void => {
  it("a leaf counts as 1 along either axis", (): void => {
    expect(axisStackedLeafCount(leaf("X", "tile-x"), "horizontal")).toBe(1);
    expect(axisStackedLeafCount(leaf("X", "tile-x"), "vertical")).toBe(1);
  });

  it("a same-axis split SUMS its children (they stack along the axis)", (): void => {
    const split: TilingSplitNode = {
      kind: "split",
      id: "h",
      axis: "horizontal",
      ratio: 0.5,
      first: leaf("Y", "tile-y"),
      second: leaf("Z", "tile-z"),
    };
    expect(axisStackedLeafCount(split, "horizontal")).toBe(2);
  });

  it("a cross-axis split takes the MAX of its children (they overlap along the axis)", (): void => {
    const split: TilingSplitNode = {
      kind: "split",
      id: "v",
      axis: "vertical",
      ratio: 0.5,
      first: leaf("Y", "tile-y"),
      second: leaf("Z", "tile-z"),
    };
    expect(axisStackedLeafCount(split, "horizontal")).toBe(1);
    expect(axisStackedLeafCount(split, "vertical")).toBe(2);
  });
});

describe("growLeafToward (directional acquire-space reducer)", (): void => {
  // gap 0 keeps the bounded-ratio arithmetic clean: clampByMinSize boundedMax =
  // 1 - siblingMinPx/containerSizePx, boundedMin = siblingMinPx/containerSizePx.
  const CONSTRAINTS: TilingGrowConstraints = {
    containerSizePx: 1000,
    gapPx: 0,
    minPaneSizePx: 100,
  };

  function sideBySide(): TilingSplitNode {
    return {
      kind: "split",
      id: "root",
      axis: "horizontal",
      ratio: 0.5,
      first: leaf("X", "tile-x"),
      second: leaf("Y", "tile-y"),
    };
  }

  function stacked(): TilingSplitNode {
    return {
      kind: "split",
      id: "root",
      axis: "vertical",
      ratio: 0.5,
      first: leaf("X", "tile-x"),
      second: leaf("Y", "tile-y"),
    };
  }

  it("grows the FIRST side toward the limit on 'right' (sibling clamped to its minimum)", (): void => {
    const result: TilingLayoutNode = growLeafToward(sideBySide(), "X", "right", CONSTRAINTS);
    // boundedMax = 1 - 100/1000 = 0.9; Y kept at its 100px minimum, never zero.
    expect(findSplit(result, "root")?.ratio).toBeCloseTo(0.9, 10);
  });

  it("grows the SECOND side toward the limit on 'left'", (): void => {
    const result: TilingLayoutNode = growLeafToward(sideBySide(), "Y", "left", CONSTRAINTS);
    // boundedMin = 100/1000 = 0.1; X kept at its 100px minimum.
    expect(findSplit(result, "root")?.ratio).toBeCloseTo(0.1, 10);
  });

  it("grows down/up on a vertical split (down → first grows, up → second grows)", (): void => {
    expect(findSplit(growLeafToward(stacked(), "X", "down", CONSTRAINTS), "root")?.ratio).toBeCloseTo(0.9, 10);
    expect(findSplit(growLeafToward(stacked(), "Y", "up", CONSTRAINTS), "root")?.ratio).toBeCloseTo(0.1, 10);
  });

  it("pins the sibling at a larger per-pane minimum (sibling kept at exactly its min)", (): void => {
    const result: TilingLayoutNode = growLeafToward(sideBySide(), "X", "right", {
      containerSizePx: 1000,
      gapPx: 0,
      minPaneSizePx: 300,
    });
    // 1 - 300/1000 = 0.7 → sibling Y kept at exactly its 300px minimum.
    expect(findSplit(result, "root")?.ratio).toBeCloseTo(0.7, 10);
  });

  it("caps at the global 0.95 ceiling so the sibling never collapses to zero", (): void => {
    const result: TilingLayoutNode = growLeafToward(sideBySide(), "X", "right", {
      containerSizePx: 10000,
      gapPx: 0,
      minPaneSizePx: 100,
    });
    // 1 - 100/10000 = 0.99, capped to the 0.95 global ceiling (sibling ≥ 5%).
    expect(findSplit(result, "root")?.ratio).toBeCloseTo(0.95, 10);
  });

  it("bounds by the SUM of sibling minimums when the sibling is a same-axis split", (): void => {
    const layout: TilingSplitNode = {
      kind: "split",
      id: "root",
      axis: "horizontal",
      ratio: 0.5,
      first: leaf("X", "tile-x"),
      second: {
        kind: "split",
        id: "q",
        axis: "horizontal",
        ratio: 0.5,
        first: leaf("Y", "tile-y"),
        second: leaf("Z", "tile-z"),
      },
    };
    const result: TilingLayoutNode = growLeafToward(layout, "X", "right", CONSTRAINTS);
    // sibling Q has 2 leaves along the axis → 200px minimum → boundedMax = 0.8.
    expect(findSplit(result, "root")?.ratio).toBeCloseTo(0.8, 10);
    // the sibling subtree's own ratio is untouched.
    expect(findSplit(result, "q")?.ratio).toBeCloseTo(0.5, 10);
  });

  it("counts a cross-axis sibling subtree as a single along-axis minimum", (): void => {
    const layout: TilingSplitNode = {
      kind: "split",
      id: "root",
      axis: "horizontal",
      ratio: 0.5,
      first: leaf("X", "tile-x"),
      second: {
        kind: "split",
        id: "q",
        axis: "vertical",
        ratio: 0.5,
        first: leaf("Y", "tile-y"),
        second: leaf("Z", "tile-z"),
      },
    };
    const result: TilingLayoutNode = growLeafToward(layout, "X", "right", CONSTRAINTS);
    // Q stacks Y/Z vertically → only 1 leaf wide → 100px minimum → boundedMax = 0.9.
    expect(findSplit(result, "root")?.ratio).toBeCloseTo(0.9, 10);
  });

  it("cascades across ALL matching-axis ancestors to the layout edge", (): void => {
    const layout: TilingSplitNode = {
      kind: "split",
      id: "root",
      axis: "horizontal",
      ratio: 0.5,
      first: {
        kind: "split",
        id: "inner",
        axis: "horizontal",
        ratio: 0.5,
        first: leaf("X", "tile-x"),
        second: leaf("Y", "tile-y"),
      },
      second: leaf("Z", "tile-z"),
    };
    const result: TilingLayoutNode = growLeafToward(layout, "X", "right", CONSTRAINTS);
    // Both horizontal ancestors push toward the limit so X reaches the right edge.
    expect(findSplit(result, "inner")?.ratio).toBeCloseTo(0.9, 10);
    expect(findSplit(result, "root")?.ratio).toBeCloseTo(0.9, 10);
  });

  it("ignores non-matching-axis ancestors (grow right on a purely vertical chain → unchanged)", (): void => {
    const layout: TilingSplitNode = stacked();
    const result: TilingLayoutNode = growLeafToward(layout, "X", "right", CONSTRAINTS);
    expect(result).toEqual(layout);
  });

  it("returns the same layout reference for an unknown leaf id", (): void => {
    const layout: TilingSplitNode = sideBySide();
    expect(growLeafToward(layout, "missing", "right", CONSTRAINTS)).toBe(layout);
  });

  it("returns unchanged when there is no matching-axis ancestor with room (no-room)", (): void => {
    const layout: TilingSplitNode = sideBySide();
    // 'up' needs a vertical ancestor; this tree has only a horizontal split.
    const result: TilingLayoutNode = growLeafToward(layout, "X", "up", CONSTRAINTS);
    expect(result).toEqual(layout);
  });

  it("leaves an ancestor untouched when the leaf is NOT on its growable side", (): void => {
    const layout: TilingSplitNode = {
      kind: "split",
      id: "root",
      axis: "horizontal",
      ratio: 0.5,
      first: leaf("X", "tile-x"),
      second: {
        kind: "split",
        id: "inner",
        axis: "horizontal",
        ratio: 0.5,
        first: leaf("Y", "tile-y"),
        second: leaf("Z", "tile-z"),
      },
    };
    // Grow Y RIGHT: inside `inner` (Y in first) the first side grows → 0.9. But
    // `inner` sits in root.SECOND, and growing right enlarges the FIRST side — so
    // root's divider cannot hand Y more right-space; root stays untouched.
    const result: TilingLayoutNode = growLeafToward(layout, "Y", "right", CONSTRAINTS);
    expect(findSplit(result, "inner")?.ratio).toBeCloseTo(0.9, 10);
    expect(findSplit(result, "root")?.ratio).toBeCloseTo(0.5, 10);
  });

  it("does not mutate the input layout", (): void => {
    const input: TilingSplitNode = sideBySide();
    const snapshot: TilingLayoutNode = clone(input);
    growLeafToward(input, "X", "right", CONSTRAINTS);
    expect(input).toEqual(snapshot);
  });
});

describe("normalizeStaticAxisFill (per-split ≥1 along-axis filler invariant — Round-2 static-gap fix)", (): void => {
  function staticHeight(id: string, heightPx: number): TilingLeafNode {
    return { kind: "leaf", id, tileId: `tile-${id}`, sizing: { height: "static", heightPx } };
  }
  function staticBoth(id: string, widthPx: number, heightPx: number): TilingLeafNode {
    return {
      kind: "leaf",
      id,
      tileId: `tile-${id}`,
      sizing: { width: "static", widthPx, height: "static", heightPx },
    };
  }
  function staticWidth(id: string, widthPx: number): TilingLeafNode {
    return { kind: "leaf", id, tileId: `tile-${id}`, sizing: { width: "static", widthPx } };
  }
  function verticalSplit(first: TilingLayoutNode, second: TilingLayoutNode): TilingSplitNode {
    return { kind: "split", id: "v", axis: "vertical", ratio: 0.5, first, second };
  }

  // Every split node must keep at least one child that flexes ALONG its axis.
  function satisfiesInvariant(node: TilingLayoutNode): boolean {
    if (node.kind === "leaf") {
      return true;
    }
    if (node.kind === "group") {
      return true;
    }
    const bothStaticAlongAxis: boolean =
      isStaticAlongSplitAxis(node.first, node.axis) && isStaticAlongSplitAxis(node.second, node.axis);
    return !bothStaticAlongAxis && satisfiesInvariant(node.first) && satisfiesInvariant(node.second);
  }

  it("static-only edge: demotes the SECOND child's along-axis static (first pin preserved)", (): void => {
    const result: TilingLayoutNode = normalizeStaticAxisFill(
      verticalSplit(staticHeight("A", 100), staticHeight("B", 150)),
    );
    const split: TilingSplitNode = result as TilingSplitNode;
    // First keeps its along-axis (height) static pin.
    expect(isStaticAlongSplitAxis(split.first, "vertical")).toBe(true);
    expect((split.first as TilingLeafNode).sizing?.heightPx).toBe(100);
    // Second is demoted to along-axis flexible (no cross-axis static to keep → fully flexible).
    expect(isStaticAlongSplitAxis(split.second, "vertical")).toBe(false);
    expect((split.second as TilingLeafNode).sizing).toBeUndefined();
    expect(satisfiesInvariant(result)).toBe(true);
  });

  it("preserves the demoted child's CROSS-axis static sizing + px", (): void => {
    // B is static on BOTH dims; under a vertical split, height is along-axis (must
    // be demoted) and width is cross-axis (must be preserved with its px).
    const result: TilingLayoutNode = normalizeStaticAxisFill(
      verticalSplit(staticHeight("A", 100), staticBoth("B", 320, 150)),
    );
    const demoted: TilingLeafNode = (result as TilingSplitNode).second as TilingLeafNode;
    expect(demoted.sizing).toEqual({ width: "static", widthPx: 320 });
  });

  it("one-static edge is already valid → returned by the SAME reference (idempotent)", (): void => {
    const input: TilingSplitNode = verticalSplit(staticHeight("A", 100), leaf("B", "tile-b"));
    expect(normalizeStaticAxisFill(input)).toBe(input);
  });

  it("both-flexible edge is unchanged → SAME reference", (): void => {
    const input: TilingSplitNode = verticalSplit(leaf("A", "tile-a"), leaf("B", "tile-b"));
    expect(normalizeStaticAxisFill(input)).toBe(input);
  });

  it("cross-axis-only static (both static-W under a VERTICAL split) is NOT a both-static-along-axis edge → unchanged", (): void => {
    // width is the CROSS axis of a vertical split; both children still flex along
    // the (height) axis and share the ratio, so the edge is valid as-is.
    const input: TilingSplitNode = verticalSplit(staticWidth("A", 200), staticWidth("B", 240));
    expect(normalizeStaticAxisFill(input)).toBe(input);
    expect(satisfiesInvariant(input)).toBe(true);
  });

  it("is idempotent: normalizing an already-normalized tree is a no-op (same reference)", (): void => {
    const once: TilingLayoutNode = normalizeStaticAxisFill(
      verticalSplit(staticHeight("A", 100), staticHeight("B", 150)),
    );
    expect(normalizeStaticAxisFill(once)).toBe(once);
  });
});

describe("setLeafSizing — static switch can never store a both-static-along-axis edge", (): void => {
  function verticalAB(): TilingSplitNode {
    return {
      kind: "split",
      id: "v",
      axis: "vertical",
      ratio: 0.5,
      first: leaf("A", "tile-a"),
      second: leaf("B", "tile-b"),
    };
  }
  const staticH: TilingPaneSizing = { height: "static", heightPx: 100 };

  it("two-step switch (A then B static-H) lands B as along-axis flexible (invariant holds)", (): void => {
    const afterA: TilingLayoutNode = setLeafSizing(verticalAB(), "A", staticH);
    const afterB: TilingLayoutNode = setLeafSizing(afterA, "B", { height: "static", heightPx: 150 });
    const split: TilingSplitNode = afterB as TilingSplitNode;
    // A retains its static pin; B is demoted so the axis keeps a filler.
    expect(isStaticAlongSplitAxis(split.first, "vertical")).toBe(true);
    expect(isStaticAlongSplitAxis(split.second, "vertical")).toBe(false);
  });

  it("the resulting tree satisfies the per-split invariant (no both-static-along-axis split)", (): void => {
    const afterA: TilingLayoutNode = setLeafSizing(verticalAB(), "A", staticH);
    const afterB: TilingLayoutNode = setLeafSizing(afterA, "B", { height: "static", heightPx: 150 });
    const bothStatic: boolean =
      isStaticAlongSplitAxis((afterB as TilingSplitNode).first, "vertical") &&
      isStaticAlongSplitAxis((afterB as TilingSplitNode).second, "vertical");
    expect(bothStatic).toBe(false);
  });
});

describe("removeLeafTile — nested static split collapse stays gap-safe (latent removal trigger)", (): void => {
  it("collapsing an inner split that promotes a static sibling next to another static normalizes the edge", (): void => {
    // V = [ A(static-H), inner=[ B(flex), C(static-H) ] ]. Removing B collapses
    // `inner` → C is promoted next to A, creating a would-be both-static-along-axis
    // edge. `removeLeafTile`'s normalize tail must demote one so the axis keeps a
    // filler.
    const layout: TilingSplitNode = {
      kind: "split",
      id: "v",
      axis: "vertical",
      ratio: 0.5,
      first: { kind: "leaf", id: "A", tileId: "tile-a", sizing: { height: "static", heightPx: 100 } },
      second: {
        kind: "split",
        id: "inner",
        axis: "vertical",
        ratio: 0.5,
        first: leaf("B", "tile-b"),
        second: { kind: "leaf", id: "C", tileId: "tile-c", sizing: { height: "static", heightPx: 120 } },
      },
    };
    const result: TilingLayoutNode = removeLeafTile(layout, "B");
    expect([...readLeafNodeIds(result)].sort()).toEqual(["A", "C"]);
    const split: TilingSplitNode = result as TilingSplitNode;
    const bothStatic: boolean =
      isStaticAlongSplitAxis(split.first, split.axis) && isStaticAlongSplitAxis(split.second, split.axis);
    expect(bothStatic).toBe(false);
  });
});

describe("static-only edge: the axis sums to the full extent after a container resize (no trailing gap)", (): void => {
  // Pure layout-sum: maps each child's distribution arm to its main-axis px.
  function childMainPx(
    childSizing: SplitChildMainSizing,
    node: TilingLayoutNode,
    axis: "horizontal" | "vertical",
    containerPx: number,
    contentTotalPx: number,
  ): number {
    if (childSizing.kind === "content") {
      const pinned: number | undefined =
        axis === "vertical" ? node.sizing?.heightPx : node.sizing?.widthPx;
      return pinned ?? 0;
    }
    if (childSizing.kind === "fill") {
      return containerPx - contentTotalPx;
    }
    return containerPx * childSizing.basisFraction;
  }

  function axisSumPx(split: TilingSplitNode, containerPx: number): number {
    const distribution: BinarySplitDistribution = resolveBinarySplitDistribution(
      isStaticAlongSplitAxis(split.first, split.axis),
      isStaticAlongSplitAxis(split.second, split.axis),
      split.ratio,
    );
    const contentTotalPx: number =
      (distribution.first.kind === "content"
        ? (split.axis === "vertical" ? split.first.sizing?.heightPx : split.first.sizing?.widthPx) ?? 0
        : 0) +
      (distribution.second.kind === "content"
        ? (split.axis === "vertical" ? split.second.sizing?.heightPx : split.second.sizing?.widthPx) ?? 0
        : 0);
    return (
      childMainPx(distribution.first, split.first, split.axis, containerPx, contentTotalPx) +
      childMainPx(distribution.second, split.second, split.axis, containerPx, contentTotalPx)
    );
  }

  it("normalized both-static vertical split sums to the container at any extent", (): void => {
    const normalized: TilingLayoutNode = normalizeStaticAxisFill({
      kind: "split",
      id: "v",
      axis: "vertical",
      ratio: 0.5,
      first: { kind: "leaf", id: "A", tileId: "tile-a", sizing: { height: "static", heightPx: 100 } },
      second: { kind: "leaf", id: "B", tileId: "tile-b", sizing: { height: "static", heightPx: 150 } },
    });
    const split: TilingSplitNode = normalized as TilingSplitNode;
    // The captured pins summed to 250; after a resize to 400 / 1000 the filler
    // child absorbs the delta so the axis still sums to the container — no gap.
    expect(axisSumPx(split, 400)).toBeCloseTo(400, 10);
    expect(axisSumPx(split, 1000)).toBeCloseTo(1000, 10);
  });

  it("mixed static+flex split is likewise gap-free (sanity: filler absorbs the delta)", (): void => {
    const split: TilingSplitNode = {
      kind: "split",
      id: "v",
      axis: "vertical",
      ratio: 0.5,
      first: { kind: "leaf", id: "A", tileId: "tile-a", sizing: { height: "static", heightPx: 100 } },
      second: leaf("B", "tile-b"),
    };
    expect(axisSumPx(split, 640)).toBeCloseTo(640, 10);
  });
});

describe("isStructurallyValidLayout — commit-time tree verification backstop", (): void => {
  it("accepts a well-formed tree (unique leaf ids, finite in-range ratios, both children present)", (): void => {
    expect(isStructurallyValidLayout(baseLayout())).toBe(true);
    expect(isStructurallyValidLayout(leaf("solo", "tile-solo"))).toBe(true);
  });

  it("accepts every derived candidate (swap / edge-insert / gap-close are always structurally sound)", (): void => {
    const layout: TilingSplitNode = baseLayout();
    expect(isStructurallyValidLayout(swapLeafTiles(layout, "A", "C"))).toBe(true);
    expect(
      isStructurallyValidLayout(
        insertLeafAdjacent(layout, "A", "C", "right", { preserveParentSplitAxis: false, splitRatio: 0.5 }),
      ),
    ).toBe(true);
    expect(isStructurallyValidLayout(removeLeafTile(layout, "A"))).toBe(true);
  });

  it("REJECTS a duplicated leaf id (the BUG-1 double-instance class at the data layer)", (): void => {
    const duplicated: TilingSplitNode = {
      kind: "split",
      id: "root",
      axis: "horizontal",
      ratio: 0.5,
      first: leaf("A", "tile-a"),
      second: leaf("A", "tile-a"),
    };
    expect(isStructurallyValidLayout(duplicated)).toBe(false);
  });

  it("REJECTS a NaN / out-of-range split ratio", (): void => {
    const nanRatio: TilingSplitNode = { ...baseLayout(), ratio: Number.NaN };
    const zeroRatio: TilingSplitNode = { ...baseLayout(), ratio: 0 };
    const overRatio: TilingSplitNode = { ...baseLayout(), ratio: 1 };
    expect(isStructurallyValidLayout(nanRatio)).toBe(false);
    expect(isStructurallyValidLayout(zeroRatio)).toBe(false);
    expect(isStructurallyValidLayout(overRatio)).toBe(false);
  });

  it("REJECTS an empty leaf id or empty tile id (orphaned leaf)", (): void => {
    expect(isStructurallyValidLayout(leaf("", "tile-a"))).toBe(false);
    expect(isStructurallyValidLayout(leaf("A", ""))).toBe(false);
  });
});
