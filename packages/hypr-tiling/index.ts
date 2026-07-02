"use client";

/**
 * `@n-uf/hypr-tiling` — the public API for the dynamic tiling renderer.
 *
 * This is the ONE entry point a consumer imports. It is a small, hand-authored
 * facade: an explicit, curated keep-list of the renderer, its theming API, the
 * configuration/interaction presets, a handful of consumer-grade helpers, and
 * the type surface reachable through their signatures. Everything below the
 * renderer — the layout reducers, the drag/FLIP state machine, geometry math,
 * keymap resolution — is engine-grade and lives behind the separate
 * `@n-uf/hypr-tiling/engine` escape hatch (`@beta`, no stability guarantees).
 * The developer/observability panel lives behind `@n-uf/hypr-tiling/devtools`.
 *
 * @packageDocumentation
 */

// ── Renderer ────────────────────────────────────────────────────────────────
export { TilingRenderer } from "./react/tiling-renderer";

// ── Configuration & drag-animation tuning defaults ───────────────────────────
// Reference values for the corresponding `TilingRendererProps` knobs.
export {
  BASELINE_DRAG_HOP_DURATION_MS,
  DEFAULT_DRAG_ANIMATION_SPEED_PERCENT,
  DRAG_ANIMATION_SPEED_MAX_PERCENT,
  DRAG_ANIMATION_SPEED_MIN_PERCENT,
  DEFAULT_TILING_LAYOUT_CONFIG,
  INSTANT_DRAG_DURATION_MS,
} from "./react/tiling-renderer";
export {
  DEFAULT_DRAG_HOP_EASING,
  DEFAULT_DRAG_REFLOW_EASING,
} from "./engine/drag-easing";

// ── Theming ──────────────────────────────────────────────────────────────────
export {
  DEFAULT_TILE_ACCENT,
  DEFAULT_TILING_THEME_ID,
  TILING_TILE_ACCENTS,
  TILING_TILE_ACCENT_SWATCHES,
  TILING_ACCENT_HUES,
  TILING_THEMES,
  TILING_THEME_REGISTRY,
  TilingThemeProvider,
  accentHue,
  resolveTilingTheme,
  useTilingTheme,
  type TilingAccentHue,
  type TilingTheme,
  type TilingThemeDividerTokens,
  type TilingThemeGhostTokens,
  type TilingThemeId,
  type TilingThemePaneHeaderTokens,
  type TilingThemePaneShellTokens,
  type TilingThemeRootTokens,
  type TilingThemeTopBarTokens,
} from "./react/theme";

// ── Interaction capabilities ─────────────────────────────────────────────────
export {
  TILING_DASHBOARD_PRESET,
  TILING_INTERACTION_CAPABILITY_DEFAULTS,
  resolveInteractionCapabilities,
} from "./engine/interaction-capabilities";

// ── Consumer-grade helpers ───────────────────────────────────────────────────
// Small pure helpers an app needs to drive layout-aware UI on top of the
// renderer (shortcut chips, pane counters, directional focus, multi-select).
export { isCommandEnabled, type TilingCommandGates } from "./engine/commands";
export { resolveJumpedPaneId } from "./engine/pane-switching";
export {
  isMultiSelectModifierActive,
  type MultiSelectModifierState,
} from "./engine/multi-selection";
export { queryTilingLayout, type TilingLayoutQuery } from "./engine/state";

// ── Public type surface ──────────────────────────────────────────────────────
// The transitive type closure of the runtime symbols above (renderer props/ref,
// theming, capabilities, layout query, command/modifier helpers). API Extractor
// enforces completeness: `ae-forgotten-export=error` fails the build if any type
// reachable through a public signature is missing here.
export type {
  // Layout tree
  TilingLayoutConfig,
  TilingLayoutNode,
  TilingLeafNode,
  TilingSplitNode,
  TilingGroupNode,
  TilingPaneSizing,
  TilingPaneSizingMode,
  TilingSplitAxis,
  TilingLayoutMode,
  TilingMasterOrientation,
  TilingTitleBarSizingMode,
  TilingMovePlacement,
  TilingFocusDirection,
  TilingPaneCycleDirection,
  // Tiles & accents
  TilingTile,
  TilingTileAccent,
  TilingTileAccentSwatch,
  // Interaction capabilities (input + resolved)
  TilingInteractionCapabilities,
  TilingDragMode,
  TilingDragRecoveryCapability,
  TilingDropHitZoneGeometryCapability,
  TilingKeyBindings,
  TilingKeyBinding,
  TilingKeyChord,
  TilingKeyChordModifiers,
  TilingKeymap,
  TilingMaximizeCapability,
  TilingPaneSwitchingCapability,
  TilingPaneTitleBarControlsCapability,
  TilingResizeCapability,
  TilingSlotCommitmentCapability,
  TilingSlotCommitmentMode,
  TilingTouchDragCapability,
  ResolvedTilingInteractionCapabilities,
  ResolvedTilingDragRecoveryCapability,
  ResolvedTilingDropHitZoneGeometryCapability,
  ResolvedTilingKeyBindings,
  ResolvedTilingKeymap,
  ResolvedTilingKeyChord,
  ResolvedTilingKeyChordModifiers,
  ResolvedTilingMaximizeCapability,
  ResolvedTilingPaneSwitchingCapability,
  ResolvedTilingPaneTitleBarControlsCapability,
  ResolvedTilingSlotCommitmentCapability,
  ResolvedTilingTouchDragCapability,
  // Commands
  TilingCommand,
  TilingCommandHandle,
  // Renderer props / render-tile contract
  TilingRendererProps,
  TilingRenderTileProps,
  TilingPaneBodyRenderMode,
  // Drop zones / previews
  TilingLeafDropZone,
  TilingLeafDropPreview,
  TilingLeafPreviewMode,
  TilingLeafPreviewRole,
  TilingDropAction,
  // Debug / observability types referenced by public renderer props
  TilingDropIntentDebugState,
  TilingDropIntentTuningState,
  TilingLiveHitLogState,
  TilingLiveHitEdgeDebugState,
  TilingViewportCursorState,
  TilingPaneFootprint,
  TilingPaneHitZoneOverlayDebugState,
  TilingPaneHitZoneCandidateDebugState,
  TilingObservabilityColorConfig,
  TilingObservabilityColorEnableConfig,
} from "./engine/types";
