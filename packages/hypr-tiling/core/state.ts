import {
  clampByMinSize,
  crossAxisDimension,
  isStaticAlongSplitAxis,
} from "./pane-sizing";
import { collectNormalizedLeafRects, type LeafRect } from "./leaf-geometry";
import type {
  TilingFocusDirection,
  TilingGroupNode,
  TilingInsertionOptions,
  TilingLayoutMode,
  TilingLayoutNode,
  TilingLeafNode,
  TilingMasterOrientation,
  TilingMovePlacement,
  TilingSplitAxis,
  TilingSplitNode,
  TilingDimension,
  TilingPaneCycleDirection,
  TilingPaneSizing,
} from "./types";

const MIN_RATIO: number = 0.05;
const MAX_RATIO: number = 0.95;
const DEFAULT_INSERTION_OPTIONS: TilingInsertionOptions = {
  preserveParentSplitAxis: true,
  splitRatio: 0.5,
};

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }

  return Math.min(Math.max(value, MIN_RATIO), MAX_RATIO);
}

/**
 * Return a copy of the tree with split node `splitId`'s divider `ratio` set
 * (clamped to the legal range). Unchanged when no split with that id exists.
 */
export function updateSplitRatio(
  node: TilingLayoutNode,
  splitId: string,
  ratio: number,
): TilingLayoutNode {
  if (node.kind === "leaf") {
    return node;
  }

  if (node.kind === "group") {
    return node;
  }

  if (node.id === splitId) {
    return {
      ...node,
      ratio: clampRatio(ratio),
    };
  }

  return {
    ...node,
    first: updateSplitRatio(node.first, splitId, ratio),
    second: updateSplitRatio(node.second, splitId, ratio),
  };
}

function replaceLeafTileById(
  node: TilingLayoutNode,
  leafId: string,
  tileId: string,
): TilingLayoutNode {
  if (node.kind === "leaf") {
    if (node.id !== leafId) {
      return node;
    }

    return {
      ...node,
      tileId,
    };
  }

  if (node.kind === "group") {
    const members: ReadonlyArray<TilingLeafNode> = node.members.map(
      (member: TilingLeafNode): TilingLeafNode =>
        member.id === leafId ? { ...member, tileId } : member,
    );
    return { ...node, members };
  }

  return {
    ...node,
    first: replaceLeafTileById(node.first, leafId, tileId),
    second: replaceLeafTileById(node.second, leafId, tileId),
  };
}

function writeLeafSizing(
  node: TilingLayoutNode,
  leafId: string,
  sizing: TilingPaneSizing | undefined,
): TilingLayoutNode {
  if (node.kind === "leaf") {
    if (node.id !== leafId) {
      return node;
    }
    const hasStatic: boolean =
      sizing != null && (sizing.width === "static" || sizing.height === "static");
    return {
      ...node,
      sizing: hasStatic ? sizing : undefined,
    };
  }

  if (node.kind === "group") {
    // A group is a slot; static sizing targeting any of its members pins the
    // GROUP (the slot), mirroring "a group can be static like a leaf".
    const targetsMember: boolean = node.members.some(
      (member: TilingLeafNode): boolean => member.id === leafId,
    );
    if (!targetsMember) {
      return node;
    }
    const hasStatic: boolean =
      sizing != null && (sizing.width === "static" || sizing.height === "static");
    return {
      ...node,
      sizing: hasStatic ? sizing : undefined,
    };
  }

  return {
    ...node,
    first: writeLeafSizing(node.first, leafId, sizing),
    second: writeLeafSizing(node.second, leafId, sizing),
  };
}

/**
 * Demote a node's ALONG-the-given-axis static dimension back to flexible while
 * PRESERVING its cross-axis static sizing + px. For a horizontal split the along
 * dimension is `width` (cleared), the cross dimension is `height` (kept); for a
 * vertical split it is the reverse. When the node carries no cross-axis static
 * sizing to preserve it becomes fully flexible (`sizing: undefined`, matching the
 * `setLeafSizing` "no static dims → undefined" convention).
 */
function demoteAlongAxisStatic(
  node: TilingLayoutNode,
  axis: TilingSplitAxis,
): TilingLayoutNode {
  if (node.sizing == null) {
    return node;
  }
  const crossDimension: TilingDimension = crossAxisDimension(axis);
  const crossIsStatic: boolean = node.sizing[crossDimension] === "static";
  if (!crossIsStatic) {
    return { ...node, sizing: undefined };
  }
  const nextSizing: TilingPaneSizing =
    crossDimension === "width"
      ? { width: "static", widthPx: node.sizing.widthPx }
      : { height: "static", heightPx: node.sizing.heightPx };
  return { ...node, sizing: nextSizing };
}

/**
 * Enforce the per-split invariant **"at least one child flexes ALONG the split's
 * own axis"** across the whole tree, bottom-up. Two fixed extents along one axis
 * cannot continuously sum to a variable container, so a split whose BOTH children
 * are static-along-its-axis (`{content, content}`) opens a trailing gap on any
 * later container-extent change (the Round-2 static-gap defect). This normalizer
 * forbids that state: when both children are static along the split axis it
 * demotes the SECOND child's along-axis static dimension to flexible (preserving
 * its cross-axis static sizing + px and the first child's pin) so the split
 * becomes `{content, fill}` and the axis re-absorbs any container delta.
 *
 * Deterministic (always the `second` child — the "last edge to become static
 * yields the filler"), pure, and idempotent: a tree that already satisfies the
 * invariant is returned by the SAME reference (no allocation). Call at the tail
 * of every mutation that can create a both-static-along-axis edge — the
 * static-switch path (`setLeafSizing`) and the extraction/removal movers
 * (`removeLeafTile`, `insertLeafAdjacent`, `moveLeafToRoot`,
 * `moveLeafToSplitContainer`) — so both the reachable and the latent triggers are
 * covered.
 */
export function normalizeStaticAxisFill(node: TilingLayoutNode): TilingLayoutNode {
  if (node.kind === "leaf" || node.kind === "group") {
    return node;
  }

  const normalizedFirst: TilingLayoutNode = normalizeStaticAxisFill(node.first);
  let normalizedSecond: TilingLayoutNode = normalizeStaticAxisFill(node.second);

  if (
    isStaticAlongSplitAxis(normalizedFirst, node.axis) &&
    isStaticAlongSplitAxis(normalizedSecond, node.axis)
  ) {
    normalizedSecond = demoteAlongAxisStatic(normalizedSecond, node.axis);
  }

  if (normalizedFirst === node.first && normalizedSecond === node.second) {
    return node;
  }
  return { ...node, first: normalizedFirst, second: normalizedSecond };
}

/**
 * Immutably set (or clear) the per-dimension `sizing` on a single leaf. Passing
 * `undefined` (or a `sizing` with no static dimensions) leaves the leaf
 * flexible. Used by the showcase per-pane static control. The result is passed
 * through `normalizeStaticAxisFill` so a static switch can never store a
 * both-static-along-axis edge (the second along-axis sibling lands as
 * cross-axis-static + along-axis-fill instead) — closing the reachable
 * static-switch gap trigger at the data layer.
 */
export function setLeafSizing(
  node: TilingLayoutNode,
  leafId: string,
  sizing: TilingPaneSizing | undefined,
): TilingLayoutNode {
  return normalizeStaticAxisFill(writeLeafSizing(node, leafId, sizing));
}

/** Find the leaf with id `leafId` anywhere in the tree (including inside a group), or `null`. */
export function findLeafById(
  node: TilingLayoutNode,
  leafId: string,
): TilingLeafNode | null {
  if (node.kind === "leaf") {
    return node.id === leafId ? node : null;
  }

  if (node.kind === "group") {
    return node.members.find((member: TilingLeafNode): boolean => member.id === leafId) ?? null;
  }

  return findLeafById(node.first, leafId) ?? findLeafById(node.second, leafId);
}

/**
 * Return a copy of the tree with the two leaves' tiles exchanged in place.
 * Unchanged when the ids are equal or either leaf is missing.
 */
export function swapLeafTiles(
  node: TilingLayoutNode,
  firstLeafId: string,
  secondLeafId: string,
): TilingLayoutNode {
  if (firstLeafId === secondLeafId) {
    return node;
  }

  const firstLeaf: TilingLeafNode | null = findLeafById(node, firstLeafId);
  const secondLeaf: TilingLeafNode | null = findLeafById(node, secondLeafId);

  if (firstLeaf == null || secondLeaf == null) {
    return node;
  }

  const withFirstReplaced: TilingLayoutNode = replaceLeafTileById(
    node,
    firstLeafId,
    secondLeaf.tileId,
  );

  return replaceLeafTileById(withFirstReplaced, secondLeafId, firstLeaf.tileId);
}

/** Every split node in the tree (depth-first, reading order). */
export function collectSplitNodes(node: TilingLayoutNode): ReadonlyArray<TilingSplitNode> {
  if (node.kind === "leaf" || node.kind === "group") {
    return [];
  }

  return [node, ...collectSplitNodes(node.first), ...collectSplitNodes(node.second)];
}

/**
 * The leaf ids the OUTER layout sees: a leaf contributes its id; a group
 * contributes ONLY its active member id (the group presents as one pane to the
 * outer layout — pane-cycle / jump / directional focus see the active member).
 * Use `readGroupMemberIds` / `collectGroups` to enumerate ALL members for tab UI.
 */
export function readLeafNodeIds(node: TilingLayoutNode): ReadonlyArray<string> {
  if (node.kind === "leaf") {
    return [node.id];
  }

  if (node.kind === "group") {
    return [node.activeMemberId];
  }

  return [...readLeafNodeIds(node.first), ...readLeafNodeIds(node.second)];
}

/** Every group in the tree (depth-first, reading order) — the tab-strip source. */
export function collectGroups(node: TilingLayoutNode): ReadonlyArray<TilingGroupNode> {
  if (node.kind === "leaf") {
    return [];
  }

  if (node.kind === "group") {
    return [node];
  }

  return [...collectGroups(node.first), ...collectGroups(node.second)];
}

/** All member ids of every group (for whole-tree member enumeration). */
export function readGroupMemberIds(node: TilingLayoutNode): ReadonlyArray<string> {
  return collectGroups(node).flatMap((group: TilingGroupNode): ReadonlyArray<string> =>
    group.members.map((member: TilingLeafNode): string => member.id),
  );
}

/** The group that contains `leafId` as a member, or `null`. */
export function findGroupContainingLeaf(
  node: TilingLayoutNode,
  leafId: string,
): TilingGroupNode | null {
  return (
    collectGroups(node).find((group: TilingGroupNode): boolean =>
      group.members.some((member: TilingLeafNode): boolean => member.id === leafId),
    ) ?? null
  );
}

/** Find a group node by its id. */
export function findGroupById(
  node: TilingLayoutNode,
  groupId: string,
): TilingGroupNode | null {
  return collectGroups(node).find((group: TilingGroupNode): boolean => group.id === groupId) ?? null;
}

/**
 * Structural validity check for a layout tree — the commit-time backstop that
 * guarantees a drag never persists a corrupt tree (orphaned / duplicated /
 * empty-id leaf, missing split child, NaN ratio). Pure + recursive:
 *
 * - every leaf has a non-empty `id` and `tileId`;
 * - every split has BOTH children present and individually valid, with a finite
 *   `ratio` in the open interval `(0, 1)`;
 * - NO leaf id appears more than once across the whole tree (the single-instance
 *   invariant at the data layer — a duplicated dragged leaf is exactly the BUG-1
 *   class this rejects).
 *
 * The renderer calls this on the derived candidate BEFORE `onLayoutChange`; an
 * invalid tree is refused (the drag falls back to cancel) so a broken commit can
 * never reach consumer state.
 */
export function isStructurallyValidLayout(node: TilingLayoutNode): boolean {
  const seenLeafIds = new Set<string>();

  function walk(current: TilingLayoutNode): boolean {
    if (current.kind === "leaf") {
      if (current.id.length === 0 || current.tileId.length === 0) {
        return false;
      }
      if (seenLeafIds.has(current.id)) {
        return false;
      }
      seenLeafIds.add(current.id);
      return true;
    }
    if (current.kind === "group") {
      // A group needs ≥1 member, a non-empty id, every member a valid leaf with a
      // unique id, and `activeMemberId` present among the members.
      if (current.id.length === 0 || current.members.length === 0) {
        return false;
      }
      const memberIds = new Set<string>();
      for (const member of current.members) {
        if (!walk(member)) {
          return false;
        }
        memberIds.add(member.id);
      }
      return memberIds.has(current.activeMemberId);
    }
    if (current.first == null || current.second == null) {
      return false;
    }
    if (!Number.isFinite(current.ratio) || current.ratio <= 0 || current.ratio >= 1) {
      return false;
    }
    return walk(current.first) && walk(current.second);
  }

  return walk(node);
}

function normalizedInsertionOptions(options?: Partial<TilingInsertionOptions>): TilingInsertionOptions {
  const safeRatio: number = clampRatio(options?.splitRatio ?? DEFAULT_INSERTION_OPTIONS.splitRatio);
  return {
    preserveParentSplitAxis:
      options?.preserveParentSplitAxis ?? DEFAULT_INSERTION_OPTIONS.preserveParentSplitAxis,
    splitRatio: safeRatio,
  };
}

function parentSplitForLeaf(
  node: TilingLayoutNode,
  leafId: string,
): TilingSplitNode | null {
  if (node.kind === "leaf" || node.kind === "group") {
    return null;
  }

  if (
    (node.first.kind === "leaf" && node.first.id === leafId) ||
    (node.second.kind === "leaf" && node.second.id === leafId)
  ) {
    return node;
  }

  return parentSplitForLeaf(node.first, leafId) ?? parentSplitForLeaf(node.second, leafId);
}

/**
 * The subtree that gets promoted into a leaf's vacated cell when that leaf is
 * extracted by `insertLeafAdjacent` / `moveLeafTo*`.
 *
 * When a leaf is removed from its parent split, `extractLeafNode` collapses the
 * parent and the leaf's former sibling branch takes the parent's slot, absorbing
 * the released space. That sibling branch is the "successor" of the extracted
 * leaf. Returns `null` for a root leaf (no parent) or an unknown id.
 */
export function siblingSubtreeForLeaf(
  node: TilingLayoutNode,
  leafId: string,
): TilingLayoutNode | null {
  const parentSplit: TilingSplitNode | null = parentSplitForLeaf(node, leafId);
  if (parentSplit == null) {
    return null;
  }
  const firstIsLeaf: boolean = parentSplit.first.kind === "leaf" && parentSplit.first.id === leafId;
  return firstIsLeaf ? parentSplit.second : parentSplit.first;
}

function inferredAxisFromPlacement(placement: TilingMovePlacement): "horizontal" | "vertical" {
  if (placement === "left" || placement === "right") {
    return "horizontal";
  }
  return "vertical";
}

function resolveInsertionAxis(
  layout: TilingLayoutNode,
  targetLeafId: string,
  placement: TilingMovePlacement,
  options: TilingInsertionOptions,
): "horizontal" | "vertical" {
  if (!options.preserveParentSplitAxis) {
    return inferredAxisFromPlacement(placement);
  }

  const parentSplit: TilingSplitNode | null = parentSplitForLeaf(layout, targetLeafId);
  if (parentSplit == null) {
    return inferredAxisFromPlacement(placement);
  }
  return parentSplit.axis;
}

interface ExtractedLeafResult {
  nextNode: TilingLayoutNode | null;
  extractedLeaf: TilingLeafNode | null;
}

function extractLeafNode(node: TilingLayoutNode, leafId: string): ExtractedLeafResult {
  if (node.kind === "leaf") {
    if (node.id !== leafId) {
      return { nextNode: node, extractedLeaf: null };
    }
    return { nextNode: null, extractedLeaf: node };
  }

  if (node.kind === "group") {
    const index: number = node.members.findIndex(
      (member: TilingLeafNode): boolean => member.id === leafId,
    );
    if (index === -1) {
      return { nextNode: node, extractedLeaf: null };
    }
    const extractedLeaf: TilingLeafNode = node.members[index];
    const remaining: ReadonlyArray<TilingLeafNode> = node.members.filter(
      (_member: TilingLeafNode, memberIndex: number): boolean => memberIndex !== index,
    );
    // Sole member extracted → the group empties; the caller collapses the parent
    // split exactly as it would for a removed root leaf.
    if (remaining.length === 0) {
      return { nextNode: null, extractedLeaf };
    }
    // One member left → a group of one is degenerate; collapse to the bare leaf.
    if (remaining.length === 1) {
      return { nextNode: remaining[0], extractedLeaf };
    }
    const activeMemberId: string =
      node.activeMemberId === leafId
        ? remaining[Math.min(index, remaining.length - 1)].id
        : node.activeMemberId;
    return { nextNode: { ...node, members: remaining, activeMemberId }, extractedLeaf };
  }

  const firstExtraction: ExtractedLeafResult = extractLeafNode(node.first, leafId);
  if (firstExtraction.extractedLeaf != null) {
    if (firstExtraction.nextNode == null) {
      return {
        nextNode: node.second,
        extractedLeaf: firstExtraction.extractedLeaf,
      };
    }

    return {
      nextNode: {
        ...node,
        first: firstExtraction.nextNode,
      },
      extractedLeaf: firstExtraction.extractedLeaf,
    };
  }

  const secondExtraction: ExtractedLeafResult = extractLeafNode(node.second, leafId);
  if (secondExtraction.extractedLeaf != null) {
    if (secondExtraction.nextNode == null) {
      return {
        nextNode: node.first,
        extractedLeaf: secondExtraction.extractedLeaf,
      };
    }

    return {
      nextNode: {
        ...node,
        second: secondExtraction.nextNode,
      },
      extractedLeaf: secondExtraction.extractedLeaf,
    };
  }

  return { nextNode: node, extractedLeaf: null };
}

function buildSplitNodeWithPlacement(
  targetNode: TilingLayoutNode,
  insertedLeafNode: TilingLayoutNode,
  splitId: string,
  axis: "horizontal" | "vertical",
  placement: TilingMovePlacement,
  ratio: number,
): TilingSplitNode {
  const placeInsertedFirst: boolean = placement === "left" || placement === "top";
  const firstNode: TilingLayoutNode = placeInsertedFirst ? insertedLeafNode : targetNode;
  const secondNode: TilingLayoutNode = placeInsertedFirst ? targetNode : insertedLeafNode;

  return {
    kind: "split",
    id: splitId,
    axis,
    ratio,
    first: firstNode,
    second: secondNode,
  };
}

function insertLeafAroundTarget(
  node: TilingLayoutNode,
  targetLeafId: string,
  insertedLeafNode: TilingLayoutNode,
  splitId: string,
  axis: "horizontal" | "vertical",
  placement: TilingMovePlacement,
  ratio: number,
): TilingLayoutNode {
  if (node.kind === "leaf") {
    if (node.id !== targetLeafId) {
      return node;
    }
    return buildSplitNodeWithPlacement(
      node,
      insertedLeafNode,
      splitId,
      axis,
      placement,
      ratio,
    );
  }

  if (node.kind === "group") {
    // A group is a slot keyed by its active member; an edge-insert that targets
    // the group (the renderer passes the active member id) wraps the WHOLE group
    // in a split so the inserted leaf lands beside the group, not inside it.
    if (node.activeMemberId !== targetLeafId) {
      return node;
    }
    return buildSplitNodeWithPlacement(
      node,
      insertedLeafNode,
      splitId,
      axis,
      placement,
      ratio,
    );
  }

  return {
    ...node,
    first: insertLeafAroundTarget(
      node.first,
      targetLeafId,
      insertedLeafNode,
      splitId,
      axis,
      placement,
      ratio,
    ),
    second: insertLeafAroundTarget(
      node.second,
      targetLeafId,
      insertedLeafNode,
      splitId,
      axis,
      placement,
      ratio,
    ),
  };
}

function insertLeafIntoSplitContainer(
  node: TilingLayoutNode,
  targetSplitId: string,
  insertedLeafNode: TilingLeafNode,
  placement: "first" | "second",
  options: TilingInsertionOptions,
): TilingLayoutNode {
  if (node.kind === "leaf" || node.kind === "group") {
    return node;
  }

  if (node.id === targetSplitId) {
    const existingBranch: TilingLayoutNode = placement === "first" ? node.first : node.second;
    const newBranch: TilingLayoutNode = {
      kind: "split",
      id: `${targetSplitId}-insert-${insertedLeafNode.id}`,
      axis: node.axis,
      ratio: options.splitRatio,
      first: placement === "first" ? insertedLeafNode : existingBranch,
      second: placement === "first" ? existingBranch : insertedLeafNode,
    };

    return {
      ...node,
      first: placement === "first" ? newBranch : node.first,
      second: placement === "first" ? node.second : newBranch,
    };
  }

  return {
    ...node,
    first: insertLeafIntoSplitContainer(node.first, targetSplitId, insertedLeafNode, placement, options),
    second: insertLeafIntoSplitContainer(node.second, targetSplitId, insertedLeafNode, placement, options),
  };
}

/**
 * Move `sourceLeafId` adjacent to `targetLeafId`, wrapping them in a new split
 * on the resolved axis with the source on the `placement` side. Unchanged when
 * the source and target are the same or the source cannot be extracted.
 */
export function insertLeafAdjacent(
  layout: TilingLayoutNode,
  sourceLeafId: string,
  targetLeafId: string,
  placement: TilingMovePlacement,
  options?: Partial<TilingInsertionOptions>,
): TilingLayoutNode {
  if (sourceLeafId === targetLeafId) {
    return layout;
  }

  const normalizedOptions: TilingInsertionOptions = normalizedInsertionOptions(options);
  const extraction: ExtractedLeafResult = extractLeafNode(layout, sourceLeafId);
  if (extraction.extractedLeaf == null || extraction.nextNode == null) {
    return layout;
  }

  const axis: "horizontal" | "vertical" = resolveInsertionAxis(
    extraction.nextNode,
    targetLeafId,
    placement,
    normalizedOptions,
  );
  const splitId: string = `split-${sourceLeafId}-${targetLeafId}-${placement}`;

  return normalizeStaticAxisFill(
    insertLeafAroundTarget(
      extraction.nextNode,
      targetLeafId,
      extraction.extractedLeaf,
      splitId,
      axis,
      placement,
      normalizedOptions.splitRatio,
    ),
  );
}

/**
 * Remove a leaf from the tree and collapse its now-single-child parent split so
 * the leaf's former sibling subtree takes the parent's slot and absorbs the
 * released space — the standard tiling gap-close. Returns a NEW tree (the input
 * is never mutated).
 *
 * Removal + parent collapse reuses the same `extractLeafNode` machinery that
 * `insertLeafAdjacent` / `moveLeafTo*` already rely on; this reducer exposes the
 * gap-closed remainder directly (it is `insertLeafAdjacent` minus the re-insert).
 * It is the pickup step of the Hyprland-style "live" drag: the dragged leaf is
 * detached once on pickup and the remaining tree reflows once to close the gap.
 *
 * Returns the layout UNCHANGED when the leaf id is absent, or when it is the
 * root leaf (a root with no parent cannot be removed without emptying the tree).
 */
export function removeLeafTile(
  layout: TilingLayoutNode,
  leafId: string,
): TilingLayoutNode {
  const extraction: ExtractedLeafResult = extractLeafNode(layout, leafId);
  if (extraction.extractedLeaf == null || extraction.nextNode == null) {
    return layout;
  }
  return normalizeStaticAxisFill(extraction.nextNode);
}

/**
 * Move `sourceLeafId` out to a new root-level split, placing it on the
 * `placement` side alongside the remainder of the tree. Unchanged when the
 * source cannot be extracted.
 */
export function moveLeafToRoot(
  layout: TilingLayoutNode,
  sourceLeafId: string,
  placement: "first" | "second",
  options?: Partial<TilingInsertionOptions>,
): TilingLayoutNode {
  const normalizedOptions: TilingInsertionOptions = normalizedInsertionOptions(options);
  const extraction: ExtractedLeafResult = extractLeafNode(layout, sourceLeafId);
  if (extraction.extractedLeaf == null || extraction.nextNode == null) {
    return layout;
  }

  return normalizeStaticAxisFill({
    kind: "split",
    id: `root-move-${sourceLeafId}`,
    axis: extraction.nextNode.kind === "split" ? extraction.nextNode.axis : "horizontal",
    ratio: normalizedOptions.splitRatio,
    first: placement === "first" ? extraction.extractedLeaf : extraction.nextNode,
    second: placement === "first" ? extraction.nextNode : extraction.extractedLeaf,
  });
}

/**
 * Move `sourceLeafId` into the existing split container `targetSplitId` on the
 * `placement` side. Unchanged when the source cannot be extracted.
 */
export function moveLeafToSplitContainer(
  layout: TilingLayoutNode,
  sourceLeafId: string,
  targetSplitId: string,
  placement: "first" | "second",
  options?: Partial<TilingInsertionOptions>,
): TilingLayoutNode {
  const normalizedOptions: TilingInsertionOptions = normalizedInsertionOptions(options);
  const extraction: ExtractedLeafResult = extractLeafNode(layout, sourceLeafId);
  if (extraction.extractedLeaf == null || extraction.nextNode == null) {
    return layout;
  }

  return normalizeStaticAxisFill(
    insertLeafIntoSplitContainer(
      extraction.nextNode,
      targetSplitId,
      extraction.extractedLeaf,
      placement,
      normalizedOptions,
    ),
  );
}

/**
 * Return a copy of the tree with split node `splitId`'s axis flipped
 * (horizontal ↔ vertical). Unchanged when no split with that id exists.
 */
export function toggleSplitAxis(
  node: TilingLayoutNode,
  splitId: string,
): TilingLayoutNode {
  if (node.kind === "leaf" || node.kind === "group") {
    return node;
  }

  if (node.id === splitId) {
    return {
      ...node,
      axis: node.axis === "horizontal" ? "vertical" : "horizontal",
    };
  }

  return {
    ...node,
    first: toggleSplitAxis(node.first, splitId),
    second: toggleSplitAxis(node.second, splitId),
  };
}

/** Ring order for `cycleSplitMasterOrientation` (left → top → right → bottom → …). */
const MASTER_ORIENTATION_RING: ReadonlyArray<TilingMasterOrientation> = [
  "left",
  "top",
  "right",
  "bottom",
];

/**
 * Find the split with `splitId` and rewrite it via `rewrite`, returning the SAME
 * reference when nothing changes (so a no-op never re-renders downstream). The
 * shared spine for the master/stack layout-mode reducers — mirrors the
 * find-by-id recursion `updateSplitRatio` / `toggleSplitAxis` use, but factored
 * so each master reducer states only its per-split transform.
 */
function rewriteSplitById(
  node: TilingLayoutNode,
  splitId: string,
  rewrite: (split: TilingSplitNode) => TilingSplitNode,
): TilingLayoutNode {
  if (node.kind === "leaf" || node.kind === "group") {
    return node;
  }
  if (node.id === splitId) {
    return rewrite(node);
  }
  const first: TilingLayoutNode = rewriteSplitById(node.first, splitId, rewrite);
  const second: TilingLayoutNode = rewriteSplitById(node.second, splitId, rewrite);
  if (first === node.first && second === node.second) {
    return node;
  }
  return { ...node, first, second };
}

/** Resolved (defaulted) master count for a split, clamped to its slot count. */
function resolvedMasterCount(split: TilingSplitNode): number {
  const slotCount: number = Math.max(readLeafNodeIds(split).length, 1);
  return Math.min(Math.max(Math.round(split.masterCount ?? 1), 1), slotCount);
}

/**
 * Set a split's layout mode (dwindle ⇄ master). The geometry resolver keys off
 * `layoutMode === "master"`; dwindle is the default for an undefined field, but
 * this stores the literal mode so the value round-trips through persistence.
 */
export function setSplitLayoutMode(
  layout: TilingLayoutNode,
  splitId: string,
  mode: TilingLayoutMode,
): TilingLayoutNode {
  return rewriteSplitById(layout, splitId, (split: TilingSplitNode): TilingSplitNode =>
    (split.layoutMode ?? "dwindle") === mode ? split : { ...split, layoutMode: mode },
  );
}

/** Toggle a split between dwindle and master (the Hyprland layout-toggle analog). */
export function cycleSplitLayoutMode(
  layout: TilingLayoutNode,
  splitId: string,
): TilingLayoutNode {
  return rewriteSplitById(layout, splitId, (split: TilingSplitNode): TilingSplitNode => ({
    ...split,
    layoutMode: (split.layoutMode ?? "dwindle") === "master" ? "dwindle" : "master",
  }));
}

/** Set a split's master-area count, clamped to `[1, slotCount]`. */
export function setSplitMasterCount(
  layout: TilingLayoutNode,
  splitId: string,
  count: number,
): TilingLayoutNode {
  return rewriteSplitById(layout, splitId, (split: TilingSplitNode): TilingSplitNode => {
    const slotCount: number = Math.max(readLeafNodeIds(split).length, 1);
    const next: number = Math.min(Math.max(Math.round(count), 1), slotCount);
    return next === resolvedMasterCount(split) ? split : { ...split, masterCount: next };
  });
}

/** Add/remove master tiles by `delta`, clamped to `[1, slotCount]`. */
export function adjustSplitMasterCount(
  layout: TilingLayoutNode,
  splitId: string,
  delta: number,
): TilingLayoutNode {
  return rewriteSplitById(layout, splitId, (split: TilingSplitNode): TilingSplitNode => {
    const slotCount: number = Math.max(readLeafNodeIds(split).length, 1);
    const current: number = resolvedMasterCount(split);
    const next: number = Math.min(Math.max(current + Math.round(delta), 1), slotCount);
    return next === current ? split : { ...split, masterCount: next };
  });
}

/** Set a split's master-area orientation. */
export function setSplitMasterOrientation(
  layout: TilingLayoutNode,
  splitId: string,
  orientation: TilingMasterOrientation,
): TilingLayoutNode {
  return rewriteSplitById(layout, splitId, (split: TilingSplitNode): TilingSplitNode =>
    (split.masterOrientation ?? "left") === orientation
      ? split
      : { ...split, masterOrientation: orientation },
  );
}

/** Cycle a split's master orientation left → top → right → bottom → left. */
export function cycleSplitMasterOrientation(
  layout: TilingLayoutNode,
  splitId: string,
): TilingLayoutNode {
  return rewriteSplitById(layout, splitId, (split: TilingSplitNode): TilingSplitNode => {
    const current: TilingMasterOrientation = split.masterOrientation ?? "left";
    const index: number = MASTER_ORIENTATION_RING.indexOf(current);
    const next: TilingMasterOrientation =
      MASTER_ORIENTATION_RING[(index + 1) % MASTER_ORIENTATION_RING.length];
    return { ...split, masterOrientation: next };
  });
}

/**
 * Nudge a split's `ratio` by `delta` (clamped to `[0.05, 0.95]`). In master mode
 * `ratio` is the master-area fraction; in dwindle mode it is the binary split
 * fraction — the same reducer serves both (the absolute `set-split-ratio` /
 * `updateSplitRatio` is the absolute counterpart).
 */
export function adjustSplitRatio(
  layout: TilingLayoutNode,
  splitId: string,
  delta: number,
): TilingLayoutNode {
  return rewriteSplitById(layout, splitId, (split: TilingSplitNode): TilingSplitNode => {
    const next: number = clampRatio(split.ratio + delta);
    return next === split.ratio ? split : { ...split, ratio: next };
  });
}

// ───────────────────────────────────────────────────────────────────────────
// HT-GROUP-TABBED-STACKING — group/member reducers
// ───────────────────────────────────────────────────────────────────────────

/**
 * Replace the node whose `id === targetId` (leaf, split, or group) with
 * `replacement`, returning the SAME reference when the id is absent. The generic
 * by-id node rewrite the group reducers use to swap a slot in place (a leaf →
 * group, a group → split chain, …) without touching the rest of the tree.
 */
function replaceNodeById(
  node: TilingLayoutNode,
  targetId: string,
  replacement: TilingLayoutNode,
): TilingLayoutNode {
  if (node.id === targetId) {
    return replacement;
  }
  if (node.kind === "leaf" || node.kind === "group") {
    return node;
  }
  const first: TilingLayoutNode = replaceNodeById(node.first, targetId, replacement);
  const second: TilingLayoutNode = replaceNodeById(node.second, targetId, replacement);
  if (first === node.first && second === node.second) {
    return node;
  }
  return { ...node, first, second };
}

/**
 * Find the group `groupId` and rewrite it via `rewrite`, returning the SAME
 * reference when nothing changes — the find-by-id spine for the active-member
 * reducers (mirrors `rewriteSplitById`).
 */
function rewriteGroupById(
  node: TilingLayoutNode,
  groupId: string,
  rewrite: (group: TilingGroupNode) => TilingLayoutNode,
): TilingLayoutNode {
  if (node.kind === "leaf") {
    return node;
  }
  if (node.kind === "group") {
    return node.id === groupId ? rewrite(node) : node;
  }
  const first: TilingLayoutNode = rewriteGroupById(node.first, groupId, rewrite);
  const second: TilingLayoutNode = rewriteGroupById(node.second, groupId, rewrite);
  if (first === node.first && second === node.second) {
    return node;
  }
  return { ...node, first, second };
}

/** Strip a leaf of group-irrelevant slot state (its own sizing) before it joins a group. */
function asGroupMember(leaf: TilingLeafNode): TilingLeafNode {
  return leaf.sizing == null ? leaf : { id: leaf.id, kind: "leaf", tileId: leaf.tileId };
}

/**
 * Fold ≥1 leaves into a right-leaning dwindle split chain (the inverse of
 * grouping): `[a]` → `a`; `[a, b]` → `split(a, b)`; `[a, b, c]` →
 * `split(a, split(b, c))`. Used by `ungroupNode` / `removeMemberFromGroup` to
 * explode a group back into the binary tree.
 */
function membersToSplitChain(
  members: ReadonlyArray<TilingLeafNode>,
  idSeed: string,
): TilingLayoutNode {
  const last: TilingLeafNode = members[members.length - 1];
  let chain: TilingLayoutNode = last;
  for (let index = members.length - 2; index >= 0; index -= 1) {
    const head: TilingLeafNode = members[index];
    chain = {
      kind: "split",
      id: `${idSeed}-${head.id}`,
      axis: "horizontal",
      ratio: 0.5,
      first: head,
      second: chain,
    };
  }
  return chain;
}

/** Options for `groupLeaves`: an explicit host/anchor + an explicit group id. */
export interface GroupLeavesOptions {
  /**
   * The pane whose slot the merged group occupies and whose tile is the active
   * tab — the clicked pane for the header Group button, or the resolved host for
   * Alt+G. Defaults to the FIRST resolvable id in `leafIds` when omitted.
   */
  hostLeafId?: string;
  /** Explicit group id; defaults to `group-<hostLeafId>`. */
  groupId?: string;
}

/**
 * The flat, host-first, de-duplicated member order for `groupLeaves`: the host
 * leaf, then (if the host was itself a group member) its group-mates in their
 * existing left-to-right order, then the remaining selection in insertion order
 * with every touched group expanded to its full membership in existing order.
 * Selecting ANY one member of a group therefore pulls in that group's ENTIRE
 * membership.
 */
function flatGroupMemberOrder(
  layout: TilingLayoutNode,
  selectionIds: ReadonlyArray<string>,
  hostLeafId: string,
): ReadonlyArray<string> {
  const ordered: string[] = [];
  const seen: Set<string> = new Set<string>();
  const push = (id: string): void => {
    if (!seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  };
  // A selected id contributes its WHOLE group (existing member order) when it is
  // a group member, else just itself.
  const expand = (id: string): ReadonlyArray<string> => {
    const group: TilingGroupNode | null = findGroupContainingLeaf(layout, id);
    return group != null
      ? group.members.map((member: TilingLeafNode): string => member.id)
      : [id];
  };
  // Host first (then its group-mates, if the host was grouped).
  push(hostLeafId);
  for (const id of expand(hostLeafId)) {
    push(id);
  }
  // Then the rest of the selection in insertion order, each expanded.
  for (const selectionId of selectionIds) {
    if (selectionId === hostLeafId) {
      continue;
    }
    for (const id of expand(selectionId)) {
      push(id);
    }
  }
  return ordered;
}

/**
 * Fold a selection of leaves and/or group members into ONE flat tabbed group
 * occupying the HOST pane's slot. Any existing group the selection touches is
 * DISSOLVED and its full membership folded into the single result — there is
 * never a nested group-within-a-group nor a partial group, and selecting any one
 * member of a group pulls in the whole group (see `flatGroupMemberOrder`). The
 * host pane's tile is the active tab and its slot hosts the merged group; every
 * other involved slot closes and the tree reflows. Returns the layout UNCHANGED
 * when fewer than two distinct resolvable leaves result (a group needs ≥2
 * members) or the host is unresolvable.
 *
 * @remarks
 * The no-op return (same reference) is load-bearing: gate a "Group" control on
 * {@link canGroupMultiSelection}, which detects groupability by checking whether
 * this operation would actually change the tree. Pass `options.hostLeafId` to
 * pin which pane keeps the slot and becomes the active tab; otherwise the first
 * resolvable id in `leafIds` is the host.
 *
 * @example
 * ```ts
 * import { groupLeaves, canGroupMultiSelection } from "@n-uf/hypr-tiling";
 *
 * // `selection` is a ReadonlySet<string> of leaf ids in insertion order.
 * if (canGroupMultiSelection(layout, selection)) {
 *   const next = groupLeaves(layout, [...selection]);
 *   setLayout(next);
 * }
 * ```
 *
 * @see {@link canGroupMultiSelection} to test groupability before calling.
 * @see {@link GroupLeavesOptions} for the host-pinning option.
 */
export function groupLeaves(
  layout: TilingLayoutNode,
  leafIds: ReadonlyArray<string>,
  options?: GroupLeavesOptions,
): TilingLayoutNode {
  // The host (anchor): the explicit option, else the first id that resolves to a
  // real leaf (loose leaf OR a member of an existing group).
  const hostLeafId: string | undefined =
    options?.hostLeafId ??
    leafIds.find((id: string): boolean => findLeafById(layout, id) != null);
  if (hostLeafId == null || findLeafById(layout, hostLeafId) == null) {
    return layout;
  }

  const orderedIds: ReadonlyArray<string> = flatGroupMemberOrder(
    layout,
    leafIds,
    hostLeafId,
  );
  const memberLeaves: ReadonlyArray<TilingLeafNode> = orderedIds
    .map((id: string): TilingLeafNode | null => findLeafById(layout, id))
    .filter((leaf: TilingLeafNode | null): leaf is TilingLeafNode => leaf != null);
  if (memberLeaves.length < 2) {
    return layout;
  }

  // Extract every NON-host member from wherever it sits: a loose leaf collapses
  // its parent split; a group member is pulled from its group (which collapses to
  // a bare leaf when one member is left, or empties). The host stays put so its
  // slot becomes the group's slot — and when the host was itself a group member,
  // removing its (all-pulled-in) group-mates collapses that group down to the
  // bare host leaf at the group's old slot, which then hosts the merged group.
  let working: TilingLayoutNode = layout;
  for (const member of memberLeaves) {
    if (member.id === hostLeafId) {
      continue;
    }
    const extraction: ExtractedLeafResult = extractLeafNode(working, member.id);
    if (extraction.nextNode == null) {
      // Would empty the tree — impossible while the host remains, but guard so
      // the reducer never yields a null layout.
      return layout;
    }
    working = extraction.nextNode;
  }

  const group: TilingGroupNode = {
    kind: "group",
    id: options?.groupId ?? `group-${hostLeafId}`,
    members: memberLeaves.map(asGroupMember),
    activeMemberId: hostLeafId,
  };
  // The host is now a bare leaf at its (or its dissolved group's) slot. Swap it
  // for the merged group. A failed swap (host vanished) aborts losslessly on the
  // ORIGINAL layout rather than returning the members-extracted `working` tree.
  const placed: TilingLayoutNode = replaceNodeById(working, hostLeafId, group);
  if (placed === working) {
    return layout;
  }
  return normalizeStaticAxisFill(placed);
}

/**
 * Explode a group back into a dwindle split chain of its members (the inverse of
 * `groupLeaves`). A 1-member group collapses to the bare leaf. Returns the
 * layout unchanged when `groupId` is absent.
 */
export function ungroupNode(layout: TilingLayoutNode, groupId: string): TilingLayoutNode {
  const group: TilingGroupNode | null = findGroupById(layout, groupId);
  if (group == null) {
    return layout;
  }
  const replacement: TilingLayoutNode = membersToSplitChain(group.members, `ungroup-${groupId}`);
  return normalizeStaticAxisFill(replaceNodeById(layout, groupId, replacement));
}

/**
 * Extract `sourceLeafId` from wherever it sits and append it as a member of
 * `groupId` (the drag-into-group commit). The newly added member becomes active
 * (focus follows the merge). Returns the layout unchanged when the group is
 * absent or the source leaf is already a member of that group.
 */
export function addLeafToGroup(
  layout: TilingLayoutNode,
  groupId: string,
  sourceLeafId: string,
): TilingLayoutNode {
  const group: TilingGroupNode | null = findGroupById(layout, groupId);
  if (group == null) {
    return layout;
  }
  if (group.members.some((member: TilingLeafNode): boolean => member.id === sourceLeafId)) {
    return layout;
  }
  const extraction: ExtractedLeafResult = extractLeafNode(layout, sourceLeafId);
  if (extraction.extractedLeaf == null || extraction.nextNode == null) {
    return layout;
  }
  const member: TilingLeafNode = asGroupMember(extraction.extractedLeaf);
  const nextGroup: TilingGroupNode = {
    ...group,
    members: [...group.members, member],
    activeMemberId: member.id,
  };
  return normalizeStaticAxisFill(replaceNodeById(extraction.nextNode, groupId, nextGroup));
}

/**
 * Remove `memberId` from `groupId` and re-seat it as a sibling leaf beside the
 * group's slot. The group collapses to a bare leaf when only one member would
 * remain (a group of one is degenerate). Returns the layout unchanged when the
 * group or member is absent.
 */
export function removeMemberFromGroup(
  layout: TilingLayoutNode,
  groupId: string,
  memberId: string,
): TilingLayoutNode {
  const group: TilingGroupNode | null = findGroupById(layout, groupId);
  if (group == null) {
    return layout;
  }
  const removed: TilingLeafNode | undefined = group.members.find(
    (member: TilingLeafNode): boolean => member.id === memberId,
  );
  if (removed == null) {
    return layout;
  }
  const remaining: ReadonlyArray<TilingLeafNode> = group.members.filter(
    (member: TilingLeafNode): boolean => member.id !== memberId,
  );
  // The group's surviving slot: a bare leaf when one member is left, else the
  // group minus the removed member (active follows if it was the removed one).
  const survivingSlot: TilingLayoutNode =
    remaining.length === 1
      ? remaining[0]
      : {
          ...group,
          members: remaining,
          activeMemberId:
            group.activeMemberId === memberId ? remaining[0].id : group.activeMemberId,
        };
  const replacement: TilingLayoutNode = {
    kind: "split",
    id: `ungroup-member-${memberId}`,
    axis: "horizontal",
    ratio: 0.5,
    first: survivingSlot,
    second: removed,
  };
  return normalizeStaticAxisFill(replaceNodeById(layout, groupId, replacement));
}

/** Activate a specific member tab of a group. Same ref when already active or absent. */
export function setActiveGroupMember(
  layout: TilingLayoutNode,
  groupId: string,
  memberId: string,
): TilingLayoutNode {
  return rewriteGroupById(layout, groupId, (group: TilingGroupNode): TilingLayoutNode => {
    if (group.activeMemberId === memberId) {
      return group;
    }
    if (!group.members.some((member: TilingLeafNode): boolean => member.id === memberId)) {
      return group;
    }
    return { ...group, activeMemberId: memberId };
  });
}

/** Advance the active member tab one step around the member ring (wraparound). */
export function cycleActiveGroupMember(
  layout: TilingLayoutNode,
  groupId: string,
  direction: TilingPaneCycleDirection,
): TilingLayoutNode {
  return rewriteGroupById(layout, groupId, (group: TilingGroupNode): TilingLayoutNode => {
    if (group.members.length < 2) {
      return group;
    }
    const index: number = group.members.findIndex(
      (member: TilingLeafNode): boolean => member.id === group.activeMemberId,
    );
    const step: number = direction === "next" ? 1 : -1;
    const nextIndex: number =
      (index + step + group.members.length) % group.members.length;
    return { ...group, activeMemberId: group.members[nextIndex].id };
  });
}

function centerX(rect: LeafRect): number {
  return (rect.left + rect.right) / 2;
}

function centerY(rect: LeafRect): number {
  return (rect.top + rect.bottom) / 2;
}

function overlapAmount(startA: number, endA: number, startB: number, endB: number): number {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
}

function directionalScore(
  fromRect: LeafRect,
  candidateRect: LeafRect,
  direction: TilingFocusDirection,
): number | null {
  if (direction === "left" && centerX(candidateRect) >= centerX(fromRect)) {
    return null;
  }
  if (direction === "right" && centerX(candidateRect) <= centerX(fromRect)) {
    return null;
  }
  if (direction === "up" && centerY(candidateRect) >= centerY(fromRect)) {
    return null;
  }
  if (direction === "down" && centerY(candidateRect) <= centerY(fromRect)) {
    return null;
  }

  const primaryDistance: number = direction === "left" || direction === "right"
    ? Math.abs(centerX(candidateRect) - centerX(fromRect))
    : Math.abs(centerY(candidateRect) - centerY(fromRect));
  const secondaryDistance: number = direction === "left" || direction === "right"
    ? Math.abs(centerY(candidateRect) - centerY(fromRect))
    : Math.abs(centerX(candidateRect) - centerX(fromRect));
  const axisOverlap: number = direction === "left" || direction === "right"
    ? overlapAmount(fromRect.top, fromRect.bottom, candidateRect.top, candidateRect.bottom)
    : overlapAmount(fromRect.left, fromRect.right, candidateRect.left, candidateRect.right);
  const overlapBoost: number = axisOverlap > 0 ? 0 : 100;

  return primaryDistance + secondaryDistance * 0.25 + overlapBoost;
}

/**
 * Id of the nearest focusable leaf from `fromLeafId` in the given spatial
 * `direction` (geometric nearest-neighbour over the laid-out rectangles), or
 * `null` when no leaf lies that way. Powers directional keyboard focus.
 */
export function findLeafByDirection(
  layout: TilingLayoutNode,
  fromLeafId: string,
  direction: TilingFocusDirection,
): string | null {
  const rects: ReadonlyArray<LeafRect> = collectNormalizedLeafRects(layout);
  const fromRect: LeafRect | undefined = rects.find((rect: LeafRect): boolean => rect.leafId === fromLeafId);
  if (fromRect == null) {
    return null;
  }

  let bestLeafId: string | null = null;
  let bestScore: number = Number.POSITIVE_INFINITY;

  for (const candidateRect of rects) {
    if (candidateRect.leafId === fromLeafId) {
      continue;
    }
    const candidateScore: number | null = directionalScore(fromRect, candidateRect, direction);
    if (candidateScore == null) {
      continue;
    }
    if (candidateScore < bestScore) {
      bestScore = candidateScore;
      bestLeafId = candidateRect.leafId;
    }
  }

  return bestLeafId;
}

/**
 * Min-pane constraints for `growLeafToward`. The acquire-space reducer is pure
 * (no DOM), so the caller supplies the container extent ALONG the grow axis plus
 * the gap + per-pane minimum; the reducer feeds these into `clampByMinSize`
 * (shared with the resize + projected-layout paths) to bound each pushed
 * divider so the shrinking sibling never collapses below its minimum.
 *
 * `containerSizePx` is the extent of the whole tiling viewport along the grow
 * axis (width for left/right, height for up/down). The same value is applied to
 * every matching-axis ancestor on the chain; deeper ancestors occupy less than
 * the full viewport, so this is a deliberate upper-bound approximation that
 * keeps the reducer DOM-free while still guaranteeing a non-zero sibling floor.
 */
export interface TilingGrowConstraints {
  containerSizePx: number;
  gapPx: number;
  minPaneSizePx: number;
  /**
   * Extent (CSS px) of the viewport along the axis PERPENDICULAR to the grow /
   * annex axis (height for left/right, width for up/down). Consumed only by the
   * directional-annex off-axis re-seed (`reseedEvicted`) to size the perpendicular
   * re-accommodation band + decide min-size feasibility (the L3 spill trigger).
   * Undefined → falls back to `containerSizePx` (the square-container upper-bound
   * approximation `growLeafToward` already documents). `growLeafToward` ignores
   * this field.
   */
  crossSizePx?: number;
}

/**
 * Number of leaves that stack ALONG `axis` within a subtree — i.e. how many
 * per-pane minimums must fit side-by-side along that axis. A split on the SAME
 * axis lays its children out along the axis → the counts SUM; a split on the
 * CROSS axis stacks children perpendicular to the axis (each spans the full axis
 * extent) → the count is the MAX of the children. A leaf is `1`.
 *
 * This is the leaf-count factor behind "bounded by the sum of sibling
 * minimums": the sibling subtree's minimum axis extent is
 * `axisStackedLeafCount(sibling, axis) * minPaneSizePx`.
 */
export function axisStackedLeafCount(node: TilingLayoutNode, axis: TilingSplitAxis): number {
  if (node.kind === "leaf" || node.kind === "group") {
    return 1;
  }
  if (node.axis === axis) {
    return axisStackedLeafCount(node.first, axis) + axisStackedLeafCount(node.second, axis);
  }
  return Math.max(axisStackedLeafCount(node.first, axis), axisStackedLeafCount(node.second, axis));
}

interface GrowRewriteResult {
  node: TilingLayoutNode;
  containsLeaf: boolean;
}

/**
 * Grow `leafId` to claim the MAXIMUM available space toward `direction`.
 *
 * Walks the ancestor split chain from the leaf to the root. For every ancestor
 * split whose `axis` matches the direction (horizontal for left/right, vertical
 * for up/down) AND where growing in `direction` means enlarging the side the
 * pane sits on, the split's `ratio` is pushed toward the limit so the pane
 * absorbs space, with the shrinking sibling subtree clamped to its minimum
 * (`clampByMinSize`, sibling minimum = its along-axis leaf count × minPaneSizePx)
 * — siblings shrink to minimum, never collapse to zero. Cascading across ALL
 * matching-axis ancestors grows the pane to the layout edge in that direction
 * (bounded by the sum of sibling minimums).
 *
 * Side-to-direction mapping (ratio is the FIRST child's fraction):
 * - `"right"` / `"down"` → the FIRST side grows (push ratio → bounded max).
 * - `"left"` / `"up"` → the SECOND side grows (push ratio → bounded min).
 *
 * Non-matching-axis ancestors are untouched. Unknown id, or no matching-axis
 * ancestor with room, returns the layout unchanged (pure; input never mutated).
 */
export function growLeafToward(
  layout: TilingLayoutNode,
  leafId: string,
  direction: TilingFocusDirection,
  minConstraints: TilingGrowConstraints,
): TilingLayoutNode {
  if (findLeafById(layout, leafId) == null) {
    return layout;
  }

  const matchingAxis: TilingSplitAxis =
    direction === "left" || direction === "right" ? "horizontal" : "vertical";
  const firstSideGrows: boolean = direction === "right" || direction === "down";
  const availableSizePx: number = Math.max(minConstraints.containerSizePx - minConstraints.gapPx, 1);

  // Target ratio for "sibling pinned at its aggregate minimum, growing side takes
  // the rest", then the per-pane floor (`clampByMinSize` with the single-pane
  // minimum) keeps BOTH the growing pane and its immediate neighbor at/above
  // `minPaneSizePx` and inside the global [0.05, 0.95] bounds.
  const pushedRatio = (siblingSubtree: TilingLayoutNode, growingSideIsFirst: boolean): number => {
    const siblingMinPx: number =
      axisStackedLeafCount(siblingSubtree, matchingAxis) * minConstraints.minPaneSizePx;
    const siblingFraction: number = siblingMinPx / availableSizePx;
    const targetRatio: number = growingSideIsFirst ? 1 - siblingFraction : siblingFraction;
    return clampByMinSize(
      targetRatio,
      minConstraints.containerSizePx,
      minConstraints.gapPx,
      minConstraints.minPaneSizePx,
    );
  };

  const rewrite = (node: TilingLayoutNode): GrowRewriteResult => {
    if (node.kind === "leaf") {
      return { node, containsLeaf: node.id === leafId };
    }

    if (node.kind === "group") {
      // A group is one slot keyed by its active member; it has no internal split
      // ratio to push, so it is a terminal of the grow walk like a leaf.
      return { node, containsLeaf: node.activeMemberId === leafId };
    }

    const firstResult: GrowRewriteResult = rewrite(node.first);
    if (firstResult.containsLeaf) {
      let next: TilingSplitNode = { ...node, first: firstResult.node };
      if (node.axis === matchingAxis && firstSideGrows) {
        next = { ...next, ratio: pushedRatio(node.second, true) };
      }
      return { node: next, containsLeaf: true };
    }

    const secondResult: GrowRewriteResult = rewrite(node.second);
    if (secondResult.containsLeaf) {
      let next: TilingSplitNode = { ...node, second: secondResult.node };
      if (node.axis === matchingAxis && !firstSideGrows) {
        next = { ...next, ratio: pushedRatio(node.first, false) };
      }
      return { node: next, containsLeaf: true };
    }

    return { node, containsLeaf: false };
  };

  return rewrite(layout).node;
}

/** The split axis a direction distributes along (horizontal for left/right). */
function directionAxis(direction: TilingFocusDirection): TilingSplitAxis {
  return direction === "left" || direction === "right" ? "horizontal" : "vertical";
}

/**
 * The placement opposite the annex direction — where evicted panes re-seed (the
 * complementary region). `right → left`, `left → right`, `down → top`,
 * `up → bottom`. (Direction uses `up`/`down`; placement uses `top`/`bottom`.)
 */
function complementaryPlacement(direction: TilingFocusDirection): TilingMovePlacement {
  switch (direction) {
    case "right":
      return "left";
    case "left":
      return "right";
    case "down":
      return "top";
    case "up":
      return "bottom";
  }
}

/** The axis perpendicular to `axis` — the off-axis the annex re-seed relocates into. */
function perpendicularAxis(axis: TilingSplitAxis): TilingSplitAxis {
  return axis === "horizontal" ? "vertical" : "horizontal";
}

/** The "after" (second-slot) placement along an axis: `bottom` for vertical, `right` for horizontal. */
function afterPlacementForAxis(axis: TilingSplitAxis): TilingMovePlacement {
  return axis === "vertical" ? "bottom" : "right";
}

/** The "before" (first-slot) placement along an axis: `top` for vertical, `left` for horizontal. */
function beforePlacementForAxis(axis: TilingSplitAxis): TilingMovePlacement {
  return axis === "vertical" ? "top" : "left";
}

/** True when a slot node (leaf or group) is the slot identified by `repId` (a leaf id or a group's member id). */
function slotMatchesRepId(node: TilingLayoutNode, repId: string): boolean {
  if (node.kind === "leaf") {
    return node.id === repId;
  }
  if (node.kind === "group") {
    return node.members.some((member: TilingLeafNode): boolean => member.id === repId);
  }
  return false;
}

interface ExtractedSlotResult {
  nextNode: TilingLayoutNode | null;
  extracted: TilingLayoutNode | null;
}

/**
 * Extract a whole SLOT (a bare leaf OR an entire group) identified by `repId`,
 * collapsing its now-single-child parent split exactly as `extractLeafNode` does
 * for a leaf. Unlike `extractLeafNode` (which removes a single MEMBER from a
 * group, shrinking it), this treats a group as ATOMIC — the group rides out as
 * one unit. This is the group-aware extraction the annex eviction uses so that
 * annexing toward a group relocates the whole group instead of dissolving it.
 */
function extractSlot(node: TilingLayoutNode, repId: string): ExtractedSlotResult {
  if (node.kind === "leaf" || node.kind === "group") {
    return slotMatchesRepId(node, repId)
      ? { nextNode: null, extracted: node }
      : { nextNode: node, extracted: null };
  }

  const firstExtraction: ExtractedSlotResult = extractSlot(node.first, repId);
  if (firstExtraction.extracted != null) {
    return {
      nextNode:
        firstExtraction.nextNode == null
          ? node.second
          : { ...node, first: firstExtraction.nextNode },
      extracted: firstExtraction.extracted,
    };
  }

  const secondExtraction: ExtractedSlotResult = extractSlot(node.second, repId);
  if (secondExtraction.extracted != null) {
    return {
      nextNode:
        secondExtraction.nextNode == null
          ? node.first
          : { ...node, second: secondExtraction.nextNode },
      extracted: secondExtraction.extracted,
    };
  }

  return { nextNode: node, extracted: null };
}

/** The whole slot node (leaf or group) identified by `repId`, or `null` if absent. */
function findSlotByRepId(node: TilingLayoutNode, repId: string): TilingLayoutNode | null {
  if (node.kind === "leaf" || node.kind === "group") {
    return slotMatchesRepId(node, repId) ? node : null;
  }
  return findSlotByRepId(node.first, repId) ?? findSlotByRepId(node.second, repId);
}

/** Remove a whole slot (leaf or group) by rep id and gap-close; unchanged ref when absent / root. */
function removeSlotByRepId(layout: TilingLayoutNode, repId: string): TilingLayoutNode {
  const extraction: ExtractedSlotResult = extractSlot(layout, repId);
  if (extraction.extracted == null || extraction.nextNode == null) {
    return layout;
  }
  return normalizeStaticAxisFill(extraction.nextNode);
}

/**
 * Assemble the evicted slots into a single perpendicular STACK node: a left-spine
 * dwindle split along `axis` whose `k` slots get even shares (ratio `1/m` at each
 * level, `m` = slots remaining). A single slot returns as-is (no wrapping). This
 * is the "perpendicular split" the off-axis re-seed grafts/carves as one child.
 */
function buildPerpStack(
  slots: ReadonlyArray<TilingLayoutNode>,
  axis: TilingSplitAxis,
): TilingLayoutNode {
  const last: TilingLayoutNode = slots[slots.length - 1];
  let stack: TilingLayoutNode = last;
  // Fold from the tail so reading order is preserved head→tail along `axis`.
  for (let index: number = slots.length - 2; index >= 0; index -= 1) {
    const remaining: number = slots.length - index;
    stack = {
      kind: "split",
      id: `annex-perp-${readLeafNodeIds(slots[index])[0]}`,
      axis,
      ratio: clampRatio(1 / remaining),
      first: slots[index],
      second: stack,
    };
  }
  return stack;
}

interface PerpSink {
  /** Representative leaf id of the sibling region facing the active. */
  targetLeafId: string;
  /** Edge of the target the evicted stack grafts onto (toward the active). */
  placement: TilingMovePlacement;
}

/**
 * Deterministic L1 sink-selection: the NEAREST (deepest) ancestor split of the
 * active whose `axis === perpAxis` bounds an existing perpendicular region. The
 * sink target is the representative leaf of that region's sibling FACING the
 * active (active is the split's first child → graft on the sibling's leading
 * edge, before its first leaf; active is the second child → graft on the
 * sibling's trailing edge, after its last leaf) so the evicted land at the
 * boundary nearest the freed space. Returns `null` when the active has no
 * perpendicular ancestor (→ L2 carve). Pure descent of the single root→active
 * path.
 */
function findPerpSink(
  layout: TilingLayoutNode,
  activeLeafId: string,
  perpAxis: TilingSplitAxis,
): PerpSink | null {
  let sink: PerpSink | null = null;
  let node: TilingLayoutNode = layout;
  while (node.kind === "split") {
    const activeInFirst: boolean = findLeafById(node.first, activeLeafId) != null;
    if (node.axis === perpAxis) {
      const region: TilingLayoutNode = activeInFirst ? node.second : node.first;
      const regionLeafIds: ReadonlyArray<string> = readLeafNodeIds(region);
      // Active first → sibling is after the active; graft on the sibling's
      // leading edge (before its first leaf). Active second → graft on the
      // sibling's trailing edge (after its last leaf).
      sink = activeInFirst
        ? { targetLeafId: regionLeafIds[0], placement: beforePlacementForAxis(perpAxis) }
        : {
            targetLeafId: regionLeafIds[regionLeafIds.length - 1],
            placement: afterPlacementForAxis(perpAxis),
          };
    }
    node = activeInFirst ? node.first : node.second;
  }
  return sink;
}

/**
 * STRUCTURAL eviction-set selection for directional annex. Returns EVERY leaf
 * that lies in the vector from the active pane to the layout edge in
 * `direction`, at ANY nesting depth — the entire row/column in that vector.
 *
 * ROOT-CAUSE FIX (vs the shipped acquire-space): the previous behavior
 * (`growLeafToward`) is a ratio-push that only walks the active pane's
 * matching-axis ANCESTOR chain and shrinks the immediate sibling subtree to its
 * minimum — a pane nested in a DIFFERENT split at a different depth (a
 * non-aligned column/row) is never removed, so it survives and blocks the
 * claim. This selector instead walks the split TREE STRUCTURALLY: descending the
 * single path to the active leaf, at each ancestor split whose axis matches the
 * direction AND where the active pane sits on the NON-directional side, the
 * ENTIRE directional-side child subtree is in the vector — so all of its leaves
 * are evicted, regardless of how deeply they are nested. This is the difference
 * between "shrink the aligned neighbor" and "evict everything in the half-plane
 * toward the edge".
 *
 * Leaves are returned farthest-first (the topmost matching ancestor's
 * directional subtree is the farthest from the active), a deterministic order
 * for the subsequent per-leaf `removeLeafTile` / re-seed iteration. Returns an
 * empty array when the active pane is unknown or already at the edge in
 * `direction` (nothing lies in the vector).
 */
export function selectEvictionSet(
  layout: TilingLayoutNode,
  activeLeafId: string,
  direction: TilingFocusDirection,
): ReadonlyArray<string> {
  if (findLeafById(layout, activeLeafId) == null) {
    return [];
  }
  const axis: TilingSplitAxis = directionAxis(direction);
  // The child on the directional side (toward the edge): for a horizontal split
  // `first` is left / `second` is right; for vertical `first` is top / `second`
  // is bottom. So `left`/`up` target the FIRST child, `right`/`down` the SECOND.
  const directionalChildIsFirst: boolean = direction === "left" || direction === "up";

  const evicted: string[] = [];
  let node: TilingLayoutNode = layout;
  while (node.kind === "split") {
    const activeInFirst: boolean = findLeafById(node.first, activeLeafId) != null;
    if (node.axis === axis) {
      if (directionalChildIsFirst && !activeInFirst) {
        evicted.push(...readLeafNodeIds(node.first));
      } else if (!directionalChildIsFirst && activeInFirst) {
        evicted.push(...readLeafNodeIds(node.second));
      }
    }
    node = activeInFirst ? node.first : node.second;
  }
  return evicted;
}

/**
 * Re-accommodate evicted SLOTS (a slot is a bare leaf OR a whole group — annex is
 * group-aware) via the 3-rung OFF-AXIS ladder, anchored on the active pane. The
 * evicted relocate PERPENDICULAR to the annex axis instead of being dumped at the
 * opposite end of the same band (the corrected behavior — see
 * `_agent/annex-reaccommodation-ladder-design.md`). Stops at the first
 * satisfiable rung:
 *
 * - **L1 off-axis sink** — the active has an existing perpendicular region
 *   (`findPerpSink`): the evicted stack grafts into that region adjacent to the
 *   active, minimized; the active's band is UNTOUCHED (full vector + full
 *   perpendicular extent).
 * - **L2 far-edge carve** — no perpendicular region: carve a perpendicular split
 *   around the active leaf, active dominant share + anchored (first slot),
 *   evicted stack minimized in the after slot. Only the active's band is
 *   subdivided, so the opposite side stays clean.
 * - **L3 degenerate spill** — when `crossSizePx` / `minPaneSizePx` cannot host all
 *   evicted perpendicular, the residual beyond capacity spills to the OPPOSITE
 *   side, minimized (the only rung that touches the opposite side).
 *
 * L1 and L2 are one routine differing only in target + ratio (graft into the
 * found region vs carve around the active). Evicted slots carry their original
 * fields (incl. `sizing`, group membership). When the anchor is unexpectedly
 * absent the whole stack grafts at the root rather than being dropped (annex is
 * total — no pane is ever lost). Pure; the input tree is never mutated.
 */
export function reseedEvicted(
  layout: TilingLayoutNode,
  evictedSlots: ReadonlyArray<TilingLayoutNode>,
  anchorLeafId: string,
  direction: TilingFocusDirection,
  constraints: TilingGrowConstraints,
): TilingLayoutNode {
  if (evictedSlots.length === 0) {
    return layout;
  }

  const annexAxis: TilingSplitAxis = directionAxis(direction);
  const perpAxis: TilingSplitAxis = perpendicularAxis(annexAxis);

  // Anchor absent → graft the whole perpendicular stack at the root (never drop).
  if (findLeafById(layout, anchorLeafId) == null) {
    const stack: TilingLayoutNode = buildPerpStack(evictedSlots, perpAxis);
    return {
      kind: "split",
      id: `annex-reseed-root-${readLeafNodeIds(stack)[0]}`,
      axis: perpAxis,
      ratio: 0.5,
      first: layout,
      second: stack,
    };
  }

  const sink: PerpSink | null = findPerpSink(layout, anchorLeafId, perpAxis);

  // Perpendicular capacity: how many min-panes fit across the off-axis. A carve
  // (no sink) also hosts the active in that band, so it reserves one slot.
  const crossExtent: number = Math.max(
    (constraints.crossSizePx ?? constraints.containerSizePx) - constraints.gapPx,
    1,
  );
  const perpCapacity: number = Math.max(1, Math.floor(crossExtent / constraints.minPaneSizePx));
  const hostCap: number = sink != null ? perpCapacity : Math.max(1, perpCapacity - 1);
  const hosted: ReadonlyArray<TilingLayoutNode> = evictedSlots.slice(0, hostCap);
  const spilled: ReadonlyArray<TilingLayoutNode> = evictedSlots.slice(hostCap);

  const minFraction: number = clampByMinSize(
    0,
    constraints.crossSizePx ?? constraints.containerSizePx,
    constraints.gapPx,
    constraints.minPaneSizePx,
  );
  const hostedBandFraction: number = Math.min(0.95, hosted.length * minFraction);
  const stack: TilingLayoutNode = buildPerpStack(hosted, perpAxis);

  let tree: TilingLayoutNode = layout;
  if (sink != null) {
    // L1 — graft minimized into the existing perpendicular region adjacent to the
    // active. Stack-first placements (before) want the small fraction directly;
    // stack-second placements (after) want the complement so the stack stays thin.
    const stackIsFirst: boolean = sink.placement === "left" || sink.placement === "top";
    const ratio: number = clampRatio(stackIsFirst ? hostedBandFraction : 1 - hostedBandFraction);
    tree = insertLeafAroundTarget(
      tree,
      sink.targetLeafId,
      stack,
      `annex-sink-${readLeafNodeIds(stack)[0]}`,
      perpAxis,
      sink.placement,
      ratio,
    );
  } else {
    // L2 — carve a perpendicular split around the active: active dominant +
    // anchored (first slot), evicted stack minimized in the after slot.
    const placement: TilingMovePlacement = afterPlacementForAxis(perpAxis);
    const activeFraction: number = clampByMinSize(
      1 - hostedBandFraction,
      constraints.crossSizePx ?? constraints.containerSizePx,
      constraints.gapPx,
      constraints.minPaneSizePx,
    );
    tree = insertLeafAroundTarget(
      tree,
      anchorLeafId,
      stack,
      `annex-carve-${readLeafNodeIds(stack)[0]}`,
      perpAxis,
      placement,
      activeFraction,
    );
  }

  // L3 — spill the residual to the OPPOSITE side, minimized (the only rung that
  // touches the opposite side). Along the annex axis at the complementary edge.
  if (spilled.length > 0) {
    const spillPlacement: TilingMovePlacement = complementaryPlacement(direction);
    const spillIsFirst: boolean = spillPlacement === "left" || spillPlacement === "top";
    const spillRatio: number = clampByMinSize(
      spillIsFirst ? 0 : 1,
      constraints.containerSizePx,
      constraints.gapPx,
      constraints.minPaneSizePx,
    );
    for (const spillSlot of spilled) {
      tree = insertLeafAroundTarget(
        tree,
        anchorLeafId,
        spillSlot,
        `annex-spill-${readLeafNodeIds(spillSlot)[0]}`,
        annexAxis,
        spillPlacement,
        spillRatio,
      );
    }
  }

  return tree;
}

/**
 * Directional annex + OFF-AXIS re-seed — the aggressive-eviction behavior the
 * per-pane directional arrows perform. For the active leaf and a direction it
 * (a) evicts EVERY slot in the vector to the edge (structural selection —
 * `selectEvictionSet` — so non-aligned / differently-nested panes are included),
 * group-aware: a group in the vector relocates as ONE unit; (b) the active claims
 * the vacated directional extent via the gap-close collapse that `removeSlotByRepId`
 * performs per evicted slot; and (c) re-seeds each evicted slot PERPENDICULAR to
 * the annex axis via the 3-rung ladder (`reseedEvicted`) — off-axis sink, else
 * far-edge perpendicular carve, else opposite-side spill — so the active stays
 * anchored, the opposite side stays clean (strict at rungs 1–2), and no pane is
 * lost. Always leaves a valid dwindle binary-split tree.
 *
 * Empty eviction set (the active is already at the edge — nothing in the vector)
 * falls through to `growLeafToward`, matching the shipped acquire-space
 * "claim available ratio" behavior, and returns the layout unchanged when there
 * is also no ratio to push (pure no-op). Unknown active id returns the layout
 * unchanged. Pure; the input tree is never mutated.
 */
export function annexDirection(
  layout: TilingLayoutNode,
  activeLeafId: string,
  direction: TilingFocusDirection,
  constraints: TilingGrowConstraints,
): TilingLayoutNode {
  if (findLeafById(layout, activeLeafId) == null) {
    return layout;
  }
  const evictedIds: ReadonlyArray<string> = selectEvictionSet(layout, activeLeafId, direction);
  if (evictedIds.length === 0) {
    return growLeafToward(layout, activeLeafId, direction, constraints);
  }

  // Resolve each evicted outer-slot id to its WHOLE slot node (a bare leaf, or
  // the entire group containing the id) so a group relocates as one unit.
  const evictedSlots: ReadonlyArray<TilingLayoutNode> = evictedIds
    .map((id: string): TilingLayoutNode | null => findSlotByRepId(layout, id))
    .filter((node: TilingLayoutNode | null): node is TilingLayoutNode => node != null);

  let tree: TilingLayoutNode = layout;
  for (const id of evictedIds) {
    tree = removeSlotByRepId(tree, id);
  }

  return reseedEvicted(tree, evictedSlots, activeLeafId, direction, constraints);
}
