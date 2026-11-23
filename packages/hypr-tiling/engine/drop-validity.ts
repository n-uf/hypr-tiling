import { canSplitPane, dropFits, type DropVerdict, type Rect } from "@n-uf/placement/tiling";
import { resolveLeafRects } from "./leaf-geometry";
import {
  crossAxisDimension,
  isStaticAlongSplitAxis,
  isStaticInDimension,
  splitAxisDimension,
} from "./pane-sizing";
import { insertDragSubjectAdjacent } from "./projected-layout";
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
 * and unit-tested — it is no longer embedded in the React component. The room
 * rule on the measured target is `@n-uf/placement/tiling`'s `canSplitPane`;
 * the fit rule is its `dropFits` over hypr-tiling's own projection (with its
 * static normalization) laid out by placement; the rejection reasons stay
 * hypr-tiling's.
 */

/** @internal */
export interface DropZoneEvaluation {
  isValid: boolean;
  rejectionReason: string | null;
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
  subject,
}: {
  candidateZone: TilingEdgeZone;
  layout: TilingLayoutNode;
  sourceLeafId: string | null;
  targetLeafId: string;
  targetFootprint: TilingPaneFootprint;
  config: TilingLayoutConfig;
  viewportWidth: number;
  viewportHeight: number;
  /** What the drag moves: the whole group of `sourceLeafId` for `"group"`, else the pane. */
  subject?: "pane" | "group";
}): DropZoneEvaluation {
  const splitterCostPx: number = config.gapPx + config.handleSizePx;
  const minPaneSizePx: number = config.minPaneSizePx;
  const isHorizontalSplit: boolean = candidateZone === "left" || candidateZone === "right";

  // 1. Room on the target as measured: placement's room rule (two minimums plus the gutter along the split, one
  //    across it) on the footprint the caller measured, where the target sits with the source lifted out.
  const target: Rect = { x: targetFootprint.left, y: targetFootprint.top, width: targetFootprint.width, height: targetFootprint.height };
  const room: DropVerdict = canSplitPane(target, candidateZone, { gap: config.gapPx, handle: config.handleSizePx, min: minPaneSizePx });
  const spanRejection: "axis" | "cross" | null = room.ok ? null : room.reason?.includes("cross span") === true ? "cross" : "axis";
  if (spanRejection === "cross") {
    const crossSpanPx: number = isHorizontalSplit ? targetFootprint.height : targetFootprint.width;
    return {
      isValid: false,
      rejectionReason: `${candidateZone} rejected: cross span ${crossSpanPx.toFixed(1)}px < min ${minPaneSizePx}px`,
    };
  }
  if (spanRejection === "axis") {
    const axisSpanPx: number = isHorizontalSplit ? targetFootprint.width : targetFootprint.height;
    const minimumAxisSpanRequiredPx: number = minPaneSizePx * 2 + splitterCostPx;
    return {
      isValid: false,
      rejectionReason: `${candidateZone} rejected: axis span ${axisSpanPx.toFixed(1)}px < min ${minimumAxisSpanRequiredPx.toFixed(1)}px (2 panes + splitter/gap ${splitterCostPx}px)`,
    };
  }
  if (sourceLeafId == null) {
    return {
      isValid: true,
      rejectionReason: null,
    };
  }

  // 2. The tree the commit would apply, by the commit's own sequence (`insertDragSubjectAdjacent`): the subject is
  //    released first (a whole group as its node, so every member's room goes back to the neighbours, not only the
  //    dragged tab's), then placed beside the target; its static normalization re-pins collapsed panes to their new
  //    axis and demotes the second of two statics along one axis. Laid out by placement, placement's fit rule
  //    (`dropFits`) wants both panes there and at least the minimum wide and high, and passes when the viewport has
  //    no width or height yet (nothing to measure). A drop that moves nothing (onto itself, a source the tree can't
  //    lift, a target with no seat) is the layout as it stands.
  const projectedLayout: TilingLayoutNode = insertDragSubjectAdjacent(
    layout,
    sourceLeafId,
    targetLeafId,
    candidateZone,
    subject,
  );
  const viewport: Rect = { x: 0, y: 0, width: viewportWidth, height: viewportHeight };
  const fitsProjectedConstraints: boolean = dropFits(resolveLeafRects(projectedLayout, viewport, config), sourceLeafId, targetLeafId, viewport, {
    min: minPaneSizePx,
    side: candidateZone,
  }).ok;

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
  subject,
}: {
  zone: TilingLeafDropZone;
  layout: TilingLayoutNode;
  sourceLeafId: string | null;
  targetLeafId: string;
  targetFootprint: TilingPaneFootprint;
  config: TilingLayoutConfig;
  viewportWidth: number;
  viewportHeight: number;
  /** What the drag moves: the whole group of `sourceLeafId` for `"group"`, else the pane. */
  subject?: "pane" | "group";
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
    subject,
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

  // `parentAxis` is the nearest ancestor split's axis, threaded down exactly
  // like `state.ts`'s `writeLeafCollapsed` — it is what a COLLAPSED leaf's pin
  // runs ALONG (HT-PANE-COLLAPSE, axis-aware: height under a vertical parent,
  // width under a horizontal parent). `undefined` only for a rootless leaf
  // (the sole node in the tree), which has no split to gate against anyway.
  function walk(
    node: TilingLayoutNode,
    inUnresolvableRegion: boolean,
    parentAxis: TilingSplitAxis | undefined,
  ): void {
    if (node.kind === "leaf") {
      // HT-PANE-COLLAPSE: collapse pins the dimension ALONG the leaf's
      // immediate parent split's axis static to the KNOWN, geometry-resolvable
      // `collapsedExtentPx` chrome extent — it is not the "content-sized,
      // unknowable footprint" this gate exists for (rule 1's doc comment
      // above). Left ungated, a collapsed leaf stayed a drag source/target
      // exactly like an expanded one; exempting ONLY the collapse-forced
      // along-axis dimension still gates a leaf the user separately pinned
      // static on the CROSS dimension (the title-bar W•/H• toggle) even while
      // collapsed.
      const selfStatic: boolean =
        node.collapsed === true && parentAxis != null
          ? isStaticInDimension(node, crossAxisDimension(parentAxis))
          : isStaticInDimension(node, "width") || isStaticInDimension(node, "height");
      if (inUnresolvableRegion || selfStatic) {
        gated.add(node.id);
      }
      return;
    }

    if (node.kind === "group") {
      // A group is one slot keyed by its active member — only the active member
      // is outer-visible / draggable. Gate it when the group itself is static
      // (or in an unresolvable region); inactive members have no footprint.
      // Groups are not independently collapsible (HT-PANE-COLLAPSE targets loose
      // leaves only), so no collapse exemption applies here.
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
    walk(node.first, childRegionGated, node.axis);
    walk(node.second, childRegionGated, node.axis);
  }

  walk(layout, false, undefined);
  return gated;
}
