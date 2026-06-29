import {
  DEFAULT_DRAG_RERESOLVE_DELTA_PX,
  DEFAULT_DRAG_SLOT_COMMITMENT_MODE,
  DEFAULT_TOUCH_LONG_PRESS_MS,
} from "./drag-machine";
import {
  DRAG_RECOVERY_DEFAULT_FRAME_DEADLINE_MS,
  DRAG_RECOVERY_DEFAULT_MAX_DRAGGING_IDLE_MS,
  DRAG_RECOVERY_DEFAULT_TRANSITION_SLACK_MS,
} from "./drag-recovery";
import { DEFAULT_GHOST_PICKUP_SCALE_PERCENT, clampGhostPickupScalePercent } from "./ghost-transit";
import { DYNAMIC_DROP_INTENT_CONFIG } from "./drop-intent-resolver";
import { TILING_KEYMAP_DEFAULTS, resolveKeymap } from "./pane-switching";
import type {
  DynamicSplitAxis,
  ResolvedTilingInteractionCapabilities,
  TilingInteractionCapabilities,
  TilingKeymap,
  TilingMaximizeCapability,
  TilingPaneSwitchingCapability,
  TilingResizeCapability,
} from "./types";

/**
 * All-enabled defaults. An undefined capability config (or any undefined field)
 * resolves to these via `resolveInteractionCapabilities`.
 */
export const TILING_INTERACTION_CAPABILITY_DEFAULTS: ResolvedTilingInteractionCapabilities = {
  resize: "both",
  resizeHandlesVisible: false,
  slotHopInEnabled: true,
  rearrange: true,
  dragMode: "live",
  slotCommitment: {
    mode: DEFAULT_DRAG_SLOT_COMMITMENT_MODE,
    reresolveDeltaPx: DEFAULT_DRAG_RERESOLVE_DELTA_PX,
  },
  touchDrag: {
    enable: true,
    longPressMs: DEFAULT_TOUCH_LONG_PRESS_MS,
  },
  dragRecovery: {
    enable: true,
    maxDraggingIdleMs: DRAG_RECOVERY_DEFAULT_MAX_DRAGGING_IDLE_MS,
    frameDeadlineMs: DRAG_RECOVERY_DEFAULT_FRAME_DEADLINE_MS,
    transitionSlackMs: DRAG_RECOVERY_DEFAULT_TRANSITION_SLACK_MS,
  },
  customCursor: true,
  ghostPickupScalePercent: DEFAULT_GHOST_PICKUP_SCALE_PERCENT,
  coherentTransit: true,
  focus: true,
  maximize: { enable: true },
  paneSwitching: { enable: true, showTabStrip: true, showSwitcherOverlay: true },
  paneTitleBarControls: { sizing: true, acquireSpace: true },
  dropHitZoneGeometry: {
    centerRatio: DYNAMIC_DROP_INTENT_CONFIG.centerRatio,
    centerRatioX: DYNAMIC_DROP_INTENT_CONFIG.centerRatio,
    centerRatioY: DYNAMIC_DROP_INTENT_CONFIG.centerRatio,
    centerMinPx: DYNAMIC_DROP_INTENT_CONFIG.centerMinPx,
    hysteresisPx: DYNAMIC_DROP_INTENT_CONFIG.hysteresisPx,
  },
  keymap: TILING_KEYMAP_DEFAULTS,
  keyBindings: { bindings: [], replaceDefaults: false },
  masterLayout: true,
  grouping: true,
};

/**
 * Interaction preset for static (config-driven) product dashboards: only height
 * dividers resize (`resize: "vertical"`), and every interactive surface that
 * assumes a rearrangeable/maximizable lab layout is off (no drag-rearrange, no
 * pane focus selection, no maximize, no pane switching / tab strip). Dashboards
 * pass this instead of hand-repeating the disable set.
 *
 * Per-pane title-bar controls (sizing + acquire-space) are OFF here too:
 * dashboards ship a curated layout with PRE-CONFIGURED static panes and are
 * resize-only by intent, so letting an end-user re-pin a pane's bbox or have one
 * pane absorb its siblings' space would fight the authored composition. End-user
 * per-pane sizing belongs to interactive workspaces (the showcase default), not
 * config-driven dashboards.
 */
export const STATIC_DASHBOARD_INTERACTION: TilingInteractionCapabilities = {
  resize: "vertical",
  rearrange: false,
  focus: false,
  maximize: { enable: false },
  paneSwitching: { enable: false },
  paneTitleBarControls: { sizing: false, acquireSpace: false },
};

/**
 * Merge keymap sources by precedence: per-capability keybinding overrides win
 * over the top-level `keymap`, which wins over the documented defaults. Returns
 * a partial keymap suitable for `resolveKeymap`.
 */
function mergeKeymapSources(
  topLevel: TilingKeymap | undefined,
  maximize: TilingMaximizeCapability | undefined,
  paneSwitching: TilingPaneSwitchingCapability | undefined,
): TilingKeymap {
  return {
    toggleMaximize: maximize?.keymap?.toggleMaximize ?? topLevel?.toggleMaximize,
    restore: maximize?.keymap?.restore ?? topLevel?.restore,
    previousPane: paneSwitching?.keymap?.previousPane ?? topLevel?.previousPane,
    nextPane: paneSwitching?.keymap?.nextPane ?? topLevel?.nextPane,
    jumpToPane: paneSwitching?.keymap?.jumpToPane ?? topLevel?.jumpToPane,
    // Directional-focus + move-mode bindings are top-level only (no
    // per-capability override surface), so they pass straight through.
    focusLeft: topLevel?.focusLeft,
    focusRight: topLevel?.focusRight,
    focusUp: topLevel?.focusUp,
    focusDown: topLevel?.focusDown,
    enterMoveMode: topLevel?.enterMoveMode,
    focusCurrentOrLast: topLevel?.focusCurrentOrLast,
    cycleLayoutMode: topLevel?.cycleLayoutMode,
    cycleMasterOrientation: topLevel?.cycleMasterOrientation,
    incrementMasterCount: topLevel?.incrementMasterCount,
    decrementMasterCount: topLevel?.decrementMasterCount,
    incrementMasterRatio: topLevel?.incrementMasterRatio,
    decrementMasterRatio: topLevel?.decrementMasterRatio,
    toggleGroup: topLevel?.toggleGroup,
    groupTabNext: topLevel?.groupTabNext,
    groupTabPrevious: topLevel?.groupTabPrevious,
  };
}

/**
 * Single defaulting helper for `TilingInteractionCapabilities`. `undefined` /
 * `null` → all enabled; a partial override merges field-by-field over the
 * all-enabled defaults. Uses nullish coalescing so an explicit `false` (e.g.
 * `rearrange: false`, `maximize.enable: false`) is preserved and never
 * overridden by the default. Idempotent: re-resolving a resolved object yields
 * the same result.
 */
export function resolveInteractionCapabilities(
  capabilities?: TilingInteractionCapabilities | null,
): ResolvedTilingInteractionCapabilities {
  return {
    resize: capabilities?.resize ?? TILING_INTERACTION_CAPABILITY_DEFAULTS.resize,
    resizeHandlesVisible:
      capabilities?.resizeHandlesVisible
      ?? TILING_INTERACTION_CAPABILITY_DEFAULTS.resizeHandlesVisible,
    slotHopInEnabled:
      capabilities?.slotHopInEnabled
      ?? TILING_INTERACTION_CAPABILITY_DEFAULTS.slotHopInEnabled,
    rearrange: capabilities?.rearrange ?? TILING_INTERACTION_CAPABILITY_DEFAULTS.rearrange,
    dragMode: capabilities?.dragMode ?? TILING_INTERACTION_CAPABILITY_DEFAULTS.dragMode,
    slotCommitment: {
      mode:
        capabilities?.slotCommitment?.mode
        ?? TILING_INTERACTION_CAPABILITY_DEFAULTS.slotCommitment.mode,
      reresolveDeltaPx:
        capabilities?.slotCommitment?.reresolveDeltaPx
        ?? TILING_INTERACTION_CAPABILITY_DEFAULTS.slotCommitment.reresolveDeltaPx,
    },
    touchDrag: {
      enable: capabilities?.touchDrag?.enable ?? TILING_INTERACTION_CAPABILITY_DEFAULTS.touchDrag.enable,
      // Negative long-press is nonsensical (a timer cannot fire before t=0); clamp
      // to a non-negative delay. 0 = immediate (held touch picks up at once).
      longPressMs: Math.max(
        0,
        capabilities?.touchDrag?.longPressMs ?? TILING_INTERACTION_CAPABILITY_DEFAULTS.touchDrag.longPressMs,
      ),
    },
    dragRecovery: {
      enable: capabilities?.dragRecovery?.enable ?? TILING_INTERACTION_CAPABILITY_DEFAULTS.dragRecovery.enable,
      // Negative deadlines are nonsensical (a timer cannot fire before t=0);
      // clamp to a non-negative delay, mirroring the touch long-press clamp.
      maxDraggingIdleMs: Math.max(
        0,
        capabilities?.dragRecovery?.maxDraggingIdleMs
          ?? TILING_INTERACTION_CAPABILITY_DEFAULTS.dragRecovery.maxDraggingIdleMs,
      ),
      frameDeadlineMs: Math.max(
        0,
        capabilities?.dragRecovery?.frameDeadlineMs
          ?? TILING_INTERACTION_CAPABILITY_DEFAULTS.dragRecovery.frameDeadlineMs,
      ),
      transitionSlackMs: Math.max(
        0,
        capabilities?.dragRecovery?.transitionSlackMs
          ?? TILING_INTERACTION_CAPABILITY_DEFAULTS.dragRecovery.transitionSlackMs,
      ),
    },
    customCursor: capabilities?.customCursor ?? TILING_INTERACTION_CAPABILITY_DEFAULTS.customCursor,
    ghostPickupScalePercent: clampGhostPickupScalePercent(
      capabilities?.ghostPickupScalePercent ?? TILING_INTERACTION_CAPABILITY_DEFAULTS.ghostPickupScalePercent,
    ),
    coherentTransit: capabilities?.coherentTransit ?? TILING_INTERACTION_CAPABILITY_DEFAULTS.coherentTransit,
    focus: capabilities?.focus ?? TILING_INTERACTION_CAPABILITY_DEFAULTS.focus,
    maximize: {
      enable: capabilities?.maximize?.enable ?? TILING_INTERACTION_CAPABILITY_DEFAULTS.maximize.enable,
    },
    paneSwitching: {
      enable:
        capabilities?.paneSwitching?.enable ?? TILING_INTERACTION_CAPABILITY_DEFAULTS.paneSwitching.enable,
      showTabStrip:
        capabilities?.paneSwitching?.showTabStrip
        ?? TILING_INTERACTION_CAPABILITY_DEFAULTS.paneSwitching.showTabStrip,
      showSwitcherOverlay:
        capabilities?.paneSwitching?.showSwitcherOverlay
        ?? TILING_INTERACTION_CAPABILITY_DEFAULTS.paneSwitching.showSwitcherOverlay,
    },
    paneTitleBarControls: {
      sizing:
        capabilities?.paneTitleBarControls?.sizing
        ?? TILING_INTERACTION_CAPABILITY_DEFAULTS.paneTitleBarControls.sizing,
      acquireSpace:
        capabilities?.paneTitleBarControls?.acquireSpace
        ?? TILING_INTERACTION_CAPABILITY_DEFAULTS.paneTitleBarControls.acquireSpace,
    },
    dropHitZoneGeometry: resolveDropHitZoneGeometry(capabilities?.dropHitZoneGeometry),
    keymap: resolveKeymap(
      mergeKeymapSources(capabilities?.keymap, capabilities?.maximize, capabilities?.paneSwitching),
    ),
    keyBindings: {
      bindings: capabilities?.keyBindings?.bindings ?? TILING_INTERACTION_CAPABILITY_DEFAULTS.keyBindings.bindings,
      replaceDefaults:
        capabilities?.keyBindings?.replaceDefaults
        ?? TILING_INTERACTION_CAPABILITY_DEFAULTS.keyBindings.replaceDefaults,
    },
    masterLayout: capabilities?.masterLayout ?? TILING_INTERACTION_CAPABILITY_DEFAULTS.masterLayout,
    grouping: capabilities?.grouping ?? TILING_INTERACTION_CAPABILITY_DEFAULTS.grouping,
  };
}

/**
 * Resolve the per-axis drop hit-zone geometry. The symmetric `centerRatio` sets
 * both axes; a per-axis override (`centerRatioX` / `centerRatioY`) wins for that
 * axis. `centerRatio` is retained as the representative (X-axis) value for
 * telemetry + the single-knob showcase display.
 */
function resolveDropHitZoneGeometry(
  geometry: TilingInteractionCapabilities["dropHitZoneGeometry"],
): ResolvedTilingInteractionCapabilities["dropHitZoneGeometry"] {
  const symmetric: number =
    geometry?.centerRatio ?? TILING_INTERACTION_CAPABILITY_DEFAULTS.dropHitZoneGeometry.centerRatio;
  const centerRatioX: number = geometry?.centerRatioX ?? symmetric;
  const centerRatioY: number = geometry?.centerRatioY ?? symmetric;
  return {
    centerRatio: centerRatioX,
    centerRatioX,
    centerRatioY,
    centerMinPx:
      geometry?.centerMinPx ?? TILING_INTERACTION_CAPABILITY_DEFAULTS.dropHitZoneGeometry.centerMinPx,
    hysteresisPx:
      geometry?.hysteresisPx ?? TILING_INTERACTION_CAPABILITY_DEFAULTS.dropHitZoneGeometry.hysteresisPx,
  };
}

/**
 * Pure capability gate for a single split divider. Maps the resize capability
 * onto a split node's `axis` per the documented axis convention (see
 * `TilingResizeCapability`): a split with `axis: "horizontal"` is a width
 * divider (side-by-side panes), a split with `axis: "vertical"` is a height
 * divider (stacked panes).
 *
 * - `"none"` → no divider resizes.
 * - `"both"` → every divider resizes.
 * - `"horizontal"` → only width dividers (split `axis === "horizontal"`).
 * - `"vertical"` → only height dividers (split `axis === "vertical"`).
 */
export function isResizeAxisEnabled(
  capability: TilingResizeCapability,
  splitAxis: DynamicSplitAxis,
): boolean {
  if (capability === "none") {
    return false;
  }
  if (capability === "both") {
    return true;
  }
  return capability === splitAxis;
}
