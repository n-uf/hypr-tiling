/**
 * `@n-uf/hypr-tiling/engine` — the `@beta` engine escape hatch.
 *
 * NO STABILITY GUARANTEES. This entry exposes the engine-grade, framework-free
 * internals of the tiling package for power users who need to drive the layout
 * tree, keymap, or drag-adjacent math directly (headless / controlled-layout
 * scenarios). Everything here is implementation detail of the `.` public API:
 * it is not semver-tracked, may change or disappear in any release, and is kept
 * OFF the consumer documentation site. Prefer the `.` public API
 * (`@n-uf/hypr-tiling`) — reach for `./engine` only when the curated surface
 * genuinely cannot express what you need.
 *
 * This entry is framework-free (no React, no DOM) — in SOURCE and in the BUILT
 * artifact. Every module reachable from here lives under `engine/`; the renderer
 * lives on `.`. `dist/engine.{mjs,cjs}` is built as a standalone bundle that
 * shares no chunk with `.` / `./devtools`, so importing it from a server or
 * react-server layer (Next.js route handlers, RSC) never evaluates
 * `react.createContext` or any hook. Guarded by
 * `__tests__/engine-entry-react-free.test.ts` (`pnpm test:dist`) and the
 * `engine ↛ react` layering rule in `scripts/check-guardrails.mjs`.
 *
 * The small "demoted from `.`" group at the bottom of this file — `accentHue`
 * and the two drag-duration reference constants (`BASELINE_DRAG_HOP_DURATION_MS`,
 * `INSTANT_DRAG_DURATION_MS`) — was pulled off the consumer `.` surface
 * (custom-chrome / prop-less internal tuning, not dogfooded by any renderer prop
 * a consumer sets) and is re-exported here for power users. It is pure data and
 * lives in `engine/` (`accent-hues.ts`, `drag-timing.ts`); the React theme
 * engine and renderer import it from there.
 *
 * @packageDocumentation
 */

// ── Layout tree — reducers (pure; each returns a NEW tree) ────────────────────
export {
  extractLeafNode,
  insertLeafInto,
  type ExtractedLeafResult,
  insertLeafAdjacent,
  removeLeafTile,
  swapLeafTiles,
  updateSplitRatio,
  toggleSplitAxis,
  groupLeaves,
  ungroupNode,
  moveLeafToRoot,
  moveLeafToSplitContainer,
  setLeafSizing,
  setLeafCollapsed,
  toggleLeafCollapsed,
  isLeafCollapsed,
  normalizeStaticAxisFill,
  diffCollapsedLeaves,
  reassertCollapsedExtentPins,
  type GroupLeavesOptions,
} from "./engine/state";
export {
  LAYOUT_COLLAPSED_RATIO_EPS,
  LAYOUT_FILL_SLACK_TOLERANCE_PX,
  LAYOUT_RECONCILE_IDLE_MS,
  assertLayoutIntegrity,
  assessLayoutTileIntegrity,
  buildDefaultDwindleLayout,
  expectedTileIdsFromHostTiles,
  layoutCoversExpectedTiles,
  measureLayoutFillSlackPx,
  normalizeLayout,
  repairLayout,
  type AssertLayoutIntegrityOptions,
  type AssessLayoutTileIntegrityOptions,
  type LayoutTileIntegrityReport,
  type NormalizeLayoutOptions,
  type RepairLayoutOptions,
} from "./engine/layout-normalize";

// ── Workspace set (server-safe alias of the `.` exports; same symbols) ────────
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
export type { TilingWorkspacePlacement } from "./engine/types";
// H7 — workspace set controller helpers (framework-free; the hook lives on `.`)
export {
  adoptIncomingWorkspaceTrees,
  classifyIncomingWorkspaceSet,
  diffWorkspaceTreeLayouts,
  foldPendingTrees,
  viewedWorkspaceSet,
  workspaceSetLayoutMap,
  workspaceSetsAlign,
  type AdoptIncomingWorkspaceTreesInput,
  type AdoptIncomingWorkspaceTreesResult,
  type IncomingWorkspaceSetKind,
  type TilingWorkspaceTreeDiff,
  type TilingWorkspaceTreeMap,
} from "./engine/workspace-set-controller";

// ── Persisted-layout adapter (thin glue over the integrity APIs above) ────────
export {
  createPersistedTilingLayout,
  type CreatePersistedTilingLayoutOptions,
  type PersistedTilingLayout,
  type TilingLayoutContainerSize,
  type TilingLayoutStorage,
} from "./engine/persisted-layout";

// ── Layout tree — low-level read walkers (composed by `queryTilingLayout` on `.`) ─
export {
  collectGroups,
  collectSplitNodes,
  findLeafByDirection,
  findLeafById,
  readLeafNodeIds,
  siblingSubtreeForLeaf,
  isStructurallyValidLayout,
  tileOrderByLeafId,
} from "./engine/state";

// ── Command / keyboard mapping ────────────────────────────────────────────────
export {
  commandRequiredCapability,
  keyboardActionToCommand,
} from "./engine/commands";
export { defaultKeyBindings, matchKeyBinding } from "./engine/keybindings";
export {
  TILING_KEYMAP_DEFAULTS,
  chordRequiresModifier,
  matchKeyChord,
  matchKeymapAction,
  hasAnyModifier,
  resolveKeymap,
  resolveMaximizeToggle,
  type TilingKeymapActionGuards,
} from "./engine/pane-switching";

// ── Multi-selection reducers ──────────────────────────────────────────────────
export {
  MULTI_SELECT_GROUP_MIN_MEMBERS,
  canGroupMultiSelection,
  pruneMultiSelection,
  resolveMultiSelectGroupCommand,
  resolveMultiSelectGroupHost,
  toggleLeafMultiSelection,
} from "./engine/multi-selection";

// ── Focus history ring ────────────────────────────────────────────────────────
export {
  EMPTY_FOCUS_HISTORY,
  FOCUS_HISTORY_DEFAULT_LIMIT,
  pruneFocusHistory,
  pushFocusHistory,
  resolveFocusCurrentOrLast,
  type FocusHistory,
} from "./engine/focus-history";

// ── Pane sizing math ──────────────────────────────────────────────────────────
export {
  isStaticAlongSplitAxis,
  isStaticInDimension,
  isStaticOnCrossAxis,
  layoutContainsStaticPane,
  renormalizeFlexibleRatios,
  resolveSizingMode,
  shouldRenderSplitDivider,
  type FlexibleRatioChild,
  type SplitBoundaryStaticFlags,
} from "./engine/pane-sizing";
export { isResizeAxisEnabled } from "./engine/interaction-capabilities";

// ── Drag easing / cursor / drop-intent ────────────────────────────────────────
export { isCssEasing, resolveDragEasing } from "./engine/drag-easing";
export {
  clampCursorPointToViewport,
  resolveDragCursorPresentation,
  type DragCursorKind,
  type DragCursorPoint,
  type DragCursorPresentation,
  type DragCursorTone,
  type DragCursorViewportBounds,
} from "./engine/drag-cursor";
export {
  TILING_DROP_INTENT_CONFIG,
  type TilingDropIntentBaseConfig,
  type TilingDropIntentState,
  type TilingEdgeZone,
} from "./engine/drop-intent-resolver";
export type { DragResolvedTarget } from "./engine/drag-machine";

// ── Engine-only types (not part of the `.` public surface) ────────────────────
export type {
  TilingDimension,
  TilingKeyboardAction,
  TilingKeyboardEventLike,
  TilingKeyboardModifierState,
  TilingMoveModeState,
  TilingPaneSwitcherState,
} from "./engine/types";

// ── Demoted from the `.` consumer surface (see @packageDocumentation) ──────────
// Reachable here for power users, but off the curated consumer API and its docs.
// `accentHue` resolves an accent to its Tailwind hue atoms (custom-chrome helper,
// not dogfooded by any renderer prop). The two duration constants are the
// prop-less internal reference values behind the drag-animation timing — the
// consumer-facing knobs (`dragAnimationEnabled`, `ghostTransitSpeedPercent`,
// `survivorReflowSpeedPercent`, and the `DRAG_ANIMATION_SPEED_*` percents) stay
// on `.`. Both modules are pure (no React) — this entry must never import from
// `react/`.
export { accentHue, type TilingAccentHue } from "./engine/accent-hues";
export {
  BASELINE_DRAG_HOP_DURATION_MS,
  INSTANT_DRAG_DURATION_MS,
} from "./engine/drag-timing";

// H8 — workspace commands, gate, keymap fragment
export { isWorkspaceNavigationCommand } from "./engine/commands";
export { WORKSPACE_KEY_BINDINGS } from "./engine/keybindings";
export type {
  ResolvedTilingWorkspacesCapability,
  TilingWorkspacesCapability,
  TilingWorkspaceSwitchEvent,
  TilingWorkspaceSwitchVia,
} from "./engine/types";
