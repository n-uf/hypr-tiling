"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  isCommandEnabled,
  isWorkspaceNavigationCommand,
  keyboardActionToCommand,
  tabDoubleClickMaximizeCommand,
  type TilingCommandGates,
} from "../engine/commands";
import {
  createTilingController,
  type TilingController,
  type TilingControllerHost,
  type TilingControllerState,
} from "../engine/controller";
import {
  clampCursorPointToViewport,
  resolveDragCursorPresentation,
  type DragCursorPoint,
  type DragCursorPresentation,
} from "../engine/drag-cursor";
import {
  findLeafByTileId,
  resolveDragLandingRect,
  type DragLandingGroupStrip,
} from "../engine/drag-landing";
import {
  activeDragSourceLeafId,
  activeResolvedTarget,
  canRearmDrag,
  createFrameCoalescer,
  deriveCandidateTree,
  detachDragSubject,
  isCommittableTarget,
  presentationDragSourceLeafId,
  presentationResolvedTarget,
  previousZoneSeed,
  resolveDragCommitFocusLeafId,
  resolveDragLandingLeafId,
  type DragMachinePoint,
  type DragMachineState,
  type DragPointerType,
  type DragSubject,
  type FrameCoalescer,
} from "../engine/drag-machine";
import {
  resolveDragPresentation,
  resolveInitialPaneContentVisible,
  resolvePaneBodyRenderMode,
} from "../engine/drag-presentation";
import {
  createDragWatchdog,
  type DragWatchdog,
} from "../engine/drag-recovery";
import type {
  TilingDropIntentHitZoneDiagnostics,
  TilingDropIntentState as TilingDropState,
  TilingEdgeZone,
  TilingZoneGeometryConfig,
} from "../engine/drop-intent-resolver";
import {
  TILING_DROP_INTENT_CONFIG,
  buildGroupTabStripMergeIntent,
  paneZoneCenterInsetPercent,
  paneZoneClipPaths,
  resolveDropIntent,
  resolveDropIntentHitZoneDiagnostics,
  resolveGroupTabInsertIndex,
  resolveGroupTabStripHit,
  resolveHostGroupDropTargetHit,
  toPaneLocalPoint,
  type TilingHostGroupDropTargetCandidate,
  type TilingHostGroupDropTargetHit,
} from "../engine/drop-intent-resolver";
import {
  collectStaticGatedLeafIds,
  evaluateZoneCandidate,
} from "../engine/drop-validity";
import { SETTLE_TEMPO } from "@n-uf/motion";
import { prefersReducedMotion as readPrefersReducedMotion } from "@n-uf/motion/browser";
import {
  createLeafMotion,
  type LeafMotion,
  type LeafMotionFrame,
  type LeafMotionTick,
} from "../engine/leaf-motion";
import {
  pruneFocusHistory,
  pushFocusHistory,
  resolveFocusCurrentOrLast,
  type FocusHistory,
} from "../engine/focus-history";
import {
  shouldArmIdleWatchdog,
  type DragInputDriver,
} from "../engine/input-driver";
import {
  isResizeAxisEnabled,
  resolveInteractionCapabilities,
} from "../engine/interaction-capabilities";
import { matchKeyBinding } from "../engine/keybindings";
import {
  LAYOUT_FILL_SLACK_TOLERANCE_PX,
  LAYOUT_RECONCILE_IDLE_MS,
  expectedTileIdsFromHostTiles,
  layoutCoversExpectedTiles,
  measureLayoutFillSlackPx,
  normalizeLayout,
} from "../engine/layout-normalize";
import {
  collectLeafFootprints,
  collectMasterSlots,
  footprintsByLeafId,
  resolveMasterParams,
  resolveMasterStackCssFootprints,
  resolveMasterStackFootprints,
  slotRepresentativeLeafId,
  type TilingRect,
} from "../engine/leaf-geometry";
import { isInteractiveControlTarget } from "../engine/interactive-controls";
import type { MeasurementPort } from "../engine/measurement-port";
import {
  canGroupMultiSelection,
  isMultiSelectModifierActive,
  pruneMultiSelection,
  resolveMultiSelectGroupCommand,
  resolveMultiSelectGroupHost,
  toggleLeafMultiSelection,
} from "../engine/multi-selection";
import {
  clampByMinSize,
  isStaticAlongSplitAxis,
  isStaticInDimension,
  isStaticOnCrossAxis,
  measuredStaticSizing,
  resolveAlongAxisFloor,
  resolveBinarySplitDistribution,
  resolveEffectiveStaticAlong,
  resolveRatioSafetyBounds,
  resolveSizingMode,
  splitBoundaryGutterPx,
  titleBarSizingModeId,
  type RatioSafetyBounds,
  type SplitChildMainSizing,
} from "../engine/pane-sizing";
import {
  advancePaneSwitcher,
  chordRequiresModifier,
  commitPaneSwitcher,
  directionToPlacement,
  isSwitcherHoldReleased,
  jumpPaneSwitcher,
  matchKeymapAction,
  openPaneSwitcher,
  resolveCycledPaneId,
  resolveJumpedPaneId,
  resolveMaximizeToggle,
} from "../engine/pane-switching";
import type { PointerCapturePort } from "../engine/pointer-capture-port";
import type {
  TilingProjectedLandingOverlay,
  TilingProjectedLandingSubject,
} from "../engine/projected-layout";
import {
  resolveProjectedDropLayout,
  resolveProjectedLandingOverlays,
} from "../engine/projected-layout";
import type { SchedulerPort } from "../engine/scheduler-port";
import type { TilingGrowConstraints } from "../engine/state";
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
  diffCollapsedLeaves,
  findGroupById,
  findGroupContainingLeaf,
  findLeafByDirection,
  findLeafById,
  groupLeaves,
  insertGroupAdjacent,
  insertLeafAdjacent,
  isStructurallyValidLayout,
  readLeafNodeIds,
  removeLeafTile,
  removeMemberFromGroup,
  setActiveGroupMember,
  setLeafCollapsed,
  setLeafSizing,
  toggleLeafCollapsed,
  setSplitLayoutMode,
  setSplitMasterCount,
  setSplitMasterOrientation,
  swapLeafTiles,
  toggleSplitAxis,
  ungroupNode,
  updateSplitRatio,
} from "../engine/state";
import {
  TILING_DEFAULT_WORKSPACE_PLACEMENT,
  TILING_MAIN_WORKSPACE_ID,
  activeWorkspace,
  cycleWorkspace,
  moveLeafToWorkspace,
  queryWorkspaceSet,
  repairWorkspaceSet,
  resetWorkspaceLayout,
  resetWorkspaceSet,
  revealTile,
  setWorkspaceLayout,
  switchWorkspace,
  workspaceSetIssues,
  type TilingRevealTileResult,
  type TilingWorkspace,
  type TilingWorkspaceSet,
  type TilingWorkspaceSetIssue,
} from "../engine/workspace-set";
import {
  TILING_SPRING_LOAD_DEFAULTS,
  TILING_SPRING_LOAD_INITIAL_STATE,
  springLoadFireAt,
  springLoadReducer,
  type TilingSpringLoadConfig,
  type TilingSpringLoadEvent,
  type TilingSpringLoadIntent,
  type TilingSpringLoadState,
} from "../engine/workspace-spring-load";
import type {
  TilingWorkspaceTransitionDirection,
  TilingWorkspaceTransitionMode,
} from "../engine/workspace-transition";
import type {
  ResolvedTilingDropHitZoneGeometryCapability,
  ResolvedTilingGroupTabStripOptions,
  ResolvedTilingInteractionCapabilities,
  ResolvedTilingWorkspaceSwitchCapability,
  ResolvedTilingKeymap,
  ResolvedTilingSlotCommitmentCapability,
  TilingCommand,
  TilingCommandHandle,
  TilingDefaultTileProps,
  TilingDragPreview,
  TilingClientPoint,
  TilingExternalDragHover,
  TilingExternalDragHoverResolver,
  TilingOnExternalDrop,
  TilingDropIntentDebugState,
  TilingFocusDirection,
  TilingGroupMemberView,
  TilingGroupNode,
  TilingKeyboardAction,
  TilingLayoutConfig,
  TilingLayoutNode,
  TilingChromeFocusOutline,
  TilingLeafDropPreview,
  TilingLeafDropZone,
  TilingLeafNode,
  TilingLiveHitLogState,
  TilingMoveModeState,
  TilingMovePlacement,
  TilingObservabilityColorConfig,
  TilingObservabilityColorEnableConfig,
  TilingPaneBodyRenderMode,
  TilingPaneCollapsedChangeEvent,
  TilingPaneIdentityMode,
  TilingPaneTab,
  ResolvedTilingPaneTabStripOptions,
  TilingPaneFootprint,
  TilingPaneHitZoneCandidateDebugState,
  TilingPaneHitZoneOverlayDebugState,
  TilingPaneSizing,
  TilingPaneSwitcherState,
  TilingRenderTileGroupContext,
  TilingRenderTileProps,
  TilingOverlayPortalContainer,
  TilingRendererModeProps,
  TilingRendererObservabilityProps,
  TilingRendererProps,
  TilingRendererWorkspaceSetProps,
  TilingWorkspaceSwitchVia,
  TilingSplitAxis,
  TilingSplitNode,
  TilingSplitResizeState,
  TilingTile,
  TilingTileAccent,
  TilingTileAccentSwatch,
  TilingTitleBarSizingMode,
} from "../engine/types";
import { TILING_DEFAULT_COLLAPSED_EXTENT_PX } from "../engine/types";
import { cn } from "./cn";
import {
  GroupTabStrip,
  TabStrip,
  tabStripRenderedHeight,
  type GroupTabStripMember,
  type TabStripItem,
} from "./group-tab-strip";
import { createDomMeasurementPort } from "./dom-measurement-port";
import { createDomPointerCapturePort } from "./dom-pointer-capture-port";
import { WORKSPACE_TRANSITION_LAYER_ATTR } from "./dom-view-capture";
import {
  clearLeafMotion,
  leafMotionFrameLoop,
  measureLeafLayoutRect,
  reportLeafMotionProbe,
  writeGroupStripMotion,
  writeLeafMotionFrame,
} from "./leaf-motion-dom";
import { TILING_TILE_ACCENT_SWATCHES } from "../engine/accent-hues";
import {
  TILING_THEMES,
  TilingThemeProvider,
  resolveDragChrome,
  resolvePaneDropAffordanceClasses,
  resolveTilingTheme,
  useTilingTheme,
  type TilingTheme,
  type TilingThemeDragChromeTokens,
  type TilingThemeId,
} from "./theme";
import { TilingPaneTitleBarContent } from "./tiling-pane-primitives";
import type { TilingWorkspaceSwipeOutcome } from "../engine/workspace-navigation";
import {
  useWorkspaceSwipeDriver,
  useWorkspaceSwipeStore,
  type TilingWorkspaceSwipeStore,
} from "./use-workspace-swipe";
import { fadeOutClaimedLayer } from "./claim-fade";
import {
  clientToViewportLength,
  clientToViewportPoint,
  measureViewportClientFrame,
  placeFixedLayer,
  type ViewportClientFrame,
} from "./viewport-frame";
import { createWindowSchedulerPort } from "./window-scheduler-port";
import {
  WorkspaceTransitionStage,
  type UseWorkspaceTransitionResult,
  type WorkspaceTransitionSettleKind,
} from "./workspace-transition";

/** Same external target (kind / targetId / workspaceId) — the point may differ. */
function isSameExternalDragTarget(
  a: TilingExternalDragHover | null,
  b: TilingExternalDragHover | null,
): boolean {
  if (a == null || b == null) {
    return a === b;
  }
  if (a.targetId !== b.targetId || (a.kind ?? "external") !== (b.kind ?? "external")) {
    return false;
  }
  return a.kind === "workspace-tab" && b.kind === "workspace-tab"
    ? a.workspaceId === b.workspaceId
    : true;
}

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
 * `TILING_DROP_INTENT_CONFIG`, so an unconfigured renderer keeps today's
 * behavior; `resolvePaneZoneGeometry` clamps `centerRatio` and floors the px
 * knobs, so this stays a thin pass-through.
 */
function currentGeometryConfig(
  geometry: ResolvedTilingDropHitZoneGeometryCapability,
): TilingZoneGeometryConfig {
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

/** A client-coordinate box (the subset of `DOMRect` a pickup reads). */
interface TilingClientRectLike {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface TilingSplitPathEntry {
  splitId: string;
  axis: TilingSplitAxis;
}

export const TILING_OBSERVABILITY_COLOR_DEFAULTS: TilingObservabilityColorConfig =
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

/**
 * Observability color-layer enables. The two LIVE-drag layers (source border
 * + seat tint, drop-target border / fill / inset shadow) default OFF: they are
 * inline-style debug overlays that would otherwise paint over the theme's
 * `dragChrome` on every consumer drag (a pink seat tint and a cyan target ring
 * no host theme authored). Toggle them on from the observability panel (or pass
 * `observabilityColorEnables`) when diagnosing drop resolution. The
 * PREVIEW-mode projected-landing layers stay on — they only render when
 * `showDropPreviewOverlays` is set and live drag mode is off.
 */
export const TILING_OBSERVABILITY_COLOR_ENABLE_DEFAULTS: TilingObservabilityColorEnableConfig =
  {
    dragSourceBorderEnabled: false,
    dragTargetBorderEnabled: false,
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
 * inter-pane gap (the divider element's hit-target spans the full
 * `gapPx + handleSizePx` gutter via padding; chrome paints only the center
 * `handleSizePx` through `bg-clip-content`. Each child subtracts
 * `(gapPx + handleSizePx) / 2` of basis — see `splitGapOffsetPx` in the split
 * renderer for the balancing math).
 */
export const DEFAULT_TILING_LAYOUT_CONFIG: TilingLayoutConfig = {
  gapPx: 6,
  minPaneSizePx: 96,
  handleSizePx: 4,
};

/** Default drag animation speed percent (`100` = the baseline duration). */
export const DEFAULT_DRAG_ANIMATION_SPEED_PERCENT: number = 100;

/** Slowest (floor) drag animation speed percent the slider + clamp allow. */
export const DRAG_ANIMATION_SPEED_MIN_PERCENT: number = 10;
/** Fastest (ceiling) drag animation speed percent the slider + clamp allow. */
export const DRAG_ANIMATION_SPEED_MAX_PERCENT: number = 400;

/**
 * The single `window`-backed {@link SchedulerPort} the renderer drives every
 * frame/timer/clock through (M1 rAF-with-timeout race, M2/M3 timer watchdog +
 * transition-settle, the rAF coalescer, the idle-watchdog clock). Created at
 * module scope (stable identity) so it never re-arms an effect; `window` is
 * referenced only inside the port closures, so it is SSR-safe (the closures run
 * only in a browser, inside effects). A `SchedulerPort` is structurally
 * assignable to `FrameOrTimeoutScheduler` and `TimerScheduler`, so it is passed
 * directly to the drag-recovery primitives; `FrameScheduler`'s `request`/`cancel`
 * are bridged to `requestFrame`/`cancelFrame` at the coalescer call-site.
 */
const WINDOW_SCHEDULER_PORT: SchedulerPort = createWindowSchedulerPort();

/**
 * The leaf-motion tempo (ω, 1/s) for a `survivorReflowSpeedPercent`: `100` is
 * `SETTLE_TEMPO.default` (25: 90 % of a move in 92 ms), lower is slower, higher
 * is faster, in proportion. Clamped like every drag animation speed percent to
 * `[DRAG_ANIMATION_SPEED_MIN_PERCENT, DRAG_ANIMATION_SPEED_MAX_PERCENT]`.
 */
export function resolveLeafMotionOmega(speedPercent: number): number {
  const clampedPercent: number = Math.min(
    Math.max(speedPercent, DRAG_ANIMATION_SPEED_MIN_PERCENT),
    DRAG_ANIMATION_SPEED_MAX_PERCENT,
  );
  return (SETTLE_TEMPO.default * clampedPercent) / 100;
}

function hasEnabledProjectedFill(
  enables: TilingObservabilityColorEnableConfig,
): boolean {
  return (
    enables.projectedSourceFillEnabled ||
    enables.projectedTargetFillEnabled ||
    enables.projectedSuccessorFillEnabled
  );
}

function projectedSubjectBorderEnabled(
  subject: TilingProjectedLandingSubject,
  enables: TilingObservabilityColorEnableConfig,
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
  subject: TilingProjectedLandingSubject,
  enables: TilingObservabilityColorEnableConfig,
): boolean {
  if (subject === "source") {
    return enables.projectedSourceFillEnabled;
  }
  if (subject === "target") {
    return enables.projectedTargetFillEnabled;
  }
  return enables.projectedSuccessorFillEnabled;
}

const PROJECTED_OVERLAY_Z_INDEX_BASE: number = 80;
const PROJECTED_OVERLAY_Z_INDEX_OFFSET: number = 1;
/**
 * The custom drag cursor (`DragCursorOverlay`) z-index, relative to the overlay
 * portal container's stacking context (default `document.body`, see
 * `overlayPortalContainer`), not the document: above the whole renderer.
 */
const DRAG_CURSOR_OVERLAY_Z_INDEX: number = 230;
/** Cursor badge diameter (px); half is reserved as the viewport-clamp margin. */
const DRAG_CURSOR_BADGE_SIZE_PX: number = 30;
/** The cursor badge's one-off entrance (scale + opacity). */
const DRAG_CURSOR_ENTRANCE_MS: number = 140;
const DRAG_CURSOR_ENTRANCE_EASING: string = "cubic-bezier(0.2, 0.8, 0.2, 1)";
/**
 * Inside the viewport (its own stacking context): the drop indicator sits
 * above every resting pane, and the dragged pane above the indicator, from the
 * lift until its drop settle ends.
 */
const DROP_INDICATOR_Z_INDEX: number = 40;
const RAISED_PANE_Z_INDEX: number = 50;
/**
 * Snap preview: the pointer must be this far inside a landing slot (CSS px,
 * at most a quarter of the slot's smaller side) before the pane snaps into it;
 * it stays snapped until the pointer leaves that slot.
 */
const DRAG_SNAP_INSET_PX: number = 24;

/** Whether point (`x`, `y`) lies in `rect` shrunk by `inset` on every side (edges included). */
function isInsideRect(rect: TilingRect, x: number, y: number, inset: number): boolean {
  return (
    x >= rect.x + inset &&
    x <= rect.x + rect.width - inset &&
    y >= rect.y + inset &&
    y <= rect.y + rect.height - inset
  );
}

/**
 * The tile registry is accepted as an ordered array or a `Map`. A plain array
 * is the natural shape for a config-driven dashboard; a `Map` is what the lab
 * passes. `resolveTile` reads a tile by id from either.
 */
function isTileArray(
  tiles: ReadonlyArray<TilingTile> | ReadonlyMap<string, TilingTile>,
): tiles is ReadonlyArray<TilingTile> {
  return Array.isArray(tiles);
}

function resolveTile(
  tiles: ReadonlyArray<TilingTile> | ReadonlyMap<string, TilingTile>,
  tileId: string,
): TilingTile | undefined {
  if (isTileArray(tiles)) {
    return tiles.find((tile: TilingTile): boolean => tile.id === tileId);
  }
  return tiles.get(tileId);
}

// Per-accent class strings, the closed `TilingThemeId` registry, and the
// active-theme context all live in `./theme`. Accent hue atoms
// (`TILING_ACCENT_HUES`) + the theme's accent-composition resolvers replace the
// former inline `TILING_TILE_ACCENT_THEMES` record and its helper functions;
// every renderer surface now reads tokens from the active `TilingTheme` (via
// `useTilingTheme`) instead of hardcoded class strings.

function dropIntentLabel(zone: TilingLeafDropZone): string {
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

function edgeZoneShortLabel(zone: TilingEdgeZone): string {
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

function edgeZoneLabelPositionClassName(zone: TilingEdgeZone): string {
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
  zone: TilingEdgeZone,
  isValid: boolean,
  observabilityColors: TilingObservabilityColorConfig,
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
  axisPath: ReadonlyArray<TilingSplitAxis>,
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
const DROP_EDGE_ZONE_PAINT_ORDER: ReadonlyArray<TilingEdgeZone> = [
  "left",
  "right",
  "top",
  "bottom",
];

function readSplitPathToLeaf(
  node: TilingLayoutNode,
  leafId: string,
  currentPath: ReadonlyArray<TilingSplitPathEntry> = [],
): ReadonlyArray<TilingSplitPathEntry> | null {
  if (node.kind === "leaf") {
    return node.id === leafId ? currentPath : null;
  }

  if (node.kind === "group") {
    // A group is a terminal slot keyed by its active member — the split path ends
    // here (a group has no internal split axis); inactive members are not rendered.
    return node.activeMemberId === leafId ? currentPath : null;
  }

  const nextPath: ReadonlyArray<TilingSplitPathEntry> = [
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

/**
 * Pure, host-port-driven core of `resolvePointerTarget` (Stage-3 measurement
 * lift). All DOM geometry comes from the injected {@link MeasurementPort}, so the
 * hit resolution is unit-testable against synthetic rects. Behavior is identical
 * to the former inline closure: viewport-missing → `null`; tab-strip hits, then
 * host group-drop targets, take priority over the group body; the source +
 * statically-gated leaves are skipped; a footprint miss → `null`; otherwise
 * the resolved drop intent.
 */
export function resolvePointerTargetFromMeasurement(
  measurement: MeasurementPort,
  input: {
    clientX: number;
    clientY: number;
    sourceLeafId: string;
    previousTarget: TilingDropState | null;
    isRearrangeEnabled: boolean;
    groupingEnabled: boolean;
    dropHitZoneGeometry: ResolvedTilingDropHitZoneGeometryCapability;
    liveDragModeEnabled: boolean;
    liveHitFootprintsById: ReadonlyMap<string, TilingPaneFootprint>;
    leafFootprintsById: ReadonlyMap<string, TilingPaneFootprint>;
    leafIds: ReadonlyArray<string>;
    rearrangeGatedLeafIds: ReadonlySet<string>;
    layout: TilingLayoutNode;
    config: TilingLayoutConfig;
    viewportSize: { width: number; height: number };
  },
): TilingDropState | null {
  if (!input.isRearrangeEnabled) {
    return null;
  }
  const viewportRect: DOMRect | null = measurement.measureViewportRect();
  if (viewportRect == null) {
    return null;
  }
  // Footprints are viewport layout px; a scaled ancestor makes a client px
  // smaller or larger than one.
  const scale: number =
    input.viewportSize.width > 0 && viewportRect.width > 0
      ? viewportRect.width / input.viewportSize.width
      : 1;
  const localX: number = (input.clientX - viewportRect.left) / scale;
  const localY: number = (input.clientY - viewportRect.top) / scale;
  const hitFootprints: ReadonlyMap<string, TilingPaneFootprint> =
    input.liveDragModeEnabled
      ? input.liveHitFootprintsById
      : input.leafFootprintsById;
  // Distinct merge targets are resolved BEFORE the pane-body partition, so they
  // win over both the centre swap and any edge band they overlap — the same
  // way the built-in strip wins over the group body. Order: built-in tab strip,
  // then host `groupDropTargetRef` elements. Pixels neither covers fall through
  // to edge-insert / centre-swap. Ineligible host targets (the source pane, or
  // a group that already contains the source) are skipped so the body zones run.
  if (input.groupingEnabled) {
    const tabStripHit = resolveGroupTabStripHit(
      input.clientX,
      input.clientY,
      collectGroups(input.layout).map((group: TilingGroupNode) => {
        const stripRect: DOMRect | null = measurement.measureGroupTabStripRect(
          group.id,
        );
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
      tabStripHit.activeMemberLeafId !== input.sourceLeafId
    ) {
      const targetFootprint: TilingPaneFootprint | undefined =
        hitFootprints.get(tabStripHit.activeMemberLeafId);
      if (targetFootprint != null) {
        const memberRects: ReadonlyArray<{
          index: number;
          left: number;
          top: number;
          right: number;
          bottom: number;
        }> = measurement.measureGroupTabMemberRects(tabStripHit.groupId);
        const memberInsertIndex: number | undefined = resolveGroupTabInsertIndex(
          input.clientX,
          input.clientY,
          memberRects.map(
            (rect: {
              index: number;
              left: number;
              top: number;
              right: number;
              bottom: number;
            }): {
              index: number;
              bounds: { left: number; top: number; right: number; bottom: number };
            } => ({
              index: rect.index,
              bounds: {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
              },
            }),
          ),
        );
        return buildGroupTabStripMergeIntent({
          activeMemberLeafId: tabStripHit.activeMemberLeafId,
          memberInsertIndex,
          evaluateCenter: (): {
            isValid: boolean;
            rejectionReason: string | null;
          } =>
            evaluateZoneCandidate({
              zone: "center",
              layout: input.layout,
              sourceLeafId: input.sourceLeafId,
              targetLeafId: tabStripHit.activeMemberLeafId,
              targetFootprint,
              config: input.config,
              viewportWidth: input.viewportSize.width,
              viewportHeight: input.viewportSize.height,
            }),
        });
      }
    }
    const hostDropHit: TilingHostGroupDropTargetHit | null =
      resolveHostGroupDropTargetHit(
      input.clientX,
      input.clientY,
      input.sourceLeafId,
      input.leafIds.map((leafId: string): TilingHostGroupDropTargetCandidate => {
        const group: TilingGroupNode | null = findGroupContainingLeaf(
          input.layout,
          leafId,
        );
        return {
          leafId,
          bounds: measurement.measureGroupDropTargetRects(leafId).map(
            (rect: DOMRect): {
              left: number;
              top: number;
              right: number;
              bottom: number;
            } => ({
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
            }),
          ),
          groupMemberLeafIds:
            group == null
              ? []
              : group.members.map((member: TilingLeafNode): string => member.id),
        };
      }),
    );
    if (hostDropHit != null) {
      const targetFootprint: TilingPaneFootprint | undefined = hitFootprints.get(
        hostDropHit.leafId,
      );
      if (targetFootprint != null) {
        return buildGroupTabStripMergeIntent({
          activeMemberLeafId: hostDropHit.leafId,
          fallbackReason: "host-group-drop-target",
          evaluateCenter: (): {
            isValid: boolean;
            rejectionReason: string | null;
          } =>
            evaluateZoneCandidate({
              zone: "center",
              layout: input.layout,
              sourceLeafId: input.sourceLeafId,
              targetLeafId: hostDropHit.leafId,
              targetFootprint,
              config: input.config,
              viewportWidth: input.viewportSize.width,
              viewportHeight: input.viewportSize.height,
            }),
        });
      }
    }
  }
  let hitLeafId: string | null = null;
  let hitFootprint: TilingPaneFootprint | undefined;
  for (const leafId of input.leafIds) {
    // Skip the source and any statically-gated leaf: a gated target has no
    // trustworthy footprint, so it resolves to no target (→ cancel-on-release
    // / gap-closed candidate) rather than a wrong swap/insert.
    if (
      leafId === input.sourceLeafId ||
      input.rearrangeGatedLeafIds.has(leafId)
    ) {
      continue;
    }
    const footprint: TilingPaneFootprint | undefined =
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
  const splitPath: ReadonlyArray<TilingSplitPathEntry> =
    readSplitPathToLeaf(input.layout, hitLeafId) ?? [];
  const axisPath: ReadonlyArray<TilingSplitAxis> = splitPath.map(
    (pathEntry: TilingSplitPathEntry): TilingSplitAxis => pathEntry.axis,
  );
  const paneLocalPoint = toPaneLocalPoint(
    { x: localX, y: localY },
    { left: hitFootprint.left, top: hitFootprint.top },
  );
  // Seed the geometric hysteresis band from the prior resolved zone (only for
  // the same hovered leaf) so zone flips must overcome the band — the
  // anti-thrash damper that makes live reflow stable.
  const previousZone: TilingLeafDropZone | null = previousZoneSeed(
    input.previousTarget,
    hitLeafId,
  );
  return resolveDropIntent({
    leafId: hitLeafId,
    paneLocalX: paneLocalPoint.x,
    paneLocalY: paneLocalPoint.y,
    paneSize: { width: hitFootprint.width, height: hitFootprint.height },
    axisPath,
    geometryConfig: currentGeometryConfig(input.dropHitZoneGeometry),
    previousZone,
    evaluateZone: (
      zone: TilingLeafDropZone,
    ): { isValid: boolean; rejectionReason: string | null } =>
      evaluateZoneCandidate({
        zone,
        layout: input.layout,
        sourceLeafId: input.sourceLeafId,
        targetLeafId: hitLeafId as string,
        targetFootprint: hitFootprint as TilingPaneFootprint,
        config: input.config,
        viewportWidth: input.viewportSize.width,
        viewportHeight: input.viewportSize.height,
      }),
  });
}


export function resolveLeafDropPreview(
  leafId: string,
  dragSourceLeafId: string | null,
  dropState: TilingDropState | null,
): TilingLeafDropPreview | null {
  if (
    dragSourceLeafId == null ||
    dropState == null ||
    dropState.leafId === dragSourceLeafId
  ) {
    return null;
  }
  if (dropState.action === "group-merge") {
    // Strip hits (`fallbackReason: "group-tab-strip"`) and host
    // `groupDropTargetRef` hits (`"host-group-drop-target"`) both arrive as
    // this action. Only the target pane paints the merge ring; the source
    // keeps `preview: null`.
    if (leafId !== dropState.leafId) {
      return null;
    }
    return {
      role: "drop-target-result-shadow",
      mode: "group-merge",
      zone: dropState.zone,
      partnerLeafId: dragSourceLeafId,
    };
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
 * (Hyprland) drag mode the destination shows NO result shadow — the held pane
 * and its drop preview say where it lands — so the per-tile preview is suppressed.
 * In preview mode the result shadow is the intended feedback, so the pure
 * `resolveLeafDropPreview` value passes through. Mirrors the System A gate shape
 * (`showProjectedLandingOverlays = showDropPreviewOverlays && !liveDragModeEnabled`)
 * and keeps `resolveLeafDropPreview` a pure preview-mode function.
 */
export function resolveLeafDropPreviewForMode(
  liveDragModeEnabled: boolean,
  leafId: string,
  dragSourceLeafId: string | null,
  dropState: TilingDropState | null,
): TilingLeafDropPreview | null {
  if (liveDragModeEnabled) {
    return null;
  }
  return resolveLeafDropPreview(leafId, dragSourceLeafId, dropState);
}

export {
  resolveDragPresentation,
  resolveInitialPaneContentVisible,
  resolvePaneBodyRenderMode,
} from "../engine/drag-presentation";

type TilingSplitDividerRenderMode =
  | "render-divider-absent"
  | "render-divider-enabled-visible"
  | "render-divider-enabled-hidden"
  | "render-divider-disabled-visible"
  | "render-divider-disabled-hidden";

interface TilingSplitDividerRenderPolicyInput {
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
  input: TilingSplitDividerRenderPolicyInput,
): TilingSplitDividerRenderMode {
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
  layout: TilingLayoutNode,
  subject?: DragSubject,
): TilingLayoutNode {
  if (!liveDragModeEnabled || dragSourceLeafId == null) {
    return layout;
  }
  // A whole tab group (`subject: "group"`) leaves as one: the gap it closes is its slot.
  const frozen: TilingLayoutNode = detachDragSubject(layout, dragSourceLeafId, subject);
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
 * user sees beneath the lifted pane when no target is yet resolved — a closer
 * visual/hit correspondence than the raw pre-pickup rects (where the source slot
 * is still occupied). In preview mode the tree never detaches, so the original
 * footprints are the stable reference. Either way the geometry is frozen for the
 * whole drag. Extracted as a pure function so the "independent of candidate
 * reflow" invariant is unit-testable without a DOM.
 */
export function resolveStableDragHitFootprints(
  liveDragModeEnabled: boolean,
  layout: TilingLayoutNode,
  dragSourceLeafId: string | null,
  viewport: { width: number; height: number },
  config: TilingLayoutConfig,
  originalFootprints: ReadonlyMap<string, TilingPaneFootprint>,
  subject?: DragSubject,
): ReadonlyMap<string, TilingPaneFootprint> {
  if (!liveDragModeEnabled || dragSourceLeafId == null) {
    return originalFootprints;
  }
  const gapClosed: TilingLayoutNode = detachDragSubject(layout, dragSourceLeafId, subject);
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

/**
 * The place a lifted pane keeps in the tree while the pointer holds it
 * elsewhere (indicator mode with `dragPreviewMakesRoom`: the others make room
 * around it). Empty and unpainted: the drop indicator marks it, and the pane
 * itself is drawn only once, where it is held. With the observability
 * `dragSourceBorderEnabled` layer on it gets a faint debug tint.
 */
function HeldSlotReservation({
  observabilityColors,
  observabilityColorEnables,
}: {
  observabilityColors: TilingObservabilityColorConfig;
  observabilityColorEnables: TilingObservabilityColorEnableConfig;
}): React.ReactElement {
  return (
    <div
      className="h-full min-h-0 w-full min-w-0"
      style={
        observabilityColorEnables.dragSourceBorderEnabled
          ? {
              backgroundColor: rgbaFromHex(
                observabilityColors.dragSourceBorderColorHex,
                0.06,
                [240, 171, 252],
              ),
            }
          : undefined
      }
      data-drag-held-slot=""
      aria-hidden
    />
  );
}

// ── Stable pane identity (`paneIdentity: "stable"`) ────────────────────────
//
// The split tree is rendered RECURSIVELY and reconciled POSITIONALLY: a leaf
// has no key of its own, so React binds a pane's instance to its tree
// position, not to its tile. Any edit that moves a leaf to another branch (an
// insert drop, a group fold, a master-stack reorder) unmounts the pane and
// mounts a fresh one; a swap keeps both instances but hands each the OTHER
// tile's props. Either way the host's content re-initializes after a drop.
//
// Stable mode decouples instance from position with a POOL + RELOCATION seam:
// every pane is rendered exactly once, keyed by TILE id, inside a hidden pool
// that sits OUTSIDE the tree; each leaf slot in the tree renders an empty
// registered target; and a layout effect physically moves the pane's DOM node
// (`appendChild`) into whichever slot currently shows its tile. React never
// re-parents anything — the fiber stays under the pool, so hooks / state / refs
// / subscriptions / scroll positions are the same objects through drag → drop →
// settle. React only ever sees its own pool children being APPENDED (new tiles
// go to the end of the pool order) or REMOVED (the host returns its node to the
// pool in its layout cleanup, before React's `removeChild`), so the reconciler's
// DOM ops never target a node that has been moved away.
//
// Event delegation is fiber-based (React walks `return` pointers, not the DOM),
// so handlers on a relocated pane fire normally; the pool lives INSIDE the root
// element so root-level `onPointerEnter/Leave` (which React computes across the
// fiber tree) still see relocated panes as descendants. DOM-scoped concerns —
// `[data-leaf-id]` measurement, leaf motion, `pointer-events` /
// `select-none` inheritance, CSS — all follow the node's DOM position (inside
// the slot), which is exactly where a slot-mode pane would be.
//
// Live drag: the lifted pane's wrapper (held under the pointer, outside the
// tree) registers as the tile's slot, so the SAME node moves there on lift and
// back into the tree on the drop; a held-slot reservation registers nothing.
// When the pane is in neither (a claimed external drop settling) it parks in
// the (display:none) pool, still mounted.

/** The relocation registry a stable-mode leaf slot writes to and a pane host reads. */
type StablePaneSlotRegistry = Map<string, HTMLElement>;

/** One tile's pane render inputs, collected during the tree render pass. */
export interface StablePaneEntry {
  readonly tileId: string;
  readonly tileArgs: TilingRenderTileProps;
  readonly defaultTileArgs: TilingDefaultTileProps;
}

const NOOP_SUBSCRIBE = (): (() => void) => (): void => {};
const GET_CLIENT_SNAPSHOT = (): boolean => true;
const GET_SERVER_SNAPSHOT = (): boolean => false;

/**
 * `true` on a client-only render, `false` on the server AND during the
 * hydration render of server markup (React uses the server snapshot there).
 * The renderer locks its `"auto"` pane-identity mode on the FIRST value.
 */
function useIsClientOnlyRender(): boolean {
  return React.useSyncExternalStore(
    NOOP_SUBSCRIBE,
    GET_CLIENT_SNAPSHOT,
    GET_SERVER_SNAPSHOT,
  );
}

/**
 * One pooled pane. Owns a `display: contents` wrapper (no box of its own — the
 * pane article lays out as if it were the slot's direct child) and relocates it
 * into its registered slot after every commit; with no registered slot the
 * wrapper returns to the pool (parked). Children mount only once the wrapper
 * has been placed in a REAL slot, so a host's first layout-effect measurement
 * never sees the display:none pool.
 */
function StablePaneHost({
  tileId,
  slotRegistry,
  poolRef,
  children,
}: {
  tileId: string;
  slotRegistry: React.RefObject<StablePaneSlotRegistry>;
  poolRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}): React.ReactElement {
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const [placed, setPlaced] = React.useState<boolean>(false);

  // Every commit: seat the wrapper in its slot (or park it). Runs AFTER the
  // slots' callback refs registered (the pool is a later sibling of the
  // viewport, and React runs layout work in tree order).
  React.useLayoutEffect((): void => {
    const wrapper: HTMLDivElement | null = wrapperRef.current;
    const pool: HTMLDivElement | null = poolRef.current;
    if (wrapper == null) {
      return;
    }
    const slot: HTMLElement | undefined = slotRegistry.current.get(tileId);
    const target: HTMLElement | null = slot ?? pool;
    if (target != null && wrapper.parentNode !== target) {
      target.insertBefore(wrapper, target.firstChild);
    }
    if (!placed && slot != null) {
      setPlaced(true);
    }
  });

  // Unmount: return the node to the pool FIRST so React's own `removeChild`
  // (which targets the pool, the fiber's host parent) finds it there.
  React.useLayoutEffect((): (() => void) => {
    const wrapper: HTMLDivElement | null = wrapperRef.current;
    return (): void => {
      const pool: HTMLDivElement | null = poolRef.current;
      if (wrapper != null && pool != null && wrapper.parentNode !== pool) {
        pool.appendChild(wrapper);
      }
    };
  }, [poolRef]);

  return (
    <div
      ref={wrapperRef}
      style={{ display: "contents" }}
      data-hpt-pane={tileId}
    >
      {placed ? children : null}
    </div>
  );
}

/**
 * The hidden, tile-keyed pane pool (stable mode). Children are ordered by
 * FIRST APPEARANCE and only ever appended / removed — never reordered — so
 * React's reconciler never issues an `insertBefore` against a sibling node that
 * has been relocated out of the pool.
 */
function StablePanePool({
  entries,
  order,
  poolRef,
  slotRegistry,
  renderTile,
}: {
  entries: ReadonlyMap<string, StablePaneEntry>;
  order: ReadonlyArray<string>;
  poolRef: React.RefObject<HTMLDivElement | null>;
  slotRegistry: React.RefObject<StablePaneSlotRegistry>;
  renderTile: ((args: TilingRenderTileProps) => React.ReactNode) | undefined;
}): React.ReactElement {
  return (
    <div
      ref={poolRef}
      style={{ display: "none" }}
      data-hpt-pane-pool
      aria-hidden
    >
      {order.map((tileId: string): React.ReactElement | null => {
        const entry: StablePaneEntry | undefined = entries.get(tileId);
        if (entry == null) {
          return null;
        }
        return (
          <StablePaneHost
            key={tileId}
            tileId={tileId}
            slotRegistry={slotRegistry}
            poolRef={poolRef}
          >
            {renderTile == null ? (
              <DefaultTilingTile {...entry.defaultTileArgs} />
            ) : (
              renderTile(entry.tileArgs)
            )}
          </StablePaneHost>
        );
      })}
    </div>
  );
}

/**
 * Resting render props for a pane the pool keeps mounted while its workspace
 * is inactive (`inactiveWorkspaces: "keep-mounted"`, H6). Starts from the
 * pane's LAST in-tree render (so the host sees the same callback identities
 * and chrome flags it already had), then clears every transient state flag —
 * focus, drag / drop / move / maximize / multi-select — because a hidden pane
 * is never the subject of an interaction, and re-reads the tile payload from
 * the current pool so a title / content update still reaches the hidden pane.
 * `workspaceId` reports the inactive workspace that seats the tile;
 * `seatCount` follows the current set.
 */
export function restingRetainedPaneEntry(
  last: StablePaneEntry,
  retained: TilingRetainedPane,
  tile: TilingTile | undefined,
  seatCount: number,
): StablePaneEntry {
  const resting: Partial<TilingRenderTileProps> = {
    tile: tile ?? last.tileArgs.tile,
    workspaceId: retained.workspaceId,
    seatCount,
    isDragSource: false,
    isDropTarget: false,
    isDropEligible: false,
    isHoveringDropCandidate: false,
    isInvalidDrop: false,
    isFocused: false,
    isMoveSource: false,
    moveTargetPlacement: null,
    isMaximized: false,
    dropZone: null,
    preview: null,
    isMultiSelected: false,
    canGroupMultiSelection: false,
    multiSelectionCount: 0,
  };
  return {
    tileId: retained.tileId,
    tileArgs: { ...last.tileArgs, ...resting },
    defaultTileArgs: {
      ...last.defaultTileArgs,
      ...resting,
      dropIntentDebugPath: null,
      dropIntentDebugAction: null,
    },
  };
}

/**
 * Append-only pool order: keep the previous order minus departed tiles, then
 * append tiles seen for the first time. Pure; the renderer threads the previous
 * order through a ref.
 */
export function resolveStablePanePoolOrder(
  previousOrder: ReadonlyArray<string>,
  presentTileIds: ReadonlySet<string>,
): ReadonlyArray<string> {
  const order: string[] = previousOrder.filter((tileId: string): boolean =>
    presentTileIds.has(tileId),
  );
  const seen: Set<string> = new Set<string>(order);
  for (const tileId of presentTileIds) {
    if (!seen.has(tileId)) {
      seen.add(tileId);
      order.push(tileId);
    }
  }
  return order;
}

/**
 * Resolves a pane's DOM host element for the stable-mode relocation seam.
 * `"auto"` locks on the FIRST render: `"stable"` for a client-only mount,
 * `"slot"` when hydrating server markup (see {@link TilingPaneIdentityMode}).
 */
export function resolvePaneIdentityMode(
  requested: TilingPaneIdentityMode,
  isClientOnlyRender: boolean,
): "stable" | "slot" {
  if (requested === "auto") {
    return isClientOnlyRender ? "stable" : "slot";
  }
  return requested;
}

/**
 * Overlay portal host: an element, `null` (body fallback), a thunk, or
 * `undefined` (unset prop → body). Held in context so `OverlayPortal` (used by
 * `DragPaneOverlay`, `DragCursorOverlay`, and `DragCancelOverlay`) resolves
 * the same container without threading the prop through every overlay.
 */
const OverlayPortalContainerContext: React.Context<
  TilingOverlayPortalContainer | undefined
> = React.createContext<TilingOverlayPortalContainer | undefined>(undefined);

/**
 * Resolves the stacking-context-free anchor for the `position: fixed` custom
 * drag cursor, which places itself with WINDOW-relative client coordinates.
 * `position: fixed` only resolves against the window when NO ancestor
 * establishes a containing block for fixed descendants — and `transform` /
 * `filter` / `backdrop-filter` / `perspective` / `will-change` of those /
 * `contain: paint|layout|strict|content` all silently do. Default is
 * `document.body`. A consumer may redirect via
 * `TilingRendererProps.overlayPortalContainer` (element or thunk) so host
 * theme tokens (CSS variables on a scoped root) still inherit — the
 * redirected container must itself not sit under a containing-block
 * ancestor, or the cursor drifts off the pointer.
 *
 * The body default also keeps the cursor outside the React root's
 * event-delegation scope. Redirecting the DOM mount does not change that
 * invariant: React still walks fibers, and measurement selectors stay
 * root/viewport-scoped. The cursor's z-index (230) is relative to the
 * container's stacking context.
 *
 * SSR-safe: `document` is read only on the client, so server render yields
 * `null` and mounts nothing. The function form is evaluated every render so
 * a late-mounted container (ref / callback) is picked up without remounting
 * the renderer. The overlays only ever render during an active (user-driven,
 * post-hydration) drag.
 */
function resolveOverlayPortalContainer(
  spec: TilingOverlayPortalContainer | undefined,
): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }
  const resolved: HTMLElement | null | undefined =
    typeof spec === "function" ? spec() : spec;
  return resolved ?? document.body;
}

function useOverlayPortalContainer(): HTMLElement | null {
  const spec: TilingOverlayPortalContainer | undefined = React.useContext(
    OverlayPortalContainerContext,
  );
  return resolveOverlayPortalContainer(spec);
}

/**
 * Renders the fixed-coordinate drag overlays through a portal to the
 * overlay portal container (default `document.body`, see
 * `overlayPortalContainer` / `useOverlayPortalContainer`) so their
 * `position: fixed` placement is window-relative unless a containing-block
 * ancestor is introduced. The portal preserves the React subtree (state,
 * refs, layout effects, context) of the overlay component — only the DOM
 * node is relocated. Event delegation still walks the fiber tree;
 * measurement selectors stay
 * root/viewport-scoped. Returns `null` when there is no container (SSR
 * only), at which point the overlays are inactive anyway.
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
 * Where a pane sits in the workspace set — the `workspaceId` / `seatCount`
 * pair every {@link TilingRenderTileProps} carries (H6). Single-layout mode
 * always renders with {@link SINGLE_LAYOUT_PANE_SEAT}.
 */
export interface TilingPaneSeatContext {
  /** Workspace whose tree seats the pane. */
  readonly workspaceId: string;
  /** Number of workspaces in the set that seat the pane's tile. */
  readonly seatCount: number;
}

/** The seat context of every pane in single-layout mode (`"main"`, seated once). */
export const SINGLE_LAYOUT_PANE_SEAT: TilingPaneSeatContext = {
  workspaceId: TILING_MAIN_WORKSPACE_ID,
  seatCount: 1,
};

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

/**
 * Cursor-badge tone classes (surface / border / glyph color), keyed on drop
 * validity and read from the theme's drag chrome — the badge shape + base
 * (`dragChrome.cursorBadge`) is composed by the caller.
 */
export function dragCursorToneClassName(
  dragChrome: TilingThemeDragChromeTokens,
  tone: DragCursorPresentation["tone"],
): string {
  if (tone === "valid") {
    return dragChrome.cursorBadgeValid;
  }
  if (tone === "invalid") {
    return dragChrome.cursorBadgeInvalid;
  }
  return dragChrome.cursorBadgeNeutral;
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
 * `position: fixed`, `pointer-events-none` element that REPLACES the OS cursor
 * during an active live drag (the renderer sets `cursor: none` on the root). It
 * is transform-pinned to the pointer the drag machine last saw — applied inline
 * per render, with NO transition on the pin and NO second rAF loop.
 *
 * Appearance is driven by `presentation` (from `resolveDragCursorPresentation`):
 * a neutral grip when no target is found, a "drop here" target ring on a valid
 * edge-insert, an exchange indicator on a valid swap, and a `not-allowed`
 * indicator over a blocked target — SEMANTIC states, never a rotating direction
 * arrow (the drop preview already shows direction). A short scale/opacity
 * entrance plays once when it appears; it is dropped under
 * `prefers-reduced-motion` (static indicator only). The pinned point is clamped
 * to the viewport so the badge stays visible at the edges.
 *
 * Mounts through the overlay portal container (default `document.body`, see
 * `overlayPortalContainer`) at z-index 230, relative to the container's
 * stacking context. Containing-block caveat: no `transform` / `filter` /
 * `backdrop-filter` / `perspective` / `contain: paint` ancestor. Redirecting
 * the DOM mount does not change the delegation invariant (fiber walk +
 * root/viewport-scoped measurement).
 */
function DragCursorOverlay({
  pointer,
  presentation,
  prefersReducedMotion,
}: {
  /** The pointer while a live drag is held (window-client px), else `null`. */
  pointer: DragMachinePoint | null;
  presentation: DragCursorPresentation;
  prefersReducedMotion: boolean;
}): React.ReactElement | null {
  const theme: TilingTheme = useTilingTheme();
  const dragChrome: TilingThemeDragChromeTokens = resolveDragChrome(theme);
  const [entered, setEntered] = React.useState<boolean>(false);

  // The entrance plays ONCE when the cursor appears: keyed on the STABLE "is a
  // drag active" boolean, not on the pointer (which changes every move and
  // would replay it).
  const isActive: boolean = pointer != null;
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

  if (pointer == null) {
    return null;
  }

  const viewportWidth: number =
    typeof window === "undefined" ? 0 : window.innerWidth;
  const viewportHeight: number =
    typeof window === "undefined" ? 0 : window.innerHeight;
  const point: DragCursorPoint = clampCursorPointToViewport(
    { x: pointer.x, y: pointer.y },
    { left: 0, top: 0, right: viewportWidth, bottom: viewportHeight },
    DRAG_CURSOR_BADGE_SIZE_PX / 2,
  );

  const badgeScale: number = entered ? 1 : 0.84;
  const badgeOpacity: number = entered ? 1 : 0;
  const badgeTransition: string = prefersReducedMotion
    ? "none"
    : `transform ${DRAG_CURSOR_ENTRANCE_MS}ms ${DRAG_CURSOR_ENTRANCE_EASING}, opacity ${DRAG_CURSOR_ENTRANCE_MS}ms ${DRAG_CURSOR_ENTRANCE_EASING}`;

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
            "flex items-center justify-center",
            dragChrome.cursorBadge,
            dragCursorToneClassName(dragChrome, presentation.tone),
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

function edgeZoneClipPathStyle(
  zone: TilingEdgeZone,
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
  paneHitZoneDebug: TilingPaneHitZoneOverlayDebugState;
  paneHitZonesAlpha: number;
  showDropIntentDebug: boolean;
  observabilityColors: TilingObservabilityColorConfig;
}): React.ReactElement {
  const centerRatio: number = paneHitZoneDebug.centerRatio;
  const centerRatioX: number = paneHitZoneDebug.centerRatioX;
  const centerRatioY: number = paneHitZoneDebug.centerRatioY;
  const edgeCandidateByZone: ReadonlyMap<
    TilingEdgeZone,
    TilingPaneHitZoneCandidateDebugState
  > = new Map(
    paneHitZoneDebug.edgeCandidates.map(
      (
        candidate: TilingPaneHitZoneCandidateDebugState,
      ): [TilingEdgeZone, TilingPaneHitZoneCandidateDebugState] => [
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
          (zone: TilingEdgeZone): React.ReactElement => {
            const edgeCandidate:
              | TilingPaneHitZoneCandidateDebugState
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
  direction: TilingFocusDirection;
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
  onAcquireSpace: (direction: TilingFocusDirection) => void;
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

function DefaultTilingTile({
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
  isCollapsed,
  isCollapseEnabled,
  onToggleCollapse,
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
  isMultiSelectGroupingEnabled,
  isMultiSelected,
  canGroupMultiSelection: canGroupMultiSelectionNow,
  onToggleMultiSelect,
  onGroupMultiSelection,
  dropIntentDebugPath,
  dropIntentDebugAction,
  onHandlePointerDown,
  onPointerMove,
  onPointerLeave,
}: TilingDefaultTileProps): React.ReactElement {
  const theme: TilingTheme = useTilingTheme();
  const dragChrome: TilingThemeDragChromeTokens = resolveDragChrome(theme);
  const isNarrowHeader: boolean = paneWidthPx < 430;
  // A selected pane offers the Group control once the selection is groupable
  // (≥2 selected AND `group-leaves` would change the layout).
  const showGroupButton: boolean = isMultiSelected && canGroupMultiSelectionNow;
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
        // DESCENDANTS only — the drag cursor is portaled to the overlay portal
        // container (default `document.body`, see `overlayPortalContainer`;
        // not a descendant), so this never reintroduces drift.
        theme.paneShell.surface,
        theme.resolvePaneAccentSurface(tile.accent),
        // Drop-affordance rings. The hover-target / resolved-target highlight
        // (which reused the accent focus color) is intentionally GONE — during a
        // drag the only focus affordance is the dragged pane, and the
        // destination is shown by the drop preview. Only the rose invalid-drop
        // ring remains (the faint dashed eligibility hint was removed in
        // `773dcff`; `resolvePaneDropAffordanceClasses` now emits the
        // invalid-drop ring alone).
        resolvePaneDropAffordanceClasses(theme, {
          isDropEligible,
          isHoveringDropCandidate,
          isDropTarget,
          isInvalidDrop,
        }),
        // Source-pane dimming is NOT applied here: the renderer dims the whole
        // leaf wrapper (`dragChrome.sourcePane`) so a custom `renderTile` and
        // this default tile dim identically — one opacity over the entire pane.
        isDragSource && observabilityColorEnables.dragSourceBorderEnabled
          ? "border"
          : "",
        isFocused ? theme.resolveFocusFrame(tile.accent) : "",
        // Host focus frame is theme border/glow — never the UA outline (Shift
        // alone promotes `:focus-visible` on this focusable article).
        "outline-none",
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
              "relative h-full w-full",
              dragChrome.dropIntentLayer,
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
        onClick={(event: React.MouseEvent<HTMLElement>): void => {
          // Alt/Opt+click toggles this pane's multi-selection membership
          // WITHOUT changing focus. Stop propagation so the article-level
          // `onClick={onFocus}` (which clears the selection + focuses) never
          // runs. A plain click falls through to the article handler unchanged.
          if (
            isMultiSelectGroupingEnabled &&
            isMultiSelectModifierActive(event)
          ) {
            event.stopPropagation();
            event.preventDefault();
            onToggleMultiSelect();
          }
        }}
        style={isRearrangeEnabled ? { touchAction: "none" } : undefined}
        className={cn(
          theme.paneHeader.base,
          "gap-2",
          isRearrangeEnabled
            ? "cursor-grab active:cursor-grabbing"
            : "cursor-default",
          isFocused ? theme.paneHeader.focused : "",
          isMultiSelected ? theme.paneHeader.selected : "",
        )}
      >
        <div
          className={cn(
            "min-w-0 text-left",
            tile.titleBarContent != null ? "max-w-[40%] shrink-0" : "",
          )}
        >
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
        {tile.titleBarContent != null ? (
          <TilingPaneTitleBarContent className="min-w-0 flex-1 overflow-hidden">
            {tile.titleBarContent}
          </TilingPaneTitleBarContent>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {isMultiSelected ? (
            <span
              aria-label={`pane ${leafId} selected`}
              title="selected (Alt/Opt+click to deselect)"
              className={cn(
                "flex shrink-0 items-center justify-center rounded-md border font-mono leading-none",
                isNarrowHeader ? "h-4 w-4 text-[10px]" : "h-5 w-5 text-[11px]",
                theme.paneHeader.selectedBadge,
              )}
            >
              <span aria-hidden>{"\u2713"}</span>
            </span>
          ) : null}
          {showGroupButton ? (
            <button
              type="button"
              draggable={false}
              title="group selected panes into a tabbed group"
              aria-label={`group ${leafId} with the selected panes`}
              onPointerDown={(
                event: React.PointerEvent<HTMLButtonElement>,
              ): void => {
                event.stopPropagation();
              }}
              onClick={(event: React.MouseEvent<HTMLButtonElement>): void => {
                event.stopPropagation();
                onGroupMultiSelection(leafId);
              }}
              className={cn(
                "flex shrink-0 items-center justify-center rounded-md border font-mono uppercase leading-none tracking-[0.1em] transition-colors",
                isNarrowHeader
                  ? "h-4 px-1.5 text-[9px]"
                  : "h-5 px-2 text-[10px]",
                theme.paneHeader.controlActive,
              )}
            >
              {isNarrowHeader ? "GRP" : "GROUP"}
            </button>
          ) : null}
          {isCollapseEnabled ? (
            <button
              type="button"
              draggable={false}
              aria-pressed={isCollapsed}
              title={
                isCollapsed
                  ? "expand pane (restore from titlebar-only)"
                  : "collapse pane to titlebar-only"
              }
              aria-label={
                isCollapsed
                  ? `expand pane ${leafId}`
                  : `collapse pane ${leafId} to titlebar`
              }
              onPointerDown={(
                event: React.PointerEvent<HTMLButtonElement>,
              ): void => {
                event.stopPropagation();
              }}
              onClick={(event: React.MouseEvent<HTMLButtonElement>): void => {
                event.stopPropagation();
                onToggleCollapse();
              }}
              className={cn(
                "flex shrink-0 items-center justify-center rounded-md border font-mono leading-none transition-colors",
                isNarrowHeader ? "h-4 w-4 text-[10px]" : "h-5 w-5 text-[11px]",
                isCollapsed
                  ? theme.paneHeader.controlActive
                  : theme.paneHeader.controlIdle,
              )}
            >
              <span aria-hidden>{isCollapsed ? "\u25B8" : "\u25BE"}</span>
            </button>
          ) : null}
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
  subject: TilingProjectedLandingSubject,
  observabilityColors: TilingObservabilityColorConfig,
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
  subject: TilingProjectedLandingSubject,
  observabilityColors: TilingObservabilityColorConfig,
): string {
  if (subject === "source") {
    return observabilityColors.projectedSourceFillColorHex;
  }
  if (subject === "target") {
    return observabilityColors.projectedTargetFillColorHex;
  }
  return observabilityColors.projectedSuccessorFillColorHex;
}

function projectedSubjectLabel(subject: TilingProjectedLandingSubject): string {
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
  overlays: ReadonlyArray<TilingProjectedLandingOverlay>;
  showLabels: boolean;
  observabilityColors: TilingObservabilityColorConfig;
  observabilityColorEnables: TilingObservabilityColorEnableConfig;
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
        (overlay: TilingProjectedLandingOverlay): React.ReactElement | null => {
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
  dropState: TilingDropState | null;
  dragSourceLeafId: string;
  landingLeafId: string | null;
  leafFootprintsById: ReadonlyMap<string, TilingPaneFootprint>;
  viewportElement: HTMLDivElement | null;
}): TilingLiveHitLogState {
  const clientX: number =
    params.dragState.heldFootprint.left +
    params.dragState.pointerAnchorOffset.x;
  const clientY: number =
    params.dragState.heldFootprint.top +
    params.dragState.pointerAnchorOffset.y;
  const viewportRect: DOMRect | undefined =
    params.viewportElement?.getBoundingClientRect();
  const cursorViewport: TilingLiveHitLogState["cursorViewport"] = {
    x: viewportRect == null ? clientX : clientX - viewportRect.left,
    y: viewportRect == null ? clientY : clientY - viewportRect.top,
  };
  const dragSourcePaneFootprint: TilingPaneFootprint | null =
    params.leafFootprintsById.get(params.dragSourceLeafId) ?? null;
  const presentationFields: Pick<
    TilingLiveHitLogState,
    "landingLeafId" | "presentationDropAction"
  > = {
    landingLeafId: params.landingLeafId,
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
      centerRatio: TILING_DROP_INTENT_CONFIG.centerRatio,
      edgeThresholdRatio: (1 - TILING_DROP_INTENT_CONFIG.centerRatio) / 2,
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
  const sourcePaneFootprint: TilingPaneFootprint | null =
    params.leafFootprintsById.get(hoveredLeafId) ?? null;
  const intent: TilingDropIntentDebugState = toDropIntentDebugState(
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
  dropState: TilingDropState,
): TilingDropIntentDebugState {
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
  accent: TilingTile["accent"];
}

/**
 * Render-time clone: if `maximizedLeafId` is a group member, that group
 * reports the maximized member as `activeMemberId`. The live layout is not
 * written. Used so maximize paints the group strip and the top-level pane
 * strip labels the maximized member.
 */
function layoutWithMaximizedGroupMember(
  layout: TilingLayoutNode,
  maximizedLeafId: string | null,
): TilingLayoutNode {
  if (maximizedLeafId == null) {
    return layout;
  }
  const group: TilingGroupNode | null = findGroupContainingLeaf(
    layout,
    maximizedLeafId,
  );
  if (group == null || group.activeMemberId === maximizedLeafId) {
    return layout;
  }
  return setActiveGroupMember(layout, group.id, maximizedLeafId);
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
  layout: TilingLayoutNode;
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
  const focusedGroup: TilingGroupNode | null = hasFocusedLeaf
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
  activeAccent: TilingTileAccent;
  onSelect: (accent: TilingTileAccent) => void;
}

/**
 * Theme-switcher config handed to the top-bar tab strip. Present only when the
 * consumer wires `onThemeChange`; carries the active theme id (for the
 * active-chip highlight) and a commit callback. Mirrors the accent picker.
 */
interface PaneTabStripThemePicker {
  /**
   * The active theme's id for the active-chip highlight. Wide (`TilingTheme["id"]`)
   * because a consumer-authored `theme` prop can carry a custom id — such an id
   * simply matches no built-in chip. The switcher itself stays built-ins-only.
   */
  activeThemeId: TilingTheme["id"];
  onSelect: (themeId: TilingThemeId) => void;
}

function PaneLabChrome({
  isPaneContentVisible,
  showContentToggle,
  accentPicker,
  themePicker,
  onPaneContentVisibilityChange,
}: {
  isPaneContentVisible: boolean;
  showContentToggle: boolean;
  accentPicker: PaneTabStripAccentPicker | null;
  themePicker: PaneTabStripThemePicker | null;
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
            // TILING_THEMES enumerates the built-in registry only, so every
            // entry's id is a `TilingThemeId` member (the widened `TilingTheme["id"]`
            // admits consumer-minted ids that never appear in this list).
            const entryThemeId: TilingThemeId = entry.id as TilingThemeId;
            const isActiveTheme: boolean =
              entry.id === themePicker.activeThemeId;
            return (
              <button
                key={`theme-${entry.id}`}
                type="button"
                aria-label={`set renderer theme to ${entry.label}`}
                aria-pressed={isActiveTheme}
                title={entry.label}
                onClick={(): void => themePicker.onSelect(entryThemeId)}
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
          {TILING_TILE_ACCENT_SWATCHES.map(
            (swatch: TilingTileAccentSwatch): React.ReactElement => {
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
          title={
            isPaneContentVisible ? "Hide pane content" : "Show pane content"
          }
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
    </div>
  );
}

function PaneTabStrip({
  tabs,
  options,
  prefersReducedMotion,
  onSelect,
  onTabDoubleClickMaximize,
}: {
  tabs: ReadonlyArray<TilingPaneTab>;
  options: ResolvedTilingPaneTabStripOptions;
  prefersReducedMotion: boolean;
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
}): React.ReactElement {
  const anyMaximized: boolean = tabs.some(
    (tab: TilingPaneTab): boolean => tab.maximized,
  );
  const items: ReadonlyArray<TabStripItem> = tabs.map(
    (tab: TilingPaneTab): TabStripItem => ({
      id: tab.leafId,
      title: tab.title,
      selected: anyMaximized ? tab.maximized : tab.active,
    }),
  );
  return (
    <TabStrip
      items={items}
      theme={options.theme}
      height={options.height}
      prefersReducedMotion={prefersReducedMotion}
      ariaLabel="tiling panes"
      className="hpt-pane-tab-strip"
      placement={options.placement}
      placementAttrName="data-hpt-pane-tab-placement"
      isMergeTarget={false}
      setRef={null}
      onActivate={(index: number): void => {
        const tab: TilingPaneTab | undefined = tabs[index];
        if (tab != null) {
          onSelect(tab.leafId);
        }
      }}
      onTabDoubleClick={
        onTabDoubleClickMaximize != null
          ? (index: number): void => {
              const tab: TilingPaneTab | undefined = tabs[index];
              if (tab != null) {
                onTabDoubleClickMaximize(tab.leafId);
              }
            }
          : null
      }
      renderItemLabel={(item: TabStripItem, index: number): React.ReactNode => {
        const tab: TilingPaneTab | undefined = tabs[index];
        if (tab == null) {
          return item.title;
        }
        return options.renderTabLabel != null
          ? options.renderTabLabel(tab)
          : tab.title;
      }}
      trailing={null}
      tabIndexAttrName={null}
      nested={false}
    />
  );
}

const PANE_SWITCHER_OVERLAY_Z_INDEX: number = 240;

/**
 * Data attribute the renderer stamps on resize dividers to select their cursor
 * from the SDK-shipped chrome stylesheet ({@link TILING_CHROME_CURSOR_CSS})
 * instead of relying on the consumer's Tailwind build scanning `cursor-*`
 * utility strings out of our dist. `"col"` → side-by-side (axis `horizontal`)
 * divider, `"row"` → stacked (axis `vertical`) divider, `"default"` → an
 * inert/hidden gutter.
 */
const TILING_RESIZE_CURSOR_ATTR: "data-hpt-resize-cursor" =
  "data-hpt-resize-cursor";
type TilingResizeCursor = "col" | "row" | "default";

/**
 * Critical chrome CSS shipped BY THE SDK (not via Tailwind purge). Resize
 * dividers are functional affordances: their `col-resize` / `row-resize`
 * cursors must resolve regardless of whether a consumer's Tailwind content
 * config scans this package. React 19 hoists+dedupes `<style href>`, so these
 * land once per document. Scoped to `.hpt-root` so they never leak to app
 * chrome.
 */
const TILING_CHROME_CURSOR_STYLE_HREF: string = "hypr-tiling-chrome-cursor";

/**
 * Leaf motion's overflow switch, flipped without a React render: while any
 * pane glides the leaf motion sets {@link LEAF_MOTION_ACTIVE_ATTR} on the
 * viewport, and the structural containers that clip at rest
 * (`overflow-hidden` + `hpt-motion-overflow`) let a gliding pane out of its
 * slot (the pane's own content clip still applies). Shipped in the chrome
 * stylesheet below, so it works whatever a consumer's Tailwind scans.
 */
const LEAF_MOTION_ACTIVE_ATTR: string = "data-hpt-leaf-motion-active";
const LEAF_MOTION_OVERFLOW_CLASS: string = "overflow-hidden hpt-motion-overflow";
const TILING_CHROME_CURSOR_CSS: string = `
.hpt-root [${TILING_RESIZE_CURSOR_ATTR}="col"] { cursor: col-resize; }
.hpt-root [${TILING_RESIZE_CURSOR_ATTR}="row"] { cursor: row-resize; }
.hpt-root [${TILING_RESIZE_CURSOR_ATTR}="default"] { cursor: default; }
.hpt-root [${LEAF_MOTION_ACTIVE_ATTR}] .hpt-motion-overflow { overflow: visible !important; }
`;

/**
 * Scoped focus-outline stylesheet: kill browser-native focus outlines on
 * tabs/buttons and pane roots inside the tiling root. Custom focus is
 * border/fill (`resolveFocusFrame`, active tab chips); divider
 * `focus-visible:ring-*` uses box-shadow, not outline.
 *
 * Pane roots (`article[data-leaf-id]`, default tile `tabIndex=0`) are focusable
 * for tiler keyboard nav. A bare Shift/modifier keypress switches the UA into
 * keyboard modality and would otherwise paint a bright `:focus-visible` ring on
 * the already-focused pane — that is not our focus frame.
 *
 * SDK-controlled: emitted only when `chromeFocusOutline` resolves to
 * `"suppress"` (the default); a consumer can opt out with `"native"` to keep
 * the browser focus ring. Scoped to `.hpt-root` so app chrome is never touched.
 */
const TILING_CHROME_FOCUS_STYLE_HREF: string = "hypr-tiling-chrome-focus";
const TILING_CHROME_FOCUS_CSS: string = `
.hpt-root :is(button, [role="tab"], a, summary, article[data-leaf-id], [data-leaf-id]):focus,
.hpt-root :is(button, [role="tab"], a, summary, article[data-leaf-id], [data-leaf-id]):focus-visible {
  outline: none;
}
.hpt-root :is(button, [role="tab"], a, summary, article[data-leaf-id], [data-leaf-id]) {
  -webkit-tap-highlight-color: transparent;
}
`;

function TilingChromeStyles({
  focusOutline,
}: {
  focusOutline: TilingChromeFocusOutline;
}): React.ReactElement {
  return (
    <>
      <style href={TILING_CHROME_CURSOR_STYLE_HREF} precedence="default">
        {TILING_CHROME_CURSOR_CSS}
      </style>
      {focusOutline === "suppress" ? (
        <style href={TILING_CHROME_FOCUS_STYLE_HREF} precedence="default">
          {TILING_CHROME_FOCUS_CSS}
        </style>
      ) : null}
    </>
  );
}

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
                    "flex w-28 flex-col items-start gap-1 rounded-lg border px-2.5 py-2 text-left outline-none transition-colors",
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
function moveEdgeBarClassName(placement: TilingMovePlacement): string {
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
  moveTargetPlacement: TilingMovePlacement | null;
}): React.ReactElement {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[60] rounded-xl"
      aria-hidden
      data-hpt-leaf-affordance=""
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

/**
 * The dynamic tiling renderer: a controlled React component that projects a
 * {@link TilingLayoutNode} tree to pixels and drives drag/drop, resize, group,
 * maximize, and keyboard interaction. The library's single entry component.
 *
 * @remarks
 * `TilingRenderer` is CONTROLLED: hold the layout tree in state and apply every
 * edit it reports via `onLayoutChange`. Supply the tiles it references through
 * `tiles`, geometry through `config`, and tune behavior through the single
 * `interaction` prop ({@link TilingInteractionCapabilities}). It forwards a
 * {@link TilingCommandHandle} via `ref` so you can dispatch commands
 * imperatively. All state (focus, maximize, theme, accent) can be left
 * uncontrolled or lifted via the matching `on*Change` callback.
 *
 * The renderer emits real semantic DOM (not canvas), so tiled content stays
 * crawlable and prerenderable.
 *
 * @example
 * ```tsx
 * import { TilingRenderer, DEFAULT_TILING_LAYOUT_CONFIG } from "@n-uf/hypr-tiling";
 * import type { TilingLayoutNode, TilingTile } from "@n-uf/hypr-tiling";
 * import { useState } from "react";
 *
 * const tiles: TilingTile[] = [
 *   { id: "a", title: "editor", content: <Editor /> },
 *   { id: "b", title: "preview", content: <Preview /> },
 * ];
 * const initial: TilingLayoutNode = {
 *   kind: "split", id: "root", axis: "horizontal", ratio: 0.5,
 *   first: { kind: "leaf", id: "l", tileId: "a" },
 *   second: { kind: "leaf", id: "r", tileId: "b" },
 * };
 *
 * export function Workspace() {
 *   const [layout, setLayout] = useState(initial);
 *   return (
 *     <TilingRenderer
 *       layout={layout}
 *       tiles={tiles}
 *       config={DEFAULT_TILING_LAYOUT_CONFIG}
 *       onLayoutChange={setLayout}
 *     />
 *   );
 * }
 * ```
 *
 * @see {@link TilingRendererProps}
 * @see {@link TilingInteractionCapabilities}
 * @see {@link TilingCommandHandle}
 */
/** How a workspace command reached the inner router (imperative, keymap, or a swipe gesture). */
type TilingWorkspaceCommandDispatchVia = "key" | "command" | "swipe";

/**
 * Internal bridge the set-mode wrapper uses so workspace commands share the
 * same `dispatchCommand` path as the keyboard layer and the public handle,
 * and so the swipe driver can attach to the inner renderer's root and yield
 * to a pane drag. Not part of the public renderer prop surface.
 */
interface TilingWorkspaceCommandBridge {
  /** `true` only when the wrapper mounted this inner renderer in set mode. */
  workspaceCommandsEnabled?: boolean;
  /** Receives the `hpt-root` element (the swipe ports' host) on mount / unmount. */
  onRootElementChange?: (element: HTMLDivElement | null) => void;
  /** Mirrors "the drag FSM is not idle" so a swipe never arms under a drag. */
  onDragGestureActiveChange?: (active: boolean) => void;
  /** Inline style merged onto the root (`overscroll-behavior-x` / `touch-action` for swipe). */
  rootStyle?: React.CSSProperties;
  /** Apply a gated workspace command against the wrapper's set. */
  onWorkspaceCommand?: (
    command: Extract<
      TilingCommand,
      {
        kind:
          | "switch-workspace"
          | "cycle-workspace"
          | "move-leaf-to-workspace"
          | "reveal-tile"
          | "reset-workspace"
          | "reset-workspaces";
      }
    >,
    via: TilingWorkspaceCommandDispatchVia,
  ) => boolean;
  /**
   * H6 — coverage override. The tile ids this tree is expected to seat; the
   * inner renderer heals / refuses commits against THESE instead of
   * `expectedTileIdsFromHostTiles(tiles)`. The set-mode wrapper passes the
   * active tree's own seated tiles so a tile seated only in an inactive
   * workspace (or a pool tile no workspace seats) is never pulled into the
   * active tree. Undefined → single-layout semantics (the whole `tiles` map).
   */
  expectedTileIds?: ReadonlyArray<string>;
  /** H6 — seat context every pane render prop carries (`workspaceId` = active id). */
  workspaceId?: string;
  /** H6 — per-tile seat counts across the set; a tile absent here is seated once. */
  tileSeatCounts?: ReadonlyMap<string, number>;
  /**
   * H6 — `inactiveWorkspaces: "keep-mounted"`: pool tiles seated only in
   * inactive workspaces, with the workspace each pane reports. The stable
   * pane pool keeps their last-rendered pane instance mounted (hidden).
   */
  retainedPanes?: ReadonlyArray<TilingRetainedPane>;
  /**
   * N2 — workspace switch transition. When present the viewport mounts a
   * `WorkspaceTransitionStage` around the tree; the wrapper drives
   * `begin` / `scrub` / `finish` through `stageRef`.
   */
  workspaceTransition?: TilingWorkspaceTransitionBridge;
  /**
   * N3 — spring-loaded tab drop. Present only while
   * `interaction.workspaces.springLoad` is on; the inner renderer then
   * reports its drag identity and publishes the imperative rearm channel.
   */
  springLoad?: TilingSpringLoadBridge;
}

/**
 * The drag FSM narrowed to what the set-mode wrapper's dwell FSM keys on:
 * phase plus the pointer / source identity of the live gesture. Reported
 * only when one of these fields changes — never per pointer-move frame.
 */
interface TilingDragIdentity {
  readonly phase: DragMachineState["phase"];
  readonly pointerId: number | null;
  readonly pointerType: DragPointerType | null;
  readonly sourceLeafId: string | null;
}

const IDLE_DRAG_IDENTITY: TilingDragIdentity = {
  phase: "idle",
  pointerId: null,
  pointerType: null,
  sourceLeafId: null,
};

function dragIdentityOf(state: DragMachineState): TilingDragIdentity {
  if (state.phase === "armed" || state.phase === "dragging") {
    return {
      phase: state.phase,
      pointerId: state.pointerId,
      pointerType: state.pointerType,
      sourceLeafId: state.sourceLeafId,
    };
  }
  return state.phase === "idle"
    ? IDLE_DRAG_IDENTITY
    : { phase: state.phase, pointerId: null, pointerType: null, sourceLeafId: state.sourceLeafId };
}

/**
 * What the wrapper asks the inner renderer to do when the dwell fires
 * (`engine/workspace-spring-load.ts` wiring contract, steps 3c–4): end the
 * live drag as a claimed external commit now, and once the destination
 * tree renders with `leafId` in it, `REARM` the drag on that seat under the
 * still-held pointer.
 */
interface TilingSpringLoadRearmRequest {
  /** The pointer that is still held (the claimed drag's pointer). */
  readonly pointerId: number;
  readonly pointerType: DragPointerType;
  /** The moved leaf — the source of the re-armed drag. */
  readonly leafId: string;
  /** The destination workspace whose tree must render before the rearm. */
  readonly workspaceId: string;
  /** The workspace the drag started in (still active until the host applies the switch). */
  readonly fromWorkspaceId: string;
  /** The last window-client point the input layer saw — the re-armed drag's first sample. */
  readonly client: DragMachinePoint;
}

/** The imperative rearm channel the inner renderer publishes for the wrapper. */
interface TilingSpringLoadChannel {
  /** The last window-client point the live drag's input layer processed (`null` before any). */
  readonly lastClientPoint: () => DragMachinePoint | null;
  /**
   * Step 3c: dispatch `POINTER_UP { claimed: true }` for the live drag and
   * queue the rearm. Pointer capture is kept while the rearm is pending.
   * Returns `false` (nothing dispatched) when no drag on `pointerId` is live.
   */
  readonly commitAndQueueRearm: (request: TilingSpringLoadRearmRequest) => boolean;
}

/**
 * Internal spring-load bridge (N3): the wrapper hands the inner renderer a
 * callback for drag-identity changes and a ref the inner renderer fills
 * with its rearm channel. Not on the public renderer prop surface.
 */
interface TilingSpringLoadBridge {
  /** Inner → wrapper: the drag FSM's identity changed (phase / pointer / source leaf). */
  readonly onDragIdentityChange: (identity: TilingDragIdentity) => void;
  /** Inner → wrapper: the rearm channel, populated on every render of the inner renderer. */
  readonly channelRef: React.MutableRefObject<TilingSpringLoadChannel | null>;
}

/** A tile the stable pane pool keeps mounted while its workspace is inactive. */
export interface TilingRetainedPane {
  readonly tileId: string;
  readonly workspaceId: string;
}

/** Stage wiring the set-mode wrapper hands the inner renderer (N2). */
interface TilingWorkspaceTransitionBridge {
  /** Requested mode (`"none"` never reaches the inner renderer). */
  readonly mode: TilingWorkspaceTransitionMode;
  /**
   * Imperative stage handle the wrapper calls `begin` / `scrub` / `finish`
   * on. Swipe progress is scrubbed imperatively (not through a prop) so a
   * 60 Hz wheel stream never re-renders the tree.
   */
  readonly stageRef: React.RefObject<UseWorkspaceTransitionResult | null>;
  /**
   * Fired by the stage after every `finish` once the clone is gone. The
   * wrapper releases a held swipe settle (`SETTLE_DONE`) on it.
   */
  readonly onSettled: (kind: WorkspaceTransitionSettleKind) => void;
}

type TilingSingleLayoutRendererProps = TilingRendererProps &
  TilingRendererObservabilityProps &
  TilingWorkspaceCommandBridge;

const TilingRendererComponent = React.forwardRef<
  TilingCommandHandle,
  TilingSingleLayoutRendererProps
>(function TilingRenderer(
  {
    layout,
    tiles,
    config,
    onLayoutChange,
    className,
    interaction,
    renderTile,
    paneIdentity = "auto",
    focusedLeafId,
    onFocusedLeafChange,
    onTileAccentChange,
    themeId,
    theme: themeProp,
    onThemeChange,
    maximizedLeafId,
    onMaximizedLeafChange,
    onPaneCollapsedChange,
    onProjectedOverlayCountChange,
    showDropPreviewOverlays = true,
    observabilityColors = TILING_OBSERVABILITY_COLOR_DEFAULTS,
    observabilityColorEnables = TILING_OBSERVABILITY_COLOR_ENABLE_DEFAULTS,
    projectedOverlayBackgroundAlpha = 0.9,
    dragAnimationEnabled = true,
    dragPreview = "indicator",
    dragPreviewMakesRoom = false,
    survivorReflowSpeedPercent = DEFAULT_DRAG_ANIMATION_SPEED_PERCENT,
    chromeFocusOutline = "suppress",
    showDropBorderHints = true,
    showDropIntentTranslucentBg = true,
    showDropIntentDebug = true,
    showPaneHitZones = false,
    paneHitZonesAlpha = 0.2,
    paneHitZoneSourceLeafId = null,
    onDropIntentChange,
    onLiveHitLogChange,
    overlayPortalContainer,
    externalDragHover: externalDragHoverProp = null,
    onExternalDrop,
    resolveExternalDragHover,
    onExternalDragHoverChange,
    workspaceCommandsEnabled = false,
    onWorkspaceCommand,
    onRootElementChange,
    onDragGestureActiveChange,
    rootStyle,
    expectedTileIds: expectedTileIdsProp,
    workspaceId: paneWorkspaceId = TILING_MAIN_WORKSPACE_ID,
    tileSeatCounts,
    retainedPanes,
    workspaceTransition,
    springLoad,
  }: TilingSingleLayoutRendererProps,
  ref: React.ForwardedRef<TilingCommandHandle>,
): React.ReactElement {
  // Refs for the layout-edit choke point — declared before any handler so
  // idle settle / resize rAF / sync reducers all share one emit path
  // (HT-PANE-COLLAPSE-EVENTS). `layoutRef` is advanced eagerly on emit so
  // chained commits in the same tick (rAF flush → normalize) diff against the
  // tree just reported, not a stale pre-setState snapshot.
  const layoutRef = React.useRef(layout);
  layoutRef.current = layout;
  const onLayoutChangeRef = React.useRef(onLayoutChange);
  onLayoutChangeRef.current = onLayoutChange;
  const onPaneCollapsedChangeRef = React.useRef(onPaneCollapsedChange);
  onPaneCollapsedChangeRef.current = onPaneCollapsedChange;
  // Engine-resolved external hover (`resolveExternalDragHover`): a ref for the
  // synchronous release-time claim. A host-supplied `externalDragHover` prop
  // takes precedence over it.
  const resolvedExternalDragHoverRef =
    React.useRef<TilingExternalDragHover | null>(null);
  const externalDragHoverPropRef = React.useRef<TilingExternalDragHover | null>(
    externalDragHoverProp ?? null,
  );
  externalDragHoverPropRef.current = externalDragHoverProp ?? null;
  const resolveExternalDragHoverRef = React.useRef<
    TilingExternalDragHoverResolver | undefined
  >(resolveExternalDragHover);
  resolveExternalDragHoverRef.current = resolveExternalDragHover;
  const onExternalDragHoverChangeRef = React.useRef<
    ((hover: TilingExternalDragHover | null) => void) | undefined
  >(onExternalDragHoverChange);
  onExternalDragHoverChangeRef.current = onExternalDragHoverChange;
  const onExternalDropRef = React.useRef<TilingOnExternalDrop | undefined>(
    onExternalDrop,
  );
  onExternalDropRef.current = onExternalDrop;
  /**
   * Run the host resolver for `point` (no-op without one) and publish the
   * result: ref synchronously (release-time claim), and
   * `onExternalDragHoverChange` only when the target IDENTITY changes.
   */
  const applyResolvedExternalDragHover = React.useCallback(
    (point: TilingClientPoint, sourceLeafId: string | null): void => {
      const resolver: TilingExternalDragHoverResolver | undefined =
        resolveExternalDragHoverRef.current;
      if (resolver == null) {
        return;
      }
      const next: TilingExternalDragHover | null =
        sourceLeafId == null ? null : resolver(point, sourceLeafId);
      const previous: TilingExternalDragHover | null =
        resolvedExternalDragHoverRef.current;
      resolvedExternalDragHoverRef.current = next;
      if (!isSameExternalDragTarget(previous, next)) {
        onExternalDragHoverChangeRef.current?.(next);
      }
    },
    [],
  );

  // Single choke point for every layout edit (HT-PANE-COLLAPSE-EVENTS): reports
  // the edit via `onLayoutChange`, THEN diffs the whole tree's collapse truth
  // against the last-emitted tree and fires `onPaneCollapsedChange` for every
  // leaf whose `collapsed` flipped. A normalize/reconcile side effect (a
  // demoted both-static-along-axis sibling, a rearrange commit's
  // `normalizeLayout` pass, a persisted-pin reassert) can flip `collapsed` on a
  // leaf the caller never targeted directly — diffing catches those the SAME
  // way as an explicit toggle instead of only the call site the developer
  // remembered to instrument. Every internal layout emit below routes through
  // here so no edit path is silently exempt; see `diffCollapsedLeaves`.
  const commitLayoutChange = React.useCallback(
    (next: TilingLayoutNode): void => {
      const before: TilingLayoutNode = layoutRef.current;
      const collapsedHandler = onPaneCollapsedChangeRef.current;
      const collapsedChanges: ReadonlyArray<TilingPaneCollapsedChangeEvent> =
        collapsedHandler != null ? diffCollapsedLeaves(before, next) : [];
      onLayoutChangeRef.current(next);
      layoutRef.current = next;
      for (const changeEvent of collapsedChanges) {
        collapsedHandler?.(changeEvent);
      }
    },
    [],
  );
  // Active theme: a full consumer-authored `theme` object takes precedence
  // over the built-in `themeId` selection. The registry returns a stable
  // object reference per id (and a consumer is expected to pass a stable
  // `theme` object), so this is referentially stable across renders unless
  // the props change — safe to thread through the `renderBranch` memo deps.
  // Provided to every subcomponent via context.
  const theme: TilingTheme = themeProp ?? resolveTilingTheme(themeId);
  // Drag-state chrome resolved once per theme identity (the leaf wrapper reads
  // `sourcePane` / `dropTarget` for every leaf on every render).
  const dragChrome: TilingThemeDragChromeTokens = React.useMemo(
    (): TilingThemeDragChromeTokens => resolveDragChrome(theme),
    [theme],
  );
  // Pane identity binding (see `TilingPaneIdentityMode`). `"auto"` locks on the
  // first render — a hydration render sees the server snapshot (`false`) and
  // stays in slot mode for the life of the mount (switching later would remount
  // every pane once); a client-only mount takes the stable pool + relocation
  // seam. The registry / entries / pool-order refs are the seam's plumbing.
  const isClientOnlyRender: boolean = useIsClientOnlyRender();
  const lockedPaneIdentityRef = React.useRef<"stable" | "slot" | null>(null);
  if (lockedPaneIdentityRef.current == null) {
    lockedPaneIdentityRef.current = resolvePaneIdentityMode(
      paneIdentity,
      isClientOnlyRender,
    );
  }
  const paneIdentityMode: "stable" | "slot" =
    paneIdentity === "auto"
      ? lockedPaneIdentityRef.current
      : resolvePaneIdentityMode(paneIdentity, isClientOnlyRender);
  const stablePaneSlotRegistryRef = React.useRef<StablePaneSlotRegistry>(
    new Map<string, HTMLElement>(),
  );
  const stablePanePoolRef = React.useRef<HTMLDivElement | null>(null);
  const stablePaneEntriesRef = React.useRef<Map<string, StablePaneEntry>>(
    new Map<string, StablePaneEntry>(),
  );
  const stablePanePoolOrderRef = React.useRef<ReadonlyArray<string>>([]);
  // Last in-tree render props per tile — the resting source for panes the
  // pool keeps mounted while their workspace is inactive (H6 keep-mounted).
  const lastStablePaneEntriesRef = React.useRef<Map<string, StablePaneEntry>>(
    new Map<string, StablePaneEntry>(),
  );
  // A stable-mode leaf slot registers its wrapper element under the TILE id it
  // currently shows. React 19 callback-ref cleanup: the returned function runs
  // on detach (and whenever the closure identity changes, i.e. every commit),
  // guarded so a stale cleanup never evicts a newer registration.
  const registerStablePaneSlot = React.useCallback(
    (tileId: string) =>
      (element: HTMLDivElement | null): (() => void) | undefined => {
        if (element == null) {
          return undefined;
        }
        stablePaneSlotRegistryRef.current.set(tileId, element);
        return (): void => {
          if (stablePaneSlotRegistryRef.current.get(tileId) === element) {
            stablePaneSlotRegistryRef.current.delete(tileId);
          }
        };
      },
    [],
  );
  const projectedOverlayBackgroundAlphaSafe: number = Math.min(
    Math.max(projectedOverlayBackgroundAlpha, 0),
    1,
  );
  // Every layout change (open, close, swap, move, maximize, a drag's reflow
  // and drop) glides on the leaf-motion settle at the tempo
  // `survivorReflowSpeedPercent` maps to; the master gate makes the leaves snap.
  const leafMotionOmega: number = resolveLeafMotionOmega(
    survivorReflowSpeedPercent,
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
  // Live drag-mode (Hyprland-style: the real pane lifted and held under the
  // pointer + commit-on-release) follows the capability master switch. A static
  // pane can no longer enter live mode for ITSELF (the per-leaf gate refuses its
  // pickup), but flexible panes in the same tree CAN — the per-leaf gate at
  // pickup + target resolution preserves the "no wrong live geometry" invariant.
  const liveDragModeEnabled: boolean =
    isRearrangeEnabled && interactionCapabilities.dragMode === "live";
  // Drag self-healing recovery knobs. `enable` gates the idle watchdog (M3) +
  // explicit transient-style teardown (M4) + visibilitychange reconcile (M5).
  const isDragRecoveryEnabled: boolean =
    interactionCapabilities.dragRecovery.enable;
  const dragRecoveryMaxIdleMs: number =
    interactionCapabilities.dragRecovery.maxDraggingIdleMs;
  const isFocusSelectionEnabled: boolean = interactionCapabilities.focus;
  const isMaximizeEnabled: boolean = interactionCapabilities.maximize.enable;
  const isTitleBarSizingEnabled: boolean =
    interactionCapabilities.paneTitleBarControls.sizing;
  const isTitleBarAcquireSpaceEnabled: boolean =
    interactionCapabilities.paneTitleBarControls.acquireSpace;
  const isCollapseEnabled: boolean =
    interactionCapabilities.paneTitleBarControls.collapse;
  const isPaneSwitchingEnabled: boolean =
    interactionCapabilities.paneSwitching.enable;
  const showTabStripMode: boolean | "maximized" =
    interactionCapabilities.paneSwitching.showTabStrip;
  const paneTabStripOptions: ResolvedTilingPaneTabStripOptions =
    interactionCapabilities.paneSwitching.tabStrip;
  const keepGroupTabStrip: boolean =
    interactionCapabilities.maximize.keepGroupTabStrip;
  const showContentToggle: boolean =
    interactionCapabilities.paneSwitching.showContentToggle;
  // Single source of truth for pane-content visibility. When the toggle control
  // is suppressed (`showContentToggle === false`), the embedding owns content
  // and there is no control to flip it, so content is treated as visible by
  // default for every pane, the dragged one included. When the toggle is shown, the legacy default
  // (content off until the checkbox is flipped) is preserved.
  const [isPaneContentVisible, setIsPaneContentVisible] =
    React.useState<boolean>(
      resolveInitialPaneContentVisible(showContentToggle),
    );
  const isMasterLayoutEnabled: boolean = interactionCapabilities.masterLayout;
  const isGroupingEnabled: boolean = interactionCapabilities.grouping.enable;
  // Per-group tab strip governance (distinct from the TOP-LEVEL
  // `paneSwitching.showTabStrip`): with the strip suppressed a group renders
  // only its active member; the keyboard group commands stay live.
  const showGroupTabStrip: boolean =
    interactionCapabilities.grouping.showGroupTabStrip;
  // Alt/Opt+click header multi-select → group. Gated by its own opt-out flag
  // AND the `grouping` capability (the whole point is to reach `group-leaves`),
  // so with grouping off the Group control is suppressed and a modified header
  // click degrades to a plain click.
  const isMultiSelectGroupingEnabled: boolean =
    interactionCapabilities.paneSwitching.multiSelectGrouping &&
    isGroupingEnabled;
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
      collapseEnabled: isCollapseEnabled,
      resizeEnabled: isResizeEnabled,
      layoutEnabled: interactionCapabilities.masterLayout,
      groupingEnabled: isGroupingEnabled,
      workspacesEnabled:
        workspaceCommandsEnabled && interactionCapabilities.workspaces.enable,
    }),
    [
      isMaximizeEnabled,
      isPaneSwitchingEnabled,
      isFocusSelectionEnabled,
      isRearrangeEnabled,
      isTitleBarSizingEnabled,
      isTitleBarAcquireSpaceEnabled,
      isCollapseEnabled,
      isResizeEnabled,
      interactionCapabilities.masterLayout,
      isGroupingEnabled,
      workspaceCommandsEnabled,
      interactionCapabilities.workspaces.enable,
    ],
  );
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  // Callback ref so the set-mode wrapper's swipe driver learns the root
  // element (`rootRef` itself stays the object every port reads through).
  const assignRootElement = React.useCallback(
    (element: HTMLDivElement | null): void => {
      rootRef.current = element;
      onRootElementChange?.(element);
    },
    [onRootElementChange],
  );
  const isPointerWithinRootRef = React.useRef<boolean>(false);
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const splitContainerRefs = React.useRef<Map<string, HTMLDivElement>>(
    new Map(),
  );
  const groupTabStripRefs = React.useRef<Map<string, HTMLDivElement>>(
    new Map(),
  );
  const groupDropTargetElementsRef = React.useRef<Map<string, Set<HTMLElement>>>(
    new Map(),
  );
  const groupDropTargetCallbacksRef = React.useRef<
    Map<string, React.RefCallback<HTMLElement | null>>
  >(new Map());
  const groupDropTargetRefFor = React.useCallback(
    (leafId: string): React.RefCallback<HTMLElement | null> => {
      const cached: React.RefCallback<HTMLElement | null> | undefined =
        groupDropTargetCallbacksRef.current.get(leafId);
      if (cached != null) {
        return cached;
      }
      const callback: React.RefCallback<HTMLElement | null> = (
        element: HTMLElement | null,
      ): void => {
        const registered: Map<string, Set<HTMLElement>> =
          groupDropTargetElementsRef.current;
        if (element == null) {
          const elements: Set<HTMLElement> | undefined = registered.get(leafId);
          if (elements == null) {
            return;
          }
          for (const current of elements) {
            if (!current.isConnected) {
              elements.delete(current);
            }
          }
          if (elements.size === 0) {
            registered.delete(leafId);
          }
          return;
        }
        const elements: Set<HTMLElement> =
          registered.get(leafId) ?? new Set<HTMLElement>();
        elements.add(element);
        registered.set(leafId, elements);
      };
      groupDropTargetCallbacksRef.current.set(leafId, callback);
      return callback;
    },
    [],
  );
  // DOM-geometry host port. Reads through the stable `rootRef` / `viewportRef` /
  // `groupTabStripRefs`, so the pointer-target resolution runs
  // against a single injectable measurement seam (unit-testable with synthetic
  // rects) rather than scattered inline `getBoundingClientRect()` reads.
  const measurementPort: MeasurementPort = React.useMemo(
    () =>
      createDomMeasurementPort({
        rootRef,
        viewportRef,
        groupTabStripRefs,
        groupDropTargetRefs: groupDropTargetElementsRef,
      }),
    [rootRef, viewportRef, groupTabStripRefs, groupDropTargetElementsRef],
  );
  const [viewportSize, setViewportSize] = React.useState<{
    width: number;
    height: number;
  }>({
    width: 0,
    height: 0,
  });
  const [resizeState, setResizeState] =
    React.useState<TilingSplitResizeState | null>(null);
  // Resize pointer handlers must NOT rebind when `layout` changes — every move
  // commits a new ratio, and rebinding tore down the `{ once: true }` pointerup
  // listener (race: release between cleanup and re-subscribe → stuck resize,
  // persisted mid-drag ratios, no self-heal on pointerup). `layoutRef` /
  // `onLayoutChangeRef` are owned by the commit choke point above.
  const configRef = React.useRef(config);
  configRef.current = config;
  // Coverage source of truth: every commit/idle normalize must heal
  // missing/duplicate/unknown tileIds against it. Single-layout mode: the
  // host tile map. Set mode (H6): the wrapper's `expectedTileIds` — the
  // active tree's OWN seated tiles — so `tiles` can be the whole pool without
  // the active tree absorbing tiles seated elsewhere.
  const expectedTileIds: ReadonlyArray<string> = React.useMemo(
    (): ReadonlyArray<string> =>
      expectedTileIdsProp ?? expectedTileIdsFromHostTiles(tiles),
    [expectedTileIdsProp, tiles],
  );
  const expectedTileIdsRef = React.useRef<ReadonlyArray<string>>(expectedTileIds);
  expectedTileIdsRef.current = expectedTileIds;
  const viewportSizeRef = React.useRef(viewportSize);
  viewportSizeRef.current = viewportSize;
  // Live resize ratio updates are rAF-coalesced (one layout commit per frame).
  // Pending values flush on pointerup before commit-time normalizeLayout.
  const pendingResizeRatioRef = React.useRef<number | null>(null);
  const resizeRafHandleRef = React.useRef<number | null>(null);
  const layoutIdleSettleHandleRef = React.useRef<number | null>(null);
  const resizeStateRef = React.useRef<TilingSplitResizeState | null>(null);
  resizeStateRef.current = resizeState;
  // SINGLE drag-lifecycle owner (Pointer Events + explicit FSM). Replaces the
  // scattered HTML5-DnD state slots (`dragSourceLeafId` / `dropState` /
  // `dragHoverLeafId` / `dragVisualState` useStates + `didDropSucceedRef` /
  // `stableDropStateRef`). Every terminal pointer event routes
  // `dragging → settling → idle`, so a teardown edge can never be missed.
  // The framework-free interaction controller (`engine/controller.ts`) owns the
  // drag FSM store + the seat/latch input driver. The renderer CONSUMES it: the
  // FSM is read via `useSyncExternalStore`, DOM events are forwarded into
  // `controller.input.*` / `controller.dispatch`. The controller is created
  // ONCE (its in-flight seat/latch must survive the pointer effect's per-drag
  // re-subscribes); its host seam (DOM target resolution, pointer capture, live
  // slot-commitment) is populated below once `resolvePointerTarget` exists, and
  // the driver reads it LAZILY through `controllerHostRef` so creation order is
  // decoupled from the host wiring.
  const controllerHostRef = React.useRef<TilingControllerHost | null>(null);
  const controllerRef = React.useRef<TilingController | null>(null);
  if (controllerRef.current == null) {
    controllerRef.current = createTilingController({
      host: {
        resolveTarget: (
          clientX: number,
          clientY: number,
          sourceLeafId: string,
          previousTarget: TilingDropState | null,
        ): TilingDropState | null =>
          controllerHostRef.current?.resolveTarget(
            clientX,
            clientY,
            sourceLeafId,
            previousTarget,
          ) ?? null,
        capturePointer: (pointerId: number): void => {
          controllerHostRef.current?.capturePointer(pointerId);
        },
        getSlotCommitment: () =>
          controllerHostRef.current?.getSlotCommitment() ?? {
            mode: "delta-responsive",
            reresolveDeltaPx: 24,
          },
      },
    });
  }
  const controller: TilingController = controllerRef.current;
  const controllerState: TilingControllerState = React.useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );
  const dragState: DragMachineState = controllerState.drag;
  const dispatchDrag: (
    event: Parameters<TilingController["dispatch"]>[0],
  ) => void = controller.dispatch;
  // Latest FSM state mirrored to a ref so the window-level pointer listeners read
  // the current phase synchronously without re-subscribing on every move.
  const dragStateRef = React.useRef<DragMachineState>(dragState);
  // The drop preview, read by the pointer listeners between renders.
  const dragPreviewRef = React.useRef<TilingDragPreview>(dragPreview);
  dragPreviewRef.current = dragPreview;
  // Snap preview: the drop the lifted pane is snapped into and its landing slot
  // (viewport px), or `null` while the pane follows the pointer. A ref for the
  // pointer listeners (enter / leave hysteresis, the target the resolver
  // keeps while the pointer stays in the slot) and state for the render (the
  // pane sits in the tree at that slot; the others make room).
  const snappedRef = React.useRef<{
    readonly target: TilingDropState;
    readonly slot: TilingRect;
  } | null>(null);
  // Read live, never cached across a drag: a page scroll moves the origin and
  // a scaled ancestor makes a client px differ from a layout px.
  const viewportClientFrame = (): ViewportClientFrame =>
    measureViewportClientFrame(viewportRef.current);
  const [snappedTarget, setSnappedTarget] =
    React.useState<TilingDropState | null>(null);
  // The pane being dragged, raised above every other pane (and the drop
  // indicator) from the lift until its drop settle ends. Keyed by TILE id.
  const [raisedTileId, setRaisedTileId] = React.useState<string | null>(null);
  const raisedTileIdRef = React.useRef<string | null>(null);
  raisedTileIdRef.current = raisedTileId;
  // The pointerId the drag captured on the stable root element, for release on settle.
  const capturedPointerIdRef = React.useRef<number | null>(null);
  // N3 — the last window-client point the drag's input layer saw (press
  // origin, then every raw `pointermove`). The spring-load rearm starts the
  // continuation drag from here: the pointer is parked over a tab and may not
  // move again before the dwell fires.
  const lastDragClientPointRef = React.useRef<DragMachinePoint | null>(null);
  // N3 — a spring-load rearm waiting for the destination tree. Set when the
  // wrapper ends the live drag as a claimed commit (step 3c); consumed by the
  // rearm layout effect once the machine is `idle` again and the destination
  // workspace's tree carries the leaf (step 4). State (not only a ref) so the
  // rearm effect and the pending-release guard key on it.
  const [pendingSpringLoadRearm, setPendingSpringLoadRearm] =
    React.useState<TilingSpringLoadRearmRequest | null>(null);
  const pendingSpringLoadRearmRef = React.useRef<TilingSpringLoadRearmRequest | null>(null);
  // The seat/latch cluster (seat anchor, the single authoritative committable
  // seat, the decaying last-committable-seat fallback, and the synchronously
  // latched release commit) is OWNED by the framework-free drag input driver
  // (`engine/input-driver.ts`), created below once `resolvePointerTarget` exists.
  // The renderer reads `inputDriver.committableSeat` / `.releaseCommitLatched`
  // for competing-cancel suppression and calls `inputDriver.reset()` at settle.
  // The live M3 idle-watchdog handle, mirrored into a ref so `handlePointerMove`
  // can input-GROUND it (re-arm on raw pointer input, not only on effect re-runs)
  // and `handlePointerUp` can cancel it SYNCHRONOUSLY outside the effect cleanup,
  // before any competing cancel can fire. Owned by the watchdog effect; null when
  // no drag is in flight.
  const watchdogRef = React.useRef<DragWatchdog | null>(null);
  // The root-bound pointer-capture seam. Ref-backed and stable — created once.
  const pointerCapturePort: PointerCapturePort = React.useMemo(
    (): PointerCapturePort => createDomPointerCapturePort(rootRef),
    [],
  );
  // Leaf motion (engine/leaf-motion.ts): one settle per leaf on the shared
  // frame loop. Every commit collects the leaf wrappers (`[data-hpt-leaf]`)
  // under the viewport, reads their LAYOUT rects and hands them over as
  // targets (the layout effect after the seat measurement); each frame draws
  // them (leaf-motion-dom.ts). Motion is keyed by TILE id (the window a user
  // sees; a swap trades tiles between leaf nodes). `leafWrappersRef` maps tile
  // id → wrapper as of
  // the last commit, for the per-frame writes.
  const leafWrappersRef = React.useRef<Map<string, HTMLElement>>(
    new Map<string, HTMLElement>(),
  );
  const leafMotionRef = React.useRef<LeafMotion | null>(null);
  // Container size at the last sync: a resized container snaps, not glides.
  const leafMotionContainerSizeRef = React.useRef<{
    width: number;
    height: number;
  } | null>(null);
  // Read by the leaf motion on every new target (snap instead of glide).
  const leafMotionSnapRef = React.useRef<boolean>(!dragAnimationEnabled);
  // Selectors off the single FSM state — the renderer reads these exactly where
  // it used to read the old useState slots.
  const dragSourceLeafId: string | null = activeDragSourceLeafId(dragState);
  // What the drag moves: the whole tab group the source is the active member
  // of (grabbed by its title bar or the empty part of its strip), or the one
  // pane (a tab torn off, an ungrouped pane). A group subject whose source is
  // no longer in a group is the one pane.
  const dragSubjectGroup: TilingGroupNode | null =
    dragState.phase !== "idle" && dragState.subject === "group"
      ? findGroupContainingLeaf(layout, dragState.sourceLeafId)
      : null;
  const dragSubject: DragSubject = dragSubjectGroup != null ? "group" : "pane";
  const dropState: TilingDropState | null = activeResolvedTarget(dragState);
  const presentationSourceLeafId: string | null =
    presentationDragSourceLeafId(dragState);
  const presentationDropState: TilingDropState | null =
    presentationResolvedTarget(dragState);
  // A drag gesture is materially in flight whenever the FSM is NOT idle
  // (`armed` / `dragging` / `settling`). Drives the `select-none` gate on the
  // tiling root so the browser cannot run its native pointer-drag text
  // selection across pane bodies mid-gesture; restored to default (selectable)
  // the instant the FSM returns to `idle`, so normal text selection in panes
  // still works at rest.
  const isDragGestureActive: boolean = dragState.phase !== "idle";
  // Set-mode wrapper mirror: a workspace swipe must never arm under a drag
  // (armed / dragging / settling) and yields when one picks up mid-gesture.
  React.useEffect((): void => {
    onDragGestureActiveChange?.(isDragGestureActive);
  }, [onDragGestureActiveChange, isDragGestureActive]);
  // N3 — spring-load bridge (set-mode wrapper, `interaction.workspaces.
  // springLoad`). The wrapper's dwell FSM keys on the drag IDENTITY (phase +
  // pointer + source leaf), reported here only when one of those primitives
  // changes — a 60 Hz `POINTER_MOVE` stream re-renders nothing in the
  // wrapper. Absent bridge (spring-load off / single-layout mode) → the effect
  // is a no-op and the channel ref is never written.
  const dragIdentity: TilingDragIdentity = dragIdentityOf(dragState);
  const onDragIdentityChangeRef = React.useRef<
    ((identity: TilingDragIdentity) => void) | undefined
  >(springLoad?.onDragIdentityChange);
  onDragIdentityChangeRef.current = springLoad?.onDragIdentityChange;
  const springLoadBridgeActive: boolean = springLoad != null;
  React.useEffect((): void => {
    if (!springLoadBridgeActive) {
      return;
    }
    onDragIdentityChangeRef.current?.({
      phase: dragIdentity.phase,
      pointerId: dragIdentity.pointerId,
      pointerType: dragIdentity.pointerType,
      sourceLeafId: dragIdentity.sourceLeafId,
    });
  }, [
    springLoadBridgeActive,
    dragIdentity.phase,
    dragIdentity.pointerId,
    dragIdentity.pointerType,
    dragIdentity.sourceLeafId,
  ]);
  /**
   * Step 3c of the spring-load contract: end the live drag as the claimed
   * external commit (the edge `handleExternalDrop` takes on release) and
   * queue the rearm. The settle effect keeps pointer capture while a rearm is
   * pending; the rearm effect below consumes the request.
   */
  const commitAndQueueSpringLoadRearm = React.useCallback(
    (request: TilingSpringLoadRearmRequest): boolean => {
      // The store's state, not the post-commit ref mirror: the wrapper calls
      // this from a timer, possibly between a dispatch and its commit.
      const live: DragMachineState = controller.getState().drag;
      if (live.phase !== "dragging" || live.pointerId !== request.pointerId) {
        return false;
      }
      pendingSpringLoadRearmRef.current = request;
      setPendingSpringLoadRearm(request);
      dispatchDrag({ type: "POINTER_UP", pointerId: request.pointerId, claimed: true });
      return true;
    },
    [controller, dispatchDrag],
  );
  if (springLoad != null) {
    springLoad.channelRef.current = {
      lastClientPoint: (): DragMachinePoint | null => lastDragClientPointRef.current,
      commitAndQueueRearm: commitAndQueueSpringLoadRearm,
    };
  }
  // Interaction slices now OWNED by the controller store (folded out of the
  // renderer's `useState`/`useRef` per the Stage-7 state-collapse). They are
  // read off the same `useSyncExternalStore` snapshot as the drag FSM; the
  // render-time values are destructured into locals below (identical names, so
  // every downstream read/effect-dep is unchanged) and mutated via the
  // `controller.set*` setters. Document-listener closures that need the LATEST
  // (not render-time) value read `controller.getState().*` directly.
  //
  // The controlled/uncontrolled prop merge stays HOST-side and byte-identical:
  // the controller owns only the UNCONTROLLED fallback (`state.focus` /
  // `state.maximize`); `activeFocusedLeafId` / `controlledMaximizedLeafId`
  // resolve the merge below exactly as before.
  const internalFocusedLeafId: string | null = controllerState.focus;
  const internalMaximizedLeafId: string | null = controllerState.maximize;
  const paneSwitcherState: TilingPaneSwitcherState | null =
    controllerState.switcher;
  // Keyboard MOVE MODE — the accessible analog of a drag pickup. Drives the
  // visual affordance; the document keydown listener reads the latest via
  // `controller.getState().moveMode`.
  const moveModeState: TilingMoveModeState | null = controllerState.moveMode;
  // Alt/Opt+click header multi-selection set (HT — paneSwitching.multiSelectGrouping).
  // Insertion order is the group-member order (host slot resolves to the clicked
  // pane, or focused-else-first for Alt+G). The document keydown listener
  // (Escape) and the header pointer handlers read the latest via
  // `controller.getState().multiSelect`.
  const multiSelectedLeafIds: ReadonlySet<string> = controllerState.multiSelect;
  const paneHitZonesAlphaSafe: number = clampUnitInterval(paneHitZonesAlpha);

  // PART 2 — STATIC captures the actual current bbox. On a title-bar STATIC
  // action we MEASURE the pane's rendered box (getBoundingClientRect on its
  // `[data-leaf-id]` element) at click time and pin the chosen dimension(s) to
  // that exact pixel value via `measuredStaticSizing`; FLEX clears the pin
  // (`setLeafSizing(..., undefined)`). Controlled: emitted through onLayoutChange.
  // Where leaf motion draws a pane right now, in client coordinates (its drawn
  // rect is viewport-relative), or `null` for a pane it does not know.
  const drawnClientRectOf = React.useCallback(
    (tileId: string): TilingClientRectLike | null => {
      const drawn = leafMotionRef.current?.drawn(tileId) ?? null;
      const viewport: HTMLDivElement | null = viewportRef.current;
      if (drawn == null || viewport == null) {
        return null;
      }
      // Drawn rects are viewport layout px; the footprint is client px.
      const frame: ViewportClientFrame = measureViewportClientFrame(viewport);
      return {
        left: frame.x + drawn.x * frame.scale,
        top: frame.y + drawn.y * frame.scale,
        width: drawn.width * frame.scale,
        height: drawn.height * frame.scale,
      };
    },
    [],
  );
  const setLeafSizingFromBbox = React.useCallback(
    (targetLeafId: string, mode: TilingTitleBarSizingMode): void => {
      if (mode === "flexible") {
        commitLayoutChange(setLeafSizing(layout, targetLeafId, undefined));
        return;
      }
      // `measureLeafRect` resolves the `[data-leaf-id]` element root-scoped (via
      // `rootRef`, matching the focus/maximize paths) — NOT viewport-scoped — so a
      // pane rendered outside the viewport subtree still resolves, eliminating the
      // viewport-scope miss that returned `null` and pinned a zero extent.
      const rect: DOMRect | null =
        measurementPort.measureLeafRect(targetLeafId);
      // Guard the zero-pin collapse: a missing element / zero-area rect must NOT
      // commit a `*Px:0` pin (a zero pin + flexShrink:0 collapses the leaf and
      // surfaces dead space). On a missing measurement leave the pane flexible
      // (no-op the switch) rather than pinning zero.
      if (rect == null) {
        return;
      }
      // Pin the LAYOUT size: mid-glide the box can be popping in (scaled), so
      // prefer the element's offset size, which no transform changes.
      const paneElement: HTMLElement | null =
        rootRef.current?.querySelector<HTMLElement>(
          `[data-leaf-id="${targetLeafId}"]`,
        ) ?? null;
      const measuredWidthPx: number = Math.round(
        paneElement != null && paneElement.offsetWidth > 0
          ? paneElement.offsetWidth
          : rect.width,
      );
      const measuredHeightPx: number = Math.round(
        paneElement != null && paneElement.offsetHeight > 0
          ? paneElement.offsetHeight
          : rect.height,
      );
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
      commitLayoutChange(setLeafSizing(layout, targetLeafId, sizing));
    },
    [layout, commitLayoutChange, measurementPort],
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
    (targetLeafId: string, direction: TilingFocusDirection): void => {
      const viewportRect: DOMRect | null =
        measurementPort.measureViewportRect();
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
      commitLayoutChange(
        annexDirection(layout, targetLeafId, direction, constraints),
      );
    },
    [
      config.gapPx,
      config.minPaneSizePx,
      layout,
      commitLayoutChange,
      viewportSize.height,
      viewportSize.width,
      measurementPort,
    ],
  );

  React.useEffect((): void => {
    dragStateRef.current = dragState;
  }, [dragState]);

  // Latest slot-commitment policy mirrored to a ref so the coalescer (subscribed
  // once per drag) reads runtime mode/delta changes (e.g. a host toggle)
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
  // capability change (e.g. a host slider).
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
    controller.updateFocusHistory(
      (history: FocusHistory): FocusHistory =>
        pruneFocusHistory(history, leafIds),
    );
  }, [controller, leafIds]);
  const leafFootprintsById: ReadonlyMap<string, TilingPaneFootprint> =
    React.useMemo(
      (): ReadonlyMap<string, TilingPaneFootprint> =>
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
  const layoutForPaneTabs: TilingLayoutNode = React.useMemo(
    (): TilingLayoutNode =>
      layoutWithMaximizedGroupMember(layout, activeMaximizedLeafId),
    [activeMaximizedLeafId, layout],
  );
  const paneTabLeafIds: ReadonlyArray<string> = React.useMemo(
    (): ReadonlyArray<string> => readLeafNodeIds(layoutForPaneTabs),
    [layoutForPaneTabs],
  );
  const paneStripTabs: ReadonlyArray<TilingPaneTab> = React.useMemo(
    (): ReadonlyArray<TilingPaneTab> =>
      paneTabLeafIds.map((leafId: string, index: number): TilingPaneTab => {
        const leaf: TilingLeafNode | null = findLeafById(
          layoutForPaneTabs,
          leafId,
        );
        const tile: TilingTile | undefined =
          leaf != null ? resolveTile(tiles, leaf.tileId) : undefined;
        const group: TilingGroupNode | null = findGroupContainingLeaf(
          layout,
          leafId,
        );
        return {
          leafId,
          tileId: leaf?.tileId ?? leafId,
          title: tile?.title ?? leafId,
          active: leafId === activeFocusedLeafId,
          maximized: leafId === activeMaximizedLeafId,
          ordinal: index + 1,
          groupId: group?.id ?? null,
          memberCount: group?.members.length ?? 1,
        };
      }),
    [
      activeFocusedLeafId,
      activeMaximizedLeafId,
      layout,
      layoutForPaneTabs,
      paneTabLeafIds,
      tiles,
    ],
  );
  const paneTabs: ReadonlyArray<PaneTabDescriptor> = React.useMemo(
    (): ReadonlyArray<PaneTabDescriptor> =>
      paneStripTabs.map((tab: TilingPaneTab): PaneTabDescriptor => {
        const tile: TilingTile | undefined = resolveTile(tiles, tab.tileId);
        return {
          leafId: tab.leafId,
          title: tab.title,
          accent: tile?.accent ?? "cyan",
        };
      }),
    [paneStripTabs, tiles],
  );
  const showPaneTabStrip: boolean =
    isPaneSwitchingEnabled &&
    paneStripTabs.length > 0 &&
    (showTabStripMode === true ||
      (showTabStripMode === "maximized" && activeMaximizedLeafId != null));
  // Focused tile + its current accent — the target the top-bar accent picker
  // recolors. Null when nothing is focused or the focused leaf has no tile.
  const focusedTileAccentTarget: {
    tileId: string;
    accent: TilingTileAccent;
  } | null = React.useMemo(() => {
    if (activeFocusedLeafId == null) {
      return null;
    }
    const leaf: TilingLeafNode | null = findLeafById(
      layout,
      activeFocusedLeafId,
    );
    if (leaf == null) {
      return null;
    }
    const tile: TilingTile | undefined = resolveTile(tiles, leaf.tileId);
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
        onSelect: (accent: TilingTileAccent): void =>
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
  const showPaneLabChrome: boolean =
    isPaneSwitchingEnabled &&
    showTabStripMode === true &&
    (tabStripThemePicker != null ||
      tabStripAccentPicker != null ||
      showContentToggle);
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
          focusHistory: controller.getFocusHistory(),
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
  const projectedDropLayout: TilingLayoutNode | null = React.useMemo(
    (): TilingLayoutNode | null =>
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
  const resolvedTargetZone: TilingLeafDropZone | null =
    presentationDropState?.zone ?? null;
  const resolvedTargetAction: TilingDropState["action"] | null =
    presentationDropState?.action ?? null;
  // The leaf whose slot the dragged pane lands in for the resolved target (the
  // target leaf for a swap / group-merge, the source leaf for an edge-insert).
  const landingLeafId: string | null = resolveDragLandingLeafId(
    presentationSourceLeafId,
    presentationDropState,
    dragSubject,
  );
  // ── The held drag (live mode) ────────────────────────────────────────────
  // Past the pickup threshold the REAL pane is lifted out of the layout: the
  // others close the gap (the tree without it) and the pane is drawn where the
  // pointer holds it, in a wrapper of its own laid out where it was picked up.
  // The drop preview decides what else moves:
  // - "indicator": a drop indicator marks the exact rect the pane will land
  //   in; with `dragPreviewMakesRoom` the others also make room there (the
  //   tree with the pane in that slot, its place kept empty).
  // - "snap": once the pointer is well inside a landing slot the pane itself
  //   settles into it and the others make room; it stays there until the
  //   pointer leaves that slot.
  const isLiveDragging: boolean =
    liveDragModeEnabled && dragState.phase === "dragging";
  const dragSourceTileId: string | null =
    dragSourceLeafId == null
      ? null
      : (findLeafById(layout, dragSourceLeafId)?.tileId ?? null);
  const committableDropState: TilingDropState | null =
    dropState != null &&
    dragSourceLeafId != null &&
    isCommittableTarget(dropState, dragSourceLeafId)
      ? dropState
      : null;
  const isSnapPreview: boolean = dragPreview === "snap";
  const roomTarget: TilingDropState | null = !isLiveDragging
    ? null
    : isSnapPreview
      ? snappedTarget
      : dragPreviewMakesRoom
        ? committableDropState
        : null;
  const roomTargetKey: string =
    roomTarget == null
      ? ""
      : `${roomTarget.leafId}|${roomTarget.action}|${roomTarget.finalEdge ?? ""}|${roomTarget.selectedSplitZone ?? ""}|${roomTarget.memberInsertIndex ?? ""}`;
  const liveDragDisplayLayout: TilingLayoutNode = React.useMemo(
    (): TilingLayoutNode =>
      roomTarget == null
        ? resolveLiveDisplayLayout(true, dragSourceLeafId, layout, dragSubject)
        : deriveCandidateTree(layout, dragSourceLeafId, roomTarget, dragSubject),
    // `roomTarget` identity changes on every pointer move, so key on what
    // decides the tree instead — identical resolves are free.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, dragSourceLeafId, dragSubject, roomTargetKey],
  );
  // The pane is held (drawn in its lifted wrapper) for the whole drag except
  // while the snap preview has it settled into a slot in the tree.
  const isPaneHeld: boolean =
    isLiveDragging &&
    dragSourceTileId != null &&
    !(isSnapPreview && snappedTarget != null);
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
  const settlingCommitCandidate: TilingLayoutNode | null =
    React.useMemo((): TilingLayoutNode | null => {
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
        dragState.subject,
      );
    }, [dragState, layout, liveDragModeEnabled]);
  // Claimed settle: hold the gap-closed tree (source already detached) so the
  // leaf does not flash back while the host's synchronous `onExternalDrop`
  // layout update lands. `removeLeafTile` is a no-op if the host already
  // removed it in the same tick.
  const settlingClaimedHold: TilingLayoutNode | null =
    liveDragModeEnabled &&
    dragState.phase === "settling" &&
    dragState.outcome === "claimed"
      ? // A host claim takes the leaf it is handed (`onExternalDrop(leafId)`),
        // so even a dragged group gives up only that pane here.
        removeLeafTile(layout, dragState.sourceLeafId)
      : null;
  const displayLayout: TilingLayoutNode =
    isLiveDragging && dragSourceLeafId != null
      ? liveDragDisplayLayout
      : (settlingCommitCandidate ?? settlingClaimedHold ?? layout);
  // While the pane is held, a leaf of the display tree that carries it (the
  // slot the others made room around, or a root leaf with nothing to close
  // over) is its kept place: painted empty, so the pane shows only once.
  const heldSlotLeafId: string | null =
    isPaneHeld && dragSourceTileId != null
      ? (findLeafByTileId(displayLayout, dragSourceTileId)?.id ?? null)
      : null;
  const groupTabStripOptions: ResolvedTilingGroupTabStripOptions =
    interactionCapabilities.grouping.groupTabStrip;
  const dragLandingGroupStrip: DragLandingGroupStrip = React.useMemo(
    (): DragLandingGroupStrip => ({
      visible: interactionCapabilities.grouping.showGroupTabStrip,
      heightPx: tabStripRenderedHeight(groupTabStripOptions.height, false),
      placement: groupTabStripOptions.placement,
    }),
    [
      interactionCapabilities.grouping.showGroupTabStrip,
      groupTabStripOptions.height,
      groupTabStripOptions.placement,
    ],
  );
  // Where a drop on `target` lands the dragged pane (viewport px), or `null`.
  // The indicator, the snap slot and the committed layout all come from the
  // same candidate tree, so they agree by construction.
  const resolveDropLandingRect = React.useCallback(
    (sourceLeafId: string, target: TilingDropState | null): TilingRect | null =>
      resolveDragLandingRect({
        layout,
        sourceLeafId,
        target,
        container: viewportSize,
        config,
        groupStrip: dragLandingGroupStrip,
        subject: dragSubject,
      }),
    [layout, viewportSize, config, dragLandingGroupStrip, dragSubject],
  );
  const resolveDropLandingRectRef = React.useRef(resolveDropLandingRect);
  resolveDropLandingRectRef.current = resolveDropLandingRect;
  // Indicator mode: the exact rect the pane would land in now.
  const dropIndicatorRect: TilingRect | null =
    isPaneHeld && !isSnapPreview && dragSourceLeafId != null
      ? resolveDropLandingRect(dragSourceLeafId, committableDropState)
      : null;
  // Where the lifted wrapper is laid out (viewport layout px): the pane's
  // place at the lift, at its lift size; and the grab offset the pointer holds
  // it by (layout px). The footprint and the offset are client px measured at
  // the press, so they are converted through the viewport's frame then.
  // A dragged group is held as its frame (strip and active pane): `layoutRect`
  // is the frame, `leafRect` the active pane inside it (beside the strip).
  const liftedGroupStripPx: number =
    dragSubjectGroup != null &&
    dragLandingGroupStrip.visible &&
    dragSubjectGroup.members.length >= 2
      ? dragLandingGroupStrip.heightPx
      : 0;
  const liftGeometry: {
    readonly tileId: string;
    readonly layoutRect: TilingRect;
    readonly leafRect: TilingRect;
    readonly grab: DragMachinePoint;
  } | null = React.useMemo(() => {
    if (!isLiveDragging || dragState.phase !== "dragging" || dragSourceTileId == null) {
      return null;
    }
    const frame: ViewportClientFrame = viewportClientFrame();
    const topLeft: DragMachinePoint = clientToViewportPoint(frame, {
      x: dragState.anchorFootprint.left,
      y: dragState.anchorFootprint.top,
    });
    const layoutRect: TilingRect = {
      x: topLeft.x,
      y: topLeft.y,
      width: clientToViewportLength(frame, dragState.anchorFootprint.width),
      height: clientToViewportLength(frame, dragState.anchorFootprint.height),
    };
    const stripPx: number = Math.min(liftedGroupStripPx, layoutRect.height);
    const leafRect: TilingRect =
      stripPx <= 0
        ? layoutRect
        : {
            x: layoutRect.x,
            y: dragLandingGroupStrip.placement === "top" ? layoutRect.y + stripPx : layoutRect.y,
            width: layoutRect.width,
            height: layoutRect.height - stripPx,
          };
    return {
      tileId: dragSourceTileId,
      layoutRect,
      leafRect,
      grab: {
        x: clientToViewportLength(frame, dragState.pointerAnchorOffset.x),
        y: clientToViewportLength(frame, dragState.pointerAnchorOffset.y),
      },
    };
    // Fixed for one lift: keyed on what identifies it, not on every move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isLiveDragging,
    dragSourceTileId,
    liftedGroupStripPx,
    dragState.phase === "dragging" ? dragState.anchorFootprint : null,
    dragState.phase === "dragging" ? dragState.pointerAnchorOffset : null,
  ]);
  const liftGeometryRef = React.useRef(liftGeometry);
  liftGeometryRef.current = liftGeometry;
  const isPaneHeldRef = React.useRef<boolean>(isPaneHeld);
  isPaneHeldRef.current = isPaneHeld;
  /**
   * Where the pointer holds the lifted pane (viewport layout px), from a client
   * point, through the viewport's frame as it is now (scrolled, scaled).
   */
  const heldRectAt = React.useCallback(
    (client: DragMachinePoint): TilingRect | null => {
      const lift = liftGeometryRef.current;
      if (lift == null) {
        return null;
      }
      const point: DragMachinePoint = clientToViewportPoint(
        measureViewportClientFrame(viewportRef.current),
        client,
      );
      return {
        x: point.x - lift.grab.x,
        y: point.y - lift.grab.y,
        width: lift.layoutRect.width,
        height: lift.layoutRect.height,
      };
    },
    [],
  );
  /**
   * Put the lifted pane where the pointer is: held 1:1 (indicator) or settling
   * toward it (snap, not snapped). Called from the raw pointer listener, so the
   * pane follows within the same task as the event, and from the layout sync.
   */
  const placeHeldPane = React.useCallback(
    (client: DragMachinePoint, flush: boolean): void => {
      const lift = liftGeometryRef.current;
      const motion: LeafMotion | null = leafMotionRef.current;
      const frameRect: TilingRect | null = heldRectAt(client);
      if (lift == null || motion == null || frameRect == null || !isPaneHeldRef.current) {
        return;
      }
      // The motion moves the (active) pane: held where the frame is, offset
      // by its place in the frame (a group's pane sits beside its strip).
      const rect: TilingRect = {
        x: frameRect.x + (lift.leafRect.x - lift.layoutRect.x),
        y: frameRect.y + (lift.leafRect.y - lift.layoutRect.y),
        width: lift.leafRect.width,
        height: lift.leafRect.height,
      };
      if (dragPreviewRef.current === "snap") {
        motion.target(lift.tileId, rect, lift.leafRect);
      } else {
        motion.hold(lift.tileId, rect, lift.leafRect);
      }
      if (flush) {
        motion.flush();
      }
    },
    [heldRectAt],
  );
  // The lifted wrapper is `position: fixed`, so the viewport's
  // `overflow: hidden` does not clip the pane over the workspace tab strip or
  // a host drop target. Its left / top are written here (not by React): its
  // containing block is measured, and a scroll moves the viewport under it.
  const liftedLayerRef = React.useRef<HTMLDivElement | null>(null);
  const placeLiftedLayer = React.useCallback((): void => {
    const layer: HTMLDivElement | null = liftedLayerRef.current;
    const lift = liftGeometryRef.current;
    if (layer == null || lift == null) {
      return;
    }
    placeFixedLayer(
      layer,
      measureViewportClientFrame(viewportRef.current),
      lift.layoutRect,
    );
  }, []);
  // Raise the dragged pane from the lift; it stays raised until its drop
  // settle ends (cleared by the leaf motion once the pane rests).
  React.useLayoutEffect((): void => {
    if (isLiveDragging && dragSourceTileId != null && raisedTileIdRef.current !== dragSourceTileId) {
      raisedTileIdRef.current = dragSourceTileId;
      setRaisedTileId(dragSourceTileId);
    }
  }, [isLiveDragging, dragSourceTileId]);
  // A drag that ends (any outcome) leaves no snap behind.
  React.useEffect((): void => {
    if (!isLiveDragging && snappedRef.current != null) {
      snappedRef.current = null;
      setSnappedTarget(null);
    }
  }, [isLiveDragging]);
  // During a live drag the structural layout containers go `overflow-visible`
  // so reflowing leaves are not clipped by their own slot or an ancestor split.
  // Outside a drag, a glide opens them without a render: the leaf motion sets
  // `LEAF_MOTION_ACTIVE_ATTR` on the viewport and the chrome stylesheet lets
  // `.hpt-motion-overflow` out. Only flips the structural divs — the article
  // keeps its own `overflow-hidden`, so pane content never spills.
  const isLeafMotionOverflowWindow: boolean =
    liveDragModeEnabled && dragState.phase === "dragging";
  // The pointer while a live drag holds a pane (window-client px).
  const dragPointer: DragMachinePoint | null =
    dragState.phase === "dragging"
      ? {
          x: dragState.heldFootprint.left + dragState.pointerAnchorOffset.x,
          y: dragState.heldFootprint.top + dragState.pointerAnchorOffset.y,
        }
      : null;
  // Custom drag cursor (tier "c"): a transform-pinned element that REPLACES the
  // OS cursor during a live drag. Gated on the public-API capability flag + live mode;
  // the presentation is derived from the SAME FSM-resolved target the drop
  // preview reads (no second resolution path), so the cursor's
  // arrow/validity always agrees with the drop the release would commit.
  const dragCursorEnabled: boolean =
    liveDragModeEnabled && interactionCapabilities.customCursor;
  const prefersReducedMotion: boolean = usePrefersReducedMotion();
  const prefersReducedMotionRef = React.useRef<boolean>(prefersReducedMotion);
  prefersReducedMotionRef.current = prefersReducedMotion;
  const dragCursorPresentation: DragCursorPresentation = React.useMemo(
    (): DragCursorPresentation =>
      resolveDragCursorPresentation(
        activeResolvedTarget(dragState),
        activeDragSourceLeafId(dragState) ?? "",
      ),
    [dragState],
  );
  const isCustomCursorActive: boolean =
    dragCursorEnabled && dragPointer != null;
  // Leaf motion lifecycle: one motion per renderer on the shared frame loop
  // (created in the browser only; a server render never gets here).
  leafMotionSnapRef.current = !dragAnimationEnabled;
  React.useLayoutEffect((): (() => void) => {
    const readReducedMotion: () => boolean = readPrefersReducedMotion();
    const motion: LeafMotion = createLeafMotion({
      loop: leafMotionFrameLoop(),
      omega: leafMotionOmega,
      reducedMotion: (): boolean =>
        leafMotionSnapRef.current || readReducedMotion(),
      onWrite: (
        frames: ReadonlyArray<LeafMotionFrame>,
        tick: LeafMotionTick,
      ): void => {
        for (const frame of frames) {
          const wrapper: HTMLElement | undefined =
            leafWrappersRef.current.get(frame.id);
          if (wrapper != null) {
            writeLeafMotionFrame(wrapper, frame);
            writeGroupStripMotion(wrapper, frame);
          }
          // The dropped pane comes down once its drop settle has ended.
          if (
            !frame.moving &&
            frame.id === raisedTileIdRef.current &&
            controller.getState().drag.phase === "idle"
          ) {
            raisedTileIdRef.current = null;
            setRaisedTileId(null);
          }
        }
        reportLeafMotionProbe(tick, motion.omega);
      },
      onActiveChange: (active: boolean): void => {
        const viewport: HTMLDivElement | null = viewportRef.current;
        if (viewport == null) {
          return;
        }
        if (active) {
          viewport.setAttribute(LEAF_MOTION_ACTIVE_ATTR, "");
        } else {
          viewport.removeAttribute(LEAF_MOTION_ACTIVE_ATTR);
        }
      },
    });
    leafMotionRef.current = motion;
    return (): void => {
      motion.dispose();
      if (leafMotionRef.current === motion) {
        leafMotionRef.current = null;
      }
      for (const wrapper of leafWrappersRef.current.values()) {
        clearLeafMotion(wrapper);
      }
      leafWrappersRef.current = new Map<string, HTMLElement>();
      leafMotionContainerSizeRef.current = null;
      viewportRef.current?.removeAttribute(LEAF_MOTION_ACTIVE_ATTR);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Every layout change glides. After EVERY commit (layout effect, before
  // paint) each shown leaf's LAYOUT rect — from offset geometry, so a glide in
  // flight never leaks into it — becomes its target: a known leaf launches from
  // where it is drawn, a new one appears there (popping in when it opened into
  // an existing layout), a leaf under an active divider drag is held 1:1, a
  // lifted pane is held where the pointer is, and a resized container snaps
  // everything. `flush()` draws the leaves before this paint, so the new
  // layout never shows for a frame before the glide starts.
  React.useLayoutEffect((): void => {
    const motion: LeafMotion | null = leafMotionRef.current;
    const container: HTMLDivElement | null = viewportRef.current;
    if (motion == null || container == null) {
      return;
    }
    motion.configure({ omega: leafMotionOmega });
    const previousSize: { width: number; height: number } | null =
      leafMotionContainerSizeRef.current;
    const size: { width: number; height: number } = {
      width: container.offsetWidth,
      height: container.offsetHeight,
    };
    leafMotionContainerSizeRef.current = size;
    const resized: boolean =
      previousSize != null &&
      (previousSize.width !== size.width ||
        previousSize.height !== size.height);
    const held: boolean = resizeState != null;
    const previousWrappers: Map<string, HTMLElement> = leafWrappersRef.current;
    const wrappers: Map<string, HTMLElement> = new Map<string, HTMLElement>();
    for (const element of Array.from(
      container.querySelectorAll<HTMLElement>("[data-hpt-leaf]"),
    )) {
      // A workspace-transition snapshot (a clone of the old view inside the
      // viewport) is a picture, not panes.
      if (element.closest(`[${WORKSPACE_TRANSITION_LAYER_ATTR}]`) != null) {
        continue;
      }
      const leafId: string | null = element.getAttribute("data-hpt-leaf");
      if (leafId != null && !wrappers.has(leafId)) {
        wrappers.set(leafId, element);
      }
    }
    // A wrapper element now showing another leaf (or gone) drops what was
    // drawn on it for the previous one.
    for (const [leafId, element] of previousWrappers) {
      if (wrappers.get(leafId) !== element) {
        clearLeafMotion(element);
      }
    }
    leafWrappersRef.current = wrappers;
    const firstSync: boolean = previousSize == null;
    let anyKnownStays: boolean = false;
    for (const leafId of wrappers.keys()) {
      if (motion.has(leafId)) {
        anyKnownStays = true;
        break;
      }
    }
    const seen: Set<string> = new Set<string>();
    for (const [leafId, element] of wrappers) {
      // The lifted pane's fixed layer is laid out at its lift rect; offset
      // geometry cannot see through `position: fixed`, so that rect is read
      // from the lift, not measured.
      const liftedRect: TilingRect | null =
        element.closest("[data-hpt-lifted]") != null
          ? (liftGeometryRef.current?.leafRect ?? null)
          : null;
      if (liftedRect != null) {
        placeLiftedLayer();
      }
      const rect = liftedRect ?? measureLeafLayoutRect(element, container);
      if (rect == null) {
        continue;
      }
      seen.add(leafId);
      const known: boolean = motion.has(leafId);
      if (liftedRect != null) {
        // The lifted pane: laid out where it was picked up, drawn where the
        // pointer holds it (or settling toward it in the snap preview).
        if (!known) {
          motion.jump(leafId, rect);
        }
        const pointer: DragMachinePoint | null = lastDragClientPointRef.current;
        if (pointer != null) {
          placeHeldPane(pointer, false);
        }
      } else if (held) {
        motion.hold(leafId, rect);
      } else if (!known || firstSync || resized) {
        motion.jump(leafId, rect);
        // A leaf that opens into a layout that stays pops in; a whole new set
        // (first mount, a workspace switch) just appears.
        if (!known && !firstSync && anyKnownStays) {
          motion.open(leafId);
        }
      } else {
        motion.target(leafId, rect);
      }
    }
    motion.retain(seen);
    motion.flush();
    // A drop that needed no settle (already in place, or snapping under
    // reduced motion) brings the raised pane down right away.
    const raised: string | null = raisedTileIdRef.current;
    if (
      raised != null &&
      controller.getState().drag.phase === "idle" &&
      motion.frame(raised)?.moving !== true
    ) {
      raisedTileIdRef.current = null;
      setRaisedTileId(null);
    }
  });
  // Hit-test footprints for pointer-capture target resolution. In live mode the
  // displayed base is the gap-closed tree (source detached), so resolve against
  // THOSE positions (stable per source — derived once on pickup, never from the
  // reflowing candidate, so there is no moving-target feedback loop). In preview
  // mode the tree is unchanged, so resolve against the original footprints. The
  // memo deps are exactly the stable-reference inputs (layout / source / viewport
  // / config) — `dropState`/candidate is deliberately ABSENT, so reflow cannot
  // shift the hit geometry. See `resolveStableDragHitFootprints`.
  const liveHitFootprintsById: ReadonlyMap<string, TilingPaneFootprint> =
    React.useMemo(
      (): ReadonlyMap<string, TilingPaneFootprint> =>
        resolveStableDragHitFootprints(
          liveDragModeEnabled,
          layout,
          dragSourceLeafId,
          viewportSize,
          config,
          leafFootprintsById,
          dragSubject,
        ),
      [
        config,
        dragSourceLeafId,
        dragSubject,
        layout,
        leafFootprintsById,
        liveDragModeEnabled,
        viewportSize,
      ],
    );
  const projectedLandingOverlays: ReadonlyArray<TilingProjectedLandingOverlay> =
    React.useMemo(
      (): ReadonlyArray<TilingProjectedLandingOverlay> =>
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
    TilingPaneHitZoneOverlayDebugState
  > = React.useMemo((): ReadonlyMap<
    string,
    TilingPaneHitZoneOverlayDebugState
  > => {
    if (!showPaneHitZones || !isRearrangeEnabled) {
      return new Map<string, TilingPaneHitZoneOverlayDebugState>();
    }
    const hitZoneSourceLeafId: string | null =
      dragSourceLeafId ??
      paneHitZoneSourceLeafId ??
      activeFocusedLeafId ??
      null;
    const hitZoneByLeafId: Map<string, TilingPaneHitZoneOverlayDebugState> =
      new Map<string, TilingPaneHitZoneOverlayDebugState>();
    for (const leafId of leafIds) {
      // A statically-gated leaf is not a drop participant — no hit zones for it.
      if (rearrangeGatedLeafIds.has(leafId)) {
        continue;
      }
      const targetFootprint: TilingPaneFootprint | undefined =
        leafFootprintsById.get(leafId);
      if (targetFootprint == null) {
        continue;
      }
      const hitZoneDiagnostics: TilingDropIntentHitZoneDiagnostics =
        resolveDropIntentHitZoneDiagnostics({
          paneSize: {
            width: targetFootprint.width,
            height: targetFootprint.height,
          },
          geometryConfig: currentGeometryConfig(
            interactionCapabilities.dropHitZoneGeometry,
          ),
          evaluateZone: (
            zone: TilingLeafDropZone,
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
      const edgeCandidates: ReadonlyArray<TilingPaneHitZoneCandidateDebugState> =
        hitZoneDiagnostics.edgeZones.map(
          (edgeZoneDiagnostic): TilingPaneHitZoneCandidateDebugState => ({
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
        landingLeafId,
        leafFootprintsById,
        viewportElement: viewportRef.current,
      }),
    );
  }, [
    dragSourceLeafId,
    landingLeafId,
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
      controller.setFocus(null);
      return;
    }
    const firstLeafId: string = leafIds[0];
    controller.setFocus(firstLeafId);
    onFocusedLeafChange?.(firstLeafId);
  }, [activeFocusedLeafId, controller, leafIds, onFocusedLeafChange]);

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

  const cancelLayoutIdleSettle = React.useCallback((): void => {
    if (layoutIdleSettleHandleRef.current != null) {
      WINDOW_SCHEDULER_PORT.clearTimer(layoutIdleSettleHandleRef.current);
      layoutIdleSettleHandleRef.current = null;
    }
  }, []);

  /**
   * Commit-time layout reconciliation — demote unfit pins, clamp ratios, ensure
   * panes+gutters fill the viewport. Emits through `commitLayoutChange` only
   * when the tree actually changes (idempotent when already reconciled) so a
   * normalize-time collapse flip still surfaces via `onPaneCollapsedChange`.
   */
  const commitNormalizedLayout = React.useCallback(
    (tree: TilingLayoutNode): TilingLayoutNode => {
      const normalized: TilingLayoutNode = normalizeLayout(tree, {
        containerWidthPx: viewportSizeRef.current.width,
        containerHeightPx: viewportSizeRef.current.height,
        config: configRef.current,
        expectedTileIds: expectedTileIdsRef.current,
      });
      if (normalized !== tree) {
        commitLayoutChange(normalized);
      }
      return normalized;
    },
    [commitLayoutChange],
  );

  const armLayoutIdleSettle = React.useCallback((): void => {
    cancelLayoutIdleSettle();
    layoutIdleSettleHandleRef.current = WINDOW_SCHEDULER_PORT.setTimer(
      (): void => {
        layoutIdleSettleHandleRef.current = null;
        // Skip while a resize gesture is live — commit-time normalize on pointerup
        // is authoritative; idle settle is the belt-and-suspenders path.
        if (
          resizeStateRef.current != null ||
          resizeRafHandleRef.current != null ||
          pendingResizeRatioRef.current != null
        ) {
          return;
        }
        commitNormalizedLayout(layoutRef.current);
      },
      LAYOUT_RECONCILE_IDLE_MS,
    );
  }, [cancelLayoutIdleSettle, commitNormalizedLayout]);

  // Integrity settle: heal missing/duplicate host tiles and (in dev) fill-slack
  // voids so a poison controlled tree cannot stick after load or a missed commit.
  React.useEffect((): void => {
    if (viewportSize.width <= 1 || viewportSize.height <= 1) {
      return;
    }
    // Avoid fighting an in-flight resize or rearrange gesture.
    if (resizeState != null || dragState.phase !== "idle") {
      return;
    }
    const tileCoverageBroken: boolean =
      expectedTileIds.length > 0 &&
      !layoutCoversExpectedTiles(layout, expectedTileIds);
    const isDev: boolean =
      typeof process !== "undefined" &&
      process.env != null &&
      process.env.NODE_ENV !== "production";
    let fillSlackBroken: boolean = false;
    if (isDev) {
      const slackPx: number = measureLayoutFillSlackPx(layout, {
        containerWidthPx: viewportSize.width,
        containerHeightPx: viewportSize.height,
        config,
      });
      fillSlackBroken = slackPx >= LAYOUT_FILL_SLACK_TOLERANCE_PX;
      if (fillSlackBroken) {
        console.warn(
          `[hypr-tiling] layout fill invariant violated (slack=${slackPx.toFixed(2)}px); forcing normalizeLayout`,
        );
      }
    }
    if (!tileCoverageBroken && !fillSlackBroken) {
      return;
    }
    if (tileCoverageBroken && isDev) {
      console.warn(
        "[hypr-tiling] layout tile coverage broken vs host tiles; forcing normalizeLayout",
      );
    }
    commitNormalizedLayout(layout);
  }, [
    commitNormalizedLayout,
    config,
    dragState.phase,
    expectedTileIds,
    layout,
    resizeState,
    viewportSize.height,
    viewportSize.width,
  ]);

  React.useEffect((): (() => void) | void => {
    if (resizeState == null) {
      return;
    }

    const takePendingResizeTree = (): TilingLayoutNode => {
      if (resizeRafHandleRef.current != null) {
        WINDOW_SCHEDULER_PORT.cancelFrame(resizeRafHandleRef.current);
        resizeRafHandleRef.current = null;
      }
      const pendingRatio: number | null = pendingResizeRatioRef.current;
      pendingResizeRatioRef.current = null;
      if (pendingRatio == null) {
        return layoutRef.current;
      }
      // Apply locally so commit-time normalize sees the flushed ratio even
      // before React re-renders `layout` / refreshes `layoutRef`.
      return updateSplitRatio(
        layoutRef.current,
        resizeState.splitId,
        pendingRatio,
      );
    };

    const scheduleResizeRatio = (nextRatio: number): void => {
      pendingResizeRatioRef.current = nextRatio;
      if (resizeRafHandleRef.current != null) {
        return;
      }
      resizeRafHandleRef.current = WINDOW_SCHEDULER_PORT.requestFrame(
        (): void => {
          resizeRafHandleRef.current = null;
          const pendingRatio: number | null = pendingResizeRatioRef.current;
          pendingResizeRatioRef.current = null;
          if (pendingRatio == null) {
            return;
          }
          commitLayoutChange(
            updateSplitRatio(
              layoutRef.current,
              resizeState.splitId,
              pendingRatio,
            ),
          );
          armLayoutIdleSettle();
        },
      );
    };

    const handlePointerMove = (event: PointerEvent): void => {
      const deltaPx: number =
        resizeState.axis === "horizontal"
          ? event.clientX - resizeState.startPointerPx
          : event.clientY - resizeState.startPointerPx;
      const nextRatio: number = clampByMinSize(
        resizeState.startRatio + deltaPx / resizeState.containerSizePx,
        resizeState.containerSizePx,
        resizeState.gapPx,
        resizeState.firstMinPaneSizePx,
        resizeState.secondMinPaneSizePx,
        resizeState.ratioSafetyBounds,
      );
      scheduleResizeRatio(nextRatio);
    };

    const endResize = (): void => {
      const flushedTree: TilingLayoutNode = takePendingResizeTree();
      // Commit-time reconciliation is mandatory on every resize end edge.
      // Always emit the reconciled tree (covers a flushed mid-frame ratio).
      const normalized: TilingLayoutNode = normalizeLayout(flushedTree, {
        containerWidthPx: viewportSizeRef.current.width,
        containerHeightPx: viewportSizeRef.current.height,
        config: configRef.current,
        expectedTileIds: expectedTileIdsRef.current,
      });
      commitLayoutChange(normalized);
      armLayoutIdleSettle();
      setResizeState(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", endResize);
    window.addEventListener("pointercancel", endResize);
    window.addEventListener("lostpointercapture", endResize);

    return (): void => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endResize);
      window.removeEventListener("pointercancel", endResize);
      window.removeEventListener("lostpointercapture", endResize);
      // Effect cleanup must NOT end the gesture (layout identity changes no
      // longer rebind this effect). Cancel only a stray coalesced frame so a
      // torn-down subscription cannot leak a rAF into the next gesture.
      if (resizeRafHandleRef.current != null) {
        WINDOW_SCHEDULER_PORT.cancelFrame(resizeRafHandleRef.current);
        resizeRafHandleRef.current = null;
      }
    };
  }, [armLayoutIdleSettle, commitLayoutChange, resizeState]);

  React.useEffect((): (() => void) => {
    return (): void => {
      cancelLayoutIdleSettle();
      if (resizeRafHandleRef.current != null) {
        WINDOW_SCHEDULER_PORT.cancelFrame(resizeRafHandleRef.current);
        resizeRafHandleRef.current = null;
      }
    };
  }, [cancelLayoutIdleSettle]);

  // Both-collapsed-siblings void escape (HT-PANE-COLLAPSE-VOID): the divider
  // between two collapsed siblings stays interactive (see `isBoundaryResizable`
  // below) specifically so pressing/nudging it can un-collapse BOTH — a ratio
  // drag has no live geometry effect while both sides are pinned to their
  // collapse extent, so the escape action IS the expand, not a resize. Both
  // expands are composed against the SAME base `layout` and committed with ONE
  // `commitLayoutChange` (two sequential single-leaf collapse calls would each
  // read the same pre-update `layout` from this render's closure and the
  // second call would clobber the first) — `commitLayoutChange`'s diff reports
  // both leaves' collapse flips, no explicit event needed here.
  const expandBothCollapsedVoidSiblings = React.useCallback(
    (firstLeafId: string, secondLeafId: string): void => {
      if (!isCollapseEnabled) {
        return;
      }
      const collapsedExtentPx: number =
        config.collapsedExtentPx ?? TILING_DEFAULT_COLLAPSED_EXTENT_PX;
      const next: TilingLayoutNode = setLeafCollapsed(
        setLeafCollapsed(layout, firstLeafId, false, collapsedExtentPx),
        secondLeafId,
        false,
        collapsedExtentPx,
      );
      if (next === layout) {
        return;
      }
      commitLayoutChange(next);
    },
    [config.collapsedExtentPx, isCollapseEnabled, layout, commitLayoutChange],
  );

  const beginResize = React.useCallback(
    (
      event: React.PointerEvent<HTMLDivElement>,
      node: TilingSplitNode,
      resolvedGapPx: number,
      firstMinPaneSizePx: number,
      secondMinPaneSizePx: number,
      ratioSafetyBounds: RatioSafetyBounds,
      handleSizePx: number,
      bothCollapsedVoidLeafIds: readonly [string, string] | null,
    ): void => {
      if (!isResizeAxisEnabled(interactionCapabilities.resize, node.axis)) {
        return;
      }
      event.preventDefault();
      // Both-collapsed-siblings void (HT-PANE-COLLAPSE-VOID): pressing the
      // divider un-collapses both instead of starting a ratio drag — see
      // `expandBothCollapsedVoidSiblings`.
      if (bothCollapsedVoidLeafIds != null) {
        expandBothCollapsedVoidSiblings(
          bothCollapsedVoidLeafIds[0],
          bothCollapsedVoidLeafIds[1],
        );
        return;
      }
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
      // Store the full boundary gutter in `gapPx` so live clamp matches the
      // divider/flexBasis reservation (gapPx + handleSizePx).
      const boundaryGutterPx: number = splitBoundaryGutterPx(
        resolvedGapPx,
        handleSizePx,
      );
      const boundedRatio: number = clampByMinSize(
        node.ratio,
        containerSizePx,
        boundaryGutterPx,
        firstMinPaneSizePx,
        secondMinPaneSizePx,
        ratioSafetyBounds,
      );

      setResizeState({
        splitId: node.id,
        axis: node.axis,
        containerSizePx,
        startPointerPx,
        startRatio: boundedRatio,
        gapPx: boundaryGutterPx,
        firstMinPaneSizePx,
        secondMinPaneSizePx,
        ratioSafetyBounds,
      });

      if (
        event.currentTarget.setPointerCapture != null &&
        isPointerLikeEvent(event.nativeEvent)
      ) {
        event.currentTarget.setPointerCapture(event.nativeEvent.pointerId);
      }
    },
    [expandBothCollapsedVoidSiblings, interactionCapabilities.resize],
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
      node: TilingSplitNode,
      containerSizePx: number,
      resolvedGapPx: number,
      firstMinPaneSizePx: number,
      secondMinPaneSizePx: number,
      ratioSafetyBounds: RatioSafetyBounds,
      bothCollapsedVoidLeafIds: readonly [string, string] | null,
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
      // Both-collapsed-siblings void (HT-PANE-COLLAPSE-VOID): nudging the
      // divider un-collapses both instead of stepping a ratio with no live
      // geometry effect while both sides are pinned to their collapse extent.
      if (bothCollapsedVoidLeafIds != null) {
        expandBothCollapsedVoidSiblings(
          bothCollapsedVoidLeafIds[0],
          bothCollapsedVoidLeafIds[1],
        );
        return;
      }
      const boundedSizePx: number = containerSizePx > 1 ? containerSizePx : 1;
      const boundaryGutterPx: number = splitBoundaryGutterPx(
        resolvedGapPx,
        config.handleSizePx,
      );
      const clampedRatio: number = clampByMinSize(
        nextRatio,
        boundedSizePx,
        boundaryGutterPx,
        firstMinPaneSizePx,
        secondMinPaneSizePx,
        ratioSafetyBounds,
      );
      commitLayoutChange(updateSplitRatio(layout, node.id, clampedRatio));
    },
    [
      config.handleSizePx,
      expandBothCollapsedVoidSiblings,
      interactionCapabilities.resize,
      layout,
      commitLayoutChange,
    ],
  );

  const setFocusedLeaf = React.useCallback(
    (leafId: string): void => {
      if (!isFocusSelectionEnabled) {
        return;
      }
      controller.updateFocusHistory(
        (history: FocusHistory): FocusHistory =>
          pushFocusHistory(history, leafId),
      );
      controller.setFocus(leafId);
      onFocusedLeafChange?.(leafId);
    },
    [controller, isFocusSelectionEnabled, onFocusedLeafChange],
  );

  // Empty the multi-selection. A no-op (same reference) when already empty so a
  // clear-on-every-interaction wiring never schedules a pointless re-render.
  const clearMultiSelection = React.useCallback((): void => {
    controller.setMultiSelect(
      (current: ReadonlySet<string>): ReadonlySet<string> =>
        current.size === 0 ? current : new Set<string>(),
    );
  }, [controller]);

  // Toggle one pane in/out of the multi-selection set (Alt/Opt+click). A no-op
  // when the feature is disabled. Does NOT touch focus — multi-selection and the
  // single-focus pane are orthogonal.
  const toggleMultiSelect = React.useCallback(
    (leafId: string): void => {
      if (!isMultiSelectGroupingEnabled) {
        return;
      }
      controller.setMultiSelect(
        (current: ReadonlySet<string>): ReadonlySet<string> =>
          toggleLeafMultiSelection(current, leafId),
      );
    },
    [controller, isMultiSelectGroupingEnabled],
  );

  const setMaximizedLeaf = React.useCallback(
    (nextLeafId: string | null): void => {
      if (!isMaximizeEnabled) {
        return;
      }
      controller.setMaximize(nextLeafId);
      onMaximizedLeafChange?.(nextLeafId);
    },
    [controller, isMaximizeEnabled, onMaximizedLeafChange],
  );

  const toggleMaximizeLeaf = React.useCallback(
    (leafId: string): void => {
      setMaximizedLeaf(resolveMaximizeToggle(activeMaximizedLeafId, leafId));
    },
    [activeMaximizedLeafId, setMaximizedLeaf],
  );

  // Collapse-to-titlebar (HT-PANE-COLLAPSE, axis-aware). Collapse pins the
  // leaf's dimension ALONG its immediate parent split's axis (height under a
  // stacked/vertical parent, width under a side-by-side/horizontal parent) to
  // the resolved chrome extent (`config.collapsedExtentPx` →
  // `TILING_DEFAULT_COLLAPSED_EXTENT_PX`) and remembers its prior sizing; expand
  // restores it. The layout edit flows through `commitLayoutChange` (controlled
  // `onLayoutChange` + collapse-diff `onPaneCollapsedChange`, see above) so a
  // host can react (e.g. retitle the pane) — including for any OTHER leaf the
  // normalize pass silently flips alongside the one explicitly targeted here.
  // Gated by `paneTitleBarControls.collapse`.
  const resolvedCollapsedExtentPx: number =
    config.collapsedExtentPx ?? TILING_DEFAULT_COLLAPSED_EXTENT_PX;
  const setLeafCollapsedState = React.useCallback(
    (targetLeafId: string, collapsed: boolean): void => {
      if (!isCollapseEnabled) {
        return;
      }
      const next: TilingLayoutNode = setLeafCollapsed(
        layout,
        targetLeafId,
        collapsed,
        resolvedCollapsedExtentPx,
      );
      if (next === layout) {
        return;
      }
      commitLayoutChange(next);
    },
    [isCollapseEnabled, layout, commitLayoutChange, resolvedCollapsedExtentPx],
  );
  const toggleCollapseLeaf = React.useCallback(
    (targetLeafId: string): void => {
      if (!isCollapseEnabled) {
        return;
      }
      const next: TilingLayoutNode = toggleLeafCollapsed(
        layout,
        targetLeafId,
        resolvedCollapsedExtentPx,
      );
      if (next === layout) {
        return;
      }
      commitLayoutChange(next);
    },
    [isCollapseEnabled, layout, commitLayoutChange, resolvedCollapsedExtentPx],
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
  // latest selection off the controller store so the document keyup listener
  // need not re-subscribe on every highlight advance.
  const commitPaneSwitcherSelection = React.useCallback((): void => {
    const switcherState: TilingPaneSwitcherState | null =
      controller.getState().switcher;
    if (switcherState != null) {
      activateLeaf(commitPaneSwitcher(switcherState));
    }
    controller.setSwitcher(null);
  }, [activateLeaf, controller]);

  const cancelPaneSwitcher = React.useCallback((): void => {
    controller.setSwitcher(null);
  }, [controller]);

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
  const enterMoveMode = React.useCallback(
    (sourceLeafId: string): void => {
      controller.setMoveMode({
        sourceLeafId,
        targetLeafId: null,
        placement: null,
      });
    },
    [controller],
  );

  const cancelMoveMode = React.useCallback((): void => {
    controller.setMoveMode(null);
  }, [controller]);

  const aimMoveMode = React.useCallback(
    (direction: TilingFocusDirection): void => {
      controller.setMoveMode(
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
    [controller, layout, rearrangeGatedLeafIds],
  );

  const commitMoveMode = React.useCallback((): void => {
    const current: TilingMoveModeState | null = controller.getState().moveMode;
    controller.setMoveMode(null);
    if (
      current == null ||
      current.targetLeafId == null ||
      current.placement == null
    ) {
      return;
    }
    // A pane in a tab group moves the whole group, as its title bar drags it.
    const sourceGroup: TilingGroupNode | null = findGroupContainingLeaf(
      layout,
      current.sourceLeafId,
    );
    const nextLayout: TilingLayoutNode =
      sourceGroup != null && sourceGroup.members.length >= 2
        ? insertGroupAdjacent(
            layout,
            sourceGroup.id,
            current.targetLeafId,
            current.placement,
          )
        : insertLeafAdjacent(
            layout,
            current.sourceLeafId,
            current.targetLeafId,
            current.placement,
          );
    commitLayoutChange(
      normalizeLayout(nextLayout, {
        containerWidthPx: viewportSizeRef.current.width,
        containerHeightPx: viewportSizeRef.current.height,
        config: configRef.current,
        expectedTileIds: expectedTileIdsRef.current,
      }),
    );
    armLayoutIdleSettle();
    setFocusedLeaf(current.sourceLeafId);
  }, [armLayoutIdleSettle, controller, layout, commitLayoutChange, setFocusedLeaf]);

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
    (
      command: TilingCommand,
      via: TilingWorkspaceCommandDispatchVia = "command",
    ): boolean => {
      if (!isCommandEnabled(command, commandGates)) {
        return false;
      }
      if (isWorkspaceNavigationCommand(command)) {
        return onWorkspaceCommand?.(command, via) ?? false;
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
            controller.getFocusHistory(),
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
          if (controller.getState().moveMode == null) {
            return false;
          }
          aimMoveMode(command.direction);
          return true;
        }
        case "commit-move-mode": {
          if (controller.getState().moveMode == null) {
            return false;
          }
          commitMoveMode();
          return true;
        }
        case "cancel-move-mode": {
          if (controller.getState().moveMode == null) {
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
          commitLayoutChange(
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
          commitLayoutChange(
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
        case "toggle-collapse": {
          const id: string | null = command.leafId ?? activeFocusedLeafId;
          if (id == null || findLeafById(layout, id) == null) {
            return false;
          }
          toggleCollapseLeaf(id);
          return true;
        }
        case "set-collapsed": {
          const id: string | null = command.leafId ?? activeFocusedLeafId;
          if (id == null || findLeafById(layout, id) == null) {
            return false;
          }
          setLeafCollapsedState(id, command.collapsed);
          return true;
        }
        case "set-split-ratio": {
          commitLayoutChange(
            updateSplitRatio(layout, command.splitId, command.ratio),
          );
          return true;
        }
        case "toggle-split-axis": {
          commitLayoutChange(toggleSplitAxis(layout, command.splitId));
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
          let next: TilingLayoutNode = layout;
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
              let workingLayout: TilingLayoutNode = layout;
              const targetSplit: TilingSplitNode | undefined =
                collectSplitNodes(workingLayout).find(
                  (split: TilingSplitNode): boolean =>
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
          commitLayoutChange(next);
          return true;
        }
        case "group-leaves": {
          const next: TilingLayoutNode = groupLeaves(layout, command.leafIds, {
            hostLeafId: command.hostLeafId,
          });
          if (next === layout) {
            return false;
          }
          commitLayoutChange(next);
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
            const next: TilingLayoutNode = ungroupNode(
              layout,
              existingGroup.id,
            );
            if (next === layout) {
              return false;
            }
            commitLayoutChange(next);
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
          const next: TilingLayoutNode = groupLeaves(layout, [
            focusLeafId,
            neighborId,
          ]);
          if (next === layout) {
            return false;
          }
          commitLayoutChange(next);
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
          const next: TilingLayoutNode = ungroupNode(layout, groupId);
          if (next === layout) {
            return false;
          }
          commitLayoutChange(next);
          return true;
        }
        case "add-to-group": {
          const next: TilingLayoutNode = addLeafToGroup(
            layout,
            command.groupId,
            command.sourceLeafId,
          );
          if (next === layout) {
            return false;
          }
          commitLayoutChange(next);
          return true;
        }
        case "remove-from-group": {
          const next: TilingLayoutNode = removeMemberFromGroup(
            layout,
            command.groupId,
            command.memberId,
          );
          if (next === layout) {
            return false;
          }
          commitLayoutChange(next);
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
          const next: TilingLayoutNode = cycleActiveGroupMember(
            layout,
            groupId,
            command.direction,
          );
          if (next === layout) {
            return false;
          }
          commitLayoutChange(next);
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
          const next: TilingLayoutNode = setActiveGroupMember(
            layout,
            groupId,
            memberId,
          );
          if (next === layout) {
            return false;
          }
          commitLayoutChange(next);
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
      controller,
      enterMoveMode,
      focusLeafElement,
      isLeafRearrangeEligible,
      layout,
      onWorkspaceCommand,
      commitLayoutChange,
      setFocusedLeaf,
      setLeafSizingFromBbox,
      setLeafCollapsedState,
      toggleCollapseLeaf,
      setMaximizedLeaf,
      toggleMaximizeLeaf,
      leafIds,
    ],
  );

  // Whether the current multi-selection can be folded into one group right now
  // (≥2 selected AND `group-leaves` would change the layout under the grouping
  // op's anchor/sibling constraint). Drives whether the selected panes offer the
  // Group control. Recomputes only when the layout, the selection, or the
  // feature gate changes.
  const canGroupMultiSelectionNow: boolean = React.useMemo(
    (): boolean =>
      isMultiSelectGroupingEnabled &&
      canGroupMultiSelection(layout, multiSelectedLeafIds),
    [isMultiSelectGroupingEnabled, layout, multiSelectedLeafIds],
  );

  // Fold the multi-selection into one group via the EXISTING `group-leaves`
  // command, then clear the selection — but ONLY on a successful group (the
  // router returns `true`). Reuses the SAME router as the keyboard `Alt+G` /
  // imperative `dispatch` path; the grouping capability gate still applies.
  const groupMultiSelection = React.useCallback(
    (clickedLeafId?: string): boolean => {
      if (!isMultiSelectGroupingEnabled) {
        return false;
      }
      const selection: ReadonlySet<string> = controller.getState().multiSelect;
      // Host slot: the clicked pane (header Group button) when supplied; else
      // (Alt+G, no click target) the focused pane if it is in the selection,
      // else the first-selected pane.
      const hostLeafId: string | null = resolveMultiSelectGroupHost(
        selection,
        clickedLeafId ?? null,
        activeFocusedLeafId,
      );
      const command: TilingCommand | null = resolveMultiSelectGroupCommand(
        selection,
        hostLeafId,
      );
      if (command == null) {
        return false;
      }
      if (dispatchCommand(command)) {
        clearMultiSelection();
        return true;
      }
      return false;
    },
    [
      activeFocusedLeafId,
      clearMultiSelection,
      controller,
      dispatchCommand,
      isMultiSelectGroupingEnabled,
    ],
  );

  // Prune the multi-selection whenever a selected pane leaves the outer-slot
  // leaf set (e.g. it was grouped away, removed, or folded into a group), so a
  // vanished pane never lingers selected or re-highlights if its id reappears.
  React.useEffect((): void => {
    controller.setMultiSelect(
      (current: ReadonlySet<string>): ReadonlySet<string> =>
        pruneMultiSelection(current, leafIds),
    );
  }, [controller, leafIds]);

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
      if (controller.getState().switcher != null && event.code === "Escape") {
        preventDefault();
        cancelPaneSwitcher();
        return;
      }
      // Move mode is modal: while it is open, Escape cancels, bare Enter commits
      // (`insertLeafAdjacent`), the focus-direction bindings aim the destination,
      // and every other key is swallowed so the move stays predictable.
      if (controller.getState().moveMode != null) {
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
      // Multi-selection is a transient mode: Escape cancels it (and consumes the
      // press) before the general keymap path, so a stray selection clears
      // without also triggering an unrelated Escape binding (e.g. restore).
      if (
        event.code === "Escape" &&
        controller.getState().multiSelect.size > 0
      ) {
        preventDefault();
        clearMultiSelection();
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
        if (dispatchCommand(customCommand, "key")) {
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
        if (showSwitcherOverlay && chordRequiresModifier(cycleChord)) {
          const holdModifiers = {
            alt: cycleChord.alt,
            ctrl: cycleChord.ctrl,
            meta: cycleChord.meta,
            shift: cycleChord.shift,
          };
          const currentSwitcherState: TilingPaneSwitcherState | null =
            controller.getState().switcher;
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
            controller.setSwitcher(opened);
            return;
          }
          preventDefault();
          controller.setSwitcher(
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
          controller.getState().switcher;
        if (showSwitcherOverlay && currentSwitcherState != null) {
          const nextSwitcherState: TilingPaneSwitcherState = jumpPaneSwitcher(
            leafIds,
            currentSwitcherState,
            action.paneNumber,
          );
          preventDefault();
          controller.setSwitcher(nextSwitcherState);
          return;
        }
        if (
          dispatchCommand({ kind: "focus-jump", paneNumber: action.paneNumber })
        ) {
          preventDefault();
        }
        return;
      }
      // Alt+G (`toggle-group`) is rebound to the multi-selection grouping action
      // whenever the feature is live: it folds the CURRENTLY multi-selected
      // panes into one tabbed group via the SAME `group-leaves` path the header
      // Group button uses (`groupMultiSelection`), then clears the selection.
      // With an empty selection it is a deliberate NO-OP — it does NOT fall back
      // to the legacy focused+neighbor `toggle-group`. When the feature is off
      // (`multiSelectGrouping` / `grouping` disabled) it falls through to the
      // legacy command below, so consumers without multi-select grouping keep
      // their original Alt+G toggle.
      if (action.kind === "toggle-group" && isMultiSelectGroupingEnabled) {
        if (groupMultiSelection()) {
          preventDefault();
        }
        return;
      }
      // Every other fixed-keymap action bridges to a command and routes through
      // the SAME router (no duplicated action logic). `preventDefault` only
      // fires when the command produced an effect, preserving browser-grace for
      // a no-op (e.g. restore with nothing maximized, focus-direction at an edge).
      if (dispatchCommand(keyboardActionToCommand(action), "key")) {
        preventDefault();
      }
    },
    [
      activeFocusedLeafId,
      aimMoveMode,
      cancelMoveMode,
      cancelPaneSwitcher,
      commitMoveMode,
      controller,
      dispatchCommand,
      interactionCapabilities.keyBindings,
      isFocusSelectionEnabled,
      isMaximizeEnabled,
      isPaneSwitchingEnabled,
      isRearrangeEnabled,
      showSwitcherOverlay,
      keymap,
      leafIds,
      clearMultiSelection,
      isMultiSelectGroupingEnabled,
      groupMultiSelection,
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
      const controllerSnapshot: TilingControllerState = controller.getState();
      const engaged: boolean =
        controllerSnapshot.switcher != null ||
        controllerSnapshot.moveMode != null ||
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
    controller,
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
      controller.setSwitcher(null);
    }
  }, [
    controller,
    isPaneSwitchingEnabled,
    leafIds,
    paneSwitcherState,
    showSwitcherOverlay,
  ]);

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
      controller.setMoveMode(null);
    }
  }, [controller, isLeafRearrangeEligible, leafIds, moveModeState]);

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
      previousTarget: TilingDropState | null,
    ): TilingDropState | null =>
      resolvePointerTargetFromMeasurement(measurementPort, {
        clientX,
        clientY,
        sourceLeafId,
        previousTarget,
        isRearrangeEnabled,
        groupingEnabled: isGroupingEnabled,
        dropHitZoneGeometry: interactionCapabilities.dropHitZoneGeometry,
        liveDragModeEnabled,
        liveHitFootprintsById,
        leafFootprintsById,
        leafIds,
        rearrangeGatedLeafIds,
        layout,
        config,
        viewportSize: {
          width: viewportSize.width,
          height: viewportSize.height,
        },
      }),
    [
      config,
      isRearrangeEnabled,
      isGroupingEnabled,
      interactionCapabilities.dropHitZoneGeometry,
      layout,
      leafFootprintsById,
      leafIds,
      liveDragModeEnabled,
      liveHitFootprintsById,
      rearrangeGatedLeafIds,
      viewportSize.height,
      viewportSize.width,
      measurementPort,
    ],
  );
  // Mirror the latest `resolvePointerTarget` into a ref so the once-created
  // input driver always resolves through the LIVE callback (its identity churns
  // as `layout` / `viewportSize` / capabilities change) without re-creating the
  // driver and losing the in-flight seat/latch state.
  const resolvePointerTargetRef = React.useRef(resolvePointerTarget);
  resolvePointerTargetRef.current = resolvePointerTarget;

  // Populate the interaction controller's host seam now that
  // `resolvePointerTarget` exists. Assigned on every render (identity-stable
  // reads through live refs / the stable pointer-capture port) so the once-
  // created driver always resolves through the LIVE callback without re-creating
  // the driver and losing the in-flight seat/latch. The driver only INVOKES
  // these during an active drag — long after the first render populates the ref.
  controllerHostRef.current = {
    resolveTarget: (
      clientX: number,
      clientY: number,
      sourceLeafId: string,
      previousTarget: TilingDropState | null,
    ): TilingDropState | null => {
      // Snap preview: while the pointer stays in the slot the pane is snapped
      // into, that drop is the target, whatever lies under the pointer in the
      // tree the others closed over.
      const snapped = snappedRef.current;
      if (snapped != null) {
        const point: DragMachinePoint = clientToViewportPoint(
          viewportClientFrame(),
          { x: clientX, y: clientY },
        );
        if (isInsideRect(snapped.slot, point.x, point.y, 0)) {
          return snapped.target;
        }
      }
      return resolvePointerTargetRef.current(
        clientX,
        clientY,
        sourceLeafId,
        previousTarget,
      );
    },
    capturePointer: (pointerId: number): void => {
      // Mirror the captured-id bookkeeping only when the (best-effort) root
      // capture actually ran — the port swallows a thrown/absent capture.
      if (pointerCapturePort.capture(pointerId)) {
        capturedPointerIdRef.current = pointerId;
      }
    },
    getSlotCommitment: () => ({
      mode: slotCommitmentRef.current.mode,
      reresolveDeltaPx: slotCommitmentRef.current.reresolveDeltaPx,
    }),
  };
  // The framework-free FSM input driver (owns the seat/latch cluster + the
  // lifted `processPointerSample` + release-latch pipeline), obtained from the
  // controller.
  const inputDriver: DragInputDriver = controller.input;

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

    // The per-sample pipeline (promote `armed → dragging` past the pickup
    // threshold, resolve the drop target, apply the slot-commitment re-aim
    // damper, mirror the committable seat + decaying fallback) and the release
    // latch are owned by the framework-free `inputDriver`
    // (`engine/input-driver.ts`). The RELEASE path runs `processPointerSample`
    // SYNCHRONOUSLY from the raw `pointerup` coords (`isReleaseSample`) — a fast
    // flick releases in the same task as its `pointermove`s, before the rAF
    // coalescer flushes, so without a synchronous release-time resolve the FSM
    // would still be `armed` (or hold a stale target) and POINTER_UP would
    // settle as a click/cancel, reverting the pane to its origin.

    // Snap preview hysteresis, after each processed sample: the pane snaps
    // into the resolved drop's landing slot once the pointer is well inside it
    // (min(24 px, a quarter of its smaller side)) and stays until the pointer
    // leaves that slot; the others make room meanwhile (the render reads
    // `snappedTarget`).
    const updateSnap = (client: DragMachinePoint): void => {
      const current = snappedRef.current;
      const live: DragMachineState = controller.getState().drag;
      if (dragPreviewRef.current !== "snap" || live.phase !== "dragging") {
        if (current != null) {
          snappedRef.current = null;
          setSnappedTarget(null);
        }
        return;
      }
      const { x, y }: DragMachinePoint = clientToViewportPoint(
        viewportClientFrame(),
        client,
      );
      let next = current != null && isInsideRect(current.slot, x, y, 0) ? current : null;
      if (next == null && live.leftHome) {
        const target: TilingDropState | null = live.resolvedTarget;
        const slot: TilingRect | null = resolveDropLandingRectRef.current(
          live.sourceLeafId,
          target,
        );
        if (
          target != null &&
          slot != null &&
          isInsideRect(
            slot,
            x,
            y,
            Math.min(DRAG_SNAP_INSET_PX, Math.min(slot.width, slot.height) / 4),
          )
        ) {
          next = { target, slot };
        }
      }
      if (next !== current) {
        snappedRef.current = next;
        setSnappedTarget(next?.target ?? null);
      }
    };

    // rAF coalescer: raw `pointermove` coords are buffered and processed at most
    // once per frame (latest wins), decoupling the input frame from the render
    // frame so multiple moves cannot trigger multiple target-resolution +
    // candidate-tree recomputes within one frame. `.cancel()` on teardown drops
    // any pending frame so it can never fire after the drag has settled.
    const coalescer: FrameCoalescer<DragMachinePoint> =
      createFrameCoalescer<DragMachinePoint>(
        (payload: DragMachinePoint): void => {
          inputDriver.processPointerSample(payload);
          updateSnap(payload);
          const phase: DragMachineState = dragStateRef.current;
          applyResolvedExternalDragHover(
            payload,
            phase.phase === "dragging" ? phase.sourceLeafId : null,
          );
        },
        {
          request: WINDOW_SCHEDULER_PORT.requestFrame,
          cancel: WINDOW_SCHEDULER_PORT.cancelFrame,
        },
      );

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
        // target at the held position (over the source pane → null; the pane
        // is held under the finger until it moves onto another pane).
        if (pointerCapturePort.capture(owningPointerId)) {
          capturedPointerIdRef.current = owningPointerId;
        }
        dispatchDrag({ type: "LONG_PRESS", pointerId: owningPointerId });
        // The first-target resolution + seat capture is the SAME tail the
        // threshold-pickup promotion runs — owned by the input driver.
        inputDriver.captureInitialTarget(
          held.sourceLeafId,
          { x: held.originClient.x, y: held.originClient.y },
          owningPointerId,
        );
      }, touchLongPressMsRef.current);
    }

    const handlePointerMove = (event: PointerEvent): void => {
      if (event.pointerId !== owningPointerId) {
        return;
      }
      // Fix B — input-ground the M3 watchdog: re-arm it from RAW pointer input,
      // not only from the `dragState`-keyed effect re-runs. Under CPU throttling
      // the rAF coalescer can fail to flush for longer than the idle budget while
      // pointermoves still arrive; without this the idle deadline would expire and
      // cancel a LIVE drag. `progress()` is cheap (clear + re-arm one timer) and
      // single-armed, so feeding it every raw move keeps a moving-but-frame-
      // starved drag alive — the watchdog now trips only when input genuinely
      // stops. Cheap no-op before the watchdog effect has armed (ref null).
      watchdogRef.current?.progress();
      lastDragClientPointRef.current = { x: event.clientX, y: event.clientY };
      // The lifted pane follows the pointer in the same task as the event
      // (held 1:1, drawn before the next paint), not on the coalesced frame.
      placeHeldPane({ x: event.clientX, y: event.clientY }, true);
      coalescer.schedule({ x: event.clientX, y: event.clientY });
    };
    const handlePointerUp = (event: PointerEvent): void => {
      if (event.pointerId !== owningPointerId) {
        return;
      }
      // Fix A — commit latch (core). SYNCHRONOUSLY, before any dispatch /
      // microtask / animation frame can run, disarm BOTH timing sources that
      // could otherwise fire a competing POINTER_CANCEL after we have committed
      // to this release: the rAF coalescer (a buffered move that would re-resolve
      // post-settle) and the M3 watchdog (its `onExpire` dispatches a cancel).
      // Cancels first, so nothing races the latch.
      coalescer.cancel();
      watchdogRef.current?.cancel();
      // Latch the seat the release will commit (the driver folds the final
      // processed sample with the decaying last-committable-seat fallback, so a
      // transient sub-pixel / gap-hit clear on the FINAL move does not null the
      // commit while a genuine leave still cancels). The driver writes the
      // latched seat back into its `committableSeat` (so the release sample
      // dispatches it verbatim) and into `releaseCommitLatched` (so any late
      // cancel no-ops via `shouldSuppressCompetingCancel`).
      inputDriver.latchRelease();
      // Release-time synchronous resolve. A fast drag-release fires its
      // `pointermove`s and this `pointerup` within a single task, before the rAF
      // coalescer has a chance to flush — so the buffered sample (which both
      // promotes `armed → dragging` AND resolves the drop target) would be
      // dropped by `coalescer.cancel()` on teardown, leaving the FSM in `armed`
      // (or holding a stale target). POINTER_UP would then settle as a
      // click/cancel and the pane snaps back to its origin. Process the RELEASE
      // pointer position inline (the coalescer is already cancelled above) so the
      // reducer queue becomes POINTER_MOVE → TARGET_RESOLVED(latched seat) →
      // POINTER_UP and the drop commits to the latched slot. Touch is exempt: a
      // finger never reaches `dragging` without the long-press timer, so a
      // pre-pickup tap-release must stay a click (no synchronous promote); a
      // touch drag commits from the FSM `resolvedTarget` at POINTER_UP.
      const releaseState: DragMachineState = dragStateRef.current;
      const releaseIsTouch: boolean =
        (releaseState.phase === "armed" || releaseState.phase === "dragging") &&
        releaseState.touchDrag;
      if (!releaseIsTouch) {
        inputDriver.processPointerSample(
          { x: event.clientX, y: event.clientY },
          true,
        );
      }
      // §5.5 claim-before-settle: if the host has an external hover AND a
      // claim callback, fire it synchronously then settle `claimed` (the pane
      // leaves this tree; nothing settles home). Absent callback → existing cancel.
      const claimState: DragMachineState = dragStateRef.current;
      applyResolvedExternalDragHover(
        { x: event.clientX, y: event.clientY },
        claimState.phase === "dragging" ? claimState.sourceLeafId : null,
      );
      const hover: TilingExternalDragHover | null =
        externalDragHoverPropRef.current ??
        resolvedExternalDragHoverRef.current;
      const onDrop: TilingOnExternalDrop | undefined =
        onExternalDropRef.current;
      if (
        hover != null &&
        onDrop != null &&
        claimState.phase === "dragging"
      ) {
        const claimed: boolean =
          onDrop(
            claimState.sourceLeafId,
            hover.targetId,
            hover.point,
            hover,
          ) !== false;
        if (claimed) {
          // The pane leaves this tree with the claim: it fades where it was
          // drawn instead of popping out.
          fadeOutClaimedLayer(
            liftedLayerRef.current,
            prefersReducedMotionRef.current,
          );
          dispatchDrag({
            type: "POINTER_UP",
            pointerId: owningPointerId,
            claimed: true,
          });
          return;
        }
      }
      dispatchDrag({ type: "POINTER_UP", pointerId: owningPointerId });
    };
    const handlePointerCancel = (event: PointerEvent): void => {
      if (event.pointerId !== owningPointerId) {
        return;
      }
      dispatchDrag({ type: "POINTER_CANCEL", pointerId: owningPointerId });
    };
    // A page or ancestor scroll mid-drag moves the viewport under a pointer
    // that has not moved: the lifted layer follows the viewport, the pane is
    // re-held under the pointer, and the target under it is resolved again.
    const handleScroll = (): void => {
      const pointer: DragMachinePoint | null = lastDragClientPointRef.current;
      if (pointer == null || controller.getState().drag.phase !== "dragging") {
        return;
      }
      placeLiftedLayer();
      placeHeldPane(pointer, true);
      coalescer.schedule(pointer);
    };
    const handleLostPointerCapture = (event: PointerEvent): void => {
      if (event.pointerId !== owningPointerId) {
        return;
      }
      // Fix A — competing-cancel suppression. Capture loss (DOM unmount mid-drag,
      // devtools, OS gesture, a transient re-capture) normally cancels, but it
      // must NOT revert a release already in flight or a seated committable drop
      // — those commit. The driver's arbiter dispatches the cancel only in the
      // genuinely-stuck case (no latch AND no committable seat).
      if (!inputDriver.shouldDispatchCompetingCancel()) {
        return;
      }
      dispatchDrag({ type: "POINTER_CANCEL", pointerId: owningPointerId });
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        dispatchDrag({ type: "ESCAPE" });
      }
    };
    const handleBlur = (): void => {
      // A blur that races a release / arrives while a committable seat is seated
      // must not clobber the commit (first-terminal-event-wins). The driver's
      // arbiter suppresses the cancel iff a commit is latched or a committable
      // seat exists; an Escape is a separate, always-honored explicit cancel.
      if (!inputDriver.shouldDispatchCompetingCancel()) {
        return;
      }
      dispatchDrag({ type: "BLUR" });
    };
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "hidden") {
        // M5 reconcile: a tab hidden mid-drag cancels through the existing edge
        // (the leaves glide back from where they are drawn when the tab is
        // shown again; leaf motion is never stuck). But a hide that races a
        // release / arrives on a seated committable drop must not clobber the
        // commit — the driver's arbiter suppresses the cancel iff a commit is
        // latched or a committable seat exists (the seat's release, even while
        // hidden, still commits).
        if (!inputDriver.shouldDispatchCompetingCancel()) {
          return;
        }
        dispatchDrag({ type: "VISIBILITY_HIDDEN" });
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    window.addEventListener("lostpointercapture", handleLostPointerCapture);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    // Capture phase: scroll does not bubble, and any scrolling ancestor counts.
    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });

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
      window.removeEventListener("scroll", handleScroll, { capture: true });
    };
  }, [
    activeDragPointerId,
    applyResolvedExternalDragHover,
    onLiveHitLogChange,
    placeHeldPane,
    placeLiftedLayer,
    resolvePointerTarget,
  ]);

  // The single teardown path. On `settling` the renderer runs the commit OR the
  // cancel side effect (NEVER both), releases pointer capture, then advances the
  // FSM to `idle`. Commit applies the SAME reducer with the SAME args as the last
  // candidate derivation (no release-time jump). Cancel never calls
  // `onLayoutChange`, so `displayLayout` falls straight back to the untouched
  // prop `layout` — the dragged pane is restored to its EXACT original position
  // and settles back there from where it is drawn.
  React.useEffect((): void => {
    if (dragState.phase !== "settling") {
      return;
    }
    // Release pointer capture on the stable root (only when it actually holds
    // capture for this pointer — the port guards on `hasPointerCapture`).
    // N3: NOT while a spring-load rearm is pending — the pointer is still
    // held and the continuation drag re-uses the capture; the rearm effect
    // (or the drop path) owns the release then.
    const owningPointerId: number | null = capturedPointerIdRef.current;
    const rearmPending: TilingSpringLoadRearmRequest | null = pendingSpringLoadRearmRef.current;
    if (owningPointerId != null && (rearmPending == null || rearmPending.pointerId !== owningPointerId)) {
      pointerCapturePort.release(owningPointerId);
      capturedPointerIdRef.current = null;
    }
    // The survivors need no teardown here: they glide on the leaf motion, which
    // carries on from where each leaf is drawn into whatever layout the settle
    // commits (or back into the untouched layout on a cancel).
    const committedTree: TilingLayoutNode | null =
      dragState.outcome === "commit" && dragState.resolvedTarget != null
        ? deriveCandidateTree(
            layout,
            dragState.sourceLeafId,
            dragState.resolvedTarget,
            dragState.subject,
          )
        : null;
    // Commit-time tree verification: a corrupt candidate (duplicated/orphaned
    // leaf, NaN ratio, missing split child) is REFUSED — the drag falls back to
    // the untouched layout instead of persisting a broken one. Structurally
    // sound candidates commit through the SAME reducer args as the drop
    // preview (no release-time jump).
    // Refuse gap-closed / missing-tile candidates: deriveCandidateTree may
    // return removeLeafTile for non-committable targets, which is structurally
    // valid but drops a host tile.
    const expectedTileIds: ReadonlyArray<string> = expectedTileIdsRef.current;
    const coversHostTiles: boolean =
      committedTree != null &&
      (expectedTileIds.length === 0 ||
        layoutCoversExpectedTiles(committedTree, expectedTileIds));
    if (
      committedTree != null &&
      isStructurallyValidLayout(committedTree) &&
      coversHostTiles
    ) {
      // Rearrange commit-time reconciliation (same normalizeLayout as resize
      // pointerup) so unfit pins / ratios / tile-slot breaks cannot persist.
      const reconciledTree: TilingLayoutNode = normalizeLayout(committedTree, {
        containerWidthPx: viewportSizeRef.current.width,
        containerHeightPx: viewportSizeRef.current.height,
        config: configRef.current,
        expectedTileIds,
      });
      commitLayoutChange(reconciledTree);
      armLayoutIdleSettle();
      // Focus follows the dragged pane through the drop: focus the leaf the
      // dragged content now occupies (the resolved target for a swap, the source
      // leaf for an edge-insert / group-merge). The dragged pane therefore ends
      // the gesture as the focused pane.
      const committedFocusLeafId: string | null = resolveDragCommitFocusLeafId(
        dragState.sourceLeafId,
        dragState.resolvedTarget,
        findGroupContainingLeaf(layout, dragState.sourceLeafId) != null
          ? dragState.subject
          : undefined,
      );
      if (committedFocusLeafId != null) {
        setFocusedLeaf(committedFocusLeafId);
      }
    }
    // A cancel (Escape, pointercancel, a release that never left home, a
    // refused candidate) commits nothing: the display falls back to the
    // untouched `layout`, the layout as it was at the lift, and every pane —
    // the dropped one included — settles back from where it is drawn. A host
    // claim (`onExternalDrop`) took the pane off this tree.
    snappedRef.current = null;
    setSnappedTarget(null);
    // Reset the seat/latch cluster (seat anchor, committable seat, decaying
    // fallback, latched release commit) so the next drag starts clean.
    inputDriver.reset();
    onLiveHitLogChange?.(null);
    if (resolvedExternalDragHoverRef.current != null) {
      resolvedExternalDragHoverRef.current = null;
      onExternalDragHoverChangeRef.current?.(null);
    }
    dispatchDrag({ type: "SETTLE_DONE" });
  }, [
    armLayoutIdleSettle,
    dragState,
    layout,
    commitLayoutChange,
    onLiveHitLogChange,
    setFocusedLeaf,
  ]);

  // N3 step 4 — spring-load REARM. Runs after every commit while a rearm is
  // queued; acts once (i) the drag machine is `idle` again (the claimed
  // settle above has run its teardown and `SETTLE_DONE`, so nothing of the
  // old tree's drag survives — `canRearmDrag`) and (ii) the destination
  // workspace's tree is the one rendered. Measures the leaf's NEW seat
  // (where it is drawn), dispatches `REARM`, then runs
  // the same pickup tail a threshold / long-press promotion runs (root
  // pointer capture + `captureInitialTarget`), so the input layer
  // re-subscribes on the held pointer and the first target / external hover
  // of the NEW tree resolve at the parked point. A layout effect so the
  // pane is lifted again before the browser paints the destination tree.
  //
  // Drop (never queue) the rearm when the host rendered a THIRD workspace or
  // a destination tree without the leaf (it rewrote the set): pointer capture
  // is released and the pointer's eventual release does nothing (idle). While
  // the source workspace is still the one rendered the host has simply not
  // applied the emitted set yet — wait.
  React.useLayoutEffect((): void => {
    const request: TilingSpringLoadRearmRequest | null = pendingSpringLoadRearm;
    if (
      request == null ||
      pendingSpringLoadRearmRef.current !== request ||
      !canRearmDrag(dragState)
    ) {
      return;
    }
    const dropRearm = (): void => {
      pendingSpringLoadRearmRef.current = null;
      setPendingSpringLoadRearm(null);
      if (capturedPointerIdRef.current === request.pointerId) {
        pointerCapturePort.release(request.pointerId);
        capturedPointerIdRef.current = null;
      }
    };
    if (paneWorkspaceId !== request.workspaceId) {
      if (paneWorkspaceId !== request.fromWorkspaceId) {
        dropRearm();
      }
      return;
    }
    const leaf: TilingLeafNode | null = findLeafById(layout, request.leafId);
    if (leaf == null) {
      dropRearm();
      return;
    }
    // The seat: the pane article in the live tree, or — stable pane identity,
    // where a pane that changed workspace is re-hosted and its article only
    // mounts one commit after its slot registered — the registered slot
    // wrapper itself (`display: contents` host, so the two boxes coincide).
    const seatElement: HTMLElement | null =
      Array.from(
        viewportRef.current?.querySelectorAll<HTMLElement>(
          `[data-leaf-id="${request.leafId}"]`,
        ) ?? [],
      ).find(
        (element: HTMLElement): boolean => element.closest("[data-hpt-pane-pool]") == null,
      ) ??
      stablePaneSlotRegistryRef.current.get(leaf.tileId) ??
      null;
    if (seatElement == null) {
      dropRearm();
      return;
    }
    // Where the pane is drawn (mid-glide its box is translated), else its box.
    const seatRect: TilingClientRectLike =
      drawnClientRectOf(leaf.tileId) ?? seatElement.getBoundingClientRect();
    if (pointerCapturePort.capture(request.pointerId)) {
      capturedPointerIdRef.current = request.pointerId;
    }
    lastDragClientPointRef.current = request.client;
    pendingSpringLoadRearmRef.current = null;
    setPendingSpringLoadRearm(null);
    dispatchDrag({
      type: "REARM",
      pointerId: request.pointerId,
      pointerType: request.pointerType,
      sourceLeafId: request.leafId,
      tileId: leaf.tileId,
      anchorFootprint: {
        left: seatRect.left,
        top: seatRect.top,
        width: seatRect.width,
        height: seatRect.height,
      },
      client: request.client,
    });
    inputDriver.captureInitialTarget(request.leafId, request.client, request.pointerId);
  }, [
    pendingSpringLoadRearm,
    dragState,
    layout,
    paneWorkspaceId,
    dispatchDrag,
    drawnClientRectOf,
    inputDriver,
    pointerCapturePort,
  ]);
  // While a rearm is queued no drag is live, so the input layer above is
  // unsubscribed: a release / cancel of the held pointer in that window (the
  // host applies the set a frame late and the user lets go meanwhile) must
  // still drop the rearm and release capture, or the next render would start
  // a drag under a pointer that is already up.
  React.useEffect((): (() => void) | void => {
    const request: TilingSpringLoadRearmRequest | null = pendingSpringLoadRearm;
    if (request == null) {
      return;
    }
    const dropOnRelease = (event: PointerEvent): void => {
      if (event.pointerId !== request.pointerId) {
        return;
      }
      if (pendingSpringLoadRearmRef.current !== request) {
        return;
      }
      pendingSpringLoadRearmRef.current = null;
      setPendingSpringLoadRearm(null);
      if (capturedPointerIdRef.current === request.pointerId) {
        pointerCapturePort.release(request.pointerId);
        capturedPointerIdRef.current = null;
      }
    };
    window.addEventListener("pointerup", dropOnRelease);
    window.addEventListener("pointercancel", dropOnRelease);
    return (): void => {
      window.removeEventListener("pointerup", dropOnRelease);
      window.removeEventListener("pointercancel", dropOnRelease);
    };
  }, [pendingSpringLoadRearm, pointerCapturePort]);

  // Drag source vanished from the CONTROLLED tree while the gesture is still
  // in flight (`armed` / `dragging`) — the host swapped the tree under the
  // drag (a workspace switch in set mode, an external removal). The live
  // candidate is derived from `layout` + `sourceLeafId`, so carrying on would
  // hold a leaf that no longer exists; cancel through the
  // existing `POINTER_CANCEL` edge instead (`_agent/workspace-set-concept.md`
  // §5.3: drag state is cleared on switch). A claimed / committed settle is
  // untouched: the host's synchronous removal lands while the FSM is already
  // `settling`.
  React.useEffect((): void => {
    if (dragState.phase !== "armed" && dragState.phase !== "dragging") {
      return;
    }
    if (findLeafById(layout, dragState.sourceLeafId) != null) {
      return;
    }
    dispatchDrag({ type: "POINTER_CANCEL" });
  }, [dispatchDrag, dragState, layout]);

  // M3 idle watchdog. While the FSM is `armed` or `dragging`, a monotonic-clock
  // timer is armed for `dragRecoveryMaxIdleMs`; every FSM transition (pickup,
  // each coalesced pointer move, target resolution) re-runs this effect and so
  // re-arms the timer — i.e. progress resets the idle clock. If the drag stalls
  // (hang under CPU throttling, a dropped pointercancel, a wedged compositor)
  // past the idle budget, the watchdog force-reconciles by dispatching
  // `POINTER_CANCEL` — reusing the existing cancel edge (no new FSM phase/event)
  // so the normal `settling(cancel) → idle` teardown releases capture. Gated
  // by the `dragRecovery.enable` capability; the monotonic `now` guard makes the
  // expiry robust to timer coalescing/throttling.
  React.useEffect((): undefined | (() => void) => {
    // Arming policy lifted to core: arm iff drag-recovery is enabled AND the FSM
    // is in a phase a stall could strand (`armed` / `dragging`).
    if (!shouldArmIdleWatchdog(dragState.phase, isDragRecoveryEnabled)) {
      return undefined;
    }
    const watchdog: DragWatchdog = createDragWatchdog({
      maxIdleMs: dragRecoveryMaxIdleMs,
      now: WINDOW_SCHEDULER_PORT.now,
      scheduler: WINDOW_SCHEDULER_PORT,
      onExpire: (): void => {
        // Self-heal cancel is for the genuinely-stuck case ONLY — a frame-starved
        // drag that is moving (input-grounded via `handlePointerMove`) or seated
        // must not be reverted by the watchdog; its release will commit. The
        // driver's arbiter dispatches the cancel only when no commit is latched
        // AND no committable seat exists.
        if (!inputDriver.shouldDispatchCompetingCancel()) {
          return;
        }
        dispatchDrag({ type: "POINTER_CANCEL" });
      },
    });
    // Mirror the live handle so raw pointer input can re-arm it (Fix B,
    // input-grounded) and the release path can cancel it synchronously (Fix A).
    watchdogRef.current = watchdog;
    watchdog.progress();
    return (): void => {
      watchdog.cancel();
      if (watchdogRef.current === watchdog) {
        watchdogRef.current = null;
      }
    };
  }, [
    dragState,
    isDragRecoveryEnabled,
    dragRecoveryMaxIdleMs,
  ]);

  const resolveLiveHitLogState = React.useCallback(
    (
      event: React.SyntheticEvent<HTMLElement> & {
        clientX: number;
        clientY: number;
      },
      hoveredLeafId: string,
    ): TilingLiveHitLogState | null => {
      const pointerX: number = event.clientX;
      const pointerY: number = event.clientY;
      const targetFootprint: TilingPaneFootprint | undefined =
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
      const geometryConfig: TilingZoneGeometryConfig = currentGeometryConfig(
        interactionCapabilities.dropHitZoneGeometry,
      );
      const viewportRect: DOMRect | null =
        measurementPort.measureViewportRect();
      const cursorViewport = {
        x: viewportRect == null ? pointerX : pointerX - viewportRect.left,
        y: viewportRect == null ? pointerY : pointerY - viewportRect.top,
      };
      const resolverSourceLeafId: string | null =
        dragSourceLeafId ??
        paneHitZoneSourceLeafId ??
        activeFocusedLeafId ??
        null;
      const dragSourcePaneFootprint: TilingPaneFootprint | null =
        dragSourceLeafId == null
          ? null
          : (leafFootprintsById.get(dragSourceLeafId) ?? null);
      const hitZoneDiagnostics: TilingDropIntentHitZoneDiagnostics =
        resolveDropIntentHitZoneDiagnostics({
          paneSize,
          geometryConfig,
          evaluateZone: (
            zone: TilingLeafDropZone,
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
      const edgeDiagnostics: TilingLiveHitLogState["edgeDiagnostics"] =
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

      const splitPath: ReadonlyArray<TilingSplitPathEntry> =
        readSplitPathToLeaf(layout, hoveredLeafId) ?? [];
      const axisPath: ReadonlyArray<TilingSplitAxis> = splitPath.map(
        (pathEntry: TilingSplitPathEntry): TilingSplitAxis => pathEntry.axis,
      );
      const previousZone: TilingLeafDropZone | null = previousZoneSeed(
        dropState,
        hoveredLeafId,
      );
      const resolvedIntent: TilingDropState = resolveDropIntent({
        leafId: hoveredLeafId,
        paneLocalX: paneLocalPoint.x,
        paneLocalY: paneLocalPoint.y,
        paneSize,
        axisPath,
        geometryConfig,
        previousZone,
        evaluateZone: (
          zone: TilingLeafDropZone,
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
      const intent: TilingDropIntentDebugState =
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
      measurementPort,
    ],
  );

  // Group context for renderTile args (HT-GROUP-TABBED-STACKING): one context
  // per group, keyed by the group's ACTIVE member leaf id — the only member
  // the leaf arm ever renders (the stacking contract), so a loose leaf misses
  // the map and gets `group: null`. Memoized on layout/tiles/dispatchCommand
  // (NOT per frame) so the hot render path reuses stable member views and
  // callback closures; the callbacks route through the SAME `dispatchCommand`
  // router the built-in strip and the keyboard layer use, keeping capability
  // gating and observability uniform.
  const groupContextByActiveLeafId: ReadonlyMap<
    string,
    TilingRenderTileGroupContext
  > = React.useMemo((): ReadonlyMap<string, TilingRenderTileGroupContext> => {
    const contexts = new Map<string, TilingRenderTileGroupContext>();
    for (const groupNode of collectGroups(layout)) {
      const members: ReadonlyArray<TilingGroupMemberView> =
        groupNode.members.map(
          (
            member: TilingLeafNode,
            memberIndex: number,
          ): TilingGroupMemberView => ({
            leafId: member.id,
            tileId: member.tileId,
            tile: resolveTile(tiles, member.tileId) ?? null,
            memberNumber: memberIndex + 1,
            isActive: member.id === groupNode.activeMemberId,
          }),
        );
      // Key by the member the group arm actually renders: `activeMemberId`,
      // with the same first-member fallback the group arm applies.
      const renderedMember: TilingLeafNode =
        groupNode.members.find(
          (member: TilingLeafNode): boolean =>
            member.id === groupNode.activeMemberId,
        ) ?? groupNode.members[0];
      contexts.set(renderedMember.id, {
        groupId: groupNode.id,
        members,
        activateMember: (memberNumber: number): void => {
          dispatchCommand({
            kind: "group-tab-jump",
            groupId: groupNode.id,
            memberNumber,
          });
        },
        removeMember: (leafId: string): void => {
          dispatchCommand({
            kind: "remove-from-group",
            groupId: groupNode.id,
            memberId: leafId,
          });
        },
        ungroup: (): void => {
          dispatchCommand({ kind: "ungroup", groupId: groupNode.id });
        },
      });
    }
    return contexts;
  }, [layout, tiles, dispatchCommand]);

  /**
   * Whether a leaf may apply its stored width/height px pins. Parent splits
   * suppress the ALONG-axis pin when the child's distribution arm is `fill` or
   * ratio-after-failed-fit — a pinned leaf inside a growing fill wrapper leaves
   * a dead-space void (the Round-2 gap, visible as a black hole between panes).
   */
  type LeafPinPermission = {
    allowWidthPin: boolean;
    allowHeightPin: boolean;
  };
  const DEFAULT_LEAF_PIN_PERMISSION: LeafPinPermission = {
    allowWidthPin: true,
    allowHeightPin: true,
  };

  /**
   * A group's frame (strip and active pane, client px) from its active pane's
   * rect: the strip's rendered height (scaled like the pane) added on its side.
   */
  const groupFrameClientRect = React.useCallback(
    (paneRect: TilingClientRectLike): TilingClientRectLike => {
      if (!dragLandingGroupStrip.visible) {
        return paneRect;
      }
      const strip: number =
        dragLandingGroupStrip.heightPx *
        measureViewportClientFrame(viewportRef.current).scale;
      return {
        left: paneRect.left,
        top: dragLandingGroupStrip.placement === "top" ? paneRect.top - strip : paneRect.top,
        width: paneRect.width,
        height: paneRect.height + strip,
      };
    },
    [dragLandingGroupStrip],
  );

  /**
   * A press on a group's tab strip. On a tab: tear that pane off (a one-pane
   * drag held where the group's pane is; its home is the whole group, and a
   * click below the threshold still just switches tabs). On the empty part of
   * the strip: drag the whole group. Its eject / ungroup controls are left to
   * their own clicks.
   */
  const beginGroupStripPress = React.useCallback(
    (
      event: React.PointerEvent<HTMLElement>,
      group: TilingGroupNode,
      tabMemberId: string | null,
    ): void => {
      const target: EventTarget | null = event.target;
      if (
        tabMemberId == null &&
        target instanceof Element &&
        target.closest("button") != null
      ) {
        return;
      }
      const sourceLeafId: string = tabMemberId ?? group.activeMemberId;
      if (!isLeafRearrangeEligible(sourceLeafId)) {
        return;
      }
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }
      if (event.pointerType === "touch" && !interactionCapabilities.touchDrag.enable) {
        return;
      }
      const phase: DragMachineState["phase"] = dragStateRef.current.phase;
      if (phase === "armed" || phase === "dragging") {
        return;
      }
      const section: Element | null = event.currentTarget.closest("[data-group-id]");
      const contentBox: Element | null =
        section?.querySelector("[data-hpt-group-content-box]") ?? null;
      const activeTileId: string | undefined = group.members.find(
        (member: TilingLeafNode): boolean => member.id === group.activeMemberId,
      )?.tileId;
      const paneRect: TilingClientRectLike | null =
        (activeTileId != null ? drawnClientRectOf(activeTileId) : null) ??
        contentBox?.getBoundingClientRect() ??
        null;
      if (paneRect == null) {
        return;
      }
      const frameRect: TilingClientRectLike = groupFrameClientRect(paneRect);
      if (tabMemberId == null) {
        // The strip's own surface: no text selection, the group's pane focused.
        event.preventDefault();
        clearMultiSelection();
        setFocusedLeaf(group.activeMemberId);
      }
      onLiveHitLogChange?.(null);
      const anchor: TilingClientRectLike = tabMemberId == null ? frameRect : paneRect;
      lastDragClientPointRef.current = { x: event.clientX, y: event.clientY };
      dispatchDrag({
        type: "POINTER_DOWN",
        pointerId: event.nativeEvent.pointerId,
        pointerType: resolveDragPointerType(event.pointerType),
        sourceLeafId,
        subject: tabMemberId == null ? "group" : "pane",
        ...(tabMemberId == null
          ? {}
          : {
              homeFootprint: {
                left: frameRect.left,
                top: frameRect.top,
                width: frameRect.width,
                height: frameRect.height,
              },
            }),
        anchorFootprint: {
          left: anchor.left,
          top: anchor.top,
          width: anchor.width,
          height: anchor.height,
        },
        pointerAnchorOffset: {
          x: event.clientX - anchor.left,
          y: event.clientY - anchor.top,
        },
        originClient: { x: event.clientX, y: event.clientY },
      });
    },
    [
      clearMultiSelection,
      dispatchDrag,
      drawnClientRectOf,
      groupFrameClientRect,
      interactionCapabilities.touchDrag.enable,
      isLeafRearrangeEligible,
      onLiveHitLogChange,
      setFocusedLeaf,
    ],
  );

  const renderBranch = React.useCallback(
    (
      node: TilingLayoutNode,
      containerWidthPx: number,
      containerHeightPx: number,
      pinPermission: LeafPinPermission = DEFAULT_LEAF_PIN_PERMISSION,
      // The lifted pane itself (rendered outside the tree): never its own
      // held-slot reservation.
      isLiftedPane: boolean = false,
    ): React.ReactElement => {
      if (node.kind === "leaf") {
        const tile: TilingTile | undefined = resolveTile(tiles, node.tileId);
        const tileForDisplay: TilingTile = tile ?? {
          id: `missing-${node.tileId}`,
          title: `missing tile ${node.tileId}`,
          description: "no tile matched this leaf id",
          accent: "pink",
          rows: ["tile map does not contain this tile id"],
        };

        const isMoveSource: boolean = moveModeState?.sourceLeafId === node.id;
        const moveTargetPlacement: TilingMovePlacement | null =
          moveModeState != null && moveModeState.targetLeafId === node.id
            ? moveModeState.placement
            : null;
        // Drag presentation is CONTENT-AGNOSTIC: the resolver decides the
        // held-slot reservation + role flags purely from drag mechanics, with
        // no reference to the CONTENT toggle. Live mode: the held slot is the
        // empty place kept for the pane the pointer holds elsewhere.
        const leafPresentation = resolveDragPresentation({
          liveDragModeEnabled,
          dragPhase: dragState.phase,
          leafId: node.id,
          pickupOriginLeafId: presentationSourceLeafId,
          heldSlotLeafId: isLiftedPane ? null : heldSlotLeafId,
          dropAction:
            dropState?.leafId === node.id ? (dropState.action ?? null) : null,
          dropZone:
            dropState?.leafId === node.id ? (dropState.zone ?? null) : null,
          dropDominantEdge:
            dropState?.leafId === node.id
              ? (dropState.dominantEdge ?? null)
              : null,
        });
        // Live mode: the pane being dragged (held, or snapped into a slot).
        // Preview mode: the picked-up pane, still in its own slot.
        const isDragSourceSlot: boolean = liveDragModeEnabled
          ? dragState.phase === "dragging" &&
            node.tileId === dragSourceTileId &&
            !leafPresentation.isHeldSlotLeaf
          : leafPresentation.isPickupOriginLeaf &&
            dragState.phase === "dragging";
        const isMaximizedLeaf: boolean = activeMaximizedLeafId === node.id;
        // The uniform pane-body rule: a held-slot reservation is a content-less
        // place (drag mechanic); every other slot honors the CONTENT toggle
        // identically to a resting pane. Maximizing a collapsed leaf suspends
        // the collapse-empty gate (HT-PANE-COLLAPSE + maximize) so it shows full
        // content instead of a titlebar strip in a full-screen void.
        const paneBodyRenderMode: TilingPaneBodyRenderMode =
          resolvePaneBodyRenderMode(
            leafPresentation.isHeldSlotReservation,
            isPaneContentVisible,
            node.collapsed === true,
            isMaximizedLeaf,
            config.collapseBodyMode,
          );
        const isDropTargetLeaf: boolean =
          dropState?.leafId === node.id && dropState.action !== "none";
        // The drop-target chrome zone (edge-insert-vs-center already resolved in
        // the presentation SSOT — no caller-side ternary).
        const effectiveDropZone: TilingLeafDropZone | null =
          leafPresentation.dropChromeZone;

        const tileArgs: TilingRenderTileProps = {
          leafId: node.id,
          tile: tileForDisplay,
          paneOrdinal: Math.max(1, leafIds.indexOf(node.id) + 1),
          workspaceId: paneWorkspaceId,
          seatCount: tileSeatCounts?.get(node.tileId) ?? 1,
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
          isMaximized: isMaximizedLeaf,
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
          onAcquireSpace: (direction: TilingFocusDirection): void => {
            acquireLeafSpace(node.id, direction);
          },
          isCollapsed: node.collapsed === true,
          collapsedDimension:
            node.collapsed === true ? (node.collapsedDimension ?? null) : null,
          isCollapseEnabled,
          onToggleCollapse: (): void => {
            toggleCollapseLeaf(node.id);
          },
          dropZone: effectiveDropZone,
          preview: resolveLeafDropPreviewForMode(
            liveDragModeEnabled,
            node.id,
            dragSourceLeafId,
            dropState,
          ),
          group: groupContextByActiveLeafId.get(node.id) ?? null,
          groupDropTargetRef: groupDropTargetRefFor(node.id),
          isMultiSelectGroupingEnabled,
          isMultiSelected: multiSelectedLeafIds.has(node.id),
          canGroupMultiSelection: canGroupMultiSelectionNow,
          multiSelectionCount: multiSelectedLeafIds.size,
          onToggleMultiSelect: (): void => {
            toggleMultiSelect(node.id);
          },
          onGroupMultiSelection: groupMultiSelection,
          onClearMultiSelection: clearMultiSelection,
          onFocus: (event?: React.SyntheticEvent<HTMLElement>): void => {
            // Header-control guard: when a multi-selection is active and DOM
            // focus moves to a header CONTROL button (the Group button, the
            // maximize button), do NOTHING — neither clear the selection nor
            // re-focus. A button takes focus on pointer-down, so its `focusin`
            // bubbles to this article `onFocus` BEFORE the button's own `click`
            // is delivered. Clearing the selection here re-renders and UNMOUNTS
            // the Group button (its `isMultiSelected` guard flips false), so the
            // pending click never lands `onGroupMultiSelection` — the "Group
            // button seems to have no trigger" defect. The control's effect
            // lives in its own `onClick`, so swallowing this focus is inert.
            if (
              controller.getState().multiSelect.size > 0 &&
              event?.target instanceof Element &&
              event.target.closest("button") != null
            ) {
              return;
            }
            // A plain click / keyboard focus establishes a single focus, which
            // supersedes (and clears) any in-progress multi-selection. The
            // Alt/Opt+click path never reaches here — it is intercepted in the
            // header click handler (stopPropagation) and the pointer-down gate
            // (preventDefault blocks the native focus).
            clearMultiSelection();
            setFocusedLeaf(node.id);
          },
          // Pointer-Events pickup on the drag handle (the title-bar grip). Capture
          // is taken (on the stable root) only once the pickup threshold is
          // crossed, in the window pointermove listener — so a sub-threshold tap
          // stays a click and is never stolen from the title bar.
          onHandlePointerDown: (
            event: React.PointerEvent<HTMLElement>,
          ): void => {
            // Alt/Opt+click on the header is a multi-select TOGGLE (handled in
            // the header `onClick`), not a drag pickup or focus change. Block the
            // native focus + text selection here so the click never establishes a
            // single focus (which would clear the selection). Works regardless of
            // drag eligibility, so a non-rearrangeable pane is still selectable.
            // Skipped for embedded interactive controls so their own click/focus
            // behavior is untouched.
            if (
              isMultiSelectGroupingEnabled &&
              isMultiSelectModifierActive(event)
            ) {
              if (!isInteractiveControlTarget(event.target)) {
                event.preventDefault();
              }
              return;
            }
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
            if (!isInteractiveControlTarget(event.target)) {
              event.preventDefault();
              if (typeof window !== "undefined") {
                window.getSelection()?.removeAllRanges();
              }
            }
            // A plain (no-modifier) header press starts a drag pickup and/or
            // establishes a single focus — both supersede the multi-selection.
            clearMultiSelection();
            setFocusedLeaf(node.id);
            onLiveHitLogChange?.(null);
            const sourcePaneElement: HTMLElement =
              event.currentTarget.closest("article[data-leaf-id]") ??
              event.currentTarget;
            // Pick the pane up where it is DRAWN: mid-glide the article's own
            // box is its layout size at a translated origin, so ask the leaf
            // motion (viewport-relative) and only fall back to the box at rest.
            const paneRect: TilingClientRectLike =
              drawnClientRectOf(node.tileId) ??
              sourcePaneElement.getBoundingClientRect();
            // The title bar of a pane in a tab group picks up the WHOLE group
            // (held by its frame: strip and pane); a tab tears off one pane.
            const isGroupedPane: boolean =
              (findGroupContainingLeaf(layout, node.id)?.members.length ?? 0) >= 2;
            const sourcePaneRect: TilingClientRectLike = isGroupedPane
              ? groupFrameClientRect(paneRect)
              : paneRect;
            lastDragClientPointRef.current = { x: event.clientX, y: event.clientY };
            dispatchDrag({
              type: "POINTER_DOWN",
              pointerId: event.nativeEvent.pointerId,
              pointerType: resolveDragPointerType(event.pointerType),
              sourceLeafId: node.id,
              ...(isGroupedPane ? { subject: "group" as const } : {}),
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
            const liveHitLogState: TilingLiveHitLogState | null =
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

        // The INTERNAL superset the built-in default pane consumes: the clean
        // consumer args PLUS the debug/observability fields (drop-intent debug
        // labels, hit-zone geometry, observability overlay colors). A custom
        // `renderTile` receives only `tileArgs` — these never leak to it.
        const defaultTileArgs: TilingDefaultTileProps = {
          ...tileArgs,
          dropIntentDebugPath:
            dropState?.leafId === node.id
              ? dropIntentAxisPathLabel(dropState.axisPath)
              : null,
          dropIntentDebugAction:
            dropState?.leafId === node.id ? dropState.action : null,
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
        };

        // A leaf static in a dimension is content-sized in that dimension —
        // UNLESS the title-bar STATIC action pinned a measured bbox px on that
        // dimension (PART 2 freeze). When pinned, the wrapper takes the exact
        // pixel extent (no stretch, no shrink); when static-but-unpinned it
        // content-sizes (`h-auto`/`w-auto`, the legacy intrinsic behavior);
        // when flexible it keeps the fill + overflow clamp.
        const leafStaticHeight: boolean = isStaticInDimension(node, "height");
        const leafStaticWidth: boolean = isStaticInDimension(node, "width");
        // Suppress along-axis pins when the parent arm is fill/ratio — the leaf
        // must stretch with its flex slot or a fixed px pin opens dead space.
        const pinnedHeightPx: number | undefined =
          leafStaticHeight && pinPermission.allowHeightPin
            ? node.sizing?.heightPx
            : undefined;
        const pinnedWidthPx: number | undefined =
          leafStaticWidth && pinPermission.allowWidthPin
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
        // When an along-axis pin is suppressed, treat the leaf as flexible fill
        // in that dimension so it absorbs the parent flex slot.
        const leafHeightClass: string =
          leafStaticHeight && pinPermission.allowHeightPin
            ? pinnedHeightPx != null
              ? ""
              : "h-auto"
            : "h-full max-h-full min-h-0";
        const leafWidthClass: string =
          leafStaticWidth && pinPermission.allowWidthPin
            ? pinnedWidthPx != null
              ? ""
              : "w-auto"
            : "w-full min-w-0";
        const showMoveAffordance: boolean =
          isMoveSource || moveTargetPlacement != null;
        // Single-instance gate: while the pointer holds the dragged pane
        // elsewhere, a leaf of the tree carrying it is only its kept place — an
        // empty, unpainted slot the others made room around. Renderer-agnostic
        // on purpose: it overrides any custom `renderTile` too, so the pane is
        // never painted twice.
        const renderReservedDragSlot: boolean =
          tileArgs.paneBodyRenderMode === "render-reservation";
        // Whole-pane drag dimming (preview drag mode: the picked-up source stays
        // in its slot) + the optional drop-target highlight are applied HERE, on
        // the leaf wrapper, so they cover a custom `renderTile` and the default
        // tile identically — one opacity over title AND content, never a
        // per-part dim. The live drag never dims: the pane is lifted.
        const isDimmedDragSource: boolean =
          !liveDragModeEnabled && isDragSourceSlot && !renderReservedDragSlot;
        // The dragged pane stays above every other pane (and the drop
        // indicator), with the theme's lifted look, from the lift until its
        // drop settle ends (raised in the very render that lifts it).
        const isRaisedPane: boolean =
          !renderReservedDragSlot &&
          (node.tileId === raisedTileId ||
            (isLiveDragging && node.tileId === dragSourceTileId));
        if (isRaisedPane) {
          leafWrapperStyle.zIndex = RAISED_PANE_Z_INDEX;
        }
        // Stable pane identity: the pane is rendered ONCE in the tile-keyed pool
        // (see `StablePanePool`) and its DOM node relocates into this wrapper,
        // which registers itself as the tile's slot. A held-slot reservation
        // registers nothing (the lifted wrapper does). The entry is collected
        // for the pool render pass that follows the tree pass.
        const isStablePaneSlot: boolean = paneIdentityMode === "stable";
        if (
          isStablePaneSlot &&
          !renderReservedDragSlot &&
          !stablePaneEntriesRef.current.has(node.tileId)
        ) {
          stablePaneEntriesRef.current.set(node.tileId, {
            tileId: node.tileId,
            tileArgs,
            defaultTileArgs,
          });
        }
        const registerSlot: React.RefCallback<HTMLDivElement> | undefined =
          isStablePaneSlot && !renderReservedDragSlot
            ? registerStablePaneSlot(node.tileId)
            : undefined;
        if (renderReservedDragSlot) {
          // Not a pane: no `data-hpt-leaf` (the lifted wrapper is the pane's
          // one wrapper), no stable slot, nothing painted.
          return (
            <div
              className={cn(leafHeightClass, leafWidthClass)}
              style={leafWrapperStyle}
              data-drag-held-slot-leaf={node.id}
            >
              <HeldSlotReservation
                observabilityColors={observabilityColors}
                observabilityColorEnables={observabilityColorEnables}
              />
            </div>
          );
        }
        return (
          <div
            ref={registerSlot}
            {...(isStablePaneSlot ? { "data-hpt-pane-slot": node.tileId } : {})}
            className={cn(
              isLeafMotionOverflowWindow
                ? "overflow-visible"
                : LEAF_MOTION_OVERFLOW_CLASS,
              leafHeightClass,
              leafWidthClass,
              showMoveAffordance || isRaisedPane ? "relative" : "",
              isDimmedDragSource ? dragChrome.sourcePane : "",
              isDropTargetLeaf ? dragChrome.dropTarget : "",
              isRaisedPane ? dragChrome.liftedPane : "",
            )}
            style={leafWrapperStyle}
            {...(isDimmedDragSource ? { "data-drag-source-pane": "" } : {})}
            {...(isDropTargetLeaf ? { "data-drop-target-pane": "" } : {})}
            {...(isRaisedPane ? { "data-hpt-leaf-raised": "" } : {})}
            // Leaf motion: the wrapper is the window the motion moves (its
            // layout rect is the target), keyed by TILE id so a swap (which
            // trades tiles between leaves) moves the windows; the frame layer
            // draws the tile's chrome at the drawn size while it glides and is
            // hidden at rest (see leaf-motion-dom.ts).
            data-hpt-leaf={node.tileId}
          >
            <div data-hpt-leaf-frame="" aria-hidden style={{ display: "none" }} />
            {isStablePaneSlot ? null : renderTile == null ? (
              <DefaultTilingTile {...defaultTileArgs} />
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
        const groupNode: TilingGroupNode = node;
        const activeMember: TilingLeafNode =
          groupNode.members.find(
            (member: TilingLeafNode): boolean =>
              member.id === groupNode.activeMemberId,
          ) ?? groupNode.members[0];
        const isGroupMergeTarget: boolean =
          dropState?.action === "group-merge" &&
          findGroupContainingLeaf(layout, dropState.leafId)?.id ===
            groupNode.id;
        const groupTabStrip: ResolvedTilingGroupTabStripOptions =
          interactionCapabilities.grouping.groupTabStrip;
        const showStrip: boolean =
          showGroupTabStrip && groupNode.members.length >= 2;
        // Nested tier: this group is painted at viewport size under the pane
        // strip (maximized member of a group). Standalone group strips stay
        // full-height and unindented.
        const isNestedGroupStrip: boolean =
          showPaneTabStrip &&
          keepGroupTabStrip &&
          activeMaximizedLeafId != null &&
          groupNode.members.some(
            (member: TilingLeafNode): boolean => member.id === activeMaximizedLeafId,
          );
        const stripHeightPx: number = showStrip
          ? tabStripRenderedHeight(groupTabStrip.height, isNestedGroupStrip)
          : 0;
        const memberHeightPx: number = Math.max(
          0,
          containerHeightPx - stripHeightPx,
        );
        const groupStripPlacement: "top" | "bottom" = groupTabStrip.placement;
        const stripMembers: ReadonlyArray<GroupTabStripMember> =
          groupNode.members.map(
            (member: TilingLeafNode, memberIndex: number): GroupTabStripMember => {
              const memberTile: TilingTile | undefined = resolveTile(
                tiles,
                member.tileId,
              );
              return {
                index: memberIndex,
                id: member.id,
                tileId: member.tileId,
                title: memberTile?.title ?? member.tileId,
                active: member.id === groupNode.activeMemberId,
              };
            },
          );
        // A whole group held elsewhere keeps its slot here as one empty place
        // (strip included), so the group shows only once, where it is held.
        if (
          !isLiftedPane &&
          dragSubject === "group" &&
          heldSlotLeafId != null &&
          groupNode.members.some(
            (member: TilingLeafNode): boolean => member.id === heldSlotLeafId,
          )
        ) {
          return (
            <div
              className="h-full max-h-full min-h-0 w-full min-w-0"
              data-drag-held-slot-leaf={heldSlotLeafId}
              data-drag-held-slot-group={groupNode.id}
            >
              <HeldSlotReservation
                observabilityColors={observabilityColors}
                observabilityColorEnables={observabilityColorEnables}
              />
            </div>
          );
        }
        const groupStrip: React.ReactElement | null = showStrip ? (
          <GroupTabStrip
            groupId={groupNode.id}
            members={stripMembers}
            options={groupTabStrip}
            isGroupingEnabled={isGroupingEnabled}
            isMergeTarget={isGroupMergeTarget}
            prefersReducedMotion={prefersReducedMotion}
            nested={isNestedGroupStrip}
            setRef={(element: HTMLDivElement | null): void => {
              setGroupTabStripRef(groupNode.id, element);
            }}
            onActivate={(memberNumber: number): void => {
              dispatchCommand({
                kind: "group-tab-jump",
                groupId: groupNode.id,
                memberNumber,
              });
            }}
            onEject={(memberId: string): void => {
              dispatchCommand({
                kind: "remove-from-group",
                groupId: groupNode.id,
                memberId,
              });
            }}
            onUngroup={(): void => {
              dispatchCommand({
                kind: "ungroup",
                groupId: groupNode.id,
              });
            }}
            onStripPointerDown={
              isLiftedPane
                ? undefined
                : (event: React.PointerEvent<HTMLElement>): void => {
                    beginGroupStripPress(event, groupNode, null);
                  }
            }
            onTabPointerDown={
              isLiftedPane
                ? undefined
                : (event: React.PointerEvent<HTMLElement>, memberId: string): void => {
                    beginGroupStripPress(event, groupNode, memberId);
                  }
            }
          />
        ) : null;
        return (
          <section
            ref={(element: HTMLDivElement | null): void =>
              setSplitContainerRef(groupNode.id, element)
            }
            data-group-id={groupNode.id}
            className={cn(
              "hpt-group relative flex h-full max-h-full min-h-0 w-full min-w-0 flex-col",
              isLeafMotionOverflowWindow
                ? "overflow-visible"
                : LEAF_MOTION_OVERFLOW_CLASS,
            )}
          >
            {groupStripPlacement === "top" ? groupStrip : null}
            <div
              className="hpt-group-active hpt-motion-overflow relative min-h-0 w-full flex-1 overflow-hidden"
              data-hpt-group-content-box=""
              style={{
                height:
                  stripHeightPx > 0
                    ? `calc(100% - ${stripHeightPx}px)`
                    : "100%",
              }}
            >
              {renderBranch(
                activeMember,
                containerWidthPx,
                memberHeightPx,
                undefined,
                isLiftedPane,
              )}
            </div>
            {groupStripPlacement === "bottom" ? groupStrip : null}
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
        const masterSlots: ReadonlyArray<TilingLayoutNode> =
          collectMasterSlots(node);
        const masterParams = resolveMasterParams(node, masterSlots.length);
        const masterFootprints = footprintsByLeafId(
          resolveMasterStackFootprints(
            masterSlots,
            0,
            0,
            containerWidthPx,
            containerHeightPx,
            config,
            masterParams,
          ),
        );
        // Not measured yet (server render, hydration): place the slots with
        // CSS calc() at the geometry the px footprints will have, so a
        // prerendered master layout paints right away and does not move once
        // measured. Measured: the px footprints, as before.
        const masterCssFootprints =
          containerWidthPx <= 1 || containerHeightPx <= 1
            ? resolveMasterStackCssFootprints(masterSlots, config, masterParams)
            : null;
        return (
          <section
            ref={(element: HTMLDivElement | null): void =>
              setSplitContainerRef(node.id, element)
            }
            className={cn(
              "relative h-full max-h-full min-h-0 w-full min-w-0",
              isLeafMotionOverflowWindow
                ? "overflow-visible"
                : LEAF_MOTION_OVERFLOW_CLASS,
            )}
          >
            {masterSlots.map(
              (slot: TilingLayoutNode): React.ReactElement | null => {
                const slotFootprint = masterFootprints.get(
                  slotRepresentativeLeafId(slot),
                );
                if (slotFootprint == null) {
                  return null;
                }
                const slotCssFootprint = masterCssFootprints?.get(
                  slotRepresentativeLeafId(slot),
                );
                return (
                  <div
                    key={slot.id}
                    className="absolute"
                    style={
                      slotCssFootprint ?? {
                        left: slotFootprint.left,
                        top: slotFootprint.top,
                        width: slotFootprint.width,
                        height: slotFootprint.height,
                      }
                    }
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
      // Per-side along-axis floor (HT-MIN-BBOX-PX / HT-RESIZE-FLOOR): a
      // direct-child leaf's own `minBBoxPx` wins over this split's
      // `minPaneSizePx`, which wins over the config default — UNLESS that
      // side opts into a "chrome" resize floor (size-out to the collapsed
      // titlebar extent), which replaces the chain entirely. Resolved per
      // side so an asymmetric floor (one side only) does not force the other
      // side up to match. The divider drag (`beginResize`/
      // `handleSeparatorKeyDown`) reuses these SAME two resolutions.
      const firstFloor = resolveAlongAxisFloor(node.first, node.axis, node.minPaneSizePx, config);
      const secondFloor = resolveAlongAxisFloor(node.second, node.axis, node.minPaneSizePx, config);
      const firstMinPaneSizePx: number = firstFloor.floorPx;
      const secondMinPaneSizePx: number = secondFloor.floorPx;
      const ratioSafetyBounds = resolveRatioSafetyBounds(firstFloor, secondFloor);
      const isHorizontal: boolean = node.axis === "horizontal";
      const axisContainerSizePx: number = isHorizontal
        ? containerWidthPx
        : containerHeightPx;

      // Per-child static flags. A child static ALONG the split axis is
      // content-sized + excluded from ratio + removes the divider; a child static
      // on the CROSS axis content-sizes that axis (align-self:flex-start) but
      // still shares the split-axis ratio.
      const declaredFirstStaticAlong: boolean = isStaticAlongSplitAxis(
        node.first,
        node.axis,
      );
      const declaredSecondStaticAlong: boolean = isStaticAlongSplitAxis(
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

      // Nested branches need the TRUE along-axis px for content/fill children
      // (pin / remainder-after-pin+gutter). Passing the parent container size for
      // both arms was the multi-static composite defect: an inner static pin
      // would fit-guard against the outer width and overflow the fill region.
      const alongPinPx = (child: TilingLayoutNode): number | null => {
        if (!isStaticAlongSplitAxis(child, node.axis)) {
          return null;
        }
        const pinPx: number | undefined = isHorizontal
          ? child.sizing?.widthPx
          : child.sizing?.heightPx;
        if (pinPx == null || !Number.isFinite(pinPx) || pinPx <= 0) {
          return null;
        }
        return pinPx;
      };
      const firstPinPx: number | null = alongPinPx(node.first);
      const secondPinPx: number | null = alongPinPx(node.second);
      // Both-collapsed siblings (HT-PANE-COLLAPSE-VOID): both children are
      // LEAVES currently collapsed. Locked design prefers both stay collapsed
      // with a split slack void over silently un-collapsing one — see
      // `resolveEffectiveStaticAlong` / `resolveBinarySplitDistribution` /
      // `normalizeStaticAxisFill`. The divider stays interactive so the void
      // remains escapable (see `expandBothCollapsedVoidSiblings`).
      const bothCollapsedVoidLeafIds: readonly [string, string] | null =
        node.first.kind === "leaf" &&
        node.first.collapsed === true &&
        node.second.kind === "leaf" &&
        node.second.collapsed === true
          ? [node.first.id, node.second.id]
          : null;
      const isBothCollapsedVoid: boolean = bothCollapsedVoidLeafIds != null;
      // Static-along boundaries omit the resize handle but still reserve the
      // FULL boundary gutter (`gapPx + handleSizePx`) via a transparent spacer
      // so W•/H• locks keep gutter parity with flexible splits (and host chrome
      // shows through — root/viewport themes must not invent a fill).
      const boundaryGutterPx: number = splitBoundaryGutterPx(
        resolvedGapPx,
        config.handleSizePx,
      );
      // Pin fit-guard: a static pin that cannot fit demotes that child to
      // flexible for this frame (matches leaf-geometry ratio fallback) so DOM
      // flex never keeps a non-shrinking pin in a too-small container.
      const effectiveStatic = resolveEffectiveStaticAlong(
        declaredFirstStaticAlong,
        declaredSecondStaticAlong,
        firstPinPx,
        secondPinPx,
        axisContainerSizePx,
        resolvedGapPx,
        config.handleSizePx,
        isBothCollapsedVoid,
      );
      const firstStaticAlongAxis: boolean =
        effectiveStatic.firstStaticAlongAxis;
      const secondStaticAlongAxis: boolean =
        effectiveStatic.secondStaticAlongAxis;
      const staticExtents = effectiveStatic.staticExtents;

      const safeRatio: number = clampByMinSize(
        node.ratio,
        axisContainerSizePx,
        boundaryGutterPx,
        firstMinPaneSizePx,
        secondMinPaneSizePx,
        ratioSafetyBounds,
      );
      const isDividerResizeEnabled: boolean = isResizeAxisEnabled(
        interactionCapabilities.resize,
        node.axis,
      );
      // Both-collapsed-siblings void stays resizable (drag/keyboard nudge
      // un-collapses both — HT-PANE-COLLAPSE-VOID) even though both sides are
      // static-along: every OTHER static combination still hides the divider
      // (a lone collapsed pane's escape is its expand control, not a drag that
      // has no live geometry effect while pinned).
      const isBoundaryResizable: boolean =
        isBothCollapsedVoid || (!firstStaticAlongAxis && !secondStaticAlongAxis);
      const dividerRenderMode: TilingSplitDividerRenderMode =
        resolveSplitDividerRenderMode({
          isBoundaryResizable,
          resizeHandlesVisible: interactionCapabilities.resizeHandlesVisible,
          isResizeAxisEnabled: isDividerResizeEnabled,
        });
      const renderDivider: boolean =
        dividerRenderMode !== "render-divider-absent";
      const renderStaticGapSpacer: boolean =
        !renderDivider && boundaryGutterPx > 0;
      const isRenderedDividerInteractive: boolean =
        dividerRenderMode === "render-divider-enabled-visible" ||
        dividerRenderMode === "render-divider-enabled-hidden";
      const isDividerChromeVisible: boolean =
        dividerRenderMode === "render-divider-enabled-visible" ||
        dividerRenderMode === "render-divider-disabled-visible";
      const splitGapOffsetPx: number = renderDivider ? boundaryGutterPx / 2 : 0;
      const distribution = resolveBinarySplitDistribution(
        firstStaticAlongAxis,
        secondStaticAlongAxis,
        safeRatio,
        isBothCollapsedVoid,
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

      const childMainPx = (sizing: SplitChildMainSizing): number => {
        if (sizing.kind === "ratio") {
          return Math.max(
            0,
            axisContainerSizePx * sizing.basisFraction - splitGapOffsetPx,
          );
        }
        return axisContainerSizePx;
      };
      const firstMainPx: number =
        staticExtents != null
          ? staticExtents.firstPx
          : childMainPx(distribution.first);
      const secondMainPx: number =
        staticExtents != null
          ? staticExtents.secondPx
          : childMainPx(distribution.second);
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

      // Along-axis pin only when the child's arm is `content`. Fill / ratio arms
      // must stretch the leaf (suppress pin) or a fixed px pin leaves dead space
      // inside the growing flex slot — the black void between document & review.
      const pinPermissionFor = (
        sizing: SplitChildMainSizing,
      ): LeafPinPermission =>
        isHorizontal
          ? {
              allowWidthPin: sizing.kind === "content",
              allowHeightPin: true,
            }
          : {
              allowWidthPin: true,
              allowHeightPin: sizing.kind === "content",
            };
      const firstPinPermission: LeafPinPermission = pinPermissionFor(
        distribution.first,
      );
      const secondPinPermission: LeafPinPermission = pinPermissionFor(
        distribution.second,
      );

      return (
        <section
          ref={(element: HTMLDivElement | null): void =>
            setSplitContainerRef(node.id, element)
          }
          className={cn(
            "relative flex h-full max-h-full min-h-0 w-full min-w-0",
            isLeafMotionOverflowWindow
              ? "overflow-visible"
              : LEAF_MOTION_OVERFLOW_CLASS,
            isHorizontal ? "flex-row" : "flex-col",
          )}
        >
          <div
            className={cn(
              "flex min-h-0 min-w-0",
              isLeafMotionOverflowWindow
                ? "overflow-visible"
                : LEAF_MOTION_OVERFLOW_CLASS,
            )}
            style={{
              ...mainFlexStyle(distribution.first),
              ...(firstStaticCross ? { alignSelf: "flex-start" } : {}),
            }}
          >
            {renderBranch(
              node.first,
              firstBranchWidthPx,
              firstBranchHeightPx,
              firstPinPermission,
            )}
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
              // Cursor is supplied by the SDK-shipped chrome stylesheet
              // (`TILING_CHROME_CURSOR_CSS`) keyed off this attribute — NOT by
              // Tailwind `cursor-*` utilities — so the resize affordance resolves
              // even when a consumer's Tailwind build does not scan our dist.
              // interactive → col/row; visible+inert → inherit; hidden+inert →
              // default.
              data-hpt-resize-cursor={
                isRenderedDividerInteractive
                  ? isHorizontal
                    ? ("col" satisfies TilingResizeCursor)
                    : ("row" satisfies TilingResizeCursor)
                  : isDividerChromeVisible
                    ? undefined
                    : ("default" satisfies TilingResizeCursor)
              }
              tabIndex={isRenderedDividerInteractive ? 0 : -1}
              onPointerDown={
                isRenderedDividerInteractive
                  ? (event: React.PointerEvent<HTMLDivElement>): void =>
                      beginResize(
                        event,
                        node,
                        resolvedGapPx,
                        firstMinPaneSizePx,
                        secondMinPaneSizePx,
                        ratioSafetyBounds,
                        config.handleSizePx,
                        bothCollapsedVoidLeafIds,
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
                        firstMinPaneSizePx,
                        secondMinPaneSizePx,
                        ratioSafetyBounds,
                        bothCollapsedVoidLeafIds,
                      )
                  : undefined
              }
              className={cn(
                theme.divider.base,
                // Cursor moved to the SDK-shipped stylesheet (see
                // `data-hpt-resize-cursor` above); only sizing + theme paint
                // remain as class strings here.
                isDividerChromeVisible
                  ? cn(
                      isRenderedDividerInteractive
                        ? theme.divider.visibleInteractive
                        : theme.divider.visibleStatic,
                      isHorizontal ? "h-full" : "w-full",
                    )
                  : cn(
                      theme.divider.hidden,
                      isHorizontal ? "h-full" : "w-full",
                    ),
              )}
              style={
                // Full-gutter hit target: outer box = gapPx + handleSizePx so
                // col/row-resize cursor + pointer drag work across the whole
                // inter-pane strip (not only the center handleSizePx paint).
                // Theme `bg-clip-content` keeps chrome painted on the center
                // content box only (padding stays transparent host chrome).
                isHorizontal
                  ? {
                      width: boundaryGutterPx,
                      boxSizing: "border-box",
                      paddingLeft: resolvedGapPx / 2,
                      paddingRight: resolvedGapPx / 2,
                    }
                  : {
                      height: boundaryGutterPx,
                      boxSizing: "border-box",
                      paddingTop: resolvedGapPx / 2,
                      paddingBottom: resolvedGapPx / 2,
                    }
              }
            />
          ) : renderStaticGapSpacer ? (
            <div
              aria-hidden="true"
              data-static-gap-spacer=""
              className="shrink-0 bg-transparent"
              style={
                isHorizontal
                  ? { width: boundaryGutterPx, height: "100%" }
                  : { height: boundaryGutterPx, width: "100%" }
              }
            />
          ) : null}

          <div
            className={cn(
              "flex min-h-0 min-w-0",
              isLeafMotionOverflowWindow
                ? "overflow-visible"
                : LEAF_MOTION_OVERFLOW_CLASS,
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
              secondPinPermission,
            )}
          </div>
        </section>
      );
    },
    [
      beginResize,
      controller,
      handleSeparatorKeyDown,
      moveModeState,
      config.gapPx,
      config.handleSizePx,
      config.minPaneSizePx,
      activeFocusedLeafId,
      activeMaximizedLeafId,
      dragSourceLeafId,
      dragState.phase,
      presentationSourceLeafId,
      heldSlotLeafId,
      dragSubject,
      beginGroupStripPress,
      groupFrameClientRect,
      dragSourceTileId,
      raisedTileId,
      isLiveDragging,
      dropState,
      interactionCapabilities,
      isLeafMotionOverflowWindow,
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
      showGroupTabStrip,
      showPaneTabStrip,
      keepGroupTabStrip,
      interactionCapabilities,
      prefersReducedMotion,
      groupContextByActiveLeafId,
      isMultiSelectGroupingEnabled,
      multiSelectedLeafIds,
      canGroupMultiSelectionNow,
      toggleMultiSelect,
      groupMultiSelection,
      clearMultiSelection,
      layout,
      setGroupTabStripRef,
      groupDropTargetRefFor,
      isPaneContentVisible,
      theme,
      dragChrome,
      paneIdentityMode,
      registerStablePaneSlot,
    ],
  );

  const maximizedLeaf: TilingLeafNode | null =
    activeMaximizedLeafId != null
      ? findLeafById(layout, activeMaximizedLeafId)
      : null;
  const maximizedGroup: TilingGroupNode | null =
    keepGroupTabStrip && activeMaximizedLeafId != null
      ? findGroupContainingLeaf(layout, activeMaximizedLeafId)
      : null;
  const maximizedRenderNode: TilingLayoutNode | null =
    maximizedGroup != null && activeMaximizedLeafId != null
      ? { ...maximizedGroup, activeMemberId: activeMaximizedLeafId }
      : maximizedLeaf;
  // In live mode the displayed tree is the derived candidate tree (the
  // destination physically reflows to the post-drop result); otherwise the prop
  // layout. The projected landing overlays (S' / T' / successor) are the
  // PREVIEW-mode rendering of the pending result — in live mode the real reflow +
  // the held pane and its drop preview replace them entirely, so they are suppressed (no
  // projection-vs-reflow double-preview). This is the render gate that guarantees
  // zero projection/landing-shadow in live mode.
  const showProjectedLandingOverlays: boolean =
    showDropPreviewOverlays && !liveDragModeEnabled;

  // Tree pass FIRST (it collects the stable-mode pane entries), pool pass
  // second. The entries map is reset per render so a StrictMode double render
  // or a bailed-out render never leaks stale tiles into the pool.
  stablePaneEntriesRef.current = new Map<string, StablePaneEntry>();
  const treeElement: React.ReactElement =
    maximizedRenderNode != null
      ? renderBranch(
          maximizedRenderNode,
          viewportSize.width,
          viewportSize.height,
        )
      : renderBranch(displayLayout, viewportSize.width, viewportSize.height);
  // The lifted pane: the REAL pane (same render path; the same mount when
  // `paneIdentity` is "stable"), out of the tree, in a fixed layer laid out
  // where it was picked up at its lift size (left / top written by
  // `placeLiftedLayer`); the leaf motion draws it where the pointer holds it.
  const liftedSourceLeaf: TilingLeafNode | null =
    isPaneHeld && dragSourceLeafId != null && liftGeometry != null
      ? findLeafById(layout, dragSourceLeafId)
      : null;
  const liftedElement: React.ReactElement | null =
    liftedSourceLeaf != null && liftGeometry != null ? (
      <div
        ref={liftedLayerRef}
        className="pointer-events-none fixed flex"
        data-hpt-lifted=""
        style={{
          width: liftGeometry.layoutRect.width,
          height: liftGeometry.layoutRect.height,
          zIndex: RAISED_PANE_Z_INDEX,
        }}
      >
        {renderBranch(
          // A dragged group is lifted whole: it renders as a group (strip and
          // active pane), the same members, order and active tab.
          dragSubjectGroup != null
            ? { ...dragSubjectGroup, sizing: undefined }
            : { ...liftedSourceLeaf, sizing: undefined },
          liftGeometry.layoutRect.width,
          liftGeometry.layoutRect.height,
          undefined,
          true,
        )}
      </div>
    ) : null;
  // Indicator mode: where the pane will land, drawn above the resting panes
  // and below the dragged one; it jumps between targets (no animation).
  const dropIndicatorElement: React.ReactElement | null =
    dropIndicatorRect != null ? (
      <div
        className={cn("pointer-events-none absolute", dragChrome.dropIndicator)}
        data-hpt-drop-indicator=""
        aria-hidden
        style={{
          left: dropIndicatorRect.x,
          top: dropIndicatorRect.y,
          width: dropIndicatorRect.width,
          height: dropIndicatorRect.height,
          zIndex: DROP_INDICATOR_Z_INDEX,
        }}
      />
    ) : null;
  const stablePaneEntries: Map<string, StablePaneEntry> =
    stablePaneEntriesRef.current;
  // H6 `inactiveWorkspaces: "keep-mounted"`: a pool tile seated only in an
  // inactive workspace keeps its pane mounted (hidden, parked in the pool)
  // using its last in-tree render props at rest. A tile that has never been
  // shown has no last render and mounts lazily the first time its workspace
  // is active. Tiles neither in the tree nor retained leave the pool.
  if (paneIdentityMode === "stable") {
    const lastEntries: Map<string, StablePaneEntry> = lastStablePaneEntriesRef.current;
    for (const [tileId, entry] of stablePaneEntries) {
      lastEntries.set(tileId, entry);
    }
    if (retainedPanes != null) {
      for (const retained of retainedPanes) {
        if (stablePaneEntries.has(retained.tileId)) {
          continue;
        }
        const last: StablePaneEntry | undefined = lastEntries.get(retained.tileId);
        if (last == null) {
          continue;
        }
        stablePaneEntries.set(
          retained.tileId,
          restingRetainedPaneEntry(
            last,
            retained,
            resolveTile(tiles, retained.tileId),
            tileSeatCounts?.get(retained.tileId) ?? 1,
          ),
        );
      }
    }
    // A live drag holds the source in its lifted wrapper; when it is in
    // neither that nor the tree (a claimed external drop settling, a move
    // into another workspace) keep the pane parked in the pool through
    // `dragging` and `settling`, so the release reseats the SAME mount instead
    // of remounting it with fresh local state.
    const parkedSourceLeafId: string | null =
      dragState.phase === "dragging" || dragState.phase === "settling"
        ? dragState.sourceLeafId
        : null;
    const parkedSourceTileId: string | null =
      parkedSourceLeafId == null
        ? null
        : (findLeafById(layout, parkedSourceLeafId)?.tileId ?? null);
    if (parkedSourceTileId != null && !stablePaneEntries.has(parkedSourceTileId)) {
      const last: StablePaneEntry | undefined = lastEntries.get(parkedSourceTileId);
      if (last != null) {
        stablePaneEntries.set(
          parkedSourceTileId,
          restingRetainedPaneEntry(
            last,
            { tileId: parkedSourceTileId, workspaceId: last.tileArgs.workspaceId },
            resolveTile(tiles, parkedSourceTileId),
            tileSeatCounts?.get(parkedSourceTileId) ?? last.tileArgs.seatCount,
          ),
        );
      }
    }
    for (const tileId of Array.from(lastEntries.keys())) {
      if (!stablePaneEntries.has(tileId)) {
        lastEntries.delete(tileId);
      }
    }
  }
  const stablePanePoolOrder: ReadonlyArray<string> =
    paneIdentityMode === "stable"
      ? resolveStablePanePoolOrder(
          stablePanePoolOrderRef.current,
          new Set<string>(stablePaneEntries.keys()),
        )
      : [];
  stablePanePoolOrderRef.current = stablePanePoolOrder;

  return (
    <OverlayPortalContainerContext.Provider value={overlayPortalContainer}>
    <TilingThemeProvider theme={theme}>
      <div
        ref={assignRootElement}
        tabIndex={-1}
        style={rootStyle}
        className={cn(
          "hpt-root",
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
        <TilingChromeStyles focusOutline={chromeFocusOutline} />
        {showPaneLabChrome ? (
          <div className="mb-1.5 shrink-0">
            <PaneLabChrome
              isPaneContentVisible={isPaneContentVisible}
              showContentToggle={showContentToggle}
              accentPicker={tabStripAccentPicker}
              themePicker={tabStripThemePicker}
              onPaneContentVisibilityChange={setIsPaneContentVisible}
            />
          </div>
        ) : null}
        {showPaneTabStrip && paneTabStripOptions.placement === "top" ? (
          <div className="mb-1.5 shrink-0">
            <PaneTabStrip
              tabs={paneStripTabs}
              options={paneTabStripOptions}
              prefersReducedMotion={prefersReducedMotion}
              onSelect={activateLeaf}
              onTabDoubleClickMaximize={
                tabDoubleClickMaximizeEnabled
                  ? (leafId: string): void => {
                      dispatchCommand(tabDoubleClickMaximizeCommand(leafId));
                    }
                  : null
              }
            />
          </div>
        ) : null}
        <div
          ref={viewportRef}
          data-hpt-viewport=""
          className={theme.root.viewport}
          // While dragging, the reflowing candidate-tree layer is made inert so
          // native hit-testing / `elementFromPoint` can NEVER re-target to a pane
          // that just slid under the cursor (belt-and-suspenders with the root's
          // pointer capture). The captured pointer routes to `rootRef` (the
          // ancestor), not via descendant hit-testing, so input is unaffected; the
          // lifted pane, the drop indicator and the cursor are
          // `pointer-events-none` too. Restored the instant the FSM leaves `dragging`.
          style={
            dragState.phase === "dragging"
              ? { pointerEvents: "none" }
              : undefined
          }
        >
          {workspaceTransition != null ? (
            // N2: the set-mode wrapper asked for a switch transition. The
            // stage wraps the tree INSIDE the viewport so the frozen outgoing
            // clone and the incoming tree share the viewport's box; the
            // wrapper drives `begin` / `scrub` / `finish` through `stageRef`.
            // Mounted only when the resolved capability is not `"none"` —
            // otherwise the tree is the viewport's direct child exactly as
            // before.
            <WorkspaceTransitionStage
              ref={workspaceTransition.stageRef}
              viewportRef={viewportRef}
              mode={workspaceTransition.mode}
              onSettled={workspaceTransition.onSettled}
            >
              {treeElement}
            </WorkspaceTransitionStage>
          ) : (
            treeElement
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
          {dropIndicatorElement}
          {liftedElement}
          {dragCursorEnabled ? (
            <DragCursorOverlay
              pointer={dragPointer}
              presentation={dragCursorPresentation}
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
                controller.setSwitcher(null);
                activateLeaf(leafId);
              }}
            />
          ) : null}
        </div>
        {showPaneTabStrip && paneTabStripOptions.placement === "bottom" ? (
          <div className="mt-1.5 shrink-0">
            <PaneTabStrip
              tabs={paneStripTabs}
              options={paneTabStripOptions}
              prefersReducedMotion={prefersReducedMotion}
              onSelect={activateLeaf}
              onTabDoubleClickMaximize={
                tabDoubleClickMaximizeEnabled
                  ? (leafId: string): void => {
                      dispatchCommand(tabDoubleClickMaximizeCommand(leafId));
                    }
                  : null
              }
            />
          </div>
        ) : null}
        {paneIdentityMode === "stable" ? (
          // AFTER the viewport (a later sibling): React runs layout work in tree
          // order, so every slot's callback ref has registered before a pane
          // host's relocation effect runs; and INSIDE the root so root-level
          // pointer enter/leave (fiber-tree based) still sees relocated panes.
          <StablePanePool
            entries={stablePaneEntries}
            order={stablePanePoolOrder}
            poolRef={stablePanePoolRef}
            slotRegistry={stablePaneSlotRegistryRef}
            renderTile={renderTile}
          />
        ) : null}
      </div>
    </TilingThemeProvider>
    </OverlayPortalContainerContext.Provider>
  );
});

/** The single-layout renderer, typed to also accept the observability props. */
const TilingSingleLayoutRenderer =
  TilingRendererComponent as React.ForwardRefExoticComponent<
    TilingSingleLayoutRendererProps & React.RefAttributes<TilingCommandHandle>
  >;

/** A leaf id remembered per workspace, dropped once the leaf leaves that tree. */
function rememberedLeafInTree(
  memory: ReadonlyMap<string, string>,
  workspaceId: string,
  layout: TilingLayoutNode | null,
): string | undefined {
  const remembered: string | undefined = memory.get(workspaceId);
  if (remembered == null || layout == null) {
    return undefined;
  }
  return findLeafById(layout, remembered) != null ? remembered : undefined;
}

function withRemembered(
  memory: ReadonlyMap<string, string>,
  workspaceId: string,
  leafId: string | null,
): ReadonlyMap<string, string> {
  if ((memory.get(workspaceId) ?? null) === leafId) {
    return memory;
  }
  const next: Map<string, string> = new Map<string, string>(memory);
  if (leafId == null) {
    next.delete(workspaceId);
  } else {
    next.set(workspaceId, leafId);
  }
  return next;
}

/**
 * H6 — the set-wide seat census the wrapper hands the inner renderer: the
 * active tree's own (deduplicated, reading-order) tile ids, how many
 * workspaces seat each pool tile, and — under `keep-mounted` — the pool tiles
 * seated ONLY in inactive workspaces (with the first such workspace in tab
 * order). Pure; exported for tests.
 */
export interface TilingWorkspaceSeatCensus {
  /** Tile ids the active tree seats (deduplicated, reading order). */
  readonly activeTileIds: ReadonlyArray<string>;
  /** Seat count per tile id across the whole set (tiles seated ≥ 1 time). */
  readonly seatCounts: ReadonlyMap<string, number>;
  /** Pool tiles seated in no active-tree seat but in ≥ 1 inactive workspace. */
  readonly retainedPanes: ReadonlyArray<TilingRetainedPane>;
}

/** Build the {@link TilingWorkspaceSeatCensus} of `set` against the host tile pool. */
export function resolveWorkspaceSeatCensus(
  set: TilingWorkspaceSet,
  activeId: string,
  poolTileIds: ReadonlyArray<string>,
): TilingWorkspaceSeatCensus {
  const query = queryWorkspaceSet(set);
  const seatCounts: Map<string, number> = new Map<string, number>();
  const activeTileIds: string[] = [];
  const activeSeen: Set<string> = new Set<string>();
  for (const tileId of query.tileIds(activeId)) {
    if (!activeSeen.has(tileId)) {
      activeSeen.add(tileId);
      activeTileIds.push(tileId);
    }
  }
  const pool: Set<string> = new Set<string>(poolTileIds);
  const retained: TilingRetainedPane[] = [];
  const retainedSeen: Set<string> = new Set<string>();
  for (const workspace of set.workspaces) {
    const seenHere: Set<string> = new Set<string>();
    for (const tileId of query.tileIds(workspace.id)) {
      if (seenHere.has(tileId)) {
        continue;
      }
      seenHere.add(tileId);
      seatCounts.set(tileId, (seatCounts.get(tileId) ?? 0) + 1);
      if (
        workspace.id !== activeId &&
        !activeSeen.has(tileId) &&
        pool.has(tileId) &&
        !retainedSeen.has(tileId)
      ) {
        retainedSeen.add(tileId);
        retained.push({ tileId, workspaceId: workspace.id });
      }
    }
  }
  return { activeTileIds, seatCounts, retainedPanes: retained };
}

/** Stable fingerprint of an issue list — equal lists (same order) print the same string. */
export function workspaceSetIssueFingerprint(
  issues: ReadonlyArray<TilingWorkspaceSetIssue>,
): string {
  return issues
    .map(
      (issue: TilingWorkspaceSetIssue): string =>
        `${issue.kind}|${issue.workspaceId ?? ""}|${issue.leafId ?? ""}|${issue.tileId ?? ""}`,
    )
    .join("\n");
}

/** Default leaf id for a tile `orphanTiles: "seat-in-active"` seats from scratch. */
export function defaultSetRendererMintLeafId(tileId: string): string {
  return `leaf:${tileId}`;
}

/** Tab-order direction from `from` to `to` (`"next"` when either id is unknown). */
export function workspaceSwitchDirection(
  set: TilingWorkspaceSet,
  from: string,
  to: string,
): TilingWorkspaceTransitionDirection {
  const fromIndex: number = set.workspaces.findIndex(
    (workspace: TilingWorkspace): boolean => workspace.id === from,
  );
  const toIndex: number = set.workspaces.findIndex(
    (workspace: TilingWorkspace): boolean => workspace.id === to,
  );
  if (fromIndex === -1 || toIndex === -1) {
    return "next";
  }
  return toIndex < fromIndex ? "prev" : "next";
}

interface WorkspaceSwitchSentinelProps {
  readonly activeId: string;
  readonly onBeforeSwitch: (from: string, to: string) => void;
  readonly onAfterSwitch: (from: string, to: string) => void;
}

/**
 * N2 — the one React hook that runs after render but BEFORE the DOM mutates:
 * `getSnapshotBeforeUpdate`. When `activeId` changes for any reason the
 * wrapper did not itself route (a host that sets `workspaces.activeId`
 * directly, e.g. `useTilingWorkspaceTabs`), this is the last moment the
 * outgoing tree is still in the viewport and can be captured for the
 * transition; `componentDidUpdate` then settles the stage over the incoming
 * tree. Renders nothing.
 */
class WorkspaceSwitchSentinel extends React.Component<WorkspaceSwitchSentinelProps> {
  getSnapshotBeforeUpdate(prev: WorkspaceSwitchSentinelProps): null {
    if (prev.activeId !== this.props.activeId) {
      this.props.onBeforeSwitch(prev.activeId, this.props.activeId);
    }
    return null;
  }

  componentDidUpdate(prev: WorkspaceSwitchSentinelProps): void {
    if (prev.activeId !== this.props.activeId) {
      this.props.onAfterSwitch(prev.activeId, this.props.activeId);
    }
  }

  render(): null {
    return null;
  }
}

/**
 * Workspace-set mode of {@link TilingRenderer}: paints the active workspace's
 * tree through the single-layout renderer and folds every reported tree edit
 * back into the set (`setWorkspaceLayout`). Owns the per-workspace focus /
 * maximize memory for the uncontrolled case and the native workspace-tab drop
 * settle (`moveLeafToWorkspace` on a `kind: "workspace-tab"` hover). Dispatches
 * the workspace commands through the same inner `dispatchCommand` router
 * (empty-workspace fallback applies them locally when no inner renderer is
 * mounted).
 */
const TilingWorkspaceSetRendererComponent = React.forwardRef<
  TilingCommandHandle,
  TilingRendererWorkspaceSetProps & TilingRendererObservabilityProps
>(function TilingWorkspaceSetRenderer(
  {
    workspaces,
    onWorkspacesChange,
    onMoveLeaf,
    onWorkspaceSwitch,
    renderEmptyWorkspace,
    focusedLeafId,
    onFocusedLeafChange,
    maximizedLeafId,
    onMaximizedLeafChange,
    onExternalDrop,
    className,
    themeId,
    theme: themeProp,
    orphanTiles = "report",
    mintLeafId,
    onIntegrityIssues,
    inactiveWorkspaces = "unmount",
    workspaceDefaults,
    ...rest
  }: TilingRendererWorkspaceSetProps & TilingRendererObservabilityProps,
  ref: React.ForwardedRef<TilingCommandHandle>,
): React.ReactElement {
  const active: TilingWorkspace | null = activeWorkspace(workspaces);
  const activeId: string = active?.id ?? workspaces.activeId;
  const layout: TilingLayoutNode | null = active?.layout ?? null;

  // H6 — `tiles` is the WHOLE pool. Coverage is judged set-wide here; the
  // inner renderer only heals the tiles the ACTIVE tree seats itself, so a
  // tile seated only in an inactive workspace (or a pool tile no workspace
  // seats) is never pulled into the active tree by the coverage heal.
  const poolTileIds: ReadonlyArray<string> = React.useMemo(
    (): ReadonlyArray<string> => expectedTileIdsFromHostTiles(rest.tiles),
    [rest.tiles],
  );
  const census: TilingWorkspaceSeatCensus = React.useMemo(
    (): TilingWorkspaceSeatCensus =>
      resolveWorkspaceSeatCensus(workspaces, activeId, poolTileIds),
    [workspaces, activeId, poolTileIds],
  );
  const issues: ReadonlyArray<TilingWorkspaceSetIssue> = React.useMemo(
    (): ReadonlyArray<TilingWorkspaceSetIssue> =>
      orphanTiles === "ignore"
        ? []
        : workspaceSetIssues(workspaces, { expectedTileIds: poolTileIds }),
    [orphanTiles, workspaces, poolTileIds],
  );
  const issueFingerprint: string = workspaceSetIssueFingerprint(issues);
  const onIntegrityIssuesRef = React.useRef(onIntegrityIssues);
  onIntegrityIssuesRef.current = onIntegrityIssues;
  // `"report"` / `"seat-in-active"`: deliver the issue list when it CHANGES
  // (fingerprint), including the transition back to clean. A set that mounts
  // clean fires nothing.
  const reportedFingerprintRef = React.useRef<string>("");
  React.useEffect((): void => {
    if (orphanTiles === "ignore") {
      return;
    }
    if (reportedFingerprintRef.current === issueFingerprint) {
      return;
    }
    reportedFingerprintRef.current = issueFingerprint;
    onIntegrityIssuesRef.current?.(issues);
  }, [orphanTiles, issueFingerprint, issues]);
  const retainedPanes: ReadonlyArray<TilingRetainedPane> | undefined =
    inactiveWorkspaces === "keep-mounted" ? census.retainedPanes : undefined;

  // Per-workspace memory for the UNCONTROLLED focus / maximize case: the
  // inner renderer is driven controlled from here so a switch restores the
  // workspace's own pane and never inherits the previous one's maximize. A
  // host that passes `focusedLeafId` / `maximizedLeafId` owns the scoping.
  const [focusMemory, setFocusMemory] = React.useState<
    ReadonlyMap<string, string>
  >(() => new Map<string, string>());
  const [maximizeMemory, setMaximizeMemory] = React.useState<
    ReadonlyMap<string, string>
  >(() => new Map<string, string>());
  const focusControlledByHost: boolean = focusedLeafId !== undefined;
  const maximizeControlledByHost: boolean = maximizedLeafId !== undefined;
  const effectiveFocusedLeafId: string | null | undefined = focusControlledByHost
    ? focusedLeafId
    : rememberedLeafInTree(focusMemory, activeId, layout);
  const effectiveMaximizedLeafId: string | null | undefined =
    maximizeControlledByHost
      ? maximizedLeafId
      : (rememberedLeafInTree(maximizeMemory, activeId, layout) ?? null);

  const workspacesRef = React.useRef<TilingWorkspaceSet>(workspaces);
  workspacesRef.current = workspaces;
  const workspaceDefaultsRef = React.useRef<TilingWorkspaceSet | undefined>(workspaceDefaults);
  workspaceDefaultsRef.current = workspaceDefaults;
  const onWorkspacesChangeRef = React.useRef(onWorkspacesChange);
  onWorkspacesChangeRef.current = onWorkspacesChange;
  const onMoveLeafRef = React.useRef(onMoveLeaf);
  onMoveLeafRef.current = onMoveLeaf;
  const onWorkspaceSwitchRef = React.useRef(onWorkspaceSwitch);
  onWorkspaceSwitchRef.current = onWorkspaceSwitch;
  const innerHandleRef = React.useRef<TilingCommandHandle | null>(null);
  const interactionCapabilities: ResolvedTilingInteractionCapabilities =
    resolveInteractionCapabilities(rest.interaction);
  const workspacesEnabled: boolean = interactionCapabilities.workspaces.enable;
  const followMovedLeaf: boolean = interactionCapabilities.workspaces.followMovedLeaf;
  const workspacesEnabledRef = React.useRef<boolean>(workspacesEnabled);
  workspacesEnabledRef.current = workspacesEnabled;
  const followMovedLeafRef = React.useRef<boolean>(followMovedLeaf);
  followMovedLeafRef.current = followMovedLeaf;
  const focusedLeafRef = React.useRef<string | null>(effectiveFocusedLeafId ?? null);
  focusedLeafRef.current = effectiveFocusedLeafId ?? null;

  // H6 `orphanTiles: "seat-in-active"`: repair once per offending set
  // identity — the host applies the emitted set (issues → empty) or ignores
  // it (same identity seen again → no second emission).
  const repairedSetRef = React.useRef<TilingWorkspaceSet | null>(null);
  const mintLeafIdRef = React.useRef(mintLeafId);
  mintLeafIdRef.current = mintLeafId;
  React.useLayoutEffect((): void => {
    if (orphanTiles !== "seat-in-active" || issues.length === 0) {
      return;
    }
    if (repairedSetRef.current === workspaces) {
      return;
    }
    repairedSetRef.current = workspaces;
    const repaired = repairWorkspaceSet(workspaces, {
      expectedTileIds: poolTileIds,
      orphanPlacement: TILING_DEFAULT_WORKSPACE_PLACEMENT,
      mintLeafId: mintLeafIdRef.current ?? defaultSetRendererMintLeafId,
    });
    if (repaired.set !== workspaces) {
      onWorkspacesChangeRef.current(repaired.set);
    }
  }, [orphanTiles, issues, workspaces, poolTileIds]);

  // N2 — switch transition. The stage lives inside the inner renderer's
  // viewport; the wrapper owns WHEN it begins (before the tree swaps) and
  // settles (after). Every switch routed through `applyWorkspaceCommand`
  // begins here with the exact direction; a host-driven `activeId` change
  // is caught by `WorkspaceSwitchSentinel` (pre-mutation) with the tab-order
  // direction. `transitionArmedForRef` makes `begin` idempotent per target,
  // so a swipe that already captured the outgoing view at tracking start is
  // not re-captured (and its scrub progress not reset) when it commits.
  const transitionMode: TilingWorkspaceTransitionMode = workspacesEnabled
    ? interactionCapabilities.workspaces.switch.transition
    : "none";
  const transitionStageRef = React.useRef<UseWorkspaceTransitionResult | null>(null);
  const transitionArmedForRef = React.useRef<string | null>(null);
  const emittedSwitchToRef = React.useRef<string | null>(null);
  // N1 × N2 settle gate: the swipe FSM's `SETTLE_DONE` waits for the stage.
  // The driver hands over `done` on entry to `settling`; it is held here
  // until the stage reports settled (`onSettled`), or released at once when
  // no transition is in flight for this swipe. At most one hold at a time —
  // the swipe FSM cannot start a second gesture while one is settling.
  const swipeSettleHoldRef = React.useRef<(() => void) | null>(null);
  const releaseSwipeSettleHold = React.useCallback((): void => {
    const done: (() => void) | null = swipeSettleHoldRef.current;
    if (done == null) {
      return;
    }
    swipeSettleHoldRef.current = null;
    done();
  }, []);
  const beginSwitchTransition = React.useCallback(
    (to: string, direction: TilingWorkspaceTransitionDirection): void => {
      const stage: UseWorkspaceTransitionResult | null = transitionStageRef.current;
      if (stage == null || transitionArmedForRef.current === to) {
        return;
      }
      // `begin` for another target drops the in-flight clone without a
      // settle: a swipe settle held on that clone would never be released.
      releaseSwipeSettleHold();
      transitionArmedForRef.current = to;
      stage.begin({ direction });
    },
    [releaseSwipeSettleHold],
  );
  const handleBeforeSwitch = React.useCallback(
    (from: string, to: string): void => {
      beginSwitchTransition(to, workspaceSwitchDirection(workspacesRef.current, from, to));
    },
    [beginSwitchTransition],
  );
  const handleAfterSwitch = React.useCallback((): void => {
    emittedSwitchToRef.current = null;
    if (transitionArmedForRef.current == null) {
      return;
    }
    transitionArmedForRef.current = null;
    const stage: UseWorkspaceTransitionResult | null = transitionStageRef.current;
    if (stage == null) {
      // Switched into an EMPTY workspace: no stage is mounted to finish, so
      // nothing would report settled — release a held swipe settle here.
      releaseSwipeSettleHold();
      return;
    }
    stage.finish("commit");
  }, [releaseSwipeSettleHold]);
  const handleTransitionSettled = React.useCallback(
    (_kind: WorkspaceTransitionSettleKind): void => {
      releaseSwipeSettleHold();
    },
    [releaseSwipeSettleHold],
  );
  // A switch the host never applied (or one into / out of an EMPTY workspace,
  // where no stage is mounted) must not leave a stale "switch pending" mark.
  React.useEffect((): void => {
    emittedSwitchToRef.current = null;
  }, [activeId, workspaces]);
  const workspaceTransition: TilingWorkspaceTransitionBridge | undefined = React.useMemo(
    (): TilingWorkspaceTransitionBridge | undefined =>
      transitionMode === "none"
        ? undefined
        : {
            mode: transitionMode,
            stageRef: transitionStageRef,
            onSettled: handleTransitionSettled,
          },
    [transitionMode, handleTransitionSettled],
  );
  /**
   * The driver's `settleGate`. Immediate when nothing animates this swipe
   * (`transition: "none"`, no stage mounted, or the stage was never armed
   * for it); otherwise `done` is held until the stage settles. A cancel — or
   * a "commit" whose switch was refused (no neighbour, host declined) —
   * finishes the stage back to the outgoing view now; a real commit is
   * finished by `WorkspaceSwitchSentinel` (`handleAfterSwitch`) once the
   * incoming tree is in the DOM.
   */
  const gateSwipeSettle = React.useCallback(
    (outcome: TilingWorkspaceSwipeOutcome, done: () => void): void => {
      const stage: UseWorkspaceTransitionResult | null = transitionStageRef.current;
      if (transitionMode === "none" || stage == null || transitionArmedForRef.current == null) {
        done();
        return;
      }
      releaseSwipeSettleHold();
      swipeSettleHoldRef.current = done;
      if (outcome === "cancel" || emittedSwitchToRef.current == null) {
        transitionArmedForRef.current = null;
        stage.finish("cancel");
      }
    },
    [transitionMode, releaseSwipeSettleHold],
  );

  const handleLayoutChange = React.useCallback(
    (nextLayout: TilingLayoutNode): void => {
      const current: TilingWorkspaceSet = workspacesRef.current;
      const next: TilingWorkspaceSet = setWorkspaceLayout(
        current,
        current.activeId,
        nextLayout,
      );
      if (next !== current) {
        onWorkspacesChangeRef.current(next);
      }
    },
    [],
  );

  const handleFocusedLeafChange = React.useCallback(
    (leafId: string): void => {
      setFocusMemory(
        (memory: ReadonlyMap<string, string>): ReadonlyMap<string, string> =>
          withRemembered(memory, workspacesRef.current.activeId, leafId),
      );
      onFocusedLeafChange?.(leafId);
    },
    [onFocusedLeafChange],
  );

  const handleMaximizedLeafChange = React.useCallback(
    (leafId: string | null): void => {
      setMaximizeMemory(
        (memory: ReadonlyMap<string, string>): ReadonlyMap<string, string> =>
          withRemembered(memory, workspacesRef.current.activeId, leafId),
      );
      onMaximizedLeafChange?.(leafId);
    },
    [onMaximizedLeafChange],
  );

  // Native workspace-tab settle (§5.5 claim-before-settle): the inner renderer
  // fires this synchronously on release BEFORE the FSM settles `claimed`, so
  // the moved set lands in the same tick and nothing settles home. Any
  // other external hover is the host's to claim through its own callback.
  const handleExternalDrop: TilingOnExternalDrop = React.useCallback(
    (
      leafId: string,
      targetId: string,
      point: TilingClientPoint,
      hover: TilingExternalDragHover,
    ): boolean => {
      if (hover.kind !== "workspace-tab") {
        // Not a tab: the host's claim (absent host callback → decline, i.e.
        // the same cancel single-layout mode does without one).
        return (
          onExternalDrop != null &&
          onExternalDrop(leafId, targetId, point, hover) !== false
        );
      }
      const current: TilingWorkspaceSet = workspacesRef.current;
      const from: string = current.activeId;
      const moved: TilingWorkspaceSet = moveLeafToWorkspace(
        current,
        leafId,
        hover.workspaceId,
        hover.placement,
      );
      if (moved === current) {
        // Unknown destination workspace (or a no-op re-seat): decline the
        // claim so the release settles through the ordinary cancel.
        return false;
      }
      // `followMovedLeaf` lands move + switch in ONE `onWorkspacesChange`, the
      // same edge `move-leaf-to-workspace` takes. A host switching afterwards
      // from `onMoveLeaf` would paint an intermediate set with the leaf seated
      // only in an inactive workspace — under `inactiveWorkspaces: "unmount"`
      // that remounts the pane and drops its local state.
      const follow: boolean = followMovedLeafRef.current;
      const next: TilingWorkspaceSet = follow
        ? switchWorkspace(moved, hover.workspaceId)
        : moved;
      if (next.activeId !== from) {
        emittedSwitchToRef.current = next.activeId;
        beginSwitchTransition(
          next.activeId,
          workspaceSwitchDirection(current, from, next.activeId),
        );
      }
      onWorkspacesChangeRef.current(next);
      onMoveLeafRef.current?.(leafId, from, hover.workspaceId);
      if (next.activeId !== from) {
        onWorkspaceSwitchRef.current?.({ from, to: next.activeId, via: "tab-drop" });
        setFocusMemory(
          (memory: ReadonlyMap<string, string>): ReadonlyMap<string, string> =>
            withRemembered(memory, next.activeId, leafId),
        );
      }
      return true;
    },
    [beginSwitchTransition, onExternalDrop],
  );

  const applyWorkspaceCommand = React.useCallback(
    (
      command: Extract<
        TilingCommand,
        {
          kind:
            | "switch-workspace"
            | "cycle-workspace"
            | "move-leaf-to-workspace"
            | "reveal-tile"
            | "reset-workspace"
            | "reset-workspaces";
        }
      >,
      via: TilingWorkspaceCommandDispatchVia,
    ): boolean => {
      if (!workspacesEnabledRef.current) {
        return false;
      }
      const current: TilingWorkspaceSet = workspacesRef.current;
      const from: string = current.activeId;
      const switchVia: TilingWorkspaceSwitchVia =
        command.kind === "reveal-tile" ? "reveal" : via;
      let next: TilingWorkspaceSet = current;
      let revealLeafId: string | null = null;
      let revealWorkspaceId: string | null = null;

      switch (command.kind) {
        case "switch-workspace": {
          const workspaceId: string | undefined =
            "index" in command
              ? current.workspaces[command.index - 1]?.id
              : command.workspaceId;
          if (workspaceId == null) {
            return false;
          }
          next = switchWorkspace(current, workspaceId);
          break;
        }
        case "cycle-workspace": {
          next = cycleWorkspace(current, command.direction);
          break;
        }
        case "move-leaf-to-workspace": {
          const leafId: string | null = command.leafId ?? focusedLeafRef.current;
          if (leafId == null) {
            return false;
          }
          const targetId: string | null =
            "workspaceId" in command
              ? command.workspaceId
              : queryWorkspaceSet(current).neighbour(
                  current.activeId,
                  command.direction,
                );
          if (targetId == null) {
            return false;
          }
          const moved: TilingWorkspaceSet = moveLeafToWorkspace(
            current,
            leafId,
            targetId,
            command.placement,
          );
          if (moved === current) {
            return false;
          }
          const follow: boolean = command.follow ?? followMovedLeafRef.current;
          next = follow ? switchWorkspace(moved, targetId) : moved;
          if (follow) {
            setFocusMemory(
              (memory: ReadonlyMap<string, string>): ReadonlyMap<string, string> =>
                withRemembered(memory, targetId, leafId),
            );
          }
          break;
        }
        case "reveal-tile": {
          // Engine `revealTile` prefers the active workspace when it shows the
          // tile, else the first in tab order; activates a grouped member tab.
          const revealed: TilingRevealTileResult | null = revealTile(
            current,
            command.tileId,
            current.activeId,
          );
          if (revealed == null) {
            return false;
          }
          next = revealed.set;
          revealLeafId = revealed.leafId;
          revealWorkspaceId = revealed.workspaceId;
          break;
        }
        case "reset-workspace": {
          const defaults: TilingWorkspaceSet | undefined = workspaceDefaultsRef.current;
          if (defaults == null) {
            return false;
          }
          next = resetWorkspaceLayout(
            current,
            defaults,
            command.workspaceId ?? current.activeId,
          );
          break;
        }
        case "reset-workspaces": {
          const defaults: TilingWorkspaceSet | undefined = workspaceDefaultsRef.current;
          if (defaults == null) {
            return false;
          }
          next = resetWorkspaceSet(current, defaults);
          break;
        }
      }

      const focusAlready: boolean =
        revealLeafId != null &&
        focusedLeafRef.current === revealLeafId &&
        current.activeId === revealWorkspaceId;
      if (next === current && (revealLeafId == null || focusAlready)) {
        return false;
      }
      if (next.activeId !== from) {
        // N2: capture the outgoing tree BEFORE the host applies the switch.
        // A cycle carries its own direction (wrap-around safe); everything
        // else compares tab-order positions.
        emittedSwitchToRef.current = next.activeId;
        beginSwitchTransition(
          next.activeId,
          command.kind === "cycle-workspace"
            ? command.direction === "previous"
              ? "prev"
              : "next"
            : workspaceSwitchDirection(current, from, next.activeId),
        );
      }
      if (next !== current) {
        onWorkspacesChangeRef.current(next);
      }
      if (next.activeId !== from) {
        onWorkspaceSwitchRef.current?.({
          from,
          to: next.activeId,
          via: switchVia,
        });
      }
      if (revealLeafId != null && revealWorkspaceId != null) {
        setFocusMemory(
          (memory: ReadonlyMap<string, string>): ReadonlyMap<string, string> =>
            withRemembered(memory, revealWorkspaceId, revealLeafId),
        );
        onFocusedLeafChange?.(revealLeafId);
      }
      return true;
    },
    [beginSwitchTransition, onFocusedLeafChange],
  );

  React.useImperativeHandle(
    ref,
    (): TilingCommandHandle => ({
      dispatch: (command: TilingCommand): void => {
        if (innerHandleRef.current != null) {
          innerHandleRef.current.dispatch(command);
          return;
        }
        if (isWorkspaceNavigationCommand(command)) {
          applyWorkspaceCommand(command, "command");
        }
      },
    }),
    [applyWorkspaceCommand],
  );

  // N1 — swipe navigation. The FSM runs over the wheel / touch ports attached
  // to the (inner or empty-shell) `hpt-root`; a committed swipe dispatches its
  // `cycle-workspace` through `applyWorkspaceCommand(…, "swipe")` so it shares
  // the keymap / handle path (enable gate, `onWorkspaceSwitch`).
  const switchCapability: ResolvedTilingWorkspaceSwitchCapability =
    interactionCapabilities.workspaces.switch;
  const wheelSwipe: boolean = workspacesEnabled && switchCapability.wheelSwipe;
  const touchSwipe: boolean = workspacesEnabled && switchCapability.touchSwipe;
  const swipeEnabled: boolean = wheelSwipe || touchSwipe;
  const [swipeHostElement, setSwipeHostElement] = React.useState<HTMLDivElement | null>(null);
  const [dragGestureActive, setDragGestureActive] = React.useState<boolean>(false);
  const swipeStore: TilingWorkspaceSwipeStore = useWorkspaceSwipeStore();
  const activeIndex: number = workspaces.workspaces.findIndex(
    (workspace: TilingWorkspace): boolean => workspace.id === activeId,
  );
  const dispatchSwipeCommand = React.useCallback(
    (command: TilingCommand): void => {
      if (isWorkspaceNavigationCommand(command)) {
        applyWorkspaceCommand(command, "swipe");
      }
    },
    [applyWorkspaceCommand],
  );
  useWorkspaceSwipeDriver({
    store: swipeStore,
    element: swipeHostElement,
    wheel: wheelSwipe,
    touch: touchSwipe,
    config: switchCapability.swipe,
    hasPrev: activeIndex > 0,
    hasNext: activeIndex >= 0 && activeIndex < workspaces.workspaces.length - 1,
    dragActive: dragGestureActive,
    dispatch: dispatchSwipeCommand,
    settleGate: gateSwipeSettle,
  });
  // N2 × N1: while a swipe TRACKS, the stage follows the finger. `begin` at
  // the first tracking sample (the outgoing tree is still live; idempotent
  // per target), `scrub` on every sample. Imperative subscription — a 60 Hz
  // wheel stream must not re-render the tree. The settle itself is owned by
  // `gateSwipeSettle` (cancel → `finish("cancel")` at once; commit → the
  // sentinel finishes once the incoming tree is in the DOM); the cancel
  // branch below is the backstop for a gesture that left `tracking` with the
  // stage still armed and no gate having run.
  React.useEffect((): (() => void) | void => {
    if (transitionMode === "none" || !swipeEnabled) {
      return;
    }
    let wasTracking: boolean = false;
    return swipeStore.subscribe((): void => {
      const snapshot = swipeStore.getSnapshot();
      if (snapshot.phase === "tracking") {
        wasTracking = true;
        if (snapshot.target == null) {
          return;
        }
        const current: TilingWorkspaceSet = workspacesRef.current;
        const to: string | null = queryWorkspaceSet(current).neighbour(
          current.activeId,
          snapshot.target === "prev" ? "previous" : "next",
        );
        if (to == null) {
          return;
        }
        beginSwitchTransition(to, snapshot.target);
        transitionStageRef.current?.scrub(snapshot.progress);
        return;
      }
      if (snapshot.phase === "settling") {
        // Held by `gateSwipeSettle` until the stage settles; the driver has
        // already dispatched the commit command (which marks
        // `emittedSwitchToRef`) by the time it called the gate.
        return;
      }
      if (!wasTracking) {
        return;
      }
      wasTracking = false;
      if (emittedSwitchToRef.current != null || transitionArmedForRef.current == null) {
        return;
      }
      transitionArmedForRef.current = null;
      transitionStageRef.current?.finish("cancel");
    });
  }, [transitionMode, swipeEnabled, swipeStore, beginSwitchTransition]);
  const swipeRootStyle: React.CSSProperties | undefined = swipeEnabled
    ? {
        overscrollBehaviorX: "contain",
        ...(touchSwipe ? { touchAction: "pan-y" } : {}),
      }
    : undefined;
  // Only observe the root / drag state when a swipe input is on, so the
  // default (swipe off) mounts with the same render count as before N1.
  const observeSwipeHost: ((element: HTMLDivElement | null) => void) | undefined = swipeEnabled
    ? setSwipeHostElement
    : undefined;
  const observeDragGesture: ((active: boolean) => void) | undefined = swipeEnabled
    ? setDragGestureActive
    : undefined;

  // N3 — spring-loaded tab drop. The pure dwell FSM
  // (`engine/workspace-spring-load.ts`) runs here in refs — no render per
  // event — over the external hover the inner renderer resolves and the drag
  // identity it reports; ONE scheduler timer per dwell fires `TICK`. On
  // `fired` the wrapper runs commit-and-rearm in the module doc's order:
  // capture the pointer + last point, move the leaf and switch the set
  // (`beginSwitchTransition` first, like `applyWorkspaceCommand`), emit the
  // three callbacks, remember the leaf as the destination's focused leaf, end
  // the live drag as a claimed commit through the inner channel (which keeps
  // pointer capture and queues the `REARM` for the destination tree), then
  // `RESET`. Off by default: with `springLoad` null nothing below subscribes
  // and the inner renderer receives no bridge.
  const springLoadConfig: TilingSpringLoadConfig | null = workspacesEnabled
    ? interactionCapabilities.workspaces.springLoad
    : null;
  const springLoadEnabled: boolean = springLoadConfig != null;
  const springLoadConfigRef = React.useRef<TilingSpringLoadConfig | null>(springLoadConfig);
  springLoadConfigRef.current = springLoadConfig;
  const springLoadStateRef = React.useRef<TilingSpringLoadState>(TILING_SPRING_LOAD_INITIAL_STATE);
  const springLoadTimerRef = React.useRef<number | null>(null);
  const springLoadChannelRef = React.useRef<TilingSpringLoadChannel | null>(null);
  const dragIdentityRef = React.useRef<TilingDragIdentity>(IDLE_DRAG_IDENTITY);
  const springLoadResolvedHoverRef = React.useRef<TilingExternalDragHover | null>(null);
  const externalDragHoverPropRef = React.useRef<TilingExternalDragHover | null>(
    rest.externalDragHover ?? null,
  );
  externalDragHoverPropRef.current = rest.externalDragHover ?? null;
  const hostOnExternalDragHoverChangeRef = React.useRef(rest.onExternalDragHoverChange);
  hostOnExternalDragHoverChangeRef.current = rest.onExternalDragHoverChange;
  const clearSpringLoadTimer = React.useCallback((): void => {
    if (springLoadTimerRef.current != null) {
      WINDOW_SCHEDULER_PORT.clearTimer(springLoadTimerRef.current);
      springLoadTimerRef.current = null;
    }
  }, []);
  const runSpringLoadCommitRef = React.useRef<(intent: TilingSpringLoadIntent) => void>(
    (): void => {},
  );
  const sendSpringLoad = React.useCallback(
    (event: TilingSpringLoadEvent): void => {
      const config: TilingSpringLoadConfig | null = springLoadConfigRef.current;
      if (config == null && event.type === "HOVER") {
        // Disabled: no dwell ever starts (DRAG_END / RESET still clear one
        // that was in flight when the capability went off).
        return;
      }
      const before: TilingSpringLoadState = springLoadStateRef.current;
      const next: TilingSpringLoadState = springLoadReducer(
        before,
        event,
        config ?? TILING_SPRING_LOAD_DEFAULTS,
      );
      if (next === before) {
        return;
      }
      springLoadStateRef.current = next;
      if (next.phase === "dwelling") {
        // Arm (or re-arm on a restarted dwell) the single TICK timer.
        if (
          before.phase !== "dwelling" ||
          before.since !== next.since ||
          before.workspaceId !== next.workspaceId
        ) {
          clearSpringLoadTimer();
          const fireAt: number | null = springLoadFireAt(next, config ?? TILING_SPRING_LOAD_DEFAULTS);
          const delay: number = Math.max(0, (fireAt ?? 0) - WINDOW_SCHEDULER_PORT.now());
          springLoadTimerRef.current = WINDOW_SCHEDULER_PORT.setTimer((): void => {
            springLoadTimerRef.current = null;
            sendSpringLoad({ type: "TICK", ts: WINDOW_SCHEDULER_PORT.now() });
          }, delay);
        }
        return;
      }
      clearSpringLoadTimer();
      if (next.phase === "fired") {
        runSpringLoadCommitRef.current(next.intent);
      }
    },
    [clearSpringLoadTimer],
  );
  runSpringLoadCommitRef.current = (intent: TilingSpringLoadIntent): void => {
    const channel: TilingSpringLoadChannel | null = springLoadChannelRef.current;
    const identity: TilingDragIdentity = dragIdentityRef.current;
    const current: TilingWorkspaceSet = workspacesRef.current;
    const from: string = current.activeId;
    const hover: TilingExternalDragHover | null =
      externalDragHoverPropRef.current ?? springLoadResolvedHoverRef.current;
    if (
      channel == null ||
      identity.phase !== "dragging" ||
      identity.pointerId == null ||
      identity.pointerType == null ||
      identity.sourceLeafId !== intent.leafId ||
      intent.workspaceId === from
    ) {
      sendSpringLoad({ type: "RESET" });
      return;
    }
    const moved: TilingWorkspaceSet = moveLeafToWorkspace(
      current,
      intent.leafId,
      intent.workspaceId,
      intent.placement,
    );
    if (moved === current) {
      // Unknown destination (or a no-op re-seat): nothing to commit; the
      // release then settles through the ordinary path.
      sendSpringLoad({ type: "RESET" });
      return;
    }
    const next: TilingWorkspaceSet = switchWorkspace(moved, intent.workspaceId);
    // (a) the pointer identity + last processed point, before anything
    // settles; the parked pointer may not move again before the rearm.
    const client: DragMachinePoint = channel.lastClientPoint() ??
      (hover != null ? { x: hover.point.x, y: hover.point.y } : { x: 0, y: 0 });
    const request: TilingSpringLoadRearmRequest = {
      pointerId: identity.pointerId,
      pointerType: identity.pointerType,
      leafId: intent.leafId,
      workspaceId: intent.workspaceId,
      fromWorkspaceId: from,
      client,
    };
    // (b) move + switch through the same edges `applyWorkspaceCommand` takes.
    emittedSwitchToRef.current = next.activeId;
    beginSwitchTransition(
      next.activeId,
      workspaceSwitchDirection(current, from, next.activeId),
    );
    onWorkspacesChangeRef.current(next);
    onMoveLeafRef.current?.(intent.leafId, from, intent.workspaceId);
    onWorkspaceSwitchRef.current?.({ from, to: intent.workspaceId, via: "spring-load" });
    setFocusMemory(
      (memory: ReadonlyMap<string, string>): ReadonlyMap<string, string> =>
        withRemembered(memory, intent.workspaceId, intent.leafId),
    );
    // (c) end the live drag as the claimed external commit; the inner
    // renderer keeps pointer capture and re-arms once the destination tree
    // renders with the leaf.
    channel.commitAndQueueRearm(request);
    // (d) the dwell is spent; a re-armed drag starts a fresh one over a tab.
    sendSpringLoad({ type: "RESET" });
  };
  /** Feed the current external hover (prop over resolved) as a `HOVER` event. */
  const feedSpringLoadHover = React.useCallback((): void => {
    const identity: TilingDragIdentity = dragIdentityRef.current;
    sendSpringLoad({
      type: "HOVER",
      hover: externalDragHoverPropRef.current ?? springLoadResolvedHoverRef.current,
      leafId: identity.phase === "dragging" ? identity.sourceLeafId : null,
      activeWorkspaceId: workspacesRef.current.activeId,
      ts: WINDOW_SCHEDULER_PORT.now(),
    });
  }, [sendSpringLoad]);
  const handleDragIdentityChange = React.useCallback(
    (identity: TilingDragIdentity): void => {
      const previous: TilingDragIdentity = dragIdentityRef.current;
      dragIdentityRef.current = identity;
      if (identity.phase === "dragging") {
        if (previous.phase !== "dragging" || previous.pointerId !== identity.pointerId) {
          // A pickup (or a rearm) under a hover that is already a tab starts
          // the dwell without waiting for the next hover change.
          feedSpringLoadHover();
        }
        return;
      }
      if (previous.phase === "dragging") {
        // Step 5: the drag left `dragging` (release, cancel, watchdog,
        // visibility — or the claimed commit of step 3c, after which the
        // machine is already idle so this is a no-op).
        sendSpringLoad({ type: "DRAG_END" });
      }
    },
    [feedSpringLoadHover, sendSpringLoad],
  );
  const handleExternalDragHoverChange = React.useCallback(
    (hover: TilingExternalDragHover | null): void => {
      springLoadResolvedHoverRef.current = hover;
      feedSpringLoadHover();
      hostOnExternalDragHoverChangeRef.current?.(hover);
    },
    [feedSpringLoadHover],
  );
  const externalDragHoverProp: TilingExternalDragHover | null | undefined = rest.externalDragHover;
  React.useEffect((): void => {
    if (!springLoadEnabled) {
      return;
    }
    feedSpringLoadHover();
  }, [springLoadEnabled, externalDragHoverProp, feedSpringLoadHover]);
  React.useEffect((): (() => void) | void => {
    if (springLoadEnabled) {
      return;
    }
    // Capability went off (or was never on): drop any dwell in flight.
    sendSpringLoad({ type: "RESET" });
    clearSpringLoadTimer();
  }, [springLoadEnabled, sendSpringLoad, clearSpringLoadTimer]);
  React.useEffect((): (() => void) => clearSpringLoadTimer, [clearSpringLoadTimer]);
  const springLoadBridge: TilingSpringLoadBridge | undefined = React.useMemo(
    (): TilingSpringLoadBridge | undefined =>
      springLoadEnabled
        ? { onDragIdentityChange: handleDragIdentityChange, channelRef: springLoadChannelRef }
        : undefined,
    [springLoadEnabled, handleDragIdentityChange],
  );

  if (layout == null) {
    const theme: TilingTheme = themeProp ?? resolveTilingTheme(themeId);
    return (
      <TilingThemeProvider theme={theme}>
        <div
          ref={observeSwipeHost}
          tabIndex={-1}
          style={swipeRootStyle}
          className={cn("hpt-root", theme.root.container, className)}
          data-hpt-workspace-id={activeId}
          data-hpt-workspace-empty=""
        >
          {active != null ? renderEmptyWorkspace?.(active) : null}
        </div>
        {workspaceTransition != null ? (
          <WorkspaceSwitchSentinel
            activeId={activeId}
            onBeforeSwitch={handleBeforeSwitch}
            onAfterSwitch={handleAfterSwitch}
          />
        ) : null}
      </TilingThemeProvider>
    );
  }
  return (
    <>
      <TilingSingleLayoutRenderer
        {...rest}
        ref={innerHandleRef}
        className={className}
        themeId={themeId}
        theme={themeProp}
        layout={layout}
        onLayoutChange={handleLayoutChange}
        focusedLeafId={effectiveFocusedLeafId}
        onFocusedLeafChange={handleFocusedLeafChange}
        maximizedLeafId={effectiveMaximizedLeafId}
        onMaximizedLeafChange={handleMaximizedLeafChange}
        onExternalDrop={handleExternalDrop}
        workspaceCommandsEnabled
        onWorkspaceCommand={applyWorkspaceCommand}
        onRootElementChange={observeSwipeHost}
        onDragGestureActiveChange={observeDragGesture}
        rootStyle={swipeRootStyle}
        expectedTileIds={census.activeTileIds}
        workspaceId={activeId}
        tileSeatCounts={census.seatCounts}
        retainedPanes={retainedPanes}
        workspaceTransition={workspaceTransition}
        onExternalDragHoverChange={
          springLoadEnabled ? handleExternalDragHoverChange : rest.onExternalDragHoverChange
        }
        springLoad={springLoadBridge}
      />
      {workspaceTransition != null ? (
        <WorkspaceSwitchSentinel
          activeId={activeId}
          onBeforeSwitch={handleBeforeSwitch}
          onAfterSwitch={handleAfterSwitch}
        />
      ) : null}
    </>
  );
});

function isWorkspaceSetProps(
  props: TilingRendererModeProps & TilingRendererObservabilityProps,
): props is TilingRendererWorkspaceSetProps & TilingRendererObservabilityProps {
  return "workspaces" in props && props.workspaces != null;
}

const TilingRendererModeSwitch = React.forwardRef<
  TilingCommandHandle,
  TilingRendererModeProps & TilingRendererObservabilityProps
>(function TilingRenderer(
  props: TilingRendererModeProps & TilingRendererObservabilityProps,
  ref: React.ForwardedRef<TilingCommandHandle>,
): React.ReactElement {
  if (isWorkspaceSetProps(props)) {
    return <TilingWorkspaceSetRendererComponent {...props} ref={ref} />;
  }
  return <TilingSingleLayoutRenderer {...props} ref={ref} />;
});

/**
 * The controlled tiling renderer — the single component a consumer mounts.
 * Accepts either a controlled `layout` ({@link TilingRendererProps}) or a
 * controlled workspace set ({@link TilingRendererWorkspaceSetProps}); the
 * two are discriminated by the presence of `workspaces`. The public prop
 * surface is the curated, debug-free contract. The underlying component also
 * accepts the devtools-tier `TilingRendererObservabilityProps`; that widened
 * view is exported as `TilingRenderer` from `@n-uf/hypr-tiling/devtools` for
 * the observability panel.
 */
export const TilingRenderer =
  TilingRendererModeSwitch as React.ForwardRefExoticComponent<
    TilingRendererModeProps & React.RefAttributes<TilingCommandHandle>
  >;

/**
 * The observability-instrumented view of {@link TilingRenderer}: the SAME
 * component, typed to also accept {@link TilingRendererObservabilityProps} (the
 * drag/drop observability overlays, hit-zone visualizations, and telemetry
 * feeds). Exported through `@n-uf/hypr-tiling/devtools` for the observability
 * panel; consumers use the clean `.` renderer instead.
 */
export const TilingRendererWithObservability =
  TilingRendererModeSwitch as React.ForwardRefExoticComponent<
    TilingRendererModeProps &
      TilingRendererObservabilityProps &
      React.RefAttributes<TilingCommandHandle>
  >;

export function isLeafNode(node: TilingLayoutNode): node is TilingLeafNode {
  return node.kind === "leaf";
}
