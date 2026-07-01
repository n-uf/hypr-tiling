import type {
  TilingLayoutNode,
  TilingLeafNode,
  TilingSplitAxis,
  TilingDimension,
  TilingPaneSizing,
  TilingPaneSizingMode,
  TilingTitleBarSizingMode,
} from "./types";

/**
 * Pure (DOM-free) layout helpers for the static-vs-flexible pane model.
 *
 * Split axis → dimension convention (the divider/ratio math keys off this):
 * - A `"horizontal"` split is a `flex-row` container whose children sit
 *   SIDE-BY-SIDE; its main/split axis is **width**, cross axis is **height**.
 * - A `"vertical"` split is a `flex-col` container whose children are STACKED;
 *   its main/split axis is **height**, cross axis is **width**.
 *
 * A node static in the dimension that runs ALONG the split axis is content-sized
 * along that axis, excluded from ratio distribution, and gets no resize divider
 * on that boundary. A node static only on the CROSS axis content-sizes on the
 * cross axis (no stretch) but still participates in the split-axis ratio.
 */

/**
 * Clamp a split ratio so neither side falls below `minPaneSizePx` (the min-pane
 * constraint), expressed as a ratio against the gap-adjusted container extent.
 * Returns `0.5` when the two minimums cannot both be satisfied. This is the
 * single min-constraint helper reused by the resize path, projected-layout
 * geometry, and the `growLeafToward` acquire-space reducer (so all three share
 * one constraint math, never reinventing it).
 */
export function clampByMinSize(
  ratio: number,
  containerSizePx: number,
  gapPx: number,
  minPaneSizePx: number,
): number {
  const availableSizePx: number = Math.max(containerSizePx - gapPx, 1);
  const maxFromMin: number = 1 - minPaneSizePx / availableSizePx;
  const minFromMin: number = minPaneSizePx / availableSizePx;
  const boundedMin: number = Math.min(Math.max(minFromMin, 0.05), 0.95);
  const boundedMax: number = Math.max(Math.min(maxFromMin, 0.95), 0.05);

  if (boundedMin > boundedMax) {
    return 0.5;
  }

  return Math.min(Math.max(ratio, boundedMin), boundedMax);
}

/**
 * Dimension that runs ALONG a split's main axis (the dimension the ratio distributes).
 * @internal
 */
export function splitAxisDimension(axis: TilingSplitAxis): TilingDimension {
  return axis === "horizontal" ? "width" : "height";
}

/**
 * Dimension perpendicular to a split's main axis.
 * @internal
 */
export function crossAxisDimension(axis: TilingSplitAxis): TilingDimension {
  return axis === "horizontal" ? "height" : "width";
}

/** Resolve the sizing mode for a single dimension; undefined defaults to flexible. */
export function resolveSizingMode(
  sizing: TilingPaneSizing | undefined,
  dimension: TilingDimension,
): TilingPaneSizingMode {
  if (sizing == null) {
    return "flexible";
  }
  return sizing[dimension] ?? "flexible";
}

/** True when the node is content-sized (static) in the given dimension. */
export function isStaticInDimension(
  node: TilingLayoutNode,
  dimension: TilingDimension,
): boolean {
  return resolveSizingMode(node.sizing, dimension) === "static";
}

/**
 * True when the node is static ALONG the split's main axis → it is content-sized
 * along that axis, excluded from the split's ratio, and removes the divider on
 * that boundary.
 */
export function isStaticAlongSplitAxis(
  node: TilingLayoutNode,
  axis: TilingSplitAxis,
): boolean {
  return isStaticInDimension(node, splitAxisDimension(axis));
}

/**
 * True when the node is static on the split's CROSS axis → it content-sizes on
 * the cross axis (no stretch) but still participates in the split-axis ratio.
 */
export function isStaticOnCrossAxis(
  node: TilingLayoutNode,
  axis: TilingSplitAxis,
): boolean {
  return isStaticInDimension(node, crossAxisDimension(axis));
}

/**
 * True when the layout tree contains ANY node declared static in either
 * dimension — a generic whole-tree predicate. NOTE: this is no longer the drag
 * gate. The drag/rearrange gate is now PER-SUBTREE (`drop-validity.ts`
 * `collectStaticGatedLeafIds`) and the footprint geometry is static-aware
 * (`leaf-geometry.ts`), so a pinned static pane no longer freezes the whole tree
 * (HT-SIZING-STATIC-DRAG-GATING). Retained as a reusable predicate.
 */
export function layoutContainsStaticPane(node: TilingLayoutNode): boolean {
  const selfStatic: boolean =
    node.sizing != null && (node.sizing.width === "static" || node.sizing.height === "static");
  if (node.kind === "leaf") {
    return selfStatic;
  }
  if (node.kind === "group") {
    return (
      selfStatic ||
      node.members.some((member: TilingLeafNode): boolean => layoutContainsStaticPane(member))
    );
  }
  return selfStatic || layoutContainsStaticPane(node.first) || layoutContainsStaticPane(node.second);
}

export interface SplitBoundaryStaticFlags {
  resizeEnabled: boolean;
  firstStaticAlongAxis: boolean;
  secondStaticAlongAxis: boolean;
}

/**
 * A resize divider is placed ONLY between two boundaries that are both flexible
 * along the split axis. If resize is disabled, or either adjacent child is
 * static along the split axis, no draggable handle is rendered there.
 */
export function shouldRenderSplitDivider({
  resizeEnabled,
  firstStaticAlongAxis,
  secondStaticAlongAxis,
}: SplitBoundaryStaticFlags): boolean {
  return resizeEnabled && !firstStaticAlongAxis && !secondStaticAlongAxis;
}

export interface FlexibleRatioChild {
  ratio: number;
  staticAlongAxis: boolean;
}

/**
 * Renormalize split-axis ratios over the FLEXIBLE children only. Static children
 * receive weight 0 (content-sized, excluded from distribution); flexible children
 * share `1.0` proportionally to their declared ratios. When the flexible ratios
 * sum to zero (or there are no positive ratios), flexible children split evenly.
 */
export function renormalizeFlexibleRatios(
  children: ReadonlyArray<FlexibleRatioChild>,
): number[] {
  const weights: number[] = children.map((): number => 0);
  const flexibleIndices: number[] = children
    .map((child: FlexibleRatioChild, index: number): number =>
      child.staticAlongAxis ? -1 : index,
    )
    .filter((index: number): boolean => index >= 0);

  if (flexibleIndices.length === 0) {
    return weights;
  }

  const positiveRatioSum: number = flexibleIndices.reduce(
    (accumulated: number, index: number): number =>
      accumulated + Math.max(children[index].ratio, 0),
    0,
  );

  if (positiveRatioSum <= 0) {
    const equalShare: number = 1 / flexibleIndices.length;
    for (const index of flexibleIndices) {
      weights[index] = equalShare;
    }
    return weights;
  }

  for (const index of flexibleIndices) {
    weights[index] = Math.max(children[index].ratio, 0) / positiveRatioSum;
  }
  return weights;
}

/**
 * Main-axis sizing instruction for one child of a binary split.
 * @internal
 */
export type SplitChildMainSizing =
  | { kind: "content" }
  | { kind: "fill" }
  | { kind: "ratio"; basisFraction: number };

/** @internal */
export interface BinarySplitDistribution {
  first: SplitChildMainSizing;
  second: SplitChildMainSizing;
}

/**
 * Resolve how the two children of a binary split are sized ALONG the split axis,
 * given each child's static-along-axis flag and the split ratio:
 *
 * - both static → first content-sized, second FILLS (backstop, see below);
 * - one static → static child content-sized, flexible sibling fills the rest;
 * - both flexible → distribute the axis by the (renormalized) ratio.
 *
 * BACKSTOP (both-static arm): two fixed extents along one axis cannot
 * continuously sum to a variable container — `{content, content}` has no
 * flexing child, so any later container-extent change opens a trailing gap
 * (the Round-2 static-gap defect). The reducer-level `normalizeStaticAxisFill`
 * invariant (`state.ts`) prevents a both-static-along-axis split from ever being
 * stored, but this arm is the defense-in-depth view backstop: even if a
 * both-static tree reaches the renderer by an unnormalized path (hand-authored
 * `INITIAL_LAYOUT`, persistence, a future mutation that forgets to normalize),
 * the `second` child FILLS so the axis still re-absorbs the delta and cannot gap.
 * @internal
 */
export function resolveBinarySplitDistribution(
  firstStaticAlongAxis: boolean,
  secondStaticAlongAxis: boolean,
  ratio: number,
): BinarySplitDistribution {
  if (firstStaticAlongAxis && secondStaticAlongAxis) {
    return { first: { kind: "content" }, second: { kind: "fill" } };
  }
  if (firstStaticAlongAxis) {
    return { first: { kind: "content" }, second: { kind: "fill" } };
  }
  if (secondStaticAlongAxis) {
    return { first: { kind: "fill" }, second: { kind: "content" } };
  }

  const weights: number[] = renormalizeFlexibleRatios([
    { ratio, staticAlongAxis: false },
    { ratio: 1 - ratio, staticAlongAxis: false },
  ]);
  return {
    first: { kind: "ratio", basisFraction: weights[0] },
    second: { kind: "ratio", basisFraction: weights[1] },
  };
}

/**
 * Pure title-bar sizing decision: given the title-bar action and the pane's
 * MEASURED bounding box (px), produce the `TilingPaneSizing` to store on the
 * leaf — or `undefined` for FLEX (clear). This is the DOM-free core of the
 * "STATIC captures the actual current bbox" behavior: the renderer measures the
 * pane via `getBoundingClientRect` at click time and feeds the px here; this
 * function pins the chosen dimension(s) to that exact value. FLEX returns
 * `undefined` so `setLeafSizing` clears the leaf back to ratio distribution.
 *
 * The measured px is captured ONLY for the static dimension(s) the action
 * selects (STATIC H pins height, STATIC W pins width, BOTH pins both); the
 * non-selected dimension is left flexible.
 */
export function measuredStaticSizing(
  mode: TilingTitleBarSizingMode,
  measuredWidthPx: number,
  measuredHeightPx: number,
): TilingPaneSizing | undefined {
  if (mode === "flexible") {
    return undefined;
  }
  // Defense-in-depth against the zero-pin collapse: a non-positive measured px
  // must never become a static pin (a `*Px:0` pin + `flexShrink:0` collapses the
  // pane and opens a dead-space gap). Drop the static pin for any dimension that
  // measured ≤ 0 — leaving it flexible — and return `undefined` when no positive
  // static dimension remains for the requested mode.
  const pinWidth: boolean =
    (mode === "static-width" || mode === "static-both") && measuredWidthPx > 0;
  const pinHeight: boolean =
    (mode === "static-height" || mode === "static-both") && measuredHeightPx > 0;
  if (!pinWidth && !pinHeight) {
    return undefined;
  }
  const sizing: TilingPaneSizing = {};
  if (pinWidth) {
    sizing.width = "static";
    sizing.widthPx = measuredWidthPx;
  }
  if (pinHeight) {
    sizing.height = "static";
    sizing.heightPx = measuredHeightPx;
  }
  return sizing;
}

/**
 * Map a pane's resolved per-dimension sizing modes onto the active title-bar
 * sizing action id (drives which segmented button reads as pressed).
 */
export function titleBarSizingModeId(
  width: TilingPaneSizingMode,
  height: TilingPaneSizingMode,
): TilingTitleBarSizingMode {
  if (width === "static" && height === "static") {
    return "static-both";
  }
  if (width === "static") {
    return "static-width";
  }
  if (height === "static") {
    return "static-height";
  }
  return "flexible";
}
