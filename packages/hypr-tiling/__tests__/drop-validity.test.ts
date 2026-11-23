import { describe, expect, it } from "@jest/globals";
import {
  collectStaticGatedLeafIds,
  evaluateEdgeInsertCandidate,
  evaluateZoneCandidate,
} from "../engine/drop-validity";
import type {
  TilingLayoutConfig,
  TilingLayoutNode,
  TilingLeafNode,
  TilingPaneFootprint,
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

const CONFIG: TilingLayoutConfig = { gapPx: 8, minPaneSizePx: 40, handleSizePx: 4 };
const VIEWPORT_WIDTH: number = 1000;
const VIEWPORT_HEIGHT: number = 800;

describe("collectStaticGatedLeafIds — per-subtree drag gate", (): void => {
  it("gates nothing in an all-flexible tree", (): void => {
    const layout: TilingLayoutNode = hsplit(0.5, vsplit(0.5, leaf("A"), leaf("B")), leaf("C"));
    expect(collectStaticGatedLeafIds(layout).size).toBe(0);
  });

  it("gates ONLY the pinned static pane, leaving the flexible rest eligible (rule 1)", (): void => {
    // The motivating dashboard: a pinned fixed-size sidebar + flexible main area.
    const layout: TilingLayoutNode = hsplit(
      0.5,
      leaf("sidebar", { width: "static", widthPx: 200 }),
      vsplit(0.5, leaf("X"), leaf("Y")),
    );
    const gated: ReadonlySet<string> = collectStaticGatedLeafIds(layout);
    expect(gated.has("sidebar")).toBe(true);
    expect(gated.has("X")).toBe(false);
    expect(gated.has("Y")).toBe(false);
    expect(gated.size).toBe(1);
  });

  it("gates the WHOLE subtree under an UNPINNED static-along-axis child (rule 2)", (): void => {
    // sidebar is static-width but carries no pin → its split's distribution is
    // unknowable, so its flexible sibling subtree is gated too.
    const layout: TilingLayoutNode = hsplit(
      0.5,
      leaf("sidebar", { width: "static" }),
      vsplit(0.5, leaf("X"), leaf("Y")),
    );
    const gated: ReadonlySet<string> = collectStaticGatedLeafIds(layout);
    expect(gated.has("sidebar")).toBe(true);
    expect(gated.has("X")).toBe(true);
    expect(gated.has("Y")).toBe(true);
  });

  it("gates only the static leaf for a CROSS-axis static pin (sibling along-axis is ratio)", (): void => {
    // height-static on a horizontal split is a cross-axis pin → does not make the
    // split's along-axis (width) distribution unresolvable.
    const layout: TilingLayoutNode = hsplit(0.5, leaf("A", { height: "static", heightPx: 120 }), leaf("B"));
    const gated: ReadonlySet<string> = collectStaticGatedLeafIds(layout);
    expect(gated.has("A")).toBe(true);
    expect(gated.has("B")).toBe(false);
  });

  it("keeps a sibling flexible region eligible across an unrelated pinned-static split", (): void => {
    // root: [ left (pinned static sidebar + its flex sibling), right (flex X,Y) ]
    const layout: TilingLayoutNode = hsplit(
      0.5,
      hsplit(0.4, leaf("sidebar", { width: "static", widthPx: 150 }), leaf("content")),
      vsplit(0.5, leaf("X"), leaf("Y")),
    );
    const gated: ReadonlySet<string> = collectStaticGatedLeafIds(layout);
    expect([...gated]).toEqual(["sidebar"]);
  });

  it("does NOT gate a COLLAPSED leaf despite its collapse-pinned static height (HT-PANE-COLLAPSE drag fix, vertical parent)", (): void => {
    // A collapsed leaf under a STACKED (vertical) parent pins HEIGHT — the
    // along-axis dimension — to a KNOWN chrome extent (collapsedExtentPx), not
    // a content-sized/unknowable footprint. It must stay a drag source/target
    // exactly like an expanded flexible leaf.
    const collapsedLeaf: TilingLeafNode = {
      ...leaf("cases"),
      sizing: { height: "static", heightPx: 40 },
      collapsed: true,
    };
    const layout: TilingLayoutNode = vsplit(0.5, collapsedLeaf, leaf("main"));
    const gated: ReadonlySet<string> = collectStaticGatedLeafIds(layout);
    expect(gated.has("cases")).toBe(false);
    expect(gated.has("main")).toBe(false);
    expect(gated.size).toBe(0);
  });

  it("does NOT gate a COLLAPSED leaf despite its collapse-pinned static width (HT-PANE-COLLAPSE drag fix, horizontal parent)", (): void => {
    // Axis-aware collapse (HT-PANE-COLLAPSE-AXIS): under a SIDE-BY-SIDE
    // (horizontal) parent, collapse pins WIDTH — its along-axis dimension —
    // instead of height. The gate must exempt whichever dimension the parent
    // axis pinned, not hard-code one.
    const collapsedLeaf: TilingLeafNode = {
      ...leaf("cases"),
      sizing: { width: "static", widthPx: 40 },
      collapsed: true,
    };
    const layout: TilingLayoutNode = hsplit(0.5, collapsedLeaf, leaf("main"));
    const gated: ReadonlySet<string> = collectStaticGatedLeafIds(layout);
    expect(gated.has("cases")).toBe(false);
    expect(gated.has("main")).toBe(false);
    expect(gated.size).toBe(0);
  });

  it("still gates a collapsed leaf that ALSO carries a user-pinned static CROSS-axis lock (vertical parent → width lock)", (): void => {
    // Collapse only exempts the collapse-forced along-axis (HEIGHT) pin — a
    // separate, user-initiated static-width lock (the title-bar W• toggle) on
    // the CROSS axis still gates.
    const collapsedLockedLeaf: TilingLeafNode = {
      ...leaf("sidebar"),
      sizing: { width: "static", widthPx: 256, height: "static", heightPx: 40 },
      collapsed: true,
    };
    const layout: TilingLayoutNode = vsplit(0.5, collapsedLockedLeaf, leaf("main"));
    const gated: ReadonlySet<string> = collectStaticGatedLeafIds(layout);
    expect(gated.has("sidebar")).toBe(true);
  });

  it("still gates a collapsed leaf that ALSO carries a user-pinned static CROSS-axis lock (horizontal parent → height lock)", (): void => {
    // Mirror case: under a horizontal parent, collapse exempts the
    // collapse-forced along-axis (WIDTH) pin, but a separate static-height
    // lock (H• toggle) on the CROSS axis still gates.
    const collapsedLockedLeaf: TilingLeafNode = {
      ...leaf("sidebar"),
      sizing: { width: "static", widthPx: 40, height: "static", heightPx: 256 },
      collapsed: true,
    };
    const layout: TilingLayoutNode = hsplit(0.5, collapsedLockedLeaf, leaf("main"));
    const gated: ReadonlySet<string> = collectStaticGatedLeafIds(layout);
    expect(gated.has("sidebar")).toBe(true);
  });
});

describe("evaluateEdgeInsertCandidate — span + min-pane validity", (): void => {
  const targetFootprint: TilingPaneFootprint = { left: 0, top: 0, width: 500, height: 400 };
  const layout: TilingLayoutNode = hsplit(0.5, leaf("A"), leaf("B"));

  it("accepts an edge insert with adequate axis + cross span (source-less probe)", (): void => {
    const result = evaluateEdgeInsertCandidate({
      candidateZone: "left",
      layout,
      sourceLeafId: null,
      targetLeafId: "B",
      targetFootprint,
      config: CONFIG,
      viewportWidth: VIEWPORT_WIDTH,
      viewportHeight: VIEWPORT_HEIGHT,
      subject: "pane",
    });
    expect(result.isValid).toBe(true);
    expect(result.rejectionReason).toBeNull();
  });

  it("rejects when the target axis span cannot fit two panes + the splitter", (): void => {
    const result = evaluateEdgeInsertCandidate({
      candidateZone: "left",
      layout,
      sourceLeafId: null,
      targetLeafId: "B",
      targetFootprint: { left: 0, top: 0, width: 50, height: 400 },
      config: CONFIG,
      viewportWidth: VIEWPORT_WIDTH,
      viewportHeight: VIEWPORT_HEIGHT,
      subject: "pane",
    });
    expect(result.isValid).toBe(false);
    expect(result.rejectionReason).toContain("axis span");
  });

  it("rejects when the target cross span is below the per-pane minimum", (): void => {
    const result = evaluateEdgeInsertCandidate({
      candidateZone: "top",
      layout,
      sourceLeafId: null,
      targetLeafId: "B",
      targetFootprint: { left: 0, top: 0, width: 20, height: 400 },
      config: CONFIG,
      viewportWidth: VIEWPORT_WIDTH,
      viewportHeight: VIEWPORT_HEIGHT,
      subject: "pane",
    });
    expect(result.isValid).toBe(false);
    expect(result.rejectionReason).toContain("cross span");
  });

  it("validates the PROJECTED insert footprint against the min pane when a source is present", (): void => {
    const result = evaluateEdgeInsertCandidate({
      candidateZone: "left",
      layout,
      sourceLeafId: "A",
      targetLeafId: "B",
      targetFootprint,
      config: CONFIG,
      viewportWidth: VIEWPORT_WIDTH,
      viewportHeight: VIEWPORT_HEIGHT,
      subject: "pane",
    });
    // Big viewport, generous min → the projected A|B split clears the floor.
    expect(result.isValid).toBe(true);
  });
});

describe("evaluateEdgeInsertCandidate — span boundary and reasons", (): void => {
  const layout: TilingLayoutNode = hsplit(0.5, leaf("A"), vsplit(0.5, leaf("B"), leaf("C")));
  // A fractional gutter: 2 × 4 + 0.2 = 8.2 exactly; halving 8.2 and taking half the gutter comes out an ulp under 4.
  const fractional: TilingLayoutConfig = { gapPx: 0, handleSizePx: 0.2, minPaneSizePx: 4 };
  const evaluate = (sourceLeafId: string | null, footprint: TilingPaneFootprint, config: TilingLayoutConfig = fractional) =>
    evaluateEdgeInsertCandidate({ candidateZone: "left", layout, sourceLeafId, targetLeafId: "B", targetFootprint: footprint, config, viewportWidth: 1000, viewportHeight: 700, subject: "pane" });

  it("accepts a target exactly two minimums plus the gutter wide, with and without a source", (): void => {
    for (const sourceLeafId of ["A", null]) {
      expect(evaluate(sourceLeafId, { left: 0, top: 0, width: 8.2, height: 300 })).toEqual({ isValid: true, rejectionReason: null });
    }
  });

  it("refuses a hair under it, with the axis-span reason", (): void => {
    expect(evaluate("A", { left: 0, top: 0, width: 8.2 - 1e-9, height: 300 })).toEqual({
      isValid: false,
      rejectionReason: "left rejected: axis span 8.2px < min 8.2px (2 panes + splitter/gap 0.2px)",
    });
  });

  it("reports the axis and cross span reasons word for word", (): void => {
    expect(evaluate(null, { left: 0, top: 0, width: 50, height: 400 }, CONFIG).rejectionReason).toBe(
      "left rejected: axis span 50.0px < min 92.0px (2 panes + splitter/gap 12px)",
    );
    expect(evaluate(null, { left: 0, top: 0, width: 500, height: 20 }, CONFIG).rejectionReason).toBe(
      "left rejected: cross span 20.0px < min 40px",
    );
  });
});

describe("evaluateZoneCandidate — center swap eligibility", (): void => {
  const layout: TilingLayoutNode = hsplit(0.5, leaf("A"), leaf("B"));
  const targetFootprint: TilingPaneFootprint = { left: 0, top: 0, width: 500, height: 400 };

  it("blocks a center swap onto the same source leaf", (): void => {
    const result = evaluateZoneCandidate({
      zone: "center",
      layout,
      sourceLeafId: "A",
      targetLeafId: "A",
      targetFootprint,
      config: CONFIG,
      viewportWidth: VIEWPORT_WIDTH,
      viewportHeight: VIEWPORT_HEIGHT,
      subject: "pane",
    });
    expect(result.isValid).toBe(false);
    expect(result.rejectionReason).toContain("same source and target");
  });

  it("allows a center swap onto a different leaf", (): void => {
    const result = evaluateZoneCandidate({
      zone: "center",
      layout,
      sourceLeafId: "A",
      targetLeafId: "B",
      targetFootprint,
      config: CONFIG,
      viewportWidth: VIEWPORT_WIDTH,
      viewportHeight: VIEWPORT_HEIGHT,
      subject: "pane",
    });
    expect(result.isValid).toBe(true);
  });
});

describe("evaluateEdgeInsertCandidate — the projected fit", (): void => {
  const layout: TilingLayoutNode = hsplit(0.5, leaf("A"), leaf("B"));
  const roomy: TilingPaneFootprint = { left: 0, top: 0, width: 500, height: 400 };
  const evaluate = (targetLeafId: string, viewportWidth: number, viewportHeight: number) =>
    evaluateEdgeInsertCandidate({ candidateZone: "left", layout, sourceLeafId: "A", targetLeafId, targetFootprint: roomy, config: CONFIG, viewportWidth, viewportHeight, subject: "pane" });

  it("passes with a zero viewport (nothing to validate yet)", (): void => {
    expect(evaluate("B", 0, 0)).toEqual({ isValid: true, rejectionReason: null });
  });

  it("rejects when a projected leaf is missing from the tree", (): void => {
    expect(evaluate("ghost", VIEWPORT_WIDTH, VIEWPORT_HEIGHT)).toEqual({
      isValid: false,
      rejectionReason: "left rejected: projected source/target footprint violates min pane 40px",
    });
  });

  it("judges the insertLeafAdjacent projection in the viewport", (): void => {
    // A beside B in the whole width: (100 / 2 - 6) = 44 px each fits 40; (90 / 2 - 6) = 39 px does not.
    expect(evaluate("B", 100, VIEWPORT_HEIGHT).isValid).toBe(true);
    expect(evaluate("B", 90, VIEWPORT_HEIGHT).isValid).toBe(false);
  });
});
