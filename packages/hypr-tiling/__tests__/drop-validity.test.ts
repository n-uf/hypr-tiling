import { describe, expect, it } from "@jest/globals";
import {
  collectStaticGatedLeafIds,
  evaluateEdgeInsertCandidate,
  evaluateZoneCandidate,
  projectedLeafFitsConstraints,
} from "../drop-validity";
import { insertLeafAdjacent } from "../state";
import type {
  TilingLayoutConfig,
  TilingLayoutNode,
  TilingLeafNode,
  TilingPaneFootprint,
  TilingSplitNode,
  TilingPaneSizing,
} from "../types";

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
    });
    // Big viewport, generous min → the projected A|B split clears the floor.
    expect(result.isValid).toBe(true);
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
    });
    expect(result.isValid).toBe(true);
  });
});

describe("projectedLeafFitsConstraints — direct", (): void => {
  it("returns true for a zero viewport (nothing to validate yet)", (): void => {
    const layout: TilingLayoutNode = hsplit(0.5, leaf("A"), leaf("B"));
    expect(projectedLeafFitsConstraints(layout, "A", "B", 0, 0, 40, CONFIG)).toBe(true);
  });

  it("rejects when a projected leaf is missing from the tree", (): void => {
    const layout: TilingLayoutNode = hsplit(0.5, leaf("A"), leaf("B"));
    expect(projectedLeafFitsConstraints(layout, "A", "ghost", VIEWPORT_WIDTH, VIEWPORT_HEIGHT, 40, CONFIG)).toBe(false);
  });

  it("agrees with an actual insertLeafAdjacent projection", (): void => {
    const layout: TilingLayoutNode = hsplit(0.5, leaf("A"), leaf("B"));
    const projected: TilingLayoutNode = insertLeafAdjacent(layout, "A", "B", "left", {
      preserveParentSplitAxis: false,
      splitRatio: 0.5,
    });
    expect(projectedLeafFitsConstraints(projected, "A", "B", VIEWPORT_WIDTH, VIEWPORT_HEIGHT, 40, CONFIG)).toBe(true);
  });
});
