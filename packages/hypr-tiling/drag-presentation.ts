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
 * The single drag-presentation fact set every drag surface reads. This struct is
 * CONTENT-AGNOSTIC: nothing here branches on `isPaneContentVisible`. Drag
 * presentation is decided purely by drag mechanics (which leaf is the
 * pickup-origin, which is the ghost-seat). Whether a pane body paints content is
 * the separate, drag-independent CONTENT rule (`resolvePaneBodyRenderMode`),
 * applied uniformly to every representation of a pane (in-tree, source slot,
 * hop-in slot, ghost).
 *
 * - `isGhostSeatReservation` — this leaf's body is the content-less seat the
 *   single ghost hops into (the reservation drag mechanic). True only in live
 *   mode for the ghost-seat leaf while the gesture is materially in flight.
 * - `isPickupOriginLeaf` / `isGhostSeatLeaf` — leaf-role flags the drag-source
 *   chrome reads.
 * - `dropChromeZone` — the zone the drop-target chrome renders, already
 *   resolving the edge-insert-vs-center decision (no caller-side ternary). Null
 *   when this leaf is not a live drop target.
 */
export interface DragPresentationMode {
  isGhostSeatReservation: boolean;
  isPickupOriginLeaf: boolean;
  isGhostSeatLeaf: boolean;
  dropChromeZone: DynamicLeafDropZone | null;
}

/**
 * The CSS selector the seat-rect measurement uses to find the ghost-seat leaf's
 * reservation rect (client coords) so the single ghost can hop INTO and FILL it.
 *
 * The selector is SCOPED to the ghost-seat leaf (`cc23956`'s per-leaf intent):
 * it matches the `[data-drag-source-reservation]` node that is a descendant of
 * the leaf carrying `data-leaf-id="<ghostSeatLeafId>"`. For this to resolve, the
 * reserved-slot wrapper MUST emit `data-leaf-id={node.id}` — a reserved slot
 * renders `DragSourceSlotReservation` (which carries `data-drag-source-reservation`
 * but no `data-leaf-id`) INSTEAD of `DefaultDynamicTile` (the only emitter of
 * `data-leaf-id` on its own article). `cc23956` introduced this scoped selector
 * WITHOUT emitting `data-leaf-id` on the reserved wrapper, so it could never
 * match → `seatFootprint` stayed null → the ghost never hopped and the empty
 * reservation lingered beside the free-following ghost. The renderer closes the
 * gap by emitting `data-leaf-id` on the reserved wrapper; this helper centralizes
 * the selector so the contract is unit-testable.
 */
export function dragSourceReservationSelector(ghostSeatLeafId: string): string {
  return `[data-leaf-id="${ghostSeatLeafId}"] [data-drag-source-reservation]`;
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
 * Central resolver for drag presentation: the ghost-seat reservation flag, the
 * pickup-origin / ghost-seat role flags, and the drop-target chrome zone. The
 * single source of truth consumed by every drag surface — and it is fully
 * content-agnostic (no `isPaneContentVisible` input), so its output is identical
 * whether pane content is shown or hidden.
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
  // (live mode). The picked-up pane lives ONLY in the ghost, so the seat slot is
  // never a second painted instance — preserving the single-instance invariant.
  // This is a drag mechanic, decided without any reference to content state.
  const isGhostSeatReservation: boolean =
    input.liveDragModeEnabled && isPresentationActive && isGhostSeatLeaf;

  return {
    isGhostSeatReservation,
    isPickupOriginLeaf,
    isGhostSeatLeaf,
    dropChromeZone: resolveDropChromeZone(input),
  };
}

/**
 * The ONE pane-body content rule, applied identically to every representation of
 * a pane (in-tree pane at rest, drag source slot, hop-in / new slot, and the
 * portaled drag ghost):
 *
 * - ghost-seat reservation → `render-reservation` (a content-less seat; a drag
 *   mechanic, never carries content regardless of the CONTENT toggle).
 * - otherwise the body honors the CONTENT toggle: `render-content` when content
 *   is visible, `render-empty` when hidden (the pane frame + header chrome stay;
 *   only the body is emptied — no placeholder text).
 *
 * `isGhostSeatReservation` is always `false` for the ghost (it is the single
 * painted instance, never a seat), so the ghost simply paints content iff
 * `isPaneContentVisible` — exactly like a resting in-tree pane.
 */
export function resolvePaneBodyRenderMode(
  isGhostSeatReservation: boolean,
  isPaneContentVisible: boolean,
): DynamicPaneBodyRenderMode {
  if (isGhostSeatReservation) {
    return "render-reservation";
  }
  return isPaneContentVisible ? "render-content" : "render-empty";
}
