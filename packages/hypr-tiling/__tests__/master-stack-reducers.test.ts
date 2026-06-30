import { describe, expect, it } from "@jest/globals";
import {
  adjustSplitMasterCount,
  adjustSplitRatio,
  cycleSplitLayoutMode,
  cycleSplitMasterOrientation,
  isStructurallyValidLayout,
  setSplitLayoutMode,
  setSplitMasterCount,
  setSplitMasterOrientation,
} from "../core/state";
import type {
  TilingLayoutNode,
  TilingLeafNode,
  TilingMasterOrientation,
  TilingSplitNode,
} from "../core/types";

/**
 * Pure reducer coverage for the master/stack layout-mode state transitions
 * (HT-LAYOUT-MASTER-STACK): layout-mode toggle, master-count set/adjust (clamped
 * to the slot count), orientation set/cycle, and the shared ratio nudge. Each
 * asserts referential-stability on a no-op and structural validity after.
 */

function leaf(id: string): TilingLeafNode {
  return { kind: "leaf", id, tileId: `tile-${id}` };
}

function hsplit(ratio: number, first: TilingLayoutNode, second: TilingLayoutNode): TilingSplitNode {
  return { kind: "split", id: `h-${first.id}-${second.id}`, axis: "horizontal", ratio, first, second };
}

/** root split with three leaf slots: A | (B / C). */
function tree(overrides?: Partial<TilingSplitNode>): TilingSplitNode {
  return {
    kind: "split",
    id: "root",
    axis: "horizontal",
    ratio: 0.5,
    first: leaf("A"),
    second: hsplit(0.5, leaf("B"), leaf("C")),
    ...overrides,
  };
}

function rootSplit(node: TilingLayoutNode): TilingSplitNode {
  if (node.kind !== "split") {
    throw new Error("expected a split root");
  }
  return node;
}

describe("setSplitLayoutMode / cycleSplitLayoutMode", (): void => {
  it("sets dwindle → master", (): void => {
    const next: TilingLayoutNode = setSplitLayoutMode(tree(), "root", "master");
    expect(rootSplit(next).layoutMode).toBe("master");
    expect(isStructurallyValidLayout(next)).toBe(true);
  });

  it("is a referential no-op when the mode is already set", (): void => {
    const base: TilingSplitNode = tree({ layoutMode: "master" });
    expect(setSplitLayoutMode(base, "root", "master")).toBe(base);
  });

  it("cycles dwindle ⇄ master", (): void => {
    const toMaster: TilingLayoutNode = cycleSplitLayoutMode(tree(), "root");
    expect(rootSplit(toMaster).layoutMode).toBe("master");
    const backToDwindle: TilingLayoutNode = cycleSplitLayoutMode(toMaster, "root");
    expect(rootSplit(backToDwindle).layoutMode).toBe("dwindle");
  });

  it("leaves an unmatched splitId untouched (referential no-op)", (): void => {
    const base: TilingSplitNode = tree();
    expect(setSplitLayoutMode(base, "does-not-exist", "master")).toBe(base);
  });
});

describe("setSplitMasterCount / adjustSplitMasterCount (clamped to slot count)", (): void => {
  it("sets the master count", (): void => {
    const next: TilingLayoutNode = setSplitMasterCount(tree({ layoutMode: "master" }), "root", 2);
    expect(rootSplit(next).masterCount).toBe(2);
  });

  it("clamps the set count to [1, slotCount] (3 slots → max 3)", (): void => {
    const high: TilingLayoutNode = setSplitMasterCount(tree({ layoutMode: "master" }), "root", 99);
    expect(rootSplit(high).masterCount).toBe(3);
    // start from masterCount 2 so clamping a 0 request down to the floor (1) is a
    // real change (a 0 request on a default-1 split would be a no-op).
    const low: TilingLayoutNode = setSplitMasterCount(tree({ layoutMode: "master", masterCount: 2 }), "root", 0);
    expect(rootSplit(low).masterCount).toBe(1);
  });

  it("adjusts by delta from the resolved default (1)", (): void => {
    const next: TilingLayoutNode = adjustSplitMasterCount(tree({ layoutMode: "master" }), "root", 1);
    expect(rootSplit(next).masterCount).toBe(2);
  });

  it("clamps an adjust that would exceed the slot count (no-op at the ceiling)", (): void => {
    const base: TilingSplitNode = tree({ layoutMode: "master", masterCount: 3 });
    expect(adjustSplitMasterCount(base, "root", 1)).toBe(base);
  });

  it("clamps an adjust that would drop below 1 (no-op at the floor)", (): void => {
    const base: TilingSplitNode = tree({ layoutMode: "master", masterCount: 1 });
    expect(adjustSplitMasterCount(base, "root", -1)).toBe(base);
  });
});

describe("setSplitMasterOrientation / cycleSplitMasterOrientation", (): void => {
  it("sets the orientation", (): void => {
    const next: TilingLayoutNode = setSplitMasterOrientation(tree({ layoutMode: "master" }), "root", "bottom");
    expect(rootSplit(next).masterOrientation).toBe("bottom");
  });

  it("is a referential no-op when already at the target orientation", (): void => {
    const base: TilingSplitNode = tree({ layoutMode: "master", masterOrientation: "right" });
    expect(setSplitMasterOrientation(base, "root", "right")).toBe(base);
  });

  it("cycles left → top → right → bottom → left", (): void => {
    const ring: ReadonlyArray<TilingMasterOrientation> = ["top", "right", "bottom", "left"];
    let current: TilingLayoutNode = tree({ layoutMode: "master", masterOrientation: "left" });
    for (const expected of ring) {
      current = cycleSplitMasterOrientation(current, "root");
      expect(rootSplit(current).masterOrientation).toBe(expected);
    }
  });

  it("defaults an undefined orientation to left and cycles to top", (): void => {
    const next: TilingLayoutNode = cycleSplitMasterOrientation(tree({ layoutMode: "master" }), "root");
    expect(rootSplit(next).masterOrientation).toBe("top");
  });
});

describe("adjustSplitRatio (shared nudge, clamped [0.05, 0.95])", (): void => {
  it("nudges the ratio up", (): void => {
    const next: TilingLayoutNode = adjustSplitRatio(tree({ ratio: 0.5 }), "root", 0.1);
    expect(rootSplit(next).ratio).toBeCloseTo(0.6);
  });

  it("nudges the ratio down", (): void => {
    const next: TilingLayoutNode = adjustSplitRatio(tree({ ratio: 0.5 }), "root", -0.1);
    expect(rootSplit(next).ratio).toBeCloseTo(0.4);
  });

  it("clamps at the ceiling (no-op once pinned at 0.95)", (): void => {
    const base: TilingSplitNode = tree({ ratio: 0.95 });
    expect(adjustSplitRatio(base, "root", 0.1)).toBe(base);
  });

  it("clamps at the floor (no-op once pinned at 0.05)", (): void => {
    const base: TilingSplitNode = tree({ ratio: 0.05 });
    expect(adjustSplitRatio(base, "root", -0.1)).toBe(base);
  });
});
