import { collectMasterSlots, resolveLayoutGeometry, type TilingLayoutGeometry, type TilingRect, type TilingSplitGeometry } from "./leaf-geometry";
import { isStaticAlongSplitAxis, splitAxisDimension } from "./pane-sizing";
import {
  TILING_DEFAULT_FOLD_SPINE_PX,
  type TilingDimension,
  type TilingFocusDirection,
  type TilingFoldConfig,
  type TilingGroupNode,
  type TilingLayoutConfig,
  type TilingLayoutNode,
  type TilingLeafNode,
  type TilingSplitAxis,
  type TilingSplitNode,
} from "./types";

/**
 * The fold plan: "the tree folds where it doesn't fit".
 *
 * The layout is laid out from the root with the renderer's own geometry
 * (`resolveLayoutGeometry`). At each split, top-down, if both children get
 * their floor along the split's axis ({@link TilingFoldConfig.minPanePx} and
 * its precedence) the split stays a real split, laid out exactly as with
 * folding off. If not, it folds: the side holding focus stays open in the
 * split's box less a spine and a gap, and the other side becomes a spine on
 * the edge where it sits (left or right of a side-by-side split, top or
 * bottom of a stacked one). The open side is then laid out afresh in its box
 * and its own splits are judged the same way.
 *
 * Pure and derived: the plan reads the layout, the container, the config and
 * focus, and never changes the layout. A stored layout is the same on every
 * screen.
 */

/** Which child of a split. */
export type TilingFoldSide = "first" | "second";

/** The edge of a folded split its spine sits on: where the folded side really is. */
export type TilingFoldEdge = "left" | "right" | "top" | "bottom";

/** One folded split of a {@link TilingFoldPlan}. */
export interface TilingFold {
  /** The folded split's id */
  splitId: string;
  /** The folded split's axis: `"horizontal"` folds sideways (spine left or right), `"vertical"` up or down */
  axis: TilingSplitAxis;
  /** The side that stays open */
  openSide: TilingFoldSide;
  /** The edge the spine sits on */
  spineEdge: TilingFoldEdge;
  /** The split's box */
  rect: TilingRect;
  /** The spine's box, on {@link TilingFold.spineEdge}, `spineSizePx` thick across the split's axis */
  spineRect: TilingRect;
  /** The open side's box: the split's box less the spine and the split's gap */
  openRect: TilingRect;
  /** The leaves the spine stands for, one per pane (a group: its active member), in reading order */
  leafIds: ReadonlyArray<string>;
  /**
   * The leaf to focus to open the spine: of {@link TilingFold.leafIds}, the one focused most recently (by
   * `recentLeafIds`), else the first; `null` when the folded side shows no leaf
   */
  targetLeafId: string | null;
  /** The split id of the nearest enclosing fold, `null` for an outermost fold */
  parentSplitId: string | null;
}

/**
 * A layout's geometry with folds: {@link TilingLayoutGeometry} for what is open, plus the folds. Where nothing
 * folds and no boundary moved to a floor (`folds` and `fittedRatios` empty), `leaves` and `splits` are exactly
 * `resolveLayoutGeometry`'s.
 */
export interface TilingFoldPlan extends TilingLayoutGeometry {
  /** Each open (shown) leaf's rect, keyed by leaf id, in reading order; a leaf inside a spine has none */
  leaves: ReadonlyMap<string, TilingRect>;
  /** Each laid-out split that did not fold, outside every spine */
  splits: ReadonlyMap<string, TilingSplitGeometry>;
  /** The folded splits, outermost first, in reading order */
  folds: ReadonlyArray<TilingFold>;
  /**
   * The splits that fit but whose stored ratio left a child under its fold floor, by split id: the ratio they were
   * laid out at instead, which moves the boundary to the floor. Derived, like the folds: never stored.
   */
  fittedRatios: ReadonlyMap<string, number>;
  /** Each open leaf's enclosing folds, by split id, outermost first (empty: no fold encloses it) */
  leafFolds: ReadonlyMap<string, ReadonlyArray<string>>;
  /** Every leaf inside a spine, group members included */
  foldedLeafIds: ReadonlySet<string>;
}

/** The leaf a slot shows: a leaf itself, a group its active member (null when it has none). */
function shownLeafId(slot: TilingLeafNode | TilingGroupNode): string | null {
  if (slot.kind === "leaf") {
    return slot.id;
  }
  return slot.members.some((member: TilingLeafNode): boolean => member.id === slot.activeMemberId) ? slot.activeMemberId : null;
}

/** Every leaf under `node`, group members included, in reading order. */
function allLeafIds(node: TilingLayoutNode, out: Array<string> = []): Array<string> {
  if (node.kind === "leaf") {
    out.push(node.id);
  } else if (node.kind === "group") {
    for (const member of node.members) out.push(member.id);
  } else {
    allLeafIds(node.first, out);
    allLeafIds(node.second, out);
  }
  return out;
}

/** The leaf each pane under `node` shows, in reading order. */
function shownLeafIds(node: TilingLayoutNode, out: Array<string> = []): Array<string> {
  if (node.kind === "split") {
    shownLeafIds(node.first, out);
    shownLeafIds(node.second, out);
  } else {
    const shown: string | null = shownLeafId(node);
    if (shown != null) out.push(shown);
  }
  return out;
}

const positivePx = (px: number | undefined): number | undefined =>
  px != null && Number.isFinite(px) && px > 0 ? px : undefined;

/** The fold config's own floor on `dimension`, if it sets one. */
function foldMinPx(fold: TilingFoldConfig, dimension: TilingDimension): number | undefined {
  const min = fold.minPanePx;
  if (min == null) return undefined;
  return positivePx(typeof min === "number" ? min : dimension === "width" ? min.width : min.height);
}

/**
 * The floor a split's direct child needs along the split's axis before the split folds, most specific first: a
 * static child's px pin, a leaf's own `minBBoxPx`, the split's `minPaneSizePx`, the fold config's `minPanePx`, the
 * config's `minPaneSizePx`.
 */
function foldFloorPx(child: TilingLayoutNode, split: TilingSplitNode, config: TilingLayoutConfig, fold: TilingFoldConfig): number {
  const dimension: TilingDimension = splitAxisDimension(split.axis);
  if (isStaticAlongSplitAxis(child, split.axis)) {
    const pin: number | undefined = positivePx(dimension === "width" ? child.sizing?.widthPx : child.sizing?.heightPx);
    if (pin != null) return pin;
  }
  const leafFloor: number | undefined =
    child.kind === "leaf" ? positivePx(dimension === "width" ? child.minBBoxPx?.widthPx : child.minBBoxPx?.heightPx) : undefined;
  // A split's own minPaneSizePx counts when it is set at all (0 included: the split opts out of a floor), as in the
  // geometry's precedence.
  const splitFloor: number | undefined =
    split.minPaneSizePx != null && Number.isFinite(split.minPaneSizePx) && split.minPaneSizePx >= 0 ? split.minPaneSizePx : undefined;
  return leafFloor ?? splitFloor ?? foldMinPx(fold, dimension) ?? Math.max(0, config.minPaneSizePx || 0);
}

/** Px this close count as on the floor: no refit. */
const FLOOR_EPSILON_PX: number = 1e-6;

/**
 * What `split`, laid out in `rect`, does under the fold floors, in the geometry's own terms (the boundary is the
 * middle of the gutter, at `ratio` of the extent: the first child gets `ratio × extent − gutter / 2`):
 * - `"fold"` when the two floors and the gutter don't fit the extent;
 * - else, when the stored ratio leaves a child with a floor under it, the ratio that puts that child exactly on its
 *   floor (a split with a child static along it keeps its pins, and a ratio that isn't a finite number is left to
 *   the geometry);
 * - else `null`: laid out as stored.
 */
function judgeSplit(split: TilingSplitNode, rect: TilingRect, config: TilingLayoutConfig, fold: TilingFoldConfig): "fold" | number | null {
  const extentPx: number = Math.max(0, split.axis === "horizontal" ? rect.width : rect.height);
  const gutterPx: number = Math.max(0, split.gapPx ?? config.gapPx) + Math.max(0, config.handleSizePx);
  const firstFloorPx: number = foldFloorPx(split.first, split, config, fold);
  const secondFloorPx: number = foldFloorPx(split.second, split, config, fold);
  if (firstFloorPx + secondFloorPx > Math.max(0, extentPx - gutterPx) + FLOOR_EPSILON_PX && firstFloorPx + secondFloorPx > 0) {
    return "fold";
  }
  const stored: number = Number(split.ratio);
  if (!Number.isFinite(stored) || extentPx <= 0 || isStaticAlongSplitAxis(split.first, split.axis) || isStaticAlongSplitAxis(split.second, split.axis)) {
    return null;
  }
  const ratio: number = Math.min(1, Math.max(0, stored));
  const halfGutterPx: number = gutterPx / 2;
  if (firstFloorPx > 0 && ratio * extentPx - halfGutterPx < firstFloorPx - FLOOR_EPSILON_PX) {
    return (firstFloorPx + halfGutterPx) / extentPx;
  }
  if (secondFloorPx > 0 && (1 - ratio) * extentPx - halfGutterPx < secondFloorPx - FLOOR_EPSILON_PX) {
    return 1 - (secondFloorPx + halfGutterPx) / extentPx;
  }
  return null;
}

/** Whether every split id in `node` is unique (the geometry keys splits by id). */
function hasUniqueSplitIds(node: TilingLayoutNode, seen: Set<string> = new Set<string>()): boolean {
  if (node.kind !== "split") return true;
  if (seen.has(node.id)) return false;
  seen.add(node.id);
  return hasUniqueSplitIds(node.first, seen) && hasUniqueSplitIds(node.second, seen);
}

/** The side of `split` holding the first of `preferred` it holds, else `"first"`. */
function openSideOf(split: TilingSplitNode, preferred: ReadonlyArray<string>): TilingFoldSide {
  const first: Set<string> = new Set<string>(allLeafIds(split.first));
  const second: Set<string> = new Set<string>(allLeafIds(split.second));
  for (const leafId of preferred) {
    if (first.has(leafId)) return "first";
    if (second.has(leafId)) return "second";
  }
  return "first";
}

/** The spine's and the open side's boxes in a folded split's `rect`. */
function foldBoxes(rect: TilingRect, axis: TilingSplitAxis, spineEdge: TilingFoldEdge, spinePx: number, gapPx: number): { spineRect: TilingRect; openRect: TilingRect } {
  if (axis === "horizontal") {
    const spineWidth: number = Math.max(0, Math.min(spinePx, rect.width));
    const openWidth: number = Math.max(0, rect.width - spinePx - gapPx);
    return spineEdge === "left"
      ? {
          spineRect: { x: rect.x, y: rect.y, width: spineWidth, height: rect.height },
          openRect: { x: rect.x + rect.width - openWidth, y: rect.y, width: openWidth, height: rect.height },
        }
      : {
          spineRect: { x: rect.x + rect.width - spineWidth, y: rect.y, width: spineWidth, height: rect.height },
          openRect: { x: rect.x, y: rect.y, width: openWidth, height: rect.height },
        };
  }
  const spineHeight: number = Math.max(0, Math.min(spinePx, rect.height));
  const openHeight: number = Math.max(0, rect.height - spinePx - gapPx);
  return spineEdge === "top"
    ? {
        spineRect: { x: rect.x, y: rect.y, width: rect.width, height: spineHeight },
        openRect: { x: rect.x, y: rect.y + rect.height - openHeight, width: rect.width, height: openHeight },
      }
    : {
        spineRect: { x: rect.x, y: rect.y + rect.height - spineHeight, width: rect.width, height: spineHeight },
        openRect: { x: rect.x, y: rect.y, width: rect.width, height: openHeight },
      };
}

const NO_FOLDS: ReadonlyArray<string> = [];

/**
 * Where every pane of `layout` sits in `container` once the splits that don't fit have folded (see
 * {@link TilingFold}): pure, derived only, never written into the layout.
 *
 * - With `config.fold` off (undefined or `false`), `leaves` and `splits` are exactly
 *   `resolveLayoutGeometry(layout, container, config)`'s. With it on, so are they wherever every pane already gets
 *   its fold floor: a desktop layout whose panes are all above the floor is unchanged.
 * - A split folds when its two children's floors along its axis ({@link TilingFoldConfig.minPanePx} and its
 *   precedence) plus its gutter (`gapPx`, the split's own first, and `handleSizePx`) don't fit its extent.
 * - A split where both fit stays a split. If its stored ratio leaves a child under its floor, the boundary moves so
 *   that child is exactly on its floor (reported in `fittedRatios`); otherwise it is laid out as stored. A split
 *   with a child static along it keeps its pins.
 * - The open side is the one holding `focusedLeafId`, else the one holding the first of `recentLeafIds` it holds,
 *   else the first. It is laid out afresh in the split's box less the spine (`spineSizePx`) and the split's gap.
 * - A `layoutMode: "master"` split never folds.
 * - Split ids must be unique, as the layout requires; a tree that repeats one is laid out unfolded.
 */
export function resolveFoldPlan(
  layout: TilingLayoutNode,
  container: TilingRect,
  config: TilingLayoutConfig,
  focusedLeafId: string | null,
  recentLeafIds: ReadonlyArray<string> = [],
): TilingFoldPlan {
  const base: TilingLayoutGeometry = resolveLayoutGeometry(layout, container, config);
  const fold: false | TilingFoldConfig | undefined = config.fold;
  const leaves: Map<string, TilingRect> = new Map<string, TilingRect>();
  const splits: Map<string, TilingSplitGeometry> = new Map<string, TilingSplitGeometry>();
  const folds: Array<TilingFold> = [];
  const leafFolds: Map<string, ReadonlyArray<string>> = new Map<string, ReadonlyArray<string>>();
  const foldedLeafIds: Set<string> = new Set<string>();
  const fittedRatios: Map<string, number> = new Map<string, number>();

  if (!fold || !hasUniqueSplitIds(layout)) {
    for (const leafId of base.leaves.keys()) leafFolds.set(leafId, NO_FOLDS);
    return { leaves: base.leaves, splits: base.splits, folds, fittedRatios, leafFolds, foldedLeafIds };
  }

  const spinePx: number = positivePx(fold.spineSizePx) ?? TILING_DEFAULT_FOLD_SPINE_PX;
  const preferred: ReadonlyArray<string> = focusedLeafId == null ? recentLeafIds : [focusedLeafId, ...recentLeafIds];

  const visitSlot = (slot: TilingLeafNode | TilingGroupNode, geometry: TilingLayoutGeometry, enclosing: ReadonlyArray<string>): void => {
    const leafId: string | null = shownLeafId(slot);
    const rect: TilingRect | undefined = leafId == null ? undefined : geometry.leaves.get(leafId);
    if (leafId != null && rect != null) {
      leaves.set(leafId, rect);
      leafFolds.set(leafId, enclosing);
    }
  };

  const visit = (node: TilingLayoutNode, geometry: TilingLayoutGeometry, enclosing: ReadonlyArray<string>): void => {
    if (node.kind !== "split") {
      visitSlot(node, geometry, enclosing);
      return;
    }
    const splitGeometry: TilingSplitGeometry | undefined = geometry.splits.get(node.id);
    if (splitGeometry == null) {
      return;
    }
    if (node.layoutMode === "master") {
      splits.set(node.id, splitGeometry);
      for (const slot of collectMasterSlots(node)) {
        if (slot.kind !== "split") visitSlot(slot, geometry, enclosing);
      }
      return;
    }
    const judged: "fold" | number | null = judgeSplit(node, splitGeometry.rect, config, fold);
    if (judged !== "fold") {
      let kept: TilingLayoutGeometry = geometry;
      if (judged != null) {
        // The boundary moves to the floor: the split's subtree is laid out afresh at the fitted ratio.
        fittedRatios.set(node.id, judged);
        kept = resolveLayoutGeometry({ ...node, ratio: judged }, splitGeometry.rect, config);
      }
      splits.set(node.id, kept.splits.get(node.id) ?? splitGeometry);
      visit(node.first, kept, enclosing);
      visit(node.second, kept, enclosing);
      return;
    }

    const openSide: TilingFoldSide = openSideOf(node, preferred);
    const foldedSide: TilingFoldSide = openSide === "first" ? "second" : "first";
    const spineEdge: TilingFoldEdge =
      node.axis === "horizontal" ? (foldedSide === "first" ? "left" : "right") : foldedSide === "first" ? "top" : "bottom";
    const gapPx: number = Math.max(0, node.gapPx ?? config.gapPx);
    const { spineRect, openRect } = foldBoxes(splitGeometry.rect, node.axis, spineEdge, spinePx, gapPx);
    const folded: TilingLayoutNode = node[foldedSide];
    const spineLeafIds: Array<string> = shownLeafIds(folded);
    const target: string | undefined = preferred.find((leafId: string): boolean => spineLeafIds.includes(leafId));
    folds.push({
      splitId: node.id,
      axis: node.axis,
      openSide,
      spineEdge,
      rect: { ...splitGeometry.rect },
      spineRect,
      openRect,
      leafIds: spineLeafIds,
      targetLeafId: target ?? spineLeafIds[0] ?? null,
      parentSplitId: enclosing.length > 0 ? enclosing[enclosing.length - 1] : null,
    });
    for (const leafId of allLeafIds(folded)) foldedLeafIds.add(leafId);
    const open: TilingLayoutNode = node[openSide];
    visit(open, resolveLayoutGeometry(open, openRect, config), [...enclosing, node.id]);
  };

  visit(layout, base, NO_FOLDS);
  if (folds.length === 0 && fittedRatios.size === 0) {
    return { leaves: base.leaves, splits: base.splits, folds, fittedRatios, leafFolds, foldedLeafIds };
  }
  return { leaves, splits, folds, fittedRatios, leafFolds, foldedLeafIds };
}

/**
 * The fold to turn to reach what lies `direction` of `leafId` (an open leaf of `plan`): the nearest enclosing fold
 * on that axis whose spine is on that side (`"right"` → a side-by-side fold with its spine on the right). `null` when
 * there is none: past the last fold that way (where a swipe carries on into the next workspace), or `leafId` is not
 * open.
 */
export function findFoldToward(plan: TilingFoldPlan, leafId: string, direction: TilingFocusDirection): TilingFold | null {
  const enclosing: ReadonlyArray<string> | undefined = plan.leafFolds.get(leafId);
  if (enclosing == null) return null;
  const edge: TilingFoldEdge = direction === "up" ? "top" : direction === "down" ? "bottom" : direction;
  for (let index = enclosing.length - 1; index >= 0; index -= 1) {
    const fold: TilingFold | undefined = plan.folds.find((candidate: TilingFold): boolean => candidate.splitId === enclosing[index]);
    if (fold != null && fold.spineEdge === edge) return fold;
  }
  return null;
}
