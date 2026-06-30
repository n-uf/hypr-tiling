import type {
  TilingDropAction,
  TilingDropIntentTuningState,
  TilingLeafDropZone,
  TilingSplitAxis,
} from "./types";

export type TilingEdgeZone = Exclude<TilingLeafDropZone, "center">;

/**
 * Single-source-of-truth hit-zone model.
 *
 * Coordinate convention: every input is expressed in **pane-local CSS pixels**,
 * with the origin at the pane's top-left corner (x grows right, y grows down).
 * The pane's measured `getBoundingClientRect()` defines that origin, so the
 * resolver and the visual overlay both operate in the identical frame — there is
 * no client/page/container offset left implicit. Callers convert raw client
 * coordinates with `toPaneLocalPoint` before resolving.
 *
 * The pane partitions into exactly five non-overlapping regions that tile the
 * full pane with no gaps:
 *   - a center rectangle (swap intent), and
 *   - four edge trapezoids (left/right/top/bottom insert intent) formed by the
 *     diagonals from each pane corner to the nearest center-rectangle corner.
 *
 * Both `classifyPaneZone` (resolution) and `paneZoneClipPaths` (overlay drawing)
 * derive from this one geometry, so the resolved zone is exactly the drawn zone
 * under the cursor.
 */

interface TilingDropIntentEvaluation {
  isValid: boolean;
  rejectionReason: string | null;
}

export interface TilingPaneSize {
  width: number;
  height: number;
}

export interface TilingPanePoint {
  x: number;
  y: number;
}

export interface TilingClientRectOrigin {
  left: number;
  top: number;
}

export interface TilingDropIntentBaseConfig {
  /**
   * Fraction of each pane axis spanned by the center (swap) rectangle. Acts as
   * the SYMMETRIC value: it sizes both axes unless a per-axis override
   * (`centerRatioX` / `centerRatioY`) is supplied for that axis.
   */
  centerRatio: number;
  /** Per-axis HORIZONTAL (width) swap-zone fraction; falls back to `centerRatio`. */
  centerRatioX?: number;
  /** Per-axis VERTICAL (height) swap-zone fraction; falls back to `centerRatio`. */
  centerRatioY?: number;
  /** Floor for the center rectangle extent so tiny panes keep a usable swap zone. */
  centerMinPx: number;
  /** Boundary stickiness (pane-local px) used to suppress sub-pixel flicker. */
  hysteresisPx: number;
}

/** Per-axis swap-zone fractions (`x` = width, `y` = height), both clamped to `[0.05, 0.95]`. */
export interface TilingCenterRatios {
  x: number;
  y: number;
}

/**
 * Resolve the per-axis center ratios from a base config: a per-axis override
 * (`centerRatioX` / `centerRatioY`) wins, else the symmetric `centerRatio`.
 * Both are clamped to `[0.05, 0.95]` — the same clamp `resolvePaneZoneGeometry`
 * and `paneZoneClipPaths` apply, surfaced once so callers agree.
 */
export function resolveCenterRatios(config: TilingDropIntentBaseConfig): TilingCenterRatios {
  return {
    x: clamp(config.centerRatioX ?? config.centerRatio, 0.05, 0.95),
    y: clamp(config.centerRatioY ?? config.centerRatio, 0.05, 0.95),
  };
}

export interface TilingZoneGeometryConfig extends TilingDropIntentBaseConfig {
  /** `window.devicePixelRatio`; geometry boundaries snap to this grid (Retina). */
  devicePixelRatio: number;
}

export interface TilingPaneZoneGeometry {
  width: number;
  height: number;
  centerLeftPx: number;
  centerTopPx: number;
  centerRightPx: number;
  centerBottomPx: number;
  devicePixelRatio: number;
}

export interface TilingDropIntentState {
  leafId: string;
  zone: TilingLeafDropZone;
  action: TilingDropAction;
  dominantEdge: TilingEdgeZone;
  finalEdge: TilingEdgeZone | null;
  fallbackReason: string | null;
  blockedReason: string | null;
  axisPath: ReadonlyArray<TilingSplitAxis>;
  edgeThresholdRatio: number;
  centerRectWidthPx: number;
  centerRectHeightPx: number;
  centerDistancePx: number;
  nearestEdgeDistancePx: number;
  paneLocalX: number;
  paneLocalY: number;
  targetSplitId: string | null;
  targetSplitPlacement: "first" | "second" | null;
  selectedSplitZone: TilingEdgeZone | null;
  selectedSplitDistancePx: number | null;
  rejectedSplitReasons: ReadonlyArray<string>;
  tuning: TilingDropIntentTuningState;
}

interface TilingDropIntentResolutionInput {
  leafId: string;
  paneLocalX: number;
  paneLocalY: number;
  paneSize: TilingPaneSize;
  axisPath: ReadonlyArray<TilingSplitAxis>;
  geometryConfig: TilingZoneGeometryConfig;
  previousZone?: TilingLeafDropZone | null;
  evaluateZone: (zone: TilingLeafDropZone) => TilingDropIntentEvaluation;
}

export interface TilingDropIntentHitZoneDiagnosticEntry {
  zone: TilingEdgeZone;
  isValid: boolean;
  rejectionReason: string | null;
}

export interface TilingDropIntentHitZoneDiagnostics {
  geometry: TilingPaneZoneGeometry;
  /** Representative (X-axis) swap-zone fraction; equals `centerRatioX`. Retained for legacy single-axis readouts. */
  centerRatio: number;
  /** Per-axis HORIZONTAL swap-zone fraction driving the X clip-path boundaries. */
  centerRatioX: number;
  /** Per-axis VERTICAL swap-zone fraction driving the Y clip-path boundaries. */
  centerRatioY: number;
  edgeThresholdRatio: number;
  centerRectWidthPx: number;
  centerRectHeightPx: number;
  edgeZones: ReadonlyArray<TilingDropIntentHitZoneDiagnosticEntry>;
}

export const TILING_DROP_INTENT_CONFIG: TilingDropIntentBaseConfig = {
  centerRatio: 0.34,
  centerMinPx: 24,
  hysteresisPx: 6,
};

/**
 * Canonical edge-zone enumeration order, single source of truth.
 *
 * This order is the resolver's intentional **tie-break order**: when penetration
 * scores tie at a corner the first-enumerated zone wins (top before right before
 * bottom before left), so an exact diagonal corner resolves to `top`
 * deterministically. It also fixes the order of `rejectedSplitReasons` and the
 * diagnostics `edgeZones` array. The renderer imports this constant for any
 * enumeration that must agree with resolution; it keeps a separately-named
 * overlay *paint* order constant where the DOM paint sequence intentionally
 * differs (see `DROP_EDGE_ZONE_PAINT_ORDER` in the renderer).
 */
export const DROP_EDGE_ZONES: ReadonlyArray<TilingEdgeZone> = ["top", "right", "bottom", "left"];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Snap a pane-local px value to the physical device-pixel grid. The browser
 * rasterizes CSS boundaries to device pixels; snapping the classification
 * boundary to the same grid keeps "measured == rendered" on HiDPI/Retina.
 */
export function snapToDevicePixel(valuePx: number, devicePixelRatio: number): number {
  const safeRatio: number = devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.round(valuePx * safeRatio) / safeRatio;
}

/** Convert a raw client-space point into pane-local coordinates. */
export function toPaneLocalPoint(
  clientPoint: TilingPanePoint,
  paneRectOrigin: TilingClientRectOrigin,
): TilingPanePoint {
  return {
    x: clientPoint.x - paneRectOrigin.left,
    y: clientPoint.y - paneRectOrigin.top,
  };
}

export function resolvePaneZoneGeometry(
  size: TilingPaneSize,
  config: TilingZoneGeometryConfig,
): TilingPaneZoneGeometry {
  const width: number = Math.max(0, size.width);
  const height: number = Math.max(0, size.height);
  const devicePixelRatio: number = config.devicePixelRatio > 0 ? config.devicePixelRatio : 1;
  const ratios: TilingCenterRatios = resolveCenterRatios(config);
  const centerWidth: number = Math.min(width, Math.max(width * ratios.x, Math.min(config.centerMinPx, width)));
  const centerHeight: number = Math.min(height, Math.max(height * ratios.y, Math.min(config.centerMinPx, height)));

  return {
    width,
    height,
    centerLeftPx: snapToDevicePixel((width - centerWidth) / 2, devicePixelRatio),
    centerTopPx: snapToDevicePixel((height - centerHeight) / 2, devicePixelRatio),
    centerRightPx: snapToDevicePixel((width + centerWidth) / 2, devicePixelRatio),
    centerBottomPx: snapToDevicePixel((height + centerHeight) / 2, devicePixelRatio),
    devicePixelRatio,
  };
}

interface TilingEdgePenetration {
  zone: TilingEdgeZone;
  penetration: number;
}

function edgePenetrations(point: TilingPanePoint, geometry: TilingPaneZoneGeometry): ReadonlyArray<TilingEdgePenetration> {
  const leftGapPx: number = Math.max(geometry.centerLeftPx, 1);
  const rightGapPx: number = Math.max(geometry.width - geometry.centerRightPx, 1);
  const topGapPx: number = Math.max(geometry.centerTopPx, 1);
  const bottomGapPx: number = Math.max(geometry.height - geometry.centerBottomPx, 1);
  return [
    { zone: "top", penetration: (geometry.centerTopPx - point.y) / topGapPx },
    { zone: "right", penetration: (point.x - geometry.centerRightPx) / rightGapPx },
    { zone: "bottom", penetration: (point.y - geometry.centerBottomPx) / bottomGapPx },
    { zone: "left", penetration: (geometry.centerLeftPx - point.x) / leftGapPx },
  ];
}

/**
 * The edge with the deepest normalized penetration, ignoring the center rect.
 *
 * Diagnostic-only: the resolved `dominantEdge` feeds the debug/observability
 * telemetry panels exclusively — no drop-resolution logic consumes it (the
 * committed zone comes from `classifyPaneZone`). It is retained because it is
 * cheap (one pass over four edges) and gives operators a "which edge is the
 * cursor leaning toward" signal independent of the hysteresis-held zone; it is
 * unit-tested so the diagnostic stays trustworthy.
 */
export function resolveDominantEdge(point: TilingPanePoint, geometry: TilingPaneZoneGeometry): TilingEdgeZone {
  let bestZone: TilingEdgeZone = "top";
  let bestPenetration: number = Number.NEGATIVE_INFINITY;
  for (const entry of edgePenetrations(point, geometry)) {
    if (entry.penetration > bestPenetration) {
      bestPenetration = entry.penetration;
      bestZone = entry.zone;
    }
  }
  return bestZone;
}

function classifyRawZone(point: TilingPanePoint, geometry: TilingPaneZoneGeometry): TilingLeafDropZone {
  const insideCenterX: boolean = point.x >= geometry.centerLeftPx && point.x <= geometry.centerRightPx;
  const insideCenterY: boolean = point.y >= geometry.centerTopPx && point.y <= geometry.centerBottomPx;
  if (insideCenterX && insideCenterY) {
    return "center";
  }

  let bestZone: TilingLeafDropZone = "center";
  let bestPenetration: number = 0;
  for (const entry of edgePenetrations(point, geometry)) {
    if (entry.penetration > bestPenetration) {
      bestPenetration = entry.penetration;
      bestZone = entry.zone;
    }
  }
  return bestZone;
}

function nudgeTowardZone(
  point: TilingPanePoint,
  zone: TilingLeafDropZone,
  distancePx: number,
  geometry: TilingPaneZoneGeometry,
): TilingPanePoint {
  if (zone === "left") {
    return { x: point.x - distancePx, y: point.y };
  }
  if (zone === "right") {
    return { x: point.x + distancePx, y: point.y };
  }
  if (zone === "top") {
    return { x: point.x, y: point.y - distancePx };
  }
  if (zone === "bottom") {
    return { x: point.x, y: point.y + distancePx };
  }
  const paneCenterX: number = geometry.width / 2;
  const paneCenterY: number = geometry.height / 2;
  const deltaX: number = paneCenterX - point.x;
  const deltaY: number = paneCenterY - point.y;
  const length: number = Math.hypot(deltaX, deltaY);
  if (length <= distancePx || length === 0) {
    return { x: paneCenterX, y: paneCenterY };
  }
  return {
    x: point.x + (deltaX / length) * distancePx,
    y: point.y + (deltaY / length) * distancePx,
  };
}

/**
 * Deterministically classify a pane-local point into a drop zone.
 *
 * The base partition is a pure function of position (no seed/fallback ordering).
 * The only stabilization is a small geometric hysteresis: once the cursor is in
 * `previousZone`, it must cross the boundary by `hysteresisPx` (measured toward
 * that zone) before the classification switches. This prevents corner/divider
 * flicker without time-based debounce.
 */
export function classifyPaneZone(
  point: TilingPanePoint,
  geometry: TilingPaneZoneGeometry,
  options?: { previousZone?: TilingLeafDropZone | null; hysteresisPx?: number },
): TilingLeafDropZone {
  const rawZone: TilingLeafDropZone = classifyRawZone(point, geometry);
  const previousZone: TilingLeafDropZone | null = options?.previousZone ?? null;
  const hysteresisPx: number = Math.max(0, options?.hysteresisPx ?? 0);
  if (previousZone == null || hysteresisPx === 0 || previousZone === rawZone) {
    return rawZone;
  }

  const nudgedPoint: TilingPanePoint = nudgeTowardZone(point, previousZone, hysteresisPx, geometry);
  return classifyRawZone(nudgedPoint, geometry) === previousZone ? previousZone : rawZone;
}

/**
 * CSS `clip-path` polygons (percent-based, so exact for any pane size) for the
 * four edge trapezoids. The overlay draws these; classification uses the same
 * ratio-defined boundaries, guaranteeing visual/resolver agreement.
 */
export function paneZoneClipPaths(centerRatioX: number, centerRatioY: number): Record<TilingEdgeZone, string> {
  const ratioX: number = clamp(centerRatioX, 0.05, 0.95);
  const ratioY: number = clamp(centerRatioY, 0.05, 0.95);
  const lowX: string = (((1 - ratioX) / 2) * 100).toFixed(4);
  const highX: string = (((1 + ratioX) / 2) * 100).toFixed(4);
  const lowY: string = (((1 - ratioY) / 2) * 100).toFixed(4);
  const highY: string = (((1 + ratioY) / 2) * 100).toFixed(4);
  return {
    top: `polygon(0% 0%, 100% 0%, ${highX}% ${lowY}%, ${lowX}% ${lowY}%)`,
    right: `polygon(100% 0%, 100% 100%, ${highX}% ${highY}%, ${highX}% ${lowY}%)`,
    bottom: `polygon(0% 100%, 100% 100%, ${highX}% ${highY}%, ${lowX}% ${highY}%)`,
    left: `polygon(0% 0%, 0% 100%, ${lowX}% ${highY}%, ${lowX}% ${lowY}%)`,
  };
}

/** Per-axis inset (percent of pane) of the center rectangle from each pane edge. */
export function paneZoneCenterInsetPercent(centerRatioX: number, centerRatioY: number): TilingCenterRatios {
  return {
    x: (((1 - clamp(centerRatioX, 0.05, 0.95)) / 2) * 100),
    y: (((1 - clamp(centerRatioY, 0.05, 0.95)) / 2) * 100),
  };
}

function edgeDistanceToPaneEdgePx(
  zone: TilingEdgeZone,
  point: TilingPanePoint,
  geometry: TilingPaneZoneGeometry,
): number {
  if (zone === "left") {
    return Math.max(0, point.x);
  }
  if (zone === "right") {
    return Math.max(0, geometry.width - point.x);
  }
  if (zone === "top") {
    return Math.max(0, point.y);
  }
  return Math.max(0, geometry.height - point.y);
}

function resolveTuning(config: TilingZoneGeometryConfig): TilingDropIntentTuningState {
  // The tuning telemetry carries a single representative `centerRatio` (the X /
  // width axis); the per-axis Y value is consumed by the geometry directly. For
  // a symmetric config (the default) X == Y, so this is exact; for an
  // asymmetric per-axis config it reports the X axis.
  const centerRatio: number = resolveCenterRatios(config).x;
  return {
    centerRatio,
    edgeThresholdRatio: (1 - centerRatio) / 2,
    hysteresisPx: Math.max(0, config.hysteresisPx),
    devicePixelRatio: config.devicePixelRatio > 0 ? config.devicePixelRatio : 1,
  };
}

export function resolveDropIntent(input: TilingDropIntentResolutionInput): TilingDropIntentState {
  const { leafId, paneLocalX, paneLocalY, paneSize, axisPath, geometryConfig, evaluateZone } = input;
  const geometry: TilingPaneZoneGeometry = resolvePaneZoneGeometry(paneSize, geometryConfig);
  const point: TilingPanePoint = { x: paneLocalX, y: paneLocalY };
  const tuning: TilingDropIntentTuningState = resolveTuning(geometryConfig);

  // Two classifications are both required and return semantically distinct
  // values: `rawZone` is the pure position-only partition (no hysteresis), and
  // `zone` is the resolved partition after geometric hysteresis may hold the
  // previous zone. `heldByHysteresis` (and the `fallbackReason` it drives) is
  // exactly the divergence between them, so neither call can be dropped without
  // losing the hold signal. The redundant inner re-run of `classifyRawZone` is
  // an O(4) micro-cost kept inside `classifyPaneZone` to preserve it as the
  // single source of truth for the partition rather than inlining the geometry
  // here.
  const rawZone: TilingLeafDropZone = classifyPaneZone(point, geometry);
  const zone: TilingLeafDropZone = classifyPaneZone(point, geometry, {
    previousZone: input.previousZone ?? null,
    hysteresisPx: geometryConfig.hysteresisPx,
  });
  const heldByHysteresis: boolean = zone !== rawZone;

  const paneCenterX: number = geometry.width / 2;
  const paneCenterY: number = geometry.height / 2;
  const centerDistancePx: number = Math.hypot(point.x - paneCenterX, point.y - paneCenterY);
  const nearestEdgeDistancePx: number = Math.max(
    0,
    Math.min(point.x, geometry.width - point.x, point.y, geometry.height - point.y),
  );
  // Diagnostic-only signal (telemetry panels); not consumed by drop resolution.
  const dominantEdge: TilingEdgeZone = resolveDominantEdge(point, geometry);

  const rejectedSplitReasons: Array<string> = [];
  for (const edgeZone of DROP_EDGE_ZONES) {
    const edgeEvaluation: TilingDropIntentEvaluation = evaluateZone(edgeZone);
    if (!edgeEvaluation.isValid) {
      rejectedSplitReasons.push(edgeEvaluation.rejectionReason ?? `${edgeZone} rejected`);
    }
  }

  const isCenter: boolean = zone === "center";
  const evaluation: TilingDropIntentEvaluation = evaluateZone(zone);
  const isValid: boolean = evaluation.isValid;
  // A center drop on a pane body — leaf OR group — is always `swap`. Add-to-group
  // (`group-merge`) is reachable only via the group's TAB STRIP drop target
  // (`resolveGroupTabStripHit` → `buildGroupTabStripMergeIntent`), never via the
  // group body center, so the center (swap) zone is identical on every slot.
  const action: TilingDropAction = isCenter
    ? (isValid ? "swap" : "none")
    : (isValid ? "edge-insert" : "none");
  const finalEdge: TilingEdgeZone | null = !isCenter && isValid ? (zone as TilingEdgeZone) : null;
  const selectedSplitZone: TilingEdgeZone | null = isCenter ? null : (zone as TilingEdgeZone);
  const selectedSplitDistancePx: number | null = isCenter
    ? null
    : edgeDistanceToPaneEdgePx(zone as TilingEdgeZone, point, geometry);
  const blockedReason: string | null = isValid
    ? null
    : (evaluation.rejectionReason ?? `${zone}-blocked`);

  return {
    leafId,
    zone,
    action,
    dominantEdge,
    finalEdge,
    fallbackReason: heldByHysteresis ? `hysteresis-hold:${rawZone}->${zone}` : null,
    blockedReason,
    axisPath,
    edgeThresholdRatio: tuning.edgeThresholdRatio,
    centerRectWidthPx: geometry.centerRightPx - geometry.centerLeftPx,
    centerRectHeightPx: geometry.centerBottomPx - geometry.centerTopPx,
    centerDistancePx,
    nearestEdgeDistancePx,
    paneLocalX: point.x,
    paneLocalY: point.y,
    targetSplitId: null,
    targetSplitPlacement: null,
    selectedSplitZone,
    selectedSplitDistancePx,
    rejectedSplitReasons,
    tuning,
  };
}

export function resolveDropIntentHitZoneDiagnostics(input: {
  paneSize: TilingPaneSize;
  geometryConfig: TilingZoneGeometryConfig;
  evaluateZone: (zone: TilingLeafDropZone) => TilingDropIntentEvaluation;
}): TilingDropIntentHitZoneDiagnostics {
  const geometry: TilingPaneZoneGeometry = resolvePaneZoneGeometry(input.paneSize, input.geometryConfig);
  const tuning: TilingDropIntentTuningState = resolveTuning(input.geometryConfig);
  const ratios: TilingCenterRatios = resolveCenterRatios(input.geometryConfig);
  const edgeZones: ReadonlyArray<TilingDropIntentHitZoneDiagnosticEntry> = DROP_EDGE_ZONES.map(
    (zone: TilingEdgeZone): TilingDropIntentHitZoneDiagnosticEntry => {
      const evaluation: TilingDropIntentEvaluation = input.evaluateZone(zone);
      return {
        zone,
        isValid: evaluation.isValid,
        rejectionReason: evaluation.rejectionReason,
      };
    },
  );

  return {
    geometry,
    centerRatio: tuning.centerRatio,
    centerRatioX: ratios.x,
    centerRatioY: ratios.y,
    edgeThresholdRatio: tuning.edgeThresholdRatio,
    centerRectWidthPx: geometry.centerRightPx - geometry.centerLeftPx,
    centerRectHeightPx: geometry.centerBottomPx - geometry.centerTopPx,
    edgeZones,
  };
}

/** Client-space axis-aligned bounds (e.g. from `getBoundingClientRect`). */
export interface TilingClientRectBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A group tab strip hit during drag — merge into this group. */
export interface TilingGroupTabStripHitTarget {
  groupId: string;
  activeMemberLeafId: string;
}

/** Whether `(clientX, clientY)` lies inside `bounds`. */
export function pointInClientBounds(
  clientX: number,
  clientY: number,
  bounds: TilingClientRectBounds,
): boolean {
  return (
    clientX >= bounds.left &&
    clientX <= bounds.right &&
    clientY >= bounds.top &&
    clientY <= bounds.bottom
  );
}

/**
 * First group tab strip whose bounds contain the client point. `candidates` are
 * checked in order (topmost / DOM order should be listed first by the caller).
 */
export function resolveGroupTabStripHit(
  clientX: number,
  clientY: number,
  candidates: ReadonlyArray<{
    groupId: string;
    activeMemberLeafId: string;
    bounds: TilingClientRectBounds | null;
  }>,
): TilingGroupTabStripHitTarget | null {
  for (const candidate of candidates) {
    if (candidate.bounds != null && pointInClientBounds(clientX, clientY, candidate.bounds)) {
      return {
        groupId: candidate.groupId,
        activeMemberLeafId: candidate.activeMemberLeafId,
      };
    }
  }
  return null;
}

const GROUP_TAB_STRIP_MERGE_TUNING: TilingDropIntentTuningState = {
  centerRatio: TILING_DROP_INTENT_CONFIG.centerRatio,
  edgeThresholdRatio: (1 - TILING_DROP_INTENT_CONFIG.centerRatio) / 2,
  hysteresisPx: 0,
  devicePixelRatio: 1,
};

/**
 * Build a `group-merge` drop intent for a tab-strip hit (center zone, no geometry
 * partition). Validity comes from the caller's `evaluateCenter` closure (same
 * SSOT as pane-body center drops).
 */
export function buildGroupTabStripMergeIntent(input: {
  activeMemberLeafId: string;
  evaluateCenter: () => TilingDropIntentEvaluation;
}): TilingDropIntentState {
  const evaluation: TilingDropIntentEvaluation = input.evaluateCenter();
  const isValid: boolean = evaluation.isValid;
  return {
    leafId: input.activeMemberLeafId,
    zone: "center",
    action: isValid ? "group-merge" : "none",
    dominantEdge: "top",
    finalEdge: null,
    fallbackReason: "group-tab-strip",
    blockedReason: isValid ? null : (evaluation.rejectionReason ?? "group-tab-strip-blocked"),
    axisPath: [],
    edgeThresholdRatio: GROUP_TAB_STRIP_MERGE_TUNING.edgeThresholdRatio,
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
    tuning: GROUP_TAB_STRIP_MERGE_TUNING,
  };
}
