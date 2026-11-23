import { clampInto } from "@n-uf/placement";
import type { TilingDropIntentState } from "./drop-intent-resolver";
import { collectLeafFootprints, footprintsByLeafId, resolveLeafRects, type TilingRect } from "./leaf-geometry";
import { findGroupContainingLeaf, readLeafNodeIds, siblingSubtreeForLeaf } from "./state";
import type {
  TilingLayoutConfig,
  TilingLayoutNode,
  TilingLeafNode,
  TilingPaneFootprint,
  TilingProjectedLandingOverlay,
} from "./types";

/**
 * Where a dragged pane lands, DOM-free, drawn from the tree the drop commits
 * (placement's `after(place).tree`, see `tiling-drag-tree.ts`) laid out by the
 * renderer's own leaf geometry: the rect of a tile in a tree, the held pane
 * kept on the stage, and `dragMode: "preview"`'s landing overlays.
 */

/** The built-in group tab strip, as the renderer draws it: a group member's pane sits beside it. */
export interface DragLandingGroupStrip {
  /** Whether a group of two or more members shows its strip. */
  readonly visible: boolean;
  /** The strip's rendered height (CSS px). */
  readonly heightPx: number;
  /** Above or below the member. */
  readonly placement: "top" | "bottom";
}

/** No group strip: a group member fills its slot. */
export const NO_DRAG_LANDING_GROUP_STRIP: DragLandingGroupStrip = {
  visible: false,
  heightPx: 0,
  placement: "top",
};

/** The leaf of `node` that carries `tileId`, or `null`. */
export function findLeafByTileId(node: TilingLayoutNode, tileId: string): TilingLeafNode | null {
  if (node.kind === "leaf") {
    return node.tileId === tileId ? node : null;
  }
  if (node.kind === "group") {
    return node.members.find((member: TilingLeafNode): boolean => member.tileId === tileId) ?? null;
  }
  return findLeafByTileId(node.first, tileId) ?? findLeafByTileId(node.second, tileId);
}

/**
 * Where the held pane is drawn (container px): `held`, where the pointer holds it, moved (never resized) to lie
 * inside the stage, the container at `{ x: 0, y: 0 }`. This is `@n-uf/placement`'s `clampInto`, so a pane larger
 * than the stage keeps its top-left corner on the stage's along that axis. Only the drawing is clamped: the pointer
 * and the drop it resolves are left as they are. A stage not measured yet (no width or height) leaves `held` as given.
 */
export function clampHeldRectToStage(
  held: TilingRect,
  stage: { readonly width: number; readonly height: number },
): TilingRect {
  if (!(stage.width > 0) || !(stage.height > 0)) {
    return held;
  }
  return clampInto(held, { x: 0, y: 0, width: stage.width, height: stage.height });
}

/**
 * The rect (container px) the leaf carrying `tileId` is laid out at in `layout`,
 * or `null` when it is not shown. A member of a group with a visible strip
 * gives up the strip's height.
 */
export function resolveTileRect(
  layout: TilingLayoutNode,
  tileId: string,
  container: { readonly width: number; readonly height: number },
  config: TilingLayoutConfig,
  groupStrip: DragLandingGroupStrip = NO_DRAG_LANDING_GROUP_STRIP,
): TilingRect | null {
  const leaf: TilingLeafNode | null = findLeafByTileId(layout, tileId);
  if (leaf == null) {
    return null;
  }
  const rects: ReadonlyMap<string, TilingRect> = resolveLeafRects(
    layout,
    { x: 0, y: 0, width: container.width, height: container.height },
    config,
  );
  const rect: TilingRect | undefined = rects.get(leaf.id);
  if (rect == null) {
    return null;
  }
  const group = findGroupContainingLeaf(layout, leaf.id);
  if (group == null || !groupStrip.visible || group.members.length < 2) {
    return rect;
  }
  const height: number = Math.max(0, rect.height - groupStrip.heightPx);
  return groupStrip.placement === "top"
    ? { x: rect.x, y: rect.y + (rect.height - height), width: rect.width, height }
    : { x: rect.x, y: rect.y, width: rect.width, height };
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
  return { left: minLeft, top: minTop, width: maxRight - minLeft, height: maxBottom - minTop };
}

/**
 * A swap's overlays: the dragged source lands in the target's cell, and the target lands in the source's old cell.
 * The swap keeps both leaves where they are and trades their tiles, so the two footprints are the current cells,
 * with the subject that lands in each inverted relative to leaf identity.
 */
function resolveSwapLandingOverlays(
  sourceLeafId: string,
  targetLeafId: string,
  projectedFootprints: ReadonlyMap<string, TilingPaneFootprint>,
): ReadonlyArray<TilingProjectedLandingOverlay> {
  const overlays: Array<TilingProjectedLandingOverlay> = [];
  const sourceLandingFootprint: TilingPaneFootprint | undefined = projectedFootprints.get(targetLeafId);
  if (sourceLandingFootprint != null) {
    overlays.push({ subject: "source", leafId: targetLeafId, footprint: sourceLandingFootprint });
  }
  const targetLandingFootprint: TilingPaneFootprint | undefined = projectedFootprints.get(sourceLeafId);
  if (targetLandingFootprint != null) {
    overlays.push({ subject: "target", leafId: sourceLeafId, footprint: targetLandingFootprint });
  }
  return overlays;
}

/**
 * A side's overlays: the source relocates next to the target, and the source's former sibling subtree takes the
 * vacated cell as the `successor`. No `target` overlay: an insert does not displace the target.
 */
function resolveInsertLandingOverlays(
  layout: TilingLayoutNode,
  sourceLeafId: string,
  projectedFootprints: ReadonlyMap<string, TilingPaneFootprint>,
): ReadonlyArray<TilingProjectedLandingOverlay> {
  const overlays: Array<TilingProjectedLandingOverlay> = [];
  const sourceLandingFootprint: TilingPaneFootprint | undefined = projectedFootprints.get(sourceLeafId);
  if (sourceLandingFootprint != null) {
    overlays.push({ subject: "source", leafId: sourceLeafId, footprint: sourceLandingFootprint });
  }
  const siblingSubtree: TilingLayoutNode | null = siblingSubtreeForLeaf(layout, sourceLeafId);
  if (siblingSubtree != null) {
    const successorLeafIds: ReadonlyArray<string> = readLeafNodeIds(siblingSubtree);
    const successorFootprints: ReadonlyArray<TilingPaneFootprint> = successorLeafIds
      .map((leafId: string): TilingPaneFootprint | undefined => projectedFootprints.get(leafId))
      .filter((footprint: TilingPaneFootprint | undefined): footprint is TilingPaneFootprint => footprint != null);
    const successorFootprint: TilingPaneFootprint | null = unionFootprints(successorFootprints);
    if (successorFootprint != null && successorLeafIds.length > 0) {
      overlays.push({ subject: "successor", leafId: successorLeafIds[0]!, footprint: successorFootprint });
    }
  }
  return overlays;
}

/**
 * `dragMode: "preview"`'s landing overlays for the held drop, keyed by the subject taxonomy (`source`, `target`,
 * `successor`). Footprints are laid out from `projectedLayout`, the tree the release commits (`after(place).tree`), so
 * what is drawn equals what commits. None when nothing commits (`projectedLayout` null) or the stage is not measured.
 * @internal
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
  if (projectedLayout == null || sourceLeafId == null || dropState == null || viewportWidth <= 0 || viewportHeight <= 0) {
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
