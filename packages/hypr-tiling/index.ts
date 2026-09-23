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

// ── Custom-pane helper primitives (optional; layered over `renderTile`) ───────
// Unstyled conveniences that encode the pane wiring rules a custom `renderTile`
// can otherwise get wrong (data-leaf-id root, drag handle + touch-action, action
// buttons that stop propagation, titlebar middle-slot wrapper, body render-mode
// gate). Use them for the easy path; the raw `renderTile` args stay the full
// escape hatch.
export {
  TilingPaneRoot,
  TilingDragHandle,
  TilingPaneAction,
  TilingPaneTitleBarContent,
  TilingPaneBody,
  type TilingPaneRootProps,
  type TilingDragHandleProps,
  type TilingPaneActionProps,
  type TilingPaneTitleBarContentProps,
  type TilingPaneBodyProps,
} from "./react/tiling-pane-primitives";

// ── Configuration & drag-animation tuning defaults ───────────────────────────
// Reference values for the corresponding `TilingRendererProps` knobs
// (`dragAnimationEnabled`, `ghostTransitSpeedPercent`, `survivorReflowSpeedPercent`).
export {
  DEFAULT_DRAG_ANIMATION_SPEED_PERCENT,
  DRAG_ANIMATION_SPEED_MAX_PERCENT,
  DRAG_ANIMATION_SPEED_MIN_PERCENT,
  DEFAULT_TILING_LAYOUT_CONFIG,
} from "./react/tiling-renderer";
export { TILING_DEFAULT_COLLAPSED_EXTENT_PX } from "./engine/types";
export {
  DEFAULT_DRAG_HOP_EASING,
  DEFAULT_DRAG_REFLOW_EASING,
} from "./engine/drag-easing";

// ── Theming ──────────────────────────────────────────────────────────────────
export {
  DEFAULT_TILE_ACCENT,
  TILING_TILE_ACCENTS,
  TILING_TILE_ACCENT_SWATCHES,
  TILING_ACCENT_HUES,
  type TilingAccentHue,
} from "./engine/accent-hues";
export {
  DEFAULT_TILING_THEME_ID,
  TILING_THEMES,
  TILING_THEME_REGISTRY,
  TilingThemeProvider,
  resolveDragChrome,
  resolveTilingTheme,
  useTilingTheme,
  type TilingTheme,
  type TilingThemeDividerTokens,
  type TilingThemeDragChromeTokens,
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

// ── Workspace set ────────────────────────────────────────────────────────────
// Several layout trees over one tile pool, one active (`TilingWorkspaceSet`).
// Pure ops a host drives from its own chrome (tabs, menus, chat tools) and
// feeds back through `TilingRendererProps.workspaces` / `onWorkspacesChange`.
// Also exported on `./engine` (server-safe alias, same symbols) — covered by
// the `.` stability contract whichever entry imports them.
export {
  TILING_DEFAULT_WORKSPACE_PLACEMENT,
  TILING_MAIN_WORKSPACE_ID,
  TILING_MAIN_WORKSPACE_NAME,
  TILING_WORKSPACES_MAX,
  TILING_WORKSPACE_NAME_MAX_CHARS,
  activeWorkspace,
  createWorkspace,
  cycleWorkspace,
  deleteWorkspace,
  findWorkspaceById,
  hideFromWorkspace,
  moveLeafToWorkspace,
  normalizeWorkspaceName,
  queryWorkspaceSet,
  renameWorkspace,
  repairWorkspaceSet,
  setWorkspaceLayout,
  showInWorkspace,
  switchWorkspace,
  workspaceSetIssues,
  workspaceSetOfLayout,
  type CreateWorkspaceInput,
  type RepairWorkspaceSetOptions,
  type TilingDeleteWorkspaceResult,
  type TilingWorkspace,
  type TilingWorkspaceId,
  type TilingWorkspaceSet,
  type TilingWorkspaceSetIssue,
  type TilingWorkspaceSetIssueKind,
  type TilingWorkspaceSetQuery,
  type TilingWorkspaceSetRepairReason,
  type TilingWorkspaceSetRepairResult,
  type WorkspaceSetIntegrityOptions,
} from "./engine/workspace-set";
// H5 — tile-keyed set ops, region placement, revealTile
export {
  hideTileFromWorkspace,
  moveTileToWorkspace,
  removeTile,
  revealTile,
  showTileInWorkspace,
  type MoveTileToWorkspaceOptions,
  type TilingHideTileResult,
  type TilingRevealTileChanged,
  type TilingRevealTileResult,
} from "./engine/workspace-set";
export {
  clientRectContains,
  resolveWorkspaceTabHover,
  resolveWorkspaceTabKey,
  type TilingClientRect,
  type TilingWorkspaceTabKeyAction,
  type TilingWorkspaceTabTarget,
  type TilingWorkspaceTabsOrientation,
} from "./engine/workspace-tabs";
// Headless workspace tab strip: `tablist` / `tab` semantics, roving focus,
// keyboard model, rename / close affordances, native drop-target wiring.
export {
  TilingWorkspaceTabs,
  useTilingWorkspaceTabs,
  type TilingWorkspacePanelElementProps,
  type TilingWorkspaceTab,
  type TilingWorkspaceTabElementProps,
  type TilingWorkspaceTablistElementProps,
  type TilingWorkspaceTabsProps,
  type UseTilingWorkspaceTabsOptions,
  type UseTilingWorkspaceTabsResult,
} from "./react/workspace-tabs";

// ── Persisted-layout adapter ─────────────────────────────────────────────────
// Optional glue that persists ONLY the layout tree (localStorage by default)
// and delegates every heal to the engine's first-class `assertLayoutIntegrity`
// / `repairLayout`. Repair stays an engine trait; this is thin persistence.
export {
  createPersistedTilingLayout,
  type CreatePersistedTilingLayoutOptions,
  type PersistedTilingLayout,
  type TilingLayoutContainerSize,
  type TilingLayoutStorage,
} from "./engine/persisted-layout";

// ── Public type surface ──────────────────────────────────────────────────────
// The transitive type closure of the runtime symbols above (renderer props/ref,
// theming, capabilities, layout query, command/modifier helpers). API Extractor
// enforces completeness: `ae-forgotten-export=error` fails the build if any type
// reachable through a public signature is missing here.
export type {
  // Layout tree
  TilingCollapseBodyMode,
  TilingLayoutConfig,
  TilingLayoutNode,
  TilingLeafNode,
  TilingMinBBoxPx,
  TilingResizeFloor,
  TilingSplitNode,
  TilingGroupNode,
  TilingPaneSizing,
  TilingPaneSizingMode,
  TilingSplitAxis,
  TilingDimension,
  TilingLayoutMode,
  TilingMasterOrientation,
  TilingTitleBarSizingMode,
  TilingMovePlacement,
  TilingFocusDirection,
  TilingPaneCycleDirection,
  TilingWorkspacePlacement,
  // Tiles & accents
  TilingTile,
  TilingTileAccent,
  TilingTileAccentSwatch,
  // Interaction capabilities (input + resolved)
  TilingInteractionCapabilities,
  TilingDragMode,
  TilingDragRecoveryCapability,
  TilingDropHitZoneGeometryCapability,
  TilingGroupingCapability,
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
  ResolvedTilingGroupingCapability,
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
  TilingRendererCommonProps,
  TilingRendererWorkspaceSetProps,
  TilingRendererModeProps,
  TilingDragGhostMode,
  TilingClientPoint,
  TilingExternalDragHover,
  TilingExternalDropHover,
  TilingWorkspaceTabDragHover,
  TilingGhostChipContext,
  TilingOnExternalDrop,
  TilingExternalDragHoverResolver,
  TilingPaneCollapsedChangeEvent,
  TilingChromeFocusOutline,
  TilingOverlayPortalContainer,
  TilingPaneIdentityMode,
  TilingRenderSurface,
  TilingRenderTileProps,
  TilingGroupMemberView,
  TilingRenderTileGroupContext,
  TilingPaneBodyRenderMode,
  // Drop zones / previews
  TilingLeafDropZone,
  TilingLeafDropPreview,
  TilingLeafPreviewMode,
  TilingLeafPreviewRole,
  TilingDropAction,
} from "./engine/types";
