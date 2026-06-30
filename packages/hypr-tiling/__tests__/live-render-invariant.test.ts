import { describe, expect, it } from "@jest/globals";
import { insertLeafAdjacent, readLeafNodeIds, removeLeafTile, swapLeafTiles } from "../core/state";
import {
  resolveLeafDropPreview,
  resolveLeafDropPreviewForMode,
  resolveStableDragHitFootprints,
} from "../react/dynamic-tiling-renderer";
import { deriveCandidateTree } from "../core/drag-machine";
import { PLACEMENT_BY_DROP_ZONE } from "../core/projected-layout";
import { collectLeafFootprints, footprintsByLeafId } from "../core/leaf-geometry";
import type { TilingDropIntentState } from "../core/drop-intent-resolver";
import type {
  TilingLayoutConfig,
  TilingLeafDropPreview,
  TilingLeafDropZone,
  TilingLeafNode,
  TilingPaneFootprint,
  TilingSplitNode,
} from "../core/types";

function leaf(id: string, tileId: string): TilingLeafNode {
  return { kind: "leaf", id, tileId };
}

/**
 * Base fixture tree (matches `state.test.ts`):
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

/**
 * Minimal-but-complete `TilingDropState` (= `TilingDropIntentState`) fixture.
 * `resolveLeafDropPreview` only reads `leafId` / `zone` / `action`; the remaining
 * fields are filled with inert defaults so the value is fully typed (no `any`).
 */
function makeDropState(
  targetLeafId: string,
  zone: TilingLeafDropZone,
  action: TilingDropIntentState["action"],
): TilingDropIntentState {
  return {
    leafId: targetLeafId,
    zone,
    action,
    dominantEdge: "right",
    finalEdge: zone === "center" ? null : "right",
    fallbackReason: null,
    blockedReason: null,
    axisPath: ["horizontal"],
    edgeThresholdRatio: 0.25,
    centerRectWidthPx: 100,
    centerRectHeightPx: 100,
    centerDistancePx: 0,
    nearestEdgeDistancePx: 0,
    paneLocalX: 10,
    paneLocalY: 10,
    targetSplitId: null,
    targetSplitPlacement: null,
    selectedSplitZone: zone === "center" ? null : "right",
    selectedSplitDistancePx: null,
    rejectedSplitReasons: [],
    tuning: {
      centerRatio: 0.5,
      edgeThresholdRatio: 0.25,
      hysteresisPx: 8,
      devicePixelRatio: 1,
    },
  };
}

describe("live-mode render invariant — frozen gap-closed tree, no result-shadow leak", (): void => {
  // The source ("A") is detached on pickup; the destination ("C") is hovered with
  // a swap intent. These two values model an in-flight live drag.
  const SOURCE_LEAF_ID = "A";
  const TARGET_LEAF_ID = "C";

  it("live render equals removeLeafTile(layout, source) — the gap closes (source absent, sibling promoted)", (): void => {
    const layout: TilingSplitNode = baseLayout();
    const frozen = removeLeafTile(layout, SOURCE_LEAF_ID);
    const renderedIds: ReadonlyArray<string> = readLeafNodeIds(frozen);

    // The rendered (display) tree in live mode IS the frozen detach tree: the
    // source slot collapses and the surviving siblings promote into it.
    expect(renderedIds).not.toContain(SOURCE_LEAF_ID);
    expect([...renderedIds].sort()).toEqual(["B", "C"]);
  });

  it("preview mode: the target tile receives the drop-target-result-shadow preview (System B active)", (): void => {
    const dropState: TilingDropIntentState = makeDropState(TARGET_LEAF_ID, "center", "swap");
    const preview: TilingLeafDropPreview | null = resolveLeafDropPreviewForMode(
      false,
      TARGET_LEAF_ID,
      SOURCE_LEAF_ID,
      dropState,
    );
    expect(preview).not.toBeNull();
    expect(preview?.role).toBe("drop-target-result-shadow");
    expect(preview?.partnerLeafId).toBe(SOURCE_LEAF_ID);
  });

  it("live mode: the result-shadow path is suppressed for the SAME intent (System B gated off)", (): void => {
    const dropState: TilingDropIntentState = makeDropState(TARGET_LEAF_ID, "center", "swap");

    // The pure helper still computes a shadow for this intent...
    const ungated: TilingLeafDropPreview | null = resolveLeafDropPreview(
      TARGET_LEAF_ID,
      SOURCE_LEAF_ID,
      dropState,
    );
    expect(ungated).not.toBeNull();
    expect(ungated?.role).toBe("drop-target-result-shadow");

    // ...but the live-mode gate suppresses it (Hyprland: ghost only, no shadow).
    const gated: TilingLeafDropPreview | null = resolveLeafDropPreviewForMode(
      true,
      TARGET_LEAF_ID,
      SOURCE_LEAF_ID,
      dropState,
    );
    expect(gated).toBeNull();
  });

  it("edge-insert intent: same live-vs-preview divergence (shadow in preview, null in live)", (): void => {
    const dropState: TilingDropIntentState = makeDropState(TARGET_LEAF_ID, "left", "edge-insert");

    const previewModePreview: TilingLeafDropPreview | null = resolveLeafDropPreviewForMode(
      false,
      TARGET_LEAF_ID,
      SOURCE_LEAF_ID,
      dropState,
    );
    expect(previewModePreview?.role).toBe("drop-target-result-shadow");
    expect(previewModePreview?.mode).toBe("edge-insert");

    const liveModePreview: TilingLeafDropPreview | null = resolveLeafDropPreviewForMode(
      true,
      TARGET_LEAF_ID,
      SOURCE_LEAF_ID,
      dropState,
    );
    expect(liveModePreview).toBeNull();
  });

  it("regression guard: toggling preview↔live flips the result-shadow on/off for a fixed intent", (): void => {
    const dropState: TilingDropIntentState = makeDropState(TARGET_LEAF_ID, "center", "swap");
    const previewShadow = resolveLeafDropPreviewForMode(false, TARGET_LEAF_ID, SOURCE_LEAF_ID, dropState);
    const liveShadow = resolveLeafDropPreviewForMode(true, TARGET_LEAF_ID, SOURCE_LEAF_ID, dropState);
    expect(previewShadow).not.toBeNull();
    expect(liveShadow).toBeNull();
  });
});

describe("live-mode render invariant — the rendered tree IS the derived candidate tree (true reflow)", (): void => {
  // These bind the render-path contract: while dragging in live mode the
  // displayed `displayLayout` is `deriveCandidateTree(originalLayout, source,
  // resolvedTarget)` — the destination physically reflows to the post-drop
  // result. It is NEVER a frozen-source-only tree with a projected shadow, and
  // the committed tree equals the last candidate (no release-time jump).
  const SOURCE_LEAF_ID = "A";
  const TARGET_LEAF_ID = "C";

  it("no resolved target → candidate is the gap-closed base (source detached, riding the ghost)", (): void => {
    const layout: TilingSplitNode = baseLayout();
    const candidate = deriveCandidateTree(layout, SOURCE_LEAF_ID, null);
    expect(candidate).toEqual(removeLeafTile(layout, SOURCE_LEAF_ID));
    expect(readLeafNodeIds(candidate)).not.toContain(SOURCE_LEAF_ID);
  });

  it("swap intent → candidate equals swapLeafTiles (both panes still present, positions exchanged)", (): void => {
    const layout: TilingSplitNode = baseLayout();
    const dropState: TilingDropIntentState = makeDropState(TARGET_LEAF_ID, "center", "swap");
    const candidate = deriveCandidateTree(layout, SOURCE_LEAF_ID, dropState);
    expect(candidate).toEqual(swapLeafTiles(layout, SOURCE_LEAF_ID, TARGET_LEAF_ID));
    expect([...readLeafNodeIds(candidate)].sort()).toEqual(["A", "B", "C"]);
  });

  it("edge-insert intent → candidate equals insertLeafAdjacent at the resolved edge (destination reflows)", (): void => {
    const layout: TilingSplitNode = baseLayout();
    // The fixture carries finalEdge "right" for non-center zones, and
    // deriveCandidateTree resolves the commit edge as `finalEdge ?? selectedSplitZone`.
    const dropState: TilingDropIntentState = makeDropState(TARGET_LEAF_ID, "right", "edge-insert");
    const candidate = deriveCandidateTree(layout, SOURCE_LEAF_ID, dropState);
    expect(candidate).toEqual(
      insertLeafAdjacent(layout, SOURCE_LEAF_ID, TARGET_LEAF_ID, PLACEMENT_BY_DROP_ZONE["right"], {
        preserveParentSplitAxis: false,
        splitRatio: 0.5,
      }),
    );
    expect([...readLeafNodeIds(candidate)].sort()).toEqual(["A", "B", "C"]);
  });

  it("candidate is always derived from the ORIGINAL layout — re-deriving on a moved target cannot accumulate drift", (): void => {
    const layout: TilingSplitNode = baseLayout();
    // Hover C (swap), then re-hover B (swap): each derivation starts from the
    // pristine `layout`, so the second result is independent of the first.
    const firstHover: TilingDropIntentState = makeDropState("C", "center", "swap");
    const secondHover: TilingDropIntentState = makeDropState("B", "center", "swap");
    const afterFirst = deriveCandidateTree(layout, SOURCE_LEAF_ID, firstHover);
    const afterSecond = deriveCandidateTree(layout, SOURCE_LEAF_ID, secondHover);
    expect(afterFirst).toEqual(swapLeafTiles(layout, SOURCE_LEAF_ID, "C"));
    expect(afterSecond).toEqual(swapLeafTiles(layout, SOURCE_LEAF_ID, "B"));
    // The original layout is never mutated by candidate derivation.
    expect([...readLeafNodeIds(layout)].sort()).toEqual(["A", "B", "C"]);
  });
});

describe("stable-reference hit-test geometry — target resolution never chases the reflow", (): void => {
  // The drop target is resolved against this FROZEN geometry (a pure function of
  // layout/source/viewport/config), NOT the displayed candidate tree's rects. So
  // a candidate-tree reflow — which moves panes under the cursor as the resolved
  // target changes — cannot move a hit zone and flip the target. That is the
  // structural break of the reflow→retarget→re-reflow oscillation.
  const SOURCE_LEAF_ID = "A";
  const CONFIG: TilingLayoutConfig = { gapPx: 0, minPaneSizePx: 0, handleSizePx: 0 };
  const VIEWPORT = { width: 1000, height: 800 };

  function originalFootprints(layout: TilingSplitNode): ReadonlyMap<string, TilingPaneFootprint> {
    return footprintsByLeafId(collectLeafFootprints(layout, 0, 0, VIEWPORT.width, VIEWPORT.height, CONFIG));
  }

  it("live mode resolves against the gap-closed base (source removed), independent of any resolved target", (): void => {
    const layout: TilingSplitNode = baseLayout();
    const expected = footprintsByLeafId(
      collectLeafFootprints(removeLeafTile(layout, SOURCE_LEAF_ID), 0, 0, VIEWPORT.width, VIEWPORT.height, CONFIG),
    );
    const geometry = resolveStableDragHitFootprints(
      true,
      layout,
      SOURCE_LEAF_ID,
      VIEWPORT,
      CONFIG,
      originalFootprints(layout),
    );
    // The source slot is gone; only the survivors carry hit rects.
    expect([...geometry.keys()].sort()).toEqual(["B", "C"]);
    expect(geometry).toEqual(expected);
  });

  it("INVARIANT: the hit geometry is byte-identical regardless of which target/zone is currently resolved", (): void => {
    const layout: TilingSplitNode = baseLayout();
    // The function signature has NO dropState/candidate parameter, so reflow
    // literally cannot be an input. We assert the consequence: re-deriving the
    // candidate tree for two different hovers (the reflow) leaves the SAME hit
    // geometry — the geometry the resolver uses is frozen for the whole drag.
    deriveCandidateTree(layout, SOURCE_LEAF_ID, makeDropState("C", "center", "swap"));
    const geomA = resolveStableDragHitFootprints(true, layout, SOURCE_LEAF_ID, VIEWPORT, CONFIG, originalFootprints(layout));
    deriveCandidateTree(layout, SOURCE_LEAF_ID, makeDropState("B", "left", "edge-insert"));
    const geomB = resolveStableDragHitFootprints(true, layout, SOURCE_LEAF_ID, VIEWPORT, CONFIG, originalFootprints(layout));
    expect(geomA).toEqual(geomB);
  });

  it("preview mode resolves against the ORIGINAL footprints (source still in place)", (): void => {
    const layout: TilingSplitNode = baseLayout();
    const original = originalFootprints(layout);
    const geometry = resolveStableDragHitFootprints(false, layout, SOURCE_LEAF_ID, VIEWPORT, CONFIG, original);
    expect(geometry).toBe(original);
    expect([...geometry.keys()].sort()).toEqual(["A", "B", "C"]);
  });

  it("no source held → original footprints (no drag in flight)", (): void => {
    const layout: TilingSplitNode = baseLayout();
    const original = originalFootprints(layout);
    expect(resolveStableDragHitFootprints(true, layout, null, VIEWPORT, CONFIG, original)).toBe(original);
  });
});
