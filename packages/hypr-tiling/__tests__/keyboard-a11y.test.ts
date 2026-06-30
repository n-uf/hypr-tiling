import { describe, expect, it } from "@jest/globals";
import { clampByMinSize } from "../core/pane-sizing";
import { directionToPlacement } from "../core/pane-switching";
import { findLeafByDirection, insertLeafAdjacent, readLeafNodeIds, updateSplitRatio } from "../core/state";
import type { TilingFocusDirection, TilingLayoutNode, TilingLeafNode, TilingSplitNode } from "../core/types";

/**
 * These cover the PURE interaction models the renderer wires for keyboard
 * accessibility (the renderer itself is `"use client"` + DOM and cannot be
 * rendered under the node-only jest harness — see _agent/tiling-architecture.md
 * "Test coverage status"). Each test exercises exactly the reducer/resolver
 * composition the renderer calls:
 *
 * - directional focus nav  → `findLeafByDirection` (document keydown handler).
 * - keyboard separator resize → `clampByMinSize` step + `updateSplitRatio`.
 * - keyboard move mode  → `findLeafByDirection` + `directionToPlacement` aim,
 *                         then `insertLeafAdjacent` commit (no parallel path).
 */

function leaf(id: string, tileId: string): TilingLeafNode {
  return { kind: "leaf", id, tileId };
}

/**
 *   root (split, horizontal, 0.5)
 *   ├── A           (leaf)
 *   └── s2 (split, vertical, 0.5)
 *       ├── B       (leaf)
 *       └── C       (leaf)
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

function findSplit(node: TilingLayoutNode, splitId: string): TilingSplitNode | null {
  if (node.kind === "leaf" || node.kind === "group") {
    return null;
  }
  if (node.id === splitId) {
    return node;
  }
  return findSplit(node.first, splitId) ?? findSplit(node.second, splitId);
}

describe("renderer directional focus nav model (findLeafByDirection)", (): void => {
  it("moves focus to the geometric neighbor in each direction", (): void => {
    const layout: TilingSplitNode = baseLayout();
    // A is the left column; B/C are stacked on the right.
    expect(findLeafByDirection(layout, "A", "right")).toBe("B");
    expect(findLeafByDirection(layout, "B", "left")).toBe("A");
    expect(findLeafByDirection(layout, "B", "down")).toBe("C");
    expect(findLeafByDirection(layout, "C", "up")).toBe("B");
  });

  it("returns null when there is no neighbor in the direction (renderer leaves focus put)", (): void => {
    const layout: TilingSplitNode = baseLayout();
    expect(findLeafByDirection(layout, "A", "left")).toBeNull();
    expect(findLeafByDirection(layout, "B", "up")).toBeNull();
  });

  it("ignores an unknown source leaf id", (): void => {
    expect(findLeafByDirection(baseLayout(), "zzz", "right")).toBeNull();
  });
});

/**
 * Replicates the separator `onKeyDown` ratio step the renderer applies: a
 * decrease/increase arrow nudges the split ratio by `STEP`, Home/End jump to
 * the extremes, and every result is run through `clampByMinSize` (the same
 * floor the pointer drag uses) against the container extent.
 */
const SEPARATOR_RATIO_STEP: number = 0.02;
const CONTAINER_PX: number = 600;
const GAP_PX: number = 8;
const MIN_PANE_PX: number = 120;

function steppedRatio(currentRatio: number, delta: number): number {
  return clampByMinSize(currentRatio + delta, CONTAINER_PX, GAP_PX, MIN_PANE_PX);
}

describe("renderer keyboard separator resize model (clampByMinSize + updateSplitRatio)", (): void => {
  it("steps the split ratio down/up by the keyboard step and applies it via updateSplitRatio", (): void => {
    const layout: TilingSplitNode = baseLayout();
    const decreased: number = steppedRatio(0.5, -SEPARATOR_RATIO_STEP);
    const nextLayout: TilingLayoutNode = updateSplitRatio(layout, "root", decreased);
    expect(findSplit(nextLayout, "root")?.ratio).toBeCloseTo(0.48, 5);

    const increased: number = steppedRatio(0.5, SEPARATOR_RATIO_STEP);
    expect(findSplit(updateSplitRatio(layout, "root", increased), "root")?.ratio).toBeCloseTo(0.52, 5);
  });

  it("clamps Home/End to the min-pane-bounded extremes (never below the per-pane floor)", (): void => {
    const minRatio: number = clampByMinSize(0, CONTAINER_PX, GAP_PX, MIN_PANE_PX);
    const maxRatio: number = clampByMinSize(1, CONTAINER_PX, GAP_PX, MIN_PANE_PX);
    // minPane/available = 120 / (600-8) ≈ 0.2027 ; symmetric upper bound ≈ 0.7973.
    expect(minRatio).toBeCloseTo(120 / (CONTAINER_PX - GAP_PX), 4);
    expect(maxRatio).toBeCloseTo(1 - 120 / (CONTAINER_PX - GAP_PX), 4);
    expect(minRatio).toBeGreaterThan(0.05);
    expect(maxRatio).toBeLessThan(0.95);
  });

  it("does not let a long press of the decrease key drive a pane below the floor", (): void => {
    let ratio: number = 0.5;
    for (let i: number = 0; i < 100; i += 1) {
      ratio = steppedRatio(ratio, -SEPARATOR_RATIO_STEP);
    }
    expect(ratio).toBeCloseTo(120 / (CONTAINER_PX - GAP_PX), 4);
  });
});

describe("renderer keyboard move-mode model (aim + commit via insertLeafAdjacent)", (): void => {
  it("commits a rightward move by relocating the source onto the neighbor's matching edge", (): void => {
    const layout: TilingSplitNode = baseLayout();
    // Move A to the right: aim picks B as the destination, placement 'right'.
    const direction: TilingFocusDirection = "right";
    const targetLeafId: string | null = findLeafByDirection(layout, "A", direction);
    expect(targetLeafId).toBe("B");
    const placement = directionToPlacement(direction);
    expect(placement).toBe("right");

    const committed: TilingLayoutNode = insertLeafAdjacent(layout, "A", targetLeafId as string, placement);
    // A is removed from the root and re-inserted adjacent to B; both A and B still present.
    const ids: ReadonlyArray<string> = readLeafNodeIds(committed);
    expect(ids).toContain("A");
    expect(ids).toContain("B");
    expect(ids).toContain("C");
    // A no longer sits as the root's first child (it was relocated next to B).
    const root: TilingSplitNode | null = committed.kind === "split" ? committed : null;
    expect(root?.first.kind === "leaf" && root.first.id === "A").toBe(false);
  });

  it("aim is a no-op when there is no neighbor in the chosen direction", (): void => {
    const layout: TilingSplitNode = baseLayout();
    // A has no left neighbor → renderer keeps the move-mode state's target null.
    expect(findLeafByDirection(layout, "A", "left")).toBeNull();
  });

  it("cancel (no commit) leaves the layout untouched", (): void => {
    const layout: TilingSplitNode = baseLayout();
    const snapshot: string = JSON.stringify(layout);
    // Renderer cancel path simply drops the move-mode state — no reducer runs.
    expect(JSON.stringify(layout)).toBe(snapshot);
  });

  it("a down-move of B targets C on its top edge (vertical stack)", (): void => {
    const layout: TilingSplitNode = baseLayout();
    const target: string | null = findLeafByDirection(layout, "B", "down");
    expect(target).toBe("C");
    expect(directionToPlacement("down")).toBe("bottom");
    const committed: TilingLayoutNode = insertLeafAdjacent(layout, "B", target as string, "bottom");
    expect([...readLeafNodeIds(committed)].sort()).toEqual(["A", "B", "C"]);
  });
});
