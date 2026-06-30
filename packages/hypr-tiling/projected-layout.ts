import {
  addLeafToGroup,
  findGroupContainingLeaf,
  insertLeafAdjacent,
  readLeafNodeIds,
  siblingSubtreeForLeaf,
  swapLeafTiles,
} from "./state";
import { collectLeafFootprints, footprintsByLeafId } from "./leaf-geometry";
import type { TilingEdgeZone } from "./drop-intent-resolver";
import type {
  TilingDropIntentState,
} from "./drop-intent-resolver";
import type {
  TilingLayoutConfig,
  TilingLayoutNode,
  TilingMovePlacement,
  TilingPaneFootprint,
  TilingProjectedLandingOverlay,
  TilingProjectedLandingSubject,
} from "./types";

export type { TilingProjectedLandingOverlay, TilingProjectedLandingSubject } from "./types";

/**
 * Pure projected-layout / landing-overlay model — single source of truth shared
 * by the interactive renderer (`dynamic-tiling-renderer.tsx`) and the jest
 * suite. Canonical leaf-geometry (`collectLeafFootprints`, `footprintsByLeafId`)
 * lives in `leaf-geometry.ts`; this module consumes it so the overlay the
 * operator sees is computed from the exact same layout projection used at commit
 * time.
 *
 * The renderer is a `"use client"` component whose import graph pulls in React
 * and `workspace-shadcn`, which the package's node jest harness cannot resolve.
 * Keeping every DOM-free projection helper here lets the overlay model be
 * unit-tested directly.
 */

export const PLACEMENT_BY_DROP_ZONE: Record<TilingEdgeZone, TilingMovePlacement> = {
  left: "left",
  right: "right",
  top: "top",
  bottom: "bottom",
};

/**
 * Project the post-drop layout tree using the exact reducers used at commit
 * time (`swapLeafTiles` / `insertLeafAdjacent`), so overlay geometry == result.
 */
export function resolveProjectedDropLayout(
  layout: TilingLayoutNode,
  sourceLeafId: string | null,
  dropState: TilingDropIntentState | null,
): TilingLayoutNode | null {
  if (sourceLeafId == null || dropState == null || sourceLeafId === dropState.leafId) {
    return null;
  }

  if (dropState.action === "swap") {
    return swapLeafTiles(layout, sourceLeafId, dropState.leafId);
  }
  if (dropState.action === "group-merge") {
    // The drop target's representative leaf id (`dropState.leafId`) is a group's
    // active member; merge the dragged source into that group.
    const group = findGroupContainingLeaf(layout, dropState.leafId);
    if (group == null) {
      return null;
    }
    return addLeafToGroup(layout, group.id, sourceLeafId);
  }
  if (dropState.action !== "edge-insert") {
    return null;
  }
  const edgeZone: TilingEdgeZone | null = dropState.finalEdge ?? dropState.selectedSplitZone;
  if (edgeZone == null) {
    return null;
  }

  return insertLeafAdjacent(
    layout,
    sourceLeafId,
    dropState.leafId,
    PLACEMENT_BY_DROP_ZONE[edgeZone],
    {
      preserveParentSplitAxis: false,
      splitRatio: 0.5,
    },
  );
}

function unionFootprints(footprints: ReadonlyArray<TilingPaneFootprint>): TilingPaneFootprint | null {
  if (footprints.length === 0) {
    return null;
  }
  let minLeft: number = Number.POSITIVE_INFINITY;
  let minTop: number = Number.POSITIVE_INFINITY;
  let maxRight: number = Number.NEGATIVE_INFINITY;
  let maxBottom: number = Number.NEGATIVE_INFINITY;
  for (const footprint of footprints) {
    minLeft = Math.min(minLeft, footprint.left);
    minTop = Math.min(minTop, footprint.top);
    maxRight = Math.max(maxRight, footprint.left + footprint.width);
    maxBottom = Math.max(maxBottom, footprint.top + footprint.height);
  }
  return {
    left: minLeft,
    top: minTop,
    width: maxRight - minLeft,
    height: maxBottom - minTop,
  };
}

/**
 * SWAP projection: the dragged source content lands in the cell UNDER THE CURSOR
 * (the target leaf's cell `S'`), and the target content lands in the source's
 * old cell (`T'`). `swapLeafTiles` keeps both leaves fixed and only exchanges
 * `tileId`, so the two footprints are the current cell geometries — but the
 * subject that lands in each is inverted relative to leaf identity, which is the
 * mislabel this taxonomy fixes.
 */
function resolveSwapLandingOverlays(
  sourceLeafId: string,
  targetLeafId: string,
  projectedFootprints: ReadonlyMap<string, TilingPaneFootprint>,
): ReadonlyArray<TilingProjectedLandingOverlay> {
  const overlays: Array<TilingProjectedLandingOverlay> = [];

  const sourceLandingFootprint: TilingPaneFootprint | undefined = projectedFootprints.get(targetLeafId);
  if (sourceLandingFootprint != null) {
    overlays.push({
      subject: "source",
      leafId: targetLeafId,
      footprint: sourceLandingFootprint,
    });
  }

  const targetLandingFootprint: TilingPaneFootprint | undefined = projectedFootprints.get(sourceLeafId);
  if (targetLandingFootprint != null) {
    overlays.push({
      subject: "target",
      leafId: sourceLeafId,
      footprint: targetLandingFootprint,
    });
  }

  return overlays;
}

/**
 * EDGE-INSERT / MOVE projection: the source relocates next to the target (`S'`),
 * and the source's former sibling subtree is promoted into the vacated cell as
 * the `successor`, absorbing the released space. No `target` overlay is emitted
 * — a pure insert does not displace the target in the swap sense.
 */
function resolveInsertLandingOverlays(
  layout: TilingLayoutNode,
  sourceLeafId: string,
  projectedFootprints: ReadonlyMap<string, TilingPaneFootprint>,
): ReadonlyArray<TilingProjectedLandingOverlay> {
  const overlays: Array<TilingProjectedLandingOverlay> = [];

  const sourceLandingFootprint: TilingPaneFootprint | undefined = projectedFootprints.get(sourceLeafId);
  if (sourceLandingFootprint != null) {
    overlays.push({
      subject: "source",
      leafId: sourceLeafId,
      footprint: sourceLandingFootprint,
    });
  }

  const siblingSubtree: TilingLayoutNode | null = siblingSubtreeForLeaf(layout, sourceLeafId);
  if (siblingSubtree != null) {
    const successorLeafIds: ReadonlyArray<string> = readLeafNodeIds(siblingSubtree);
    const successorFootprints: ReadonlyArray<TilingPaneFootprint> = successorLeafIds
      .map((leafId: string): TilingPaneFootprint | undefined => projectedFootprints.get(leafId))
      .filter((footprint: TilingPaneFootprint | undefined): footprint is TilingPaneFootprint => footprint != null);
    const successorFootprint: TilingPaneFootprint | null = unionFootprints(successorFootprints);
    if (successorFootprint != null && successorLeafIds.length > 0) {
      overlays.push({
        subject: "successor",
        leafId: successorLeafIds[0],
        footprint: successorFootprint,
      });
    }
  }

  return overlays;
}

/**
 * Resolve the projected landing overlays for the current drag/drop state, keyed
 * by the subject taxonomy. Footprints are derived from `projectedLayout` (the
 * actual post-drop reducer tree), so what is drawn equals what will commit.
 */
export function resolveProjectedLandingOverlays(
  layout: TilingLayoutNode,
  projectedLayout: TilingLayoutNode | null,
  sourceLeafId: string | null,
  dropState: TilingDropIntentState | null,
  viewportWidth: number,
  viewportHeight: number,
  config: TilingLayoutConfig,
): ReadonlyArray<TilingProjectedLandingOverlay> {
  if (
    projectedLayout == null ||
    sourceLeafId == null ||
    dropState == null ||
    viewportWidth <= 0 ||
    viewportHeight <= 0
  ) {
    return [];
  }

  const projectedFootprints: ReadonlyMap<string, TilingPaneFootprint> = footprintsByLeafId(
    collectLeafFootprints(projectedLayout, 0, 0, viewportWidth, viewportHeight, config),
  );

  if (dropState.action === "swap") {
    return resolveSwapLandingOverlays(sourceLeafId, dropState.leafId, projectedFootprints);
  }
  if (dropState.action === "edge-insert") {
    return resolveInsertLandingOverlays(layout, sourceLeafId, projectedFootprints);
  }

  return [];
}
