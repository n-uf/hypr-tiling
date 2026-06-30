import { collectLeafFootprints, footprintsByLeafId } from "./leaf-geometry";
import { isStaticAlongSplitAxis, isStaticInDimension, splitAxisDimension } from "./pane-sizing";
import { PLACEMENT_BY_DROP_ZONE } from "./projected-layout";
import { insertLeafAdjacent } from "./state";
import type { TilingEdgeZone } from "./drop-intent-resolver";
import type {
  TilingLayoutConfig,
  TilingLayoutNode,
  TilingLeafDropZone,
  TilingPaneFootprint,
  TilingSplitAxis,
  TilingDimension,
} from "./types";

/**
 * Single source of truth for drop ELIGIBILITY / VALIDITY.
 *
 * The hit-zone resolver (`drop-intent-resolver.ts`) owns geometry only — which
 * of the five zones a pane-local cursor lands in. This module owns the orthogonal
 * "is this drop allowed?" question (swap / edge-insert eligibility, min-pane and
 * splitter-cost constraints, projected-insert footprint fit) and the per-subtree
 * static drag gate. The renderer hands the resolver a thin `evaluateZone`
 * closure delegating here, so the validity math is pure, headless-consumable,
 * and unit-tested — it is no longer embedded in the React component.
 */

/** @internal */
export interface DropZoneEvaluation {
  isValid: boolean;
  rejectionReason: string | null;
}

/**
 * Does the projected post-insert tree keep both the relocated source and the
 * split target at/above the per-pane minimum? Consumes the canonical
 * static-aware `collectLeafFootprints`, so the projected footprints next to a
 * pinned static pane are correct.
 * @internal
 */
export function projectedLeafFitsConstraints(
  projectedLayout: TilingLayoutNode,
  sourceLeafId: string,
  targetLeafId: string,
  viewportWidth: number,
  viewportHeight: number,
  minPaneSizePx: number,
  config: TilingLayoutConfig,
): boolean {
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return true;
  }

  const projectedLeafFootprints: ReadonlyMap<string, TilingPaneFootprint> = footprintsByLeafId(
    collectLeafFootprints(projectedLayout, 0, 0, viewportWidth, viewportHeight, config),
  );
  const sourceFootprint: TilingPaneFootprint | undefined = projectedLeafFootprints.get(sourceLeafId);
  const targetFootprint: TilingPaneFootprint | undefined = projectedLeafFootprints.get(targetLeafId);

  if (sourceFootprint == null || targetFootprint == null) {
    return false;
  }

  const footprintRespectsMin = (footprint: TilingPaneFootprint): boolean =>
    footprint.width >= minPaneSizePx && footprint.height >= minPaneSizePx;

  return footprintRespectsMin(sourceFootprint) && footprintRespectsMin(targetFootprint);
}

/** @internal */
export function evaluateEdgeInsertCandidate({
  candidateZone,
  layout,
  sourceLeafId,
  targetLeafId,
  targetFootprint,
  config,
  viewportWidth,
  viewportHeight,
}: {
  candidateZone: TilingEdgeZone;
  layout: TilingLayoutNode;
  sourceLeafId: string | null;
  targetLeafId: string;
  targetFootprint: TilingPaneFootprint;
  config: TilingLayoutConfig;
  viewportWidth: number;
  viewportHeight: number;
}): DropZoneEvaluation {
  const splitterCostPx: number = config.gapPx + config.handleSizePx;
  const minPaneSizePx: number = config.minPaneSizePx;
  const isHorizontalSplit: boolean = candidateZone === "left" || candidateZone === "right";
  const axisSpanPx: number = isHorizontalSplit ? targetFootprint.width : targetFootprint.height;
  const crossSpanPx: number = isHorizontalSplit ? targetFootprint.height : targetFootprint.width;
  const minimumAxisSpanRequiredPx: number = minPaneSizePx * 2 + splitterCostPx;

  if (axisSpanPx < minimumAxisSpanRequiredPx) {
    return {
      isValid: false,
      rejectionReason: `${candidateZone} rejected: axis span ${axisSpanPx.toFixed(1)}px < min ${minimumAxisSpanRequiredPx.toFixed(1)}px (2 panes + splitter/gap ${splitterCostPx}px)`,
    };
  }
  if (crossSpanPx < minPaneSizePx) {
    return {
      isValid: false,
      rejectionReason: `${candidateZone} rejected: cross span ${crossSpanPx.toFixed(1)}px < min ${minPaneSizePx}px`,
    };
  }
  if (sourceLeafId == null) {
    return {
      isValid: true,
      rejectionReason: null,
    };
  }

  const projectedLayout: TilingLayoutNode = insertLeafAdjacent(
    layout,
    sourceLeafId,
    targetLeafId,
    PLACEMENT_BY_DROP_ZONE[candidateZone],
    {
      preserveParentSplitAxis: false,
      splitRatio: 0.5,
    },
  );
  const fitsProjectedConstraints: boolean = projectedLeafFitsConstraints(
    projectedLayout,
    sourceLeafId,
    targetLeafId,
    viewportWidth,
    viewportHeight,
    minPaneSizePx,
    config,
  );

  return {
    isValid: fitsProjectedConstraints,
    rejectionReason: fitsProjectedConstraints
      ? null
      : `${candidateZone} rejected: projected source/target footprint violates min pane ${minPaneSizePx}px`,
  };
}

/** @internal */
export function evaluateZoneCandidate({
  zone,
  layout,
  sourceLeafId,
  targetLeafId,
  targetFootprint,
  config,
  viewportWidth,
  viewportHeight,
}: {
  zone: TilingLeafDropZone;
  layout: TilingLayoutNode;
  sourceLeafId: string | null;
  targetLeafId: string;
  targetFootprint: TilingPaneFootprint;
  config: TilingLayoutConfig;
  viewportWidth: number;
  viewportHeight: number;
}): DropZoneEvaluation {
  if (zone === "center") {
    if (sourceLeafId != null && sourceLeafId === targetLeafId) {
      return {
        isValid: false,
        rejectionReason: `center swap blocked: same source and target leaf (${targetLeafId})`,
      };
    }
    return { isValid: true, rejectionReason: null };
  }
  return evaluateEdgeInsertCandidate({
    candidateZone: zone,
    layout,
    sourceLeafId,
    targetLeafId,
    targetFootprint,
    config,
    viewportWidth,
    viewportHeight,
  });
}

/**
 * The along-axis pixel pin for a node static ALONG `axis`, or `null` for no
 * usable (finite, strictly-positive) pin. Mirrors `leaf-geometry`'s
 * `alongAxisPinPx`: a split with a fitting along-axis pin is geometry-resolvable
 * (static-aware footprints handle it), so it does NOT gate its flexible sibling.
 */
function alongAxisPinPx(node: TilingLayoutNode, axis: TilingSplitAxis): number | null {
  const dimension: TilingDimension = splitAxisDimension(axis);
  const pinPx: number | undefined = dimension === "width" ? node.sizing?.widthPx : node.sizing?.heightPx;
  if (pinPx == null || !Number.isFinite(pinPx) || pinPx <= 0) {
    return null;
  }
  return pinPx;
}

/** True when a child static-along-axis lacks a usable pin → its split's space distribution is unknowable. */
function childMakesSplitUnresolvable(node: TilingLayoutNode, axis: TilingSplitAxis): boolean {
  return isStaticAlongSplitAxis(node, axis) && alongAxisPinPx(node, axis) == null;
}

/**
 * Per-subtree static drag gate — the set of leaf ids that are NOT drag
 * participants (neither a drag source nor a swap/insert target). Replaces the
 * former whole-tree `layoutContainsStaticPane` gate, which disabled rearrange
 * across the ENTIRE tree whenever any static pane existed anywhere.
 *
 * A leaf is gated iff:
 *   1. it is static in EITHER dimension (a content-sized pane is not a clean
 *      drag participant — it has no ratio footprint to relocate or split), OR
 *   2. it lies under a split that has a child static-along-its-axis WITHOUT a
 *      usable pin: that split's space distribution is content-determined and
 *      unknowable to pure geometry, so neither the static child nor its flexible
 *      sibling has a trustworthy footprint → the whole subtree is gated.
 *
 * A split whose static-along-axis child IS pinned is geometry-resolvable
 * (static-aware `collectLeafFootprints` handles it), so rule 2 does NOT fire
 * there: only the static leaf itself (rule 1) is gated, and its flexible sibling
 * subtree stays fully rearrangeable. This is the per-subtree refinement — a
 * pinned "fixed-size pane + flexible rest" dashboard keeps drag live in the
 * flexible regions instead of freezing the whole layout.
 * @internal
 */
export function collectStaticGatedLeafIds(layout: TilingLayoutNode): ReadonlySet<string> {
  const gated = new Set<string>();

  function walk(node: TilingLayoutNode, inUnresolvableRegion: boolean): void {
    if (node.kind === "leaf") {
      const selfStatic: boolean =
        isStaticInDimension(node, "width") || isStaticInDimension(node, "height");
      if (inUnresolvableRegion || selfStatic) {
        gated.add(node.id);
      }
      return;
    }

    if (node.kind === "group") {
      // A group is one slot keyed by its active member — only the active member
      // is outer-visible / draggable. Gate it when the group itself is static
      // (or in an unresolvable region); inactive members have no footprint.
      const groupStatic: boolean =
        isStaticInDimension(node, "width") || isStaticInDimension(node, "height");
      if (inUnresolvableRegion || groupStatic) {
        gated.add(node.activeMemberId);
      }
      return;
    }

    const splitUnresolvable: boolean =
      childMakesSplitUnresolvable(node.first, node.axis) ||
      childMakesSplitUnresolvable(node.second, node.axis);
    const childRegionGated: boolean = inUnresolvableRegion || splitUnresolvable;
    walk(node.first, childRegionGated);
    walk(node.second, childRegionGated);
  }

  walk(layout, false);
  return gated;
}
