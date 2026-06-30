import { isCommittableTarget, type DragResolvedTarget } from "./drag-machine";

/**
 * Custom-rendered drag cursor (interaction tier "c"). A single `position: fixed`
 * sibling of the cursor-following ghost (`DragPaneOverlay`) that REPLACES the OS
 * cursor during an active live drag, transform-pinned to the pointer in the same
 * coalesced rAF/render path as the ghost so it never lags the hardware cursor.
 *
 * This module is the PURE, DOM-less core: it maps the drag FSM's resolved target
 * (`DragResolvedTarget` = the resolver's `TilingDropIntentState`) plus the drop
 * validity onto a small SEMANTIC presentation descriptor — the OPERATION the
 * release would perform (grab / insert / swap) or its rejection (invalid) — NOT
 * an edge direction. The found slot itself already shows where the pane lands;
 * the cursor only confirms what kind of drop is under the pointer. The renderer's
 * `DragCursorOverlay` consumes these outputs and owns the actual SVG/Tailwind +
 * reduced-motion transitions.
 */

/**
 * The semantic cursor states, driven by the drag FSM + resolver operation type +
 * validity (NOT by edge direction):
 * - `grab` — dragging with no committable target (ghost free-following) OR
 *   hovering the drag source itself; neutral "carrying" look.
 * - `insert` — a committable edge-insert slot is resolved; a "drop/place here"
 *   target affordance in the valid accent color. No direction — the found slot
 *   already shows where the pane lands.
 * - `swap` — a committable center/swap target is resolved; a distinct exchange
 *   indicator in the valid accent color (swap is a different operation).
 * - `invalid` — the hovered target is rejected (`blockedReason` set); a
 *   `not-allowed`-style indicator in the warning color.
 */
export type DragCursorKind = "grab" | "insert" | "swap" | "invalid";

/** Color tone the cursor adopts, derived from drop validity. */
export type DragCursorTone = "neutral" | "valid" | "invalid";

export interface DragCursorPresentation {
  /** The semantic operation/validity state the cursor conveys (drives the glyph). */
  kind: DragCursorKind;
  /** Validity tone the cursor adopts (drives the color). */
  tone: DragCursorTone;
}

const GRAB_PRESENTATION: DragCursorPresentation = { kind: "grab", tone: "neutral" };

/**
 * Derive the custom cursor's semantic presentation from the FSM-resolved target +
 * the drag source. Pure (no DOM, no time) so the operation+validity → kind
 * mapping is unit-testable. Precedence mirrors the commit gate
 * (`isCommittableTarget`) so the cursor's "valid" look is shown for EXACTLY the
 * targets a release would commit:
 * - no target / self-target → `grab` (neutral).
 * - committable `swap` (center) → `swap` (valid).
 * - committable `edge-insert` (a resolved, valid edge) → `insert` (valid).
 * - otherwise, a rejected hovered target (`blockedReason` set) → `invalid`.
 * - any remaining non-committable, non-blocked hover → `grab` (neutral).
 */
export function resolveDragCursorPresentation(
  resolvedTarget: DragResolvedTarget | null,
  sourceLeafId: string,
): DragCursorPresentation {
  if (resolvedTarget == null || resolvedTarget.leafId === sourceLeafId) {
    return GRAB_PRESENTATION;
  }
  if (isCommittableTarget(resolvedTarget, sourceLeafId)) {
    if (resolvedTarget.action === "swap") {
      return { kind: "swap", tone: "valid" };
    }
    // Committable + not swap ⇒ a valid edge-insert OR a group-merge (both place
    // the dragged pane), so the cursor confirms a placeable slot with the
    // `insert` affordance (there is no dedicated merge glyph).
    return { kind: "insert", tone: "valid" };
  }
  if (resolvedTarget.blockedReason != null) {
    return { kind: "invalid", tone: "invalid" };
  }
  return GRAB_PRESENTATION;
}

export interface DragCursorPoint {
  x: number;
  y: number;
}

export interface DragCursorViewportBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Clamp the pinned pointer point so the custom cursor element stays fully within
 * the viewport at the edges — the analog of the ghost overlay's off-viewport
 * clamp. `marginPx` reserves room for the cursor element's own extent (so the
 * badge at the right/bottom edge is not clipped). When the bounds are narrower
 * than `2 * marginPx` on an axis (degenerate / tiny viewport), the point snaps
 * to that axis's midpoint rather than inverting. Pure so the clamp is testable
 * without a DOM.
 */
export function clampCursorPointToViewport(
  point: DragCursorPoint,
  bounds: DragCursorViewportBounds,
  marginPx: number,
): DragCursorPoint {
  const minX: number = bounds.left + marginPx;
  const maxX: number = bounds.right - marginPx;
  const minY: number = bounds.top + marginPx;
  const maxY: number = bounds.bottom - marginPx;
  return {
    x: maxX < minX ? (bounds.left + bounds.right) / 2 : Math.min(Math.max(point.x, minX), maxX),
    y: maxY < minY ? (bounds.top + bounds.bottom) / 2 : Math.min(Math.max(point.y, minY), maxY),
  };
}
