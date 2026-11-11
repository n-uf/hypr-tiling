import { deriveCandidateTree, isCommittableTarget, type DragResolvedTarget } from "./drag-machine";
import { resolveLeafRects, type TilingRect } from "./leaf-geometry";
import { findGroupContainingLeaf, findLeafById } from "./state";
import type { TilingLayoutConfig, TilingLayoutNode, TilingLeafNode } from "./types";

/**
 * Where a dragged pane lands, DOM-free: the drop indicator's rect, the slot the
 * snap preview settles the pane into, and (by construction) the rect the pane
 * is laid out at once the drop commits, since all three come from the same
 * candidate tree (`deriveCandidateTree`, the tree the commit applies) laid out
 * by the renderer's own leaf geometry.
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
 * The rect (container px, origin at the container's top-left) the pane on
 * `sourceLeafId` lands at if the drag drops on `target`, or `null` when the
 * target does not commit (no target, the source itself, a non-committable
 * zone) or the pane would not be shown (an inactive group member).
 *
 * A pane that joins a group sits beside the group's tab strip, so the strip is
 * taken off its slot when it is shown (`groupStrip`).
 */
export function resolveDragLandingRect(params: {
  readonly layout: TilingLayoutNode;
  readonly sourceLeafId: string;
  readonly target: DragResolvedTarget | null;
  readonly container: { readonly width: number; readonly height: number };
  readonly config: TilingLayoutConfig;
  readonly groupStrip?: DragLandingGroupStrip;
}): TilingRect | null {
  const { layout, sourceLeafId, target, container, config } = params;
  if (!isCommittableTarget(target, sourceLeafId)) {
    return null;
  }
  const source: TilingLeafNode | null = findLeafById(layout, sourceLeafId);
  if (source == null) {
    return null;
  }
  const landed: TilingLayoutNode = deriveCandidateTree(layout, sourceLeafId, target);
  return resolveTileRect(landed, source.tileId, container, config, params.groupStrip ?? NO_DRAG_LANDING_GROUP_STRIP);
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
