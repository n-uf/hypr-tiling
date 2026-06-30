"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";
import {
  DYNAMIC_TILE_ACCENT_SWATCHES,
  TILING_THEMES,
  TilingThemeProvider,
  resolvePaneDropAffordanceClasses,
  resolveTilingTheme,
  useTilingTheme,
  type TilingTheme,
  type TilingThemeId,
} from "./theme";
import {
  isCommandEnabled,
  keyboardActionToCommand,
  tabDoubleClickMaximizeCommand,
  type TilingCommandGates,
} from "./commands";
import {
  clampCursorPointToViewport,
  resolveDragCursorPresentation,
  type DragCursorPoint,
  type DragCursorPresentation,
} from "./drag-cursor";
import { DEFAULT_DRAG_HOP_EASING, resolveDragEasing } from "./drag-easing";
import {
  DRAG_MACHINE_INITIAL_STATE,
  activeDragSourceLeafId,
  activeResolvedTarget,
  presentationDragSourceLeafId,
  presentationResolvedTarget,
  createFrameCoalescer,
  deriveCandidateTree,
  dragMachineReducer,
  hasCrossedPickupThreshold,
  isCommittableTarget,
  previousZoneSeed,
  resolveDragCommitFocusLeafId,
  resolveDragGhostSeatLeafId,
  resolveTouchArmedMove,
  shouldReresolveSeatedTarget,
  deriveCommittableSeat,
  type DragMachinePoint,
  type DragMachineState,
  type DragPointerType,
  type FrameCoalescer,
  type TouchArmedMoveResolution,
} from "./drag-machine";
import {
  dragSourceReservationSelector,
  isDragPresentationActive,
  resolveDragPresentation,
  resolveInitialPaneContentVisible,
  resolvePaneBodyRenderMode,
} from "./drag-presentation";
import type {
  DynamicDropIntentHitZoneDiagnostics,
  DynamicDropIntentState as DynamicDropState,
  DynamicEdgeZone,
  DynamicZoneGeometryConfig,
} from "./drop-intent-resolver";
import {
  DYNAMIC_DROP_INTENT_CONFIG,
  buildGroupTabStripMergeIntent,
  paneZoneCenterInsetPercent,
  paneZoneClipPaths,
  resolveDropIntent,
  resolveDropIntentHitZoneDiagnostics,
  resolveGroupTabStripHit,
  toPaneLocalPoint,
} from "./drop-intent-resolver";
import {
  collectStaticGatedLeafIds,
  evaluateZoneCandidate,
} from "./drop-validity";
import {
  EMPTY_FOCUS_HISTORY,
  pruneFocusHistory,
  pushFocusHistory,
  resolveFocusCurrentOrLast,
  type FocusHistory,
} from "./focus-history";
import {
  DEFAULT_SWAP_BOUNCE_MAGNITUDE_PERCENT,
  buildBounceEasingCss,
  buildLinearEasingCss,
  clampSwapBounceMagnitudePercent,
  coherentDipScaleAt,
  deriveGhostMorphTransform,
  deriveGhostPickupBox,
  ghostPickupScaleFactor,
  isDegenerateGhostRect,
  magneticEaseProgress,
  resolveGhostHopFirstRect,
  shouldApplyCoherentTransitDip,
  type GhostMorphTransform,
  type GhostPoint,
  type GhostRect,
} from "./ghost-transit";
import {
  createDragWatchdog,
  onTransitionSettled,
  scheduleFrameOrTimeout,
  stripTransientDragStyles,
  type DragWatchdog,
  type FrameOrTimeoutScheduler,
  type RacedFrameHandle,
  type TimerScheduler,
  type TransitionSettledHandle,
  type TransientDragStyleTarget,
} from "./drag-recovery";
import {
  isResizeAxisEnabled,
  resolveInteractionCapabilities,
} from "./interaction-capabilities";
import { matchKeyBinding } from "./keybindings";
import {
  collectLeafFootprints,
  collectMasterSlots,
  footprintsByLeafId,
  resolveMasterParams,
  resolveMasterStackFootprints,
  slotRepresentativeLeafId,
} from "./leaf-geometry";
import {
  clampByMinSize,
  isStaticAlongSplitAxis,
  isStaticInDimension,
  isStaticOnCrossAxis,
  measuredStaticSizing,
  resolveBinarySplitDistribution,
  resolveSizingMode,
  titleBarSizingModeId,
  type SplitChildMainSizing,
} from "./pane-sizing";
import {
  advancePaneSwitcher,
  chordHasModifier,
  commitPaneSwitcher,
  directionToPlacement,
  isSwitcherHoldReleased,
  jumpPaneSwitcher,
  matchKeymapAction,
  openPaneSwitcher,
  resolveCycledPaneId,
  resolveJumpedPaneId,
  resolveMaximizeToggle,
} from "./pane-switching";
import type {
  DynamicProjectedLandingOverlay,
  DynamicProjectedLandingSubject,
} from "./projected-layout";
import {
  resolveProjectedDropLayout,
  resolveProjectedLandingOverlays,
} from "./projected-layout";
import type { TilingGrowConstraints } from "./state";
import {
  addLeafToGroup,
  adjustSplitMasterCount,
  adjustSplitRatio,
  annexDirection,
  collectGroups,
  collectSplitNodes,
  cycleActiveGroupMember,
  cycleSplitLayoutMode,
  cycleSplitMasterOrientation,
  findGroupById,
  findGroupContainingLeaf,
  findLeafByDirection,
  findLeafById,
  groupLeaves,
  insertLeafAdjacent,
  isStructurallyValidLayout,
  readLeafNodeIds,
  removeLeafTile,
  removeMemberFromGroup,
  setActiveGroupMember,
  setLeafSizing,
  setSplitLayoutMode,
  setSplitMasterCount,
  setSplitMasterOrientation,
  swapLeafTiles,
  toggleSplitAxis,
  ungroupNode,
  updateSplitRatio,
} from "./state";
import {
  deriveSurvivorFlipTransform,
  resolveSurvivorFlipFirst,
  shouldAnimateSurvivorReflow,
  shouldSnapSurvivorReflowOnSettleCommit,
  type SurvivorRect,
} from "./survivor-reflow";
import type {
  DynamicDragCancelVisualState,
  DynamicDragPaneSnapshot,
  DynamicDragVisualState,
  DynamicDropIntentDebugState,
  DynamicFocusDirection,
  DynamicGroupNode,
  DynamicLayoutConfig,
  DynamicLayoutNode,
  DynamicLeafDropPreview,
  DynamicLeafDropZone,
  DynamicLeafNode,
  DynamicLiveHitLogState,
  DynamicMovePlacement,
  DynamicObservabilityColorConfig,
  DynamicObservabilityColorEnableConfig,
  DynamicPaneBodyRenderMode,
  DynamicPaneFootprint,
  DynamicPaneHitZoneCandidateDebugState,
  DynamicPaneHitZoneOverlayDebugState,
  DynamicRenderTileArgs,
  DynamicSplitAxis,
  DynamicSplitNode,
  DynamicSplitResizeState,
  DynamicTile,
  DynamicTileAccent,
  DynamicTileAccentSwatch,
  DynamicTilingRendererProps,
  ResolvedTilingDropHitZoneGeometryCapability,
  ResolvedTilingInteractionCapabilities,
  ResolvedTilingKeymap,
  ResolvedTilingSlotCommitmentCapability,
  TilingCommand,
  TilingCommandHandle,
  TilingKeyboardAction,
  TilingMoveModeState,
  TilingPaneSizing,
  TilingPaneSwitcherState,
  TilingTitleBarSizingMode,
} from "./types";

function resolveDragPointerType(pointerType: string): DragPointerType {
  if (pointerType === "touch") {
    return "touch";
  }
  if (pointerType === "pen") {
    return "pen";
  }
  return "mouse";
}

/**
 * Build the per-resolve zone-geometry config from the resolved interaction
 * capability (operator-adjustable center swap fraction, center floor, boundary
 * hysteresis) plus the live `devicePixelRatio`. The capability defaults equal
 * `DYNAMIC_DROP_INTENT_CONFIG`, so an unconfigured renderer keeps today's
 * behavior; `resolvePaneZoneGeometry` clamps `centerRatio` and floors the px
 * knobs, so this stays a thin pass-through.
 */
function currentGeometryConfig(
  geometry: ResolvedTilingDropHitZoneGeometryCapability,
): DynamicZoneGeometryConfig {
  const devicePixelRatio: number =
    typeof window === "undefined" ? 1 : window.devicePixelRatio;
  return {
    centerRatio: geometry.centerRatio,
    centerRatioX: geometry.centerRatioX,
    centerRatioY: geometry.centerRatioY,
    centerMinPx: geometry.centerMinPx,
    hysteresisPx: geometry.hysteresisPx,
    devicePixelRatio: devicePixelRatio > 0 ? devicePixelRatio : 1,
  };
}

interface DynamicSplitPathEntry {
  splitId: string;
  axis: DynamicSplitAxis;
}

export const DYNAMIC_OBSERVABILITY_COLOR_DEFAULTS: DynamicObservabilityColorConfig =
  {
    dragSourceBorderColorHex: "#f0abfc",
    dragTargetBorderColorHex: "#67e8f9",
    projectedSourceBorderColorHex: "#fde68a",
    projectedTargetBorderColorHex: "#86efac",
    projectedSuccessorBorderColorHex: "#93c5fd",
    projectedSourceFillColorHex: "#f59e0b",
    projectedTargetFillColorHex: "#10b981",
    projectedSuccessorFillColorHex: "#3b82f6",
    hitZoneLeftColorHex: "#0ea5e9",
    hitZoneRightColorHex: "#a855f7",
    hitZoneTopColorHex: "#f59e0b",
    hitZoneBottomColorHex: "#14b8a6",
    hitZoneCenterColorHex: "#10b981",
    hitZoneBlockedColorHex: "#fb7185",
  };

export const DYNAMIC_OBSERVABILITY_COLOR_ENABLE_DEFAULTS: DynamicObservabilityColorEnableConfig =
  {
    dragSourceBorderEnabled: true,
    dragTargetBorderEnabled: true,
    projectedSourceBorderEnabled: true,
    projectedTargetBorderEnabled: true,
    projectedSourceFillEnabled: true,
    projectedTargetFillEnabled: true,
    projectedSuccessorBorderEnabled: true,
    projectedSuccessorFillEnabled: true,
  };

/**
 * Recommended baseline layout config — the generic gap / min-pane / handle
 * scale. `config` stays a required renderer prop (spacing is explicit at the
 * call site), but consumers that don't tune spacing can spread this for a
 * tasteful, well-readable inter-pane gutter out of the box instead of inventing
 * their own magic numbers. `gapPx` + `handleSizePx` together form the visible
 * inter-pane gap (the divider element occupies `handleSizePx` flanked by
 * `gapPx / 2` margins; each child subtracts `(gapPx + handleSizePx) / 2` of
 * basis — see `splitGapOffsetPx` in the split renderer for the balancing math).
 */
export const DEFAULT_TILING_LAYOUT_CONFIG: DynamicLayoutConfig = {
  gapPx: 6,
  minPaneSizePx: 96,
  handleSizePx: 4,
};

/** Baseline ghost-hop / survivor-reflow duration at `DEFAULT_DRAG_ANIMATION_SPEED_PERCENT`. */
export const BASELINE_DRAG_HOP_DURATION_MS: number = 170;
export const DEFAULT_DRAG_ANIMATION_SPEED_PERCENT: number = 100;

/** Slowest (floor) / fastest (ceiling) drag animation speed percents the slider + clamp allow. */
export const DRAG_ANIMATION_SPEED_MIN_PERCENT: number = 10;
export const DRAG_ANIMATION_SPEED_MAX_PERCENT: number = 400;

export function resolveDragAnimationDurationMs(speedPercent: number): number {
  const clampedPercent: number = Math.min(
    Math.max(speedPercent, DRAG_ANIMATION_SPEED_MIN_PERCENT),
    DRAG_ANIMATION_SPEED_MAX_PERCENT,
  );
  return Math.round(BASELINE_DRAG_HOP_DURATION_MS * (100 / clampedPercent));
}

/**
 * `window`-backed frame + timer scheduler for the drag-recovery primitives
 * (`scheduleFrameOrTimeout` M1). Defined at module scope (stable identity) so it
 * never re-arms an effect; `window` is referenced only inside the closures, so
 * the constant is SSR-safe (the closures run only in a browser, inside effects).
 */
const WINDOW_FRAME_OR_TIMEOUT_SCHEDULER: FrameOrTimeoutScheduler = {
  requestFrame: (callback: () => void): number => window.requestAnimationFrame(callback),
  cancelFrame: (handle: number): void => window.cancelAnimationFrame(handle),
  setTimer: (callback: () => void, ms: number): number => window.setTimeout(callback, ms),
  clearTimer: (handle: number): void => window.clearTimeout(handle),
};

/** `window`-backed timer scheduler for the drag idle watchdog (M3). */
const WINDOW_TIMER_SCHEDULER: TimerScheduler = {
  setTimer: (callback: () => void, ms: number): number => window.setTimeout(callback, ms),
  clearTimer: (handle: number): void => window.clearTimeout(handle),
};

/** Monotonic clock for the idle watchdog — `performance.now()` where available. */
function monotonicNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** Duration the drag-motion timings collapse to when `dragAnimationEnabled` is `false`. */
export const INSTANT_DRAG_DURATION_MS: number = 1;

/**
 * Whether the ghost transit speed and the survivor reflow speed resolve to EQUAL
 * timing (parity). The coherent non-intersecting transit dip is only
 * geometrically valid at parity (both moving boxes must reach their mid-transit
 * shrink at the same instant). Compares the RESOLVED durations so two percents
 * that clamp to the same value (e.g. `401` and `500` → `400`) count as parity.
 */
export function dragSpeedsAtParity(
  ghostTransitSpeedPercent: number,
  survivorReflowSpeedPercent: number,
): boolean {
  return (
    resolveDragAnimationDurationMs(ghostTransitSpeedPercent) ===
    resolveDragAnimationDurationMs(survivorReflowSpeedPercent)
  );
}

function hasEnabledProjectedFill(
  enables: DynamicObservabilityColorEnableConfig,
): boolean {
  return (
    enables.projectedSourceFillEnabled ||
    enables.projectedTargetFillEnabled ||
    enables.projectedSuccessorFillEnabled
  );
}

function projectedSubjectBorderEnabled(
  subject: DynamicProjectedLandingSubject,
  enables: DynamicObservabilityColorEnableConfig,
): boolean {
  if (subject === "source") {
    return enables.projectedSourceBorderEnabled;
  }
  if (subject === "target") {
    return enables.projectedTargetBorderEnabled;
  }
  return enables.projectedSuccessorBorderEnabled;
}

function projectedSubjectFillEnabled(
  subject: DynamicProjectedLandingSubject,
  enables: DynamicObservabilityColorEnableConfig,
): boolean {
  if (subject === "source") {
    return enables.projectedSourceFillEnabled;
  }
  if (subject === "target") {
    return enables.projectedTargetFillEnabled;
  }
  return enables.projectedSuccessorFillEnabled;
}

const DRAG_PANE_PREVIEW_MAX_ROWS: number = 10;
const DRAG_CANCEL_ANIMATION_MS: number = 220;
/**
 * Magnetic hop-in easing — the "click into the slot" feel. A sampled CSS
 * `linear()` timing function built once from the pure `magneticEaseProgress`
 * two-segment curve (decelerate approaching the slot, then snap the last ~15%).
 * Applied ONLY to the seated ghost hop-in (free-follow / hop-out / pickup keep
 * `DRAG_HOP_EASING`). See `ghost-transit.ts` §5.
 */
const GHOST_MAGNETIC_HOP_EASING: string = buildLinearEasingCss();
/** Keyframe sample count for the coherent-transit swap dip (mid-transit shrink). */
const COHERENT_TRANSIT_KEYFRAME_SAMPLES: number = 12;

/**
 * Build the Web-Animations keyframes for a coherent-transit (swap) morph: the
 * FLIP invert→identity transform with the mid-transit dip composed on so the box
 * shrinks toward `~70%` about its own center as it travels, then grows back.
 * Motion progress is eased by `magneticEaseProgress`; the dip uses
 * `coherentDipScaleAt`. Both moving boxes (ghost + swap survivor) use this so
 * they shrink and grow in lockstep and never visually collide mid-cross.
 */
function buildCoherentDipKeyframes(
  invert: GhostMorphTransform,
  lastWidth: number,
  lastHeight: number,
  sampleCount: number = COHERENT_TRANSIT_KEYFRAME_SAMPLES,
): Keyframe[] {
  const frames: Keyframe[] = [];
  for (let index: number = 0; index <= sampleCount; index += 1) {
    const progress: number = index / sampleCount;
    const eased: number = magneticEaseProgress(progress);
    const flipTx: number = invert.tx * (1 - eased);
    const flipTy: number = invert.ty * (1 - eased);
    const flipSx: number = invert.sx + (1 - invert.sx) * eased;
    const flipSy: number = invert.sy + (1 - invert.sy) * eased;
    const dip: number = coherentDipScaleAt(progress);
    const scaleX: number = flipSx * dip;
    const scaleY: number = flipSy * dip;
    // Re-center the dip about the (flip-interpolated) box center, expressed in
    // the node's top-left transform frame so it composes with the FLIP.
    const transX: number = flipTx + (lastWidth * flipSx * (1 - dip)) / 2;
    const transY: number = flipTy + (lastHeight * flipSy * (1 - dip)) / 2;
    frames.push({
      offset: progress,
      transform: `translate(${transX}px, ${transY}px) scale(${scaleX}, ${scaleY})`,
    });
  }
  return frames;
}
const PROJECTED_OVERLAY_Z_INDEX_BASE: number = 80;
const PROJECTED_OVERLAY_Z_INDEX_OFFSET: number = 1;
const DRAG_CANCEL_OVERLAY_Z_INDEX: number = 219;
const DRAG_PANE_OVERLAY_Z_INDEX: number = 220;
/**
 * The custom drag cursor (`DragCursorOverlay`) sits ABOVE the ghost so the
 * pointer affordance is never occluded by the dragged pane it carries.
 */
const DRAG_CURSOR_OVERLAY_Z_INDEX: number = 230;
/** Cursor badge diameter (px); half is reserved as the viewport-clamp margin. */
const DRAG_CURSOR_BADGE_SIZE_PX: number = 30;

/**
 * The tile registry is accepted as an ordered array or a `Map`. A plain array
 * is the natural shape for a config-driven dashboard; a `Map` is what the lab
 * passes. `resolveTile` reads a tile by id from either.
 */
function isTileArray(
  tiles: ReadonlyArray<DynamicTile> | ReadonlyMap<string, DynamicTile>,
): tiles is ReadonlyArray<DynamicTile> {
  return Array.isArray(tiles);
}

function resolveTile(
  tiles: ReadonlyArray<DynamicTile> | ReadonlyMap<string, DynamicTile>,
  tileId: string,
): DynamicTile | undefined {
  if (isTileArray(tiles)) {
    return tiles.find((tile: DynamicTile): boolean => tile.id === tileId);
  }
  return tiles.get(tileId);
}

// Per-accent class strings, the closed `TilingThemeId` registry, and the
// active-theme context all live in `./theme`. Accent hue atoms
// (`TILING_ACCENT_HUES`) + the theme's accent-composition resolvers replace the
// former inline `DYNAMIC_TILE_ACCENT_THEMES` record and its helper functions;
// every renderer surface now reads tokens from the active `TilingTheme` (via
// `useTilingTheme`) instead of hardcoded class strings.

function dropIntentLabel(zone: DynamicLeafDropZone): string {
  if (zone === "left") {
    return "left edge insert";
  }
  if (zone === "right") {
    return "right edge insert";
  }
  if (zone === "top") {
    return "top edge insert";
  }
  if (zone === "bottom") {
    return "bottom edge insert";
  }
  return "center swap";
}

function edgeZoneShortLabel(zone: DynamicEdgeZone): string {
  if (zone === "left") {
    return "L";
  }
  if (zone === "right") {
    return "R";
  }
  if (zone === "top") {
    return "T";
  }
  return "B";
}

function edgeZoneLabelPositionClassName(zone: DynamicEdgeZone): string {
  if (zone === "left") {
    return "absolute left-1 top-1/2 -translate-y-1/2";
  }
  if (zone === "right") {
    return "absolute right-1 top-1/2 -translate-y-1/2";
  }
  if (zone === "top") {
    return "absolute top-1 left-1/2 -translate-x-1/2";
  }
  return "absolute bottom-1 left-1/2 -translate-x-1/2";
}

function clampUnitInterval(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 1);
}

function toHexChannel(channel: string): number | null {
  const parsed: number = Number.parseInt(channel, 16);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return parsed;
}

function parseHexColor(
  colorHex: string,
  fallbackRgb: Readonly<[number, number, number]>,
): Readonly<[number, number, number]> {
  const normalizedColorHex: string = colorHex.trim();
  const hexWithoutHash: string = normalizedColorHex.startsWith("#")
    ? normalizedColorHex.slice(1)
    : normalizedColorHex;
  if (hexWithoutHash.length !== 6) {
    return fallbackRgb;
  }
  const red: number | null = toHexChannel(hexWithoutHash.slice(0, 2));
  const green: number | null = toHexChannel(hexWithoutHash.slice(2, 4));
  const blue: number | null = toHexChannel(hexWithoutHash.slice(4, 6));
  if (red == null || green == null || blue == null) {
    return fallbackRgb;
  }
  return [red, green, blue];
}

function rgbaFromHex(
  colorHex: string,
  alpha: number,
  fallbackRgb: Readonly<[number, number, number]>,
): string {
  const rgb: Readonly<[number, number, number]> = parseHexColor(
    colorHex,
    fallbackRgb,
  );
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${clampUnitInterval(alpha)})`;
}

function resolveHitZoneColorHex(
  zone: DynamicEdgeZone,
  isValid: boolean,
  observabilityColors: DynamicObservabilityColorConfig,
): string {
  if (!isValid) {
    return observabilityColors.hitZoneBlockedColorHex;
  }
  if (zone === "left") {
    return observabilityColors.hitZoneLeftColorHex;
  }
  if (zone === "right") {
    return observabilityColors.hitZoneRightColorHex;
  }
  if (zone === "top") {
    return observabilityColors.hitZoneTopColorHex;
  }
  return observabilityColors.hitZoneBottomColorHex;
}

function dropIntentAxisPathLabel(
  axisPath: ReadonlyArray<DynamicSplitAxis>,
): string {
  if (axisPath.length === 0) {
    return "none";
  }
  return axisPath.join(" -> ");
}

/**
 * Overlay *paint* order for the four edge hit-zone trapezoids. This is
 * deliberately distinct from the resolver's canonical tie-break enumeration
 * (`DROP_EDGE_ZONES`, top→right→bottom→left): the overlay paints the horizontal
 * pair (left/right) before the vertical pair (top/bottom) so the DOM/stacking
 * sequence is stable and independent of resolution semantics. The trapezoids do
 * not overlap, so this order is purely cosmetic, but it is named explicitly so
 * the two orderings never silently converge.
 *
 * Resolution-order consumption (rejection reasons, `edgeCandidates`) flows into
 * this component already-ordered from `resolveDropIntentHitZoneDiagnostics`,
 * which enumerates with the canonical `DROP_EDGE_ZONES`; this paint-order
 * constant is the only place the renderer chooses its own edge ordering.
 */
const DROP_EDGE_ZONE_PAINT_ORDER: ReadonlyArray<DynamicEdgeZone> = [
  "left",
  "right",
  "top",
  "bottom",
];

function readSplitPathToLeaf(
  node: DynamicLayoutNode,
  leafId: string,
  currentPath: ReadonlyArray<DynamicSplitPathEntry> = [],
): ReadonlyArray<DynamicSplitPathEntry> | null {
  if (node.kind === "leaf") {
    return node.id === leafId ? currentPath : null;
  }

  if (node.kind === "group") {
    // A group is a terminal slot keyed by its active member — the split path ends
    // here (a group has no internal split axis); inactive members are not rendered.
    return node.activeMemberId === leafId ? currentPath : null;
  }

  const nextPath: ReadonlyArray<DynamicSplitPathEntry> = [
    ...currentPath,
    {
      splitId: node.id,
      axis: node.axis,
    },
  ];
  return (
    readSplitPathToLeaf(node.first, leafId, nextPath) ??
    readSplitPathToLeaf(node.second, leafId, nextPath)
  );
}

export function resolveLeafDropPreview(
  leafId: string,
  dragSourceLeafId: string | null,
  dropState: DynamicDropState | null,
): DynamicLeafDropPreview | null {
  if (
    dragSourceLeafId == null ||
    dropState == null ||
    dropState.leafId === dragSourceLeafId
  ) {
    return null;
  }
  if (dropState.action !== "swap" && dropState.action !== "edge-insert") {
    return null;
  }

  if (dropState.zone === "center") {
    if (leafId === dragSourceLeafId) {
      return {
        role: "drag-source-landing-shadow",
        mode: "swap",
        zone: "center",
        partnerLeafId: dropState.leafId,
      };
    }
    if (leafId === dropState.leafId) {
      return {
        role: "drop-target-result-shadow",
        mode: "swap",
        zone: "center",
        partnerLeafId: dragSourceLeafId,
      };
    }
    return null;
  }

  if (leafId === dragSourceLeafId) {
    return {
      role: "drag-source-landing-shadow",
      mode: "edge-insert",
      zone: dropState.zone,
      partnerLeafId: dropState.leafId,
    };
  }
  if (leafId === dropState.leafId) {
    return {
      role: "drop-target-result-shadow",
      mode: "edge-insert",
      zone: dropState.zone,
      partnerLeafId: dragSourceLeafId,
    };
  }

  return null;
}

/**
 * Live-mode gate for the per-tile in-tile drop-preview shadow (System B). In live
 * (Hyprland) drag mode the destination shows NO result shadow — only the floating
 * ghost over the gap-closed frozen tree — so the per-tile preview is suppressed.
 * In preview mode the result shadow is the intended feedback, so the pure
 * `resolveLeafDropPreview` value passes through. Mirrors the System A gate shape
 * (`showProjectedLandingOverlays = showDropPreviewOverlays && !liveDragModeEnabled`)
 * and keeps `resolveLeafDropPreview` a pure preview-mode function.
 */
export function resolveLeafDropPreviewForMode(
  liveDragModeEnabled: boolean,
  leafId: string,
  dragSourceLeafId: string | null,
  dropState: DynamicDropState | null,
): DynamicLeafDropPreview | null {
  if (liveDragModeEnabled) {
    return null;
  }
  return resolveLeafDropPreview(leafId, dragSourceLeafId, dropState);
}

export {
  isDragPresentationActive,
  resolveDragPresentation,
  resolveInitialPaneContentVisible,
  resolvePaneBodyRenderMode,
} from "./drag-presentation";

type DynamicSplitDividerRenderMode =
  | "render-divider-absent"
  | "render-divider-enabled-visible"
  | "render-divider-enabled-hidden"
  | "render-divider-disabled-visible"
  | "render-divider-disabled-hidden";

interface DynamicSplitDividerRenderPolicyInput {
  isBoundaryResizable: boolean;
  resizeHandlesVisible: boolean;
  isResizeAxisEnabled: boolean;
}

/**
 * Canonical split-divider policy. Boundary-resizable decides whether a divider
 * hit-target exists at all; resize capability decides interactivity; handle
 * visibility decides divider chrome only.
 */
export function resolveSplitDividerRenderMode(
  input: DynamicSplitDividerRenderPolicyInput,
): DynamicSplitDividerRenderMode {
  if (!input.isBoundaryResizable) {
    return "render-divider-absent";
  }
  if (input.isResizeAxisEnabled) {
    return input.resizeHandlesVisible
      ? "render-divider-enabled-visible"
      : "render-divider-enabled-hidden";
  }
  return input.resizeHandlesVisible
    ? "render-divider-disabled-visible"
    : "render-divider-disabled-hidden";
}

/**
 * Pure resolver for the DISPLAYED layout tree under the live (Hyprland) drag
 * model. While a live drag is in flight — `liveDragModeEnabled` AND a
 * `dragSourceLeafId` is held — the source leaf is detached once and the tree
 * reflows to close the gap (`removeLeafTile`). Otherwise — and CRUCIALLY once the
 * drag state is cleared on drag-end / cancel / aborted drop — this returns the
 * original `layout`, so the gap restores instead of parking the frozen
 * gap-closed tree. A root-leaf source has no parent to collapse, so the original
 * tree is kept (the detach is a no-op). Extracted as a pure function so the
 * "cleared drag state ⇒ original tree" invariant is unit-testable without a DOM.
 */
export function resolveLiveDisplayLayout(
  liveDragModeEnabled: boolean,
  dragSourceLeafId: string | null,
  layout: DynamicLayoutNode,
): DynamicLayoutNode {
  if (!liveDragModeEnabled || dragSourceLeafId == null) {
    return layout;
  }
  const frozen: DynamicLayoutNode = removeLeafTile(layout, dragSourceLeafId);
  return frozen === layout ? layout : frozen;
}

/**
 * STABLE-REFERENCE hit-test geometry for live-drag target resolution. Drop
 * targets are resolved against THIS frozen pane geometry, NEVER against the
 * displayed candidate tree's reflowing rects. The result is a pure function of
 * (`layout`, `sourceLeafId`, viewport, `config`) — none of which change while a
 * drag is in flight — so it is computed once per drag and stays constant as the
 * cursor moves. This is the structural break of the reflow→retarget→re-reflow
 * feedback loop (the "losing the mouse" / flicker oscillation): because the
 * geometry is independent of the resolved target, candidate-tree reflow can
 * never move a drop zone under the cursor and flip the target.
 *
 * In live mode the base is the gap-closed tree (`removeLeafTile`): the source is
 * detached once on pickup, so the surviving panes' frozen rects match what the
 * user sees beneath the floating ghost when no target is yet resolved — a closer
 * visual/hit correspondence than the raw pre-pickup rects (where the source slot
 * is still occupied). In preview mode the tree never detaches, so the original
 * footprints are the stable reference. Either way the geometry is frozen for the
 * whole drag. Extracted as a pure function so the "independent of candidate
 * reflow" invariant is unit-testable without a DOM.
 */
export function resolveStableDragHitFootprints(
  liveDragModeEnabled: boolean,
  layout: DynamicLayoutNode,
  dragSourceLeafId: string | null,
  viewport: { width: number; height: number },
  config: DynamicLayoutConfig,
  originalFootprints: ReadonlyMap<string, DynamicPaneFootprint>,
): ReadonlyMap<string, DynamicPaneFootprint> {
  if (!liveDragModeEnabled || dragSourceLeafId == null) {
    return originalFootprints;
  }
  const gapClosed: DynamicLayoutNode = removeLeafTile(layout, dragSourceLeafId);
  return footprintsByLeafId(
    collectLeafFootprints(
      gapClosed,
      0,
      0,
      viewport.width,
      viewport.height,
      config,
    ),
  );
}

export function buildDragPaneSnapshot(
  tile: DynamicTile,
): DynamicDragPaneSnapshot {
  // Snapshot always comes from canonical tile payload, never from visibility
  // presentation state (`render-empty` / `render-reservation`). Whether the
  // ghost actually paints this captured content is decided later by the uniform
  // CONTENT rule in `renderDragPaneShell`.
  return {
    tileId: tile.id,
    title: tile.title,
    description: tile.description ?? null,
    content: tile.content ?? null,
    rows: (tile.rows ?? []).slice(0, DRAG_PANE_PREVIEW_MAX_ROWS),
    accent: tile.accent ?? "cyan",
  };
}

export function renderDragPaneShell(
  snapshot: DynamicDragPaneSnapshot,
  theme: TilingTheme,
  isPaneContentVisible: boolean,
): React.ReactElement {
  // The ghost is just another representation of a pane, so its body obeys the
  // SAME content rule as an in-tree pane body: content visible → paint content;
  // content hidden → empty body, frame + header chrome preserved. No
  // drag-specific branch — `resolvePaneBodyRenderMode(false, …)` because the
  // ghost is the single painted instance, never a ghost-seat reservation.
  const shouldRenderGhostContent: boolean =
    resolvePaneBodyRenderMode(false, isPaneContentVisible) === "render-content";
  return (
    <article
      className={cn(
        // Lifted ghost: the active theme's ghost surface tokens (a touch more
        // opaque + deeper shadow than a resting pane) tinted with the dragged
        // pane's accent. Rendered through a document.body portal
        // (position:fixed), so any backdrop-filter here never contains it.
        theme.ghost.surface,
        theme.resolvePaneAccentSurface(snapshot.accent),
        // Focus follows the dragged pane: the floating ghost wears the SAME
        // focus frame the focused pane wears at rest, so the single focus
        // affordance travels with the pane being dragged (and the pane ends the
        // drop already focused).
        theme.resolveFocusFrame(snapshot.accent),
      )}
      aria-hidden
    >
      <header className={theme.ghost.header}>
        <div className="min-w-0">
          <div
            className={cn(
              "truncate font-mono text-[11px] font-semibold uppercase tracking-[0.2em]",
              theme.resolveAccentText(snapshot.accent),
            )}
          >
            {snapshot.title}
          </div>
          <div
            className={cn(
              "truncate font-mono text-[9px] uppercase tracking-[0.16em]",
              theme.ghost.subtitleText,
            )}
          >
            {snapshot.description ?? "drag header to swap"}
          </div>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
          tile
        </div>
      </header>

      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 font-mono text-[11px] leading-5",
          theme.ghost.bodyText,
        )}
      >
        {shouldRenderGhostContent
          ? snapshot.content != null
            ? snapshot.content
            : snapshot.rows.map(
                (row: string, rowIndex: number): React.ReactElement => (
                  <div
                    key={`${snapshot.tileId}-drag-row-${rowIndex}`}
                    className="whitespace-pre-wrap break-words"
                  >
                    {row}
                  </div>
                ),
              )
          : null}
      </div>
    </article>
  );
}

/**
 * The picked-up source leaf's destination slot in live mode, painted as a
 * content-less RESERVATION (never the source content) so the dragged pane is
 * painted in exactly ONE place — the ghost (`DragPaneOverlay`), which HOPS INTO
 * and FILLS this reservation's measured rect. The candidate tree still opens
 * this slot (survivors physically reflow to make room), and the reservation
 * carries only a faint accent tint so that during the brief hop-in flight it
 * reads as "lands here" rather than an empty hole — it is fully covered once the
 * ghost seats. `data-drag-source-reservation` + the leaf's `data-leaf-id` are
 * the measurement hooks the seat-rect effect reads. NO title / rows here, so the
 * source content (the single-instance invariant) lives only in the ghost.
 */
export function DragSourceSlotReservation({
  theme,
  accent,
  observabilityColors,
  observabilityColorEnables,
}: {
  theme: TilingTheme;
  accent: DynamicTileAccent | undefined;
  observabilityColors: DynamicObservabilityColorConfig;
  observabilityColorEnables: DynamicObservabilityColorEnableConfig;
}): React.ReactElement | null {
  // The seat the single ghost hops into is the dragged pane's landing slot, so
  // it wears the SAME focus frame the ghost carries (accent = the DRAGGED pane's
  // accent). Focus thus reads as already living at the destination during the
  // brief hop-in flight, before the ghost fully covers the seat.
  const seatFocusFrame: string = theme.resolveFocusFrame(accent);
  if (!observabilityColorEnables.dragSourceBorderEnabled) {
    return (
      <div
        className={cn(
          "h-full min-h-0 w-full min-w-0 overflow-hidden rounded-xl",
          seatFocusFrame,
        )}
        data-drag-source-reservation
        aria-hidden
      />
    );
  }
  const slotFillColor: string = rgbaFromHex(
    observabilityColors.dragSourceBorderColorHex,
    0.06,
    [240, 171, 252],
  );
  return (
    <div
      className={cn(
        "h-full min-h-0 w-full min-w-0 overflow-hidden rounded-xl",
        seatFocusFrame,
      )}
      style={{ backgroundColor: slotFillColor }}
      data-drag-source-reservation
      aria-hidden
    />
  );
}

/**
 * Resolves the stacking-context-free anchor (`document.body`) for the
 * `position: fixed` drag overlays. ALL of the drag overlays (ghost, custom
 * cursor, cancel fly-back) place themselves with WINDOW-relative client
 * coordinates derived from `getBoundingClientRect()` (the seat is measured the
 * same way). `position: fixed` only resolves against the window when NO ancestor
 * establishes a containing block for fixed descendants — and `transform` /
 * `filter` / `backdrop-filter` / `perspective` / `will-change` of those /
 * `contain: paint|layout|strict|content` all silently do. Because this renderer
 * is a published library mounted inside arbitrary host chrome (and the showcase
 * shell + pane shells + tab strip already use `backdrop-blur`), pinning the
 * overlays' fixed coordinates to the document root via a portal makes them
 * immune to ANY ancestor reference frame: a future chrome rework that adds a
 * containing-block property to any ancestor can never reintroduce the
 * ghost↔seat constant-offset drift.
 *
 * SSR-safe: the lazy `useState` initializer reads `document.body` only on the
 * client (guarded by `typeof document`), so server render yields `null` and
 * mounts nothing. The overlays only ever render during an active (user-driven,
 * post-hydration) drag, by which point the container is `document.body` on the
 * first render — no extra commit, no pickup-frame flicker.
 */
function useOverlayPortalContainer(): HTMLElement | null {
  const [container] = React.useState<HTMLElement | null>(
    (): HTMLElement | null =>
      typeof document === "undefined" ? null : document.body,
  );
  return container;
}

/**
 * Renders the fixed-coordinate drag overlays through a portal to
 * `document.body` so their `position: fixed` placement is always window-relative
 * (see `useOverlayPortalContainer`). The portal preserves the React subtree
 * (state, refs, layout effects, context) of the overlay component — only the
 * DOM node is relocated — so the ghost's FLIP refs / `getBoundingClientRect`
 * reads and the reactive `dragVisualState` updates are unchanged; they now just
 * resolve against the document root instead of the (potentially transformed)
 * viewport ancestor. Returns `null` when there is no container (SSR only), at
 * which point the overlays are inactive anyway.
 */
function OverlayPortal({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement | null {
  const container: HTMLElement | null = useOverlayPortalContainer();
  if (container == null) {
    return null;
  }
  return createPortal(children, container);
}

/**
 * The SINGLE painted instance of the dragged pane. It free-follows the cursor
 * (instant, no lag) when no slot is resolved, and HOPS INTO and FILLS the
 * resolved slot when `seatFootprint` is set: the same node's base rect becomes
 * the measured slot rect and a FLIP `transform` animation glides it from where
 * it was (cursor) into the slot. Animating `transform` only (GPU-composited,
 * no layout); the node is `position: fixed` (out of flow) so it never reflows
 * the tree and never exists twice. FLIP `First` is read from the LIVE
 * `getBoundingClientRect` so an interrupted/re-seated hop retargets smoothly
 * from wherever the ghost currently is.
 */
function DragPaneOverlay({
  dragVisualState,
  dragHopDurationMs,
  hopEasing,
  pickupScaleFactor,
  coherentDipActive,
  swapBounceMagnitude,
  prefersReducedMotion,
  isPaneContentVisible,
  frameDeadlineMs,
}: {
  dragVisualState: DynamicDragVisualState | null;
  dragHopDurationMs: number;
  hopEasing: string;
  pickupScaleFactor: number;
  coherentDipActive: boolean;
  swapBounceMagnitude: number;
  prefersReducedMotion: boolean;
  isPaneContentVisible: boolean;
  /**
   * M1 rAF-fallback slack (ms). The FLIP "play-to-identity" arm races
   * `requestAnimationFrame` against a `setTimeout` of this long, first-wins +
   * idempotent, so a starved compositor frame never strands the ghost at its
   * inverted `First`. From `interaction.dragRecovery.frameDeadlineMs`.
   */
  frameDeadlineMs: number;
}): React.ReactElement | null {
  const theme: TilingTheme = useTilingTheme();
  const nodeRef = React.useRef<HTMLDivElement | null>(null);
  // The in-flight "play-to-identity" arm — an M1 raced (rAF-or-timeout) handle
  // rather than a bare rAF id, so a starved frame cannot freeze the ghost.
  const rafRef = React.useRef<RacedFrameHandle | null>(null);
  const animationRef = React.useRef<Animation | null>(null);
  // The node's resting box (Last), kept fresh every render so the morph effect
  // (which is keyed off morph TRIGGERS, not cursor position) reads the current
  // box without re-running on a position-only move.
  const baseRectRef = React.useRef<GhostRect | null>(null);
  // The base rect the ghost was painted at in the PREVIOUS commit — the FLIP
  // `First` for the next hop at rest. React applies the new base (the slot) to
  // the node's inline `left`/`top` BEFORE the morph layout effect runs, so a
  // live `getBoundingClientRect()` inside the effect already reads the new base;
  // this ref preserves the prior-frame box (the cursor box on a follow→seat
  // hop-in) so the hop has a non-zero invert and the resolved duration takes
  // effect. Recorded every render by the layout effect declared after the morph
  // effect (so the morph effect reads the prior value before it is overwritten).
  const previousRenderedRectRef = React.useRef<GhostRect | null>(null);
  // Whether the pickup entrance has played + whether the prior render was seated
  // — the two transition detectors that distinguish entrance / hop-in / hop-out.
  const hasEnteredRef = React.useRef<boolean>(false);
  const prevSeatedRef = React.useRef<boolean>(false);

  const seated: boolean = dragVisualState?.seatFootprint != null;
  // Under reduced motion the pickup shrink is skipped (full source size).
  const effectiveFactor: number = prefersReducedMotion ? 1 : pickupScaleFactor;
  const grab: GhostPoint = {
    x: dragVisualState?.pointerAnchorOffsetX ?? 0,
    y: dragVisualState?.pointerAnchorOffsetY ?? 0,
  };
  // baseRect = the resting rendered box: the measured slot when seated, else the
  // grab-anchored pickup-scaled source box (cursor-tracking, instant).
  const baseRect: GhostRect | null =
    dragVisualState == null
      ? null
      : (dragVisualState.seatFootprint ??
        deriveGhostPickupBox(
          dragVisualState.activeFootprint,
          grab,
          effectiveFactor,
        ));
  baseRectRef.current = baseRect;

  const seatFootprint: DynamicPaneFootprint | null =
    dragVisualState?.seatFootprint ?? null;
  // Morph-trigger key: changes on seat open/close + re-seat, NOT on a free-follow
  // cursor move, so steady free-follow never re-runs the morph effect.
  const seatKey: string =
    seatFootprint == null
      ? "free"
      : `${seatFootprint.left},${seatFootprint.top},${seatFootprint.width},${seatFootprint.height}`;
  const srcWidth: number = dragVisualState?.sourceFootprint.width ?? 0;
  const srcHeight: number = dragVisualState?.sourceFootprint.height ?? 0;
  const hasVisual: boolean = dragVisualState != null;

  React.useLayoutEffect((): (() => void) | void => {
    const node: HTMLDivElement | null = nodeRef.current;
    const last: GhostRect | null = baseRectRef.current;
    if (node == null || last == null || dragVisualState == null) {
      return;
    }
    const justEntered: boolean = !hasEnteredRef.current;
    hasEnteredRef.current = true;
    prevSeatedRef.current = seated;

    // Captured BEFORE cancelInFlight() — cancelling a WAAPI dip resets the
    // node transform, so the live box would no longer reflect the mid-morph
    // position. A live (transformed) box is the correct FLIP `First` only while
    // a hop is mid-flight (smooth retarget); at rest the live box already equals
    // the freshly-applied base (`last`), which would zero the invert.
    const hadInFlightTransform: boolean =
      rafRef.current != null || animationRef.current != null;

    const cancelInFlight = (): void => {
      if (rafRef.current != null) {
        rafRef.current.cancel();
        rafRef.current = null;
      }
      if (animationRef.current != null) {
        animationRef.current.cancel();
        animationRef.current = null;
      }
    };
    cancelInFlight();
    node.style.transformOrigin = "top left";

    // Reduced motion: instant placement, no morph / pickup / dip / magnet.
    if (prefersReducedMotion) {
      node.style.transition = "none";
      node.style.transform = "none";
      return;
    }

    // FLIP `First` resolution. Three cases:
    //  - pickup ENTRANCE: First is the source's FULL bbox so the shrink-to-pickup
    //    is visible on the first frame.
    //  - mid-flight hop (re-seat / retarget): First is the ghost's LIVE box so
    //    the new hop picks up from the current animated position.
    //  - hop at rest (free→seat, seat→free): React has already written the new
    //    base to the node's inline left/top, so the live box equals `last` and
    //    would zero the invert — use the PRIOR commit's rendered base instead so
    //    the hop has a real distance to travel and `dragHopDurationMs` is honored.
    const live: DOMRect = node.getBoundingClientRect();
    const liveRect: GhostRect = {
      left: live.left,
      top: live.top,
      width: live.width,
      height: live.height,
    };
    const first: GhostRect =
      justEntered && !seated
        ? {
            left: dragVisualState.activeFootprint.left,
            top: dragVisualState.activeFootprint.top,
            width: dragVisualState.activeFootprint.width,
            height: dragVisualState.activeFootprint.height,
          }
        : resolveGhostHopFirstRect({
            previousBaseRect: previousRenderedRectRef.current,
            liveVisualRect: liveRect,
            hasInFlightTransform: hadInFlightTransform,
          });

    if (isDegenerateGhostRect(first) || isDegenerateGhostRect(last)) {
      node.style.transition = "none";
      node.style.transform = "none";
      return;
    }
    const invert: GhostMorphTransform | null = deriveGhostMorphTransform(
      first,
      last,
    );
    if (invert == null) {
      node.style.transition = "none";
      node.style.transform = "none";
      return;
    }

    // Coherent non-intersecting transit (swap): keyframed morph with the
    // mid-transit dip so the ghost + the displaced survivor never collide.
    if (coherentDipActive && seated) {
      node.style.transition = "none";
      node.style.transform = `translate(${invert.tx}px, ${invert.ty}px) scale(${invert.sx}, ${invert.sy})`;
      void node.getBoundingClientRect();
      const keyframes: Keyframe[] = buildCoherentDipKeyframes(
        invert,
        last.width,
        last.height,
      );
      const animation: Animation = node.animate(keyframes, {
        duration: dragHopDurationMs,
        easing: "linear",
        fill: "none",
      });
      animationRef.current = animation;
      animation.onfinish = (): void => {
        // Route the dip finish-pin through the idempotent M4 teardown so a
        // cancelled-mid-flight dip (fill:none reverts to the inverted base)
        // never strands the ghost at an offset.
        stripTransientDragStyles({ ghost: node, leaves: [] });
        if (animationRef.current === animation) {
          animationRef.current = null;
        }
      };
      return (): void => {
        cancelInFlight();
      };
    }

    // Standard transform-only FLIP: on the seated hop-in (the "click into the
    // slot") a dialed-in bounce magnitude substitutes an easeOutBack overshoot
    // for the magnetic ease (the swap-target/ghost landing bounce); magnitude 0
    // keeps the historical magnetic snap. Free-follow / hop-out / entrance keep
    // the standard hop easing. Invert → play to identity on the next frame.
    const seatedEasing: string =
      swapBounceMagnitude > 0
        ? buildBounceEasingCss(swapBounceMagnitude)
        : GHOST_MAGNETIC_HOP_EASING;
    const easing: string = seated ? seatedEasing : hopEasing;
    node.style.transition = "none";
    node.style.transform = `translate(${invert.tx}px, ${invert.ty}px) scale(${invert.sx}, ${invert.sy})`;
    void node.getBoundingClientRect();
    // M1: race the play-to-identity write against a timeout so a starved frame
    // (background-tab rAF suspension / CPU throttle) still writes the transition
    // — the ghost can never freeze at its inverted First.
    rafRef.current = scheduleFrameOrTimeout(
      WINDOW_FRAME_OR_TIMEOUT_SCHEDULER,
      frameDeadlineMs,
      (): void => {
        node.style.transition = `transform ${dragHopDurationMs}ms ${easing}`;
        node.style.transform = "none";
      },
    );
    return (): void => {
      cancelInFlight();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    seated,
    seatKey,
    effectiveFactor,
    srcWidth,
    srcHeight,
    dragHopDurationMs,
    hopEasing,
    coherentDipActive,
    swapBounceMagnitude,
    prefersReducedMotion,
    hasVisual,
    frameDeadlineMs,
  ]);

  // Record the base rect painted THIS commit as the FLIP `First` for the next
  // hop. Runs every commit (including steady free-follow, where the morph effect
  // is skipped) so the prior-frame box is always current; declared after the
  // morph effect so that effect reads the PRIOR value before it is overwritten.
  React.useLayoutEffect((): void => {
    previousRenderedRectRef.current = baseRectRef.current;
  });

  if (dragVisualState == null || baseRect == null) {
    return null;
  }

  // Elevation cue: the free-following (lifted) ghost reads as floating — deeper
  // drop-shadow + slightly lower opacity than the seated/at-rest look. Dropped
  // under reduced motion (no transition, settled look).
  const lifted: boolean = !seated && !prefersReducedMotion;
  return (
    <OverlayPortal>
      <div
        ref={nodeRef}
        className="pointer-events-none fixed left-0 top-0"
        style={{
          left: baseRect.left,
          top: baseRect.top,
          width: baseRect.width,
          height: baseRect.height,
          zIndex: DRAG_PANE_OVERLAY_Z_INDEX,
        }}
        data-drag-ghost
        aria-hidden
      >
        <div
          className={cn(
            "h-full w-full scale-[1.01]",
            lifted
              ? "opacity-90 shadow-[0_30px_60px_rgba(2,6,23,0.72)]"
              : "opacity-95 shadow-[0_22px_44px_rgba(2,6,23,0.62)]",
            prefersReducedMotion
              ? ""
              : "transition-[opacity,box-shadow] duration-150",
          )}
        >
          {renderDragPaneShell(
            dragVisualState.snapshot,
            theme,
            isPaneContentVisible,
          )}
        </div>
      </div>
    </OverlayPortal>
  );
}

/**
 * Tracks `(prefers-reduced-motion: reduce)`. The custom drag cursor reads this
 * to drop its scale/opacity pickup transition (keeping the static semantic
 * indicator) per the reduced-motion accessibility contract. SSR-safe: starts
 * `false` and reconciles on mount via `matchMedia`.
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] =
    React.useState<boolean>(false);
  React.useEffect((): (() => void) | void => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const query: MediaQueryList = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    setPrefersReducedMotion(query.matches);
    const handleChange = (event: MediaQueryListEvent): void => {
      setPrefersReducedMotion(event.matches);
    };
    query.addEventListener("change", handleChange);
    return (): void => {
      query.removeEventListener("change", handleChange);
    };
  }, []);
  return prefersReducedMotion;
}

/** Tailwind tone classes for the cursor badge, keyed on drop validity. */
function dragCursorToneClassName(tone: DragCursorPresentation["tone"]): string {
  if (tone === "valid") {
    return "border-cyan-300/80 bg-cyan-500/20 text-cyan-100 shadow-[0_0_14px_rgba(34,211,238,0.55)]";
  }
  if (tone === "invalid") {
    return "border-rose-400/80 bg-rose-500/20 text-rose-100 shadow-[0_0_14px_rgba(244,63,94,0.5)]";
  }
  return "border-slate-300/70 bg-slate-900/70 text-slate-100 shadow-[0_4px_12px_rgba(2,6,23,0.55)]";
}

/**
 * The semantic glyph the cursor badge renders per kind. NO rotation / direction:
 * - `insert` — a target ring with a center dot ("release to drop into the found
 *   slot"); the slot itself already shows the direction.
 * - `swap` — a two-way exchange indicator (a different operation from insert).
 * - `invalid` — a `not-allowed` circle-with-slash.
 * - `grab` — a neutral drag-grip (the free-drag "carrying" look).
 */
function DragCursorGlyph({
  kind,
}: {
  kind: DragCursorPresentation["kind"];
}): React.ReactElement {
  if (kind === "insert") {
    return (
      <svg
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden
      >
        <circle cx="8" cy="8" r="5.5" />
        <circle cx="8" cy="8" r="1.8" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (kind === "swap") {
    return (
      <svg
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 6 H11 M11 6 L8.5 3.5 M11 6 L8.5 8.5" />
        <path d="M13 10 H5 M5 10 L7.5 7.5 M5 10 L7.5 12.5" />
      </svg>
    );
  }
  if (kind === "invalid") {
    return (
      <svg
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden
      >
        <circle cx="8" cy="8" r="5.5" />
        <path d="M4.1 4.1 L11.9 11.9" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3 w-3"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="5" cy="5" r="1.3" />
      <circle cx="11" cy="5" r="1.3" />
      <circle cx="5" cy="8" r="1.3" />
      <circle cx="11" cy="8" r="1.3" />
      <circle cx="5" cy="11" r="1.3" />
      <circle cx="11" cy="11" r="1.3" />
    </svg>
  );
}

/**
 * The custom-rendered drag cursor (interaction tier "c"). A single
 * `position: fixed`, `pointer-events-none` sibling of the ghost overlay that
 * REPLACES the OS cursor during an active live drag (the renderer sets
 * `cursor: none` on the root). It is transform-pinned to the pointer using the
 * SAME `dragVisualState` the ghost reads — derived in the renderer's coalesced
 * rAF/render path — so it updates in the identical React commit as the ghost and
 * never lags the hardware cursor (the pin transform is applied inline per render,
 * with NO transition and NO second rAF loop).
 *
 * Appearance is driven by `presentation` (from `resolveDragCursorPresentation`):
 * a neutral grip when free-following, a "drop here" target ring on a valid
 * edge-insert, an exchange indicator on a valid swap, and a `not-allowed`
 * indicator over a blocked target — SEMANTIC states, never a rotating direction
 * arrow (the found slot already shows direction). The pickup scale/opacity
 * entrance reuses the ghost's `DRAG_HOP_EASING` + `dragHopDurationMs` so the
 * cursor shares the motion language; it is dropped under `prefers-reduced-motion`
 * (static indicator only). The pinned point is clamped to the viewport so the
 * badge stays visible at the edges, mirroring the ghost's off-viewport clamp.
 */
function DragCursorOverlay({
  dragVisualState,
  presentation,
  dragHopDurationMs,
  hopEasing,
  prefersReducedMotion,
}: {
  dragVisualState: DynamicDragVisualState | null;
  presentation: DragCursorPresentation;
  dragHopDurationMs: number;
  hopEasing: string;
  prefersReducedMotion: boolean;
}): React.ReactElement | null {
  const [entered, setEntered] = React.useState<boolean>(false);

  // The pickup scale/opacity entrance plays ONCE when the cursor appears. It is
  // keyed on the STABLE "is a drag active" boolean — NOT on the `dragVisualState`
  // object, which the renderer re-creates every coalesced frame (per pointer
  // move). Keying on the object made this effect re-run on every move (and every
  // cursor-type transition, which is itself a move): the cleanup reset
  // `entered → false` and the body re-scheduled the rAF `entered → true`, so the
  // `dragHopDurationMs` transform/opacity transition RE-PLAYED on each frame. The
  // badge never settled at opacity 1 while moving and re-faded on every
  // grab→insert→swap→invalid transition — the observed "appears with a lag, same
  // lag on each transition". Mirrors `DragPaneOverlay`'s `hasVisual`-keyed entrance.
  const isActive: boolean = dragVisualState != null;
  React.useEffect((): (() => void) | void => {
    if (!isActive || prefersReducedMotion) {
      setEntered(isActive);
      return;
    }
    const frame: number = window.requestAnimationFrame((): void => {
      setEntered(true);
    });
    return (): void => {
      window.cancelAnimationFrame(frame);
      setEntered(false);
    };
  }, [isActive, prefersReducedMotion]);

  if (dragVisualState == null) {
    return null;
  }

  const pointerX: number =
    dragVisualState.activeFootprint.left + dragVisualState.pointerAnchorOffsetX;
  const pointerY: number =
    dragVisualState.activeFootprint.top + dragVisualState.pointerAnchorOffsetY;
  const viewportWidth: number =
    typeof window === "undefined" ? 0 : window.innerWidth;
  const viewportHeight: number =
    typeof window === "undefined" ? 0 : window.innerHeight;
  const point: DragCursorPoint = clampCursorPointToViewport(
    { x: pointerX, y: pointerY },
    { left: 0, top: 0, right: viewportWidth, bottom: viewportHeight },
    DRAG_CURSOR_BADGE_SIZE_PX / 2,
  );

  const badgeScale: number = entered ? 1 : 0.84;
  const badgeOpacity: number = entered ? 1 : 0;
  const badgeTransition: string = prefersReducedMotion
    ? "none"
    : `transform ${dragHopDurationMs}ms ${hopEasing}, opacity ${dragHopDurationMs}ms ${hopEasing}`;

  return (
    <OverlayPortal>
      <div
        className="pointer-events-none fixed left-0 top-0"
        style={{
          transform: `translate3d(${point.x}px, ${point.y}px, 0)`,
          zIndex: DRAG_CURSOR_OVERLAY_Z_INDEX,
        }}
        data-drag-cursor
        data-drag-cursor-kind={presentation.kind}
        aria-hidden
      >
        <div
          className={cn(
            "flex items-center justify-center rounded-full border backdrop-blur-[1px]",
            dragCursorToneClassName(presentation.tone),
          )}
          style={{
            width: DRAG_CURSOR_BADGE_SIZE_PX,
            height: DRAG_CURSOR_BADGE_SIZE_PX,
            transform: `translate(-50%, -50%) scale(${badgeScale})`,
            opacity: badgeOpacity,
            transition: badgeTransition,
          }}
        >
          <DragCursorGlyph kind={presentation.kind} />
        </div>
      </div>
    </OverlayPortal>
  );
}

function DragCancelOverlay({
  cancelVisualState,
  isPaneContentVisible,
}: {
  cancelVisualState: DynamicDragCancelVisualState | null;
  isPaneContentVisible: boolean;
}): React.ReactElement | null {
  const theme: TilingTheme = useTilingTheme();
  const [isAnimating, setIsAnimating] = React.useState<boolean>(false);

  React.useEffect((): (() => void) | void => {
    if (cancelVisualState == null) {
      setIsAnimating(false);
      return;
    }

    const frameRequest: number = window.requestAnimationFrame((): void => {
      setIsAnimating(true);
    });

    return (): void => {
      window.cancelAnimationFrame(frameRequest);
    };
  }, [cancelVisualState]);

  if (cancelVisualState == null) {
    return null;
  }

  return (
    <OverlayPortal>
      <div
        className="pointer-events-none fixed left-0 top-0"
        style={{
          left: isAnimating
            ? cancelVisualState.toFootprint.left
            : cancelVisualState.fromFootprint.left,
          top: isAnimating
            ? cancelVisualState.toFootprint.top
            : cancelVisualState.fromFootprint.top,
          width: isAnimating
            ? cancelVisualState.toFootprint.width
            : cancelVisualState.fromFootprint.width,
          height: isAnimating
            ? cancelVisualState.toFootprint.height
            : cancelVisualState.fromFootprint.height,
          opacity: isAnimating ? 0.16 : 0.7,
          transitionProperty: "left, top, width, height, opacity",
          transitionDuration: `${DRAG_CANCEL_ANIMATION_MS}ms`,
          transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
          zIndex: DRAG_CANCEL_OVERLAY_Z_INDEX,
        }}
        aria-hidden
      >
        <div className="h-full w-full shadow-[0_18px_34px_rgba(2,6,23,0.5)]">
          {renderDragPaneShell(
            cancelVisualState.snapshot,
            theme,
            isPaneContentVisible,
          )}
        </div>
      </div>
    </OverlayPortal>
  );
}

function edgeZoneClipPathStyle(
  zone: DynamicEdgeZone,
  centerRatioX: number,
  centerRatioY: number,
): React.CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    clipPath: paneZoneClipPaths(centerRatioX, centerRatioY)[zone],
  };
}

function centerZoneInsetStyle(
  centerRatioX: number,
  centerRatioY: number,
): React.CSSProperties {
  const inset: { x: number; y: number } = paneZoneCenterInsetPercent(
    centerRatioX,
    centerRatioY,
  );
  return {
    position: "absolute",
    left: `${inset.x}%`,
    right: `${inset.x}%`,
    top: `${inset.y}%`,
    bottom: `${inset.y}%`,
  };
}

function PaneHitZoneOverlay({
  paneHitZoneDebug,
  paneHitZonesAlpha,
  showDropIntentDebug,
  observabilityColors,
}: {
  paneHitZoneDebug: DynamicPaneHitZoneOverlayDebugState;
  paneHitZonesAlpha: number;
  showDropIntentDebug: boolean;
  observabilityColors: DynamicObservabilityColorConfig;
}): React.ReactElement {
  const centerRatio: number = paneHitZoneDebug.centerRatio;
  const centerRatioX: number = paneHitZoneDebug.centerRatioX;
  const centerRatioY: number = paneHitZoneDebug.centerRatioY;
  const edgeCandidateByZone: ReadonlyMap<
    DynamicEdgeZone,
    DynamicPaneHitZoneCandidateDebugState
  > = new Map(
    paneHitZoneDebug.edgeCandidates.map(
      (
        candidate: DynamicPaneHitZoneCandidateDebugState,
      ): [DynamicEdgeZone, DynamicPaneHitZoneCandidateDebugState] => [
        candidate.zone,
        candidate,
      ],
    ),
  );
  const centerColorHex: string = paneHitZoneDebug.centerIsValid
    ? observabilityColors.hitZoneCenterColorHex
    : observabilityColors.hitZoneBlockedColorHex;
  return (
    <div className="pointer-events-none absolute inset-0 z-[9] p-1" aria-hidden>
      <div className="relative h-full w-full overflow-hidden rounded-lg border border-white/15 bg-black/10">
        {DROP_EDGE_ZONE_PAINT_ORDER.map(
          (zone: DynamicEdgeZone): React.ReactElement => {
            const edgeCandidate:
              | DynamicPaneHitZoneCandidateDebugState
              | undefined = edgeCandidateByZone.get(zone);
            const isValid: boolean = edgeCandidate?.isValid ?? true;
            const edgeColorHex: string = resolveHitZoneColorHex(
              zone,
              isValid,
              observabilityColors,
            );
            return (
              <div
                key={`zone-${zone}`}
                style={{
                  ...edgeZoneClipPathStyle(zone, centerRatioX, centerRatioY),
                  backgroundColor: rgbaFromHex(
                    edgeColorHex,
                    paneHitZonesAlpha,
                    [14, 165, 233],
                  ),
                }}
                title={edgeCandidate?.rejectionReason ?? `${zone} valid`}
              >
                <div
                  className={cn(
                    edgeZoneLabelPositionClassName(zone),
                    "rounded border border-black/30 bg-black/45 px-1 font-mono text-[8px] uppercase tracking-[0.12em] text-white",
                  )}
                >
                  {edgeZoneShortLabel(zone)} {isValid ? "ok" : "blocked"}
                </div>
              </div>
            );
          },
        )}
        <div
          className="rounded-md border"
          style={{
            ...centerZoneInsetStyle(centerRatioX, centerRatioY),
            borderColor: rgbaFromHex(
              centerColorHex,
              Math.min(1, paneHitZonesAlpha + 0.55),
              [16, 185, 129],
            ),
            backgroundColor: rgbaFromHex(
              centerColorHex,
              paneHitZonesAlpha,
              [16, 185, 129],
            ),
          }}
        >
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded border border-black/30 bg-black/45 px-1 font-mono text-[8px] uppercase tracking-[0.12em] text-white">
            center swap {paneHitZoneDebug.centerIsValid ? "ok" : "blocked"}
          </div>
        </div>
        {showDropIntentDebug ? (
          <div className="absolute bottom-1 left-1 right-1 rounded border border-white/15 bg-black/55 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-slate-200">
            partition: center {Math.round(centerRatio * 100)}% | edge band{" "}
            {Math.round(
              paneHitZoneDebug.centerRatio === 0
                ? 0
                : ((1 - centerRatio) / 2) * 100,
            )}
            %
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface TitleBarSizingButton {
  mode: TilingTitleBarSizingMode;
  label: string;
  compactLabel: string;
  title: string;
}

/**
 * Per-pane title-bar sizing actions. STATIC actions freeze the pane to its
 * MEASURED current bbox (the renderer measures + pins on click); FLEX clears the
 * pin. The pane the control lives in IS the target (no target-pane selector).
 */
const TITLE_BAR_SIZING_BUTTONS: ReadonlyArray<TitleBarSizingButton> = [
  {
    mode: "flexible",
    label: "flex",
    compactLabel: "f",
    title:
      "Flexible — ratio-distributed in both dimensions (clears any frozen size)",
  },
  {
    mode: "static-height",
    label: "h",
    compactLabel: "h",
    title:
      "Static height — freeze this pane's height to its current measured pixels",
  },
  {
    mode: "static-width",
    label: "w",
    compactLabel: "w",
    title:
      "Static width — freeze this pane's width to its current measured pixels",
  },
  {
    mode: "static-both",
    label: "both",
    compactLabel: "b",
    title:
      "Static both — freeze this pane's width and height to its current measured pixels",
  },
];

interface TitleBarAcquireButton {
  direction: DynamicFocusDirection;
  glyph: string;
  title: string;
}

/**
 * Per-pane directional acquire-space actions: claim the maximum available space
 * in a direction via `annexDirection` (evict every pane in the vector to the
 * edge, re-seed them into the complementary region pinned at minimum; falls
 * through to the `growLeafToward` ratio-push when nothing lies in the vector).
 */
const TITLE_BAR_ACQUIRE_BUTTONS: ReadonlyArray<TitleBarAcquireButton> = [
  {
    direction: "left",
    glyph: "\u2190",
    title: "Acquire space to the left (grow this pane leftward to the edge)",
  },
  {
    direction: "up",
    glyph: "\u2191",
    title: "Acquire space upward (grow this pane up to the edge)",
  },
  {
    direction: "down",
    glyph: "\u2193",
    title: "Acquire space downward (grow this pane down to the edge)",
  },
  {
    direction: "right",
    glyph: "\u2192",
    title: "Acquire space to the right (grow this pane rightward to the edge)",
  },
];

function PaneTitleBarControls({
  leafId,
  isSizingEnabled,
  isAcquireSpaceEnabled,
  activeSizingMode,
  compact,
  onSetSizingMode,
  onAcquireSpace,
}: {
  leafId: string;
  isSizingEnabled: boolean;
  isAcquireSpaceEnabled: boolean;
  activeSizingMode: TilingTitleBarSizingMode;
  compact: boolean;
  onSetSizingMode: (mode: TilingTitleBarSizingMode) => void;
  onAcquireSpace: (direction: DynamicFocusDirection) => void;
}): React.ReactElement | null {
  if (!isSizingEnabled && !isAcquireSpaceEnabled) {
    return null;
  }
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {isSizingEnabled ? (
        <div
          className={cn(
            "flex shrink-0 items-center gap-0.5 rounded-md border border-white/15 bg-slate-900/70 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur",
          )}
          role="group"
          aria-label={`pane ${leafId} sizing`}
        >
          {TITLE_BAR_SIZING_BUTTONS.map(
            (button: TitleBarSizingButton): React.ReactElement => {
              const isActive: boolean = button.mode === activeSizingMode;
              return (
                <button
                  key={`size-${button.mode}`}
                  type="button"
                  draggable={false}
                  aria-pressed={isActive}
                  title={button.title}
                  aria-label={`${button.title} (pane ${leafId})`}
                  onPointerDown={(
                    event: React.PointerEvent<HTMLButtonElement>,
                  ): void => {
                    event.stopPropagation();
                  }}
                  onClick={(
                    event: React.MouseEvent<HTMLButtonElement>,
                  ): void => {
                    event.stopPropagation();
                    onSetSizingMode(button.mode);
                  }}
                  className={cn(
                    "flex min-w-5 items-center justify-center rounded px-1.5 font-mono text-[9px] uppercase leading-none tracking-[0.08em] transition-colors",
                    compact ? "h-4" : "h-5",
                    isActive
                      ? "border border-cyan-200/55 bg-cyan-400/18 text-cyan-50 shadow-[0_0_12px_rgba(34,211,238,0.28)]"
                      : "text-slate-300 hover:bg-white/10 hover:text-white",
                  )}
                >
                  {compact ? button.compactLabel : button.label}
                </button>
              );
            },
          )}
        </div>
      ) : null}
      {isAcquireSpaceEnabled ? (
        <div
          className={cn(
            "flex shrink-0 items-center gap-0.5 rounded-md border border-white/15 bg-slate-900/70 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur",
          )}
          role="group"
          aria-label={`pane ${leafId} acquire space`}
        >
          {TITLE_BAR_ACQUIRE_BUTTONS.map(
            (button: TitleBarAcquireButton): React.ReactElement => (
              <button
                key={`acquire-${button.direction}`}
                type="button"
                draggable={false}
                title={button.title}
                aria-label={`${button.title} (pane ${leafId})`}
                onPointerDown={(
                  event: React.PointerEvent<HTMLButtonElement>,
                ): void => {
                  event.stopPropagation();
                }}
                onClick={(event: React.MouseEvent<HTMLButtonElement>): void => {
                  event.stopPropagation();
                  onAcquireSpace(button.direction);
                }}
                className={cn(
                  "flex items-center justify-center rounded border border-transparent font-mono leading-none text-slate-300 transition-colors hover:border-cyan-200/40 hover:bg-cyan-400/15 hover:text-cyan-50",
                  compact ? "h-4 w-4 text-[10px]" : "h-5 w-5 text-[11px]",
                )}
              >
                <span aria-hidden>{button.glyph}</span>
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

function DefaultDynamicTile({
  leafId,
  tile,
  paneWidthPx,
  paneBodyRenderMode,
  isDragSource,
  isDropTarget,
  isFocused,
  isRearrangeEnabled,
  isMaximized,
  isMaximizeEnabled,
  onToggleMaximize,
  isTitleBarSizingEnabled,
  isTitleBarAcquireSpaceEnabled,
  widthSizingMode,
  heightSizingMode,
  onSetSizingMode,
  onAcquireSpace,
  dropZone,
  preview,
  showDropBorderHints,
  showDropIntentTranslucentBg,
  showDropIntentDebug,
  dropHitZoneCenterRatioX,
  dropHitZoneCenterRatioY,
  paneHitZonesAlpha,
  paneHitZoneDebug,
  observabilityColors,
  observabilityColorEnables,
  isDropEligible,
  isHoveringDropCandidate,
  isInvalidDrop,
  onFocus,
  dropIntentDebugPath,
  dropIntentDebugAction,
  onHandlePointerDown,
  onPointerMove,
  onPointerLeave,
}: DynamicRenderTileArgs): React.ReactElement {
  const theme: TilingTheme = useTilingTheme();
  const isNarrowHeader: boolean = paneWidthPx < 430;
  const hideSubtitle: boolean = paneWidthPx < 340;
  const shouldRenderPaneContent: boolean =
    paneBodyRenderMode === "render-content";
  const shouldRenderDropLayer: boolean =
    isDropTarget || preview != null || isInvalidDrop;
  const dragSourceBorderStyle: React.CSSProperties =
    isDragSource && observabilityColorEnables.dragSourceBorderEnabled
      ? {
          borderColor: rgbaFromHex(
            observabilityColors.dragSourceBorderColorHex,
            0.85,
            [240, 171, 252],
          ),
        }
      : {};
  const dropTargetBorderEnabled: boolean =
    observabilityColorEnables.dragTargetBorderEnabled;
  const dropTargetBorderColor: string = rgbaFromHex(
    observabilityColors.dragTargetBorderColorHex,
    0.8,
    [103, 232, 249],
  );
  const dropTargetBackgroundColor: string = rgbaFromHex(
    observabilityColors.dragTargetBorderColorHex,
    0.12,
    [103, 232, 249],
  );
  const dropTargetShadowColor: string = rgbaFromHex(
    observabilityColors.dragTargetBorderColorHex,
    0.28,
    [103, 232, 249],
  );
  const dropIntentHintBackgroundColor: string = rgbaFromHex(
    observabilityColors.dragTargetBorderColorHex,
    0.18,
    [103, 232, 249],
  );
  const dropIntentHintOutlineColor: string = rgbaFromHex(
    observabilityColors.dragTargetBorderColorHex,
    0.65,
    [103, 232, 249],
  );
  const shouldRenderDropTargetBorder: boolean =
    dropTargetBorderEnabled && isDropTarget;
  const shouldRenderDropIntentBorderHints: boolean =
    showDropBorderHints && dropTargetBorderEnabled;

  return (
    <article
      className={cn(
        // Pane host shell: the active theme's pane-surface token (bg/gradient,
        // radius, shadow/rim, backdrop-filter) tinted with the pane's accent.
        // No resting BORDER outline from the surface itself: focus, drop-target
        // / eligibility / invalid rings, and the drag-source observability
        // border all supply their own width when active. A backdrop-filter in
        // the surface token creates a containing block for position:fixed
        // DESCENDANTS only — the drag ghost is portaled to document.body (not a
        // descendant), so this never reintroduces drift.
        theme.paneShell.surface,
        theme.resolvePaneAccentSurface(tile.accent),
        // Drop-affordance rings. The hover-target / resolved-target highlight
        // (which reused the accent focus color) is intentionally GONE — during a
        // drag the only focus affordance is the dragged ghost + its seat, and the
        // destination is shown by the ghost hop-in. Only the faint dashed
        // eligibility hint and the rose invalid-drop ring remain.
        resolvePaneDropAffordanceClasses(theme, {
          isDropEligible,
          isHoveringDropCandidate,
          isDropTarget,
          isInvalidDrop,
        }),
        isDragSource ? theme.paneShell.dragSourceOpacity : "",
        isDragSource && observabilityColorEnables.dragSourceBorderEnabled
          ? "border"
          : "",
        isFocused ? theme.resolveFocusFrame(tile.accent) : "",
      )}
      style={dragSourceBorderStyle}
      data-leaf-id={leafId}
      tabIndex={0}
      onFocus={onFocus}
      onClick={onFocus}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      {paneHitZoneDebug != null ? (
        <PaneHitZoneOverlay
          paneHitZoneDebug={paneHitZoneDebug}
          paneHitZonesAlpha={paneHitZonesAlpha}
          showDropIntentDebug={showDropIntentDebug}
          observabilityColors={observabilityColors}
        />
      ) : null}
      {shouldRenderDropLayer ? (
        <div className="pointer-events-none absolute inset-0 z-10 p-1">
          <div
            className={cn(
              "relative h-full w-full rounded-lg border",
              isInvalidDrop ? "border-rose-300/80" : "",
            )}
            style={
              isInvalidDrop
                ? undefined
                : {
                    borderColor: shouldRenderDropTargetBorder
                      ? dropTargetBorderColor
                      : undefined,
                    backgroundColor: shouldRenderDropTargetBorder
                      ? dropTargetBackgroundColor
                      : undefined,
                    boxShadow: shouldRenderDropTargetBorder
                      ? `inset 0 0 0 1px ${dropTargetShadowColor}`
                      : undefined,
                  }
            }
          >
            {(shouldRenderDropIntentBorderHints ||
              showDropIntentTranslucentBg) &&
            dropZone != null &&
            dropZone !== "center" ? (
              <div
                style={{
                  ...edgeZoneClipPathStyle(
                    dropZone,
                    dropHitZoneCenterRatioX,
                    dropHitZoneCenterRatioY,
                  ),
                  backgroundColor: showDropIntentTranslucentBg
                    ? dropIntentHintBackgroundColor
                    : undefined,
                  outline: shouldRenderDropIntentBorderHints
                    ? `1px solid ${dropIntentHintOutlineColor}`
                    : undefined,
                  outlineOffset: "-1px",
                }}
              />
            ) : null}
            {(shouldRenderDropIntentBorderHints ||
              showDropIntentTranslucentBg) &&
            dropZone === "center" ? (
              <div
                className={cn(
                  "rounded-md",
                  shouldRenderDropIntentBorderHints ? "border" : "",
                )}
                style={{
                  ...centerZoneInsetStyle(
                    dropHitZoneCenterRatioX,
                    dropHitZoneCenterRatioY,
                  ),
                  borderColor: shouldRenderDropIntentBorderHints
                    ? dropIntentHintOutlineColor
                    : undefined,
                  backgroundColor: showDropIntentTranslucentBg
                    ? rgbaFromHex(
                        observabilityColors.hitZoneCenterColorHex,
                        0.12,
                        [16, 185, 129],
                      )
                    : undefined,
                }}
              />
            ) : null}

            {showDropIntentDebug && preview != null ? (
              <div className="absolute left-2 top-2 rounded border border-cyan-200/70 bg-cyan-500/25 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-cyan-50">
                drop preview: {preview.role} | drop intent:{" "}
                {dropIntentLabel(preview.zone)} | action:{" "}
                {dropIntentDebugAction ?? "edge-insert"} | axis path:{" "}
                {dropIntentDebugPath ?? "none"} | partner:{" "}
                {preview.partnerLeafId}
              </div>
            ) : null}

            {showDropIntentDebug &&
            dropZone != null &&
            preview == null &&
            !isInvalidDrop ? (
              <div className="absolute left-2 top-2 rounded border border-cyan-200/60 bg-cyan-500/20 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-cyan-50">
                drop intent: {dropIntentLabel(dropZone)} | action:{" "}
                {dropIntentDebugAction ?? "edge-insert"} | axis path:{" "}
                {dropIntentDebugPath ?? "none"}
              </div>
            ) : null}

            {isInvalidDrop ? (
              <div className="absolute inset-2 rounded-md border border-rose-300/80 bg-rose-400/15">
                <div className="absolute left-2 top-2 rounded border border-rose-300/70 bg-rose-500/20 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-rose-50">
                  invalid drop: same tile
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      <header
        onPointerDown={onHandlePointerDown}
        style={isRearrangeEnabled ? { touchAction: "none" } : undefined}
        className={cn(
          theme.paneHeader.base,
          isRearrangeEnabled
            ? "cursor-grab active:cursor-grabbing"
            : "cursor-default",
          isFocused ? theme.paneHeader.focused : "",
        )}
      >
        <div className="min-w-0 text-left">
          <div
            className={cn(
              theme.paneHeader.titleText,
              theme.resolveAccentText(tile.accent),
            )}
            title={tile.title}
          >
            {tile.title}
          </div>
          {!hideSubtitle ? (
            <div
              className={cn(
                "truncate font-mono text-[9px] uppercase tracking-[0.13em]",
                theme.paneShell.subtitleText,
              )}
              title={tile.description ?? "drag header to swap"}
            >
              {tile.description ?? "drag header to swap"}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isMaximizeEnabled ? (
            <button
              type="button"
              draggable={false}
              aria-pressed={isMaximized}
              title={
                isMaximized ? "restore pane (Esc)" : "maximize pane (Alt+Enter)"
              }
              aria-label={
                isMaximized
                  ? `restore pane ${leafId}`
                  : `maximize pane ${leafId}`
              }
              onPointerDown={(
                event: React.PointerEvent<HTMLButtonElement>,
              ): void => {
                event.stopPropagation();
              }}
              onClick={(event: React.MouseEvent<HTMLButtonElement>): void => {
                event.stopPropagation();
                onToggleMaximize();
              }}
              className={cn(
                "flex shrink-0 items-center justify-center rounded-md border font-mono leading-none transition-colors",
                isNarrowHeader ? "h-4 w-4 text-[10px]" : "h-5 w-5 text-[11px]",
                isMaximized
                  ? theme.paneHeader.controlActive
                  : theme.paneHeader.controlIdle,
              )}
            >
              <span aria-hidden>{isMaximized ? "\u2715" : "\u2922"}</span>
            </button>
          ) : null}
          <PaneTitleBarControls
            leafId={leafId}
            isSizingEnabled={isTitleBarSizingEnabled}
            isAcquireSpaceEnabled={isTitleBarAcquireSpaceEnabled}
            activeSizingMode={titleBarSizingModeId(
              widthSizingMode,
              heightSizingMode,
            )}
            compact={isNarrowHeader}
            onSetSizingMode={onSetSizingMode}
            onAcquireSpace={onAcquireSpace}
          />
        </div>
      </header>

      <div className={theme.paneShell.bodyText}>
        {shouldRenderPaneContent ? (
          <React.Fragment key="pane-content-visible">
            {tile.content != null
              ? tile.content
              : (tile.rows ?? []).map(
                  (row: string, rowIndex: number): React.ReactElement => (
                    <div
                      key={`${tile.id}-row-${rowIndex}`}
                      className="whitespace-pre-wrap break-words"
                    >
                      {row}
                    </div>
                  ),
                )}
          </React.Fragment>
        ) : null}
      </div>
    </article>
  );
}

function isPointerLikeEvent(
  event: MouseEvent | PointerEvent,
): event is PointerEvent {
  return "pointerId" in event;
}

function projectedSubjectBorderColorHex(
  subject: DynamicProjectedLandingSubject,
  observabilityColors: DynamicObservabilityColorConfig,
): string {
  if (subject === "source") {
    return observabilityColors.projectedSourceBorderColorHex;
  }
  if (subject === "target") {
    return observabilityColors.projectedTargetBorderColorHex;
  }
  return observabilityColors.projectedSuccessorBorderColorHex;
}

function projectedSubjectFillColorHex(
  subject: DynamicProjectedLandingSubject,
  observabilityColors: DynamicObservabilityColorConfig,
): string {
  if (subject === "source") {
    return observabilityColors.projectedSourceFillColorHex;
  }
  if (subject === "target") {
    return observabilityColors.projectedTargetFillColorHex;
  }
  return observabilityColors.projectedSuccessorFillColorHex;
}

function projectedSubjectLabel(
  subject: DynamicProjectedLandingSubject,
): string {
  if (subject === "source") {
    return "drag source landing overlay (S')";
  }
  if (subject === "target") {
    return "drop target result overlay (T')";
  }
  return "successor promotion overlay (Su')";
}

function ProjectedLandingOverlays({
  overlays,
  showLabels,
  observabilityColors,
  observabilityColorEnables,
  projectedOverlayBackgroundAlpha,
}: {
  overlays: ReadonlyArray<DynamicProjectedLandingOverlay>;
  showLabels: boolean;
  observabilityColors: DynamicObservabilityColorConfig;
  observabilityColorEnables: DynamicObservabilityColorEnableConfig;
  projectedOverlayBackgroundAlpha: number;
}): React.ReactElement | null {
  if (overlays.length === 0) {
    return null;
  }

  const shouldRenderOverlayBackground: boolean = hasEnabledProjectedFill(
    observabilityColorEnables,
  );
  const projectedOverlayZIndexBase: number = PROJECTED_OVERLAY_Z_INDEX_BASE;
  const overlayContainerStyle: React.CSSProperties = {
    zIndex: projectedOverlayZIndexBase,
  };

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={overlayContainerStyle}
      aria-hidden
    >
      {overlays.map(
        (
          overlay: DynamicProjectedLandingOverlay,
        ): React.ReactElement | null => {
          const borderEnabled: boolean = projectedSubjectBorderEnabled(
            overlay.subject,
            observabilityColorEnables,
          );
          const fillEnabled: boolean = projectedSubjectFillEnabled(
            overlay.subject,
            observabilityColorEnables,
          );
          if (!borderEnabled && !fillEnabled) {
            return null;
          }
          const overlayBorderColorHex: string = projectedSubjectBorderColorHex(
            overlay.subject,
            observabilityColors,
          );
          const overlayFillColorHex: string = projectedSubjectFillColorHex(
            overlay.subject,
            observabilityColors,
          );
          const labelText: string = projectedSubjectLabel(overlay.subject);
          const overlayStyle: React.CSSProperties = {
            left: overlay.footprint.left,
            top: overlay.footprint.top,
            width: overlay.footprint.width,
            height: overlay.footprint.height,
            zIndex:
              projectedOverlayZIndexBase + PROJECTED_OVERLAY_Z_INDEX_OFFSET,
          };
          if (borderEnabled) {
            overlayStyle.borderColor = rgbaFromHex(
              overlayBorderColorHex,
              0.9,
              [16, 185, 129],
            );
          }

          if (shouldRenderOverlayBackground && fillEnabled) {
            overlayStyle.backgroundColor = rgbaFromHex(
              overlayFillColorHex,
              projectedOverlayBackgroundAlpha,
              [16, 185, 129],
            );
            overlayStyle.boxShadow =
              "inset 0 0 0 1px rgba(255,255,255,0.52), inset 0 0 42px rgba(15,23,42,0.52), 0 0 26px rgba(15,23,42,0.28)";
          }

          return (
            <div
              key={`${overlay.subject}:${overlay.leafId}`}
              className={cn(
                "absolute rounded-md",
                borderEnabled ? "border" : "",
              )}
              style={overlayStyle}
            >
              {showLabels ? (
                <div
                  className="absolute left-2 top-2 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-white"
                  style={{
                    borderColor: rgbaFromHex(
                      overlayBorderColorHex,
                      0.85,
                      [16, 185, 129],
                    ),
                    backgroundColor: rgbaFromHex(
                      overlayFillColorHex,
                      0.2,
                      [16, 185, 129],
                    ),
                  }}
                >
                  {labelText}
                </div>
              ) : null}
            </div>
          );
        },
      )}
    </div>
  );
}

function buildDraggingLiveHitLogState(params: {
  dragState: Extract<DragMachineState, { phase: "dragging" }>;
  dropState: DynamicDropState | null;
  dragSourceLeafId: string;
  ghostSeatLeafId: string | null;
  leafFootprintsById: ReadonlyMap<string, DynamicPaneFootprint>;
  viewportElement: HTMLDivElement | null;
}): DynamicLiveHitLogState {
  const clientX: number =
    params.dragState.ghostFootprint.left +
    params.dragState.pointerAnchorOffset.x;
  const clientY: number =
    params.dragState.ghostFootprint.top +
    params.dragState.pointerAnchorOffset.y;
  const viewportRect: DOMRect | undefined =
    params.viewportElement?.getBoundingClientRect();
  const cursorViewport: DynamicLiveHitLogState["cursorViewport"] = {
    x: viewportRect == null ? clientX : clientX - viewportRect.left,
    y: viewportRect == null ? clientY : clientY - viewportRect.top,
  };
  const dragSourcePaneFootprint: DynamicPaneFootprint | null =
    params.leafFootprintsById.get(params.dragSourceLeafId) ?? null;
  const presentationFields: Pick<
    DynamicLiveHitLogState,
    "ghostSeatLeafId" | "presentationDropAction"
  > = {
    ghostSeatLeafId: params.ghostSeatLeafId,
    presentationDropAction: params.dropState?.action ?? null,
  };

  if (params.dropState == null) {
    return {
      hoveredLeafId: "none",
      sourceLeafId: null,
      dragSourceLeafId: params.dragSourceLeafId,
      cursorViewport,
      sourcePaneFootprint: null,
      dragSourcePaneFootprint,
      isDragging: true,
      resolverZone: "none",
      centerRatio: DYNAMIC_DROP_INTENT_CONFIG.centerRatio,
      edgeThresholdRatio: (1 - DYNAMIC_DROP_INTENT_CONFIG.centerRatio) / 2,
      centerRectWidthPx: 0,
      centerRectHeightPx: 0,
      centerIsValid: false,
      centerBlockedReason: null,
      edgeDiagnostics: [],
      intent: null,
      ...presentationFields,
    };
  }

  const hoveredLeafId: string = params.dropState.leafId;
  const sourcePaneFootprint: DynamicPaneFootprint | null =
    params.leafFootprintsById.get(hoveredLeafId) ?? null;
  const intent: DynamicDropIntentDebugState = toDropIntentDebugState(
    params.dropState,
  );
  const centerIsValid: boolean =
    params.dropState.action !== "none" &&
    params.dropState.blockedReason == null;

  return {
    hoveredLeafId,
    sourceLeafId: hoveredLeafId,
    dragSourceLeafId: params.dragSourceLeafId,
    cursorViewport,
    sourcePaneFootprint,
    dragSourcePaneFootprint,
    isDragging: true,
    resolverZone: params.dropState.zone,
    centerRatio: params.dropState.tuning.centerRatio,
    edgeThresholdRatio: params.dropState.edgeThresholdRatio,
    centerRectWidthPx: params.dropState.centerRectWidthPx,
    centerRectHeightPx: params.dropState.centerRectHeightPx,
    centerIsValid,
    centerBlockedReason: params.dropState.blockedReason,
    edgeDiagnostics: [],
    intent,
    ...presentationFields,
  };
}

function toDropIntentDebugState(
  dropState: DynamicDropState,
): DynamicDropIntentDebugState {
  return {
    leafId: dropState.leafId,
    zone: dropState.zone,
    action: dropState.action,
    dominantEdge: dropState.dominantEdge,
    finalEdge: dropState.finalEdge,
    fallbackReason: dropState.fallbackReason,
    blockedReason: dropState.blockedReason,
    axisPath: dropState.axisPath,
    edgeThresholdRatio: dropState.edgeThresholdRatio,
    centerRectWidthPx: dropState.centerRectWidthPx,
    centerRectHeightPx: dropState.centerRectHeightPx,
    centerDistancePx: dropState.centerDistancePx,
    nearestEdgeDistancePx: dropState.nearestEdgeDistancePx,
    paneLocalX: dropState.paneLocalX,
    paneLocalY: dropState.paneLocalY,
    targetSplitId: dropState.targetSplitId,
    targetSplitPlacement: dropState.targetSplitPlacement,
    selectedSplitZone: dropState.selectedSplitZone,
    selectedSplitDistancePx: dropState.selectedSplitDistancePx,
    rejectedSplitReasons: dropState.rejectedSplitReasons,
    tuning: dropState.tuning,
  };
}

interface PaneTabDescriptor {
  leafId: string;
  title: string;
  accent: DynamicTile["accent"];
}

interface PaneShortcutChipDescriptor {
  id: string;
  combo: string;
  tooltip: string;
  command: TilingCommand;
}

interface PaneShortcutContext {
  keymap: ResolvedTilingKeymap;
  commandGates: TilingCommandGates;
  layout: DynamicLayoutNode;
  leafIds: ReadonlyArray<string>;
  activeFocusedLeafId: string | null;
  activeMaximizedLeafId: string | null;
  focusHistory: FocusHistory;
  isLeafRearrangeEligible: (leafId: string) => boolean;
}

function keyChordModifierPrefix(modifiers: {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}): string {
  const parts: ReadonlyArray<string> = [
    modifiers.ctrl ? "Ctrl" : null,
    modifiers.alt ? "Alt" : null,
    modifiers.shift ? "Shift" : null,
    modifiers.meta ? "Meta" : null,
  ].filter((part: string | null): part is string => part != null);
  return parts.join("+");
}

function formatKeyCodeLabel(code: string): string {
  if (code === "BracketLeft") {
    return "[";
  }
  if (code === "BracketRight") {
    return "]";
  }
  if (code === "Escape") {
    return "Esc";
  }
  if (code === "Enter") {
    return "Enter";
  }
  if (code === "ArrowLeft") {
    return "Left";
  }
  if (code === "ArrowRight") {
    return "Right";
  }
  if (code === "ArrowUp") {
    return "Up";
  }
  if (code === "ArrowDown") {
    return "Down";
  }
  if (code === "Backquote") {
    return "`";
  }
  if (code === "Equal") {
    return "=";
  }
  if (code === "Minus") {
    return "-";
  }
  if (code === "Period") {
    return ".";
  }
  if (code === "Comma") {
    return ",";
  }
  const keyMatch: RegExpExecArray | null = /^Key([A-Z])$/.exec(code);
  if (keyMatch != null) {
    return keyMatch[1];
  }
  const digitMatch: RegExpExecArray | null = /^Digit([0-9])$/.exec(code);
  if (digitMatch != null) {
    return digitMatch[1];
  }
  return code;
}

function formatKeyChordLabel(chord: {
  code: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}): string {
  const prefix: string = keyChordModifierPrefix(chord);
  const keyLabel: string = formatKeyCodeLabel(chord.code);
  return prefix.length === 0 ? keyLabel : `${prefix}+${keyLabel}`;
}

function resolvePaneShortcutChips(
  context: PaneShortcutContext,
): ReadonlyArray<PaneShortcutChipDescriptor> {
  const activeFocusedLeafId: string | null = context.activeFocusedLeafId;
  const hasFocusedLeaf: boolean = activeFocusedLeafId != null;
  const focusedLeafId: string = activeFocusedLeafId ?? "";
  const focusedGroup: DynamicGroupNode | null = hasFocusedLeaf
    ? findGroupContainingLeaf(context.layout, focusedLeafId)
    : null;
  const isFocusedLeafGrouped: boolean = focusedGroup != null;
  const focusedGroupMemberCount: number = focusedGroup?.members.length ?? 0;
  const cyclePreviousTarget: string | null = resolveCycledPaneId(
    context.leafIds,
    activeFocusedLeafId,
    "previous",
  );
  const cycleNextTarget: string | null = resolveCycledPaneId(
    context.leafIds,
    activeFocusedLeafId,
    "next",
  );
  const focusCurrentOrLastTarget: string | null = resolveFocusCurrentOrLast(
    context.focusHistory,
    context.activeFocusedLeafId,
  );
  const canToggleGroupFromUngroupedFocus: boolean = (() => {
    if (!hasFocusedLeaf) {
      return false;
    }
    if (isFocusedLeafGrouped) {
      return true;
    }
    const focusIndex: number = context.leafIds.indexOf(focusedLeafId);
    return focusIndex !== -1 && context.leafIds.length >= 2;
  })();

  const visibilityChecks = {
    toggleMaximize: (): boolean => hasFocusedLeaf,
    restore: (): boolean => context.activeMaximizedLeafId != null,
    focusPrevious: (): boolean =>
      cyclePreviousTarget != null &&
      cyclePreviousTarget !== activeFocusedLeafId,
    focusNext: (): boolean =>
      cycleNextTarget != null && cycleNextTarget !== activeFocusedLeafId,
    focusLeft: (): boolean =>
      hasFocusedLeaf &&
      findLeafByDirection(context.layout, focusedLeafId, "left") != null,
    focusRight: (): boolean =>
      hasFocusedLeaf &&
      findLeafByDirection(context.layout, focusedLeafId, "right") != null,
    focusUp: (): boolean =>
      hasFocusedLeaf &&
      findLeafByDirection(context.layout, focusedLeafId, "up") != null,
    focusDown: (): boolean =>
      hasFocusedLeaf &&
      findLeafByDirection(context.layout, focusedLeafId, "down") != null,
    focusCurrentOrLast: (): boolean =>
      focusCurrentOrLastTarget != null &&
      findLeafById(context.layout, focusCurrentOrLastTarget) != null,
    enterMoveMode: (): boolean =>
      hasFocusedLeaf && context.isLeafRearrangeEligible(focusedLeafId),
    cycleLayoutMode: (): boolean => context.layout.kind === "split",
    cycleMasterOrientation: (): boolean => context.layout.kind === "split",
    incrementMasterCount: (): boolean => context.layout.kind === "split",
    decrementMasterCount: (): boolean => context.layout.kind === "split",
    incrementMasterRatio: (): boolean => context.layout.kind === "split",
    decrementMasterRatio: (): boolean => context.layout.kind === "split",
    toggleGroup: (): boolean => canToggleGroupFromUngroupedFocus,
    groupTabNext: (): boolean => focusedGroupMemberCount > 1,
    groupTabPrevious: (): boolean => focusedGroupMemberCount > 1,
  };

  const shortcutInventory: Array<
    PaneShortcutChipDescriptor & { isVisible: boolean }
  > = [
    {
      id: "toggle-maximize",
      combo: formatKeyChordLabel(context.keymap.toggleMaximize),
      tooltip:
        context.activeMaximizedLeafId == null
          ? "Maximize the focused pane"
          : "Toggle maximize on the focused pane",
      command: { kind: "toggle-maximize" },
      isVisible:
        isCommandEnabled({ kind: "toggle-maximize" }, context.commandGates) &&
        visibilityChecks.toggleMaximize(),
    },
    {
      id: "restore",
      combo: formatKeyChordLabel(context.keymap.restore),
      tooltip: "Restore from maximized pane view",
      command: { kind: "restore" },
      isVisible:
        isCommandEnabled({ kind: "restore" }, context.commandGates) &&
        visibilityChecks.restore(),
    },
    {
      id: "focus-cycle-previous",
      combo: formatKeyChordLabel(context.keymap.previousPane),
      tooltip: "Focus previous pane",
      command: { kind: "focus-cycle", direction: "previous" },
      isVisible:
        isCommandEnabled(
          { kind: "focus-cycle", direction: "previous" },
          context.commandGates,
        ) && visibilityChecks.focusPrevious(),
    },
    {
      id: "focus-cycle-next",
      combo: formatKeyChordLabel(context.keymap.nextPane),
      tooltip: "Focus next pane",
      command: { kind: "focus-cycle", direction: "next" },
      isVisible:
        isCommandEnabled(
          { kind: "focus-cycle", direction: "next" },
          context.commandGates,
        ) && visibilityChecks.focusNext(),
    },
    {
      id: "focus-left",
      combo: formatKeyChordLabel(context.keymap.focusLeft),
      tooltip: "Focus pane on the left",
      command: { kind: "focus-direction", direction: "left" },
      isVisible:
        isCommandEnabled(
          { kind: "focus-direction", direction: "left" },
          context.commandGates,
        ) && visibilityChecks.focusLeft(),
    },
    {
      id: "focus-right",
      combo: formatKeyChordLabel(context.keymap.focusRight),
      tooltip: "Focus pane on the right",
      command: { kind: "focus-direction", direction: "right" },
      isVisible:
        isCommandEnabled(
          { kind: "focus-direction", direction: "right" },
          context.commandGates,
        ) && visibilityChecks.focusRight(),
    },
    {
      id: "focus-up",
      combo: formatKeyChordLabel(context.keymap.focusUp),
      tooltip: "Focus pane above",
      command: { kind: "focus-direction", direction: "up" },
      isVisible:
        isCommandEnabled(
          { kind: "focus-direction", direction: "up" },
          context.commandGates,
        ) && visibilityChecks.focusUp(),
    },
    {
      id: "focus-down",
      combo: formatKeyChordLabel(context.keymap.focusDown),
      tooltip: "Focus pane below",
      command: { kind: "focus-direction", direction: "down" },
      isVisible:
        isCommandEnabled(
          { kind: "focus-direction", direction: "down" },
          context.commandGates,
        ) && visibilityChecks.focusDown(),
    },
    {
      id: "focus-current-or-last",
      combo: formatKeyChordLabel(context.keymap.focusCurrentOrLast),
      tooltip: "Toggle focus between current and last pane",
      command: { kind: "focus-current-or-last" },
      isVisible:
        isCommandEnabled(
          { kind: "focus-current-or-last" },
          context.commandGates,
        ) && visibilityChecks.focusCurrentOrLast(),
    },
    {
      id: "enter-move-mode",
      combo: formatKeyChordLabel(context.keymap.enterMoveMode),
      tooltip: "Enter keyboard move mode",
      command: { kind: "enter-move-mode" },
      isVisible:
        isCommandEnabled({ kind: "enter-move-mode" }, context.commandGates) &&
        visibilityChecks.enterMoveMode(),
    },
    {
      id: "cycle-layout-mode",
      combo: formatKeyChordLabel(context.keymap.cycleLayoutMode),
      tooltip: "Cycle layout mode (dwindle/master)",
      command: { kind: "cycle-layout-mode" },
      isVisible:
        isCommandEnabled({ kind: "cycle-layout-mode" }, context.commandGates) &&
        visibilityChecks.cycleLayoutMode(),
    },
    {
      id: "cycle-master-orientation",
      combo: formatKeyChordLabel(context.keymap.cycleMasterOrientation),
      tooltip: "Cycle master orientation",
      command: { kind: "cycle-master-orientation" },
      isVisible:
        isCommandEnabled(
          { kind: "cycle-master-orientation" },
          context.commandGates,
        ) && visibilityChecks.cycleMasterOrientation(),
    },
    {
      id: "increment-master-count",
      combo: formatKeyChordLabel(context.keymap.incrementMasterCount),
      tooltip: "Increase master count",
      command: { kind: "adjust-master-count", delta: 1 },
      isVisible:
        isCommandEnabled(
          { kind: "adjust-master-count", delta: 1 },
          context.commandGates,
        ) && visibilityChecks.incrementMasterCount(),
    },
    {
      id: "decrement-master-count",
      combo: formatKeyChordLabel(context.keymap.decrementMasterCount),
      tooltip: "Decrease master count",
      command: { kind: "adjust-master-count", delta: -1 },
      isVisible:
        isCommandEnabled(
          { kind: "adjust-master-count", delta: -1 },
          context.commandGates,
        ) && visibilityChecks.decrementMasterCount(),
    },
    {
      id: "increment-master-ratio",
      combo: formatKeyChordLabel(context.keymap.incrementMasterRatio),
      tooltip: "Increase master area ratio",
      command: { kind: "adjust-master-ratio", delta: 0.05 },
      isVisible:
        isCommandEnabled(
          { kind: "adjust-master-ratio", delta: 0.05 },
          context.commandGates,
        ) && visibilityChecks.incrementMasterRatio(),
    },
    {
      id: "decrement-master-ratio",
      combo: formatKeyChordLabel(context.keymap.decrementMasterRatio),
      tooltip: "Decrease master area ratio",
      command: { kind: "adjust-master-ratio", delta: -0.05 },
      isVisible:
        isCommandEnabled(
          { kind: "adjust-master-ratio", delta: -0.05 },
          context.commandGates,
        ) && visibilityChecks.decrementMasterRatio(),
    },
    {
      id: "toggle-group",
      combo: formatKeyChordLabel(context.keymap.toggleGroup),
      tooltip: isFocusedLeafGrouped
        ? "Ungroup the focused pane"
        : "Group the focused pane with a neighbor",
      command: { kind: "toggle-group" },
      isVisible:
        isCommandEnabled({ kind: "toggle-group" }, context.commandGates) &&
        visibilityChecks.toggleGroup(),
    },
    {
      id: "group-tab-next",
      combo: formatKeyChordLabel(context.keymap.groupTabNext),
      tooltip: "Activate next tab in focused group",
      command: { kind: "group-tab-cycle", direction: "next" },
      isVisible:
        isCommandEnabled(
          { kind: "group-tab-cycle", direction: "next" },
          context.commandGates,
        ) && visibilityChecks.groupTabNext(),
    },
    {
      id: "group-tab-previous",
      combo: formatKeyChordLabel(context.keymap.groupTabPrevious),
      tooltip: "Activate previous tab in focused group",
      command: { kind: "group-tab-cycle", direction: "previous" },
      isVisible:
        isCommandEnabled(
          { kind: "group-tab-cycle", direction: "previous" },
          context.commandGates,
        ) && visibilityChecks.groupTabPrevious(),
    },
  ];

  for (let paneNumber: number = 1; paneNumber <= 9; paneNumber += 1) {
    const jumpTarget: string | null = resolveJumpedPaneId(
      context.leafIds,
      paneNumber,
    );
    const jumpCommand: TilingCommand = { kind: "focus-jump", paneNumber };
    const jumpModifierPrefix: string = keyChordModifierPrefix(
      context.keymap.jumpToPane,
    );
    shortcutInventory.push({
      id: `focus-jump-${paneNumber}`,
      combo:
        jumpModifierPrefix.length === 0
          ? `${paneNumber}`
          : `${jumpModifierPrefix}+${paneNumber}`,
      tooltip: `Focus pane ${paneNumber}`,
      command: jumpCommand,
      isVisible:
        isCommandEnabled(jumpCommand, context.commandGates) &&
        jumpTarget != null &&
        jumpTarget !== activeFocusedLeafId,
    });
  }

  return shortcutInventory
    .filter(
      (chip: PaneShortcutChipDescriptor & { isVisible: boolean }): boolean =>
        chip.isVisible,
    )
    .map(
      ({ id, combo, tooltip, command }): PaneShortcutChipDescriptor => ({
        id,
        combo,
        tooltip,
        command,
      }),
    );
}

/**
 * Accent-picker config handed to the top-bar tab strip. Present only when the
 * consumer wires `onTileAccentChange`; carries the focused tile's current
 * accent (for the active-swatch ring) and a commit callback already bound to
 * the focused tile id.
 */
interface PaneTabStripAccentPicker {
  activeAccent: DynamicTileAccent;
  onSelect: (accent: DynamicTileAccent) => void;
}

/**
 * Theme-switcher config handed to the top-bar tab strip. Present only when the
 * consumer wires `onThemeChange`; carries the active theme id (for the
 * active-chip highlight) and a commit callback. Mirrors the accent picker.
 */
interface PaneTabStripThemePicker {
  activeThemeId: TilingThemeId;
  onSelect: (themeId: TilingThemeId) => void;
}

function PaneTabStrip({
  tabs,
  activeFocusedLeafId,
  activeMaximizedLeafId,
  isPaneContentVisible,
  showContentToggle,
  accentPicker,
  themePicker,
  onSelect,
  onTabDoubleClickMaximize,
  onPaneContentVisibilityChange,
}: {
  tabs: ReadonlyArray<PaneTabDescriptor>;
  activeFocusedLeafId: string | null;
  activeMaximizedLeafId: string | null;
  isPaneContentVisible: boolean;
  showContentToggle: boolean;
  accentPicker: PaneTabStripAccentPicker | null;
  themePicker: PaneTabStripThemePicker | null;
  onSelect: (leafId: string) => void;
  /**
   * Toggle the tab's leaf maximize on a double-click of the tab, or `null` when
   * the `tabDoubleClickMaximize` capability (or `maximize`) is disabled — in
   * which case no double-click handler is wired and single-click activation is
   * the only tab behavior. A real `onDoubleClick` (`dblclick`) handler is used
   * so the single-click activation (`onSelect`) is never the surface that fires
   * the toggle.
   */
  onTabDoubleClickMaximize: ((leafId: string) => void) | null;
  onPaneContentVisibilityChange: (nextVisible: boolean) => void;
}): React.ReactElement {
  const theme: TilingTheme = useTilingTheme();
  return (
    <div className={theme.topBar.container}>
      <div aria-label="hypr tiling title" className={theme.topBar.titleText}>
        HYPR TILING
      </div>
      {themePicker != null ? (
        <div
          role="group"
          aria-label="renderer theme"
          className={theme.topBar.controlGroup}
        >
          {TILING_THEMES.map((entry: TilingTheme): React.ReactElement => {
            const isActiveTheme: boolean =
              entry.id === themePicker.activeThemeId;
            return (
              <button
                key={`theme-${entry.id}`}
                type="button"
                aria-label={`set renderer theme to ${entry.label}`}
                aria-pressed={isActiveTheme}
                title={entry.label}
                onClick={(): void => themePicker.onSelect(entry.id)}
                className={cn(
                  "rounded px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] transition-colors",
                  isActiveTheme
                    ? "bg-white/15 text-white"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
                )}
              >
                {entry.label}
              </button>
            );
          })}
        </div>
      ) : null}
      {accentPicker != null ? (
        <div
          role="group"
          aria-label="focused pane accent palette"
          className={theme.topBar.pickerGroup}
        >
          {DYNAMIC_TILE_ACCENT_SWATCHES.map(
            (swatch: DynamicTileAccentSwatch): React.ReactElement => {
              const isActiveAccent: boolean =
                swatch.accent === accentPicker.activeAccent;
              return (
                <button
                  key={`accent-${swatch.accent}`}
                  type="button"
                  aria-label={`set focused pane accent to ${swatch.label}`}
                  aria-pressed={isActiveAccent}
                  title={swatch.label}
                  onClick={(): void => accentPicker.onSelect(swatch.accent)}
                  className={cn(
                    "h-3.5 w-3.5 rounded-full border transition-transform hover:scale-110",
                    swatch.swatchClassName,
                    isActiveAccent
                      ? "border-white ring-1 ring-white/70"
                      : "border-white/25",
                  )}
                />
              );
            },
          )}
        </div>
      ) : null}
      {showContentToggle ? (
        <label
          className="flex shrink-0 cursor-pointer select-none items-center gap-1 px-1 py-1 font-mono text-[8px] uppercase tracking-[0.1em] text-slate-400 hover:text-slate-100"
          title={isPaneContentVisible ? "Hide pane content" : "Show pane content"}
        >
          <input
            type="checkbox"
            className="h-3 w-3 accent-slate-400"
            checked={isPaneContentVisible}
            onChange={(event: React.ChangeEvent<HTMLInputElement>): void => {
              onPaneContentVisibilityChange(event.currentTarget.checked);
            }}
            aria-label={
              isPaneContentVisible ? "hide pane content" : "show pane content"
            }
          />
          content
        </label>
      ) : null}
      <div
        role="tablist"
        aria-label="tiling panes"
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
      >
        {tabs.map(
          (tab: PaneTabDescriptor, tabIndex: number): React.ReactElement => {
            const isActive: boolean = tab.leafId === activeFocusedLeafId;
            const isMaximized: boolean = tab.leafId === activeMaximizedLeafId;
            return (
              <button
                key={`pane-tab-${tab.leafId}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                title={`focus pane ${tab.leafId} (Alt+${tabIndex + 1})`}
                onClick={(): void => onSelect(tab.leafId)}
                onDoubleClick={
                  onTabDoubleClickMaximize != null
                    ? (): void => onTabDoubleClickMaximize(tab.leafId)
                    : undefined
                }
                className={cn(
                  theme.topBar.tabBase,
                  isActive
                    ? theme.resolveTabActive(tab.accent)
                    : theme.topBar.tabInactive,
                )}
              >
                <span className="font-semibold opacity-70">{tabIndex + 1}</span>
                <span className="whitespace-nowrap">{tab.title}</span>
                {isMaximized ? (
                  <span
                    className="rounded-sm border border-current/40 px-1 text-[8px] leading-none"
                    aria-hidden
                  >
                    max
                  </span>
                ) : null}
              </button>
            );
          },
        )}
      </div>
    </div>
  );
}

const PANE_SWITCHER_OVERLAY_Z_INDEX: number = 240;

/**
 * macOS Cmd+Tab-style centered switcher overlay. Lists every pane as a small
 * card (number + title) and highlights the currently-selected pane. Driven by
 * the held-modifier cycle flow; clicking a card commits that selection
 * immediately. Keyboard-first, but pointer-interactive for parity with the OS
 * switcher.
 */
function PaneSwitcherOverlay({
  tabs,
  selectedLeafId,
  onSelect,
}: {
  tabs: ReadonlyArray<PaneTabDescriptor>;
  selectedLeafId: string;
  onSelect: (leafId: string) => void;
}): React.ReactElement {
  const theme: TilingTheme = useTilingTheme();
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      style={{ zIndex: PANE_SWITCHER_OVERLAY_Z_INDEX }}
      role="dialog"
      aria-label="pane switcher"
    >
      <div className={theme.topBar.switcherCard}>
        <div className="mb-2 text-center font-mono text-[9px] uppercase tracking-[0.22em] text-slate-400">
          switch pane — hold modifier, release to commit, esc to cancel
        </div>
        <div className="flex flex-wrap items-stretch justify-center gap-2">
          {tabs.map(
            (tab: PaneTabDescriptor, tabIndex: number): React.ReactElement => {
              const isSelected: boolean = tab.leafId === selectedLeafId;
              return (
                <button
                  key={`pane-switcher-${tab.leafId}`}
                  type="button"
                  aria-current={isSelected}
                  title={`select pane ${tab.leafId} (Alt+${tabIndex + 1})`}
                  onClick={(): void => onSelect(tab.leafId)}
                  className={cn(
                    "flex w-28 flex-col items-start gap-1 rounded-lg border px-2.5 py-2 text-left transition-colors",
                    isSelected
                      ? theme.resolveTabActive(tab.accent)
                      : theme.topBar.switcherCardInactive,
                  )}
                >
                  <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] opacity-70">
                    {tabIndex + 1}
                  </span>
                  <span className="w-full truncate font-mono text-[11px] uppercase tracking-[0.1em]">
                    {tab.title}
                  </span>
                </button>
              );
            },
          )}
        </div>
      </div>
    </div>
  );
}

/** Edge-bar position class for the pending move-mode insert placement. */
function moveEdgeBarClassName(placement: DynamicMovePlacement): string {
  if (placement === "left") {
    return "left-0 top-0 h-full w-1.5";
  }
  if (placement === "right") {
    return "right-0 top-0 h-full w-1.5";
  }
  if (placement === "top") {
    return "left-0 top-0 h-1.5 w-full";
  }
  return "bottom-0 left-0 h-1.5 w-full";
}

/**
 * Minimal Tailwind affordance for keyboard MOVE MODE (the accessible drag
 * analog). The source pane gets an amber ring + a "moving" instruction badge;
 * the pending destination gets a cyan ring, an edge bar on the side the source
 * will land on, and an "insert <edge>" label. Pointer-inert (keyboard-driven).
 */
function MovePaneAffordance({
  isMoveSource,
  moveTargetPlacement,
}: {
  isMoveSource: boolean;
  moveTargetPlacement: DynamicMovePlacement | null;
}): React.ReactElement {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[60] rounded-xl"
      aria-hidden
    >
      {isMoveSource ? (
        <div className="absolute inset-0 rounded-xl ring-2 ring-amber-300/80">
          <span className="absolute left-1/2 top-2 -translate-x-1/2 whitespace-nowrap rounded-full border border-amber-300/70 bg-slate-950/85 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-amber-200">
            moving · arrows aim · enter commit · esc cancel
          </span>
        </div>
      ) : null}
      {moveTargetPlacement != null ? (
        <div className="absolute inset-0 rounded-xl ring-2 ring-cyan-300/80">
          <div
            className={cn(
              "absolute rounded bg-cyan-300/80",
              moveEdgeBarClassName(moveTargetPlacement),
            )}
          />
          <span className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-cyan-300/70 bg-slate-950/85 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-cyan-200">
            insert {moveTargetPlacement}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export const DynamicTilingRenderer = React.forwardRef<
  TilingCommandHandle,
  DynamicTilingRendererProps
>(function DynamicTilingRenderer(
  {
    layout,
    tiles,
    config,
    onLayoutChange,
    className,
    interaction,
    renderTile,
    focusedLeafId,
    onFocusedLeafChange,
    onTileAccentChange,
    themeId,
    onThemeChange,
    maximizedLeafId,
    onMaximizedLeafChange,
    onProjectedOverlayCountChange,
    showDropPreviewOverlays = true,
    observabilityColors = DYNAMIC_OBSERVABILITY_COLOR_DEFAULTS,
    observabilityColorEnables = DYNAMIC_OBSERVABILITY_COLOR_ENABLE_DEFAULTS,
    projectedOverlayBackgroundAlpha = 0.9,
    dragAnimationEnabled = true,
    dragHopEasing,
    dragReflowEasing,
    ghostTransitSpeedPercent = DEFAULT_DRAG_ANIMATION_SPEED_PERCENT,
    survivorReflowSpeedPercent = DEFAULT_DRAG_ANIMATION_SPEED_PERCENT,
    swapBounceMagnitudePercent = DEFAULT_SWAP_BOUNCE_MAGNITUDE_PERCENT,
    showDropBorderHints = true,
    showDropIntentTranslucentBg = true,
    showDropIntentDebug = true,
    showPaneHitZones = false,
    paneHitZonesAlpha = 0.2,
    paneHitZoneSourceLeafId = null,
    onDropIntentChange,
    onLiveHitLogChange,
  }: DynamicTilingRendererProps,
  ref: React.ForwardedRef<TilingCommandHandle>,
): React.ReactElement {
  // Active theme resolved from the prop (or the library default). The registry
  // returns a stable object reference per id, so this is referentially stable
  // across renders unless `themeId` changes — safe to thread through the
  // `renderBranch` memo deps. Provided to every subcomponent via context.
  const theme: TilingTheme = resolveTilingTheme(themeId);
  const projectedOverlayBackgroundAlphaSafe: number = Math.min(
    Math.max(projectedOverlayBackgroundAlpha, 0),
    1,
  );
  // Two independently-resolved party durations. The ghost transit (hop / pickup /
  // cursor) runs on `ghostTransitSpeedPercent`; the survivor reflow runs on
  // `survivorReflowSpeedPercent`. The master gate collapses both to instant.
  const ghostTransitDurationMs: number = dragAnimationEnabled
    ? resolveDragAnimationDurationMs(ghostTransitSpeedPercent)
    : INSTANT_DRAG_DURATION_MS;
  const survivorReflowDurationMs: number = dragAnimationEnabled
    ? resolveDragAnimationDurationMs(survivorReflowSpeedPercent)
    : INSTANT_DRAG_DURATION_MS;
  // Parity = equal resolved timing. The coherent dip is only geometrically valid
  // at parity; the bounce overshoot is per-element and parity-independent.
  const speedsParity: boolean = dragSpeedsAtParity(
    ghostTransitSpeedPercent,
    survivorReflowSpeedPercent,
  );
  const swapBounceMagnitude: number = dragAnimationEnabled
    ? clampSwapBounceMagnitudePercent(swapBounceMagnitudePercent)
    : 0;
  // Consumer-configurable drag easing (HT-ANIM-EASING-CONFIG). The ghost hop /
  // pickup / cursor transit uses `resolvedHopEasing`; the survivor FLIP settle
  // uses `resolvedReflowEasing`, which falls back to the hop curve when its own
  // prop is unset so the two read as one motion. Invalid / empty strings resolve
  // to the snappy-decel default rather than reaching the compositor broken.
  const resolvedHopEasing: string = resolveDragEasing(
    dragHopEasing,
    DEFAULT_DRAG_HOP_EASING,
  );
  const resolvedReflowEasing: string = resolveDragEasing(
    dragReflowEasing,
    resolvedHopEasing,
  );
  const interactionCapabilities: ResolvedTilingInteractionCapabilities =
    React.useMemo(
      (): ResolvedTilingInteractionCapabilities =>
        resolveInteractionCapabilities(interaction),
      [interaction],
    );
  // PER-SUBTREE static drag gate (HT-SIZING-STATIC-DRAG-GATING). `isRearrangeEnabled`
  // is now the capability master switch ALONE — it is no longer ANDed with a
  // whole-tree static flag. The static geometry is handled per-leaf instead:
  // `collectLeafFootprints` is static-aware (a pinned static pane gets its exact
  // extent, the flexible sibling fills), and `rearrangeGatedLeafIds` marks the
  // leaves that are NOT drag participants (the static panes themselves + any
  // unpinned-static subtree whose distribution is unknowable). Flexible regions
  // elsewhere stay fully rearrangeable. See _agent/drag-core-ssot-design.md §4.
  const isRearrangeEnabled: boolean = interactionCapabilities.rearrange;
  const rearrangeGatedLeafIds: ReadonlySet<string> = React.useMemo(
    (): ReadonlySet<string> => collectStaticGatedLeafIds(layout),
    [layout],
  );
  const isLeafRearrangeEligible = React.useCallback(
    (leafId: string): boolean =>
      isRearrangeEnabled && !rearrangeGatedLeafIds.has(leafId),
    [isRearrangeEnabled, rearrangeGatedLeafIds],
  );
  // Live drag-mode (Hyprland-style detach-source + frozen tree + cursor-following
  // ghost + commit-on-release) follows the capability master switch. A static
  // pane can no longer enter live mode for ITSELF (the per-leaf gate refuses its
  // pickup), but flexible panes in the same tree CAN — the per-leaf gate at
  // pickup + target resolution preserves the "no wrong live geometry" invariant.
  const liveDragModeEnabled: boolean =
    isRearrangeEnabled && interactionCapabilities.dragMode === "live";
  // Drag / transition self-healing recovery knobs. `enable` gates the idle
  // watchdog (M3) + explicit transient-style teardown (M4) + visibilitychange
  // reconcile (M5); the rAF-with-timeout animation arming (M1) is always on as a
  // pure backstop (it cannot alter the happy path). `frameDeadlineMs` feeds M1.
  const isDragRecoveryEnabled: boolean = interactionCapabilities.dragRecovery.enable;
  const dragRecoveryMaxIdleMs: number = interactionCapabilities.dragRecovery.maxDraggingIdleMs;
  const dragRecoveryFrameDeadlineMs: number = interactionCapabilities.dragRecovery.frameDeadlineMs;
  // M2 transition-completion slack: the survivor-reflow clip-mask close fires on
  // `transitionend` OR `survivorReflowDurationMs + transitionSlackMs`, whichever
  // first (`onTransitionSettled`). Names the historical `+60` mask slack as a
  // single typed knob; always read (M2 is a pure backstop, like M1).
  const dragRecoveryTransitionSlackMs: number =
    interactionCapabilities.dragRecovery.transitionSlackMs;
  const isFocusSelectionEnabled: boolean = interactionCapabilities.focus;
  const isMaximizeEnabled: boolean = interactionCapabilities.maximize.enable;
  const isTitleBarSizingEnabled: boolean =
    interactionCapabilities.paneTitleBarControls.sizing;
  const isTitleBarAcquireSpaceEnabled: boolean =
    interactionCapabilities.paneTitleBarControls.acquireSpace;
  const isPaneSwitchingEnabled: boolean =
    interactionCapabilities.paneSwitching.enable;
  const showTabStrip: boolean =
    isPaneSwitchingEnabled &&
    interactionCapabilities.paneSwitching.showTabStrip;
  const showContentToggle: boolean =
    interactionCapabilities.paneSwitching.showContentToggle;
  // Single source of truth for pane-content visibility. When the toggle control
  // is suppressed (`showContentToggle === false`), the embedding owns content
  // and there is no control to flip it, so content is treated as visible by
  // default — seated tiles AND the drag ghost share this one flag, so the ghost
  // body matches the in-tree body. When the toggle is shown, the legacy default
  // (content off until the checkbox is flipped) is preserved.
  const [isPaneContentVisible, setIsPaneContentVisible] =
    React.useState<boolean>(resolveInitialPaneContentVisible(showContentToggle));
  const isMasterLayoutEnabled: boolean = interactionCapabilities.masterLayout;
  const isGroupingEnabled: boolean = interactionCapabilities.grouping;
  const showSwitcherOverlay: boolean =
    isPaneSwitchingEnabled &&
    interactionCapabilities.paneSwitching.showSwitcherOverlay;
  // Double-click a tab to toggle its leaf's maximize. Gated by BOTH the
  // pane-switching `tabDoubleClickMaximize` opt-out AND the `maximize`
  // capability (a tab cannot maximize when maximize itself is disabled). The
  // dispatch is routed through `dispatchCommand` so it converges with the
  // `Alt+Enter` keybinding on one maximize state.
  const tabDoubleClickMaximizeEnabled: boolean =
    isMaximizeEnabled &&
    interactionCapabilities.paneSwitching.tabDoubleClickMaximize;
  const keymap: ResolvedTilingKeymap = interactionCapabilities.keymap;
  // Any divider resize is enabled unless the resize capability is `"none"`; the
  // per-axis filter (`isResizeAxisEnabled`) still applies to a SPECIFIC split at
  // execution time, so this gate only short-circuits a wholly-disabled resize.
  const isResizeEnabled: boolean = interactionCapabilities.resize !== "none";
  // Capability gates for the public command router (`commands.ts`). Both the
  // keyboard path and the imperative `dispatch` consult these so a command
  // targeting a disabled capability stays a safe no-op.
  const commandGates: TilingCommandGates = React.useMemo(
    (): TilingCommandGates => ({
      maximizeEnabled: isMaximizeEnabled,
      paneSwitchingEnabled: isPaneSwitchingEnabled,
      focusEnabled: isFocusSelectionEnabled,
      rearrangeEnabled: isRearrangeEnabled,
      sizingEnabled: isTitleBarSizingEnabled,
      acquireSpaceEnabled: isTitleBarAcquireSpaceEnabled,
      resizeEnabled: isResizeEnabled,
      layoutEnabled: interactionCapabilities.masterLayout,
      groupingEnabled: interactionCapabilities.grouping,
    }),
    [
      isMaximizeEnabled,
      isPaneSwitchingEnabled,
      isFocusSelectionEnabled,
      isRearrangeEnabled,
      isTitleBarSizingEnabled,
      isTitleBarAcquireSpaceEnabled,
      isResizeEnabled,
      interactionCapabilities.masterLayout,
      interactionCapabilities.grouping,
    ],
  );
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const isPointerWithinRootRef = React.useRef<boolean>(false);
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const splitContainerRefs = React.useRef<Map<string, HTMLDivElement>>(
    new Map(),
  );
  const groupTabStripRefs = React.useRef<Map<string, HTMLDivElement>>(
    new Map(),
  );
  const clearCancelVisualTimeoutRef = React.useRef<number | null>(null);
  const [viewportSize, setViewportSize] = React.useState<{
    width: number;
    height: number;
  }>({
    width: 0,
    height: 0,
  });
  const [resizeState, setResizeState] =
    React.useState<DynamicSplitResizeState | null>(null);
  // SINGLE drag-lifecycle owner (Pointer Events + explicit FSM). Replaces the
  // scattered HTML5-DnD state slots (`dragSourceLeafId` / `dropState` /
  // `dragHoverLeafId` / `dragVisualState` useStates + `didDropSucceedRef` /
  // `stableDropStateRef`). Every terminal pointer event routes
  // `dragging → settling → idle`, so a teardown edge can never be missed.
  const [dragState, dispatchDrag] = React.useReducer(
    dragMachineReducer,
    DRAG_MACHINE_INITIAL_STATE,
  );
  // Latest FSM state mirrored to a ref so the window-level pointer listeners read
  // the current phase synchronously without re-subscribing on every move.
  const dragStateRef = React.useRef<DragMachineState>(dragState);
  // The ghost snapshot is captured once on pickup (the source content rides the
  // cursor); held in a ref so the cancel fly-back can read it after the FSM has
  // already advanced past `dragging`.
  const dragSnapshotRef = React.useRef<DynamicDragPaneSnapshot | null>(null);
  // The pointerId the drag captured on the stable root element, for release on settle.
  const capturedPointerIdRef = React.useRef<number | null>(null);
  const [cancelVisualState, setCancelVisualState] =
    React.useState<DynamicDragCancelVisualState | null>(null);
  // The measured rect (client coords) of the resolved slot's reservation — the
  // single ghost hops INTO and FILLS this. `null` while free-following the
  // cursor (no target) or when the slot is off-screen/degenerate (§10 clamp).
  const [seatFootprint, setSeatFootprint] =
    React.useState<DynamicPaneFootprint | null>(null);
  // The cursor position captured when the current slot became seated — the
  // anchor the `delta-responsive` commitment policy measures re-aim travel from.
  const seatAnchorRef = React.useRef<DragMachinePoint | null>(null);
  // The single authoritative committable seat — the slot the drop commits to,
  // written synchronously on every processed pointer sample via
  // `deriveCommittableSeat`. The RELEASE path commits THIS verbatim instead of
  // re-resolving the drop target from the `pointerup` coordinates, so a seated
  // committable drop can never be clobbered to a cancel by release-time
  // re-resolution (over a gap / off the gap-closed hit footprint). Being a ref
  // written in the sample task, it is also free of the passive-effect lag that
  // `dragStateRef` carries. Cleared at settle. See `drag-machine.ts`.
  const committableSeatRef = React.useRef<DynamicDropState | null>(null);
  // Survivor-reflow FLIP bookkeeping. `previousLeafRectsRef` holds each surviving
  // leaf's clean (transform-stripped) client rect from the previous commit — the
  // FLIP `First` for an at-rest reflow. Kept fresh on EVERY commit (even idle) so
  // the first pickup reflow has a valid First. `survivorFlipRafRef` is the single
  // play-frame handle (one rAF per reflow batch).
  const previousLeafRectsRef = React.useRef<Map<string, SurvivorRect>>(
    new Map(),
  );
  /** TRUE once a survivor-reflow layout effect has run with `phase === "dragging"`. */
  const didPaintDraggingFrameRef = React.useRef<boolean>(false);
  // The single play-frame handle (one per reflow batch) — an M1 raced
  // (rAF-or-timeout) handle so a starved frame cannot freeze the survivors at
  // their inverted First.
  const survivorFlipRafRef = React.useRef<RacedFrameHandle | null>(null);
  // In-flight coherent-transit (swap) survivor dip animations (Web Animations),
  // tracked so a re-derived reflow batch can cancel them before re-measuring.
  const survivorDipAnimationsRef = React.useRef<Animation[]>([]);
  // While survivors are gliding, the structural layout containers (section /
  // split-child / leaf wrapper) switch from `overflow-hidden` to
  // `overflow-visible` so a transformed survivor is not clipped by its own slot
  // mid-glide (the pane CONTENT keeps the article's own `overflow-hidden`, so
  // nothing actually spills). This flag outlives the FSM `settling → idle`
  // transition (the cancel-settle glide plays AFTER `idle`), reset by a timer
  // sized to the reflow duration so the clip mask returns once the glide lands.
  const [isSurvivorReflowAnimating, setIsSurvivorReflowAnimating] =
    React.useState<boolean>(false);
  // M2 transition-completion handle for the clip-mask close (replaces the bare
  // `setTimeout(survivorReflowDurationMs + 60)`): closes the mask on the survivor
  // `transitionend` OR the `duration + transitionSlackMs` starvation backstop,
  // whichever first. Cancelable + re-armed per reflow batch.
  const survivorReflowEndHandleRef = React.useRef<TransitionSettledHandle | null>(
    null,
  );
  // M4 idempotent transient-style teardown for the survivor leaves: clear any
  // residual FLIP transform/transition on every `[data-leaf-id]` element and
  // cancel the tracked WAAPI dips + the raced play handle. Safe to call on every
  // exit path (settle teardown, watchdog expiry, visibilitychange reconcile) —
  // clearing to identity and cancelling a finished handle are both no-ops. The
  // ghost node is owned by `DragPaneOverlay` (cleaned up by its own effect on
  // unmount), so it is not reachable here and is intentionally `null`.
  const stripSurvivorTransientStyles = React.useCallback((): void => {
    const viewport: HTMLDivElement | null = viewportRef.current;
    const leaves: TransientDragStyleTarget[] =
      viewport == null
        ? []
        : Array.from(viewport.querySelectorAll<HTMLElement>("[data-leaf-id]"));
    stripTransientDragStyles({
      ghost: null,
      leaves,
      animations: survivorDipAnimationsRef.current,
      racedHandles: survivorFlipRafRef.current == null ? [] : [survivorFlipRafRef.current],
    });
    survivorDipAnimationsRef.current = [];
    survivorFlipRafRef.current = null;
  }, []);
  // Selectors off the single FSM state — the renderer reads these exactly where
  // it used to read the old useState slots.
  const dragSourceLeafId: string | null = activeDragSourceLeafId(dragState);
  const dropState: DynamicDropState | null = activeResolvedTarget(dragState);
  const presentationSourceLeafId: string | null =
    presentationDragSourceLeafId(dragState);
  const presentationDropState: DynamicDropState | null =
    presentationResolvedTarget(dragState);
  const dragSettlingOutcome: "commit" | "cancel" | null =
    dragState.phase === "settling" ? dragState.outcome : null;
  // A drag gesture is materially in flight whenever the FSM is NOT idle
  // (`armed` / `dragging` / `settling`). Drives the `select-none` gate on the
  // tiling root so the browser cannot run its native pointer-drag text
  // selection across pane bodies mid-gesture; restored to default (selectable)
  // the instant the FSM returns to `idle`, so normal text selection in panes
  // still works at rest.
  const isDragGestureActive: boolean = dragState.phase !== "idle";
  const [internalFocusedLeafId, setInternalFocusedLeafId] = React.useState<
    string | null
  >(null);
  const [internalMaximizedLeafId, setInternalMaximizedLeafId] = React.useState<
    string | null
  >(null);
  const [paneSwitcherState, setPaneSwitcherState] =
    React.useState<TilingPaneSwitcherState | null>(null);
  const paneSwitcherStateRef = React.useRef<TilingPaneSwitcherState | null>(
    null,
  );
  // Keyboard MOVE MODE — the accessible analog of a drag pickup. Held in state
  // (drives the visual affordance) + mirrored to a ref so the document keydown
  // listener reads the latest without re-subscribing on every arrow press.
  const [moveModeState, setMoveModeState] =
    React.useState<TilingMoveModeState | null>(null);
  const moveModeStateRef = React.useRef<TilingMoveModeState | null>(null);
  // MRU focus history (HT-NAV-MRU-FOCUS-TOGGLE). A ref, not state: pushing on
  // every focus change must not re-render, and the `focus-current-or-last`
  // command reads the latest synchronously at dispatch time. Pruned against the
  // live leaf-id set on layout change so a removed pane is never re-focused.
  const focusHistoryRef = React.useRef<FocusHistory>(EMPTY_FOCUS_HISTORY);
  const paneHitZonesAlphaSafe: number = clampUnitInterval(paneHitZonesAlpha);

  // PART 2 — STATIC captures the actual current bbox. On a title-bar STATIC
  // action we MEASURE the pane's rendered box (getBoundingClientRect on its
  // `[data-leaf-id]` element) at click time and pin the chosen dimension(s) to
  // that exact pixel value via `measuredStaticSizing`; FLEX clears the pin
  // (`setLeafSizing(..., undefined)`). Controlled: emitted through onLayoutChange.
  const setLeafSizingFromBbox = React.useCallback(
    (targetLeafId: string, mode: TilingTitleBarSizingMode): void => {
      if (mode === "flexible") {
        onLayoutChange(setLeafSizing(layout, targetLeafId, undefined));
        return;
      }
      // Resolve via `rootRef` (matching the focus/maximize paths at L2081/L2440)
      // instead of `viewportRef`, so a pane rendered outside the viewport subtree
      // still resolves — eliminating the viewport-scope miss that returned `null`
      // and pinned a zero extent.
      const paneElement: HTMLElement | null =
        rootRef.current?.querySelector<HTMLElement>(
          `[data-leaf-id="${targetLeafId}"]`,
        ) ?? null;
      const rect: DOMRect | undefined = paneElement?.getBoundingClientRect();
      // Guard the zero-pin collapse: a missing element / zero-area rect must NOT
      // commit a `*Px:0` pin (a zero pin + flexShrink:0 collapses the leaf and
      // surfaces dead space). On a missing measurement leave the pane flexible
      // (no-op the switch) rather than pinning zero.
      if (rect == null) {
        return;
      }
      const measuredWidthPx: number = Math.round(rect.width);
      const measuredHeightPx: number = Math.round(rect.height);
      // `measuredStaticSizing` drops the static pin for any non-positive measured
      // dimension and returns undefined when no positive static dimension remains
      // for the mode; in that case no-op (do not clear/pin) so the pane stays as is.
      const sizing: TilingPaneSizing | undefined = measuredStaticSizing(
        mode,
        measuredWidthPx,
        measuredHeightPx,
      );
      if (sizing == null) {
        return;
      }
      onLayoutChange(setLeafSizing(layout, targetLeafId, sizing));
    },
    [layout, onLayoutChange],
  );

  // PART 3 — directional annex + re-seed (aggressive eviction). The arrows claim
  // the ENTIRE vector to the edge in `direction`, structurally evicting every
  // pane in that vector at any nesting depth (non-aligned / differently-nested
  // columns included) and re-seeding them into the complementary region pinned
  // at minimum — `annexDirection`. The viewport's main-axis extent is the
  // container bound; config supplies the gap + per-pane minimum so the re-seeded
  // panes clamp to minimum (never zero). When nothing lies in the vector (active
  // already at the edge) `annexDirection` falls through to the ratio-only claim.
  // Controlled.
  const acquireLeafSpace = React.useCallback(
    (targetLeafId: string, direction: DynamicFocusDirection): void => {
      const viewportRect: DOMRect | undefined =
        viewportRef.current?.getBoundingClientRect();
      const isHorizontalAnnex: boolean =
        direction === "left" || direction === "right";
      const viewportWidthPx: number = viewportRect?.width ?? viewportSize.width;
      const viewportHeightPx: number =
        viewportRect?.height ?? viewportSize.height;
      const axisContainerSizePx: number = isHorizontalAnnex
        ? viewportWidthPx
        : viewportHeightPx;
      // Perpendicular (off-axis) viewport extent — sizes the annex off-axis re-seed
      // band + decides the L3 min-size spill (`reseedEvicted`).
      const crossContainerSizePx: number = isHorizontalAnnex
        ? viewportHeightPx
        : viewportWidthPx;
      const constraints: TilingGrowConstraints = {
        containerSizePx: axisContainerSizePx > 0 ? axisContainerSizePx : 1,
        gapPx: config.gapPx,
        minPaneSizePx: config.minPaneSizePx,
        crossSizePx: crossContainerSizePx > 0 ? crossContainerSizePx : 1,
      };
      onLayoutChange(
        annexDirection(layout, targetLeafId, direction, constraints),
      );
    },
    [
      config.gapPx,
      config.minPaneSizePx,
      layout,
      onLayoutChange,
      viewportSize.height,
      viewportSize.width,
    ],
  );

  React.useEffect((): void => {
    paneSwitcherStateRef.current = paneSwitcherState;
  }, [paneSwitcherState]);

  React.useEffect((): void => {
    moveModeStateRef.current = moveModeState;
  }, [moveModeState]);

  React.useEffect((): void => {
    dragStateRef.current = dragState;
  }, [dragState]);

  // Latest slot-commitment policy mirrored to a ref so the coalescer (subscribed
  // once per drag) reads runtime mode/delta changes (e.g. the showcase toggle)
  // without re-subscribing.
  const slotCommitmentRef =
    React.useRef<ResolvedTilingSlotCommitmentCapability>(
      interactionCapabilities.slotCommitment,
    );
  React.useEffect((): void => {
    slotCommitmentRef.current = interactionCapabilities.slotCommitment;
  }, [interactionCapabilities.slotCommitment]);

  // Latest touch long-press delay mirrored to a ref so the input-layer effect
  // (subscribed once per drag, keyed on the owning pointer id) arms the
  // long-press timer with the current value without re-subscribing on a runtime
  // capability change (e.g. the showcase slider).
  const touchLongPressMsRef = React.useRef<number>(
    interactionCapabilities.touchDrag.longPressMs,
  );
  React.useEffect((): void => {
    touchLongPressMsRef.current = interactionCapabilities.touchDrag.longPressMs;
  }, [interactionCapabilities.touchDrag.longPressMs]);

  const leafIds: ReadonlyArray<string> = React.useMemo(
    (): ReadonlyArray<string> => readLeafNodeIds(layout),
    [layout],
  );
  // Prune the MRU focus history whenever the live leaf-id set changes so a pane
  // removed from the tree is never returned by the focus-current-or-last toggle.
  React.useEffect((): void => {
    focusHistoryRef.current = pruneFocusHistory(
      focusHistoryRef.current,
      leafIds,
    );
  }, [leafIds]);
  const leafFootprintsById: ReadonlyMap<string, DynamicPaneFootprint> =
    React.useMemo(
      (): ReadonlyMap<string, DynamicPaneFootprint> =>
        footprintsByLeafId(
          collectLeafFootprints(
            layout,
            0,
            0,
            viewportSize.width,
            viewportSize.height,
            config,
          ),
        ),
      [config, layout, viewportSize.height, viewportSize.width],
    );
  const activeFocusedLeafId: string | null =
    focusedLeafId ?? internalFocusedLeafId;
  const controlledMaximizedLeafId: string | null =
    maximizedLeafId !== undefined ? maximizedLeafId : internalMaximizedLeafId;
  // A maximized id that no longer maps to a live leaf (e.g. layout changed)
  // collapses to restored — keeps maximize render-mode non-destructive + safe.
  const activeMaximizedLeafId: string | null =
    isMaximizeEnabled &&
    controlledMaximizedLeafId != null &&
    findLeafById(layout, controlledMaximizedLeafId) != null
      ? controlledMaximizedLeafId
      : null;
  const paneTabs: ReadonlyArray<PaneTabDescriptor> = React.useMemo(
    (): ReadonlyArray<PaneTabDescriptor> =>
      leafIds.map((leafId: string): PaneTabDescriptor => {
        const leaf: DynamicLeafNode | null = findLeafById(layout, leafId);
        const tile: DynamicTile | undefined =
          leaf != null ? resolveTile(tiles, leaf.tileId) : undefined;
        return {
          leafId,
          title: tile?.title ?? leafId,
          accent: tile?.accent ?? "cyan",
        };
      }),
    [layout, leafIds, tiles],
  );
  // Focused tile + its current accent — the target the top-bar accent picker
  // recolors. Null when nothing is focused or the focused leaf has no tile.
  const focusedTileAccentTarget: {
    tileId: string;
    accent: DynamicTileAccent;
  } | null = React.useMemo(() => {
    if (activeFocusedLeafId == null) {
      return null;
    }
    const leaf: DynamicLeafNode | null = findLeafById(
      layout,
      activeFocusedLeafId,
    );
    if (leaf == null) {
      return null;
    }
    const tile: DynamicTile | undefined = resolveTile(tiles, leaf.tileId);
    if (tile == null) {
      return null;
    }
    return { tileId: leaf.tileId, accent: tile.accent ?? "cyan" };
  }, [activeFocusedLeafId, layout, tiles]);
  const tabStripAccentPicker: PaneTabStripAccentPicker | null =
    React.useMemo(() => {
      if (onTileAccentChange == null || focusedTileAccentTarget == null) {
        return null;
      }
      const targetTileId: string = focusedTileAccentTarget.tileId;
      return {
        activeAccent: focusedTileAccentTarget.accent,
        onSelect: (accent: DynamicTileAccent): void =>
          onTileAccentChange(targetTileId, accent),
      };
    }, [focusedTileAccentTarget, onTileAccentChange]);
  // Theme switcher config for the top bar — present only when the consumer wires
  // `onThemeChange` (controlled `themeId`). Mirrors the accent-picker pattern:
  // the active theme id (for the active-chip highlight) + a commit callback.
  const tabStripThemePicker: PaneTabStripThemePicker | null =
    React.useMemo(() => {
      if (onThemeChange == null) {
        return null;
      }
      return {
        activeThemeId: theme.id,
        onSelect: onThemeChange,
      };
    }, [onThemeChange, theme.id]);
  const paneShortcutChips: ReadonlyArray<PaneShortcutChipDescriptor> =
    React.useMemo(
      (): ReadonlyArray<PaneShortcutChipDescriptor> =>
        resolvePaneShortcutChips({
          keymap,
          commandGates,
          layout,
          leafIds,
          activeFocusedLeafId,
          activeMaximizedLeafId,
          focusHistory: focusHistoryRef.current,
          isLeafRearrangeEligible,
        }),
      [
        keymap,
        commandGates,
        layout,
        leafIds,
        activeFocusedLeafId,
        activeMaximizedLeafId,
        isLeafRearrangeEligible,
      ],
    );
  const projectedDropLayout: DynamicLayoutNode | null = React.useMemo(
    (): DynamicLayoutNode | null =>
      resolveProjectedDropLayout(layout, dragSourceLeafId, dropState),
    [dragSourceLeafId, dropState, layout],
  );
  // TRUE live reflow: in live mode the rendered tree IS the derived candidate
  // tree (the destination physically reorganizes to the post-drop result), NOT a
  // frozen tree with a projected shadow. Recomputed only when the resolved
  // (target leaf, zone, action) triple changes — always from the ORIGINAL prop
  // `layout`, so zone jitter cannot accumulate and the committed tree equals the
  // last candidate (no release-time jump). Preview mode keeps the prop layout and
  // paints the projected overlays on top (System A/B). See drag-machine.ts.
  const resolvedTargetLeafId: string | null =
    presentationDropState?.leafId ?? null;
  const resolvedTargetZone: DynamicLeafDropZone | null =
    presentationDropState?.zone ?? null;
  const resolvedTargetAction: DynamicDropState["action"] | null =
    presentationDropState?.action ?? null;
  // The candidate-tree leaf that CARRIES the dragged content — the slot the
  // single ghost reserves + hops into. For `swap` this is the resolved TARGET
  // leaf (tileIds swap in place, so the dragged content lands there and the
  // source slot shows the displaced pane); for `edge-insert` it is the source
  // leaf; `null` (gap-close) → no reservation, ghost free-follows. Reserving /
  // seating on THIS leaf (not blindly the source leaf) is what keeps a swap
  // preview single-instance + identical to the commit. See drag-machine.ts.
  const ghostSeatLeafId: string | null = resolveDragGhostSeatLeafId(
    presentationSourceLeafId,
    presentationDropState,
  );
  const liveCandidateDisplayLayout: DynamicLayoutNode = React.useMemo(
    (): DynamicLayoutNode =>
      deriveCandidateTree(layout, dragSourceLeafId, dropState),
    // dropState identity changes on every pointer move (ghost), so key on the
    // load-bearing resolve triple instead — identical resolves are free.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      layout,
      dragSourceLeafId,
      resolvedTargetLeafId,
      resolvedTargetZone,
      resolvedTargetAction,
    ],
  );
  // On a COMMIT settle the FSM has already left `dragging` (so `dragSourceLeafId`
  // is null), but `onLayoutChange(deriveCandidateTree(...))` has not landed yet.
  // Hold the committed candidate for that frame so the display does NOT briefly
  // revert to the original (pre-drag) layout before the commit prop arrives —
  // that revert would otherwise make the survivors snap back then forward (a
  // release-time jump). Keeping the seated candidate means the committed tree
  // equals the last dragging frame: survivors are already in place, so the
  // commit shows zero survivor motion (correct — they glided when the slot
  // opened). A CANCEL settle deliberately does NOT take this branch, so the
  // display falls back to the original `layout` and the survivors glide back to
  // re-accommodate the restored source.
  const settlingCommitCandidate: DynamicLayoutNode | null =
    React.useMemo((): DynamicLayoutNode | null => {
      if (
        !liveDragModeEnabled ||
        dragState.phase !== "settling" ||
        dragState.outcome !== "commit" ||
        dragState.resolvedTarget == null
      ) {
        return null;
      }
      return deriveCandidateTree(
        layout,
        dragState.sourceLeafId,
        dragState.resolvedTarget,
      );
    }, [dragState, layout, liveDragModeEnabled]);
  const displayLayout: DynamicLayoutNode =
    liveDragModeEnabled && dragSourceLeafId != null
      ? liveCandidateDisplayLayout
      : (settlingCommitCandidate ?? layout);
  // During a live drag (and the brief cancel-settle glide tail) the structural
  // layout containers go `overflow-visible` so gliding survivors are not clipped
  // by their own slot mid-FLIP. Only flips the structural divs — the article
  // keeps its own `overflow-hidden`, so pane content never spills.
  const isSurvivorReflowOverflowWindow: boolean =
    liveDragModeEnabled &&
    (dragState.phase === "dragging" || isSurvivorReflowAnimating);
  // The cursor-following ghost is derived from the FSM dragging state + the
  // pickup snapshot ref (no separate ghost useState to keep in sync).
  const dragVisualState: DynamicDragVisualState | null =
    React.useMemo((): DynamicDragVisualState | null => {
      if (dragState.phase !== "dragging" || dragSnapshotRef.current == null) {
        return null;
      }
      return {
        sourceLeafId: dragState.sourceLeafId,
        sourceFootprint: dragState.anchorFootprint,
        activeFootprint: dragState.ghostFootprint,
        seatFootprint,
        pointerAnchorOffsetX: dragState.pointerAnchorOffset.x,
        pointerAnchorOffsetY: dragState.pointerAnchorOffset.y,
        snapshot: dragSnapshotRef.current,
      };
    }, [dragState, seatFootprint]);
  // Custom drag cursor (tier "c"): a transform-pinned element that REPLACES the
  // OS cursor during a live drag. Gated on the SDK capability flag + live mode;
  // the presentation is derived from the SAME FSM-resolved target the ghost /
  // candidate tree read (no second resolution path), so the cursor's
  // arrow/validity always agrees with the drop the release would commit.
  const dragCursorEnabled: boolean =
    liveDragModeEnabled && interactionCapabilities.customCursor;
  const prefersReducedMotion: boolean = usePrefersReducedMotion();
  const dragCursorPresentation: DragCursorPresentation = React.useMemo(
    (): DragCursorPresentation =>
      resolveDragCursorPresentation(
        activeResolvedTarget(dragState),
        activeDragSourceLeafId(dragState) ?? "",
      ),
    [dragState],
  );
  const isCustomCursorActive: boolean =
    dragCursorEnabled && dragVisualState != null;
  // Coherent non-intersecting transit for the SWAP survivor (the displaced
  // target): when on, the surviving boxes dip toward ~70% mid-reflow in lockstep
  // with the ghost so the two crossing boxes never visually collide. Only the
  // swap case needs it (edge-insert boxes never trade places); gated off under
  // reduced motion. See `ghost-transit.ts` §7.
  const survivorCoherentDipActive: boolean =
    shouldApplyCoherentTransitDip({
      enabled: interactionCapabilities.coherentTransit,
      action: resolvedTargetAction,
      reducedMotion: prefersReducedMotion,
      speedsParity,
    }) && dragState.phase === "dragging";
  // Measure the resolved slot's reservation rect (client coords) so the single
  // ghost can hop INTO and FILL it. Runs after the candidate-tree DOM mutation
  // (layout effect, before paint), keyed on the resolve triple + viewport (NOT
  // per cursor move — the slot rect is stable per resolved target). Off-screen /
  // degenerate slots clear the seat → the ghost stays free-following (§10).
  React.useLayoutEffect((): void => {
    const isPresentationDragging: boolean = isDragPresentationActive(
      dragState.phase,
      dragSettlingOutcome,
    );
    if (
      !liveDragModeEnabled ||
      // `slotHopInEnabled: false` deliberately skips the hop-in: the seat is
      // never measured, so the ghost free-follows the cursor and the in-tree
      // content-less reservation slot stays shown (the reservation-plus-ghost
      // duality). `true` (default) measures the seat so the single ghost hops
      // INTO and FILLS it as the single instance.
      !interactionCapabilities.slotHopInEnabled ||
      !isPresentationDragging ||
      presentationSourceLeafId == null ||
      ghostSeatLeafId == null ||
      resolvedTargetLeafId == null
    ) {
      setSeatFootprint(null);
      return;
    }
    // SCOPED to the ghost-seat leaf (`cc23956`). Resolves only because the
    // reserved-slot wrapper emits `data-leaf-id={node.id}` below — without that
    // the descendant selector can never match a `DragSourceSlotReservation`
    // (which carries no `data-leaf-id`), which is the `cc23956` regression.
    const reservationSelector: string =
      dragSourceReservationSelector(ghostSeatLeafId);
    const reservationElement: HTMLElement | null =
      rootRef.current?.querySelector<HTMLElement>(reservationSelector) ?? null;
    if (reservationElement == null) {
      setSeatFootprint(null);
      return;
    }
    const rect: DOMRect = reservationElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      setSeatFootprint(null);
      return;
    }
    const viewportRect: DOMRect | undefined =
      viewportRef.current?.getBoundingClientRect();
    if (
      viewportRect != null &&
      (rect.right < viewportRect.left ||
        rect.left > viewportRect.right ||
        rect.bottom < viewportRect.top ||
        rect.top > viewportRect.bottom)
    ) {
      setSeatFootprint(null);
      return;
    }
    setSeatFootprint({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    liveDragModeEnabled,
    interactionCapabilities.slotHopInEnabled,
    dragState.phase,
    dragSettlingOutcome,
    presentationSourceLeafId,
    ghostSeatLeafId,
    resolvedTargetLeafId,
    resolvedTargetZone,
    resolvedTargetAction,
    displayLayout,
    viewportSize.width,
    viewportSize.height,
  ]);
  // Survivor-reflow FLIP. Runs after every candidate-tree commit (layout effect,
  // before paint). When a live drag is materially in flight (`dragging` or a
  // `settling` teardown), each surviving leaf glides from its previous rect
  // (First) to its committed rect (Last) via a transform-only animation instead
  // of snapping. Outside a drag it ONLY records the clean rects (no animation),
  // so the FLIP never fires on a resize / sizing / external layout change — and
  // the next pickup has a valid First. The single ghost is unaffected: it is a
  // `position: fixed` sibling (never a `[data-leaf-id]` element) and carries its
  // own hop FLIP, so the single-instance invariant is preserved.
  React.useLayoutEffect((): (() => void) | void => {
    const viewport: HTMLDivElement | null = viewportRef.current;
    if (viewport == null) {
      return;
    }
    const leafElements: ReadonlyArray<HTMLElement> = Array.from(
      viewport.querySelectorAll<HTMLElement>("[data-leaf-id]"),
    );
    if (dragState.phase === "dragging") {
      didPaintDraggingFrameRef.current = true;
    }
    const playReflow: boolean =
      liveDragModeEnabled &&
      (dragState.phase === "dragging" || dragState.phase === "settling");
    const snapSettleCommit: boolean = shouldSnapSurvivorReflowOnSettleCommit({
      liveDragModeEnabled,
      dragPhase: dragState.phase,
      settleOutcome:
        dragState.phase === "settling" ? dragState.outcome : null,
      didPaintDraggingFrame: didPaintDraggingFrameRef.current,
    });
    if (!playReflow) {
      didPaintDraggingFrameRef.current = false;
    }
    // Clamp boundary = the host container's visible region intersected with the
    // window, so a survivor scrolled out of the host (or off the window) is
    // snapped, never tweened across a large off-screen offset (§10).
    const viewportDomRect: DOMRect = viewport.getBoundingClientRect();
    const clampLeft: number = Math.max(viewportDomRect.left, 0);
    const clampTop: number = Math.max(viewportDomRect.top, 0);
    const clampRight: number = Math.min(
      viewportDomRect.right,
      typeof window === "undefined" ? viewportDomRect.right : window.innerWidth,
    );
    const clampBottom: number = Math.min(
      viewportDomRect.bottom,
      typeof window === "undefined"
        ? viewportDomRect.bottom
        : window.innerHeight,
    );
    const clampViewport: SurvivorRect = {
      left: clampLeft,
      top: clampTop,
      width: Math.max(0, clampRight - clampLeft),
      height: Math.max(0, clampBottom - clampTop),
    };
    // Cancel any in-flight swap-dip animations before re-measuring so a
    // re-derived reflow batch never stacks two animations on a survivor.
    for (const animation of survivorDipAnimationsRef.current) {
      animation.cancel();
    }
    survivorDipAnimationsRef.current = [];
    const nextLeafRects = new Map<string, SurvivorRect>();
    const playableElements: HTMLElement[] = [];
    const playableDipPlans: Array<{
      element: HTMLElement;
      invert: GhostMorphTransform;
      lastWidth: number;
      lastHeight: number;
    }> = [];
    for (const element of leafElements) {
      const leafId: string | undefined = element.dataset.leafId;
      if (leafId == null) {
        continue;
      }
      if (!playReflow || snapSettleCommit) {
        // Not animating (no drag in flight / drag fully over / fast-flick
        // settle-commit snap): force-strip any leftover inline
        // transform/transition so a leaf can NEVER be left floating — e.g. a
        // coherent-dip WAAPI cancelled mid-flight reverts the node to its
        // pre-animate inverted transform (`fill: none`), which would otherwise
        // persist as a hanging, offset pane. Stripping first also makes the
        // recorded resting rect the true committed box (a clean next-pickup
        // First baseline). The fast-flick snap path uses this branch so a
        // same-task release never arms a source-origin FLIP tween.
        element.style.transition = "none";
        element.style.transform = "none";
        const restingRect: DOMRect = element.getBoundingClientRect();
        nextLeafRects.set(leafId, {
          left: restingRect.left,
          top: restingRect.top,
          width: restingRect.width,
          height: restingRect.height,
        });
        continue;
      }
      // First (interruptible): the live transformed box if mid-flight, else the
      // recorded pre-reflow rect. Read BEFORE the transform is stripped so an
      // in-flight glide retargets smoothly.
      const hasInFlightTransform: boolean =
        window.getComputedStyle(element).transform !== "none";
      const liveDomRect: DOMRect = element.getBoundingClientRect();
      const liveVisualRect: SurvivorRect = {
        left: liveDomRect.left,
        top: liveDomRect.top,
        width: liveDomRect.width,
        height: liveDomRect.height,
      };
      // Strip any prior transform so the committed (Last) box is read clean.
      element.style.transition = "none";
      element.style.transform = "none";
      const lastDomRect: DOMRect = element.getBoundingClientRect();
      const last: SurvivorRect = {
        left: lastDomRect.left,
        top: lastDomRect.top,
        width: lastDomRect.width,
        height: lastDomRect.height,
      };
      nextLeafRects.set(leafId, last);
      const first: SurvivorRect | null = resolveSurvivorFlipFirst({
        recordedPreReflowRect: previousLeafRectsRef.current.get(leafId) ?? null,
        liveVisualRect,
        hasInFlightTransform,
      });
      if (first == null) {
        continue;
      }
      if (!shouldAnimateSurvivorReflow(first, last, clampViewport)) {
        continue;
      }
      const transform = deriveSurvivorFlipTransform(first, last);
      if (transform == null) {
        continue;
      }
      element.style.transformOrigin = "top left";
      element.style.transform = `translate(${transform.dx}px, ${transform.dy}px) scale(${transform.sx}, ${transform.sy})`;
      playableElements.push(element);
      playableDipPlans.push({
        element,
        invert: {
          tx: transform.dx,
          ty: transform.dy,
          sx: transform.sx,
          sy: transform.sy,
        },
        lastWidth: last.width,
        lastHeight: last.height,
      });
    }
    previousLeafRectsRef.current = nextLeafRects;
    if (playableElements.length === 0) {
      return;
    }
    // Open the clip mask (overflow-visible) for the glide, and (re)arm the M2
    // transition-completion guard to close it once the glide lands — on the
    // representative survivor's `transitionend` OR the
    // `survivorReflowDurationMs + transitionSlackMs` starvation backstop,
    // whichever first. Re-armed (cancel + re-arm) on every reflow batch so a
    // rapid open/close keeps the mask open for the whole sequence + tail. In
    // coherent-dip mode the survivors use WAAPI (no `transitionend`), so the
    // timeout backstop closes the mask — identical to the historical `+60` timer.
    setIsSurvivorReflowAnimating(true);
    survivorReflowEndHandleRef.current?.cancel();
    survivorReflowEndHandleRef.current = onTransitionSettled({
      target: playableElements[playableElements.length - 1],
      durationMs: survivorReflowDurationMs,
      transitionSlackMs: dragRecoveryTransitionSlackMs,
      scheduler: WINDOW_TIMER_SCHEDULER,
      onSettled: (): void => {
        survivorReflowEndHandleRef.current = null;
        setIsSurvivorReflowAnimating(false);
      },
    });
    // Force the inverted transforms to paint before arming the transition, then
    // play every survivor to identity on the next frame (one rAF per batch).
    void viewport.getBoundingClientRect();
    // M1: race the play-to-identity write against a timeout so a starved frame
    // never leaves the survivors frozen at their inverted First (the timer-only
    // mask-close at `survivorReflowDurationMs + 60` would otherwise re-clip them
    // while still transformed).
    survivorFlipRafRef.current?.cancel();
    survivorFlipRafRef.current = scheduleFrameOrTimeout(
      WINDOW_FRAME_OR_TIMEOUT_SCHEDULER,
      dragRecoveryFrameDeadlineMs,
      (): void => {
      if (survivorCoherentDipActive) {
        // Coherent transit: keyframe each survivor with the mid-reflow dip so it
        // shrinks + grows in lockstep with the ghost (no mid-cross collision).
        // `fill: none` reverts to the inline style on finish, so onfinish pins
        // the resting identity transform.
        const dipAnimations: Animation[] = [];
        for (const plan of playableDipPlans) {
          const keyframes: Keyframe[] = buildCoherentDipKeyframes(
            plan.invert,
            plan.lastWidth,
            plan.lastHeight,
          );
          const animation: Animation = plan.element.animate(keyframes, {
            duration: survivorReflowDurationMs,
            easing: "linear",
            fill: "none",
          });
          const target: HTMLElement = plan.element;
          // M4: pin the resting identity transform through the shared
          // transient-style stripper so a dip that finishes after a mid-flight
          // cancel still lands clean (idempotent with the settle/watchdog
          // teardown that may have already run).
          animation.onfinish = (): void => {
            stripTransientDragStyles({ ghost: null, leaves: [target] });
          };
          dipAnimations.push(animation);
        }
        survivorDipAnimationsRef.current = dipAnimations;
        return;
      }
      // Standard settle: a dialed-in bounce magnitude substitutes an easeOutBack
      // overshoot (the displaced/affected panes land with a bounce); magnitude 0
      // keeps the historical reflow easing. Per-element, so it is valid under
      // non-parity (split) speeds.
      const reflowEasing: string =
        swapBounceMagnitude > 0
          ? buildBounceEasingCss(swapBounceMagnitude)
          : resolvedReflowEasing;
      for (const element of playableElements) {
        element.style.transition = `transform ${survivorReflowDurationMs}ms ${reflowEasing}`;
        element.style.transform = "none";
      }
    });
    return (): void => {
      survivorFlipRafRef.current?.cancel();
      survivorFlipRafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    displayLayout,
    survivorReflowDurationMs,
    swapBounceMagnitude,
    resolvedReflowEasing,
    dragState.phase,
    liveDragModeEnabled,
    survivorCoherentDipActive,
    dragRecoveryFrameDeadlineMs,
    dragRecoveryTransitionSlackMs,
    viewportSize.width,
    viewportSize.height,
  ]);
  // Cancel the survivor-reflow clip-mask close guard (M2) on unmount.
  React.useEffect((): (() => void) => {
    return (): void => {
      survivorReflowEndHandleRef.current?.cancel();
      survivorReflowEndHandleRef.current = null;
      for (const animation of survivorDipAnimationsRef.current) {
        animation.cancel();
      }
      survivorDipAnimationsRef.current = [];
    };
  }, []);
  // Hit-test footprints for pointer-capture target resolution. In live mode the
  // displayed base is the gap-closed tree (source detached), so resolve against
  // THOSE positions (stable per source — derived once on pickup, never from the
  // reflowing candidate, so there is no moving-target feedback loop). In preview
  // mode the tree is unchanged, so resolve against the original footprints. The
  // memo deps are exactly the stable-reference inputs (layout / source / viewport
  // / config) — `dropState`/candidate is deliberately ABSENT, so reflow cannot
  // shift the hit geometry. See `resolveStableDragHitFootprints`.
  const liveHitFootprintsById: ReadonlyMap<string, DynamicPaneFootprint> =
    React.useMemo(
      (): ReadonlyMap<string, DynamicPaneFootprint> =>
        resolveStableDragHitFootprints(
          liveDragModeEnabled,
          layout,
          dragSourceLeafId,
          viewportSize,
          config,
          leafFootprintsById,
        ),
      [
        config,
        dragSourceLeafId,
        layout,
        leafFootprintsById,
        liveDragModeEnabled,
        viewportSize,
      ],
    );
  const projectedLandingOverlays: ReadonlyArray<DynamicProjectedLandingOverlay> =
    React.useMemo(
      (): ReadonlyArray<DynamicProjectedLandingOverlay> =>
        resolveProjectedLandingOverlays(
          layout,
          projectedDropLayout,
          dragSourceLeafId,
          dropState,
          viewportSize.width,
          viewportSize.height,
          config,
        ),
      [
        config,
        dragSourceLeafId,
        dropState,
        layout,
        projectedDropLayout,
        viewportSize.height,
        viewportSize.width,
      ],
    );
  const paneHitZoneDebugByLeafId: ReadonlyMap<
    string,
    DynamicPaneHitZoneOverlayDebugState
  > = React.useMemo((): ReadonlyMap<
    string,
    DynamicPaneHitZoneOverlayDebugState
  > => {
    if (!showPaneHitZones || !isRearrangeEnabled) {
      return new Map<string, DynamicPaneHitZoneOverlayDebugState>();
    }
    const hitZoneSourceLeafId: string | null =
      dragSourceLeafId ??
      paneHitZoneSourceLeafId ??
      activeFocusedLeafId ??
      null;
    const hitZoneByLeafId: Map<string, DynamicPaneHitZoneOverlayDebugState> =
      new Map<string, DynamicPaneHitZoneOverlayDebugState>();
    for (const leafId of leafIds) {
      // A statically-gated leaf is not a drop participant — no hit zones for it.
      if (rearrangeGatedLeafIds.has(leafId)) {
        continue;
      }
      const targetFootprint: DynamicPaneFootprint | undefined =
        leafFootprintsById.get(leafId);
      if (targetFootprint == null) {
        continue;
      }
      const hitZoneDiagnostics: DynamicDropIntentHitZoneDiagnostics =
        resolveDropIntentHitZoneDiagnostics({
          paneSize: {
            width: targetFootprint.width,
            height: targetFootprint.height,
          },
          geometryConfig: currentGeometryConfig(
            interactionCapabilities.dropHitZoneGeometry,
          ),
          evaluateZone: (
            zone: DynamicLeafDropZone,
          ): { isValid: boolean; rejectionReason: string | null } =>
            evaluateZoneCandidate({
              zone,
              layout,
              sourceLeafId: hitZoneSourceLeafId,
              targetLeafId: leafId,
              targetFootprint,
              config,
              viewportWidth: viewportSize.width,
              viewportHeight: viewportSize.height,
            }),
        });
      const edgeCandidates: ReadonlyArray<DynamicPaneHitZoneCandidateDebugState> =
        hitZoneDiagnostics.edgeZones.map(
          (edgeZoneDiagnostic): DynamicPaneHitZoneCandidateDebugState => ({
            zone: edgeZoneDiagnostic.zone,
            isValid: edgeZoneDiagnostic.isValid,
            rejectionReason: edgeZoneDiagnostic.rejectionReason,
          }),
        );
      const centerIsValid: boolean =
        hitZoneSourceLeafId == null || hitZoneSourceLeafId !== leafId;
      hitZoneByLeafId.set(leafId, {
        leafId,
        dragSourceLeafId: hitZoneSourceLeafId,
        centerRatio: hitZoneDiagnostics.centerRatio,
        centerRatioX: hitZoneDiagnostics.centerRatioX,
        centerRatioY: hitZoneDiagnostics.centerRatioY,
        centerRectWidthPx: hitZoneDiagnostics.centerRectWidthPx,
        centerRectHeightPx: hitZoneDiagnostics.centerRectHeightPx,
        centerIsValid,
        centerBlockedReason: centerIsValid
          ? null
          : `center swap blocked: same source and target leaf (${hitZoneSourceLeafId})`,
        edgeCandidates,
      });
    }
    return hitZoneByLeafId;
  }, [
    activeFocusedLeafId,
    config,
    dragSourceLeafId,
    isRearrangeEnabled,
    layout,
    leafFootprintsById,
    leafIds,
    paneHitZoneSourceLeafId,
    rearrangeGatedLeafIds,
    showPaneHitZones,
    viewportSize.height,
    viewportSize.width,
  ]);
  React.useEffect((): void => {
    onProjectedOverlayCountChange?.(projectedLandingOverlays.length);
  }, [onProjectedOverlayCountChange, projectedLandingOverlays.length]);
  React.useEffect((): void => {
    if (dragSourceLeafId == null || dropState == null) {
      onDropIntentChange?.(null);
      return;
    }
    onDropIntentChange?.(toDropIntentDebugState(dropState));
  }, [dragSourceLeafId, dropState, onDropIntentChange]);

  React.useEffect((): void => {
    if (dragState.phase !== "dragging" || dragSourceLeafId == null) {
      return;
    }
    onLiveHitLogChange?.(
      buildDraggingLiveHitLogState({
        dragState,
        dropState,
        dragSourceLeafId,
        ghostSeatLeafId,
        leafFootprintsById,
        viewportElement: viewportRef.current,
      }),
    );
  }, [
    dragSourceLeafId,
    ghostSeatLeafId,
    dragState,
    dropState,
    leafFootprintsById,
    onLiveHitLogChange,
  ]);

  React.useEffect((): (() => void) => {
    return (): void => {
      onLiveHitLogChange?.(null);
    };
  }, [onLiveHitLogChange]);

  React.useEffect((): void => {
    if (activeFocusedLeafId != null && leafIds.includes(activeFocusedLeafId)) {
      return;
    }
    if (leafIds.length === 0) {
      setInternalFocusedLeafId(null);
      return;
    }
    const firstLeafId: string = leafIds[0];
    setInternalFocusedLeafId(firstLeafId);
    onFocusedLeafChange?.(firstLeafId);
  }, [activeFocusedLeafId, leafIds, onFocusedLeafChange]);

  React.useEffect((): (() => void) | void => {
    const viewportElement: HTMLDivElement | null = viewportRef.current;
    if (viewportElement == null) {
      return;
    }

    const updateViewportSize = (): void => {
      const nextWidth: number = viewportElement.clientWidth;
      const nextHeight: number = viewportElement.clientHeight;
      setViewportSize(
        (previous: {
          width: number;
          height: number;
        }): { width: number; height: number } => {
          if (previous.width === nextWidth && previous.height === nextHeight) {
            return previous;
          }
          return {
            width: nextWidth,
            height: nextHeight,
          };
        },
      );
    };

    updateViewportSize();
    const resizeObserver: ResizeObserver = new ResizeObserver((): void => {
      updateViewportSize();
    });
    resizeObserver.observe(viewportElement);
    window.addEventListener("resize", updateViewportSize);

    return (): void => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateViewportSize);
    };
  }, []);

  const setSplitContainerRef = React.useCallback(
    (splitId: string, element: HTMLDivElement | null): void => {
      if (element == null) {
        splitContainerRefs.current.delete(splitId);
        return;
      }
      splitContainerRefs.current.set(splitId, element);
    },
    [],
  );

  const setGroupTabStripRef = React.useCallback(
    (groupId: string, element: HTMLDivElement | null): void => {
      if (element == null) {
        groupTabStripRefs.current.delete(groupId);
        return;
      }
      groupTabStripRefs.current.set(groupId, element);
    },
    [],
  );

  React.useEffect((): (() => void) | void => {
    if (resizeState == null) {
      return;
    }

    const handlePointerMove = (event: PointerEvent): void => {
      const deltaPx: number =
        resizeState.axis === "horizontal"
          ? event.clientX - resizeState.startPointerPx
          : event.clientY - resizeState.startPointerPx;
      const nextRatio: number = clampByMinSize(
        resizeState.startRatio + deltaPx / resizeState.containerSizePx,
        resizeState.containerSizePx,
        resizeState.gapPx,
        resizeState.minPaneSizePx,
      );

      onLayoutChange(updateSplitRatio(layout, resizeState.splitId, nextRatio));
    };

    const handlePointerUp = (): void => {
      setResizeState(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return (): void => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [layout, onLayoutChange, resizeState]);

  const beginResize = React.useCallback(
    (
      event: React.PointerEvent<HTMLDivElement>,
      node: DynamicSplitNode,
      resolvedGapPx: number,
      resolvedMinPaneSizePx: number,
    ): void => {
      if (!isResizeAxisEnabled(interactionCapabilities.resize, node.axis)) {
        return;
      }
      event.preventDefault();
      const splitContainer: HTMLDivElement | undefined =
        splitContainerRefs.current.get(node.id);
      if (splitContainer == null) {
        return;
      }

      const rect: DOMRect = splitContainer.getBoundingClientRect();
      const containerSizePx: number =
        node.axis === "horizontal" ? rect.width : rect.height;
      if (containerSizePx <= 1) {
        return;
      }

      const startPointerPx: number =
        node.axis === "horizontal" ? event.clientX : event.clientY;
      const boundedRatio: number = clampByMinSize(
        node.ratio,
        containerSizePx,
        resolvedGapPx,
        resolvedMinPaneSizePx,
      );

      setResizeState({
        splitId: node.id,
        axis: node.axis,
        containerSizePx,
        startPointerPx,
        startRatio: boundedRatio,
        gapPx: resolvedGapPx,
        minPaneSizePx: resolvedMinPaneSizePx,
      });

      if (
        event.currentTarget.setPointerCapture != null &&
        isPointerLikeEvent(event.nativeEvent)
      ) {
        event.currentTarget.setPointerCapture(event.nativeEvent.pointerId);
      }
    },
    [interactionCapabilities.resize],
  );

  // Keyboard resize on a focused separator — the `layoutmsg splitratio` / `mfact`
  // analog. Arrow keys along the divider's resize axis step the split ratio
  // through the SAME `updateSplitRatio` reducer + `clampByMinSize` floor the
  // pointer drag uses; Home/End jump to the min/max, PageUp/PageDown take a
  // larger step. A vertical divider (axis `"horizontal"`) responds to
  // Left/Right; a horizontal divider (axis `"vertical"`) to Up/Down. Non-axis
  // keys are left alone (they bubble) so the separator stays keyboard-graceful.
  const handleSeparatorKeyDown = React.useCallback(
    (
      event: React.KeyboardEvent<HTMLDivElement>,
      node: DynamicSplitNode,
      containerSizePx: number,
      resolvedGapPx: number,
      resolvedMinPaneSizePx: number,
    ): void => {
      if (!isResizeAxisEnabled(interactionCapabilities.resize, node.axis)) {
        return;
      }
      const isHorizontalDivider: boolean = node.axis === "horizontal";
      const decreaseKey: string = isHorizontalDivider ? "ArrowLeft" : "ArrowUp";
      const increaseKey: string = isHorizontalDivider
        ? "ArrowRight"
        : "ArrowDown";
      const SEPARATOR_RATIO_STEP: number = 0.02;
      const SEPARATOR_RATIO_PAGE_STEP: number = 0.1;
      let nextRatio: number | null = null;
      if (event.code === decreaseKey) {
        nextRatio = node.ratio - SEPARATOR_RATIO_STEP;
      } else if (event.code === increaseKey) {
        nextRatio = node.ratio + SEPARATOR_RATIO_STEP;
      } else if (event.code === "PageUp") {
        nextRatio = node.ratio - SEPARATOR_RATIO_PAGE_STEP;
      } else if (event.code === "PageDown") {
        nextRatio = node.ratio + SEPARATOR_RATIO_PAGE_STEP;
      } else if (event.code === "Home") {
        nextRatio = 0;
      } else if (event.code === "End") {
        nextRatio = 1;
      }
      if (nextRatio == null) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const boundedSizePx: number = containerSizePx > 1 ? containerSizePx : 1;
      const clampedRatio: number = clampByMinSize(
        nextRatio,
        boundedSizePx,
        resolvedGapPx,
        resolvedMinPaneSizePx,
      );
      onLayoutChange(updateSplitRatio(layout, node.id, clampedRatio));
    },
    [interactionCapabilities.resize, layout, onLayoutChange],
  );

  const setFocusedLeaf = React.useCallback(
    (leafId: string): void => {
      if (!isFocusSelectionEnabled) {
        return;
      }
      focusHistoryRef.current = pushFocusHistory(
        focusHistoryRef.current,
        leafId,
      );
      setInternalFocusedLeafId(leafId);
      onFocusedLeafChange?.(leafId);
    },
    [isFocusSelectionEnabled, onFocusedLeafChange],
  );

  const setMaximizedLeaf = React.useCallback(
    (nextLeafId: string | null): void => {
      if (!isMaximizeEnabled) {
        return;
      }
      setInternalMaximizedLeafId(nextLeafId);
      onMaximizedLeafChange?.(nextLeafId);
    },
    [isMaximizeEnabled, onMaximizedLeafChange],
  );

  const toggleMaximizeLeaf = React.useCallback(
    (leafId: string): void => {
      setMaximizedLeaf(resolveMaximizeToggle(activeMaximizedLeafId, leafId));
    },
    [activeMaximizedLeafId, setMaximizedLeaf],
  );

  // Focus a pane and, when in maximize render-mode, switch which pane is
  // maximized — this is how tabs + cycle/jump compose with maximize.
  const activateLeaf = React.useCallback(
    (leafId: string): void => {
      setFocusedLeaf(leafId);
      if (isMaximizeEnabled && activeMaximizedLeafId != null) {
        setMaximizedLeaf(leafId);
      }
    },
    [
      activeMaximizedLeafId,
      isMaximizeEnabled,
      setFocusedLeaf,
      setMaximizedLeaf,
    ],
  );

  // Commit the in-flight switcher: activate the highlighted pane (focus +
  // switch the maximized pane when maximized) and close the overlay. Reads the
  // latest selection from a ref so the document keyup listener need not
  // re-subscribe on every highlight advance.
  const commitPaneSwitcherSelection = React.useCallback((): void => {
    const switcherState: TilingPaneSwitcherState | null =
      paneSwitcherStateRef.current;
    if (switcherState != null) {
      activateLeaf(commitPaneSwitcher(switcherState));
    }
    setPaneSwitcherState(null);
  }, [activateLeaf]);

  const cancelPaneSwitcher = React.useCallback((): void => {
    setPaneSwitcherState(null);
  }, []);

  // Move DOM focus onto a pane element so the document listener's
  // focus-within engagement check keeps holding after keyboard focus nav (no
  // dependence on the pointer staying over the instance).
  const focusLeafElement = React.useCallback((leafId: string): void => {
    const rootElement: HTMLDivElement | null = rootRef.current;
    const paneElement: HTMLElement | null =
      rootElement?.querySelector<HTMLElement>(`[data-leaf-id="${leafId}"]`) ??
      null;
    paneElement?.focus({ preventScroll: true });
  }, []);

  // --- Keyboard move mode (accessible drag analog) -------------------------
  // Enter move mode on a source pane; arrow keys then pick a destination
  // neighbor (focusDirection), Enter commits via the SAME `insertLeafAdjacent`
  // reducer drag uses (no parallel mutation path), Escape cancels. Gated per-leaf
  // (`isLeafRearrangeEligible`): a statically-gated source cannot enter move mode
  // and a gated neighbor is never aimed, so `insertLeafAdjacent` never runs
  // against an unresolvable-geometry pane.
  const enterMoveMode = React.useCallback((sourceLeafId: string): void => {
    setMoveModeState({ sourceLeafId, targetLeafId: null, placement: null });
  }, []);

  const cancelMoveMode = React.useCallback((): void => {
    setMoveModeState(null);
  }, []);

  const aimMoveMode = React.useCallback(
    (direction: DynamicFocusDirection): void => {
      setMoveModeState(
        (current: TilingMoveModeState | null): TilingMoveModeState | null => {
          if (current == null) {
            return current;
          }
          const targetLeafId: string | null = findLeafByDirection(
            layout,
            current.sourceLeafId,
            direction,
          );
          if (targetLeafId == null || rearrangeGatedLeafIds.has(targetLeafId)) {
            return current;
          }
          return {
            ...current,
            targetLeafId,
            placement: directionToPlacement(direction),
          };
        },
      );
    },
    [layout, rearrangeGatedLeafIds],
  );

  const commitMoveMode = React.useCallback((): void => {
    const current: TilingMoveModeState | null = moveModeStateRef.current;
    setMoveModeState(null);
    if (
      current == null ||
      current.targetLeafId == null ||
      current.placement == null
    ) {
      return;
    }
    onLayoutChange(
      insertLeafAdjacent(
        layout,
        current.sourceLeafId,
        current.targetLeafId,
        current.placement,
      ),
    );
    setFocusedLeaf(current.sourceLeafId);
  }, [layout, onLayoutChange, setFocusedLeaf]);

  // The ONE effectful command router (HT-API-COMMAND-KEYBOARD-SURFACE §7). Both
  // the keyboard layer and the imperative `dispatch` handle funnel a
  // `TilingCommand` through here so there is a single action-execution path (no
  // duplicated logic). Returns `true` when the command produced an effect (the
  // keyboard caller uses this to decide `preventDefault`, staying browser-
  // graceful for a no-op); a command targeting a disabled capability is gated
  // out up front and returns `false`. The macOS-switcher held-modifier OVERLAY
  // flow is NOT here — it is a keyboard-only modal interaction kept in
  // `runTilingKeyDown`; a direct `focus-cycle` dispatch always activates
  // immediately (correct programmatic semantics).
  const dispatchCommand = React.useCallback(
    (command: TilingCommand): boolean => {
      if (!isCommandEnabled(command, commandGates)) {
        return false;
      }
      switch (command.kind) {
        case "focus-pane": {
          if (findLeafById(layout, command.leafId) == null) {
            return false;
          }
          activateLeaf(command.leafId);
          focusLeafElement(command.leafId);
          return true;
        }
        case "focus-direction": {
          if (activeFocusedLeafId == null) {
            return false;
          }
          const nextLeafId: string | null = findLeafByDirection(
            layout,
            activeFocusedLeafId,
            command.direction,
          );
          if (nextLeafId == null) {
            return false;
          }
          setFocusedLeaf(nextLeafId);
          focusLeafElement(nextLeafId);
          return true;
        }
        case "focus-cycle": {
          const nextLeafId: string | null = resolveCycledPaneId(
            leafIds,
            activeFocusedLeafId,
            command.direction,
          );
          if (nextLeafId == null) {
            return false;
          }
          activateLeaf(nextLeafId);
          return true;
        }
        case "focus-jump": {
          const jumpLeafId: string | null = resolveJumpedPaneId(
            leafIds,
            command.paneNumber,
          );
          if (jumpLeafId == null) {
            return false;
          }
          activateLeaf(jumpLeafId);
          return true;
        }
        case "focus-current-or-last": {
          const target: string | null = resolveFocusCurrentOrLast(
            focusHistoryRef.current,
            activeFocusedLeafId,
          );
          if (target == null || findLeafById(layout, target) == null) {
            return false;
          }
          activateLeaf(target);
          focusLeafElement(target);
          return true;
        }
        case "toggle-maximize": {
          const id: string | null = command.leafId ?? activeFocusedLeafId;
          if (id == null) {
            return false;
          }
          toggleMaximizeLeaf(id);
          return true;
        }
        case "maximize": {
          const id: string | null = command.leafId ?? activeFocusedLeafId;
          if (id == null) {
            return false;
          }
          setMaximizedLeaf(id);
          return true;
        }
        case "restore": {
          if (activeMaximizedLeafId == null) {
            return false;
          }
          setMaximizedLeaf(null);
          return true;
        }
        case "enter-move-mode": {
          const id: string | null = command.leafId ?? activeFocusedLeafId;
          if (id == null || !isLeafRearrangeEligible(id)) {
            return false;
          }
          enterMoveMode(id);
          return true;
        }
        case "move-aim": {
          if (moveModeStateRef.current == null) {
            return false;
          }
          aimMoveMode(command.direction);
          return true;
        }
        case "commit-move-mode": {
          if (moveModeStateRef.current == null) {
            return false;
          }
          commitMoveMode();
          return true;
        }
        case "cancel-move-mode": {
          if (moveModeStateRef.current == null) {
            return false;
          }
          cancelMoveMode();
          return true;
        }
        case "swap-panes": {
          if (
            findLeafById(layout, command.sourceLeafId) == null ||
            findLeafById(layout, command.targetLeafId) == null ||
            command.sourceLeafId === command.targetLeafId
          ) {
            return false;
          }
          onLayoutChange(
            swapLeafTiles(layout, command.sourceLeafId, command.targetLeafId),
          );
          return true;
        }
        case "insert-adjacent": {
          if (
            findLeafById(layout, command.sourceLeafId) == null ||
            findLeafById(layout, command.targetLeafId) == null
          ) {
            return false;
          }
          onLayoutChange(
            insertLeafAdjacent(
              layout,
              command.sourceLeafId,
              command.targetLeafId,
              command.placement,
            ),
          );
          setFocusedLeaf(command.sourceLeafId);
          return true;
        }
        case "acquire-space": {
          const id: string | null = command.leafId ?? activeFocusedLeafId;
          if (id == null) {
            return false;
          }
          acquireLeafSpace(id, command.direction);
          return true;
        }
        case "set-sizing": {
          const id: string | null = command.leafId ?? activeFocusedLeafId;
          if (id == null) {
            return false;
          }
          setLeafSizingFromBbox(id, command.mode);
          return true;
        }
        case "set-split-ratio": {
          onLayoutChange(
            updateSplitRatio(layout, command.splitId, command.ratio),
          );
          return true;
        }
        case "toggle-split-axis": {
          onLayoutChange(toggleSplitAxis(layout, command.splitId));
          return true;
        }
        case "set-layout-mode":
        case "cycle-layout-mode":
        case "set-master-count":
        case "adjust-master-count":
        case "set-master-orientation":
        case "cycle-master-orientation":
        case "adjust-master-ratio": {
          // `splitId` is optional on the master-layout commands; omitted resolves
          // against the ROOT split (the workspace-level layout selector). When the
          // layout is a single leaf there is no split to retarget — no-op.
          const targetSplitId: string | null =
            command.splitId ?? (layout.kind === "split" ? layout.id : null);
          if (targetSplitId == null) {
            return false;
          }
          let next: DynamicLayoutNode = layout;
          switch (command.kind) {
            case "set-layout-mode":
              next = setSplitLayoutMode(layout, targetSplitId, command.mode);
              break;
            case "cycle-layout-mode":
              next = cycleSplitLayoutMode(layout, targetSplitId);
              break;
            case "set-master-count":
              next = setSplitMasterCount(layout, targetSplitId, command.count);
              break;
            case "adjust-master-count":
              next = adjustSplitMasterCount(
                layout,
                targetSplitId,
                command.delta,
              );
              break;
            case "set-master-orientation":
              next = setSplitMasterOrientation(
                layout,
                targetSplitId,
                command.orientation,
              );
              break;
            case "cycle-master-orientation": {
              let workingLayout: DynamicLayoutNode = layout;
              const targetSplit: DynamicSplitNode | undefined =
                collectSplitNodes(workingLayout).find(
                  (split: DynamicSplitNode): boolean =>
                    split.id === targetSplitId,
                );
              if (
                targetSplit != null &&
                (targetSplit.layoutMode ?? "dwindle") !== "master"
              ) {
                workingLayout = setSplitLayoutMode(
                  workingLayout,
                  targetSplitId,
                  "master",
                );
              }
              next = cycleSplitMasterOrientation(workingLayout, targetSplitId);
              break;
            }
            case "adjust-master-ratio":
              next = adjustSplitRatio(layout, targetSplitId, command.delta);
              break;
          }
          if (next === layout) {
            return false;
          }
          onLayoutChange(next);
          return true;
        }
        case "group-leaves": {
          const next: DynamicLayoutNode = groupLeaves(layout, command.leafIds);
          if (next === layout) {
            return false;
          }
          onLayoutChange(next);
          return true;
        }
        case "toggle-group": {
          // Focused (or explicit) leaf: if grouped → ungroup; else group it with
          // its reading-order neighbor (the Hyprland `togglegroup` ergonomic).
          const focusLeafId: string | null =
            command.leafId ?? activeFocusedLeafId;
          if (focusLeafId == null) {
            return false;
          }
          const existingGroup = findGroupContainingLeaf(layout, focusLeafId);
          if (existingGroup != null) {
            const next: DynamicLayoutNode = ungroupNode(
              layout,
              existingGroup.id,
            );
            if (next === layout) {
              return false;
            }
            onLayoutChange(next);
            return true;
          }
          const outerIds: ReadonlyArray<string> = readLeafNodeIds(layout);
          const focusIndex: number = outerIds.indexOf(focusLeafId);
          if (focusIndex === -1 || outerIds.length < 2) {
            return false;
          }
          const neighborId: string =
            focusIndex + 1 < outerIds.length
              ? outerIds[focusIndex + 1]
              : outerIds[focusIndex - 1];
          const next: DynamicLayoutNode = groupLeaves(layout, [
            focusLeafId,
            neighborId,
          ]);
          if (next === layout) {
            return false;
          }
          onLayoutChange(next);
          return true;
        }
        case "ungroup": {
          const groupId: string | null =
            command.groupId ??
            (activeFocusedLeafId != null
              ? (findGroupContainingLeaf(layout, activeFocusedLeafId)?.id ??
                null)
              : null);
          if (groupId == null) {
            return false;
          }
          const next: DynamicLayoutNode = ungroupNode(layout, groupId);
          if (next === layout) {
            return false;
          }
          onLayoutChange(next);
          return true;
        }
        case "add-to-group": {
          const next: DynamicLayoutNode = addLeafToGroup(
            layout,
            command.groupId,
            command.sourceLeafId,
          );
          if (next === layout) {
            return false;
          }
          onLayoutChange(next);
          return true;
        }
        case "remove-from-group": {
          const next: DynamicLayoutNode = removeMemberFromGroup(
            layout,
            command.groupId,
            command.memberId,
          );
          if (next === layout) {
            return false;
          }
          onLayoutChange(next);
          activateLeaf(command.memberId);
          return true;
        }
        case "group-tab-cycle": {
          const groupId: string | null =
            command.groupId ??
            (activeFocusedLeafId != null
              ? (findGroupContainingLeaf(layout, activeFocusedLeafId)?.id ??
                null)
              : null);
          if (groupId == null) {
            return false;
          }
          const next: DynamicLayoutNode = cycleActiveGroupMember(
            layout,
            groupId,
            command.direction,
          );
          if (next === layout) {
            return false;
          }
          onLayoutChange(next);
          const cycledGroup = findGroupById(next, groupId);
          if (cycledGroup != null) {
            activateLeaf(cycledGroup.activeMemberId);
          }
          return true;
        }
        case "group-tab-jump": {
          const groupId: string | null =
            command.groupId ??
            (activeFocusedLeafId != null
              ? (findGroupContainingLeaf(layout, activeFocusedLeafId)?.id ??
                null)
              : null);
          if (groupId == null) {
            return false;
          }
          const targetGroup = findGroupById(layout, groupId);
          if (targetGroup == null) {
            return false;
          }
          const memberIndex: number = command.memberNumber - 1;
          if (memberIndex < 0 || memberIndex >= targetGroup.members.length) {
            return false;
          }
          const memberId: string = targetGroup.members[memberIndex].id;
          const next: DynamicLayoutNode = setActiveGroupMember(
            layout,
            groupId,
            memberId,
          );
          if (next === layout) {
            return false;
          }
          onLayoutChange(next);
          activateLeaf(memberId);
          return true;
        }
        default:
          return false;
      }
    },
    [
      acquireLeafSpace,
      activateLeaf,
      activeFocusedLeafId,
      activeMaximizedLeafId,
      aimMoveMode,
      cancelMoveMode,
      commandGates,
      commitMoveMode,
      enterMoveMode,
      focusLeafElement,
      isLeafRearrangeEligible,
      layout,
      onLayoutChange,
      setFocusedLeaf,
      setLeafSizingFromBbox,
      setMaximizedLeaf,
      toggleMaximizeLeaf,
      leafIds,
    ],
  );

  // Public imperative handle (HT-API-COMMAND-KEYBOARD-SURFACE half A): a consumer
  // holds a `ref` and drives the tiler programmatically (the Hyprland `dispatch`
  // analog). It routes through the SAME `dispatchCommand` router the keyboard
  // layer uses, so a disabled-capability command is a safe no-op. The boolean
  // effect signal is internal — the public `dispatch` returns void.
  React.useImperativeHandle(
    ref,
    (): TilingCommandHandle => ({
      dispatch: (command: TilingCommand): void => {
        dispatchCommand(command);
      },
    }),
    [dispatchCommand],
  );

  // Single keyboard dispatch shared by the document-level keydown listener.
  // Returns true when the event was handled (caller may have already called
  // `preventDefault`), false when the renderer left the key alone.
  const runTilingKeyDown = React.useCallback(
    (
      event: {
        code: string;
        key: string;
        altKey: boolean;
        ctrlKey: boolean;
        metaKey: boolean;
        shiftKey: boolean;
      },
      preventDefault: () => void,
    ): void => {
      // While the switcher is open, Escape cancels the switch (without falling
      // through to maximize-restore), regardless of which capability owns Escape.
      if (paneSwitcherStateRef.current != null && event.code === "Escape") {
        preventDefault();
        cancelPaneSwitcher();
        return;
      }
      // Move mode is modal: while it is open, Escape cancels, bare Enter commits
      // (`insertLeafAdjacent`), the focus-direction bindings aim the destination,
      // and every other key is swallowed so the move stays predictable.
      if (moveModeStateRef.current != null) {
        if (event.code === "Escape") {
          preventDefault();
          cancelMoveMode();
          return;
        }
        if (
          event.code === "Enter" &&
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey
        ) {
          preventDefault();
          commitMoveMode();
          return;
        }
        const moveAction: TilingKeyboardAction | null = matchKeymapAction(
          {
            code: event.code,
            key: event.key,
            altKey: event.altKey,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            shiftKey: event.shiftKey,
          },
          keymap,
          {
            maximizeEnabled: false,
            paneSwitchingEnabled: false,
            focusEnabled: true,
            rearrangeEnabled: false,
          },
        );
        if (moveAction != null && moveAction.kind === "focus-direction") {
          preventDefault();
          aimMoveMode(moveAction.direction);
        }
        return;
      }
      // Public binding registry (HT-API-COMMAND-KEYBOARD-SURFACE half B), highest
      // precedence: a consumer chord→command binding ALWAYS wins (augments or
      // overrides a default). A custom binding routes straight through the
      // command router with no switcher-overlay modal flow (immediate, like a
      // programmatic dispatch). A matched binding consumes the resolution even
      // when its command is gated out (returns a no-op) so it predictably
      // shadows any default on that chord.
      const customCommand: TilingCommand | null = matchKeyBinding(
        event,
        interactionCapabilities.keyBindings.bindings,
      );
      if (customCommand != null) {
        if (dispatchCommand(customCommand)) {
          preventDefault();
        }
        return;
      }
      // `replaceDefaults` suppresses the built-in keymap path entirely — only
      // the consumer bindings above are live.
      if (interactionCapabilities.keyBindings.replaceDefaults) {
        return;
      }
      const action: TilingKeyboardAction | null = matchKeymapAction(
        {
          code: event.code,
          key: event.key,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
        },
        keymap,
        {
          maximizeEnabled: isMaximizeEnabled,
          paneSwitchingEnabled: isPaneSwitchingEnabled,
          focusEnabled: isFocusSelectionEnabled,
          rearrangeEnabled: isRearrangeEnabled,
        },
      );
      if (action == null) {
        return;
      }
      if (action.kind === "previous-pane" || action.kind === "next-pane") {
        const direction: "next" | "previous" =
          action.kind === "next-pane" ? "next" : "previous";
        const cycleChord =
          direction === "next" ? keymap.nextPane : keymap.previousPane;
        // macOS Cmd+Tab flow: when the overlay is enabled and the cycle chord
        // carries a held modifier, open/advance the visual switcher instead of
        // activating immediately. The selection commits on modifier release.
        // This is a keyboard-only modal interaction, so it stays out of
        // `dispatchCommand` (a direct `focus-cycle` dispatch always activates).
        if (showSwitcherOverlay && chordHasModifier(cycleChord)) {
          const holdModifiers = {
            alt: cycleChord.alt,
            ctrl: cycleChord.ctrl,
            meta: cycleChord.meta,
            shift: cycleChord.shift,
          };
          const currentSwitcherState: TilingPaneSwitcherState | null =
            paneSwitcherStateRef.current;
          if (currentSwitcherState == null) {
            const opened: TilingPaneSwitcherState | null = openPaneSwitcher(
              leafIds,
              activeFocusedLeafId,
              direction,
              holdModifiers,
            );
            if (opened == null) {
              return;
            }
            preventDefault();
            setPaneSwitcherState(opened);
            return;
          }
          preventDefault();
          setPaneSwitcherState(
            advancePaneSwitcher(leafIds, currentSwitcherState, direction),
          );
          return;
        }
        if (dispatchCommand({ kind: "focus-cycle", direction })) {
          preventDefault();
        }
        return;
      }
      if (action.kind === "jump-to-pane") {
        // jump-to-pane: while the switcher is open, the digit re-targets the
        // highlight (commit still happens on modifier release); otherwise it
        // routes through the command router as a direct focus-jump.
        const currentSwitcherState: TilingPaneSwitcherState | null =
          paneSwitcherStateRef.current;
        if (showSwitcherOverlay && currentSwitcherState != null) {
          const nextSwitcherState: TilingPaneSwitcherState = jumpPaneSwitcher(
            leafIds,
            currentSwitcherState,
            action.paneNumber,
          );
          preventDefault();
          setPaneSwitcherState(nextSwitcherState);
          return;
        }
        if (
          dispatchCommand({ kind: "focus-jump", paneNumber: action.paneNumber })
        ) {
          preventDefault();
        }
        return;
      }
      // Every other fixed-keymap action bridges to a command and routes through
      // the SAME router (no duplicated action logic). `preventDefault` only
      // fires when the command produced an effect, preserving browser-grace for
      // a no-op (e.g. restore with nothing maximized, focus-direction at an edge).
      if (dispatchCommand(keyboardActionToCommand(action))) {
        preventDefault();
      }
    },
    [
      activeFocusedLeafId,
      aimMoveMode,
      cancelMoveMode,
      cancelPaneSwitcher,
      commitMoveMode,
      dispatchCommand,
      interactionCapabilities.keyBindings,
      isFocusSelectionEnabled,
      isMaximizeEnabled,
      isPaneSwitchingEnabled,
      isRearrangeEnabled,
      showSwitcherOverlay,
      keymap,
      leafIds,
    ],
  );

  // Document-level keydown listener. The React-`onKeyDown`-on-root approach
  // only fired while DOM focus was inside the wrapper, so after a maximize (or
  // any click that drops focus outside a focusable pane) Escape and the cycle
  // shortcuts silently stopped reaching the handler — the reported "Escape does
  // nothing after Alt+Enter" bug. A document listener is robust to focus loss;
  // it is gated to fire only while the tiling instance is "engaged" so it never
  // hijacks keys for an off-screen / unfocused instance.
  React.useEffect((): (() => void) | void => {
    if (
      !isMaximizeEnabled &&
      !isPaneSwitchingEnabled &&
      !isFocusSelectionEnabled &&
      !isRearrangeEnabled &&
      !isMasterLayoutEnabled &&
      !isGroupingEnabled
    ) {
      return;
    }
    const handleDocumentKeyDown = (event: KeyboardEvent): void => {
      const rootElement: HTMLDivElement | null = rootRef.current;
      if (rootElement == null) {
        return;
      }
      // A focused separator owns the arrow keys for keyboard resize (its own
      // onKeyDown handles them) — never let the document-level focus-nav also
      // consume the same press.
      if (
        event.target instanceof HTMLElement &&
        event.target.getAttribute("role") === "separator"
      ) {
        return;
      }
      const target: EventTarget | null = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      const focusWithinRoot: boolean = rootElement.contains(
        document.activeElement,
      );
      const engaged: boolean =
        paneSwitcherStateRef.current != null ||
        moveModeStateRef.current != null ||
        activeMaximizedLeafId != null ||
        focusWithinRoot ||
        isPointerWithinRootRef.current;
      if (!engaged) {
        return;
      }
      runTilingKeyDown(event, (): void => event.preventDefault());
    };
    document.addEventListener("keydown", handleDocumentKeyDown);
    return (): void => {
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [
    activeMaximizedLeafId,
    isFocusSelectionEnabled,
    isGroupingEnabled,
    isMasterLayoutEnabled,
    isMaximizeEnabled,
    isPaneSwitchingEnabled,
    isRearrangeEnabled,
    runTilingKeyDown,
  ]);

  // While the switcher is open, commit on modifier release (Cmd+Tab feel) and
  // cancel on window blur. Scoped to the open window so there is no idle global
  // keyup listener.
  React.useEffect((): (() => void) | void => {
    if (paneSwitcherState == null) {
      return;
    }
    const handleKeyUp = (event: KeyboardEvent): void => {
      if (isSwitcherHoldReleased(event, paneSwitcherState.holdModifiers)) {
        commitPaneSwitcherSelection();
      }
    };
    const handleBlur = (): void => {
      commitPaneSwitcherSelection();
    };
    document.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return (): void => {
      document.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [commitPaneSwitcherSelection, paneSwitcherState]);

  // Close the switcher if it loses its footing: pane-switching turned off, no
  // panes left, or the highlighted pane vanished from the layout.
  React.useEffect((): void => {
    if (paneSwitcherState == null) {
      return;
    }
    if (
      !isPaneSwitchingEnabled ||
      !showSwitcherOverlay ||
      !leafIds.includes(paneSwitcherState.selectedLeafId)
    ) {
      setPaneSwitcherState(null);
    }
  }, [isPaneSwitchingEnabled, leafIds, paneSwitcherState, showSwitcherOverlay]);

  // Close move mode if it loses its footing: drag-rearrange turned off, the
  // source pane got statically gated (e.g. it became a static pane via the
  // title-bar control), or the source pane vanished from the layout (e.g. the
  // commit itself relocated it — handled there — or an external layout swap).
  React.useEffect((): void => {
    if (moveModeState == null) {
      return;
    }
    if (
      !isLeafRearrangeEligible(moveModeState.sourceLeafId) ||
      !leafIds.includes(moveModeState.sourceLeafId)
    ) {
      setMoveModeState(null);
    }
  }, [isLeafRearrangeEligible, leafIds, moveModeState]);

  // Move DOM focus into the maximized pane when a maximize begins, and back to
  // the tiling root on restore — so Escape (and every shortcut) keeps reaching
  // the handler regardless of which descendant previously held focus. Only acts
  // on an actual transition (tracked via a ref) to avoid stealing focus on
  // unrelated re-renders.
  const previousMaximizedLeafIdRef = React.useRef<string | null>(null);
  React.useEffect((): void => {
    const previousMaximizedLeafId: string | null =
      previousMaximizedLeafIdRef.current;
    if (previousMaximizedLeafId === activeMaximizedLeafId) {
      return;
    }
    previousMaximizedLeafIdRef.current = activeMaximizedLeafId;
    const rootElement: HTMLDivElement | null = rootRef.current;
    if (rootElement == null) {
      return;
    }
    if (activeMaximizedLeafId != null) {
      const maximizedPaneElement: HTMLElement | null =
        rootElement.querySelector<HTMLElement>(
          `[data-leaf-id="${activeMaximizedLeafId}"]`,
        );
      if (maximizedPaneElement != null) {
        maximizedPaneElement.focus({ preventScroll: true });
        return;
      }
    }
    // Restore (or maximized pane not found): keep focus anchored on the root so
    // the document listener's focus-within engagement check stays satisfied.
    if (
      previousMaximizedLeafId != null &&
      !rootElement.contains(document.activeElement)
    ) {
      rootElement.focus({ preventScroll: true });
    }
  }, [activeMaximizedLeafId]);

  const beginCancelFlyBackAnimation = React.useCallback(
    (activeState: DynamicDragVisualState): void => {
      if (clearCancelVisualTimeoutRef.current != null) {
        window.clearTimeout(clearCancelVisualTimeoutRef.current);
        clearCancelVisualTimeoutRef.current = null;
      }

      // Hidden-tab guard: when the page is not visible (a BLUR / VISIBILITY_HIDDEN
      // interrupt) skip the fly-back entirely. Background tabs throttle timers, so
      // the clearing `setTimeout` could fire arbitrarily late and the fly-back
      // ghost would be left HANGING on the screen when the user returns. With no
      // overlay set there is nothing to strand — the layout already reverted.
      if (typeof document !== "undefined" && document.hidden) {
        setCancelVisualState(null);
        return;
      }

      setCancelVisualState({
        sourceLeafId: activeState.sourceLeafId,
        fromFootprint: activeState.activeFootprint,
        toFootprint: activeState.sourceFootprint,
        snapshot: activeState.snapshot,
      });

      clearCancelVisualTimeoutRef.current = window.setTimeout((): void => {
        setCancelVisualState(null);
        clearCancelVisualTimeoutRef.current = null;
      }, DRAG_CANCEL_ANIMATION_MS + 40);
    },
    [],
  );

  React.useEffect((): (() => void) => {
    return (): void => {
      if (clearCancelVisualTimeoutRef.current != null) {
        window.clearTimeout(clearCancelVisualTimeoutRef.current);
      }
    };
  }, []);

  // Backstop: clear any lingering cancel fly-back ghost when the page becomes
  // visible / regains focus. If a cancel overlay was set in the same tick the
  // tab was hidden (its clearing timer then throttled in the background), this
  // guarantees no hanging ghost survives the return to the foreground.
  React.useEffect((): (() => void) | void => {
    if (typeof window === "undefined") {
      return;
    }
    const clearStaleCancelVisual = (): void => {
      if (typeof document !== "undefined" && document.hidden) {
        return;
      }
      if (clearCancelVisualTimeoutRef.current != null) {
        window.clearTimeout(clearCancelVisualTimeoutRef.current);
        clearCancelVisualTimeoutRef.current = null;
      }
      setCancelVisualState(null);
    };
    document.addEventListener("visibilitychange", clearStaleCancelVisual);
    window.addEventListener("focus", clearStaleCancelVisual);
    return (): void => {
      document.removeEventListener("visibilitychange", clearStaleCancelVisual);
      window.removeEventListener("focus", clearStaleCancelVisual);
    };
  }, []);

  // Pointer-capture target resolution. With `setPointerCapture`, pointer events
  // route to the captured root regardless of what element is under the cursor —
  // so we hit-test the pointer against STABLE viewport-local footprints (the
  // gap-closed base in live mode, the original layout in preview mode) rather
  // than the element under the cursor. Resolving against a stable footprint map
  // (never the reflowing candidate) is what makes reflow moving panes under the
  // cursor unable to lose or hijack the drag. Returns `null` over the source / a
  // gap / outside any pane (→ cancel-on-release / gap-closed candidate).
  const resolvePointerTarget = React.useCallback(
    (
      clientX: number,
      clientY: number,
      sourceLeafId: string,
      previousTarget: DynamicDropState | null,
    ): DynamicDropState | null => {
      if (!isRearrangeEnabled) {
        return null;
      }
      const viewportRect: DOMRect | undefined =
        viewportRef.current?.getBoundingClientRect();
      if (viewportRect == null) {
        return null;
      }
      const localX: number = clientX - viewportRect.left;
      const localY: number = clientY - viewportRect.top;
      const hitFootprints: ReadonlyMap<string, DynamicPaneFootprint> =
        liveDragModeEnabled ? liveHitFootprintsById : leafFootprintsById;
      // Tab-strip hits take priority over the group body: the strip sits above the
      // active-member footprint and is the Hyprland groupbar merge target.
      if (interactionCapabilities.grouping) {
        const tabStripHit = resolveGroupTabStripHit(
          clientX,
          clientY,
          collectGroups(layout).map((group: DynamicGroupNode) => {
            const stripElement: HTMLDivElement | undefined =
              groupTabStripRefs.current.get(group.id);
            const stripRect: DOMRect | undefined =
              stripElement?.getBoundingClientRect();
            return {
              groupId: group.id,
              activeMemberLeafId: group.activeMemberId,
              bounds:
                stripRect == null
                  ? null
                  : {
                      left: stripRect.left,
                      top: stripRect.top,
                      right: stripRect.right,
                      bottom: stripRect.bottom,
                    },
            };
          }),
        );
        if (
          tabStripHit != null &&
          tabStripHit.activeMemberLeafId !== sourceLeafId
        ) {
          const targetFootprint: DynamicPaneFootprint | undefined =
            hitFootprints.get(tabStripHit.activeMemberLeafId);
          if (targetFootprint != null) {
            return buildGroupTabStripMergeIntent({
              activeMemberLeafId: tabStripHit.activeMemberLeafId,
              evaluateCenter: (): {
                isValid: boolean;
                rejectionReason: string | null;
              } =>
                evaluateZoneCandidate({
                  zone: "center",
                  layout,
                  sourceLeafId,
                  targetLeafId: tabStripHit.activeMemberLeafId,
                  targetFootprint,
                  config,
                  viewportWidth: viewportSize.width,
                  viewportHeight: viewportSize.height,
                }),
            });
          }
        }
      }
      let hitLeafId: string | null = null;
      let hitFootprint: DynamicPaneFootprint | undefined;
      for (const leafId of leafIds) {
        // Skip the source and any statically-gated leaf: a gated target has no
        // trustworthy footprint, so it resolves to no target (→ cancel-on-release
        // / gap-closed candidate) rather than a wrong swap/insert.
        if (leafId === sourceLeafId || rearrangeGatedLeafIds.has(leafId)) {
          continue;
        }
        const footprint: DynamicPaneFootprint | undefined =
          hitFootprints.get(leafId);
        if (
          footprint != null &&
          localX >= footprint.left &&
          localX <= footprint.left + footprint.width &&
          localY >= footprint.top &&
          localY <= footprint.top + footprint.height
        ) {
          hitLeafId = leafId;
          hitFootprint = footprint;
          break;
        }
      }
      if (hitLeafId == null || hitFootprint == null) {
        return null;
      }
      const splitPath: ReadonlyArray<DynamicSplitPathEntry> =
        readSplitPathToLeaf(layout, hitLeafId) ?? [];
      const axisPath: ReadonlyArray<DynamicSplitAxis> = splitPath.map(
        (pathEntry: DynamicSplitPathEntry): DynamicSplitAxis => pathEntry.axis,
      );
      const paneLocalPoint = toPaneLocalPoint(
        { x: localX, y: localY },
        { left: hitFootprint.left, top: hitFootprint.top },
      );
      // Seed the geometric hysteresis band from the prior resolved zone (only for
      // the same hovered leaf) so zone flips must overcome the band — the
      // anti-thrash damper that makes live reflow stable.
      const previousZone: DynamicLeafDropZone | null = previousZoneSeed(
        previousTarget,
        hitLeafId,
      );
      return resolveDropIntent({
        leafId: hitLeafId,
        paneLocalX: paneLocalPoint.x,
        paneLocalY: paneLocalPoint.y,
        paneSize: { width: hitFootprint.width, height: hitFootprint.height },
        axisPath,
        geometryConfig: currentGeometryConfig(
          interactionCapabilities.dropHitZoneGeometry,
        ),
        previousZone,
        evaluateZone: (
          zone: DynamicLeafDropZone,
        ): { isValid: boolean; rejectionReason: string | null } =>
          evaluateZoneCandidate({
            zone,
            layout,
            sourceLeafId,
            targetLeafId: hitLeafId as string,
            targetFootprint: hitFootprint as DynamicPaneFootprint,
            config,
            viewportWidth: viewportSize.width,
            viewportHeight: viewportSize.height,
          }),
      });
    },
    [
      config,
      isRearrangeEnabled,
      layout,
      leafFootprintsById,
      leafIds,
      liveDragModeEnabled,
      liveHitFootprintsById,
      rearrangeGatedLeafIds,
      viewportSize.height,
      viewportSize.width,
    ],
  );

  // The drag input layer. Active for the WHOLE armed/dragging lifetime. The
  // captured pointer (on the STABLE root, not a candidate-tree tile that
  // re-derives) guarantees every `pointermove`/`pointerup`/`pointercancel`
  // reaches here — the structural elimination of the missed-teardown edge. The
  // FSM owns commit-vs-cancel; this effect only translates DOM events to FSM
  // events. Declared BEFORE the settle effect so its listener cleanup runs
  // before the settle effect releases capture.
  // The owning pointer id across the armed/dragging union, narrowed to a stable
  // primitive so the input-layer effect can key on it (the `idle`/`settling`
  // variants carry no `pointerId`).
  const activeDragPointerId: number | null =
    dragState.phase === "armed" || dragState.phase === "dragging"
      ? dragState.pointerId
      : null;
  React.useEffect((): (() => void) | void => {
    if (activeDragPointerId == null) {
      return;
    }
    const owningPointerId: number = activeDragPointerId;

    // Resolve one pointer sample into FSM events: promote `armed → dragging`
    // once the pickup threshold is crossed and resolve the drop target for the
    // current cursor position. Extracted (not inlined into the coalescer) so the
    // RELEASE path can run it SYNCHRONOUSLY from the raw `pointerup` coords — a
    // fast flick releases in the same task as its `pointermove`s, before the rAF
    // coalescer flushes, so without a synchronous release-time resolve the FSM
    // would still be `armed` (or hold a stale target) and POINTER_UP would
    // settle as a click/cancel, reverting the pane to its origin.
    const processPointerSample = (
      client: DragMachinePoint,
      isReleaseSample: boolean = false,
    ): void => {
      {
          const current: DragMachineState = dragStateRef.current;
          if (current.phase === "armed") {
            if (current.touchDrag) {
              // Touch must disambiguate before capture. A pre-long-press scroll-axis
              // flick is released to the page: forward the move so the reducer drops
              // to idle, and take NO capture (capturing then idling would leak the
              // capture, since the settle path only releases on `settling`). A
              // sub-threshold hold keeps armed (the long-press timer still runs). A
              // non-scroll threshold crossing is a deliberate pickup → fall through
              // to capture + promote.
              const resolution: TouchArmedMoveResolution =
                resolveTouchArmedMove({
                  origin: current.originClient,
                  client,
                  longPressSatisfied: false,
                });
              if (resolution === "scroll-escape") {
                dispatchDrag({
                  type: "POINTER_MOVE",
                  pointerId: owningPointerId,
                  client,
                });
                return;
              }
              if (resolution === "hold") {
                return;
              }
            } else if (
              !hasCrossedPickupThreshold(current.originClient, client)
            ) {
              return;
            }
            // Threshold crossed (mouse/pen) or a deliberate touch pickup → take
            // capture on the stable root, then promote to dragging and resolve the
            // first target.
            const rootElement: HTMLDivElement | null = rootRef.current;
            if (rootElement?.setPointerCapture != null) {
              try {
                rootElement.setPointerCapture(owningPointerId);
                capturedPointerIdRef.current = owningPointerId;
              } catch {
                // Capture is best-effort; window listeners still receive events.
              }
            }
            dispatchDrag({
              type: "POINTER_MOVE",
              pointerId: owningPointerId,
              client,
            });
            const firstTarget: DynamicDropState | null = resolvePointerTarget(
              client.x,
              client.y,
              current.sourceLeafId,
              null,
            );
            seatAnchorRef.current =
              firstTarget != null &&
              isCommittableTarget(firstTarget, current.sourceLeafId)
                ? { x: client.x, y: client.y }
                : null;
            committableSeatRef.current = deriveCommittableSeat(
              firstTarget,
              current.sourceLeafId,
            );
            dispatchDrag({
              type: "TARGET_RESOLVED",
              pointerId: owningPointerId,
              resolvedTarget: firstTarget,
            });
          } else if (current.phase === "dragging") {
            // RELEASE: commit the single authoritative committable seat atomically.
            // Do NOT re-resolve the drop target from the release coordinates — a
            // seated committable drop must not be clobbered to a cancel because the
            // raw `pointerup` point resolves `null` (cursor over a layout gap / off
            // the gap-closed hit footprint) or a different target. The seat ref is
            // written synchronously on every move sample below, so it always holds
            // the slot the user was shown hopped into; `POINTER_UP` then commits it
            // (or cancels when it is `null`). This is the snap-back / seated-release
            // fix — see `drag-machine.ts:deriveCommittableSeat`.
            if (isReleaseSample) {
              dispatchDrag({
                type: "POINTER_MOVE",
                pointerId: owningPointerId,
                client,
              });
              dispatchDrag({
                type: "TARGET_RESOLVED",
                pointerId: owningPointerId,
                resolvedTarget: committableSeatRef.current,
              });
              return;
            }
            dispatchDrag({
              type: "POINTER_MOVE",
              pointerId: owningPointerId,
              client,
            });
            const freshTarget: DynamicDropState | null = resolvePointerTarget(
              client.x,
              client.y,
              current.sourceLeafId,
              current.resolvedTarget,
            );
            const seatedTarget: DynamicDropState | null =
              current.resolvedTarget;
            // Slot-commitment policy: once the ghost has hopped into a seated slot,
            // hold it (no retarget) until the policy says re-resolve. `zone-exit-hold`
            // holds until the cursor leaves the seated pane; `delta-responsive`
            // (default) re-aims once the cursor travels beyond the delta from the
            // seat anchor. The delta gates WHETHER to re-run resolution (a coarse
            // re-aim gate) — it is NOT fed into `resolveDropIntent`'s zone
            // hysteresis, so the two dampers never double-count.
            let nextTarget: DynamicDropState | null = freshTarget;
            if (
              seatedTarget != null &&
              isCommittableTarget(seatedTarget, current.sourceLeafId)
            ) {
              const cursorWithinSeatedFootprint: boolean =
                freshTarget != null &&
                freshTarget.leafId === seatedTarget.leafId;
              const reresolve: boolean = shouldReresolveSeatedTarget({
                mode: slotCommitmentRef.current.mode,
                seatAnchor: seatAnchorRef.current ?? client,
                currentClient: client,
                reresolveDeltaPx: slotCommitmentRef.current.reresolveDeltaPx,
                cursorWithinSeatedFootprint,
              });
              if (!reresolve) {
                nextTarget = seatedTarget;
              }
            }
            // Re-anchor the seat on a (re)seat onto a committable target; clear it
            // when no slot is seated so the next seat re-anchors fresh.
            if (
              nextTarget != null &&
              isCommittableTarget(nextTarget, current.sourceLeafId)
            ) {
              const isNewSeat: boolean =
                seatedTarget == null ||
                seatedTarget.leafId !== nextTarget.leafId ||
                seatedTarget.zone !== nextTarget.zone ||
                seatedTarget.action !== nextTarget.action;
              if (isNewSeat) {
                seatAnchorRef.current = { x: client.x, y: client.y };
              }
            } else {
              seatAnchorRef.current = null;
            }
            // Capture the committable seat synchronously so the RELEASE path
            // commits it verbatim without re-resolving the release coordinates.
            committableSeatRef.current = deriveCommittableSeat(
              nextTarget,
              current.sourceLeafId,
            );
            dispatchDrag({
              type: "TARGET_RESOLVED",
              pointerId: owningPointerId,
              resolvedTarget: nextTarget,
            });
          }
      }
    };

    // rAF coalescer: raw `pointermove` coords are buffered and processed at most
    // once per frame (latest wins), decoupling the input frame from the render
    // frame so multiple moves cannot trigger multiple target-resolution +
    // candidate-tree recomputes within one frame. `.cancel()` on teardown drops
    // any pending frame so it can never fire after the drag has settled.
    const coalescer: FrameCoalescer<DragMachinePoint> =
      createFrameCoalescer<DragMachinePoint>(processPointerSample, {
        request: window.requestAnimationFrame.bind(window),
        cancel: window.cancelAnimationFrame.bind(window),
      });

    // Touch long-press pickup timer. Armed once when a TOUCH press enters
    // `armed`; the held finger becomes a drag when it fires (mouse/pen never arm
    // it — they pick up immediately on the geometric threshold). A pre-long-press
    // scroll-axis flick reaches the FSM as a POINTER_MOVE → scroll-escape → idle,
    // which clears `activeDragPointerId`, re-runs this effect, and cancels the
    // timer in the cleanup below — so a released gesture never fires a stale
    // pickup. The guard inside re-reads the live phase so a threshold pickup that
    // already promoted to `dragging` (same owning pointer, no re-subscribe) does
    // not double-fire.
    const armedAtSetup: DragMachineState = dragStateRef.current;
    let longPressTimerId: number | null = null;
    if (armedAtSetup.phase === "armed" && armedAtSetup.touchDrag) {
      longPressTimerId = window.setTimeout((): void => {
        longPressTimerId = null;
        const held: DragMachineState = dragStateRef.current;
        if (
          held.phase !== "armed" ||
          !held.touchDrag ||
          held.pointerId !== owningPointerId
        ) {
          return;
        }
        // Held finger satisfied the long-press → take capture on the stable root
        // (the finger is still down), promote to dragging, and resolve the first
        // target at the held position (over the source pane → null; the ghost
        // free-follows until the finger moves onto another pane).
        const rootElement: HTMLDivElement | null = rootRef.current;
        if (rootElement?.setPointerCapture != null) {
          try {
            rootElement.setPointerCapture(owningPointerId);
            capturedPointerIdRef.current = owningPointerId;
          } catch {
            // Capture is best-effort; window listeners still receive events.
          }
        }
        dispatchDrag({ type: "LONG_PRESS", pointerId: owningPointerId });
        const firstTarget: DynamicDropState | null = resolvePointerTarget(
          held.originClient.x,
          held.originClient.y,
          held.sourceLeafId,
          null,
        );
        seatAnchorRef.current =
          firstTarget != null &&
          isCommittableTarget(firstTarget, held.sourceLeafId)
            ? { x: held.originClient.x, y: held.originClient.y }
            : null;
        committableSeatRef.current = deriveCommittableSeat(
          firstTarget,
          held.sourceLeafId,
        );
        dispatchDrag({
          type: "TARGET_RESOLVED",
          pointerId: owningPointerId,
          resolvedTarget: firstTarget,
        });
      }, touchLongPressMsRef.current);
    }

    const handlePointerMove = (event: PointerEvent): void => {
      if (event.pointerId !== owningPointerId) {
        return;
      }
      coalescer.schedule({ x: event.clientX, y: event.clientY });
    };
    const handlePointerUp = (event: PointerEvent): void => {
      if (event.pointerId !== owningPointerId) {
        return;
      }
      // Release-time synchronous resolve. A fast drag-release fires its
      // `pointermove`s and this `pointerup` within a single task, before the rAF
      // coalescer has a chance to flush — so the buffered sample (which both
      // promotes `armed → dragging` AND resolves the drop target) would be
      // dropped by `coalescer.cancel()` on teardown, leaving the FSM in `armed`
      // (or holding a stale target). POINTER_UP would then settle as a
      // click/cancel and the pane snaps back to its origin. Cancel the buffered
      // frame and process the RELEASE pointer position inline so the reducer
      // queue becomes POINTER_MOVE → TARGET_RESOLVED → POINTER_UP and the drop
      // commits to the slot under the pointer at release time. Touch is exempt:
      // a finger never reaches `dragging` without the long-press timer, so a
      // pre-pickup tap-release must stay a click (no synchronous promote).
      const releaseState: DragMachineState = dragStateRef.current;
      const releaseIsTouch: boolean =
        (releaseState.phase === "armed" ||
          releaseState.phase === "dragging") &&
        releaseState.touchDrag;
      if (!releaseIsTouch) {
        coalescer.cancel();
        processPointerSample(
          { x: event.clientX, y: event.clientY },
          true,
        );
      }
      dispatchDrag({ type: "POINTER_UP", pointerId: owningPointerId });
    };
    const handlePointerCancel = (event: PointerEvent): void => {
      if (event.pointerId !== owningPointerId) {
        return;
      }
      dispatchDrag({ type: "POINTER_CANCEL", pointerId: owningPointerId });
    };
    const handleLostPointerCapture = (event: PointerEvent): void => {
      if (event.pointerId !== owningPointerId) {
        return;
      }
      // Capture stolen (DOM unmount mid-drag, devtools, OS gesture) → cancel.
      dispatchDrag({ type: "POINTER_CANCEL", pointerId: owningPointerId });
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        dispatchDrag({ type: "ESCAPE" });
      }
    };
    const handleBlur = (): void => {
      dispatchDrag({ type: "BLUR" });
    };
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "hidden") {
        // M5 reconcile: a tab hidden mid-drag cancels through the existing edge,
        // and any transient FLIP styles are stripped so the leaves are clean when
        // the tab is shown again (INV-R4). The cancel side effect plus this strip
        // are both idempotent with the settle teardown.
        dispatchDrag({ type: "VISIBILITY_HIDDEN" });
        stripSurvivorTransientStyles();
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    window.addEventListener("lostpointercapture", handleLostPointerCapture);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return (): void => {
      // Drop any pending long-press timer so a released/scrolled gesture never
      // fires a stale pickup after the FSM has left `armed`.
      if (longPressTimerId != null) {
        window.clearTimeout(longPressTimerId);
        longPressTimerId = null;
      }
      // Drop any frame buffered this drag BEFORE removing listeners, so a
      // coalesced move can never resolve a target after settle/teardown.
      coalescer.cancel();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      window.removeEventListener(
        "lostpointercapture",
        handleLostPointerCapture,
      );
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    activeDragPointerId,
    onLiveHitLogChange,
    resolvePointerTarget,
    stripSurvivorTransientStyles,
  ]);

  // The single teardown path. On `settling` the renderer runs the commit OR the
  // cancel side effect (NEVER both), releases pointer capture, then advances the
  // FSM to `idle`. Commit applies the SAME reducer with the SAME args as the last
  // candidate derivation (no release-time jump). Cancel never calls
  // `onLayoutChange`, so `displayLayout` falls straight back to the untouched
  // prop `layout` — the dragged pane is restored to its EXACT original position —
  // and the ghost flies back to its origin.
  React.useEffect((): void => {
    if (dragState.phase !== "settling") {
      return;
    }
    const rootElement: HTMLDivElement | null = rootRef.current;
    const owningPointerId: number | null = capturedPointerIdRef.current;
    if (
      rootElement != null &&
      owningPointerId != null &&
      rootElement.releasePointerCapture != null &&
      rootElement.hasPointerCapture?.(owningPointerId)
    ) {
      try {
        rootElement.releasePointerCapture(owningPointerId);
      } catch {
        // Already released.
      }
    }
    capturedPointerIdRef.current = null;
    // M4 backstop: strip any residual FLIP transform/transition from the
    // survivors + cancel tracked dips/raced handles on the settle edge, so once
    // the FSM reaches `idle` no `[data-leaf-id]` element retains a non-identity
    // inline transform (INV-R1). On commit the subsequent layout change re-arms a
    // fresh survivor reflow; on cancel the leaves stay at identity.
    stripSurvivorTransientStyles();

    const committedTree: DynamicLayoutNode | null =
      dragState.outcome === "commit" && dragState.resolvedTarget != null
        ? deriveCandidateTree(
            layout,
            dragState.sourceLeafId,
            dragState.resolvedTarget,
          )
        : null;
    // Commit-time tree verification: a corrupt candidate (duplicated/orphaned
    // leaf, NaN ratio, missing split child) is REFUSED — the drag falls through
    // to the cancel fly-back instead of persisting a broken layout. Structurally
    // sound candidates commit through the SAME reducer args as the last preview
    // frame (no release-time jump).
    if (committedTree != null && isStructurallyValidLayout(committedTree)) {
      onLayoutChange(committedTree);
      // Focus follows the dragged pane through the drop: focus the leaf the
      // dragged content now occupies (the resolved target for a swap, the source
      // leaf for an edge-insert / group-merge). The dragged pane therefore ends
      // the gesture as the focused pane — the natural continuation of the ghost
      // having carried the focus frame during the drag.
      const committedFocusLeafId: string | null = resolveDragCommitFocusLeafId(
        dragState.sourceLeafId,
        dragState.resolvedTarget,
      );
      if (committedFocusLeafId != null) {
        setFocusedLeaf(committedFocusLeafId);
      }
    } else if (dragSnapshotRef.current != null) {
      beginCancelFlyBackAnimation({
        sourceLeafId: dragState.sourceLeafId,
        sourceFootprint: dragState.toFootprint,
        activeFootprint: dragState.fromFootprint,
        seatFootprint: null,
        pointerAnchorOffsetX: 0,
        pointerAnchorOffsetY: 0,
        snapshot: dragSnapshotRef.current,
      });
    }
    dragSnapshotRef.current = null;
    seatAnchorRef.current = null;
    committableSeatRef.current = null;
    setSeatFootprint(null);
    onLiveHitLogChange?.(null);
    didPaintDraggingFrameRef.current = false;
    dispatchDrag({ type: "SETTLE_DONE" });
  }, [
    beginCancelFlyBackAnimation,
    dragState,
    layout,
    onLayoutChange,
    onLiveHitLogChange,
    setFocusedLeaf,
    stripSurvivorTransientStyles,
  ]);

  // M3 idle watchdog. While the FSM is `armed` or `dragging`, a monotonic-clock
  // timer is armed for `dragRecoveryMaxIdleMs`; every FSM transition (pickup,
  // each coalesced pointer move, target resolution) re-runs this effect and so
  // re-arms the timer — i.e. progress resets the idle clock. If the drag stalls
  // (hang under CPU throttling, a dropped pointercancel, a wedged compositor)
  // past the idle budget, the watchdog force-reconciles by dispatching
  // `POINTER_CANCEL` — reusing the existing cancel edge (no new FSM phase/event)
  // so the normal `settling(cancel) → idle` teardown releases capture, and a
  // belt-and-braces style strip clears any residual transforms (INV-R2). Gated
  // by the `dragRecovery.enable` capability; the monotonic `now` guard makes the
  // expiry robust to timer coalescing/throttling.
  React.useEffect((): undefined | (() => void) => {
    if (!isDragRecoveryEnabled) {
      return undefined;
    }
    if (dragState.phase !== "armed" && dragState.phase !== "dragging") {
      return undefined;
    }
    const watchdog: DragWatchdog = createDragWatchdog({
      maxIdleMs: dragRecoveryMaxIdleMs,
      now: monotonicNow,
      scheduler: WINDOW_TIMER_SCHEDULER,
      onExpire: (): void => {
        dispatchDrag({ type: "POINTER_CANCEL" });
        stripSurvivorTransientStyles();
      },
    });
    watchdog.progress();
    return (): void => {
      watchdog.cancel();
    };
  }, [
    dragState,
    isDragRecoveryEnabled,
    dragRecoveryMaxIdleMs,
    stripSurvivorTransientStyles,
  ]);

  const resolveLiveHitLogState = React.useCallback(
    (
      event: React.SyntheticEvent<HTMLElement> & {
        clientX: number;
        clientY: number;
      },
      hoveredLeafId: string,
    ): DynamicLiveHitLogState | null => {
      const pointerX: number = event.clientX;
      const pointerY: number = event.clientY;
      const targetFootprint: DynamicPaneFootprint | undefined =
        leafFootprintsById.get(hoveredLeafId);
      if (targetFootprint == null) {
        return null;
      }
      const paneRect: DOMRect = event.currentTarget.getBoundingClientRect();
      const paneLocalPoint = toPaneLocalPoint(
        { x: pointerX, y: pointerY },
        { left: paneRect.left, top: paneRect.top },
      );
      const paneSize = { width: paneRect.width, height: paneRect.height };
      const geometryConfig: DynamicZoneGeometryConfig = currentGeometryConfig(
        interactionCapabilities.dropHitZoneGeometry,
      );
      const viewportRect: DOMRect | undefined =
        viewportRef.current?.getBoundingClientRect();
      const cursorViewport = {
        x: viewportRect == null ? pointerX : pointerX - viewportRect.left,
        y: viewportRect == null ? pointerY : pointerY - viewportRect.top,
      };
      const resolverSourceLeafId: string | null =
        dragSourceLeafId ??
        paneHitZoneSourceLeafId ??
        activeFocusedLeafId ??
        null;
      const dragSourcePaneFootprint: DynamicPaneFootprint | null =
        dragSourceLeafId == null
          ? null
          : (leafFootprintsById.get(dragSourceLeafId) ?? null);
      const hitZoneDiagnostics: DynamicDropIntentHitZoneDiagnostics =
        resolveDropIntentHitZoneDiagnostics({
          paneSize,
          geometryConfig,
          evaluateZone: (
            zone: DynamicLeafDropZone,
          ): { isValid: boolean; rejectionReason: string | null } =>
            evaluateZoneCandidate({
              zone,
              layout,
              sourceLeafId: resolverSourceLeafId,
              targetLeafId: hoveredLeafId,
              targetFootprint,
              config,
              viewportWidth: viewportSize.width,
              viewportHeight: viewportSize.height,
            }),
        });
      const edgeDiagnostics: DynamicLiveHitLogState["edgeDiagnostics"] =
        hitZoneDiagnostics.edgeZones.map((edgeZoneDiagnostic) => ({
          zone: edgeZoneDiagnostic.zone,
          isValid: edgeZoneDiagnostic.isValid,
          rejectionReason: edgeZoneDiagnostic.rejectionReason,
        }));
      const centerIsValid: boolean =
        resolverSourceLeafId == null || resolverSourceLeafId !== hoveredLeafId;
      const centerBlockedReason: string | null = centerIsValid
        ? null
        : `center swap blocked: same source and target leaf (${hoveredLeafId})`;

      if (
        resolverSourceLeafId == null ||
        resolverSourceLeafId === hoveredLeafId
      ) {
        return {
          hoveredLeafId,
          sourceLeafId: hoveredLeafId,
          dragSourceLeafId,
          cursorViewport,
          sourcePaneFootprint: targetFootprint,
          dragSourcePaneFootprint,
          isDragging: dragSourceLeafId != null,
          resolverZone: "none",
          centerRatio: hitZoneDiagnostics.centerRatio,
          edgeThresholdRatio: hitZoneDiagnostics.edgeThresholdRatio,
          centerRectWidthPx: hitZoneDiagnostics.centerRectWidthPx,
          centerRectHeightPx: hitZoneDiagnostics.centerRectHeightPx,
          centerIsValid,
          centerBlockedReason,
          edgeDiagnostics,
          intent: null,
        };
      }

      const splitPath: ReadonlyArray<DynamicSplitPathEntry> =
        readSplitPathToLeaf(layout, hoveredLeafId) ?? [];
      const axisPath: ReadonlyArray<DynamicSplitAxis> = splitPath.map(
        (pathEntry: DynamicSplitPathEntry): DynamicSplitAxis => pathEntry.axis,
      );
      const previousZone: DynamicLeafDropZone | null = previousZoneSeed(
        dropState,
        hoveredLeafId,
      );
      const resolvedIntent: DynamicDropState = resolveDropIntent({
        leafId: hoveredLeafId,
        paneLocalX: paneLocalPoint.x,
        paneLocalY: paneLocalPoint.y,
        paneSize,
        axisPath,
        geometryConfig,
        previousZone,
        evaluateZone: (
          zone: DynamicLeafDropZone,
        ): { isValid: boolean; rejectionReason: string | null } =>
          evaluateZoneCandidate({
            zone,
            layout,
            sourceLeafId: resolverSourceLeafId,
            targetLeafId: hoveredLeafId,
            targetFootprint,
            config,
            viewportWidth: viewportSize.width,
            viewportHeight: viewportSize.height,
          }),
      });
      const intent: DynamicDropIntentDebugState =
        toDropIntentDebugState(resolvedIntent);

      return {
        hoveredLeafId,
        sourceLeafId: hoveredLeafId,
        dragSourceLeafId,
        cursorViewport,
        sourcePaneFootprint: targetFootprint,
        dragSourcePaneFootprint,
        isDragging: dragSourceLeafId != null,
        resolverZone: intent.zone,
        centerRatio: hitZoneDiagnostics.centerRatio,
        edgeThresholdRatio: hitZoneDiagnostics.edgeThresholdRatio,
        centerRectWidthPx: hitZoneDiagnostics.centerRectWidthPx,
        centerRectHeightPx: hitZoneDiagnostics.centerRectHeightPx,
        centerIsValid,
        centerBlockedReason,
        edgeDiagnostics,
        intent,
      };
    },
    [
      activeFocusedLeafId,
      config,
      dragSourceLeafId,
      dropState,
      layout,
      leafFootprintsById,
      paneHitZoneSourceLeafId,
      viewportSize.height,
      viewportSize.width,
    ],
  );

  const renderBranch = React.useCallback(
    (
      node: DynamicLayoutNode,
      containerWidthPx: number,
      containerHeightPx: number,
    ): React.ReactElement => {
      if (node.kind === "leaf") {
        const tile: DynamicTile | undefined = resolveTile(tiles, node.tileId);
        const tileForDisplay: DynamicTile = tile ?? {
          id: `missing-${node.tileId}`,
          title: `missing tile ${node.tileId}`,
          description: "no tile matched this leaf id",
          accent: "pink",
          rows: ["tile map does not contain this tile id"],
        };

        const isMoveSource: boolean = moveModeState?.sourceLeafId === node.id;
        const moveTargetPlacement: DynamicMovePlacement | null =
          moveModeState != null && moveModeState.targetLeafId === node.id
            ? moveModeState.placement
            : null;
        // Drag presentation is CONTENT-AGNOSTIC: the resolver decides the
        // ghost-seat reservation + role flags purely from drag mechanics, with
        // no reference to the CONTENT toggle. Live mode: ghost-seat slot = the
        // content-less hop-in reservation the single ghost fills.
        const leafPresentation = resolveDragPresentation({
          liveDragModeEnabled,
          dragPhase: dragState.phase,
          settlingOutcome: dragSettlingOutcome,
          leafId: node.id,
          pickupOriginLeafId: presentationSourceLeafId,
          ghostSeatLeafId,
          dropAction:
            dropState?.leafId === node.id ? (dropState.action ?? null) : null,
          dropZone:
            dropState?.leafId === node.id ? (dropState.zone ?? null) : null,
          dropDominantEdge:
            dropState?.leafId === node.id ? (dropState.dominantEdge ?? null) : null,
        });
        const isDragSourceSlot: boolean = liveDragModeEnabled
          ? leafPresentation.isGhostSeatLeaf
          : leafPresentation.isPickupOriginLeaf &&
            dragState.phase === "dragging";
        // The uniform pane-body rule: a ghost-seat reservation is a content-less
        // seat (drag mechanic); every other slot honors the CONTENT toggle
        // identically to a resting pane.
        const paneBodyRenderMode: DynamicPaneBodyRenderMode =
          resolvePaneBodyRenderMode(
            leafPresentation.isGhostSeatReservation,
            isPaneContentVisible,
          );
        const isDropTargetLeaf: boolean =
          dropState?.leafId === node.id && dropState.action !== "none";
        // The drop-target chrome zone (edge-insert-vs-center already resolved in
        // the presentation SSOT — no caller-side ternary).
        const effectiveDropZone: DynamicLeafDropZone | null =
          leafPresentation.dropChromeZone;

        const tileArgs: DynamicRenderTileArgs = {
          leafId: node.id,
          tile: tileForDisplay,
          paneOrdinal: Math.max(1, leafIds.indexOf(node.id) + 1),
          paneWidthPx: containerWidthPx,
          isPaneContentVisible,
          paneBodyRenderMode,
          isDragSource: isDragSourceSlot,
          isDropTarget: isDropTargetLeaf,
          isDropEligible:
            dragSourceLeafId != null && dragSourceLeafId !== node.id,
          isHoveringDropCandidate: dropState?.leafId === node.id,
          isInvalidDrop: false,
          isFocused: isFocusSelectionEnabled && activeFocusedLeafId === node.id,
          isRearrangeEnabled: isLeafRearrangeEligible(node.id),
          isMoveSource,
          moveTargetPlacement,
          isMaximized: activeMaximizedLeafId === node.id,
          isMaximizeEnabled,
          onToggleMaximize: (): void => {
            toggleMaximizeLeaf(node.id);
          },
          isTitleBarSizingEnabled,
          isTitleBarAcquireSpaceEnabled,
          widthSizingMode: resolveSizingMode(node.sizing, "width"),
          heightSizingMode: resolveSizingMode(node.sizing, "height"),
          onSetSizingMode: (mode: TilingTitleBarSizingMode): void => {
            setLeafSizingFromBbox(node.id, mode);
          },
          onAcquireSpace: (direction: DynamicFocusDirection): void => {
            acquireLeafSpace(node.id, direction);
          },
          dropZone: effectiveDropZone,
          dropIntentDebugPath:
            dropState?.leafId === node.id
              ? dropIntentAxisPathLabel(dropState.axisPath)
              : null,
          dropIntentDebugAction:
            dropState?.leafId === node.id ? dropState.action : null,
          preview: resolveLeafDropPreviewForMode(
            liveDragModeEnabled,
            node.id,
            dragSourceLeafId,
            dropState,
          ),
          showDropPreviewOverlays,
          showDropBorderHints,
          showDropIntentTranslucentBg,
          showDropIntentDebug,
          dropHitZoneCenterRatio:
            interactionCapabilities.dropHitZoneGeometry.centerRatio,
          dropHitZoneCenterRatioX:
            interactionCapabilities.dropHitZoneGeometry.centerRatioX,
          dropHitZoneCenterRatioY:
            interactionCapabilities.dropHitZoneGeometry.centerRatioY,
          paneHitZonesAlpha: paneHitZonesAlphaSafe,
          paneHitZoneDebug: showPaneHitZones
            ? (paneHitZoneDebugByLeafId.get(node.id) ?? null)
            : null,
          observabilityColors,
          observabilityColorEnables,
          onFocus: (): void => {
            setFocusedLeaf(node.id);
          },
          // Pointer-Events pickup on the drag handle (the title-bar grip). Capture
          // is taken (on the stable root) only once the pickup threshold is
          // crossed, in the window pointermove listener — so a sub-threshold tap
          // stays a click and is never stolen from the title bar.
          onHandlePointerDown: (
            event: React.PointerEvent<HTMLElement>,
          ): void => {
            // Per-leaf gate: a statically-gated pane (a static pane itself, or a
            // leaf in an unpinned-static subtree) is not a drag source.
            if (!isLeafRearrangeEligible(node.id)) {
              return;
            }
            if (event.pointerType === "mouse" && event.button !== 0) {
              return;
            }
            // Touch-drag enable gate: when a consumer reserves touch for
            // tap/scroll (`touchDrag.enable: false`), a touch press never starts a
            // drag. Mouse/pen are unaffected.
            if (
              event.pointerType === "touch" &&
              !interactionCapabilities.touchDrag.enable
            ) {
              return;
            }
            const currentPhase: DragMachineState["phase"] =
              dragStateRef.current.phase;
            if (currentPhase === "armed" || currentPhase === "dragging") {
              return;
            }
            // Synchronously stop the browser from STARTING a text selection on
            // this press (the `select-none` class only lands on the next render,
            // too late to cancel a selection the pointerdown itself begins), and
            // clear any pre-existing selection so it does not linger highlighted
            // through the drag. Skipped for interactive title-bar controls so
            // their native focus/click behavior is untouched. Safe before
            // capture: `setPointerCapture` runs later on threshold crossing.
            const pressTarget: EventTarget | null = event.target;
            const isInteractiveControl: boolean =
              pressTarget instanceof Element &&
              pressTarget.closest(
                'button, a, input, textarea, select, [role="button"]',
              ) != null;
            if (!isInteractiveControl) {
              event.preventDefault();
              if (typeof window !== "undefined") {
                window.getSelection()?.removeAllRanges();
              }
            }
            setFocusedLeaf(node.id);
            setCancelVisualState(null);
            onLiveHitLogChange?.(null);
            const sourcePaneElement: HTMLElement =
              event.currentTarget.closest("article[data-leaf-id]") ??
              event.currentTarget;
            const sourcePaneRect: DOMRect =
              sourcePaneElement.getBoundingClientRect();
            dragSnapshotRef.current = buildDragPaneSnapshot(tileForDisplay);
            dispatchDrag({
              type: "POINTER_DOWN",
              pointerId: event.nativeEvent.pointerId,
              pointerType: resolveDragPointerType(event.pointerType),
              sourceLeafId: node.id,
              anchorFootprint: {
                left: sourcePaneRect.left,
                top: sourcePaneRect.top,
                width: sourcePaneRect.width,
                height: sourcePaneRect.height,
              },
              pointerAnchorOffset: {
                x: event.clientX - sourcePaneRect.left,
                y: event.clientY - sourcePaneRect.top,
              },
              originClient: { x: event.clientX, y: event.clientY },
            });
          },
          onPointerMove: (event: React.PointerEvent<HTMLElement>): void => {
            // Pre-drag hover telemetry only; while a drag is in flight the
            // captured window listener owns pointer moves + target resolution.
            if (dragStateRef.current.phase !== "idle") {
              return;
            }
            const liveHitLogState: DynamicLiveHitLogState | null =
              resolveLiveHitLogState(event, node.id);
            onLiveHitLogChange?.(liveHitLogState);
          },
          onPointerLeave: (event: React.PointerEvent<HTMLElement>): void => {
            const nextElement: EventTarget | null = event.relatedTarget;
            if (
              nextElement instanceof HTMLElement &&
              event.currentTarget.contains(nextElement)
            ) {
              return;
            }
            if (dragStateRef.current.phase !== "idle") {
              return;
            }
            onLiveHitLogChange?.(null);
          },
        };

        // A leaf static in a dimension is content-sized in that dimension —
        // UNLESS the title-bar STATIC action pinned a measured bbox px on that
        // dimension (PART 2 freeze). When pinned, the wrapper takes the exact
        // pixel extent (no stretch, no shrink); when static-but-unpinned it
        // content-sizes (`h-auto`/`w-auto`, the legacy intrinsic behavior);
        // when flexible it keeps the fill + overflow clamp.
        const leafStaticHeight: boolean = isStaticInDimension(node, "height");
        const leafStaticWidth: boolean = isStaticInDimension(node, "width");
        const pinnedHeightPx: number | undefined = leafStaticHeight
          ? node.sizing?.heightPx
          : undefined;
        const pinnedWidthPx: number | undefined = leafStaticWidth
          ? node.sizing?.widthPx
          : undefined;
        const leafWrapperStyle: React.CSSProperties = {};
        if (pinnedHeightPx != null) {
          leafWrapperStyle.height = pinnedHeightPx;
          leafWrapperStyle.flexShrink = 0;
        }
        if (pinnedWidthPx != null) {
          leafWrapperStyle.width = pinnedWidthPx;
          leafWrapperStyle.flexShrink = 0;
        }
        const leafHeightClass: string = leafStaticHeight
          ? pinnedHeightPx != null
            ? ""
            : "h-auto"
          : "h-full max-h-full min-h-0";
        const leafWidthClass: string = leafStaticWidth
          ? pinnedWidthPx != null
            ? ""
            : "w-auto"
          : "w-full min-w-0";
        const showMoveAffordance: boolean =
          isMoveSource || moveTargetPlacement != null;
        // Single-instance gate: when the picked-up source leaf appears in the
        // live candidate tree (target resolved → it sits in the destination
        // slot), paint that slot as a content-less RESERVATION — the slot still
        // reflows open (survivors make room) but the single ghost
        // (`DragPaneOverlay`) HOPS INTO and FILLS it, so the slot is never an
        // empty hole and the source is never painted twice. Renderer-agnostic on
        // purpose: it overrides any custom `renderTile` too, so no consumer
        // re-introduces the in-slot source copy.
        const renderReservedDragSlot: boolean =
          tileArgs.paneBodyRenderMode === "render-reservation";
        return (
          <div
            className={cn(
              isSurvivorReflowOverflowWindow
                ? "overflow-visible"
                : "overflow-hidden",
              leafHeightClass,
              leafWidthClass,
              showMoveAffordance ? "relative" : "",
            )}
            style={leafWrapperStyle}
            // A reserved slot renders `DragSourceSlotReservation` (which carries
            // `data-drag-source-reservation` but no `data-leaf-id`) INSTEAD of
            // `DefaultDynamicTile` (the sole `data-leaf-id` emitter), so the seat
            // measurement's SCOPED selector (`dragSourceReservationSelector`)
            // would have no `data-leaf-id` ancestor to resolve against — the
            // `cc23956` regression. Emit it on the reserved wrapper so the scoped
            // selector matches and the ghost can hop into the seat. Only on the
            // reserved leaf, so non-reserved leaves keep their single
            // article-level `data-leaf-id` (no duplicate-id collection).
            {...(renderReservedDragSlot ? { "data-leaf-id": node.id } : {})}
          >
            {renderReservedDragSlot ? (
              <DragSourceSlotReservation
                theme={theme}
                accent={dragSnapshotRef.current?.accent ?? tileForDisplay.accent}
                observabilityColors={observabilityColors}
                observabilityColorEnables={observabilityColorEnables}
              />
            ) : renderTile == null ? (
              <DefaultDynamicTile {...tileArgs} />
            ) : (
              renderTile(tileArgs)
            )}
            {showMoveAffordance ? (
              <MovePaneAffordance
                isMoveSource={isMoveSource}
                moveTargetPlacement={moveTargetPlacement}
              />
            ) : null}
          </div>
        );
      }

      // Group arm (HT-GROUP-TABBED-STACKING): N leaves share ONE slot as a
      // stacked group with a tab strip across the top — only the active member
      // renders below (the stacking contract). Tabs switch the active member via
      // the `group-tab-jump` command (routed through the same `dispatchCommand`).
      if (node.kind === "group") {
        const groupNode: DynamicGroupNode = node;
        const activeMember: DynamicLeafNode =
          groupNode.members.find(
            (member: DynamicLeafNode): boolean =>
              member.id === groupNode.activeMemberId,
          ) ?? groupNode.members[0];
        const isGroupMergeTarget: boolean =
          dropState?.action === "group-merge" &&
          findGroupContainingLeaf(layout, dropState.leafId)?.id ===
            groupNode.id;
        return (
          <section
            ref={(element: HTMLDivElement | null): void =>
              setSplitContainerRef(groupNode.id, element)
            }
            data-group-id={groupNode.id}
            className={cn(
              "hpt-group relative flex h-full max-h-full min-h-0 w-full min-w-0 flex-col gap-1",
              isSurvivorReflowOverflowWindow
                ? "overflow-visible"
                : "overflow-hidden",
            )}
          >
            <div
              ref={(element: HTMLDivElement | null): void =>
                setGroupTabStripRef(groupNode.id, element)
              }
              role="tablist"
              aria-label={`group ${groupNode.id} members`}
              className={cn(
                "hpt-group-tab-strip flex shrink-0 items-center gap-1 overflow-x-auto rounded-lg border px-1.5 py-1 transition-colors",
                isGroupMergeTarget
                  ? "border-violet-400/60 bg-violet-500/15 ring-2 ring-violet-400/50"
                  : "border-white/10 bg-black/30",
              )}
            >
              {groupNode.members.map(
                (
                  member: DynamicLeafNode,
                  memberIndex: number,
                ): React.ReactElement => {
                  const memberTile: DynamicTile | undefined = resolveTile(
                    tiles,
                    member.tileId,
                  );
                  const memberTitle: string =
                    memberTile?.title ?? member.tileId;
                  const isActiveMember: boolean =
                    member.id === groupNode.activeMemberId;
                  return (
                    <div
                      key={`hpt-group-tab-${member.id}`}
                      className={cn(
                        "hpt-group-tab flex shrink-0 items-center gap-0.5 rounded border font-mono text-[10px] uppercase tracking-[0.1em] transition-colors",
                        isActiveMember
                          ? theme.resolveTabActive(memberTile?.accent)
                          : "border-white/10 bg-slate-950/70 text-slate-400",
                      )}
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={isActiveMember}
                        title={`group member ${member.id} (Alt+${memberIndex + 1})`}
                        onClick={(): void => {
                          dispatchCommand({
                            kind: "group-tab-jump",
                            groupId: groupNode.id,
                            memberNumber: memberIndex + 1,
                          });
                        }}
                        className={cn(
                          "flex shrink-0 items-center gap-1.5 rounded px-2 py-1 transition-colors",
                          isActiveMember
                            ? "text-inherit"
                            : "hover:border-white/25 hover:text-slate-200",
                        )}
                      >
                        <span className="font-semibold opacity-70">
                          {memberIndex + 1}
                        </span>
                        <span className="max-w-[12ch] truncate">
                          {memberTitle}
                        </span>
                      </button>
                      {isGroupingEnabled ? (
                        <button
                          type="button"
                          aria-label={`remove ${memberTitle} from group ${groupNode.id}`}
                          title={`Eject ${memberTitle} from this group`}
                          onClick={(
                            event: React.MouseEvent<HTMLButtonElement>,
                          ): void => {
                            event.stopPropagation();
                            dispatchCommand({
                              kind: "remove-from-group",
                              groupId: groupNode.id,
                              memberId: member.id,
                            });
                          }}
                          className="hpt-group-tab-remove mr-0.5 rounded border border-white/10 px-1 py-0.5 text-[9px] text-slate-500 transition-colors hover:border-rose-400/50 hover:bg-rose-500/10 hover:text-rose-200"
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  );
                },
              )}
            </div>
            <div className="hpt-group-active relative min-h-0 w-full flex-1 overflow-hidden">
              {renderBranch(activeMember, containerWidthPx, containerHeightPx)}
            </div>
          </section>
        );
      }

      // Master/stack arm (HT-LAYOUT-MASTER-STACK): a split set to `layoutMode:
      // "master"` flattens its descendant slots and positions each ABSOLUTELY
      // from the same `resolveMasterStackFootprints` geometry the hit-testing /
      // overlay / focus layers read — so the rendered DOM and the resolved
      // footprints can never diverge. Dwindle (the default) falls through to the
      // recursive flex spine below.
      if (node.layoutMode === "master") {
        const masterSlots: ReadonlyArray<DynamicLayoutNode> =
          collectMasterSlots(node);
        const masterFootprints = footprintsByLeafId(
          resolveMasterStackFootprints(
            masterSlots,
            0,
            0,
            containerWidthPx,
            containerHeightPx,
            config,
            resolveMasterParams(node, masterSlots.length),
          ),
        );
        return (
          <section
            ref={(element: HTMLDivElement | null): void =>
              setSplitContainerRef(node.id, element)
            }
            className={cn(
              "relative h-full max-h-full min-h-0 w-full min-w-0",
              isSurvivorReflowOverflowWindow
                ? "overflow-visible"
                : "overflow-hidden",
            )}
          >
            {masterSlots.map(
              (slot: DynamicLayoutNode): React.ReactElement | null => {
                const slotFootprint = masterFootprints.get(
                  slotRepresentativeLeafId(slot),
                );
                if (slotFootprint == null) {
                  return null;
                }
                return (
                  <div
                    key={slot.id}
                    className="absolute"
                    style={{
                      left: slotFootprint.left,
                      top: slotFootprint.top,
                      width: slotFootprint.width,
                      height: slotFootprint.height,
                    }}
                  >
                    {renderBranch(
                      slot,
                      slotFootprint.width,
                      slotFootprint.height,
                    )}
                  </div>
                );
              },
            )}
          </section>
        );
      }

      const resolvedGapPx: number = node.gapPx ?? config.gapPx;
      const resolvedMinPaneSizePx: number =
        node.minPaneSizePx ?? config.minPaneSizePx;
      const isHorizontal: boolean = node.axis === "horizontal";
      const axisContainerSizePx: number = isHorizontal
        ? containerWidthPx
        : containerHeightPx;

      // Per-child static flags. A child static ALONG the split axis is
      // content-sized + excluded from ratio + removes the divider; a child static
      // on the CROSS axis content-sizes that axis (align-self:flex-start) but
      // still shares the split-axis ratio.
      const firstStaticAlongAxis: boolean = isStaticAlongSplitAxis(
        node.first,
        node.axis,
      );
      const secondStaticAlongAxis: boolean = isStaticAlongSplitAxis(
        node.second,
        node.axis,
      );
      const firstStaticCross: boolean = isStaticOnCrossAxis(
        node.first,
        node.axis,
      );
      const secondStaticCross: boolean = isStaticOnCrossAxis(
        node.second,
        node.axis,
      );

      const safeRatio: number = clampByMinSize(
        node.ratio,
        axisContainerSizePx,
        resolvedGapPx,
        resolvedMinPaneSizePx,
      );
      const isDividerResizeEnabled: boolean = isResizeAxisEnabled(
        interactionCapabilities.resize,
        node.axis,
      );
      const dividerRenderMode: DynamicSplitDividerRenderMode =
        resolveSplitDividerRenderMode({
          isBoundaryResizable: !firstStaticAlongAxis && !secondStaticAlongAxis,
          resizeHandlesVisible: interactionCapabilities.resizeHandlesVisible,
          isResizeAxisEnabled: isDividerResizeEnabled,
        });
      const renderDivider: boolean =
        dividerRenderMode !== "render-divider-absent";
      const isRenderedDividerInteractive: boolean =
        dividerRenderMode === "render-divider-enabled-visible" ||
        dividerRenderMode === "render-divider-enabled-hidden";
      const isDividerChromeVisible: boolean =
        dividerRenderMode === "render-divider-enabled-visible" ||
        dividerRenderMode === "render-divider-disabled-visible";
      const splitGapOffsetPx: number = renderDivider
        ? (resolvedGapPx + config.handleSizePx) / 2
        : 0;
      const distribution = resolveBinarySplitDistribution(
        firstStaticAlongAxis,
        secondStaticAlongAxis,
        safeRatio,
      );

      const mainFlexStyle = (
        sizing: SplitChildMainSizing,
      ): React.CSSProperties => {
        if (sizing.kind === "content") {
          return { flexGrow: 0, flexShrink: 0, flexBasis: "auto" };
        }
        if (sizing.kind === "fill") {
          return { flexGrow: 1, flexShrink: 1, flexBasis: 0 };
        }
        return {
          flexGrow: 0,
          flexShrink: 0,
          flexBasis: `calc(${sizing.basisFraction * 100}% - ${splitGapOffsetPx}px)`,
        };
      };
      const childMainPx = (sizing: SplitChildMainSizing): number =>
        sizing.kind === "ratio"
          ? Math.max(
              0,
              axisContainerSizePx * sizing.basisFraction - splitGapOffsetPx,
            )
          : axisContainerSizePx;
      const firstMainPx: number = childMainPx(distribution.first);
      const secondMainPx: number = childMainPx(distribution.second);
      const firstBranchWidthPx: number = isHorizontal
        ? firstMainPx
        : containerWidthPx;
      const firstBranchHeightPx: number = isHorizontal
        ? containerHeightPx
        : firstMainPx;
      const secondBranchWidthPx: number = isHorizontal
        ? secondMainPx
        : containerWidthPx;
      const secondBranchHeightPx: number = isHorizontal
        ? containerHeightPx
        : secondMainPx;

      return (
        <section
          ref={(element: HTMLDivElement | null): void =>
            setSplitContainerRef(node.id, element)
          }
          className={cn(
            "relative flex h-full max-h-full min-h-0 w-full min-w-0",
            isSurvivorReflowOverflowWindow
              ? "overflow-visible"
              : "overflow-hidden",
            isHorizontal ? "flex-row" : "flex-col",
          )}
        >
          <div
            className={cn(
              "flex min-h-0 min-w-0",
              isSurvivorReflowOverflowWindow
                ? "overflow-visible"
                : "overflow-hidden",
            )}
            style={{
              ...mainFlexStyle(distribution.first),
              ...(firstStaticCross ? { alignSelf: "flex-start" } : {}),
            }}
          >
            {renderBranch(node.first, firstBranchWidthPx, firstBranchHeightPx)}
          </div>

          {renderDivider ? (
            <div
              role="separator"
              // A vertical divider (between SIDE-BY-SIDE panes, split axis
              // "horizontal") is itself oriented vertically; a horizontal
              // divider (between STACKED panes, axis "vertical") is oriented
              // horizontally.
              aria-orientation={isHorizontal ? "vertical" : "horizontal"}
              aria-label={
                isRenderedDividerInteractive
                  ? `resize split ${node.id}`
                  : `split ${node.id} (resize disabled)`
              }
              aria-disabled={!isRenderedDividerInteractive}
              // The split ratio is the FIRST child's fraction; surface it as a
              // 0–100 percentage for assistive tech + keyboard resize.
              aria-valuenow={Math.round(safeRatio * 100)}
              aria-valuemin={5}
              aria-valuemax={95}
              aria-valuetext={`${Math.round(safeRatio * 100)}%`}
              data-resize-enabled={isRenderedDividerInteractive}
              tabIndex={isRenderedDividerInteractive ? 0 : -1}
              onPointerDown={
                isRenderedDividerInteractive
                  ? (event: React.PointerEvent<HTMLDivElement>): void =>
                      beginResize(
                        event,
                        node,
                        resolvedGapPx,
                        resolvedMinPaneSizePx,
                      )
                  : undefined
              }
              onKeyDown={
                isRenderedDividerInteractive
                  ? (event: React.KeyboardEvent<HTMLDivElement>): void =>
                      handleSeparatorKeyDown(
                        event,
                        node,
                        axisContainerSizePx,
                        resolvedGapPx,
                        resolvedMinPaneSizePx,
                      )
                  : undefined
              }
              className={cn(
                theme.divider.base,
                isDividerChromeVisible
                  ? cn(
                      isRenderedDividerInteractive
                        ? theme.divider.visibleInteractive
                        : theme.divider.visibleStatic,
                      isHorizontal
                        ? cn(
                            "h-full",
                            isRenderedDividerInteractive
                              ? "cursor-col-resize"
                              : undefined,
                          )
                        : cn(
                            "w-full",
                            isRenderedDividerInteractive
                              ? "cursor-row-resize"
                              : undefined,
                          ),
                    )
                  : cn(
                      theme.divider.hidden,
                      isHorizontal
                        ? cn(
                            "h-full",
                            isRenderedDividerInteractive
                              ? "cursor-col-resize"
                              : "cursor-default",
                          )
                        : cn(
                            "w-full",
                            isRenderedDividerInteractive
                              ? "cursor-row-resize"
                              : "cursor-default",
                          ),
                    ),
              )}
              style={
                isHorizontal
                  ? {
                      width: config.handleSizePx,
                      marginLeft: resolvedGapPx / 2,
                      marginRight: resolvedGapPx / 2,
                    }
                  : {
                      height: config.handleSizePx,
                      marginTop: resolvedGapPx / 2,
                      marginBottom: resolvedGapPx / 2,
                    }
              }
            />
          ) : null}

          <div
            className={cn(
              "flex min-h-0 min-w-0",
              isSurvivorReflowOverflowWindow
                ? "overflow-visible"
                : "overflow-hidden",
            )}
            style={{
              ...mainFlexStyle(distribution.second),
              ...(secondStaticCross ? { alignSelf: "flex-start" } : {}),
            }}
          >
            {renderBranch(
              node.second,
              secondBranchWidthPx,
              secondBranchHeightPx,
            )}
          </div>
        </section>
      );
    },
    [
      beginResize,
      handleSeparatorKeyDown,
      moveModeState,
      config.gapPx,
      config.handleSizePx,
      config.minPaneSizePx,
      activeFocusedLeafId,
      activeMaximizedLeafId,
      dragSourceLeafId,
      dragState.phase,
      dragSettlingOutcome,
      presentationSourceLeafId,
      ghostSeatLeafId,
      dropState,
      interactionCapabilities,
      isSurvivorReflowOverflowWindow,
      liveDragModeEnabled,
      isFocusSelectionEnabled,
      isMaximizeEnabled,
      isTitleBarSizingEnabled,
      isTitleBarAcquireSpaceEnabled,
      setLeafSizingFromBbox,
      acquireLeafSpace,
      isRearrangeEnabled,
      isLeafRearrangeEligible,
      renderTile,
      toggleMaximizeLeaf,
      resolveLiveHitLogState,
      setFocusedLeaf,
      setSplitContainerRef,
      paneHitZonesAlphaSafe,
      onLiveHitLogChange,
      showDropIntentDebug,
      showDropBorderHints,
      showDropIntentTranslucentBg,
      showDropPreviewOverlays,
      showPaneHitZones,
      paneHitZoneDebugByLeafId,
      observabilityColors,
      observabilityColorEnables,
      tiles,
      dispatchCommand,
      isGroupingEnabled,
      layout,
      setGroupTabStripRef,
      isPaneContentVisible,
      theme,
    ],
  );

  const maximizedLeaf: DynamicLeafNode | null =
    activeMaximizedLeafId != null
      ? findLeafById(layout, activeMaximizedLeafId)
      : null;
  // In live mode the displayed tree is the derived candidate tree (the
  // destination physically reflows to the post-drop result); otherwise the prop
  // layout. The projected landing overlays (S' / T' / successor) are the
  // PREVIEW-mode rendering of the pending result — in live mode the real reflow +
  // the cursor-following ghost replace them entirely, so they are suppressed (no
  // projection-vs-reflow double-preview). This is the render gate that guarantees
  // zero projection/landing-shadow in live mode.
  const showProjectedLandingOverlays: boolean =
    showDropPreviewOverlays && !liveDragModeEnabled;

  return (
    <TilingThemeProvider theme={theme}>
    <div
      ref={rootRef}
      tabIndex={-1}
      className={cn(
        theme.root.container,
        // Suppress native text selection across panes for the whole drag
        // gesture (`select-none` emits both `-webkit-user-select` and
        // `user-select: none`); the rule cascades to every pane body. Dropped
        // when the FSM is `idle`, so panes are normally selectable at rest.
        isDragGestureActive ? "select-none" : "",
        // Hide the OS cursor while the custom drag cursor (tier "c") is rendered;
        // `DragCursorOverlay` paints the pointer affordance instead.
        isCustomCursorActive ? "cursor-none" : "",
        className,
      )}
      onPointerEnter={(): void => {
        isPointerWithinRootRef.current = true;
      }}
      onPointerLeave={(): void => {
        isPointerWithinRootRef.current = false;
      }}
    >
      {showTabStrip && paneTabs.length > 0 ? (
        <div className="mb-1.5 shrink-0">
          <PaneTabStrip
            tabs={paneTabs}
            activeFocusedLeafId={activeFocusedLeafId}
            activeMaximizedLeafId={activeMaximizedLeafId}
            isPaneContentVisible={isPaneContentVisible}
            showContentToggle={showContentToggle}
            accentPicker={tabStripAccentPicker}
            themePicker={tabStripThemePicker}
            onSelect={activateLeaf}
            onTabDoubleClickMaximize={
              tabDoubleClickMaximizeEnabled
                ? (leafId: string): void => {
                    dispatchCommand(tabDoubleClickMaximizeCommand(leafId));
                  }
                : null
            }
            onPaneContentVisibilityChange={setIsPaneContentVisible}
          />
        </div>
      ) : null}
      <div
        ref={viewportRef}
        className={theme.root.viewport}
        // While dragging, the reflowing candidate-tree layer is made inert so
        // native hit-testing / `elementFromPoint` can NEVER re-target to a pane
        // that just slid under the cursor (belt-and-suspenders with the root's
        // pointer capture). The captured pointer routes to `rootRef` (the
        // ancestor), not via descendant hit-testing, so input is unaffected; the
        // ghost + cancel overlays are already `pointer-events-none`. Restored the
        // instant the FSM leaves `dragging`.
        style={
          dragState.phase === "dragging" ? { pointerEvents: "none" } : undefined
        }
      >
        {maximizedLeaf != null
          ? renderBranch(maximizedLeaf, viewportSize.width, viewportSize.height)
          : renderBranch(
              displayLayout,
              viewportSize.width,
              viewportSize.height,
            )}
        {showProjectedLandingOverlays ? (
          <ProjectedLandingOverlays
            overlays={projectedLandingOverlays}
            showLabels={showDropIntentDebug}
            observabilityColors={observabilityColors}
            observabilityColorEnables={observabilityColorEnables}
            projectedOverlayBackgroundAlpha={
              projectedOverlayBackgroundAlphaSafe
            }
          />
        ) : null}
        <DragCancelOverlay
          cancelVisualState={cancelVisualState}
          isPaneContentVisible={isPaneContentVisible}
        />
        <DragPaneOverlay
          dragVisualState={dragVisualState}
          dragHopDurationMs={ghostTransitDurationMs}
          hopEasing={resolvedHopEasing}
          pickupScaleFactor={ghostPickupScaleFactor(
            interactionCapabilities.ghostPickupScalePercent,
          )}
          coherentDipActive={shouldApplyCoherentTransitDip({
            enabled: interactionCapabilities.coherentTransit,
            action: dropState?.action ?? null,
            reducedMotion: prefersReducedMotion,
            speedsParity,
          })}
          swapBounceMagnitude={swapBounceMagnitude}
          prefersReducedMotion={prefersReducedMotion}
          isPaneContentVisible={isPaneContentVisible}
          frameDeadlineMs={dragRecoveryFrameDeadlineMs}
        />
        {dragCursorEnabled ? (
          <DragCursorOverlay
            dragVisualState={dragVisualState}
            presentation={dragCursorPresentation}
            dragHopDurationMs={ghostTransitDurationMs}
            hopEasing={resolvedHopEasing}
            prefersReducedMotion={prefersReducedMotion}
          />
        ) : null}
        {showSwitcherOverlay &&
        paneSwitcherState != null &&
        paneTabs.length > 0 ? (
          <PaneSwitcherOverlay
            tabs={paneTabs}
            selectedLeafId={paneSwitcherState.selectedLeafId}
            onSelect={(leafId: string): void => {
              setPaneSwitcherState(null);
              activateLeaf(leafId);
            }}
          />
        ) : null}
      </div>
    </div>
    </TilingThemeProvider>
  );
});

export function readTileOrderByLeaf(
  node: DynamicLayoutNode,
): ReadonlyArray<string> {
  if (node.kind === "leaf") {
    return [node.tileId];
  }

  if (node.kind === "group") {
    // Every grouped tile still exists in the layout (the group only changes how
    // they share a slot), so all member tiles are reported in tab order.
    return node.members.map((member: DynamicLeafNode): string => member.tileId);
  }

  return [
    ...readTileOrderByLeaf(node.first),
    ...readTileOrderByLeaf(node.second),
  ];
}

export function isLeafNode(node: DynamicLayoutNode): node is DynamicLeafNode {
  return node.kind === "leaf";
}
