import {
  tilingDrag,
  type PaneRegionOptions,
  type Rect,
  type Split,
  type SplitOptions,
  type TilingAfter,
  type TilingDrag,
  type TilingDragOptions,
  type TilingStack,
  type TilingSubject,
  type TilingTree,
} from "@n-uf/placement/tiling";
import { deriveCandidateTree, type DragResolvedTarget, type DragSubject } from "./drag-machine";
import { mapLayoutToSplit, sizingSplitOptions } from "./leaf-geometry";
import {
  extractLeafNode,
  findGroupById,
  insertGroupAdjacent,
  insertLeafAdjacent,
  mergeDraggedLeafIntoTarget,
  mergeGroupIntoTarget,
  normalizeStaticAxisFill,
  removeGroupNode,
  swapGroupWithSlot,
  swapLeafTiles,
} from "./state";
import type { TilingGroupNode, TilingLayoutConfig, TilingLayoutNode, TilingLeafNode, TilingPaneFootprint, TilingSplitNode } from "./types";

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
 *   the side's (as `insertDragSubjectAdjacent` places a drop);
 * - `join`: `mergeDraggedLeafIntoTarget` / `mergeGroupIntoTarget` of the loose node into `at`'s group (made one
 *   when `at` is alone), at `index`;
 * - `normalize`: the option's, or none.
 *
 * @internal
 */
export function createTilingDragOps(options: TilingDragOpsOptions = {}): TilingTree<TilingDragTree, string> {
  const placeOptions = { preserveParentSplitAxis: false, splitRatio: 0.5 };
  const normalize = options.normalize;
  const ops: TilingTree<TilingDragTree, string> = {
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
   * The least pane width and height a held place keeps (`tilingDrag`'s `min`). Default 0: drop validity stays the
   * renderer's own (a swap is always valid there), so the drag refuses no swap it would commit.
   */
  readonly min?: number;
  /** A pane's drop regions, as the renderer's own zone geometry sizes them (centre ratios, floor, hysteresis, pixel ratio). */
  readonly regions?: PaneRegionOptions;
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
    ops: createTilingDragOps(),
    area,
    min: params.min ?? 0,
    ...(params.regions ? { regions: params.regions } : {}),
  };
  return tilingDrag<TilingDragTree, string>({ layout: params.layout }, subject, options);
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
 * The layout tree a release on `target` commits: a swap's is `tilingDrag`'s `after(swap).tree` (what its frame drew,
 * {@link resolveTilingSwapPreview}); every other drop's, and a swap the library refuses, is `deriveCandidateTree`'s
 * as before.
 * @internal
 */
export function deriveDropCommitTree(params: {
  readonly layout: TilingLayoutNode;
  readonly sourceLeafId: string;
  readonly target: DragResolvedTarget | null;
  readonly subject?: DragSubject;
  readonly container: { readonly width: number; readonly height: number };
  readonly config: TilingLayoutConfig;
}): TilingLayoutNode {
  const { layout, sourceLeafId, target, subject } = params;
  if (target != null && target.action === "swap" && target.leafId !== sourceLeafId) {
    const drag = createLayoutTilingDrag({ layout, sourceLeafId, subject, container: params.container, config: params.config });
    const preview: TilingSwapPreview | null = resolveTilingSwapPreview(drag, target.leafId);
    if (preview != null) {
      return preview.layout;
    }
  }
  return deriveCandidateTree(layout, sourceLeafId, target, subject);
}

/** A rect as a footprint (container px). */
const footprintOf = (rect: Rect): TilingPaneFootprint => ({ left: rect.x, top: rect.y, width: rect.width, height: rect.height });

/**
 * The drag's hit footprints by leaf id: each of `tilingDrag`'s targets (one per pane of the base, the tree with the
 * subject released) at its base rect, keyed by the leaf it is drawn on there. A new target is acquired on these.
 * @internal
 */
export function tilingDragHitFootprints(drag: TilingDrag<TilingDragTree, string>): ReadonlyMap<string, TilingPaneFootprint> {
  const out = new Map<string, TilingPaneFootprint>();
  for (const target of drag.targets) {
    const leaf: TilingLeafNode | null = leafOfTile(drag.base.tree.layout, target.pane);
    if (leaf != null) {
      out.set(leaf.id, footprintOf(target.hit));
    }
  }
  return out;
}

/** A pane drop the resolver holds: on the leaf `leafId`, a swap (`action: "swap"`) or a side drop (`"edge-insert"`, on `zone`). */
export interface TilingHeldPaneDrop {
  readonly leafId: string;
  readonly zone: "center" | "left" | "right" | "top" | "bottom";
  readonly action: string;
}

/**
 * Whether the held pane drop `held` keeps the pointer at `point` (container px), by `tilingDrag`'s `holds`: the point
 * is in the held place's own zone where the frame draws its pane (`drawnLayout` laid out as `drawnFootprints`, by leaf
 * id). A held swap keeps the partner's centre as drawn, a side its band. Gives the footprint the pane is drawn at, or
 * null when it doesn't hold (the next drop is then acquired on the base).
 * @internal
 */
export function tilingDragHeldFootprint(
  drag: TilingDrag<TilingDragTree, string> | null,
  held: TilingHeldPaneDrop,
  point: { readonly x: number; readonly y: number },
  drawnLayout: TilingLayoutNode,
  drawnFootprints: ReadonlyMap<string, TilingPaneFootprint>,
): TilingPaneFootprint | null {
  const lift: TilingLayoutNode | null = drag?.lift.tree.layout ?? null;
  if (drag == null || lift == null || (held.action !== "swap" && held.action !== "edge-insert")) {
    return null;
  }
  const tile: string | undefined = leafOfLeafId(lift, held.leafId)?.tileId;
  if (tile == null) {
    return null;
  }
  // The pane is drawn on the leaf that shows its tile in the drawn tree: its own, or its group's.
  const group: TilingGroupNode | null = groupOfTile(drawnLayout, tile);
  const drawnTile: string = group == null ? tile : shownTileOf(group);
  const drawnLeaf: TilingLeafNode | null = leafOfTile(drawnLayout, drawnTile);
  const footprint: TilingPaneFootprint | undefined = drawnLeaf == null ? undefined : drawnFootprints.get(drawnLeaf.id);
  if (footprint == null) {
    return null;
  }
  const rect: Rect = { x: footprint.left, y: footprint.top, width: footprint.width, height: footprint.height };
  const place = held.action === "swap" ? ({ kind: "swap", at: tile } as const) : held.zone === "center" ? null : ({ kind: "beside", at: tile, side: held.zone } as const);
  return place != null && drag.holds(place, point, new Map([[tile, rect]])) ? footprint : null;
}
