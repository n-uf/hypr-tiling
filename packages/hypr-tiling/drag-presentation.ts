import type { DragMachineState } from "./drag-machine";
import type {
  DynamicDropAction,
  DynamicLeafDropZone,
  DynamicPaneBodyRenderMode,
} from "./types";

/** Drag phases the presentation derivation observes. */
export type DragPresentationPhase = DragMachineState["phase"];

/** The settle outcome carried only while the FSM is in `settling`. */
export type DragSettlingOutcome = "commit" | "cancel" | null;

export interface DragPresentationInput {
  isPaneContentVisible: boolean;
  liveDragModeEnabled: boolean;
  dragPhase: DragPresentationPhase;
  settlingOutcome: DragSettlingOutcome;
  leafId: string;
  pickupOriginLeafId: string | null;
  ghostSeatLeafId: string | null;
  /** Resolved action for THIS leaf (null when this leaf is not the drop target). */
  dropAction: DynamicDropAction | null;
  /** Resolved zone for THIS leaf (null when this leaf is not the drop target). */
  dropZone: DynamicLeafDropZone | null;
  /** Resolved dominant edge for THIS leaf — the edge chrome falls back to when a
   *  center hit resolves to edge-insert semantics. */
  dropDominantEdge: DynamicLeafDropZone | null;
}

/**
 * The single presentation fact set every drag surface reads. Trimmed to ONLY
 * the fields a consumer reads — there is exactly one source for each decision:
 *
 * - `paneBodyRenderMode` — what the leaf's body paints (content / placeholder /
 *   content-less reservation the ghost hops into).
 * - `isPickupOriginLeaf` / `isGhostSeatLeaf` — leaf-role flags the drag-source
 *   chrome reads.
 * - `dropChromeZone` — the zone the drop-target chrome renders, already
 *   resolving the edge-insert-vs-center decision (no caller-side ternary). Null
 *   when this leaf is not a live drop target.
 */
export interface DragPresentationMode {
  paneBodyRenderMode: DynamicPaneBodyRenderMode;
  isPickupOriginLeaf: boolean;
  isGhostSeatLeaf: boolean;
  dropChromeZone: DynamicLeafDropZone | null;
}

/**
 * Whether a drag gesture is materially in flight for presentation purposes.
 * Extends through `settling` commit so the hop-in reservation does not flash off
 * for a frame before the committed layout prop lands. This is the SINGLE
 * settling-commit presentation-phase selector — the resolver, the seat
 * measurement, and the settling-commit display hold all read it, so the
 * "presentation lives through settling-commit" rule is named in exactly one
 * place.
 */
export function isDragPresentationActive(
  dragPhase: DragPresentationPhase,
  settlingOutcome: DragSettlingOutcome,
): boolean {
  if (dragPhase === "dragging") {
    return true;
  }
  return dragPhase === "settling" && settlingOutcome === "commit";
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
function resolveDropChromeZone(input: DragPresentationInput): DynamicLeafDropZone | null {
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
 * Central resolver for drag presentation: per-leaf body render mode, the
 * pickup-origin / ghost-seat role flags, and the drop-target chrome zone. The
 * single source of truth consumed by every surface (the leaf body, the
 * drag-source chrome, the drop-target chrome).
 */
export function resolveDragPresentation(
  input: DragPresentationInput,
): DragPresentationMode {
  const isPresentationActive: boolean = isDragPresentationActive(
    input.dragPhase,
    input.settlingOutcome,
  );
  const isPickupOriginLeaf: boolean =
    input.pickupOriginLeafId != null && input.leafId === input.pickupOriginLeafId;
  const isGhostSeatLeaf: boolean =
    input.ghostSeatLeafId != null && input.leafId === input.ghostSeatLeafId;

  // The ghost-seat slot reserves a content-less seat the single ghost hops into
  // (live mode). The picked-up content lives ONLY in the ghost, so the seat slot
  // never paints it — preserving the single-instance invariant.
  const shouldRenderReservation: boolean =
    input.liveDragModeEnabled && isPresentationActive && isGhostSeatLeaf;
  // Preview mode has no ghost, so the pickup-origin leaf reveals its own content
  // in place even when global content is hidden (the inverse of live mode).
  const isPreviewDragSourceReveal: boolean =
    isPresentationActive && !input.liveDragModeEnabled && isPickupOriginLeaf;

  let paneBodyRenderMode: DynamicPaneBodyRenderMode;
  if (shouldRenderReservation) {
    paneBodyRenderMode = "render-reservation";
  } else if (input.isPaneContentVisible || isPreviewDragSourceReveal) {
    paneBodyRenderMode = "render-content";
  } else {
    paneBodyRenderMode = "render-placeholder";
  }

  return {
    paneBodyRenderMode,
    isPickupOriginLeaf,
    isGhostSeatLeaf,
    dropChromeZone: resolveDropChromeZone(input),
  };
}
