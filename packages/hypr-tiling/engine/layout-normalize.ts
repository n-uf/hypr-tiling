import { collectLeafFootprints, type TilingLeafFootprint } from "./leaf-geometry";
import {
  clampByMinSize,
  isStaticAlongSplitAxis,
  resolveAlongAxisMinPaneSizePx,
  resolveStaticAlongExtents,
  splitAxisDimension,
  splitBoundaryGutterPx,
} from "./pane-sizing";
import { demoteAlongAxisStatic, normalizeStaticAxisFill } from "./state";
import type {
  TilingDimension,
  TilingLayoutConfig,
  TilingLayoutNode,
  TilingLeafNode,
  TilingSplitAxis,
  TilingSplitNode,
  TilingTile,
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

/**
 * Split ratios at or beyond this distance from 0/1 are treated as collapsed
 * (zero-width visual slots). Geometry normalize clamps them; integrity assessment
 * flags them so hosts can reset when combined with missing tiles.
 */
export const LAYOUT_COLLAPSED_RATIO_EPS: number = 0.02;

/** Options for container-aware layout reconciliation. */
export interface NormalizeLayoutOptions {
  /** Viewport / root container width in CSS pixels. */
  containerWidthPx: number;
  /** Viewport / root container height in CSS pixels. */
  containerHeightPx: number;
  /** Gap / min-pane / handle geometry used by the live renderer. */
  config: TilingLayoutConfig;
  /**
   * Host tile ids that must appear exactly once across leaves. When provided,
   * {@link normalizeLayout} enforces tile uniqueness + coverage and rebuilds a
   * sane default dwindle (or {@link fallbackLayout}) on integrity failure.
   */
  expectedTileIds?: ReadonlyArray<string>;
  /**
   * Preferred replacement tree when tile integrity fails badly. Geometry-
   * normalized before return. When omitted, a right-associative horizontal
   * dwindle is built from {@link expectedTileIds}.
   */
  fallbackLayout?: TilingLayoutNode;
}

/** Result of {@link assessLayoutTileIntegrity} / {@link assertLayoutIntegrity}. */
export interface LayoutTileIntegrityReport {
  /**
   * True when tile coverage/uniqueness is sound, no split ratio is collapsed,
   * and (when geometry options are supplied) no zero-area / overlapping leaves
   * or fill-slack voids remain.
   * Collapsed ratios and fill slack alone are healed in place by
   * {@link normalizeLayout} / {@link repairLayout}; {@link requiresRebuild} is
   * the signal for empty/duplicate/missing-tile or unhealable geometry recovery.
   */
  readonly ok: boolean;
  /**
   * True when empty/duplicate/missing/unknown tileIds — or unhealable zero-area /
   * overlapping leaf geometry — require replacing the tree (fallback or default
   * dwindle) rather than geometry-only healing.
   */
  readonly requiresRebuild: boolean;
  /** `tileId` values that appear on more than one leaf/group member. */
  readonly duplicateTileIds: ReadonlyArray<string>;
  /** Expected ids absent from the tree (only when `expectedTileIds` given). */
  readonly missingTileIds: ReadonlyArray<string>;
  /** Leaf tileIds not in `expectedTileIds` (only when that list is given). */
  readonly unknownTileIds: ReadonlyArray<string>;
  /** True when any leaf has an empty `tileId`. */
  readonly hasEmptyTileId: boolean;
  /** True when any dwindle split ratio is collapsed near 0 or 1. */
  readonly hasCollapsedRatio: boolean;
  /**
   * True when computed leaf geometry includes a zero-area leaf while the tree
   * still hosts tiles (empty visual slot). Only set when geometry options given.
   */
  readonly hasZeroAreaLeaf: boolean;
  /**
   * True when any two leaf footprints overlap in computed geometry (bleed).
   * Only set when geometry options given.
   */
  readonly hasOverlappingLeaves: boolean;
  /**
   * True when fill slack exceeds {@link LAYOUT_FILL_SLACK_TOLERANCE_PX}.
   * Only set when geometry options given.
   */
  readonly hasFillSlack: boolean;
}

/** Options for {@link assessLayoutTileIntegrity}. */
export interface AssessLayoutTileIntegrityOptions {
  expectedTileIds?: ReadonlyArray<string>;
  /**
   * When provided with a positive container size, also assess geometric
   * integrity (zero-area leaves, overlapping footprints, fill slack).
   */
  containerWidthPx?: number;
  containerHeightPx?: number;
  config?: TilingLayoutConfig;
}

/**
 * Options for {@link assertLayoutIntegrity} — tile coverage plus optional
 * container-aware geometry checks.
 */
export type AssertLayoutIntegrityOptions = AssessLayoutTileIntegrityOptions;

/** Options for {@link repairLayout} (same as {@link NormalizeLayoutOptions}). */
export type RepairLayoutOptions = NormalizeLayoutOptions;

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

  const firstMinPaneSizePx: number = resolveAlongAxisMinPaneSizePx(
    first,
    node.axis,
    node.minPaneSizePx,
    config.minPaneSizePx,
  );
  const secondMinPaneSizePx: number = resolveAlongAxisMinPaneSizePx(
    second,
    node.axis,
    node.minPaneSizePx,
    config.minPaneSizePx,
  );
  const ratio: number = clampByMinSize(
    node.ratio,
    containerPx,
    gutterPx,
    firstMinPaneSizePx,
    secondMinPaneSizePx,
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

function collectTileIds(node: TilingLayoutNode, out: string[]): void {
  if (node.kind === "leaf") {
    out.push(node.tileId);
    return;
  }
  if (node.kind === "group") {
    for (const member of node.members) {
      out.push(member.tileId);
    }
    return;
  }
  collectTileIds(node.first, out);
  collectTileIds(node.second, out);
}

function hasCollapsedRatioSplit(node: TilingLayoutNode): boolean {
  if (node.kind === "leaf" || node.kind === "group") {
    return false;
  }
  if (node.layoutMode !== "master") {
    const ratio: number = node.ratio;
    if (
      !Number.isFinite(ratio) ||
      ratio <= LAYOUT_COLLAPSED_RATIO_EPS ||
      ratio >= 1 - LAYOUT_COLLAPSED_RATIO_EPS
    ) {
      return true;
    }
  }
  return hasCollapsedRatioSplit(node.first) || hasCollapsedRatioSplit(node.second);
}

const GEOMETRY_OVERLAP_EPS_PX: number = 0.5;
const GEOMETRY_ZERO_AREA_EPS_PX: number = 1;

function footprintsOverlap(
  a: TilingLeafFootprint,
  b: TilingLeafFootprint,
): boolean {
  const aRight: number = a.left + a.width;
  const aBottom: number = a.top + a.height;
  const bRight: number = b.left + b.width;
  const bBottom: number = b.top + b.height;
  const overlapW: number =
    Math.min(aRight, bRight) - Math.max(a.left, b.left);
  const overlapH: number =
    Math.min(aBottom, bBottom) - Math.max(a.top, b.top);
  return overlapW > GEOMETRY_OVERLAP_EPS_PX && overlapH > GEOMETRY_OVERLAP_EPS_PX;
}

function assessGeometryIntegrity(
  node: TilingLayoutNode,
  widthPx: number,
  heightPx: number,
  config: TilingLayoutConfig,
): {
  hasZeroAreaLeaf: boolean;
  hasOverlappingLeaves: boolean;
  hasFillSlack: boolean;
} {
  if (widthPx <= 1 || heightPx <= 1) {
    return {
      hasZeroAreaLeaf: false,
      hasOverlappingLeaves: false,
      hasFillSlack: false,
    };
  }
  const footprints: ReadonlyArray<TilingLeafFootprint> = collectLeafFootprints(
    node,
    0,
    0,
    widthPx,
    heightPx,
    config,
  );
  let hasZeroAreaLeaf: boolean = false;
  for (const footprint of footprints) {
    if (
      footprint.width < GEOMETRY_ZERO_AREA_EPS_PX ||
      footprint.height < GEOMETRY_ZERO_AREA_EPS_PX
    ) {
      hasZeroAreaLeaf = true;
      break;
    }
  }
  let hasOverlappingLeaves: boolean = false;
  for (let i = 0; i < footprints.length && !hasOverlappingLeaves; i += 1) {
    const a: TilingLeafFootprint = footprints[i]!;
    if (a.width < GEOMETRY_ZERO_AREA_EPS_PX || a.height < GEOMETRY_ZERO_AREA_EPS_PX) {
      continue;
    }
    for (let j = i + 1; j < footprints.length; j += 1) {
      const b: TilingLeafFootprint = footprints[j]!;
      if (
        b.width < GEOMETRY_ZERO_AREA_EPS_PX ||
        b.height < GEOMETRY_ZERO_AREA_EPS_PX
      ) {
        continue;
      }
      if (footprintsOverlap(a, b)) {
        hasOverlappingLeaves = true;
        break;
      }
    }
  }
  const slackPx: number = measureLayoutFillSlackPx(node, {
    containerWidthPx: widthPx,
    containerHeightPx: heightPx,
    config,
  });
  return {
    hasZeroAreaLeaf,
    hasOverlappingLeaves,
    hasFillSlack: slackPx >= LAYOUT_FILL_SLACK_TOLERANCE_PX,
  };
}

/**
 * Tile-slot integrity report: uniqueness, expected coverage, empty/unknown
 * tileIds, collapsed ratios that create zero-width visual slots, and (when
 * container geometry is supplied) zero-area / overlapping leaves + fill slack.
 */
export function assessLayoutTileIntegrity(
  node: TilingLayoutNode,
  options: AssessLayoutTileIntegrityOptions = {},
): LayoutTileIntegrityReport {
  const tileIds: string[] = [];
  collectTileIds(node, tileIds);

  const counts = new Map<string, number>();
  let hasEmptyTileId: boolean = false;
  for (const tileId of tileIds) {
    if (tileId.length === 0) {
      hasEmptyTileId = true;
      continue;
    }
    counts.set(tileId, (counts.get(tileId) ?? 0) + 1);
  }

  const duplicateTileIds: string[] = [];
  for (const [tileId, count] of counts) {
    if (count > 1) {
      duplicateTileIds.push(tileId);
    }
  }
  duplicateTileIds.sort();

  const expected: ReadonlyArray<string> | undefined = options.expectedTileIds;
  const missingTileIds: string[] = [];
  const unknownTileIds: string[] = [];
  if (expected != null) {
    const expectedSet = new Set(expected);
    const present = new Set(
      tileIds.filter((tileId: string): boolean => tileId.length > 0),
    );
    for (const tileId of expected) {
      if (!present.has(tileId)) {
        missingTileIds.push(tileId);
      }
    }
    for (const tileId of present) {
      if (!expectedSet.has(tileId)) {
        unknownTileIds.push(tileId);
      }
    }
    unknownTileIds.sort();
  }

  const hasCollapsedRatio: boolean = hasCollapsedRatioSplit(node);

  let hasZeroAreaLeaf: boolean = false;
  let hasOverlappingLeaves: boolean = false;
  let hasFillSlack: boolean = false;
  const widthPx: number | undefined = options.containerWidthPx;
  const heightPx: number | undefined = options.containerHeightPx;
  const config: TilingLayoutConfig | undefined = options.config;
  if (
    widthPx != null &&
    heightPx != null &&
    config != null &&
    widthPx > 1 &&
    heightPx > 1
  ) {
    const geometry = assessGeometryIntegrity(node, widthPx, heightPx, config);
    hasZeroAreaLeaf = geometry.hasZeroAreaLeaf;
    hasOverlappingLeaves = geometry.hasOverlappingLeaves;
    hasFillSlack = geometry.hasFillSlack;
  }

  const tileSlotBroken: boolean =
    hasEmptyTileId ||
    duplicateTileIds.length > 0 ||
    missingTileIds.length > 0 ||
    unknownTileIds.length > 0;
  // Zero-area / overlap are hard integrity failures (void / bleed). Fill slack
  // and collapsed ratios are healed in place by geometry normalize.
  const requiresRebuild: boolean =
    tileSlotBroken || hasZeroAreaLeaf || hasOverlappingLeaves;
  const ok: boolean =
    !requiresRebuild && !hasCollapsedRatio && !hasFillSlack;

  return {
    ok,
    requiresRebuild,
    duplicateTileIds,
    missingTileIds,
    unknownTileIds,
    hasEmptyTileId,
    hasCollapsedRatio,
    hasZeroAreaLeaf,
    hasOverlappingLeaves,
    hasFillSlack,
  };
}

/**
 * Full integrity check — same report as {@link assessLayoutTileIntegrity}.
 * Prefer this name at host commit/load gates; pass container + config when
 * geometric voids/overlaps must be detected.
 */
export function assertLayoutIntegrity(
  node: TilingLayoutNode,
  options: AssertLayoutIntegrityOptions = {},
): LayoutTileIntegrityReport {
  return assessLayoutTileIntegrity(node, options);
}

/**
 * Host tile-registry → expected id list for reconcile. Stable order: array
 * order, or `Map` insertion order.
 */
export function expectedTileIdsFromHostTiles(
  tiles: ReadonlyArray<TilingTile> | ReadonlyMap<string, TilingTile>,
): ReadonlyArray<string> {
  if (!(tiles instanceof Map) && Array.isArray(tiles)) {
    return tiles.map((tile: TilingTile): string => tile.id);
  }
  const byId = tiles as ReadonlyMap<string, TilingTile>;
  return [...byId.keys()];
}

/**
 * True when `candidate` still hosts every tile from `expectedTileIds` exactly
 * once (no empties/dupes/extras). Used to refuse rearrange commits that would
 * persist a gap-closed / missing-tile tree.
 */
export function layoutCoversExpectedTiles(
  candidate: TilingLayoutNode,
  expectedTileIds: ReadonlyArray<string>,
): boolean {
  const report: LayoutTileIntegrityReport = assessLayoutTileIntegrity(
    candidate,
    { expectedTileIds },
  );
  return !report.requiresRebuild;
}

/**
 * Right-associative horizontal dwindle over `tileIds` with equal first-share
 * ratios (`1/n`, `1/(n-1)`, …). Used when integrity fails and no
 * {@link NormalizeLayoutOptions.fallbackLayout} is supplied.
 */
export function buildDefaultDwindleLayout(
  tileIds: ReadonlyArray<string>,
  axis: TilingSplitAxis = "horizontal",
): TilingLayoutNode {
  if (tileIds.length === 0) {
    return { kind: "leaf", id: "leaf-empty", tileId: "empty" };
  }
  if (tileIds.length === 1) {
    const only: string = tileIds[0]!;
    return { kind: "leaf", id: `leaf-${only}`, tileId: only };
  }
  const firstTileId: string = tileIds[0]!;
  const rest: ReadonlyArray<string> = tileIds.slice(1);
  const first: TilingLeafNode = {
    kind: "leaf",
    id: `leaf-${firstTileId}`,
    tileId: firstTileId,
  };
  return {
    kind: "split",
    id: `split-${firstTileId}`,
    axis,
    ratio: 1 / tileIds.length,
    first,
    second: buildDefaultDwindleLayout(rest, axis),
  };
}

function geometryNormalizeLayout(
  node: TilingLayoutNode,
  widthPx: number,
  heightPx: number,
  config: TilingLayoutConfig,
): TilingLayoutNode {
  const structurallyNormalized: TilingLayoutNode = normalizeStaticAxisFill(node);
  if (widthPx <= 1 || heightPx <= 1) {
    return structurallyNormalized;
  }
  return normalizeLayoutNode(
    structurallyNormalized,
    widthPx,
    heightPx,
    config,
  );
}

function uniquePresentTileIds(node: TilingLayoutNode): string[] {
  const tileIds: string[] = [];
  collectTileIds(node, tileIds);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const tileId of tileIds) {
    if (tileId.length === 0 || seen.has(tileId)) {
      continue;
    }
    seen.add(tileId);
    unique.push(tileId);
  }
  return unique;
}

function rebuildForIntegrityFailure(
  source: TilingLayoutNode,
  options: NormalizeLayoutOptions,
  expectedTileIds: ReadonlyArray<string> | undefined,
): TilingLayoutNode {
  if (options.fallbackLayout != null) {
    return options.fallbackLayout;
  }
  const rebuildIds: ReadonlyArray<string> =
    expectedTileIds != null && expectedTileIds.length > 0
      ? expectedTileIds
      : uniquePresentTileIds(source);
  if (rebuildIds.length === 0) {
    return source;
  }
  return preserveLeafSizingByTileId(
    source,
    buildDefaultDwindleLayout(rebuildIds),
  );
}

/**
 * Commit-time layout reconciliation: demote unfit static pins, clamp split
 * ratios against min-pane + full gutters, enforce the
 * {@link normalizeStaticAxisFill} both-static filler invariant so
 * panes+gutters fill the container, and heal tile-slot / geometric integrity
 * failures by rebuilding a sane default tree rather than leaving empty/void /
 * overlapping slots. When {@link NormalizeLayoutOptions.expectedTileIds} is
 * set, coverage is enforced against the host tile map.
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
  const expectedTileIds: ReadonlyArray<string> | undefined =
    options.expectedTileIds;

  let working: TilingLayoutNode = node;
  const preIntegrity: LayoutTileIntegrityReport = assessLayoutTileIntegrity(
    working,
    expectedTileIds != null ? { expectedTileIds } : {},
  );
  if (preIntegrity.requiresRebuild) {
    working = rebuildForIntegrityFailure(node, options, expectedTileIds);
  }

  let healed: TilingLayoutNode = geometryNormalizeLayout(
    working,
    widthPx,
    heightPx,
    options.config,
  );

  // Post-geometry gate: zero-area / overlap / residual tile-slot breaks must
  // not escape. Rebuild once, geometry-normalize again, then return.
  const postIntegrity: LayoutTileIntegrityReport = assessLayoutTileIntegrity(
    healed,
    {
      expectedTileIds,
      containerWidthPx: widthPx,
      containerHeightPx: heightPx,
      config: options.config,
    },
  );
  if (postIntegrity.requiresRebuild) {
    const rebuilt: TilingLayoutNode = rebuildForIntegrityFailure(
      node,
      options,
      expectedTileIds,
    );
    healed = geometryNormalizeLayout(
      rebuilt,
      widthPx,
      heightPx,
      options.config,
    );
  }

  return healed;
}

/**
 * Explicit repair entry — identical to {@link normalizeLayout}. Prefer this
 * name at host load/persist gates that must never store an integrity-failing
 * tree.
 */
export function repairLayout(
  node: TilingLayoutNode,
  options: RepairLayoutOptions,
): TilingLayoutNode {
  return normalizeLayout(node, options);
}

function findLeafByTileId(
  node: TilingLayoutNode,
  tileId: string,
): TilingLeafNode | null {
  if (node.kind === "leaf") {
    return node.tileId === tileId ? node : null;
  }
  if (node.kind === "group") {
    return node.members.find((member) => member.tileId === tileId) ?? null;
  }
  return (
    findLeafByTileId(node.first, tileId) ?? findLeafByTileId(node.second, tileId)
  );
}

function preserveLeafSizingByTileId(
  source: TilingLayoutNode,
  target: TilingLayoutNode,
): TilingLayoutNode {
  if (target.kind === "leaf") {
    const prior: TilingLeafNode | null = findLeafByTileId(source, target.tileId);
    if (prior?.sizing == null) {
      return target;
    }
    return { ...target, sizing: prior.sizing };
  }
  if (target.kind === "group") {
    return {
      ...target,
      members: target.members.map((member: TilingLeafNode): TilingLeafNode => {
        const prior: TilingLeafNode | null = findLeafByTileId(
          source,
          member.tileId,
        );
        return prior?.sizing == null
          ? member
          : { ...member, sizing: prior.sizing };
      }),
    };
  }
  return {
    ...target,
    first: preserveLeafSizingByTileId(source, target.first),
    second: preserveLeafSizingByTileId(source, target.second),
  };
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
    const firstMinPaneSizePx: number = resolveAlongAxisMinPaneSizePx(
      node.first,
      node.axis,
      node.minPaneSizePx,
      config.minPaneSizePx,
    );
    const secondMinPaneSizePx: number = resolveAlongAxisMinPaneSizePx(
      node.second,
      node.axis,
      node.minPaneSizePx,
      config.minPaneSizePx,
    );
    const ratio: number = clampByMinSize(
      node.ratio,
      axisContainerPx,
      gutterPx,
      firstMinPaneSizePx,
      secondMinPaneSizePx,
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
