import { describe, expect, it } from "@jest/globals";
import {
  collectLeafFootprints,
  collectMasterSlots,
  resolveMasterParams,
  resolveMasterStackFootprints,
  slotRepresentativeLeafId,
  type TilingLeafFootprint,
  type MasterStackParams,
} from "../leaf-geometry";
import type {
  TilingLayoutConfig,
  TilingLayoutNode,
  TilingLeafNode,
  TilingSplitNode,
} from "../types";

/**
 * Pure geometry coverage for the master/stack layout engine
 * (HT-LAYOUT-MASTER-STACK): slot flattening (`collectMasterSlots`), parameter
 * resolution + clamping (`resolveMasterParams`), the master+stack rect resolver
 * (`resolveMasterStackFootprints`), and the `layoutMode: "master"` arm wired into
 * the single-source `collectLeafFootprints` traversal.
 */

function leaf(id: string): TilingLeafNode {
  return { kind: "leaf", id, tileId: `tile-${id}` };
}

function hsplit(ratio: number, first: TilingLayoutNode, second: TilingLayoutNode): TilingSplitNode {
  return { kind: "split", id: `h-${first.id}-${second.id}`, axis: "horizontal", ratio, first, second };
}

function master(
  overrides: Partial<TilingSplitNode>,
  first: TilingLayoutNode,
  second: TilingLayoutNode,
): TilingSplitNode {
  return {
    kind: "split",
    id: "root",
    axis: "horizontal",
    ratio: 0.5,
    layoutMode: "master",
    first,
    second,
    ...overrides,
  };
}

const GAP_FREE_CONFIG: TilingLayoutConfig = { gapPx: 0, minPaneSizePx: 0, handleSizePx: 0 };

function byId(footprints: ReadonlyArray<TilingLeafFootprint>): Map<string, TilingLeafFootprint> {
  return new Map(
    footprints.map((footprint: TilingLeafFootprint): [string, TilingLeafFootprint] => [footprint.leafId, footprint]),
  );
}

describe("collectMasterSlots (descendant non-split flattening)", (): void => {
  it("returns a single leaf as its own slot", (): void => {
    expect(collectMasterSlots(leaf("A")).map((node: TilingLayoutNode): string => node.id)).toEqual(["A"]);
  });

  it("flattens a nested binary tree into reading-order slots", (): void => {
    const tree: TilingLayoutNode = hsplit(0.5, hsplit(0.5, leaf("A"), leaf("B")), hsplit(0.5, leaf("C"), leaf("D")));
    expect(collectMasterSlots(tree).map((node: TilingLayoutNode): string => node.id)).toEqual(["A", "B", "C", "D"]);
  });
});

describe("slotRepresentativeLeafId", (): void => {
  it("is the leaf id for a leaf slot", (): void => {
    expect(slotRepresentativeLeafId(leaf("A"))).toBe("A");
  });

  it("is the first descendant leaf for a split slot", (): void => {
    expect(slotRepresentativeLeafId(hsplit(0.5, leaf("X"), leaf("Y")))).toBe("X");
  });
});

describe("resolveMasterParams (defaulting + clamping)", (): void => {
  it("defaults count=1, orientation=left, ratio=clamp(node.ratio)", (): void => {
    const params: MasterStackParams = resolveMasterParams(master({ ratio: 0.5 }, leaf("A"), leaf("B")), 2);
    expect(params).toEqual({ count: 1, orientation: "left", ratio: 0.5 });
  });

  it("clamps the requested master count into [1, slotCount]", (): void => {
    expect(resolveMasterParams(master({ masterCount: 9 }, leaf("A"), leaf("B")), 2).count).toBe(2);
    expect(resolveMasterParams(master({ masterCount: 0 }, leaf("A"), leaf("B")), 2).count).toBe(1);
  });

  it("clamps the master ratio into [0.05, 0.95]", (): void => {
    expect(resolveMasterParams(master({ ratio: 1.5 }, leaf("A"), leaf("B")), 2).ratio).toBe(0.95);
    expect(resolveMasterParams(master({ ratio: -1 }, leaf("A"), leaf("B")), 2).ratio).toBe(0.05);
  });

  it("falls back to 0.5 for a non-finite ratio", (): void => {
    expect(resolveMasterParams(master({ ratio: Number.NaN }, leaf("A"), leaf("B")), 2).ratio).toBe(0.5);
  });
});

describe("resolveMasterStackFootprints (master area + stack)", (): void => {
  const slots: ReadonlyArray<TilingLayoutNode> = [leaf("A"), leaf("B"), leaf("C")];

  it("returns nothing for zero slots", (): void => {
    expect(resolveMasterStackFootprints([], 0, 0, 1000, 800, GAP_FREE_CONFIG, { count: 1, orientation: "left", ratio: 0.5 })).toEqual([]);
  });

  it("left orientation: master column on the left, stack column on the right, members stacked vertically", (): void => {
    const params: MasterStackParams = { count: 1, orientation: "left", ratio: 0.6 };
    const map = byId(resolveMasterStackFootprints(slots, 0, 0, 1000, 900, GAP_FREE_CONFIG, params));
    // master = single tile fills the 600px-wide left column, full height
    expect(map.get("A")).toEqual({ leafId: "A", left: 0, top: 0, width: 600, height: 900 });
    // stack = B,C split the 400px-wide right column vertically in half
    expect(map.get("B")).toEqual({ leafId: "B", left: 600, top: 0, width: 400, height: 450 });
    expect(map.get("C")).toEqual({ leafId: "C", left: 600, top: 450, width: 400, height: 450 });
  });

  it("right orientation: master column on the right", (): void => {
    const params: MasterStackParams = { count: 1, orientation: "right", ratio: 0.6 };
    const map = byId(resolveMasterStackFootprints(slots, 0, 0, 1000, 900, GAP_FREE_CONFIG, params));
    // master width = 600 → sits on the right: stackWidth = 400 on the left
    expect(map.get("A")).toEqual({ leafId: "A", left: 400, top: 0, width: 600, height: 900 });
    expect(map.get("B")).toEqual({ leafId: "B", left: 0, top: 0, width: 400, height: 450 });
    expect(map.get("C")).toEqual({ leafId: "C", left: 0, top: 450, width: 400, height: 450 });
  });

  it("top orientation: master row on top, stack row below, members side-by-side", (): void => {
    const params: MasterStackParams = { count: 1, orientation: "top", ratio: 0.5 };
    const map = byId(resolveMasterStackFootprints(slots, 0, 0, 1000, 800, GAP_FREE_CONFIG, params));
    expect(map.get("A")).toEqual({ leafId: "A", left: 0, top: 0, width: 1000, height: 400 });
    expect(map.get("B")).toEqual({ leafId: "B", left: 0, top: 400, width: 500, height: 400 });
    expect(map.get("C")).toEqual({ leafId: "C", left: 500, top: 400, width: 500, height: 400 });
  });

  it("bottom orientation: master row on the bottom", (): void => {
    const params: MasterStackParams = { count: 1, orientation: "bottom", ratio: 0.5 };
    const map = byId(resolveMasterStackFootprints(slots, 0, 0, 1000, 800, GAP_FREE_CONFIG, params));
    expect(map.get("A")).toEqual({ leafId: "A", left: 0, top: 400, width: 1000, height: 400 });
    expect(map.get("B")).toEqual({ leafId: "B", left: 0, top: 0, width: 500, height: 400 });
    expect(map.get("C")).toEqual({ leafId: "C", left: 500, top: 0, width: 500, height: 400 });
  });

  it("multiple masters share the master area, stacked along the within-axis", (): void => {
    const params: MasterStackParams = { count: 2, orientation: "left", ratio: 0.5 };
    const map = byId(resolveMasterStackFootprints(slots, 0, 0, 1000, 800, GAP_FREE_CONFIG, params));
    // 2 masters split the 500px left column vertically; single stack member fills the right
    expect(map.get("A")).toEqual({ leafId: "A", left: 0, top: 0, width: 500, height: 400 });
    expect(map.get("B")).toEqual({ leafId: "B", left: 0, top: 400, width: 500, height: 400 });
    expect(map.get("C")).toEqual({ leafId: "C", left: 500, top: 0, width: 500, height: 800 });
  });

  it("no-stack case (count >= slotCount): all slots fill the container along the within-axis", (): void => {
    const params: MasterStackParams = { count: 3, orientation: "left", ratio: 0.5 };
    const map = byId(resolveMasterStackFootprints(slots, 0, 0, 600, 900, GAP_FREE_CONFIG, params));
    expect(map.get("A")).toEqual({ leafId: "A", left: 0, top: 0, width: 600, height: 300 });
    expect(map.get("B")).toEqual({ leafId: "B", left: 0, top: 300, width: 600, height: 300 });
    expect(map.get("C")).toEqual({ leafId: "C", left: 0, top: 600, width: 600, height: 300 });
  });

  it("reserves gaps between adjacent slots within an area", (): void => {
    const params: MasterStackParams = { count: 1, orientation: "left", ratio: 0.5 };
    const gapped: TilingLayoutConfig = { gapPx: 20, minPaneSizePx: 0, handleSizePx: 0 };
    const map = byId(resolveMasterStackFootprints([leaf("A"), leaf("B"), leaf("C")], 0, 0, 1000, 900, gapped, params));
    // availableWidth = 1000 - 20 = 980 → master 490, stack 490 (left col offset by master+gap)
    expect(map.get("A")?.width).toBeCloseTo(490);
    expect(map.get("B")?.left).toBeCloseTo(510);
    // stack B,C split 900 height with one 20px gap: each (900-20)/2 = 440
    expect(map.get("B")?.height).toBeCloseTo(440);
    expect(map.get("C")?.top).toBeCloseTo(460);
  });

  it("preserves total area coverage (master ratio partitions exactly, gap-free)", (): void => {
    const params: MasterStackParams = { count: 1, orientation: "left", ratio: 0.42 };
    const map = byId(resolveMasterStackFootprints(slots, 0, 0, 1000, 800, GAP_FREE_CONFIG, params));
    const masterArea: number = (map.get("A")?.width ?? 0) * (map.get("A")?.height ?? 0);
    const stackArea: number =
      (map.get("B")?.width ?? 0) * (map.get("B")?.height ?? 0) +
      (map.get("C")?.width ?? 0) * (map.get("C")?.height ?? 0);
    expect(masterArea + stackArea).toBeCloseTo(1000 * 800);
  });
});

describe("collectLeafFootprints — master-mode arm", (): void => {
  it("a master split flattens its binary descendants and lays them out master/stack", (): void => {
    // Binary structure: ((A,B),(C,D)) but layoutMode master → flat [A,B,C,D]
    const tree: TilingSplitNode = master(
      { masterCount: 1, masterOrientation: "left", ratio: 0.5 },
      hsplit(0.5, leaf("A"), leaf("B")),
      hsplit(0.5, leaf("C"), leaf("D")),
    );
    const map = byId(collectLeafFootprints(tree, 0, 0, 1000, 900, GAP_FREE_CONFIG));
    // master A fills the 500px left column; stack B,C,D split the right column in thirds
    expect(map.get("A")).toEqual({ leafId: "A", left: 0, top: 0, width: 500, height: 900 });
    expect(map.get("B")).toEqual({ leafId: "B", left: 500, top: 0, width: 500, height: 300 });
    expect(map.get("C")).toEqual({ leafId: "C", left: 500, top: 300, width: 500, height: 300 });
    expect(map.get("D")).toEqual({ leafId: "D", left: 500, top: 600, width: 500, height: 300 });
  });

  it("a dwindle split (no layoutMode) keeps the recursive binary geometry", (): void => {
    const tree: TilingSplitNode = hsplit(0.5, leaf("A"), leaf("B"));
    const map = byId(collectLeafFootprints(tree, 0, 0, 1000, 800, GAP_FREE_CONFIG));
    expect(map.get("A")).toEqual({ leafId: "A", left: 0, top: 0, width: 500, height: 800 });
    expect(map.get("B")).toEqual({ leafId: "B", left: 500, top: 0, width: 500, height: 800 });
  });

  it("every leaf in a master subtree gets exactly one footprint", (): void => {
    const tree: TilingSplitNode = master(
      { masterCount: 2, masterOrientation: "top" },
      hsplit(0.5, leaf("A"), leaf("B")),
      hsplit(0.5, leaf("C"), leaf("D")),
    );
    const footprints = collectLeafFootprints(tree, 0, 0, 1000, 800, GAP_FREE_CONFIG);
    expect(footprints.map((fp: TilingLeafFootprint): string => fp.leafId).sort()).toEqual(["A", "B", "C", "D"]);
  });
});
