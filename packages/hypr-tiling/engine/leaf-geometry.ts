import {
  clampByMinSize,
  crossAxisDimension,
  isStaticAlongSplitAxis,
  isStaticOnCrossAxis,
  resolveAlongAxisFloor,
  resolveRatioSafetyBounds,
  resolveStaticAlongExtents,
  splitAxisDimension,
  splitBoundaryGutterPx,
} from "./pane-sizing";
import type {
  TilingLayoutConfig,
  TilingLayoutNode,
  TilingLeafNode,
  TilingMasterOrientation,
  TilingPaneFootprint,
  TilingSplitAxis,
  TilingSplitNode,
  TilingDimension,
} from "./types";

/**
 * Canonical single-source leaf-geometry traversal — the ONE pass that resolves
 * where every pane sits. It replaces the former split: the px/gap/handle-aware
 * `collectLeafFootprints` (was in `projected-layout.ts`) and the normalized
 * `collectLeafRects` (was private in `state.ts`, consumed only by
 * `findLeafByDirection`). Both now route through `collectLeafFootprints` here,
 * so hit-testing, footprints, overlays, candidate derivation, and directional
 * focus all read the same geometry (no second source-of-truth that can diverge).
 *
 * The traversal is STATIC-AWARE: a child static ALONG the split axis with a
 * fitting pixel pin takes that exact extent and its flexible sibling fills the
 * remainder (mirroring the renderer's real flex layout); everything else
 * distributes by ratio. With NO static panes the static branch never fires, so
 * the geometry is identical to a pure ratio split.
 */

const GAP_FREE_UNIT_CONFIG: TilingLayoutConfig = {
  gapPx: 0,
  minPaneSizePx: 0,
  handleSizePx: 0,
};

/** @internal */
export interface TilingLeafFootprint extends TilingPaneFootprint {
  leafId: string;
}

/** Edge-rect (`right`/`bottom` instead of `width`/`height`) for directional neighbor search. @internal */
export interface LeafRect {
  leafId: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The along-axis pixel pin for a node static ALONG `axis`, or `null` when the
 * node carries no usable pin on that dimension. A usable pin is a finite,
 * strictly-positive px value (a zero/negative/absent pin is content-sized and
 * unknowable to pure geometry → callers fall back to ratio).
 */
function alongAxisPinPx(node: TilingLayoutNode, axis: TilingSplitAxis): number | null {
  const dimension: TilingDimension = splitAxisDimension(axis);
  const pinPx: number | undefined = dimension === "width" ? node.sizing?.widthPx : node.sizing?.heightPx;
  if (pinPx == null || !Number.isFinite(pinPx) || pinPx <= 0) {
    return null;
  }
  return pinPx;
}

function crossAxisPinPx(node: TilingLayoutNode, axis: TilingSplitAxis): number | null {
  const dimension: TilingDimension = crossAxisDimension(axis);
  const pinPx: number | undefined = dimension === "width" ? node.sizing?.widthPx : node.sizing?.heightPx;
  if (pinPx == null || !Number.isFinite(pinPx) || pinPx <= 0) {
    return null;
  }
  return pinPx;
}

/**
 * The CROSS-axis extent `collectLeafFootprints` reports for a split child:
 * `crossContainerPx` (the full cross extent) for a flexible-on-cross-axis node
 * — UNCHANGED — or its cross-axis pin for a node static on the cross axis (a
 * fitting, positive, finite px). This mirrors the renderer's
 * `align-self: flex-start` for a cross-axis-static child (see
 * `isStaticOnCrossAxis` in `pane-sizing.ts` and its use in
 * `tiling-renderer.tsx`): the DOM never stretches that child to fill the cross
 * axis, it content-sizes to its pin — so a footprint that still reported the
 * full cross extent was a phantom rect (an oversized hit-test / drop-zone /
 * directional-focus target trailing past the pane's real, content-sized DOM
 * box). The cross-axis offset (`left`/`top`) is untouched: `align-self:
 * flex-start` keeps the box at the cross-axis START, exactly where the caller
 * already positions it.
 */
function resolveCrossAxisExtentPx(
  node: TilingLayoutNode,
  axis: TilingSplitAxis,
  crossContainerPx: number,
): number {
  if (!isStaticOnCrossAxis(node, axis)) {
    return crossContainerPx;
  }
  return crossAxisPinPx(node, axis) ?? crossContainerPx;
}

/**
 * Distribute a split's along-axis extent when ONE child is static-along-axis
 * with a fitting pin: the static child takes exactly `staticPinPx`, a full
 * boundary gutter (`gapPx + handleSizePx`) is reserved between siblings (no
 * resize handle — matches the renderer static spacer), and the flexible sibling
 * FILLS the remainder.
 */
function collectStaticAlongFootprints(
  node: { axis: TilingSplitAxis; first: TilingLayoutNode; second: TilingLayoutNode },
  left: number,
  top: number,
  config: TilingLayoutConfig,
  firstPx: number,
  secondPx: number,
  gutterPx: number,
  firstCrossPx: number,
  secondCrossPx: number,
): ReadonlyArray<TilingLeafFootprint> {
  if (node.axis === "horizontal") {
    return [
      ...collectLeafFootprints(node.first, left, top, firstPx, firstCrossPx, config),
      ...collectLeafFootprints(
        node.second,
        left + firstPx + gutterPx,
        top,
        secondPx,
        secondCrossPx,
        config,
      ),
    ];
  }

  return [
    ...collectLeafFootprints(node.first, left, top, firstCrossPx, firstPx, config),
    ...collectLeafFootprints(
      node.second,
      left,
      top + firstPx + gutterPx,
      secondCrossPx,
      secondPx,
      config,
    ),
  ];
}

const MASTER_RATIO_MIN: number = 0.05;
const MASTER_RATIO_MAX: number = 0.95;

/** Resolved master/stack parameters for a `layoutMode: "master"` split. @internal */
export interface MasterStackParams {
  /** Number of slots in the master area, clamped to `[1, slotCount]`. */
  count: number;
  orientation: TilingMasterOrientation;
  /** Master-area fraction along the orientation's primary axis, clamped `[0.05, 0.95]`. */
  ratio: number;
}

function clampMasterRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  return Math.min(Math.max(value, MASTER_RATIO_MIN), MASTER_RATIO_MAX);
}

/**
 * The ordered list of master/stack SLOTS under a subtree — the descendant
 * non-split nodes (leaves now; groups in Phase-3b) in reading order. Nested
 * split structure is flattened: a `layoutMode: "master"` split lays its
 * descendant slots out as a FLAT list (the Hyprland master layout is a flat
 * window list, not a tree). The binary structure still defines slot membership +
 * order + identity and the reducers still operate on it.
 * @internal
 */
export function collectMasterSlots(node: TilingLayoutNode): ReadonlyArray<TilingLayoutNode> {
  if (node.kind === "leaf" || node.kind === "group") {
    return [node];
  }
  return [...collectMasterSlots(node.first), ...collectMasterSlots(node.second)];
}

/**
 * The representative leaf id of a slot — the id its single footprint is keyed by
 * (and the id the renderer focuses / hit-tests). A leaf is itself; a split slot
 * (should never occur — slots are flattened to non-splits) falls back to its
 * first descendant leaf. Phase-3b: a group resolves to its active member id.
 * @internal
 */
export function slotRepresentativeLeafId(node: TilingLayoutNode): string {
  if (node.kind === "leaf") {
    return node.id;
  }
  if (node.kind === "group") {
    return node.activeMemberId;
  }
  return slotRepresentativeLeafId(node.first);
}

/** Resolve a master split's parameters, clamping count to the available slots. @internal */
export function resolveMasterParams(node: TilingSplitNode, slotCount: number): MasterStackParams {
  const requestedCount: number = Math.round(node.masterCount ?? 1);
  const maxCount: number = Math.max(slotCount, 1);
  return {
    count: Math.min(Math.max(requestedCount, 1), maxCount),
    orientation: node.masterOrientation ?? "left",
    ratio: clampMasterRatio(node.ratio),
  };
}

/**
 * Lay `items` out equally along `stackAxis` within a region, reserving `gapPx`
 * between adjacent items, recursing into each slot via `collectLeafFootprints`
 * (so a leaf slot — or a group slot in Phase-3b — resolves its own footprint).
 */
function layoutSlotsAlong(
  items: ReadonlyArray<TilingLayoutNode>,
  left: number,
  top: number,
  width: number,
  height: number,
  stackAxis: "vertical" | "horizontal",
  gapPx: number,
  config: TilingLayoutConfig,
): ReadonlyArray<TilingLeafFootprint> {
  const count: number = items.length;
  if (count === 0) {
    return [];
  }
  const totalGapPx: number = gapPx * (count - 1);
  if (stackAxis === "vertical") {
    const eachHeight: number = Math.max(0, (height - totalGapPx) / count);
    return items.flatMap((item: TilingLayoutNode, index: number): ReadonlyArray<TilingLeafFootprint> =>
      collectLeafFootprints(item, left, top + index * (eachHeight + gapPx), width, eachHeight, config),
    );
  }
  const eachWidth: number = Math.max(0, (width - totalGapPx) / count);
  return items.flatMap((item: TilingLayoutNode, index: number): ReadonlyArray<TilingLeafFootprint> =>
    collectLeafFootprints(item, left + index * (eachWidth + gapPx), top, eachWidth, height, config),
  );
}

/**
 * Pure master/stack geometry resolution (HT-LAYOUT-MASTER-STACK). Lays the
 * ordered `slots` out as `params.count` master tiles in a master area plus the
 * remaining tiles in a stack, divided along the orientation's primary axis by
 * `params.ratio` (gap-reserved). Returns one footprint per slot, consistent with
 * the dwindle traversal (same `TilingLeafFootprint` shape, same recursion into
 * each slot) so hit-testing / overlays / focus all read this geometry uniformly.
 *
 * - `left`/`right` orientation → master area is a left/right COLUMN (primary
 *   axis = width), members stacked VERTICALLY within each area.
 * - `top`/`bottom` orientation → master area is a top/bottom ROW (primary axis =
 *   height), members stacked HORIZONTALLY within each area.
 * - no stack (`slots.length <= count`) → all slots fill the container, stacked
 *   along the orientation's cross axis.
 * @internal
 */
export function resolveMasterStackFootprints(
  slots: ReadonlyArray<TilingLayoutNode>,
  left: number,
  top: number,
  width: number,
  height: number,
  config: TilingLayoutConfig,
  params: MasterStackParams,
): ReadonlyArray<TilingLeafFootprint> {
  const slotCount: number = slots.length;
  if (slotCount === 0) {
    return [];
  }
  const count: number = Math.min(Math.max(params.count, 1), slotCount);
  const orientation: TilingMasterOrientation = params.orientation;
  const masters: ReadonlyArray<TilingLayoutNode> = slots.slice(0, count);
  const stack: ReadonlyArray<TilingLayoutNode> = slots.slice(count);
  const gapPx: number = config.gapPx;
  const withinAxis: "vertical" | "horizontal" =
    orientation === "left" || orientation === "right" ? "vertical" : "horizontal";

  if (stack.length === 0) {
    return layoutSlotsAlong(masters, left, top, width, height, withinAxis, gapPx, config);
  }

  if (orientation === "left" || orientation === "right") {
    const availableWidth: number = Math.max(0, width - gapPx);
    const masterWidth: number = availableWidth * params.ratio;
    const stackWidth: number = availableWidth * (1 - params.ratio);
    // `left` orientation: master area first (at `left`), stack after it. `right`
    // orientation: stack area first (at `left`), master after the STACK width.
    const masterLeft: number = orientation === "left" ? left : left + stackWidth + gapPx;
    const stackLeft: number = orientation === "left" ? left + masterWidth + gapPx : left;
    return [
      ...layoutSlotsAlong(masters, masterLeft, top, masterWidth, height, "vertical", gapPx, config),
      ...layoutSlotsAlong(stack, stackLeft, top, stackWidth, height, "vertical", gapPx, config),
    ];
  }

  const availableHeight: number = Math.max(0, height - gapPx);
  const masterHeight: number = availableHeight * params.ratio;
  const stackHeight: number = availableHeight * (1 - params.ratio);
  // `top` orientation: master area first (at `top`), stack below. `bottom`
  // orientation: stack area first (at `top`), master below the STACK height.
  const masterTop: number = orientation === "top" ? top : top + stackHeight + gapPx;
  const stackTop: number = orientation === "top" ? top + masterHeight + gapPx : top;
  return [
    ...layoutSlotsAlong(masters, left, masterTop, width, masterHeight, "horizontal", gapPx, config),
    ...layoutSlotsAlong(stack, left, stackTop, width, stackHeight, "horizontal", gapPx, config),
  ];
}

/** @internal */
export function collectLeafFootprints(
  node: TilingLayoutNode,
  left: number,
  top: number,
  width: number,
  height: number,
  config: TilingLayoutConfig,
): ReadonlyArray<TilingLeafFootprint> {
  if (node.kind === "leaf") {
    return [{
      leafId: node.id,
      left,
      top,
      width,
      height,
    }];
  }

  // Group arm (HT-GROUP-TABBED-STACKING): a group is ONE slot — only the active
  // member occupies the group's footprint (the stacking contract). Inactive
  // members have no footprint, so they are never hit-tested / overlaid.
  if (node.kind === "group") {
    const activeMember: TilingLeafNode | undefined = node.members.find(
      (member: TilingLeafNode): boolean => member.id === node.activeMemberId,
    );
    if (activeMember == null) {
      return [];
    }
    return collectLeafFootprints(activeMember, left, top, width, height, config);
  }

  // Master-mode arm (HT-LAYOUT-MASTER-STACK): a split set to `layoutMode:
  // "master"` lays its flattened descendant slots out as master area + stack
  // instead of by recursive binary ratio. Dwindle (the default) falls through.
  if (node.layoutMode === "master") {
    const slots: ReadonlyArray<TilingLayoutNode> = collectMasterSlots(node);
    return resolveMasterStackFootprints(
      slots,
      left,
      top,
      width,
      height,
      config,
      resolveMasterParams(node, slots.length),
    );
  }

  const axisContainerSizePx: number = node.axis === "horizontal" ? width : height;
  const crossContainerSizePx: number = node.axis === "horizontal" ? height : width;

  // Cross-axis-aware: a child static on the split's CROSS axis with a fitting
  // pin content-sizes to it (mirrors the renderer's `align-self: flex-start`)
  // instead of stretching to the full cross extent — see
  // `resolveCrossAxisExtentPx`. Independent of the along-axis static-aware arm
  // below (a leaf can be cross-static, along-static, both, or neither).
  const firstCrossPx: number = resolveCrossAxisExtentPx(
    node.first,
    node.axis,
    crossContainerSizePx,
  );
  const secondCrossPx: number = resolveCrossAxisExtentPx(
    node.second,
    node.axis,
    crossContainerSizePx,
  );

  // Static-aware arm: a child static ALONG the split axis with a fitting pin
  // (`pin + gutter < axisSize`, gutter = gapPx + handleSizePx) is content-sized
  // to that pin, the full boundary gutter is reserved, and the sibling fills the
  // rest. The fit-guard also makes the normalized unit-space wrapper
  // (axisSize ~= 1) fall through to ratio — a CSS px pin is undefined against a
  // 1-unit container. `normalizeStaticAxisFill` forbids a stored
  // both-static-along-axis split EXCEPT for both-collapsed siblings
  // (HT-PANE-COLLAPSE-VOID), so at most one child is static-along here UNLESS
  // both are collapsed leaves — that case is handled first, each keeping its
  // OWN pin with the leftover axis space left as an intentional split slack
  // void (mirrors the renderer). On an unnormalized tree with two arbitrary
  // (non-collapsed) static children, the first-static arm wins (matches
  // `resolveBinarySplitDistribution`'s `{content, fill}` backstop).
  const resolvedGapPx: number = node.gapPx ?? config.gapPx;
  const boundaryGutterPx: number = splitBoundaryGutterPx(resolvedGapPx, config.handleSizePx);
  const firstStaticAlong: boolean = isStaticAlongSplitAxis(node.first, node.axis);
  const secondStaticAlong: boolean = isStaticAlongSplitAxis(node.second, node.axis);
  const isBothCollapsedLeaves: boolean =
    node.first.kind === "leaf" &&
    node.first.collapsed === true &&
    node.second.kind === "leaf" &&
    node.second.collapsed === true;
  if (isBothCollapsedLeaves && firstStaticAlong && secondStaticAlong) {
    const firstPinPx: number | null = alongAxisPinPx(node.first, node.axis);
    const secondPinPx: number | null = alongAxisPinPx(node.second, node.axis);
    if (firstPinPx != null && secondPinPx != null) {
      return collectStaticAlongFootprints(
        node,
        left,
        top,
        config,
        firstPinPx,
        secondPinPx,
        boundaryGutterPx,
        firstCrossPx,
        secondCrossPx,
      );
    }
  }
  if (firstStaticAlong) {
    const firstPinPx: number | null = alongAxisPinPx(node.first, node.axis);
    if (firstPinPx != null) {
      const extents = resolveStaticAlongExtents(
        axisContainerSizePx,
        firstPinPx,
        true,
        resolvedGapPx,
        config.handleSizePx,
      );
      if (extents != null) {
        return collectStaticAlongFootprints(
          node,
          left,
          top,
          config,
          extents.firstPx,
          extents.secondPx,
          extents.gutterPx,
          firstCrossPx,
          secondCrossPx,
        );
      }
    }
  } else if (secondStaticAlong) {
    const secondPinPx: number | null = alongAxisPinPx(node.second, node.axis);
    if (secondPinPx != null) {
      const extents = resolveStaticAlongExtents(
        axisContainerSizePx,
        secondPinPx,
        false,
        resolvedGapPx,
        config.handleSizePx,
      );
      if (extents != null) {
        return collectStaticAlongFootprints(
          node,
          left,
          top,
          config,
          extents.firstPx,
          extents.secondPx,
          extents.gutterPx,
          firstCrossPx,
          secondCrossPx,
        );
      }
    }
  }
  // Per-side along-axis floor (HT-MIN-BBOX-PX / HT-RESIZE-FLOOR): a
  // direct-child leaf's own `minBBoxPx` wins over this split's
  // `minPaneSizePx`, which wins over the config default — UNLESS that side
  // resolves a "chrome" resize floor, which replaces the whole chain with the
  // collapsed titlebar extent. Resolved independently per side so an
  // asymmetric floor (one side only) does not force the other side up to
  // match.
  const firstFloor = resolveAlongAxisFloor(node.first, node.axis, node.minPaneSizePx, config);
  const secondFloor = resolveAlongAxisFloor(node.second, node.axis, node.minPaneSizePx, config);
  // Min-pane clamp must reserve the SAME gutter the ratio flexBasis / divider
  // uses (gapPx + handleSizePx) — clamping against gap alone under-bounds the
  // floor by handleSizePx and can leave a visible shortfall between panes.
  const safeRatio: number = clampByMinSize(
    node.ratio,
    axisContainerSizePx,
    boundaryGutterPx,
    firstFloor.floorPx,
    secondFloor.floorPx,
    resolveRatioSafetyBounds(firstFloor, secondFloor),
  );
  const splitGapOffsetPx: number = boundaryGutterPx / 2;

  if (node.axis === "horizontal") {
    const firstWidth: number = Math.max(0, width * safeRatio - splitGapOffsetPx);
    const secondWidth: number = Math.max(0, width * (1 - safeRatio) - splitGapOffsetPx);
    return [
      ...collectLeafFootprints(node.first, left, top, firstWidth, firstCrossPx, config),
      ...collectLeafFootprints(node.second, left + width * safeRatio + splitGapOffsetPx, top, secondWidth, secondCrossPx, config),
    ];
  }

  const firstHeight: number = Math.max(0, height * safeRatio - splitGapOffsetPx);
  const secondHeight: number = Math.max(0, height * (1 - safeRatio) - splitGapOffsetPx);
  return [
    ...collectLeafFootprints(node.first, left, top, firstCrossPx, firstHeight, config),
    ...collectLeafFootprints(node.second, left, top + height * safeRatio + splitGapOffsetPx, secondCrossPx, secondHeight, config),
  ];
}

/**
 * Normalizing wrapper for topological directional-neighbor search
 * (`findLeafByDirection`): the canonical traversal run in normalized 0..1 unit
 * space with a gap-free config, mapped to edge-rects. Deliberately distinct from
 * the px footprint call: directional focus is purely positional (centers + axis
 * overlap), so it needs neither gaps nor static-px sizing (a px pin cannot fit a
 * 1-unit container, so the static arm falls through to ratio — identical to the
 * deleted `state.ts:collectLeafRects` for every structurally-valid tree).
 * @internal
 */
export function collectNormalizedLeafRects(node: TilingLayoutNode): ReadonlyArray<LeafRect> {
  return collectLeafFootprints(node, 0, 0, 1, 1, GAP_FREE_UNIT_CONFIG).map(
    (footprint: TilingLeafFootprint): LeafRect => ({
      leafId: footprint.leafId,
      left: footprint.left,
      top: footprint.top,
      right: footprint.left + footprint.width,
      bottom: footprint.top + footprint.height,
    }),
  );
}

/** @internal */
export function footprintsByLeafId(
  footprints: ReadonlyArray<TilingLeafFootprint>,
): ReadonlyMap<string, TilingPaneFootprint> {
  return new Map<string, TilingPaneFootprint>(
    footprints.map((footprint: TilingLeafFootprint): [string, TilingPaneFootprint] => [
      footprint.leafId,
      {
        left: footprint.left,
        top: footprint.top,
        width: footprint.width,
        height: footprint.height,
      },
    ]),
  );
}

const FOOTPRINT_DELTA_EPSILON_PX: number = 0.5;

/** @internal */
export function isFootprintChanged(previous: TilingPaneFootprint, next: TilingPaneFootprint): boolean {
  return (
    Math.abs(previous.left - next.left) > FOOTPRINT_DELTA_EPSILON_PX ||
    Math.abs(previous.top - next.top) > FOOTPRINT_DELTA_EPSILON_PX ||
    Math.abs(previous.width - next.width) > FOOTPRINT_DELTA_EPSILON_PX ||
    Math.abs(previous.height - next.height) > FOOTPRINT_DELTA_EPSILON_PX
  );
}
