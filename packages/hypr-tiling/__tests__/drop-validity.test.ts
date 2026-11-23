import { describe, expect, it } from "@jest/globals";
import { collectStaticGatedLeafIds } from "../engine/drop-validity";
import type {
  TilingLayoutConfig,
  TilingLayoutNode,
  TilingLeafNode,
  TilingSplitNode,
  TilingPaneSizing,
} from "../engine/types";
import { layoutDrag } from "./golden/cases";

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

/**
 * What a place takes, in the drag's own terms: `tilingDrag(...).after(place).refusal`, placement's room rule
 * (`canSplitPane`: two minimums plus the gutter along the split, one across it, on the pane as the base draws it) and
 * its fit rule (`dropFits`, on the layout the release makes), over hypr-tiling's layout. The subject A is lifted from
 * A | B, so B fills the stage in the base: the stage is the target.
 */
describe("a place's refusal — span + min-pane validity", (): void => {
  const layout: TilingLayoutNode = hsplit(0.5, leaf("A"), leaf("B"));
  const refusal = (side: "left" | "top", stage: { width: number; height: number }, config: TilingLayoutConfig = CONFIG) =>
    layoutDrag(layout, "A", stage, config)!.after({ kind: "beside", at: "tile-B", side }).refusal;

  it("accepts an edge insert with adequate axis + cross span", (): void => {
    expect(refusal("left", { width: 500, height: 400 })).toBeNull();
  });

  it("refuses when the target axis span cannot fit two panes + the splitter, with the span it has and needs", (): void => {
    // Two minimums (2 × 40) plus the gutter (8 gap + 4 handle).
    expect(refusal("left", { width: 50, height: 400 })).toEqual({ code: "room-along", need: 92, have: 50 });
  });

  it("refuses when the target cross span is below the per-pane minimum", (): void => {
    expect(refusal("top", { width: 20, height: 400 })).toEqual({ code: "room-across", need: 40, have: 20 });
  });

  it("judges the layout the release makes against the min pane: the subject and its target fit when both clear it", (): void => {
    // Big stage, generous min → the A | B split clears the floor.
    expect(layoutDrag(layout, "A", { width: 1000, height: 800 }, CONFIG)!.after({ kind: "beside", at: "tile-B", side: "left" }).refusal).toBeNull();
  });

  it("refuses a place whose pane the base does not draw (missing) or the subject's own (self)", (): void => {
    const drag = layoutDrag(layout, "A", { width: 1000, height: 800 }, CONFIG)!;
    expect(drag.after({ kind: "beside", at: "ghost", side: "left" }).refusal).toEqual({ code: "missing" });
    expect(drag.after({ kind: "swap", at: "tile-A" }).refusal).toEqual({ code: "self" });
  });
});

describe("a place's refusal — span boundary", (): void => {
  const layout: TilingLayoutNode = hsplit(0.5, leaf("A"), vsplit(0.5, leaf("B"), leaf("C")));
  // No gutter, a 4 px minimum: the target needs 8 px along the split exactly.
  const exact: TilingLayoutConfig = { gapPx: 0, handleSizePx: 0, minPaneSizePx: 4 };
  const left = (stage: { width: number; height: number }) =>
    layoutDrag(layout, "A", stage, exact)!.after({ kind: "beside", at: "tile-B", side: "left" }).refusal;

  it("accepts a target exactly two minimums wide", (): void => {
    // B and C stacked in the base: B is as wide as the stage.
    expect(left({ width: 8, height: 300 })).toBeNull();
  });

  it("refuses a hair under it, with the axis-span code", (): void => {
    expect(left({ width: 8 - 1e-9, height: 300 })?.code).toBe("room-along");
  });
});

describe("a place's refusal — a swap with itself", (): void => {
  const layout: TilingLayoutNode = hsplit(0.5, leaf("A"), leaf("B"));

  it("refuses a swap onto the subject's own leaf (self) and takes one onto a different leaf", (): void => {
    const drag = layoutDrag(layout, "A", { width: 1000, height: 800 }, CONFIG)!;
    expect(drag.after({ kind: "swap", at: "tile-A" }).refusal).toEqual({ code: "self" });
    expect(drag.after({ kind: "swap", at: "tile-B" }).refusal).toBeNull();
  });
});

