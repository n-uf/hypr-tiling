import type { DragMachineState } from "./drag-machine";
import type {
  DynamicDropAction,
  DynamicLeafDropZone,
  DynamicPaneBodyRenderMode,
} from "./types";

/** Drag phases where in-tree hop-in / reservation presentation stays visible. */
export type DragPresentationPhase = DragMachineState["phase"];

export interface DragPresentationInput {
  isPaneContentVisible: boolean;
  liveDragModeEnabled: boolean;
  dragPhase: DragPresentationPhase;
  settlingOutcome: "commit" | "cancel" | null;
  leafId: string;
  pickupOriginLeafId: string | null;
  ghostSeatLeafId: string | null;
  dropAction: DynamicDropAction | null;
  dropZone: DynamicLeafDropZone | null;
}

export interface DragPresentationMode {
  paneBodyRenderMode: DynamicPaneBodyRenderMode;
  showGhost: boolean;
  showInTreeHopIn: boolean;
  hopInLeafId: string | null;
  suppressSourceContentInEmptyMode: boolean;
  isPickupOriginLeaf: boolean;
  isGhostSeatLeaf: boolean;
  /** Drop-target chrome should follow edge-insert semantics, not center-swap. */
  preferEdgeInsertChrome: boolean;
  /** Resolver action/zone disagree (diagnostic / hysteresis guard). */
  isActionZoneMismatch: boolean;
}

/**
 * Whether a drag gesture is materially in flight for presentation purposes.
 * Extends through `settling` commit so hop-in reservation does not flash off
 * for a frame before the committed layout prop lands.
 */
export function isDragPresentationActive(
  dragPhase: DragPresentationPhase,
  settlingOutcome: "commit" | "cancel" | null,
): boolean {
  if (dragPhase === "dragging") {
    return true;
  }
  return dragPhase === "settling" && settlingOutcome === "commit";
}

/**
 * Central resolver for live-drag presentation: ghost visibility, in-tree hop-in
 * slot, empty-mode pickup-origin suppression, and per-leaf body render mode.
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
  const hopInLeafId: string | null =
    input.liveDragModeEnabled && isPresentationActive ? input.ghostSeatLeafId : null;
  const showInTreeHopIn: boolean = hopInLeafId != null && isGhostSeatLeaf;
  const showGhost: boolean = input.dragPhase === "dragging";
  const suppressSourceContentInEmptyMode: boolean =
    !input.isPaneContentVisible &&
    input.liveDragModeEnabled &&
    isPresentationActive &&
    isPickupOriginLeaf;
  const isActionZoneMismatch: boolean =
    input.dropAction === "swap" && input.dropZone != null && input.dropZone !== "center";
  const preferEdgeInsertChrome: boolean =
    input.dropAction === "edge-insert" ||
    (isActionZoneMismatch && input.dropAction === "swap");

  const shouldRenderReservation: boolean =
    input.liveDragModeEnabled && isPresentationActive && isGhostSeatLeaf;
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
    showGhost,
    showInTreeHopIn,
    hopInLeafId,
    suppressSourceContentInEmptyMode,
    isPickupOriginLeaf,
    isGhostSeatLeaf,
    preferEdgeInsertChrome,
    isActionZoneMismatch,
  };
}

export interface DynamicPaneBodyRenderPolicyInput {
  isPaneContentVisible: boolean;
  liveDragModeEnabled: boolean;
  dragPhase: DragPresentationPhase;
  settlingOutcome?: "commit" | "cancel" | null;
  isDragSource: boolean;
  isReservedSlot: boolean;
  pickupOriginLeafId?: string | null;
  leafId?: string;
}

/**
 * Canonical pane-body visibility policy. Delegates to `resolveDragPresentation`
 * when leaf + pickup context is supplied; otherwise maps legacy slot flags.
 */
export function resolvePaneBodyRenderMode(
  input: DynamicPaneBodyRenderPolicyInput,
): DynamicPaneBodyRenderMode {
  const settlingOutcome: "commit" | "cancel" | null = input.settlingOutcome ?? null;
  if (input.leafId != null && input.pickupOriginLeafId !== undefined) {
    return resolveDragPresentation({
      isPaneContentVisible: input.isPaneContentVisible,
      liveDragModeEnabled: input.liveDragModeEnabled,
      dragPhase: input.dragPhase,
      settlingOutcome,
      leafId: input.leafId,
      pickupOriginLeafId: input.pickupOriginLeafId ?? null,
      ghostSeatLeafId: input.isReservedSlot ? input.leafId : null,
      dropAction: null,
      dropZone: null,
    }).paneBodyRenderMode;
  }
  return resolveDragPresentation({
    isPaneContentVisible: input.isPaneContentVisible,
    liveDragModeEnabled: input.liveDragModeEnabled,
    dragPhase: input.dragPhase,
    settlingOutcome,
    leafId: input.isDragSource ? "slot" : "other",
    pickupOriginLeafId: input.isDragSource ? "slot" : null,
    ghostSeatLeafId: input.isReservedSlot ? "slot" : null,
    dropAction: null,
    dropZone: null,
  }).paneBodyRenderMode;
}
