import { describe, expect, it } from "@jest/globals";
import {
  resolveProjectedDropLayout,
  resolveProjectedLandingOverlays,
} from "../engine/projected-layout";
import { collectLeafFootprints, footprintsByLeafId } from "../engine/leaf-geometry";
import type { TilingProjectedLandingOverlay } from "../engine/projected-layout";
import { insertLeafAdjacent, swapLeafTiles } from "../engine/state";
import type { TilingDropIntentState, TilingEdgeZone } from "../engine/drop-intent-resolver";
import type {
  TilingDropAction,
  TilingLayoutConfig,
  TilingLayoutNode,
  TilingLeafNode,
  TilingPaneFootprint,
  TilingSplitNode,
} from "../engine/types";

function leaf(id: string, tileId: string): TilingLeafNode {
  return { kind: "leaf", id, tileId };
}

/**
 * Base fixture tree (gap-free config so footprints are exact ratio splits):
 *
 *   root (split, horizontal, 0.5)
 *   ├── s1 (split, vertical, 0.5)
 *   │   ├── A   (leaf, tile-a)   <- drag source
 *   │   └── B   (leaf, tile-b)   <- A's sibling -> successor on insert/move
 *   └── C       (leaf, tile-c)   <- drop target
 *
 * Viewport 1000 x 800. Current footprints:
 *   A {0,0,500,400}  B {0,400,500,400}  C {500,0,500,800}
 */
function baseLayout(): TilingSplitNode {
  return {
    kind: "split",
    id: "root",
    axis: "horizontal",
    ratio: 0.5,
    first: {
      kind: "split",
      id: "s1",
      axis: "vertical",
      ratio: 0.5,
      first: leaf("A", "tile-a"),
      second: leaf("B", "tile-b"),
    },
    second: leaf("C", "tile-c"),
  };
}

const GAP_FREE_CONFIG: TilingLayoutConfig = {
  gapPx: 0,
  minPaneSizePx: 0,
  handleSizePx: 0,
};
const VIEWPORT_WIDTH: number = 1000;
const VIEWPORT_HEIGHT: number = 800;

function makeDropState(overrides: {
  leafId: string;
  action: TilingDropAction;
  zone: TilingDropIntentState["zone"];
  finalEdge?: TilingEdgeZone | null;
  selectedSplitZone?: TilingEdgeZone | null;
}): TilingDropIntentState {
  return {
    leafId: overrides.leafId,
    zone: overrides.zone,
    action: overrides.action,
    dominantEdge: "left",
    finalEdge: overrides.finalEdge ?? null,
    fallbackReason: null,
    blockedReason: null,
    axisPath: [],
    edgeThresholdRatio: 0.33,
    centerRectWidthPx: 0,
    centerRectHeightPx: 0,
    centerDistancePx: 0,
    nearestEdgeDistancePx: 0,
    paneLocalX: 0,
    paneLocalY: 0,
    targetSplitId: null,
    targetSplitPlacement: null,
    selectedSplitZone: overrides.selectedSplitZone ?? null,
    selectedSplitDistancePx: null,
    rejectedSplitReasons: [],
    tuning: {
      centerRatio: 0.34,
      edgeThresholdRatio: 0.33,
      hysteresisPx: 6,
      devicePixelRatio: 1,
    },
  };
}

function projectedFootprintFor(layout: TilingLayoutNode, leafId: string): TilingPaneFootprint | undefined {
  return footprintsByLeafId(
    collectLeafFootprints(layout, 0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, GAP_FREE_CONFIG),
  ).get(leafId);
}

function overlayBySubject(
  overlays: ReadonlyArray<TilingProjectedLandingOverlay>,
  subject: TilingProjectedLandingOverlay["subject"],
): TilingProjectedLandingOverlay | undefined {
  return overlays.find((overlay: TilingProjectedLandingOverlay): boolean => overlay.subject === subject);
}

describe("resolveProjectedLandingOverlays — SWAP subject taxonomy", (): void => {
  // Drag source A, drop target C, center swap. swapLeafTiles exchanges tile
  // content between two FIXED leaves: source content lands UNDER THE CURSOR
  // (target leaf C's cell), target content lands in the source's old cell (A).
  const layout: TilingSplitNode = baseLayout();
  const dropState: TilingDropIntentState = makeDropState({ leafId: "C", action: "swap", zone: "center" });
  const projectedLayout: TilingLayoutNode | null = resolveProjectedDropLayout(layout, "A", dropState);
  const overlays: ReadonlyArray<TilingProjectedLandingOverlay> = resolveProjectedLandingOverlays(
    layout,
    projectedLayout,
    "A",
    dropState,
    VIEWPORT_WIDTH,
    VIEWPORT_HEIGHT,
    GAP_FREE_CONFIG,
  );

  it("labels the under-cursor cell (target leaf C) as the source landing S'", (): void => {
    const sourceOverlay: TilingProjectedLandingOverlay | undefined = overlayBySubject(overlays, "source");
    expect(sourceOverlay).toBeDefined();
    // C is the cell under the cursor; the dragged source content lands there.
    expect(sourceOverlay?.leafId).toBe("C");
    expect(sourceOverlay?.footprint).toEqual({ left: 500, top: 0, width: 500, height: 800 });
  });

  it("labels the source's old cell (leaf A) as the target landing T'", (): void => {
    const targetOverlay: TilingProjectedLandingOverlay | undefined = overlayBySubject(overlays, "target");
    expect(targetOverlay).toBeDefined();
    expect(targetOverlay?.leafId).toBe("A");
    expect(targetOverlay?.footprint).toEqual({ left: 0, top: 0, width: 500, height: 400 });
  });

  it("emits exactly source + target and no successor on a swap", (): void => {
    expect(overlays.map((overlay: TilingProjectedLandingOverlay): string => overlay.subject).sort()).toEqual([
      "source",
      "target",
    ]);
  });

  it("matches the reducer's post-swap projected geometry exactly (overlay == result)", (): void => {
    const sourceOverlay: TilingProjectedLandingOverlay | undefined = overlayBySubject(overlays, "source");
    const targetOverlay: TilingProjectedLandingOverlay | undefined = overlayBySubject(overlays, "target");
    expect(projectedLayout).not.toBeNull();
    // Source landing footprint == projected cell of target leaf C (under cursor).
    expect(sourceOverlay?.footprint).toEqual(projectedFootprintFor(projectedLayout as TilingLayoutNode, "C"));
    // Target landing footprint == projected cell of source leaf A (old source).
    expect(targetOverlay?.footprint).toEqual(projectedFootprintFor(projectedLayout as TilingLayoutNode, "A"));
  });
});

describe("resolveProjectedLandingOverlays — INSERT/MOVE successor subject", (): void => {
  // Drag source A inserted to the right of target C. A leaves its parent split
  // s1; its former sibling B is promoted into the vacated cell and absorbs the
  // released space, becoming the successor.
  const layout: TilingSplitNode = baseLayout();
  const dropState: TilingDropIntentState = makeDropState({
    leafId: "C",
    action: "edge-insert",
    zone: "right",
    finalEdge: "right",
  });
  const projectedLayout: TilingLayoutNode | null = resolveProjectedDropLayout(layout, "A", dropState);
  const overlays: ReadonlyArray<TilingProjectedLandingOverlay> = resolveProjectedLandingOverlays(
    layout,
    projectedLayout,
    "A",
    dropState,
    VIEWPORT_WIDTH,
    VIEWPORT_HEIGHT,
    GAP_FREE_CONFIG,
  );

  it("produces a successor overlay for the former sibling B", (): void => {
    const successorOverlay: TilingProjectedLandingOverlay | undefined = overlayBySubject(overlays, "successor");
    expect(successorOverlay).toBeDefined();
    expect(successorOverlay?.leafId).toBe("B");
  });

  it("matches the reducer's projected geometry for the successor (vacated-space promotion)", (): void => {
    const successorOverlay: TilingProjectedLandingOverlay | undefined = overlayBySubject(overlays, "successor");
    expect(projectedLayout).not.toBeNull();
    // B expands from its old bottom-left quarter to the full left half.
    expect(successorOverlay?.footprint).toEqual({ left: 0, top: 0, width: 500, height: 800 });
    expect(successorOverlay?.footprint).toEqual(projectedFootprintFor(projectedLayout as TilingLayoutNode, "B"));
  });

  it("matches the reducer's projected geometry for the relocated source S'", (): void => {
    const sourceOverlay: TilingProjectedLandingOverlay | undefined = overlayBySubject(overlays, "source");
    expect(sourceOverlay?.leafId).toBe("A");
    expect(sourceOverlay?.footprint).toEqual(projectedFootprintFor(projectedLayout as TilingLayoutNode, "A"));
  });

  it("emits no spurious target projection when there is no swap", (): void => {
    expect(overlayBySubject(overlays, "target")).toBeUndefined();
    expect(overlays.map((overlay: TilingProjectedLandingOverlay): string => overlay.subject).sort()).toEqual([
      "source",
      "successor",
    ]);
  });
});

describe("projected drop layout == committed layout (preview-overlay single source of truth)", (): void => {
  // `resolveProjectedDropLayout(...)` backs the PREVIEW-mode projected landing
  // overlays (S' / T' / successor), and the drop commits via the SAME reducers
  // (`swapLeafTiles` / `insertLeafAdjacent`). These assertions prove the two are
  // identical, so the preview overlay geometry is byte-for-byte what commits.
  // (Live detach mode commits through the same reducers on the original layout —
  // see state.test.ts "live detach drag" for the live == preview convergence.)

  it("swap: projected drop tree equals the committed swap reducer output", (): void => {
    const layout: TilingSplitNode = baseLayout();
    const dropState: TilingDropIntentState = makeDropState({ leafId: "C", action: "swap", zone: "center" });
    const provisional: TilingLayoutNode | null = resolveProjectedDropLayout(layout, "A", dropState);
    const committed: TilingLayoutNode = swapLeafTiles(layout, "A", "C");
    expect(provisional).not.toBeNull();
    expect(provisional).toEqual(committed);
  });

  it("edge-insert: projected drop tree equals the committed insert reducer output", (): void => {
    const layout: TilingSplitNode = baseLayout();
    const dropState: TilingDropIntentState = makeDropState({
      leafId: "C",
      action: "edge-insert",
      zone: "right",
      finalEdge: "right",
    });
    const provisional: TilingLayoutNode | null = resolveProjectedDropLayout(layout, "A", dropState);
    const committed: TilingLayoutNode = insertLeafAdjacent(layout, "A", "C", "right", {
      preserveParentSplitAxis: false,
      splitRatio: 0.5,
    });
    expect(provisional).not.toBeNull();
    expect(provisional).toEqual(committed);
  });

  it("edge-insert via selectedSplitZone fallback also matches the committed insert", (): void => {
    const layout: TilingSplitNode = baseLayout();
    // finalEdge null → resolveProjectedDropLayout falls back to selectedSplitZone.
    const dropState: TilingDropIntentState = makeDropState({
      leafId: "C",
      action: "edge-insert",
      zone: "top",
      finalEdge: null,
      selectedSplitZone: "top",
    });
    const provisional: TilingLayoutNode | null = resolveProjectedDropLayout(layout, "A", dropState);
    const committed: TilingLayoutNode = insertLeafAdjacent(layout, "A", "C", "top", {
      preserveParentSplitAxis: false,
      splitRatio: 0.5,
    });
    expect(provisional).not.toBeNull();
    expect(provisional).toEqual(committed);
  });

  it("returns null (no reflow) when the resolved action is not a move", (): void => {
    const layout: TilingSplitNode = baseLayout();
    const dropState: TilingDropIntentState = makeDropState({ leafId: "C", action: "none", zone: "center" });
    expect(resolveProjectedDropLayout(layout, "A", dropState)).toBeNull();
  });
});

describe("resolveProjectedLandingOverlays — guard paths", (): void => {
  it("returns no overlays when source and target are the same leaf", (): void => {
    const layout: TilingSplitNode = baseLayout();
    const dropState: TilingDropIntentState = makeDropState({ leafId: "A", action: "swap", zone: "center" });
    const projectedLayout: TilingLayoutNode | null = resolveProjectedDropLayout(layout, "A", dropState);
    expect(projectedLayout).toBeNull();
    expect(
      resolveProjectedLandingOverlays(layout, projectedLayout, "A", dropState, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, GAP_FREE_CONFIG),
    ).toEqual([]);
  });

  it("returns no overlays for a zero-area viewport", (): void => {
    const layout: TilingSplitNode = baseLayout();
    const dropState: TilingDropIntentState = makeDropState({ leafId: "C", action: "swap", zone: "center" });
    const projectedLayout: TilingLayoutNode | null = resolveProjectedDropLayout(layout, "A", dropState);
    expect(resolveProjectedLandingOverlays(layout, projectedLayout, "A", dropState, 0, 0, GAP_FREE_CONFIG)).toEqual([]);
  });
});
