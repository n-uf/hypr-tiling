import { describe, expect, it } from "@jest/globals";
import {
  collectLeafFootprints,
  collectNormalizedLeafRects,
  footprintsByLeafId,
  isFootprintChanged,
  type TilingLeafFootprint,
  type LeafRect,
} from "../engine/leaf-geometry";
import type {
  TilingLayoutConfig,
  TilingLayoutNode,
  TilingLeafNode,
  TilingSplitNode,
  TilingPaneSizing,
} from "../engine/types";

function leaf(id: string, sizing?: TilingPaneSizing): TilingLeafNode {
  return sizing == null
    ? { kind: "leaf", id, tileId: `tile-${id}` }
    : { kind: "leaf", id, tileId: `tile-${id}`, sizing };
}

function hsplit(ratio: number, first: TilingLayoutNode, second: TilingLayoutNode): TilingSplitNode {
  return { kind: "split", id: `h-${first.id}-${second.id}`, axis: "horizontal", ratio, first, second };
}

function vsplit(ratio: number, first: TilingLayoutNode, second: TilingLayoutNode): TilingSplitNode {
  return { kind: "split", id: `v-${first.id}-${second.id}`, axis: "vertical", ratio, first, second };
}

const GAP_FREE_CONFIG: TilingLayoutConfig = { gapPx: 0, minPaneSizePx: 0, handleSizePx: 0 };
const GAPPED_CONFIG: TilingLayoutConfig = { gapPx: 10, minPaneSizePx: 0, handleSizePx: 4 };

function byId(footprints: ReadonlyArray<TilingLeafFootprint>): Map<string, TilingLeafFootprint> {
  return new Map(footprints.map((footprint: TilingLeafFootprint): [string, TilingLeafFootprint] => [footprint.leafId, footprint]));
}

describe("collectLeafFootprints — flexible (ratio) parity", (): void => {
  it("distributes a horizontal split by ratio, gap-free", (): void => {
    const layout: TilingLayoutNode = hsplit(0.5, leaf("A"), leaf("B"));
    const map = byId(collectLeafFootprints(layout, 0, 0, 1000, 800, GAP_FREE_CONFIG));
    expect(map.get("A")).toEqual({ leafId: "A", left: 0, top: 0, width: 500, height: 800 });
    expect(map.get("B")).toEqual({ leafId: "B", left: 500, top: 0, width: 500, height: 800 });
  });

  it("subtracts the splitter/gap offset on a flexible boundary", (): void => {
    const layout: TilingLayoutNode = hsplit(0.5, leaf("A"), leaf("B"));
    const map = byId(collectLeafFootprints(layout, 0, 0, 1000, 800, GAPPED_CONFIG));
    // splitGapOffsetPx = (10 + 4) / 2 = 7
    expect(map.get("A")?.width).toBeCloseTo(500 - 7);
    expect(map.get("B")?.left).toBeCloseTo(500 + 7);
    expect(map.get("B")?.width).toBeCloseTo(500 - 7);
  });

  it("recurses nested splits", (): void => {
    const layout: TilingLayoutNode = hsplit(0.5, vsplit(0.5, leaf("A"), leaf("B")), leaf("C"));
    const map = byId(collectLeafFootprints(layout, 0, 0, 1000, 800, GAP_FREE_CONFIG));
    expect(map.get("A")).toEqual({ leafId: "A", left: 0, top: 0, width: 500, height: 400 });
    expect(map.get("B")).toEqual({ leafId: "B", left: 0, top: 400, width: 500, height: 400 });
    expect(map.get("C")).toEqual({ leafId: "C", left: 500, top: 0, width: 500, height: 800 });
  });
});

describe("collectLeafFootprints — static-aware (pinned along-axis child)", (): void => {
  it("gives a pinned static-width child its exact px and the flexible sibling the remainder (no gap)", (): void => {
    // sidebar static-width pinned 200; main flexible. Horizontal split → width is along-axis.
    const layout: TilingLayoutNode = hsplit(0.5, leaf("sidebar", { width: "static", widthPx: 200 }), leaf("main"));
    const map = byId(collectLeafFootprints(layout, 0, 0, 1000, 800, GAPPED_CONFIG));
    expect(map.get("sidebar")).toEqual({ leafId: "sidebar", left: 0, top: 0, width: 200, height: 800 });
    // sibling FILLS the remainder; no splitter gap reserved on a static boundary.
    expect(map.get("main")).toEqual({ leafId: "main", left: 200, top: 0, width: 800, height: 800 });
  });

  it("honors a pinned static-height child on a vertical split", (): void => {
    const layout: TilingLayoutNode = vsplit(0.5, leaf("top"), leaf("bottom", { height: "static", heightPx: 150 }));
    const map = byId(collectLeafFootprints(layout, 0, 0, 1000, 800, GAP_FREE_CONFIG));
    expect(map.get("bottom")).toEqual({ leafId: "bottom", left: 0, top: 650, width: 1000, height: 150 });
    expect(map.get("top")).toEqual({ leafId: "top", left: 0, top: 0, width: 1000, height: 650 });
  });

  it("keeps the flexible sibling's own ratio subtree correct next to a pinned static pane", (): void => {
    const layout: TilingLayoutNode = hsplit(
      0.5,
      leaf("sidebar", { width: "static", widthPx: 200 }),
      vsplit(0.5, leaf("X"), leaf("Y")),
    );
    const map = byId(collectLeafFootprints(layout, 0, 0, 1000, 800, GAP_FREE_CONFIG));
    expect(map.get("sidebar")?.width).toBe(200);
    // main region fills 800px wide; X/Y split it vertically.
    expect(map.get("X")).toEqual({ leafId: "X", left: 200, top: 0, width: 800, height: 400 });
    expect(map.get("Y")).toEqual({ leafId: "Y", left: 200, top: 400, width: 800, height: 400 });
  });

  it("falls back to ratio when a static pin does not fit the container (fit-guard)", (): void => {
    // pin 2000 > axis container 1000 → cannot honor → ratio distribution instead.
    const layout: TilingLayoutNode = hsplit(0.5, leaf("sidebar", { width: "static", widthPx: 2000 }), leaf("main"));
    const map = byId(collectLeafFootprints(layout, 0, 0, 1000, 800, GAP_FREE_CONFIG));
    expect(map.get("sidebar")?.width).toBe(500);
    expect(map.get("main")?.width).toBe(500);
  });

  it("falls back to ratio for an UNPINNED static-along-axis child (px unknowable)", (): void => {
    const layout: TilingLayoutNode = hsplit(0.6, leaf("sidebar", { width: "static" }), leaf("main"));
    const map = byId(collectLeafFootprints(layout, 0, 0, 1000, 800, GAP_FREE_CONFIG));
    expect(map.get("sidebar")?.width).toBeCloseTo(600);
    expect(map.get("main")?.width).toBeCloseTo(400);
  });

  it("ignores a CROSS-axis static pin for along-axis distribution", (): void => {
    // height static on a horizontal split is a CROSS-axis pin → width stays ratio.
    const layout: TilingLayoutNode = hsplit(0.5, leaf("A", { height: "static", heightPx: 100 }), leaf("B"));
    const map = byId(collectLeafFootprints(layout, 0, 0, 1000, 800, GAP_FREE_CONFIG));
    expect(map.get("A")?.width).toBe(500);
    expect(map.get("B")?.width).toBe(500);
  });
});

describe("collectNormalizedLeafRects — directional-neighbor wrapper", (): void => {
  it("returns unit 0..1 edge-rects matching pure ratio splits", (): void => {
    const layout: TilingLayoutNode = hsplit(0.5, vsplit(0.5, leaf("A"), leaf("B")), leaf("C"));
    const rects: ReadonlyArray<LeafRect> = collectNormalizedLeafRects(layout);
    const map = new Map(rects.map((rect: LeafRect): [string, LeafRect] => [rect.leafId, rect]));
    expect(map.get("A")).toEqual({ leafId: "A", left: 0, top: 0, right: 0.5, bottom: 0.5 });
    expect(map.get("B")).toEqual({ leafId: "B", left: 0, top: 0.5, right: 0.5, bottom: 1 });
    expect(map.get("C")).toEqual({ leafId: "C", left: 0.5, top: 0, right: 1, bottom: 1 });
  });

  it("ignores px pins in unit space (a px pin cannot fit a 1-unit container)", (): void => {
    // The static pin is undefined against a 1-unit container → pure ratio, so
    // directional focus stays purely topological (identical to the old rects).
    const layout: TilingLayoutNode = hsplit(0.5, leaf("sidebar", { width: "static", widthPx: 200 }), leaf("main"));
    const map = new Map(
      collectNormalizedLeafRects(layout).map((rect: LeafRect): [string, LeafRect] => [rect.leafId, rect]),
    );
    expect(map.get("sidebar")?.right).toBe(0.5);
    expect(map.get("main")?.left).toBe(0.5);
  });
});

describe("footprintsByLeafId / isFootprintChanged", (): void => {
  it("keys footprints by leaf id, stripping the leafId field", (): void => {
    const layout: TilingLayoutNode = hsplit(0.5, leaf("A"), leaf("B"));
    const map = footprintsByLeafId(collectLeafFootprints(layout, 0, 0, 1000, 800, GAP_FREE_CONFIG));
    expect(map.get("A")).toEqual({ left: 0, top: 0, width: 500, height: 800 });
  });

  it("treats sub-epsilon deltas as unchanged and larger deltas as changed", (): void => {
    const base = { left: 0, top: 0, width: 100, height: 100 };
    expect(isFootprintChanged(base, { ...base, left: 0.2 })).toBe(false);
    expect(isFootprintChanged(base, { ...base, width: 5 + 100 })).toBe(true);
  });
});
