import { describe, expect, it } from "@jest/globals";
import { annexDirection, reseedEvicted, selectEvictionSet } from "../state";
import type { TilingGrowConstraints } from "../state";
import type {
  TilingLayoutNode,
  TilingLeafNode,
  TilingSplitNode,
} from "../types";

function leaf(id: string): TilingLeafNode {
  return { kind: "leaf", id, tileId: `tile-${id}` };
}

function clone(node: TilingLayoutNode): TilingLayoutNode {
  return JSON.parse(JSON.stringify(node)) as TilingLayoutNode;
}

function leafIdsOf(node: TilingLayoutNode): ReadonlyArray<string> {
  if (node.kind === "leaf") {
    return [node.id];
  }
  if (node.kind === "group") {
    return node.members.map((member: TilingLeafNode): string => member.id);
  }
  return [...leafIdsOf(node.first), ...leafIdsOf(node.second)];
}

function findLeaf(node: TilingLayoutNode, id: string): TilingLeafNode | null {
  if (node.kind === "leaf") {
    return node.id === id ? node : null;
  }
  if (node.kind === "group") {
    return node.members.find((member: TilingLeafNode): boolean => member.id === id) ?? null;
  }
  return findLeaf(node.first, id) ?? findLeaf(node.second, id);
}

interface Rect {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// Mirrors `state.ts:collectLeafRects` geometry so tests can assert that the
// active pane reaches the directional edge and that the left→right / top→bottom
// pane order is what the reducer produced.
function rects(
  node: TilingLayoutNode,
  left: number,
  top: number,
  width: number,
  height: number,
): ReadonlyArray<Rect> {
  if (node.kind === "leaf") {
    return [{ id: node.id, left, top, right: left + width, bottom: top + height }];
  }
  if (node.kind === "group") {
    const active: TilingLeafNode =
      node.members.find((member: TilingLeafNode): boolean => member.id === node.activeMemberId) ??
      node.members[0];
    return [{ id: active.id, left, top, right: left + width, bottom: top + height }];
  }
  if (node.axis === "horizontal") {
    const firstWidth: number = width * node.ratio;
    return [
      ...rects(node.first, left, top, firstWidth, height),
      ...rects(node.second, left + firstWidth, top, width - firstWidth, height),
    ];
  }
  const firstHeight: number = height * node.ratio;
  return [
    ...rects(node.first, left, top, width, firstHeight),
    ...rects(node.second, left, top + firstHeight, width, height - firstHeight),
  ];
}

function rectOf(node: TilingLayoutNode, id: string): Rect {
  const found: Rect | undefined = rects(node, 0, 0, 1, 1).find((rect: Rect): boolean => rect.id === id);
  if (found == null) {
    throw new Error(`rect for leaf "${id}" not found`);
  }
  return found;
}

function areaOf(rect: Rect): number {
  return (rect.right - rect.left) * (rect.bottom - rect.top);
}

// gap 0 keeps the min-clamp arithmetic clean: minFraction = 100/1000 = 0.1.
const CONSTRAINTS: TilingGrowConstraints = {
  containerSizePx: 1000,
  gapPx: 0,
  minPaneSizePx: 100,
};

/**
 * The operator's screenshot topology: a wide SPEND pane occupies root.first,
 * and the narrow right-hand WARN/INFO column is NESTED in a SEPARATE vertical
 * split at root.second — i.e. non-aligned, at a different depth than SPEND.
 *
 *   root (H, 0.6)
 *   ├── SPEND                 (leaf — wide, active)
 *   └── rightCol (V, 0.5)
 *       ├── WARN              (leaf)
 *       └── INFO              (leaf)
 */
function spendGraphLayout(): TilingSplitNode {
  return {
    kind: "split",
    id: "root",
    axis: "horizontal",
    ratio: 0.6,
    first: leaf("SPEND"),
    second: {
      kind: "split",
      id: "right-col",
      axis: "vertical",
      ratio: 0.5,
      first: leaf("WARN"),
      second: leaf("INFO"),
    },
  };
}

describe("selectEvictionSet — STRUCTURAL eviction (fixes the non-aligned / nested miss)", (): void => {
  it("evicts the ENTIRE nested column to the right, regardless of its split depth", (): void => {
    // The spend-graph bug: WARN/INFO live in a DIFFERENT (vertical) split than
    // SPEND. A naive bbox/ratio approach (growLeafToward) only shrinks the
    // aligned ancestor sibling and leaves these nested panes alive. The
    // structural walk evicts every leaf on the directional side of root.
    const evicted: ReadonlyArray<string> = selectEvictionSet(spendGraphLayout(), "SPEND", "right");
    expect([...evicted].sort()).toEqual(["INFO", "WARN"]);
  });

  it("evicts panes at MIXED depths / axes in the vector (any nesting depth)", (): void => {
    //   root (H)
    //   ├── SPEND
    //   └── (V): { TOP_RIGHT, (H): { MID_RIGHT, FAR_RIGHT } }   ← depths 2 and 3
    const layout: TilingSplitNode = {
      kind: "split",
      id: "root",
      axis: "horizontal",
      ratio: 0.5,
      first: leaf("SPEND"),
      second: {
        kind: "split",
        id: "rcol",
        axis: "vertical",
        ratio: 0.5,
        first: leaf("TOP_RIGHT"),
        second: {
          kind: "split",
          id: "rrow",
          axis: "horizontal",
          ratio: 0.5,
          first: leaf("MID_RIGHT"),
          second: leaf("FAR_RIGHT"),
        },
      },
    };
    const evicted: ReadonlyArray<string> = selectEvictionSet(layout, "SPEND", "right");
    expect([...evicted].sort()).toEqual(["FAR_RIGHT", "MID_RIGHT", "TOP_RIGHT"]);
  });

  it("does NOT evict complementary-side panes (left of the active stays put)", (): void => {
    //   root (H): { LEFT, (H): { SPEND, RIGHT } } — annex right from SPEND.
    const layout: TilingSplitNode = {
      kind: "split",
      id: "root",
      axis: "horizontal",
      ratio: 0.5,
      first: leaf("LEFT"),
      second: {
        kind: "split",
        id: "inner",
        axis: "horizontal",
        ratio: 0.5,
        first: leaf("SPEND"),
        second: leaf("RIGHT"),
      },
    };
    const evicted: ReadonlyArray<string> = selectEvictionSet(layout, "SPEND", "right");
    expect(evicted).toEqual(["RIGHT"]);
  });

  it("does NOT evict cross-axis panes that are not in the vector (a pane below)", (): void => {
    //   root (V): { (H): { SPEND, RIGHT }, BOTTOM } — annex right from SPEND.
    const layout: TilingSplitNode = {
      kind: "split",
      id: "root",
      axis: "vertical",
      ratio: 0.5,
      first: {
        kind: "split",
        id: "row",
        axis: "horizontal",
        ratio: 0.5,
        first: leaf("SPEND"),
        second: leaf("RIGHT"),
      },
      second: leaf("BOTTOM"),
    };
    const evicted: ReadonlyArray<string> = selectEvictionSet(layout, "SPEND", "right");
    expect(evicted).toEqual(["RIGHT"]);
  });

  it("returns farthest-first (topmost matching ancestor's subtree leads)", (): void => {
    //   root (H): { (H): { SPEND, NEAR }, FAR } — FAR is farther right than NEAR.
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
        first: leaf("SPEND"),
        second: leaf("NEAR"),
      },
      second: leaf("FAR"),
    };
    expect(selectEvictionSet(layout, "SPEND", "right")).toEqual(["FAR", "NEAR"]);
  });

  it("is empty when the active pane is already at the edge in the direction", (): void => {
    const layout: TilingSplitNode = {
      kind: "split",
      id: "root",
      axis: "horizontal",
      ratio: 0.5,
      first: leaf("LEFT"),
      second: leaf("SPEND"),
    };
    expect(selectEvictionSet(layout, "SPEND", "right")).toEqual([]);
  });

  it("is empty for an unknown active leaf id", (): void => {
    expect(selectEvictionSet(spendGraphLayout(), "ghost", "right")).toEqual([]);
  });
});

describe("reseedEvicted — OFF-AXIS re-accommodation (perpendicular to the annex axis)", (): void => {
  it("L2 carve: re-seeds evicted PERPENDICULAR (below) the active, NOT beside it on the annex axis", (): void => {
    // annex right ⇒ perpendicular axis is vertical ⇒ evicted carve BELOW the
    // active (off-axis), active dominant + anchored on top. The OLD behavior put
    // them on the same (horizontal) axis at the opposite end — this asserts the fix.
    const result: TilingLayoutNode = reseedEvicted(leaf("SPEND"), [leaf("E1"), leaf("E2")], "SPEND", "right", CONSTRAINTS);
    // depth-first reading order: active first (dominant top band), evicted below.
    expect(leafIdsOf(result)).toEqual(["SPEND", "E1", "E2"]);
    // SPEND spans the FULL annex (horizontal) extent — it never moved off-axis.
    expect(rectOf(result, "SPEND").left).toBeCloseTo(0, 10);
    expect(rectOf(result, "SPEND").right).toBeCloseTo(1, 10);
    // evicted are perpendicular (below) the active, not beside it.
    expect(rectOf(result, "E1").top).toBeGreaterThan(rectOf(result, "SPEND").top + 0.1);
    expect(rectOf(result, "E2").top).toBeGreaterThan(rectOf(result, "E1").top - 1e-9);
    // active is the dominant share.
    expect(areaOf(rectOf(result, "SPEND"))).toBeGreaterThan(areaOf(rectOf(result, "E1")));
  });

  it("preserves evicted leaf fields (tileId carried through)", (): void => {
    const evicted: TilingLeafNode = { kind: "leaf", id: "E1", tileId: "custom-tile" };
    const result: TilingLayoutNode = reseedEvicted(leaf("SPEND"), [evicted], "SPEND", "right", CONSTRAINTS);
    expect(findLeaf(result, "E1")?.tileId).toBe("custom-tile");
  });

  it("never drops a pane: grafts at root when the anchor is unexpectedly absent", (): void => {
    const result: TilingLayoutNode = reseedEvicted(leaf("SPEND"), [leaf("E1")], "ghost", "right", CONSTRAINTS);
    expect([...leafIdsOf(result)].sort()).toEqual(["E1", "SPEND"]);
  });
});

describe("annexDirection — directional annex + OFF-AXIS re-seed (3-rung ladder)", (): void => {
  // L1 off-axis sink — an EXISTING perpendicular region absorbs the evicted; the
  // active's band is untouched (full vector + full perpendicular extent).
  it("L1 sink (horizontal annex): evicted sink into the existing perpendicular band; active claims FULL vector untouched", (): void => {
    //   root (V, 0.5): { top (H): { SPEND, RIGHT }, BOTTOM } — annex right.
    //   The vertical root split is an EXISTING perpendicular region (BOTTOM).
    const layout: TilingSplitNode = {
      kind: "split",
      id: "root",
      axis: "vertical",
      ratio: 0.5,
      first: {
        kind: "split",
        id: "top",
        axis: "horizontal",
        ratio: 0.5,
        first: leaf("SPEND"),
        second: leaf("RIGHT"),
      },
      second: leaf("BOTTOM"),
    };
    const result: TilingLayoutNode = annexDirection(layout, "SPEND", "right", CONSTRAINTS);
    expect([...leafIdsOf(result)].sort()).toEqual(["BOTTOM", "RIGHT", "SPEND"]);
    // active claims its FULL vector (full width) and keeps its perpendicular
    // extent UNTOUCHED (still the top half, 0..0.5).
    const spend: Rect = rectOf(result, "SPEND");
    expect(spend.left).toBeCloseTo(0, 10);
    expect(spend.right).toBeCloseTo(1, 10);
    expect(spend.top).toBeCloseTo(0, 10);
    expect(spend.bottom).toBeCloseTo(0.5, 10);
    // RIGHT relocated OFF-AXIS — into the bottom (perpendicular) band, not beside SPEND.
    expect(rectOf(result, "RIGHT").top).toBeGreaterThan(spend.bottom - 1e-9);
    // BOTTOM (the existing perpendicular region) still hosts the bottom edge.
    expect(rectOf(result, "BOTTOM").bottom).toBeCloseTo(1, 10);
  });

  it("L1 sink (vertical annex): evicted sink into the existing perpendicular column; active claims FULL height untouched", (): void => {
    //   root (H, 0.5): { left (V): { TOP, SPEND }, RIGHT } — annex up.
    //   The horizontal root split is an EXISTING perpendicular region (RIGHT).
    const layout: TilingSplitNode = {
      kind: "split",
      id: "root",
      axis: "horizontal",
      ratio: 0.5,
      first: {
        kind: "split",
        id: "left",
        axis: "vertical",
        ratio: 0.5,
        first: leaf("TOP"),
        second: leaf("SPEND"),
      },
      second: leaf("RIGHT"),
    };
    const result: TilingLayoutNode = annexDirection(layout, "SPEND", "up", CONSTRAINTS);
    expect([...leafIdsOf(result)].sort()).toEqual(["RIGHT", "SPEND", "TOP"]);
    const spend: Rect = rectOf(result, "SPEND");
    // active claims FULL vertical vector and keeps its left column extent (0..0.5).
    expect(spend.top).toBeCloseTo(0, 10);
    expect(spend.bottom).toBeCloseTo(1, 10);
    expect(spend.left).toBeCloseTo(0, 10);
    expect(spend.right).toBeCloseTo(0.5, 10);
    // TOP relocated OFF-AXIS — into the right (perpendicular) column, not above SPEND.
    expect(rectOf(result, "TOP").left).toBeGreaterThan(spend.right - 1e-9);
  });

  // L2 far-edge carve — no perpendicular region; carve a perpendicular split
  // around the active (active dominant + anchored, opposite side clean).
  it("L2 carve (horizontal annex, last column): SPEND claims width, WARN/INFO carved perpendicular BELOW (no pane lost)", (): void => {
    const result: TilingLayoutNode = annexDirection(spendGraphLayout(), "SPEND", "right", CONSTRAINTS);
    expect([...leafIdsOf(result)].sort()).toEqual(["INFO", "SPEND", "WARN"]);
    const spend: Rect = rectOf(result, "SPEND");
    // SPEND stays ANCHORED at the left and spans the full width (full vector reach).
    expect(spend.left).toBeCloseTo(0, 10);
    expect(spend.right).toBeCloseTo(1, 10);
    expect(spend.top).toBeCloseTo(0, 10);
    // dominant share; WARN/INFO carved perpendicular (below), single band.
    expect(areaOf(spend)).toBeGreaterThan(areaOf(rectOf(result, "WARN")));
    expect(areaOf(spend)).toBeGreaterThan(areaOf(rectOf(result, "INFO")));
    expect(rectOf(result, "WARN").top).toBeGreaterThan(spend.bottom - 1e-9);
    expect(rectOf(result, "INFO").top).toBeGreaterThan(spend.bottom - 1e-9);
  });

  it("L2 carve (vertical annex, anchor-in-middle): surviving opposite pane UNTOUCHED, evicted carved off-axis", (): void => {
    //   root (V, 0.5): { TOP, mid (V, 0.5): { SPEND, BOTTOM } } — annex up.
    //   BOTTOM is the OPPOSITE-side (down) pane and must stay clean.
    const layout: TilingSplitNode = {
      kind: "split",
      id: "root",
      axis: "vertical",
      ratio: 0.5,
      first: leaf("TOP"),
      second: {
        kind: "split",
        id: "mid",
        axis: "vertical",
        ratio: 0.5,
        first: leaf("SPEND"),
        second: leaf("BOTTOM"),
      },
    };
    const result: TilingLayoutNode = annexDirection(layout, "SPEND", "up", CONSTRAINTS);
    expect([...leafIdsOf(result)].sort()).toEqual(["BOTTOM", "SPEND", "TOP"]);
    const spend: Rect = rectOf(result, "SPEND");
    // SPEND anchored at the top, dominant; opposite (BOTTOM) untouched at 0.5..1.
    expect(spend.top).toBeCloseTo(0, 10);
    const bottom: Rect = rectOf(result, "BOTTOM");
    expect(bottom.top).toBeCloseTo(0.5, 10);
    expect(bottom.bottom).toBeCloseTo(1, 10);
    expect(bottom.left).toBeCloseTo(0, 10);
    expect(bottom.right).toBeCloseTo(1, 10);
    // TOP carved OFF-AXIS (perpendicular = to the right of SPEND), within the top band.
    const top: Rect = rectOf(result, "TOP");
    expect(top.left).toBeGreaterThan(spend.right - 1e-9);
    expect(top.bottom).toBeLessThan(0.5 + 1e-9);
    expect(areaOf(spend)).toBeGreaterThan(areaOf(top));
  });

  // L3 degenerate spill — perpendicular capacity exhausted (min-size); the
  // residual spills to the opposite side, minimized.
  it("L3 spill: min-size exhaustion forces residual to the OPPOSITE side, minimized (the hosted prefix stays off-axis)", (): void => {
    //   root (H): { SPEND, (V): { E1, E2 } } — annex right with a SHORT cross
    //   extent (150px / 100px min ⇒ perpCapacity 1) ⇒ host E1 off-axis, spill E2.
    const layout: TilingSplitNode = {
      kind: "split",
      id: "root",
      axis: "horizontal",
      ratio: 0.5,
      first: leaf("SPEND"),
      second: {
        kind: "split",
        id: "rcol",
        axis: "vertical",
        ratio: 0.5,
        first: leaf("E1"),
        second: leaf("E2"),
      },
    };
    const tight: TilingGrowConstraints = { containerSizePx: 1000, gapPx: 0, minPaneSizePx: 100, crossSizePx: 150 };
    const result: TilingLayoutNode = annexDirection(layout, "SPEND", "right", tight);
    expect([...leafIdsOf(result)].sort()).toEqual(["E1", "E2", "SPEND"]);
    const spend: Rect = rectOf(result, "SPEND");
    // E1 hosted OFF-AXIS (below SPEND).
    expect(rectOf(result, "E1").top).toBeGreaterThan(spend.bottom - 1e-9);
    // E2 SPILLED to the OPPOSITE side (left of SPEND) and minimized (thin).
    const e2: Rect = rectOf(result, "E2");
    expect(e2.right).toBeLessThan(spend.left + 1e-9);
    expect(e2.left).toBeCloseTo(0, 10);
    expect(e2.right - e2.left).toBeLessThan(0.2);
  });

  it("L3 contrast: the SAME layout with ample cross extent hosts BOTH evicted off-axis (no opposite-side spill)", (): void => {
    const layout: TilingSplitNode = {
      kind: "split",
      id: "root",
      axis: "horizontal",
      ratio: 0.5,
      first: leaf("SPEND"),
      second: {
        kind: "split",
        id: "rcol",
        axis: "vertical",
        ratio: 0.5,
        first: leaf("E1"),
        second: leaf("E2"),
      },
    };
    const result: TilingLayoutNode = annexDirection(layout, "SPEND", "right", CONSTRAINTS);
    const spend: Rect = rectOf(result, "SPEND");
    // Both evicted are below SPEND, full width — neither is on the opposite (left) side.
    expect(spend.left).toBeCloseTo(0, 10);
    expect(rectOf(result, "E1").top).toBeGreaterThan(spend.bottom - 1e-9);
    expect(rectOf(result, "E2").top).toBeGreaterThan(spend.bottom - 1e-9);
    expect(rectOf(result, "E1").left).toBeCloseTo(0, 10);
    expect(rectOf(result, "E2").left).toBeCloseTo(0, 10);
  });

  // Regression — the OLD same-axis-opposite-end dump no longer occurs.
  it("REGRESSION: evicted are never dumped at the opposite end of the same band (active stays anchored)", (): void => {
    const result: TilingLayoutNode = annexDirection(spendGraphLayout(), "SPEND", "right", CONSTRAINTS);
    const spend: Rect = rectOf(result, "SPEND");
    // OLD bug: SPEND jumped to the far right (left ≈ 0.2) and WARN/INFO sat at
    // the left head (right ≤ SPEND.left). NEW: SPEND anchored at left, every
    // evicted overlaps SPEND on the annex axis (off-axis, never behind it).
    expect(spend.left).toBeCloseTo(0, 10);
    for (const id of ["WARN", "INFO"]) {
      expect(rectOf(result, id).right).toBeGreaterThan(spend.left + 1e-9);
    }
  });

  it("no-op when already at the edge with nothing to annex (falls through to acquire-space)", (): void => {
    const layout: TilingSplitNode = {
      kind: "split",
      id: "root",
      axis: "horizontal",
      ratio: 0.5,
      first: leaf("LEFT"),
      second: leaf("SPEND"),
    };
    // SPEND is already at the right edge → empty eviction set → growLeafToward
    // fall-through, and SPEND (the second child) has no rightward ratio to push,
    // so the layout is structurally unchanged.
    expect(annexDirection(layout, "SPEND", "right", CONSTRAINTS)).toEqual(layout);
  });

  it("returns the layout unchanged (same reference) for an unknown active id", (): void => {
    const layout: TilingSplitNode = spendGraphLayout();
    expect(annexDirection(layout, "ghost", "right", CONSTRAINTS)).toBe(layout);
  });

  it("is idempotent: a second annex in the same direction does not lose or duplicate panes", (): void => {
    const once: TilingLayoutNode = annexDirection(spendGraphLayout(), "SPEND", "right", CONSTRAINTS);
    const twice: TilingLayoutNode = annexDirection(once, "SPEND", "right", CONSTRAINTS);
    expect([...leafIdsOf(twice)].sort()).toEqual([...leafIdsOf(once)].sort());
  });

  it("does not mutate the input tree", (): void => {
    const input: TilingSplitNode = spendGraphLayout();
    const snapshot: TilingLayoutNode = clone(input);
    annexDirection(input, "SPEND", "right", CONSTRAINTS);
    expect(input).toEqual(snapshot);
  });
});
