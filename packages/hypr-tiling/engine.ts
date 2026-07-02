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
 * The engine core is framework-free (no React, no DOM): the renderer lives on
 * `.`. The single exception is the small "demoted from `.`" group at the bottom
 * of this file — `accentHue` and the two drag-duration reference constants
 * (`BASELINE_DRAG_HOP_DURATION_MS`, `INSTANT_DRAG_DURATION_MS`). They were pulled
 * off the consumer `.` surface (custom-chrome / prop-less internal tuning, not
 * dogfooded by any renderer prop a consumer sets) and re-exported here for power
 * users who still want them. They live in the `react/` layer, so importing one
 * pulls React into your bundle; leave them unimported and tree-shaking drops the
 * edge, keeping the rest of `./engine` framework-free.
 *
 * @packageDocumentation
 */

// ── Layout tree — reducers (pure; each returns a NEW tree) ────────────────────
export {
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
  type GroupLeavesOptions,
} from "./engine/state";

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

// ── Demoted from the `.` consumer surface (react/-backed; see @packageDocumentation) ─
// Reachable here for power users, but off the curated consumer API and its docs.
// `accentHue` resolves an accent to its Tailwind hue atoms (custom-chrome helper,
// not dogfooded by any renderer prop). The two duration constants are the
// prop-less internal reference values behind the drag-animation timing — the
// consumer-facing knobs (`dragAnimationEnabled`, `ghostTransitSpeedPercent`,
// `survivorReflowSpeedPercent`, and the `DRAG_ANIMATION_SPEED_*` percents) stay
// on `.`.
export { accentHue, type TilingAccentHue } from "./react/theme";
export {
  BASELINE_DRAG_HOP_DURATION_MS,
  INSTANT_DRAG_DURATION_MS,
} from "./react/tiling-renderer";
