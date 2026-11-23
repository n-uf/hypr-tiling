import {
  tilingDrag,
  type Rect,
  type Split,
  type SplitOptions,
  type TilingAfter,
  type TilingDrag,
  type TilingDragOptions,
  type TilingHeld,
  type TilingMark,
  type TilingPart,
  type TilingRefusal,
  type TilingStack,
  type TilingSubject,
  type TilingTree,
} from "@n-uf/placement/tiling";
import type { DragResolvedTarget, DragSubject } from "./drag-machine";
import type { TilingDropIntentState, TilingEdgeZone } from "./drop-intent-resolver";
import { mapLayoutToSplit, sizingSplitOptions } from "./leaf-geometry";
import {
  crossAxisDimension,
  isStaticAlongSplitAxis,
  isStaticInDimension,
  splitAxisDimension,
} from "./pane-sizing";
import {
  extractLeafNode,
  findGroupById,
  findGroupContainingLeaf,
  insertGroupAdjacent,
  insertLeafAdjacent,
  mergeDraggedLeafIntoTarget,
  mergeGroupIntoTarget,
  normalizeStaticAxisFill,
  removeGroupNode,
  swapGroupWithSlot,
  swapLeafTiles,
} from "./state";
import type {
  TilingDimension,
  TilingGroupNode,
  TilingLayoutConfig,
  TilingLayoutNode,
  TilingLeafNode,
  TilingMovePlacement,
  TilingSplitAxis,
  TilingSplitNode,
} from "./types";

/**
 * hypr-tiling's tree as `@n-uf/placement/tiling`'s drag reads and changes it: the layout tree and its own reducers,
 * behind the library's `TilingTree` adapter. The library owns the drag's rules (what is released, which tree each
 * change takes, home, the refusals, the one layout per held place); this module only answers in hypr-tiling's terms.
 *
 * - **Keys are tile ids.** A pane is the tile a slot shows: a leaf's tile, or a group's active member's. A swap
 *   trades tiles between leaves (`swapLeafTiles`) and leaves every leaf (with its sizing) where it is, so the tile is
 *   what moves: the partner's tile lands in the subject's old slot. A stack is a group, its members their tiles.
 * - **The tree carries what a release took out.** `release` takes the subject's node out of the layout and keeps it
 *   as `loose`, so `beside` and `join` can place that same node (its leaf ids, sizing, the group whole) with the
 *   existing reducers. A lift tree has nothing loose. A subject that is the whole layout leaves `layout: null`.
 * - **Geometry is the renderer's.** `split` is the same mapping the renderer lays out (`mapLayoutToSplit`), and
 *   {@link tilingDragSplitOptions} the same sizing and floors (`sizingSplitOptions`), read off the node each mapped
 *   child stands for.
 *
 * @internal
 */
export interface TilingDragTree {
  /** The layout tree, or null when a release took its only slot. */
  readonly layout: TilingLayoutNode | null;
  /** The node a release took out and nothing has placed yet: the subject's leaf, or its whole group. */
  readonly loose?: TilingLeafNode | TilingGroupNode;
}

/** The layout node each mapped `Split` node stands for, so the per-child sizing callbacks can read it. */
const NODE_OF_SPLIT: WeakMap<object, TilingLayoutNode> = new WeakMap<object, TilingLayoutNode>();
/** A layout's mapping, kept per layout node (layouts are immutable: every reducer returns a new tree). */
const SPLIT_OF_LAYOUT: WeakMap<TilingLayoutNode, Split<string>> = new WeakMap<TilingLayoutNode, Split<string>>();

/** The tile a slot shows: a leaf's, or its group's active member's (the first member's, when none is active). */
function shownTileOf(slot: TilingLeafNode | TilingGroupNode): string {
  if (slot.kind === "leaf") {
    return slot.tileId;
  }
  return (slot.members.find((member: TilingLeafNode): boolean => member.id === slot.activeMemberId) ?? slot.members[0])?.tileId ?? "";
}

/** `layout` as placement's split tree keyed by tile id (see {@link TilingDragTree}). */
function splitOfLayout(layout: TilingLayoutNode): Split<string> {
  const known: Split<string> | undefined = SPLIT_OF_LAYOUT.get(layout);
  if (known) {
    return known;
  }
  const split: Split<string> = mapLayoutToSplit<string>(
    layout,
    shownTileOf,
    (node: TilingSplitNode): string => node.id,
    (mapped: Split<string>, node: TilingLayoutNode): void => {
      NODE_OF_SPLIT.set(mapped, node);
    },
  );
  SPLIT_OF_LAYOUT.set(layout, split);
  return split;
}

/** The leaf carrying `tileId` in `node` (a loose leaf or a group member), or null. */
function leafOfTile(node: TilingLayoutNode | null, tileId: string): TilingLeafNode | null {
  if (node == null) {
    return null;
  }
  if (node.kind === "leaf") {
    return node.tileId === tileId ? node : null;
  }
  if (node.kind === "group") {
    return node.members.find((member: TilingLeafNode): boolean => member.tileId === tileId) ?? null;
  }
  return leafOfTile(node.first, tileId) ?? leafOfTile(node.second, tileId);
}

/** The group that has a member carrying `tileId`, or null. */
function groupOfTile(node: TilingLayoutNode | null, tileId: string): TilingGroupNode | null {
  if (node == null || node.kind === "leaf") {
    return null;
  }
  if (node.kind === "group") {
    return node.members.some((member: TilingLeafNode): boolean => member.tileId === tileId) ? node : null;
  }
  return groupOfTile(node.first, tileId) ?? groupOfTile(node.second, tileId);
}

/** A group as the drag reads a stack: its id, its members' tiles in tab order, and the tile it is drawn as. */
function stackOfGroup(group: TilingGroupNode): TilingStack<string> {
  return {
    id: group.id,
    members: group.members.map((member: TilingLeafNode): string => member.tileId),
    active: shownTileOf(group),
  };
}

/** The id of the split that puts a loose node back beside the layout for a moment, so a reducer can take it out again. */
const LOOSE_SPLIT_ID: string = "hpt-drag-loose";

/**
 * `released`'s layout with its loose node put back beside it (the reducers that place a subject take it out of the
 * tree first; taking it out of this split gives `released.layout` back as it was), or null when nothing is loose.
 */
function withLoose(released: TilingDragTree): { readonly tree: TilingLayoutNode; readonly loose: TilingLeafNode | TilingGroupNode } | null {
  const loose: TilingLeafNode | TilingGroupNode | undefined = released.loose;
  if (loose == null || released.layout == null) {
    return null;
  }
  return {
    tree: { kind: "split", id: LOOSE_SPLIT_ID, axis: "horizontal", ratio: 0.5, first: released.layout, second: loose },
    loose,
  };
}

/** What {@link createTilingDragOps} takes. */
export interface TilingDragOpsOptions {
  /**
   * Commit-time reconciliation, part of every held place's tree but home's. Default: none, so a swap's tree is
   * exactly the swap reducer's. The renderer still reconciles a committed tree (`normalizeLayout`) when it stores it.
   */
  readonly normalize?: (layout: TilingLayoutNode) => TilingLayoutNode;
  /**
   * The parts of the pane drawn as `tile` in `layout`, laid on `rect` (its rect there, container px): a group's tab
   * strip, a host drop element. Read once per drag by the drag's hit. Default: none.
   */
  readonly parts?: (layout: TilingLayoutNode, tile: string, rect: Rect) => readonly TilingPart[];
}

/**
 * hypr-tiling's `TilingTree` adapter over {@link TilingDragTree}, keyed by tile id:
 * - `split`: the layout as the renderer maps it, a group standing in it as its active member's tile;
 * - `stackOf`: the group a tile is a member of;
 * - `release`: a pane leaves its slot or its group (`extractLeafNode`, the group collapsing to its last member), a
 *   whole group leaves its slot (`removeGroupNode`); both close the gap as `detachDragSubject` does, and the node
 *   taken out is kept loose;
 * - `swap`: `swapLeafTiles` for a pane (the two tiles trade leaves, in a group or not), `swapGroupWithSlot` for a
 *   whole group (it trades slots with the slot `at` is drawn in);
 * - `beside`: `insertLeafAdjacent` / `insertGroupAdjacent` of the loose node on `at`'s side, half and half, the axis
 *   the side's;
 * - `join`: `mergeDraggedLeafIntoTarget` / `mergeGroupIntoTarget` of the loose node into `at`'s group (made one
 *   when `at` is alone), at `index`;
 * - `normalize`: the option's, or none.
 *
 * @internal
 */
export function createTilingDragOps(options: TilingDragOpsOptions = {}): TilingTree<TilingDragTree, string> {
  const placeOptions = { preserveParentSplitAxis: false, splitRatio: 0.5 };
  const normalize = options.normalize;
  const parts = options.parts;
  const ops: TilingTree<TilingDragTree, string> = {
    ...(parts != null
      ? {
          parts: (tree: TilingDragTree, pane: string, rect: Rect): readonly TilingPart[] =>
            tree.layout == null ? [] : parts(tree.layout, pane, rect),
        }
      : {}),
    split: (tree: TilingDragTree): Split<string> | null => (tree.layout == null ? null : splitOfLayout(tree.layout)),
    stackOf: (tree: TilingDragTree, pane: string): TilingStack<string> | null => {
      const group: TilingGroupNode | null = groupOfTile(tree.layout, pane);
      return group == null ? null : stackOfGroup(group);
    },
    release(tree: TilingDragTree, subject: TilingSubject<string>): TilingDragTree {
      const layout: TilingLayoutNode | null = tree.layout;
      if (layout == null) {
        return tree;
      }
      if (subject.kind === "stack") {
        const group: TilingGroupNode | null = findGroupById(layout, subject.stack.id);
        if (group == null) {
          return tree;
        }
        return layout === group ? { layout: null, loose: group } : { layout: removeGroupNode(layout, group.id), loose: group };
      }
      const leaf: TilingLeafNode | null = leafOfTile(layout, subject.pane);
      if (leaf == null) {
        return tree;
      }
      const extraction = extractLeafNode(layout, leaf.id);
      if (extraction.extractedLeaf == null) {
        return tree;
      }
      return {
        layout: extraction.nextNode == null ? null : normalizeStaticAxisFill(extraction.nextNode),
        loose: extraction.extractedLeaf,
      };
    },
    beside(released: TilingDragTree, subject: TilingSubject<string>, at: string, side): TilingDragTree {
      const back = withLoose(released);
      const target: TilingLeafNode | null = leafOfTile(released.layout, at);
      if (back == null || target == null) {
        return released;
      }
      const layout: TilingLayoutNode =
        subject.kind === "stack" && back.loose.kind === "group"
          ? insertGroupAdjacent(back.tree, back.loose.id, target.id, side, placeOptions)
          : insertLeafAdjacent(back.tree, back.loose.id, target.id, side, placeOptions);
      return layout === back.tree ? released : { layout };
    },
    swap(tree: TilingDragTree, subject: TilingSubject<string>, at: string): TilingDragTree {
      const layout: TilingLayoutNode | null = tree.layout;
      const target: TilingLeafNode | null = leafOfTile(layout, at);
      if (layout == null || target == null) {
        return tree;
      }
      if (subject.kind === "stack") {
        return { layout: swapGroupWithSlot(layout, subject.stack.id, target.id) };
      }
      const leaf: TilingLeafNode | null = leafOfTile(layout, subject.pane);
      return leaf == null ? tree : { layout: swapLeafTiles(layout, leaf.id, target.id) };
    },
    join(released: TilingDragTree, subject: TilingSubject<string>, at: string, index?: number): TilingDragTree {
      const back = withLoose(released);
      const target: TilingLeafNode | null = leafOfTile(released.layout, at);
      if (back == null || target == null) {
        return released;
      }
      const layout: TilingLayoutNode =
        subject.kind === "stack" && back.loose.kind === "group"
          ? mergeGroupIntoTarget(back.tree, back.loose.id, target.id, index)
          : mergeDraggedLeafIntoTarget(back.tree, back.loose.id, target.id, index);
      return layout === back.tree ? released : { layout };
    },
  };
  if (normalize != null) {
    ops.normalize = (tree: TilingDragTree): TilingDragTree => {
      if (tree.layout == null) {
        return tree;
      }
      const layout: TilingLayoutNode = normalize(tree.layout);
      return layout === tree.layout ? tree : { ...tree, layout };
    };
  }
  return ops;
}

/**
 * The layout options of a tiling drag over {@link createTilingDragOps}'s trees under `config`: the gap and handle,
 * and each mapped child's fixed lengths and floors, as the renderer lays the same tree out.
 * @internal
 */
export function tilingDragSplitOptions(config: TilingLayoutConfig): SplitOptions<string> {
  return sizingSplitOptions<string>(
    config,
    (child: Split<string>): TilingLayoutNode | undefined => NODE_OF_SPLIT.get(child),
    (split: Split<string>): TilingSplitNode | undefined => {
      const node: TilingLayoutNode | undefined = NODE_OF_SPLIT.get(split);
      return node?.kind === "split" ? node : undefined;
    },
  );
}

/**
 * The drag subject for a drag of `sourceLeafId`: its whole group for a group drag (`subject: "group"` on a member of
 * one), else the pane (its tile). Null when the leaf is not in `layout`.
 * @internal
 */
export function tilingDragSubjectOf(
  layout: TilingLayoutNode,
  sourceLeafId: string,
  subject?: "pane" | "group",
): TilingSubject<string> | null {
  const leaf: TilingLeafNode | null = leafOfLeafId(layout, sourceLeafId);
  if (leaf == null) {
    return null;
  }
  const group: TilingGroupNode | null = subject === "group" ? groupOfTile(layout, leaf.tileId) : null;
  return group == null ? { kind: "pane", pane: leaf.tileId } : { kind: "stack", stack: stackOfGroup(group) };
}

function leafOfLeafId(node: TilingLayoutNode, leafId: string): TilingLeafNode | null {
  if (node.kind === "leaf") {
    return node.id === leafId ? node : null;
  }
  if (node.kind === "group") {
    return node.members.find((member: TilingLeafNode): boolean => member.id === leafId) ?? null;
  }
  return leafOfLeafId(node.first, leafId) ?? leafOfLeafId(node.second, leafId);
}

/** What {@link createLayoutTilingDrag} takes. */
export interface LayoutTilingDragParams {
  readonly layout: TilingLayoutNode;
  readonly sourceLeafId: string;
  readonly subject?: "pane" | "group";
  /** The stage the layout is laid out in (the renderer's viewport, at the origin). */
  readonly container: { readonly width: number; readonly height: number };
  readonly config: TilingLayoutConfig;
  /**
   * The least pane width and height a held place keeps (`tilingDrag`'s `min`): a side needs room for two panes of it
   * in its target, and every change keeps the subject and its target at least this size. Default 0 (no refusal for
   * room or fit).
   */
  readonly min?: number;
  /** Tiles whose panes take no drop (a statically gated leaf's). */
  readonly still?: (tile: string) => boolean;
  /** The panes' parts, as {@link TilingDragOpsOptions.parts}. */
  readonly parts?: TilingDragOpsOptions["parts"];
}

/**
 * The tiling drag of `sourceLeafId` in `layout` through `@n-uf/placement/tiling`'s `tilingDrag`, over hypr-tiling's
 * adapter: `after(held).tree.layout` is the layout tree a release on `held` commits, and `after(held).layout` its
 * panes' rects by tile id. Null when the source is not in the layout.
 * @internal
 */
export function createLayoutTilingDrag(params: LayoutTilingDragParams): TilingDrag<TilingDragTree, string> | null {
  const subject: TilingSubject<string> | null = tilingDragSubjectOf(params.layout, params.sourceLeafId, params.subject);
  if (subject == null) {
    return null;
  }
  const area: Rect = { x: 0, y: 0, width: Math.max(0, params.container.width), height: Math.max(0, params.container.height) };
  const options: TilingDragOptions<TilingDragTree, string> = {
    ...tilingDragSplitOptions(params.config),
    ops: createTilingDragOps(params.parts != null ? { parts: params.parts } : {}),
    area,
    min: params.min ?? 0,
    ...(params.still != null ? { still: params.still } : {}),
  };
  return tilingDrag<TilingDragTree, string>({ layout: params.layout }, subject, options);
}

/**
 * Where a drag's parts sit in a pane, measured once at the lift (container px), so the hit lays them on any rect the
 * pane is drawn at: a group's tab strip (its band from the slot's top, where its first tab starts, the gap between
 * tabs, and each tab's width by tile), per group in `strips` (by group id), `strip` for a group not measured; and host
 * drop elements (bands as insets from the slot's left, top and right), by tile, and by group id for whichever member a
 * group draws (after a torn tab its next member is drawn, and had no element of its own at the lift).
 * @internal
 */
export interface TilingDragPartGeometry {
  readonly strip?: TilingDragStripGeometry;
  readonly strips?: ReadonlyMap<string, TilingDragStripGeometry>;
  readonly bands?: ReadonlyMap<string, ReadonlyArray<{ readonly left: number; readonly top: number; readonly right: number; readonly height: number }>>;
}

/** A group's tab strip as measured at the lift. @internal */
export interface TilingDragStripGeometry {
  readonly top: number;
  readonly height: number;
  readonly left: number;
  readonly gap: number;
  readonly widths: ReadonlyMap<string, number>;
}

/**
 * The parts of a pane, from {@link TilingDragPartGeometry}: a group of two or more members has its strip (a join), a
 * slot per member left to right, each its tab's width and the gap after it (a member with no measured width takes the
 * mean); a tile with host bands has one part per band (a join, no index).
 * @internal
 */
export function tilingDragParts(geometry: TilingDragPartGeometry): (layout: TilingLayoutNode, tile: string, rect: Rect) => readonly TilingPart[] {
  return (layout: TilingLayoutNode, tile: string, rect: Rect): readonly TilingPart[] => {
    const out: TilingPart[] = [];
    const group: TilingGroupNode | null = groupOfTile(layout, tile);
    const strip: TilingDragStripGeometry | undefined = (group != null ? geometry.strips?.get(group.id) : undefined) ?? geometry.strip;
    if (strip != null && group != null && group.members.length >= 2) {
      const band: Rect = { x: rect.x, y: rect.y + strip.top, width: rect.width, height: Math.max(0, Math.min(strip.height, rect.height - strip.top)) };
      const known: number[] = [...strip.widths.values()];
      const mean: number = known.length > 0 ? known.reduce((s: number, w: number): number => s + w, 0) / known.length : 120;
      const slots: Rect[] = [];
      let x: number = band.x + strip.left;
      for (const member of group.members) {
        const width: number = Math.max(0, Math.min((strip.widths.get(member.tileId) ?? mean) + strip.gap, band.x + band.width - x));
        slots.push({ x, y: band.y, width, height: band.height });
        x += width;
      }
      out.push({ key: "strip", rect: band, slots });
    }
    for (const b of geometry.bands?.get(tile) ?? (group != null ? geometry.bands?.get(group.id) : undefined) ?? []) {
      out.push({ key: "band", rect: { x: rect.x + b.left, y: rect.y + b.top, width: Math.max(0, rect.width - b.left - b.right), height: b.height } });
    }
    return out;
  };
}

/**
 * The drop state of a held place of the drag hit (`place`, keyed by tile id) on `layout` (the lift tree), with its
 * Indicator mark: the leaf the place names (`at`'s leaf), its zone and action, a join's member index.
 * @internal
 */
export function tilingDropStateOf(
  layout: TilingLayoutNode,
  place: Exclude<TilingHeld<string>, { kind: "home" }>,
  mark: TilingMark<string> | null,
  devicePixelRatio: number,
): TilingDropIntentState | null {
  const leaf: TilingLeafNode | null = leafOfTile(layout, place.at);
  if (leaf == null) {
    return null;
  }
  const side: TilingEdgeZone | null = place.kind === "beside" ? place.side : null;
  return {
    ...dropStateBase(leaf.id, devicePixelRatio),
    zone: side ?? "center",
    action: place.kind === "swap" ? "swap" : place.kind === "beside" ? "edge-insert" : "group-merge",
    dominantEdge: side ?? "top",
    finalEdge: side,
    fallbackReason: place.kind === "join" ? "pane-part" : null,
    ...(place.kind === "join" && place.index !== undefined ? { memberInsertIndex: place.index } : {}),
    place,
    mark,
  };
}

/**
 * The drop state of a refused place under the pointer (`after(place).refusal`): no drop (`action: "none"`), its code
 * as the blocked reason, so the cursor says it takes nothing there.
 * @internal
 */
export function tilingRefusedDropStateOf(
  layout: TilingLayoutNode,
  place: Exclude<TilingHeld<string>, { kind: "home" }>,
  code: string,
  devicePixelRatio: number,
): TilingDropIntentState | null {
  const leaf: TilingLeafNode | null = leafOfTile(layout, place.at);
  if (leaf == null) {
    return null;
  }
  const side: TilingEdgeZone | null = place.kind === "beside" ? place.side : null;
  return { ...dropStateBase(leaf.id, devicePixelRatio), zone: side ?? "center", dominantEdge: side ?? "top", blockedReason: code };
}

function dropStateBase(leafId: string, devicePixelRatio: number): TilingDropIntentState {
  return {
    leafId,
    zone: "center",
    action: "none",
    dominantEdge: "top",
    finalEdge: null,
    fallbackReason: null,
    blockedReason: null,
    axisPath: [],
    edgeThresholdRatio: 0,
    centerRectWidthPx: 0,
    centerRectHeightPx: 0,
    centerDistancePx: 0,
    nearestEdgeDistancePx: 0,
    paneLocalX: 0,
    paneLocalY: 0,
    targetSplitId: null,
    targetSplitPlacement: null,
    selectedSplitZone: null,
    selectedSplitDistancePx: null,
    rejectedSplitReasons: [],
    tuning: { centerRatio: 0, edgeThresholdRatio: 0, devicePixelRatio },
  };
}

/**
 * Each region of the pane drawn on `leafId` as a place of `drag`: its refusal code, or null when a release there
 * commits (`after(place).refusal`), for the debug overlay. Null when the leaf is not drawn in the drag's base.
 * @internal
 */
export function tilingDragZoneRefusals(
  drag: TilingDrag<TilingDragTree, string> | null,
  leafId: string,
): Readonly<Record<"center" | TilingEdgeZone, string | null>> | null {
  const lift: TilingLayoutNode | null = drag?.lift.tree.layout ?? null;
  const leaf: TilingLeafNode | null = lift == null ? null : leafOfLeafId(lift, leafId);
  if (drag == null || leaf == null) {
    return null;
  }
  const at: string = leaf.tileId;
  const code = (held: TilingHeld<string>): string | null => drag.after(held).refusal?.code ?? null;
  return {
    center: code({ kind: "swap", at }),
    top: code({ kind: "beside", at, side: "top" }),
    right: code({ kind: "beside", at, side: "right" }),
    bottom: code({ kind: "beside", at, side: "bottom" }),
    left: code({ kind: "beside", at, side: "left" }),
  };
}

/** A pane's center (swap) zone, pane-local px. @internal */
export interface TilingPaneCenterZone {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * The center (swap) zone of the pane drawn at `rect`, as `hit`'s zone map has it (pane-local px): placement's regions,
 * with a run neighbor's swap across the run and the strips of the sides it has no more. Read on the pane's midlines,
 * since the center is a rectangle through the pane's middle; an edge within 1 px of the pane's is the pane's. Null when
 * the middle holds no swap (home, a refused swap). For the debug overlay.
 * @internal
 */
export function tilingHitPaneCenter(hit: { placeAt(point: { x: number; y: number }): string | null; heldOf(id: string): TilingHeld<string> | null }, rect: Rect): TilingPaneCenterZone | null {
  const mid = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const id: string | null = hit.placeAt(mid);
  if (id == null || hit.heldOf(id)?.kind !== "swap") {
    return null;
  }
  const at = (dx: number, dy: number, by: number): boolean => hit.placeAt({ x: mid.x + dx * by, y: mid.y + dy * by }) === id;
  // How far from the middle the zone runs along (dx, dy), up to `span`: it is convex, so one crossing.
  const reach = (dx: number, dy: number, span: number): number => {
    if (at(dx, dy, span - 0.5)) {
      return span;
    }
    let [inner, outer] = [0, span];
    while (outer - inner > 0.25) {
      const m: number = (inner + outer) / 2;
      if (at(dx, dy, m)) inner = m;
      else outer = m;
    }
    return span - inner <= 1 ? span : inner;
  };
  const [hw, hh] = [rect.width / 2, rect.height / 2];
  return { left: hw - reach(-1, 0, hw), right: hw + reach(1, 0, hw), top: hh - reach(0, -1, hh), bottom: hh + reach(0, 1, hh) };
}

/** A swap as a frame holding it draws it, and as its release commits it. @internal */
export interface TilingSwapPreview {
  /** The layout tree the release commits (`after(swap).tree`): the frame draws it. */
  readonly layout: TilingLayoutNode;
  /** The partner: the tile drawn where the drop is held, which lands in the subject's old place. */
  readonly partnerTileId: string;
  /** Where the partner lands (`after(swap).layout`), container px: its wash is drawn here. */
  readonly partnerRect: Rect;
  /** Where the subject lands (`after(swap).landing`), container px. */
  readonly landing: Rect;
  /** The library's answer, for a caller that reads more of it (`moved`, `splits`). */
  readonly after: TilingAfter<TilingDragTree, string>;
}

/**
 * The swap of the drag `drag` onto the pane drawn on `targetLeafId` (a loose leaf, or a group's active member), as
 * `tilingDrag` lays it out: the subject's old place reopened with the partner landed there, and the subject in the
 * partner's place. Null when there is no such pane or the library refuses the swap.
 * @internal
 */
export function resolveTilingSwapPreview(
  drag: TilingDrag<TilingDragTree, string> | null,
  targetLeafId: string,
): TilingSwapPreview | null {
  const lift: TilingLayoutNode | null = drag?.lift.tree.layout ?? null;
  if (drag == null || lift == null) {
    return null;
  }
  const target: TilingLeafNode | null = leafOfLeafId(lift, targetLeafId);
  if (target == null) {
    return null;
  }
  const after: TilingAfter<TilingDragTree, string> = drag.after({ kind: "swap", at: target.tileId });
  // The partner's landing is the slot it is drawn in: its own, or the group it lands in as a tab (a tab torn off a
  // group leaves the partner in its place there, behind the group's active tab).
  const partnerGroup: TilingGroupNode | null = groupOfTile(after.tree.layout, target.tileId);
  const partnerRect: Rect | undefined = after.layout.get(partnerGroup == null ? target.tileId : shownTileOf(partnerGroup));
  if (after.refusal != null || after.tree.layout == null || after.landing == null || partnerRect == null) {
    return null;
  }
  return { layout: after.tree.layout, partnerTileId: target.tileId, partnerRect, landing: after.landing, after };
}

/**
 * The layout tree a release on `target` commits: the drag hit's held place's `after(place).tree` (what its frame drew),
 * from the very drag the frame drew it with (`drag`, with its `min`, still panes and parts) when it is this drag's;
 * else from a drag made here on the same options (`min`, `still`). Null when the release commits nothing: no held
 * place, home, the pane's own place, or a place `after(place)` refuses.
 * @internal
 */
export function deriveDropCommitTree(params: {
  readonly layout: TilingLayoutNode;
  readonly sourceLeafId: string;
  readonly target: DragResolvedTarget | null;
  readonly subject?: DragSubject;
  readonly container: { readonly width: number; readonly height: number };
  readonly config: TilingLayoutConfig;
  /** The drag the frame drew the held place with: used when it lifted `layout` itself. */
  readonly drag?: TilingDrag<TilingDragTree, string> | null;
  readonly still?: (tile: string) => boolean;
}): TilingLayoutNode | null {
  const { layout, sourceLeafId, target, subject } = params;
  const place: TilingHeld<string> | undefined = target?.place;
  if (target == null || place == null || place.kind === "home" || target.leafId === sourceLeafId) {
    return null;
  }
  const drag =
    params.drag != null && params.drag.lift.tree.layout != null && sameLayoutTree(params.drag.lift.tree.layout, layout)
      ? params.drag
      : createLayoutTilingDrag({
          layout,
          sourceLeafId,
          subject,
          container: params.container,
          config: params.config,
          min: params.config.minPaneSizePx,
          ...(params.still != null ? { still: params.still } : {}),
        });
  const after: TilingAfter<TilingDragTree, string> | null = drag?.after(place) ?? null;
  return after != null && after.refusal == null ? after.tree.layout : null;
}

/**
 * Whether two layout trees are the same tree: the same object, or equal node for node (a host may hand back an equal
 * tree as a new object). Compared by value only when the objects differ.
 * @internal
 */
export function sameLayoutTree(a: TilingLayoutNode, b: TilingLayoutNode): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The layout tree `dragMode: "preview"`'s overlays draw for `target`: the tree a release on it commits
 * ({@link deriveDropCommitTree}'s `after(place).tree`, from the same drag), or null when a release there commits
 * nothing, so nothing is drawn.
 * @internal
 */
export function deriveDropPreviewTree(
  params: Omit<Parameters<typeof deriveDropCommitTree>[0], "sourceLeafId"> & { readonly sourceLeafId: string | null },
): TilingLayoutNode | null {
  const sourceLeafId: string | null = params.sourceLeafId;
  return sourceLeafId == null ? null : deriveDropCommitTree({ ...params, sourceLeafId });
}

/**
 * The along-axis pixel pin for a node static ALONG `axis`, or `null` for no usable (finite, strictly-positive) pin.
 * Mirrors `leaf-geometry`'s `alongAxisPinPx`: a split with a fitting along-axis pin is geometry-resolvable
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

/** True when a child static-along-axis lacks a usable pin, so its split's space distribution is unknowable. */
function childMakesSplitUnresolvable(node: TilingLayoutNode, axis: TilingSplitAxis): boolean {
  return isStaticAlongSplitAxis(node, axis) && alongAxisPinPx(node, axis) == null;
}

/**
 * The still panes of `layout`: the leaf ids that take part in no move (neither a moved subject nor a place's target),
 * by a drag, the keyboard or a command. The drag takes their tiles as its `still` panes ({@link tilingStillTiles}).
 *
 * A leaf is still iff:
 *   1. it is static in either dimension (a content-sized pane has no ratio footprint to relocate or split), or
 *   2. it lies under a split that has a child static along its axis without a usable pin: that split's space
 *      distribution is content-determined and unknowable to pure geometry, so the whole subtree is still.
 *
 * A split whose static-along-axis child is pinned is geometry-resolvable, so rule 2 does not fire there: only the
 * static leaf itself (rule 1) is still, and its flexible sibling stays movable. A collapsed leaf's collapse-forced
 * along-axis pin is a known extent, not a content size, so only its cross dimension counts for rule 1. A group is
 * judged as one slot, keyed by its active member.
 * @internal
 */
export function collectStaticGatedLeafIds(layout: TilingLayoutNode): ReadonlySet<string> {
  const gated = new Set<string>();

  function walk(node: TilingLayoutNode, inUnresolvableRegion: boolean, parentAxis: TilingSplitAxis | undefined): void {
    if (node.kind === "leaf") {
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
      const groupStatic: boolean = isStaticInDimension(node, "width") || isStaticInDimension(node, "height");
      if (inUnresolvableRegion || groupStatic) {
        gated.add(node.activeMemberId);
      }
      return;
    }
    const splitUnresolvable: boolean =
      childMakesSplitUnresolvable(node.first, node.axis) || childMakesSplitUnresolvable(node.second, node.axis);
    const childRegionGated: boolean = inUnresolvableRegion || splitUnresolvable;
    walk(node.first, childRegionGated, node.axis);
    walk(node.second, childRegionGated, node.axis);
  }

  walk(layout, false, undefined);
  return gated;
}

/** The drag's still panes (they take no drop): the tiles of the still leaves `gated` of `layout`. @internal */
export function tilingStillTiles(layout: TilingLayoutNode, gated: ReadonlySet<string>): (tile: string) => boolean {
  const tiles: Set<string> = new Set<string>();
  for (const id of gated) {
    const tile: string | undefined = leafOfLeafId(layout, id)?.tileId;
    if (tile != null) {
      tiles.add(tile);
    }
  }
  return (tile: string): boolean => tiles.has(tile);
}

/**
 * A user move that is not a pointer drag, by leaf ids. Each is the drag of a subject to one place, and commits what
 * that drag's release there commits ({@link resolveTilingMove}):
 * - `swap-panes`: the source pane swaps with the target (the drag's swap onto the target);
 * - `insert-adjacent`: the source pane goes beside the target on `placement`'s side;
 * - `move-mode`: keyboard move mode's commit, beside the target on `placement`'s side; a pane of a tab group of two or
 *   more moves its whole group, as its title bar drags it.
 * @internal
 */
export type TilingKeyboardMove =
  | { readonly kind: "swap-panes"; readonly sourceLeafId: string; readonly targetLeafId: string }
  | {
      readonly kind: "insert-adjacent" | "move-mode";
      readonly sourceLeafId: string;
      readonly targetLeafId: string;
      readonly placement: TilingMovePlacement;
    };

/** The drag a {@link TilingKeyboardMove} is: its source, its subject and its place (keyed by tile id). @internal */
export interface TilingMovePlace {
  readonly sourceLeafId: string;
  readonly subject?: "group";
  readonly place: Exclude<TilingHeld<string>, { kind: "home" }>;
}

/**
 * The drag a keyboard or command move is: the subject (a pane, or for move mode a pane's group of two or more) and the
 * place on the target leaf's tile. Null when the source or the target is not in `layout`.
 * @internal
 */
export function tilingMovePlaceOf(layout: TilingLayoutNode, move: TilingKeyboardMove): TilingMovePlace | null {
  const source: TilingLeafNode | null = leafOfLeafId(layout, move.sourceLeafId);
  const target: TilingLeafNode | null = leafOfLeafId(layout, move.targetLeafId);
  if (source == null || target == null) {
    return null;
  }
  const at: string = target.tileId;
  const place: Exclude<TilingHeld<string>, { kind: "home" }> =
    move.kind === "swap-panes" ? { kind: "swap", at } : { kind: "beside", at, side: move.placement };
  const group: TilingGroupNode | null = move.kind === "move-mode" ? findGroupContainingLeaf(layout, source.id) : null;
  return group != null && group.members.length >= 2
    ? { sourceLeafId: source.id, subject: "group", place }
    : { sourceLeafId: source.id, place };
}

/** A keyboard or command move's verdict: the tree it commits, or why it commits nothing. @internal */
export type TilingMoveResult =
  | { readonly layout: TilingLayoutNode; readonly refusal: null }
  | { readonly layout: null; readonly refusal: TilingRefusal<string> };

/**
 * The one move rule for a keyboard or command move: the tree a pointer drag of the same subject to the same place
 * commits (`after(place).tree` of placement's `tilingDrag`, on the same stage, `min` and still panes), and its
 * refusal when that place is refused (`room-along`, `room-across`, `fit`, `still`, `self`, `missing`). A still source
 * is refused `still`, as a drag never lifts it; a source or target not in `layout` is refused `missing`. The caller
 * reconciles the tree as a drop's commit does (`normalizeLayout`).
 * @internal
 */
export function resolveTilingMove(params: {
  readonly layout: TilingLayoutNode;
  readonly move: TilingKeyboardMove;
  readonly container: { readonly width: number; readonly height: number };
  readonly config: TilingLayoutConfig;
  /** The still leaves ({@link collectStaticGatedLeafIds}); computed from `layout` when left out. */
  readonly gated?: ReadonlySet<string>;
}): TilingMoveResult {
  const { layout, move } = params;
  const gated: ReadonlySet<string> = params.gated ?? collectStaticGatedLeafIds(layout);
  const found: TilingMovePlace | null = tilingMovePlaceOf(layout, move);
  if (found == null) {
    return { layout: null, refusal: { code: "missing" } };
  }
  if (gated.has(found.sourceLeafId)) {
    return { layout: null, refusal: { code: "still" } };
  }
  const drag: TilingDrag<TilingDragTree, string> | null = createLayoutTilingDrag({
    layout,
    sourceLeafId: found.sourceLeafId,
    ...(found.subject != null ? { subject: found.subject } : {}),
    container: params.container,
    config: params.config,
    min: params.config.minPaneSizePx,
    still: tilingStillTiles(layout, gated),
  });
  if (drag == null) {
    return { layout: null, refusal: { code: "missing" } };
  }
  const after: TilingAfter<TilingDragTree, string> = drag.after(found.place);
  if (after.refusal != null) {
    return { layout: null, refusal: after.refusal };
  }
  return after.tree.layout == null ? { layout: null, refusal: { code: "missing" } } : { layout: after.tree.layout, refusal: null };
}
