import type { DragMachineState } from "./drag-machine";
import type {
  TilingCollapseBodyMode,
  TilingDropAction,
  TilingLeafDropZone,
  TilingPaneBodyRenderMode,
} from "./types";

/** Drag phases the presentation derivation observes. */
export type DragPresentationPhase = DragMachineState["phase"];

export interface DragPresentationInput {
  liveDragModeEnabled: boolean;
  dragPhase: DragPresentationPhase;
  leafId: string;
  pickupOriginLeafId: string | null;
  /**
   * The display-tree leaf that keeps the lifted pane's place while the pane
   * itself is held under the pointer (the slot the others made room around, or
   * a root leaf with nothing to close over), else `null`.
   */
  heldSlotLeafId: string | null;
  /** Resolved action for THIS leaf (null when this leaf is not the drop target). */
  dropAction: TilingDropAction | null;
  /** Resolved zone for THIS leaf (null when this leaf is not the drop target). */
  dropZone: TilingLeafDropZone | null;
  /** Resolved dominant edge for THIS leaf — the edge chrome falls back to when a
   *  center hit resolves to edge-insert semantics. */
  dropDominantEdge: TilingLeafDropZone | null;
}

/**
 * The single drag-presentation fact set every drag surface reads. This struct is
 * CONTENT-AGNOSTIC: nothing here branches on `isPaneContentVisible`. Drag
 * presentation is decided purely by drag mechanics. Whether a pane body paints
 * content is the separate, drag-independent CONTENT rule
 * (`resolvePaneBodyRenderMode`).
 *
 * - `isHeldSlotReservation` — this leaf is the empty place kept for the lifted
 *   pane while the pane is held elsewhere (live mode, while dragging): it is
 *   painted as a content-less reservation, so the pane is never shown twice.
 * - `isPickupOriginLeaf` / `isHeldSlotLeaf` — leaf-role flags.
 * - `dropChromeZone` — the zone the drop-target chrome renders, already
 *   resolving the edge-insert-vs-center decision (no caller-side ternary). Null
 *   when this leaf is not a live drop target.
 */
export interface DragPresentationMode {
  isHeldSlotReservation: boolean;
  isPickupOriginLeaf: boolean;
  isHeldSlotLeaf: boolean;
  dropChromeZone: TilingLeafDropZone | null;
}

/**
 * The zone the drop-target chrome should render for a leaf. Resolves the
 * edge-insert-vs-center decision so no consumer re-derives it:
 *
 * - not a live drop target (`none` / null action) → `null` (no chrome).
 * - edge-insert action, OR a swap that resolved to a non-center zone (an
 *   action/zone disagreement → treat as edge chrome): when the raw zone is
 *   `center`, fall back to the dominant edge; otherwise use the raw zone.
 * - otherwise (center swap / group-merge) → the raw zone.
 */
function resolveDropChromeZone(input: DragPresentationInput): TilingLeafDropZone | null {
  if (input.dropAction == null || input.dropAction === "none" || input.dropZone == null) {
    return null;
  }
  const preferEdgeChrome: boolean =
    input.dropAction === "edge-insert" ||
    (input.dropAction === "swap" && input.dropZone !== "center");
  if (preferEdgeChrome && input.dropZone === "center") {
    return input.dropDominantEdge ?? input.dropZone;
  }
  return input.dropZone;
}

/**
 * Central resolver for drag presentation: the held-slot reservation flag, the
 * pickup-origin / held-slot role flags, and the drop-target chrome zone. Fully
 * content-agnostic (no `isPaneContentVisible` input), so its output is
 * identical whether pane content is shown or hidden.
 */
export function resolveDragPresentation(
  input: DragPresentationInput,
): DragPresentationMode {
  const isPickupOriginLeaf: boolean =
    input.pickupOriginLeafId != null && input.leafId === input.pickupOriginLeafId;
  const isHeldSlotLeaf: boolean =
    input.heldSlotLeafId != null && input.leafId === input.heldSlotLeafId;
  // The pane is drawn where the pointer holds it; its place in the tree stays
  // empty until the drop lands it there.
  const isHeldSlotReservation: boolean =
    input.liveDragModeEnabled && input.dragPhase === "dragging" && isHeldSlotLeaf;

  return {
    isHeldSlotReservation,
    isPickupOriginLeaf,
    isHeldSlotLeaf,
    dropChromeZone: resolveDropChromeZone(input),
  };
}

/**
 * The ONE pane-body content rule, applied identically to every pane:
 *
 * - held-slot reservation → `render-reservation` (the empty place kept for a
 *   lifted pane; a drag mechanic, never carries content regardless of the
 *   CONTENT toggle).
 * - a COLLAPSED pane that is NOT maximized → decided by `collapseBodyMode`
 *   (HT-COLLAPSE-BODY-MODE), overriding the CONTENT toggle either way:
 *   `"keep-mounted"` (default) → `render-content` (body stays mounted;
 *   {@link TilingPaneBody}'s independent `display: none` gate is what
 *   actually hides it — see there), `"unmount"` → `render-empty`
 *   (titlebar-only; the pane frame + header chrome stay, only the body is
 *   removed from the tree).
 * - otherwise the body honors the CONTENT toggle: `render-content` when content
 *   is visible, `render-empty` when hidden.
 *
 * HT-PANE-COLLAPSE + maximize: `isMaximized` SUSPENDS the collapse gate
 * for exactly this leaf. Collapse is an in-tree, titlebar-only affordance;
 * maximizing a leaf is the user explicitly asking to see its content full-screen
 * — without this, a maximized collapsed pane rendered a titlebar strip floating
 * in an otherwise-full-screen void. The leaf's `collapsed` flag / pinned sizing
 * are untouched (restoring from maximize returns to the same collapsed
 * footprint); only the render-mode decision for the maximized frame changes.
 */
export function resolvePaneBodyRenderMode(
  isHeldSlotReservation: boolean,
  isPaneContentVisible: boolean,
  isCollapsed: boolean = false,
  isMaximized: boolean = false,
  collapseBodyMode: TilingCollapseBodyMode = "keep-mounted",
): TilingPaneBodyRenderMode {
  if (isHeldSlotReservation) {
    return "render-reservation";
  }
  if (isCollapsed && !isMaximized) {
    return collapseBodyMode === "unmount" ? "render-empty" : "render-content";
  }
  return isPaneContentVisible ? "render-content" : "render-empty";
}

/**
 * The initial value of the renderer's `isPaneContentVisible` state, derived from
 * whether the content toggle is shown — the single source of truth for the
 * default content visibility.
 *
 * - toggle shown (`showContentToggle === true`) → default `false` (legacy: the
 *   body stays empty until the user flips the checkbox).
 * - toggle suppressed (`showContentToggle === false`) → default `true`. The
 *   embedding owns content and there is no control to flip; treating content as
 *   visible by default keeps the prerendered HTML's content at rest (SEO
 *   intact).
 *
 * Held-slot reservations are unaffected: they render empty via
 * `resolvePaneBodyRenderMode` regardless of this flag.
 */
export function resolveInitialPaneContentVisible(
  showContentToggle: boolean,
): boolean {
  return !showContentToggle;
}
