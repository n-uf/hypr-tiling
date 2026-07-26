import {
  clampByMinSize,
  crossAxisDimension,
  isStaticAlongSplitAxis,
  resolveStaticAlongExtents,
  splitAxisDimension,
  splitBoundaryGutterPx,
} from "./pane-sizing";
import { normalizeStaticAxisFill } from "./state";
import type {
  TilingDimension,
  TilingLayoutConfig,
  TilingLayoutNode,
  TilingPaneSizing,
  TilingSplitAxis,
  TilingSplitNode,
} from "./types";

/**
 * Idle-period safety-net delay after the last resize/rearrange move before a
 * belt-and-suspenders {@link normalizeLayout} pass. Commit-time normalize on
 * pointerup remains the primary reconciliation path.
 */
export const LAYOUT_RECONCILE_IDLE_MS: number = 150;

/**
 * Absolute slack (px) at which a layout is treated as failing the fill
 * invariant (`|sum(extents)+gutters - container| >= threshold`).
 */
export const LAYOUT_FILL_SLACK_TOLERANCE_PX: number = 1;

/** Options for container-aware layout reconciliation. */
export interface NormalizeLayoutOptions {
  /** Viewport / root container width in CSS pixels. */
  containerWidthPx: number;
  /** Viewport / root container height in CSS pixels. */
  containerHeightPx: number;
  /** Gap / min-pane / handle geometry used by the live renderer. */
  config: TilingLayoutConfig;
}

/**
 * Demote a node's ALONG-the-given-axis static dimension back to flexible while
 * PRESERVING its cross-axis static sizing + px. Local copy of the state-layer
 * helper so commit-time reconciliation can demote unfit pins without exporting
 * the private reducer primitive.
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

function alongAxisPinPx(node: TilingLayoutNode, axis: TilingSplitAxis): number | null {
  const dimension: TilingDimension = splitAxisDimension(axis);
  const pinPx: number | undefined =
    dimension === "width" ? node.sizing?.widthPx : node.sizing?.heightPx;
  if (pinPx == null || !Number.isFinite(pinPx) || pinPx <= 0) {
    return null;
  }
  return pinPx;
}

function clampStoredRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  return Math.min(Math.max(value, 0.05), 0.95);
}

interface SplitAxisExtents {
  firstPx: number;
  secondPx: number;
  gutterPx: number;
  ratio: number;
  first: TilingLayoutNode;
  second: TilingLayoutNode;
}

/**
 * Resolve a binary dwindle split's along-axis extents after pin fit-guards and
 * ratio clamps. Unfit static pins are demoted on the returned children so the
 * stored tree matches what the renderer would do for the frame.
 */
function reconcileBinarySplitAxis(
  node: TilingSplitNode,
  containerPx: number,
  config: TilingLayoutConfig,
): SplitAxisExtents {
  const resolvedGapPx: number = node.gapPx ?? config.gapPx;
  const resolvedMinPaneSizePx: number = node.minPaneSizePx ?? config.minPaneSizePx;
  const gutterPx: number = splitBoundaryGutterPx(resolvedGapPx, config.handleSizePx);

  let first: TilingLayoutNode = node.first;
  let second: TilingLayoutNode = node.second;

  const firstStatic: boolean = isStaticAlongSplitAxis(first, node.axis);
  const secondStatic: boolean = isStaticAlongSplitAxis(second, node.axis);
  const firstPin: number | null = firstStatic ? alongAxisPinPx(first, node.axis) : null;
  const secondPin: number | null = secondStatic ? alongAxisPinPx(second, node.axis) : null;

  if (firstStatic && firstPin != null) {
    const extents = resolveStaticAlongExtents(
      containerPx,
      firstPin,
      true,
      resolvedGapPx,
      config.handleSizePx,
    );
    if (extents == null) {
      first = demoteAlongAxisStatic(first, node.axis);
    } else {
      return {
        firstPx: extents.firstPx,
        secondPx: extents.secondPx,
        gutterPx: extents.gutterPx,
        ratio: clampStoredRatio(node.ratio),
        first,
        second,
      };
    }
  } else if (secondStatic && secondPin != null) {
    const extents = resolveStaticAlongExtents(
      containerPx,
      secondPin,
      false,
      resolvedGapPx,
      config.handleSizePx,
    );
    if (extents == null) {
      second = demoteAlongAxisStatic(second, node.axis);
    } else {
      return {
        firstPx: extents.firstPx,
        secondPx: extents.secondPx,
        gutterPx: extents.gutterPx,
        ratio: clampStoredRatio(node.ratio),
        first,
        second,
      };
    }
  } else if (firstStatic && !secondStatic) {
    // Static without a usable pin → content-sized at runtime; keep declaration,
    // assign the flexible sibling the full remainder for nested recursion.
    const flexiblePx: number = Math.max(0, containerPx - gutterPx);
    return {
      firstPx: 0,
      secondPx: flexiblePx,
      gutterPx,
      ratio: clampStoredRatio(node.ratio),
      first,
      second,
    };
  } else if (secondStatic && !firstStatic) {
    const flexiblePx: number = Math.max(0, containerPx - gutterPx);
    return {
      firstPx: flexiblePx,
      secondPx: 0,
      gutterPx,
      ratio: clampStoredRatio(node.ratio),
      first,
      second,
    };
  }

  const ratio: number = clampByMinSize(
    node.ratio,
    containerPx,
    gutterPx,
    resolvedMinPaneSizePx,
  );
  const halfGutter: number = gutterPx / 2;
  const firstPx: number = Math.max(0, containerPx * ratio - halfGutter);
  const secondPx: number = Math.max(0, containerPx * (1 - ratio) - halfGutter);
  return { firstPx, secondPx, gutterPx, ratio, first, second };
}

function normalizeLayoutNode(
  node: TilingLayoutNode,
  widthPx: number,
  heightPx: number,
  config: TilingLayoutConfig,
): TilingLayoutNode {
  if (node.kind === "leaf") {
    return node;
  }

  if (node.kind === "group") {
    return node;
  }

  // Master-mode splits keep their ratio clamped; slot geometry is flattened, so
  // pin fit-guards are applied by recursing into each child with equal shares of
  // the container (best-effort — full master reflow is out of scope here).
  if (node.layoutMode === "master") {
    const ratio: number = clampStoredRatio(node.ratio);
    const first: TilingLayoutNode = normalizeLayoutNode(
      node.first,
      widthPx,
      heightPx,
      config,
    );
    const second: TilingLayoutNode = normalizeLayoutNode(
      node.second,
      widthPx,
      heightPx,
      config,
    );
    if (ratio === node.ratio && first === node.first && second === node.second) {
      return node;
    }
    return { ...node, ratio, first, second };
  }

  const axisContainerPx: number = node.axis === "horizontal" ? widthPx : heightPx;
  const reconciled: SplitAxisExtents = reconcileBinarySplitAxis(
    node,
    axisContainerPx,
    config,
  );

  const firstWidth: number =
    node.axis === "horizontal" ? reconciled.firstPx : widthPx;
  const firstHeight: number =
    node.axis === "horizontal" ? heightPx : reconciled.firstPx;
  const secondWidth: number =
    node.axis === "horizontal" ? reconciled.secondPx : widthPx;
  const secondHeight: number =
    node.axis === "horizontal" ? heightPx : reconciled.secondPx;

  // Content-sized static without pin: recurse with the parent extent so nested
  // pins still fit-guard against a real container (0 would demote everything).
  const nestedFirstWidth: number = firstWidth > 0 ? firstWidth : widthPx;
  const nestedFirstHeight: number = firstHeight > 0 ? firstHeight : heightPx;
  const nestedSecondWidth: number = secondWidth > 0 ? secondWidth : widthPx;
  const nestedSecondHeight: number = secondHeight > 0 ? secondHeight : heightPx;

  const first: TilingLayoutNode = normalizeLayoutNode(
    reconciled.first,
    nestedFirstWidth,
    nestedFirstHeight,
    config,
  );
  const second: TilingLayoutNode = normalizeLayoutNode(
    reconciled.second,
    nestedSecondWidth,
    nestedSecondHeight,
    config,
  );

  if (
    reconciled.ratio === node.ratio &&
    first === node.first &&
    second === node.second
  ) {
    return node;
  }

  return {
    ...node,
    ratio: reconciled.ratio,
    first,
    second,
  };
}

/**
 * Commit-time layout reconciliation: demote unfit static pins, clamp split
 * ratios against min-pane + full gutters, and enforce the
 * {@link normalizeStaticAxisFill} both-static filler invariant so
 * panes+gutters fill the container.
 *
 * Pure and idempotent when the tree already satisfies the invariants (returns
 * the same reference). Call on every resize/rearrange gesture end, on idle
 * settle, and when hydrating a persisted layout with a known container size.
 */
export function normalizeLayout(
  node: TilingLayoutNode,
  options: NormalizeLayoutOptions,
): TilingLayoutNode {
  const widthPx: number = Math.max(0, options.containerWidthPx);
  const heightPx: number = Math.max(0, options.containerHeightPx);
  const structurallyNormalized: TilingLayoutNode = normalizeStaticAxisFill(node);
  if (widthPx <= 1 || heightPx <= 1) {
    return structurallyNormalized;
  }
  return normalizeLayoutNode(
    structurallyNormalized,
    widthPx,
    heightPx,
    options.config,
  );
}

interface AxisSlackWalk {
  maxSlackPx: number;
}

function walkFillSlack(
  node: TilingLayoutNode,
  widthPx: number,
  heightPx: number,
  config: TilingLayoutConfig,
  acc: AxisSlackWalk,
): void {
  if (node.kind === "leaf" || node.kind === "group") {
    return;
  }
  if (node.layoutMode === "master") {
    walkFillSlack(node.first, widthPx, heightPx, config, acc);
    walkFillSlack(node.second, widthPx, heightPx, config, acc);
    return;
  }

  const axisContainerPx: number = node.axis === "horizontal" ? widthPx : heightPx;
  const resolvedGapPx: number = node.gapPx ?? config.gapPx;
  const gutterPx: number = splitBoundaryGutterPx(resolvedGapPx, config.handleSizePx);
  const firstStatic: boolean = isStaticAlongSplitAxis(node.first, node.axis);
  const secondStatic: boolean = isStaticAlongSplitAxis(node.second, node.axis);
  const firstPin: number | null = firstStatic
    ? alongAxisPinPx(node.first, node.axis)
    : null;
  const secondPin: number | null = secondStatic
    ? alongAxisPinPx(node.second, node.axis)
    : null;

  let firstPx: number;
  let secondPx: number;
  let usedGutterPx: number = gutterPx;

  if (firstStatic && firstPin != null) {
    const extents = resolveStaticAlongExtents(
      axisContainerPx,
      firstPin,
      true,
      resolvedGapPx,
      config.handleSizePx,
    );
    if (extents != null) {
      firstPx = extents.firstPx;
      secondPx = extents.secondPx;
      usedGutterPx = extents.gutterPx;
    } else {
      // Unfit pin still declared static → geometry underflows (the void).
      firstPx = firstPin;
      secondPx = Math.max(0, axisContainerPx - firstPin - gutterPx);
    }
  } else if (secondStatic && secondPin != null) {
    const extents = resolveStaticAlongExtents(
      axisContainerPx,
      secondPin,
      false,
      resolvedGapPx,
      config.handleSizePx,
    );
    if (extents != null) {
      firstPx = extents.firstPx;
      secondPx = extents.secondPx;
      usedGutterPx = extents.gutterPx;
    } else {
      secondPx = secondPin;
      firstPx = Math.max(0, axisContainerPx - secondPin - gutterPx);
    }
  } else {
    const resolvedMinPaneSizePx: number = node.minPaneSizePx ?? config.minPaneSizePx;
    const ratio: number = clampByMinSize(
      node.ratio,
      axisContainerPx,
      gutterPx,
      resolvedMinPaneSizePx,
    );
    const halfGutter: number = gutterPx / 2;
    firstPx = Math.max(0, axisContainerPx * ratio - halfGutter);
    secondPx = Math.max(0, axisContainerPx * (1 - ratio) - halfGutter);
  }

  const allocatedPx: number = firstPx + secondPx + usedGutterPx;
  const slackPx: number = Math.abs(allocatedPx - axisContainerPx);
  if (slackPx > acc.maxSlackPx) {
    acc.maxSlackPx = slackPx;
  }

  const firstWidth: number = node.axis === "horizontal" ? firstPx : widthPx;
  const firstHeight: number = node.axis === "horizontal" ? heightPx : firstPx;
  const secondWidth: number = node.axis === "horizontal" ? secondPx : widthPx;
  const secondHeight: number = node.axis === "horizontal" ? heightPx : secondPx;

  walkFillSlack(
    node.first,
    firstWidth > 0 ? firstWidth : widthPx,
    firstHeight > 0 ? firstHeight : heightPx,
    config,
    acc,
  );
  walkFillSlack(
    node.second,
    secondWidth > 0 ? secondWidth : widthPx,
    secondHeight > 0 ? secondHeight : heightPx,
    config,
    acc,
  );
}

/**
 * Largest absolute fill slack across the tree: `|sum(child extents)+gutter -
 * container|` per binary split. Values `>= {@link LAYOUT_FILL_SLACK_TOLERANCE_PX}`
 * indicate layout underflow/overflow (dead-space voids).
 */
export function measureLayoutFillSlackPx(
  node: TilingLayoutNode,
  options: NormalizeLayoutOptions,
): number {
  const widthPx: number = Math.max(0, options.containerWidthPx);
  const heightPx: number = Math.max(0, options.containerHeightPx);
  if (widthPx <= 1 || heightPx <= 1) {
    return 0;
  }
  const acc: AxisSlackWalk = { maxSlackPx: 0 };
  walkFillSlack(node, widthPx, heightPx, options.config, acc);
  return acc.maxSlackPx;
}
