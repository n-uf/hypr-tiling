import { describe, expect, it } from "@jest/globals";
import {
  collectLeafFootprints,
  collectNormalizedLeafRects,
  footprintsByLeafId,
  isFootprintChanged,
  type TilingLeafFootprint,
  type LeafRect,
} from "../engine/leaf-geometry";
import { insertLeafAdjacent } from "../engine/state";
import type {
  TilingLayoutConfig,
  TilingLayoutNode,
  TilingLeafNode,
  TilingMinBBoxPx,
  TilingSplitNode,
  TilingPaneSizing,
} from "../engine/types";

function leaf(id: string, sizing?: TilingPaneSizing, minBBoxPx?: TilingMinBBoxPx): TilingLeafNode {
  const node: TilingLeafNode = { kind: "leaf", id, tileId: `tile-${id}` };
  if (sizing != null) {
    node.sizing = sizing;
  }
  if (minBBoxPx != null) {
    node.minBBoxPx = minBBoxPx;
  }
  return node;
}

function hsplit(
  ratio: number,
  first: TilingLayoutNode,
  second: TilingLayoutNode,
  minPaneSizePx?: number,
): TilingSplitNode {
  return {
    kind: "split",
    id: `h-${first.id}-${second.id}`,
    axis: "horizontal",
    ratio,
    first,
    second,
    minPaneSizePx,
  };
}

function vsplit(
  ratio: number,
  first: TilingLayoutNode,
  second: TilingLayoutNode,
  minPaneSizePx?: number,
): TilingSplitNode {
  return {
    kind: "split",
    id: `v-${first.id}-${second.id}`,
    axis: "vertical",
    ratio,
    first,
    second,
    minPaneSizePx,
  };
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
  it("gives a pinned static-width child its exact px, reserves gapPx+handleSizePx, and fills the sibling", (): void => {
    // sidebar static-width pinned 200; main flexible. Horizontal split → width is along-axis.
    // Boundary gutter = gapPx(10) + handleSizePx(4) = 14 — same total as a flexible divider.
    const layout: TilingLayoutNode = hsplit(0.5, leaf("sidebar", { width: "static", widthPx: 200 }), leaf("main"));
    const map = byId(collectLeafFootprints(layout, 0, 0, 1000, 800, GAPPED_CONFIG));
    expect(map.get("sidebar")).toEqual({ leafId: "sidebar", left: 0, top: 0, width: 200, height: 800 });
    expect(map.get("main")).toEqual({ leafId: "main", left: 214, top: 0, width: 786, height: 800 });
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

  it("falls back to ratio when pin fits the raw container but not pin+gutter", (): void => {
    // pin 990 + gutter 14 = 1004 > 1000 → ratio, not a crushed flexible sibling.
    const layout: TilingLayoutNode = hsplit(0.5, leaf("sidebar", { width: "static", widthPx: 990 }), leaf("main"));
    const map = byId(collectLeafFootprints(layout, 0, 0, 1000, 800, GAPPED_CONFIG));
    expect(map.get("sidebar")?.width).toBeCloseTo(500 - 7);
    expect(map.get("main")?.width).toBeCloseTo(500 - 7);
  });

  it("falls back to ratio for an UNPINNED static-along-axis child (px unknowable)", (): void => {
    const layout: TilingLayoutNode = hsplit(0.6, leaf("sidebar", { width: "static" }), leaf("main"));
    const map = byId(collectLeafFootprints(layout, 0, 0, 1000, 800, GAP_FREE_CONFIG));
    expect(map.get("sidebar")?.width).toBeCloseTo(600);
    expect(map.get("main")?.width).toBeCloseTo(400);
  });

  it("ignores a CROSS-axis static pin for along-axis distribution, but shrinks its cross extent to the pin", (): void => {
    // height static on a horizontal split is a CROSS-axis pin → width stays
    // ratio, but height content-sizes to the pin (mirrors the renderer's
    // `align-self: flex-start`) instead of stretching to the full container —
    // no phantom full-height rect behind a content-sized DOM box.
    const layout: TilingLayoutNode = hsplit(0.5, leaf("A", { height: "static", heightPx: 100 }), leaf("B"));
    const map = byId(collectLeafFootprints(layout, 0, 0, 1000, 800, GAP_FREE_CONFIG));
    expect(map.get("A")?.width).toBe(500);
    expect(map.get("B")?.width).toBe(500);
    expect(map.get("A")?.height).toBe(100);
    expect(map.get("B")?.height).toBe(800);
  });

  it("ignores a non-fitting CROSS-axis pin (falls back to the full cross extent)", (): void => {
    const layout: TilingLayoutNode = hsplit(0.5, leaf("A", { height: "static", heightPx: -5 }), leaf("B"));
    const map = byId(collectLeafFootprints(layout, 0, 0, 1000, 800, GAP_FREE_CONFIG));
    expect(map.get("A")?.height).toBe(800);
  });

  it("shrinks the cross extent for a static-along-axis child that is ALSO cross-axis-static", (): void => {
    // sidebar: width static (along-axis, horizontal split) AND height static
    // (cross-axis) — both pins apply independently.
    const layout: TilingLayoutNode = hsplit(
      0.5,
      leaf("sidebar", { width: "static", widthPx: 200, height: "static", heightPx: 150 }),
      leaf("main"),
    );
    const map = byId(collectLeafFootprints(layout, 0, 0, 1000, 800, GAP_FREE_CONFIG));
    expect(map.get("sidebar")).toEqual({ leafId: "sidebar", left: 0, top: 0, width: 200, height: 150 });
    expect(map.get("main")).toEqual({ leafId: "main", left: 200, top: 0, width: 800, height: 800 });
  });
});

describe("collectLeafFootprints — multi-static composite (nested W• pins + gaps)", (): void => {
  // Annotate-shaped tree: cases(static) | [document(flex) | review(static)].
  // Each inter-pane boundary reserves gapPx+handleSizePx; statics keep exact pins;
  // the flexible middle absorbs the remainder after BOTH gutters + BOTH pins.
  const ANNOTATE_LIKE: TilingLayoutNode = hsplit(
    0.18,
    leaf("cases", { width: "static", widthPx: 256 }),
    hsplit(0.66, leaf("document"), leaf("review", { width: "static", widthPx: 384 })),
  );

  it("honors both pinned widths and reserves a full gutter on every boundary", (): void => {
    const gutter: number = GAPPED_CONFIG.gapPx + GAPPED_CONFIG.handleSizePx; // 14
    const map = byId(collectLeafFootprints(ANNOTATE_LIKE, 0, 0, 1200, 800, GAPPED_CONFIG));

    expect(map.get("cases")).toEqual({ leafId: "cases", left: 0, top: 0, width: 256, height: 800 });
    expect(map.get("review")).toEqual({
      leafId: "review",
      left: 1200 - 384,
      top: 0,
      width: 384,
      height: 800,
    });
    const document = map.get("document");
    expect(document).toBeDefined();
    expect(document?.left).toBe(256 + gutter);
    expect(document?.width).toBe(1200 - 256 - gutter - gutter - 384);
    expect(document?.left! + document?.width! + gutter).toBe(map.get("review")!.left);

    // Invariant: leaf extents + all inter-pane gutters reconstruct the container.
    const leafWidths: number =
      map.get("cases")!.width + map.get("document")!.width + map.get("review")!.width;
    expect(leafWidths + 2 * gutter).toBe(1200);
  });

  it("fit-guards an inner static against the FILL remainder, not the outer container", (): void => {
    // Outer pin 256 + gutter 14 leaves 330 for the inner split. Inner review pin
    // 320 + gutter 14 = 334 does NOT fit 330 — must fall back to ratio inside the
    // fill region (the multi-static defect used to fit-guard against the outer
    // 600 and overflow the fill).
    const tight: TilingLayoutNode = hsplit(
      0.18,
      leaf("cases", { width: "static", widthPx: 256 }),
      hsplit(0.5, leaf("document"), leaf("review", { width: "static", widthPx: 320 })),
    );
    const gutter: number = GAPPED_CONFIG.gapPx + GAPPED_CONFIG.handleSizePx;
    const map = byId(collectLeafFootprints(tight, 0, 0, 600, 800, GAPPED_CONFIG));
    const fillWidth: number = 600 - 256 - gutter; // 330
    expect(map.get("cases")?.width).toBe(256);
    // Inner fell back to ratio inside the fill region (offset 7 each side).
    expect(map.get("document")?.width).toBeCloseTo(fillWidth * 0.5 - 7);
    expect(map.get("review")?.width).toBeCloseTo(fillWidth * 0.5 - 7);
    expect(map.get("document")?.left).toBe(256 + gutter);
  });

  it("chains two leading static widths with gutters before a flexible tail", (): void => {
    const layout: TilingLayoutNode = hsplit(
      0.5,
      leaf("A", { width: "static", widthPx: 200 }),
      hsplit(0.5, leaf("B", { width: "static", widthPx: 200 }), leaf("C")),
    );
    const gutter: number = GAPPED_CONFIG.gapPx + GAPPED_CONFIG.handleSizePx;
    const map = byId(collectLeafFootprints(layout, 0, 0, 1000, 800, GAPPED_CONFIG));
    expect(map.get("A")).toMatchObject({ left: 0, width: 200 });
    expect(map.get("B")).toMatchObject({ left: 200 + gutter, width: 200 });
    expect(map.get("C")).toMatchObject({
      left: 200 + gutter + 200 + gutter,
      width: 1000 - 400 - 2 * gutter,
    });
    expect(
      map.get("A")!.width + map.get("B")!.width + map.get("C")!.width + 2 * gutter,
    ).toBe(1000);
  });
});

describe("collectLeafFootprints — leaf-scoped minBBoxPx floor (HT-MIN-BBOX-PX)", (): void => {
  // Opts into "body" explicitly: HT-MIN-BBOX-PX is the body-floor precedence
  // chain specifically, so these assertions need the pre-HT-RESIZE-FLOOR-DEFAULT
  // floor rather than the library's chrome default.
  const MIN_PANE_CONFIG: TilingLayoutConfig = {
    gapPx: 0,
    minPaneSizePx: 96,
    handleSizePx: 0,
    resizeFloor: "body",
  };

  it("clamps the along-axis ratio to the leaf's own minBBoxPx floor, overriding a skewed ratio", (): void => {
    const review = leaf("review", undefined, { widthPx: 300 });
    // ratio 0.98 (first/document dominant) would otherwise push review (second)
    // to ~20px — review's own floor wins the upper ratio bound instead.
    const layout = hsplit(0.98, leaf("document"), review);
    const map = byId(collectLeafFootprints(layout, 0, 0, 1000, 800, MIN_PANE_CONFIG));
    expect(map.get("review")?.width).toBeCloseTo(300);
    expect(map.get("document")?.width).toBeCloseTo(700);
  });

  it("reads heightPx (not widthPx) for a vertical split's along-axis floor", (): void => {
    const review = leaf("review", undefined, { heightPx: 250 });
    // ratio 0.02 (review is first/top) would otherwise push review to ~16px.
    const layout = vsplit(0.02, review, leaf("bottom"));
    const map = byId(collectLeafFootprints(layout, 0, 0, 1000, 800, MIN_PANE_CONFIG));
    expect(map.get("review")?.height).toBeCloseTo(250);
  });

  it("the leaf floor TRAVELS WITH the pane across a rearrange (insertLeafAdjacent re-parent)", (): void => {
    const review = leaf("review", undefined, { widthPx: 300 });
    const before = hsplit(0.5, leaf("document"), review);
    // Re-parent review next to a brand-new sibling under a brand-new split id —
    // no split-level minPaneSizePx carries over, only the leaf's own minBBoxPx.
    const after = insertLeafAdjacent(before, "review", "document", "left") as TilingSplitNode;
    expect(after.first.kind === "leaf" ? after.first.id : null).toBe("review");
    // Skew the stored ratio so only the leaf's own floor can save it.
    const rearranged: TilingSplitNode = { ...after, ratio: 0.01 };
    const map = byId(collectLeafFootprints(rearranged, 0, 0, 1000, 800, MIN_PANE_CONFIG));
    expect(map.get("review")?.width).toBeCloseTo(300);
  });

  it("a direct-child split/group (no leaf floor) falls back to split.minPaneSizePx, which wins over config", (): void => {
    const layout = hsplit(0.02, leaf("A"), leaf("B"), 150);
    const map = byId(collectLeafFootprints(layout, 0, 0, 1000, 800, MIN_PANE_CONFIG));
    expect(map.get("A")?.width).toBeCloseTo(150);
  });

  it("falls back to config.minPaneSizePx when neither the leaf nor the split declare a floor", (): void => {
    const layout = hsplit(0.02, leaf("A"), leaf("B"));
    const map = byId(collectLeafFootprints(layout, 0, 0, 1000, 800, MIN_PANE_CONFIG));
    expect(map.get("A")?.width).toBeCloseTo(96);
  });

  it("resolves each side independently: a leafless side keeps the split floor while its sibling keeps its own minBBoxPx", (): void => {
    const review = leaf("review", undefined, { widthPx: 300 });
    const layout = hsplit(0.99, leaf("document"), review, 40);
    const map = byId(collectLeafFootprints(layout, 0, 0, 1000, 800, MIN_PANE_CONFIG));
    // boundedMax = 1 - 300/1000 = 0.7 → review's OWN floor wins the upper bound,
    // not the split's weaker 40px (which would allow ratio up to 0.96).
    expect(map.get("review")?.width).toBeCloseTo(300);
    expect(map.get("document")?.width).toBeCloseTo(700);
  });
});

describe("collectLeafFootprints — resizeFloor chrome size-out (HT-RESIZE-FLOOR)", (): void => {
  const MIN_PANE_CONFIG: TilingLayoutConfig = { gapPx: 0, minPaneSizePx: 96, handleSizePx: 0 };

  it("a chrome-floor leaf can shrink below the default 5% ratio safety net", (): void => {
    const chromeLeaf = leaf("review", undefined);
    chromeLeaf.resizeFloor = "chrome";
    const layout = hsplit(0.99, leaf("document"), chromeLeaf);
    const config: TilingLayoutConfig = { ...MIN_PANE_CONFIG, collapsedExtentPx: 35 };
    // container 2000: a plain body floor (96px = 4.8%) would already be under
    // the 5% net and get raised to 100px. Chrome mode replaces AND unbounds.
    const map = byId(collectLeafFootprints(layout, 0, 0, 2000, 800, config));
    expect(map.get("review")?.width).toBeCloseTo(35);
    expect(map.get("document")?.width).toBeCloseTo(1965);
  });

  it("chrome mode never sets collapsed — geometry-only, state untouched", (): void => {
    const chromeLeaf = leaf("review", undefined);
    chromeLeaf.resizeFloor = "chrome";
    const layout = hsplit(0.99, leaf("document"), chromeLeaf);
    collectLeafFootprints(layout, 0, 0, 2000, 800, { ...MIN_PANE_CONFIG, collapsedExtentPx: 35 });
    expect(chromeLeaf.collapsed).toBeUndefined();
    expect(chromeLeaf.sizing).toBeUndefined();
  });

  it("chrome mode REPLACES (does not layer on top of) the leaf's own minBBoxPx", (): void => {
    const chromeLeaf = leaf("review", undefined, { widthPx: 300 });
    chromeLeaf.resizeFloor = "chrome";
    const layout = hsplit(0.99, leaf("document"), chromeLeaf);
    const map = byId(
      collectLeafFootprints(layout, 0, 0, 2000, 800, { ...MIN_PANE_CONFIG, collapsedExtentPx: 35 }),
    );
    // Would be 300 in body mode — chrome mode overrides to 35.
    expect(map.get("review")?.width).toBeCloseTo(35);
  });

  it("config.resizeFloor: \"chrome\" applies library-wide without a per-leaf override", (): void => {
    const layout = hsplit(0.99, leaf("document"), leaf("review"));
    const config: TilingLayoutConfig = {
      ...MIN_PANE_CONFIG,
      resizeFloor: "chrome",
      collapsedExtentPx: 35,
    };
    const map = byId(collectLeafFootprints(layout, 0, 0, 2000, 800, config));
    expect(map.get("review")?.width).toBeCloseTo(35);
  });

  it("stays flexible/ratio-based (re-grows with the container) rather than pinning static", (): void => {
    const chromeLeaf = leaf("review", undefined);
    chromeLeaf.resizeFloor = "chrome";
    const narrow = hsplit(0.99, leaf("document"), chromeLeaf);
    const config: TilingLayoutConfig = { ...MIN_PANE_CONFIG, collapsedExtentPx: 35 };
    const atNarrowContainer = byId(collectLeafFootprints(narrow, 0, 0, 2000, 800, config));
    expect(atNarrowContainer.get("review")?.width).toBeCloseTo(35);
    // Grow the container while keeping the SAME stored ratio (0.99) — the
    // review pane re-grows proportionally, unlike a static px pin.
    const atWiderContainer = byId(collectLeafFootprints(narrow, 0, 0, 4000, 800, config));
    expect(atWiderContainer.get("review")?.width).toBeCloseTo(40);
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
