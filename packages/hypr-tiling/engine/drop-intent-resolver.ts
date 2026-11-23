import { paneCenter, type TilingHeld, type TilingMark } from "@n-uf/placement/tiling";
import type {
  TilingDropAction,
  TilingDropIntentTuningState,
  TilingLeafDropZone,
  TilingSplitAxis,
} from "./types";

/** A pane's four directional insert edges (the drop zones excluding `"center"`). */
export type TilingEdgeZone = Exclude<TilingLeafDropZone, "center">;

/**
 * The drop state a drag carries, and the hit-zone geometry its overlays draw.
 *
 * Which place the pointer is over is not decided here: `@n-uf/placement/tiling`'s drag hit (`tilingDrag(...).hit`)
 * decides it, on one layout fixed at the lift, with its one hold rule; `engine/tiling-drag-tree.ts` turns what it reads
 * into this state. The pane's five regions (a center rectangle for a swap, four edge trapezoids for a side) are
 * placement's `paneRegion`; `paneZoneClipPaths` draws them for the debug overlay from the same ratios.
 */

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

/** Base drop hit-zone geometry: the center swap fraction and its floor. */
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
}

/** Per-axis swap-zone fractions (`x` = width, `y` = height), both clamped to `[0.05, 0.95]`. */
export interface TilingCenterRatios {
  x: number;
  y: number;
}

/**
 * Resolve the per-axis center ratios from a base config: a per-axis override
 * (`centerRatioX` / `centerRatioY`) wins, else the symmetric `centerRatio`.
 * Both are clamped to `[0.05, 0.95]`, as `paneZoneClipPaths` clamps them.
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

/**
 * A drag's drop on one pane: the place the drag's hit holds there, as the drag machine and the renderer read it, plus
 * the geometry fields the debug readouts show. Emitted (as {@link TilingDropIntentDebugState}) to `onDropIntentChange`.
 */
export interface TilingDropIntentState {
  /** The hovered leaf this resolution targets. */
  leafId: string;
  /** The resolved drop zone under the cursor. */
  zone: TilingLeafDropZone;
  /** The resolved drop action. */
  action: TilingDropAction;
  /** The nearest edge the cursor points toward (pre-fallback). */
  dominantEdge: TilingEdgeZone;
  /** The edge finally selected after fallbacks, or `null`. */
  finalEdge: TilingEdgeZone | null;
  /** Why the dominant edge was replaced by a fallback, or `null`. */
  fallbackReason: string | null;
  /** Why the action was blocked, or `null` when unblocked. */
  blockedReason: string | null;
  /** Split axes from the root to the target (containment path). */
  axisPath: ReadonlyArray<TilingSplitAxis>;
  /** Edge threshold fraction in effect. */
  edgeThresholdRatio: number;
  /** Center rectangle width (CSS px). */
  centerRectWidthPx: number;
  /** Center rectangle height (CSS px). */
  centerRectHeightPx: number;
  /** Cursor distance to the center rectangle (CSS px). */
  centerDistancePx: number;
  /** Cursor distance to the nearest edge (CSS px). */
  nearestEdgeDistancePx: number;
  /** Pane-local cursor X (CSS px). */
  paneLocalX: number;
  /** Pane-local cursor Y (CSS px). */
  paneLocalY: number;
  /** The ancestor split chosen for a split-container insert, or `null`. */
  targetSplitId: string | null;
  /** Which child slot of that split the insert targets, or `null`. */
  targetSplitPlacement: "first" | "second" | null;
  /** The edge zone selected on the chosen split, or `null`. */
  selectedSplitZone: TilingEdgeZone | null;
  /** Cursor distance to the selected split edge (CSS px), or `null`. */
  selectedSplitDistancePx: number | null;
  /** Reasons candidate splits were rejected during resolution. */
  rejectedSplitReasons: ReadonlyArray<string>;
  /** The tuning knobs that shaped this resolution. */
  tuning: TilingDropIntentTuningState;
  /**
   * Member index a `group-merge` inserts at, when the pointer is over a
   * strip tab. Omitted for a join with no index (it appends).
   */
  memberInsertIndex?: number;
  /** The drag hit's held place (keyed by tile id) this drop is: what a release commits, `after(place)`. */
  place?: TilingHeld<string>;
  /** Indicator's mark for it: a region of the lift layout (viewport px), or null. */
  mark?: TilingMark<string> | null;
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

/**
 * The default drop hit-zone geometry: a `0.34` center swap fraction and a `24`px
 * center floor. The baseline `dropHitZoneGeometry` capability resolves to these values.
 */
export const TILING_DROP_INTENT_CONFIG: TilingDropIntentBaseConfig = {
  centerRatio: 0.34,
  centerMinPx: 24,
};

/** The edge zones in placement's tie-break order (top, right, bottom, left). */
export const DROP_EDGE_ZONES: ReadonlyArray<TilingEdgeZone> = ["top", "right", "bottom", "left"];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
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

/** The center (swap) rectangle of a pane of `paneSize`, placement's `paneCenter` under `config`. */
export function resolvePaneCenterGeometry(paneSize: TilingPaneSize, config: TilingZoneGeometryConfig): TilingPaneZoneGeometry {
  const ratios: TilingCenterRatios = resolveCenterRatios(config);
  const c = paneCenter(paneSize, {
    centerX: ratios.x,
    centerY: ratios.y,
    centerMin: config.centerMinPx,
    pixelRatio: config.devicePixelRatio > 0 ? config.devicePixelRatio : 1,
  });
  return {
    width: c.width,
    height: c.height,
    centerLeftPx: c.left,
    centerTopPx: c.top,
    centerRightPx: c.right,
    centerBottomPx: c.bottom,
    devicePixelRatio: config.devicePixelRatio,
  };
}

/**
 * CSS `clip-path` polygons (percent-based, so exact for any pane size) for the
 * four edge trapezoids, for the debug overlay.
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
