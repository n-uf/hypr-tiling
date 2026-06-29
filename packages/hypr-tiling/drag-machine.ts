import { addLeafToGroup, findGroupContainingLeaf, insertLeafAdjacent, removeLeafTile, swapLeafTiles } from "./state";
import { PLACEMENT_BY_DROP_ZONE } from "./projected-layout";
import type { DynamicDropIntentState, DynamicEdgeZone } from "./drop-intent-resolver";
import type {
  DynamicLayoutNode,
  DynamicLeafDropZone,
  DynamicPaneFootprint,
} from "./types";

/**
 * Pickup threshold in CSS px — the pointer must travel this far from the
 * pickup origin before a press becomes a drag. Mirrors the geometric
 * `hysteresisPx = 6` family and the Hyprland `binds:drag_threshold` analog, so a
 * tap/click on the title bar is never stolen by the drag layer.
 */
export const DRAG_PICKUP_THRESHOLD_PX: number = 6;

/**
 * Default touch long-press delay (ms) a held finger must remain down before the
 * press becomes a drag pickup. Distinguishes a deliberate drag from a tap or a
 * scroll/swipe on touch — mouse/pen skip this entirely (immediate threshold
 * pickup). Configurable per-consumer via `TilingTouchDragCapability.longPressMs`;
 * the FSM itself only reacts to the `LONG_PRESS` event the renderer's timer
 * dispatches, so the reducer stays pure and timer-free.
 */
export const DEFAULT_TOUCH_LONG_PRESS_MS: number = 220;

/** The page-scroll axis a pre-long-press touch may escape along (release to the page). */
export type DragScrollAxis = "vertical" | "horizontal";

/**
 * Default scroll axis a pre-long-press touch may escape along. Vertical mirrors
 * the conventional page-scroll axis: a finger that travels predominantly
 * vertically before the long-press elapses is a scroll, not a drag.
 */
export const DEFAULT_TOUCH_SCROLL_AXIS: DragScrollAxis = "vertical";

/**
 * Movement (CSS px) predominantly along the scroll axis, BEFORE the long-press
 * elapses, that classifies a touch gesture as a scroll → release to the page.
 * Smaller than a deliberate-drag intent so a flick scroll escapes promptly; the
 * drag handle still carries `touch-action: none` so the browser does not also
 * scroll, but the escape lets a mistargeted flick fall through as a no-op.
 */
export const DRAG_TOUCH_SCROLL_ESCAPE_PX: number = 10;

/** The pointer device classes the FSM distinguishes (mouse/pen vs touch). */
export type DragPointerType = "mouse" | "pen" | "touch";

export interface DragMachinePoint {
  x: number;
  y: number;
}

/**
 * The resolved hover target the FSM tracks. Structurally a `DynamicDropIntentState`
 * (the resolver output the renderer already produces), so the renderer can store
 * the full resolved intent verbatim and the candidate-tree derivation / commit
 * both read the SAME object the preview render reads — no second resolution path.
 */
export type DragResolvedTarget = DynamicDropIntentState;

export type DragSettleOutcome = "commit" | "cancel";

/**
 * The single discriminated-union drag-lifecycle state. One `useReducer` in the
 * renderer owns this; every non-idle phase has at least one enumerated edge back
 * to `idle`, so "stuck/parked" is structurally impossible (every terminal pointer
 * event routes `dragging → settling → idle`).
 *
 * - `idle` — no drag in flight.
 * - `armed` — pointer is down on a drag handle but the pickup threshold has not
 *   been crossed; a sub-threshold release is a click, not a drag.
 * - `dragging` — threshold crossed; pointer is captured; the ghost follows the
 *   pointer and `resolvedTarget` tracks the hovered destination.
 * - `settling` — a terminal event fired; `outcome` says whether the renderer
 *   commits (`onLayoutChange`) or cancels (revert to the original layout +
 *   fly-back). Always transitions to `idle` on `SETTLE_DONE`.
 */
export type DragMachineState =
  | { phase: "idle" }
  | {
      phase: "armed";
      pointerId: number;
      pointerType: DragPointerType;
      /**
       * TRUE iff this pickup came from a touch pointer. Drives the touch-specific
       * choreography (long-press disambiguation + scroll escape) in `armed`; a
       * mouse/pen press leaves it `false` and uses the immediate threshold pickup.
       */
      touchDrag: boolean;
      sourceLeafId: string;
      anchorFootprint: DynamicPaneFootprint;
      pointerAnchorOffset: DragMachinePoint;
      originClient: DragMachinePoint;
    }
  | {
      phase: "dragging";
      pointerId: number;
      pointerType: DragPointerType;
      /** Carried through from `armed` so the dragging layer can read the device class. */
      touchDrag: boolean;
      sourceLeafId: string;
      anchorFootprint: DynamicPaneFootprint;
      pointerAnchorOffset: DragMachinePoint;
      ghostFootprint: DynamicPaneFootprint;
      resolvedTarget: DragResolvedTarget | null;
    }
  | {
      phase: "settling";
      outcome: DragSettleOutcome;
      sourceLeafId: string;
      resolvedTarget: DragResolvedTarget | null;
      fromFootprint: DynamicPaneFootprint;
      toFootprint: DynamicPaneFootprint;
    };

export type DragMachineEvent =
  | {
      type: "POINTER_DOWN";
      pointerId: number;
      pointerType: DragPointerType;
      sourceLeafId: string;
      anchorFootprint: DynamicPaneFootprint;
      pointerAnchorOffset: DragMachinePoint;
      originClient: DragMachinePoint;
    }
  | { type: "POINTER_MOVE"; pointerId: number; client: DragMachinePoint }
  | { type: "LONG_PRESS"; pointerId: number }
  | { type: "TARGET_RESOLVED"; pointerId: number; resolvedTarget: DragResolvedTarget | null }
  | { type: "POINTER_UP"; pointerId: number }
  | { type: "POINTER_CANCEL"; pointerId?: number }
  | { type: "ESCAPE" }
  | { type: "BLUR" }
  | { type: "VISIBILITY_HIDDEN" }
  | { type: "SETTLE_DONE" };

export const DRAG_MACHINE_INITIAL_STATE: DragMachineState = { phase: "idle" };

/** Euclidean travel from the pickup origin has reached the pickup threshold. */
export function hasCrossedPickupThreshold(
  origin: DragMachinePoint,
  client: DragMachinePoint,
  thresholdPx: number = DRAG_PICKUP_THRESHOLD_PX,
): boolean {
  const dx: number = client.x - origin.x;
  const dy: number = client.y - origin.y;
  return Math.hypot(dx, dy) >= thresholdPx;
}

/**
 * The verdict on a pre-pickup touch `POINTER_MOVE` while `armed`:
 * - `hold` — below the pickup threshold (finger jitter); stay armed, no drag.
 * - `pickup` — promote to `dragging` (deliberate non-scroll travel past the
 *   pickup threshold, OR any threshold travel once the long-press has elapsed).
 * - `scroll-escape` — predominant scroll-axis travel past the escape distance
 *   BEFORE the long-press; release the gesture to the page (FSM → idle).
 */
export type TouchArmedMoveResolution = "hold" | "pickup" | "scroll-escape";

/**
 * Pure touch pickup-vs-scroll disambiguator for an `armed` touch press. Touch
 * cannot pick up on raw travel the way a mouse does — a flick would steal a
 * scroll and a stationary tap would never become a click. The model (mirrors the
 * dnd-kit delay+tolerance touch sensor, and `_agent/touch-drag-design.md`):
 *
 * - while the long-press has NOT elapsed (`longPressSatisfied: false`), travel
 *   predominantly along the scroll axis past `scrollEscapePx` is a scroll →
 *   `scroll-escape`; travel past the pickup threshold that is NOT scroll-dominant
 *   is a deliberate drag → `pickup`; anything smaller is finger jitter → `hold`;
 * - once the long-press has elapsed (`longPressSatisfied: true`, i.e. the held
 *   finger already crossed into a drag intent), any threshold-crossing travel is
 *   a `pickup` and scroll escape no longer applies.
 *
 * The renderer's `LONG_PRESS` timer short-circuits a held finger straight to
 * `dragging`, so in practice the reducer only consults this with
 * `longPressSatisfied: false`; the parameter is retained so the classifier is
 * complete and unit-testable in isolation.
 */
export function resolveTouchArmedMove(params: {
  origin: DragMachinePoint;
  client: DragMachinePoint;
  longPressSatisfied: boolean;
  pickupThresholdPx?: number;
  scrollEscapePx?: number;
  scrollAxis?: DragScrollAxis;
}): TouchArmedMoveResolution {
  const pickupThresholdPx: number = params.pickupThresholdPx ?? DRAG_PICKUP_THRESHOLD_PX;
  const scrollEscapePx: number = params.scrollEscapePx ?? DRAG_TOUCH_SCROLL_ESCAPE_PX;
  const scrollAxis: DragScrollAxis = params.scrollAxis ?? DEFAULT_TOUCH_SCROLL_AXIS;
  const crossedThreshold: boolean = hasCrossedPickupThreshold(params.origin, params.client, pickupThresholdPx);
  if (params.longPressSatisfied) {
    return crossedThreshold ? "pickup" : "hold";
  }
  const dx: number = params.client.x - params.origin.x;
  const dy: number = params.client.y - params.origin.y;
  const alongScroll: number = scrollAxis === "vertical" ? dy : dx;
  const acrossScroll: number = scrollAxis === "vertical" ? dx : dy;
  if (Math.abs(alongScroll) >= scrollEscapePx && Math.abs(alongScroll) > Math.abs(acrossScroll)) {
    return "scroll-escape";
  }
  return crossedThreshold ? "pickup" : "hold";
}

/** The ghost footprint at the current pointer position (anchored at the pickup grab offset). */
export function ghostFootprintAt(
  anchorFootprint: DynamicPaneFootprint,
  pointerAnchorOffset: DragMachinePoint,
  client: DragMachinePoint,
): DynamicPaneFootprint {
  return {
    left: client.x - pointerAnchorOffset.x,
    top: client.y - pointerAnchorOffset.y,
    width: anchorFootprint.width,
    height: anchorFootprint.height,
  };
}

/**
 * The single edge zone a commit / candidate-edge-insert uses for a target —
 * matches the legacy `handleLeafDrop` precedence (`finalEdge ?? selectedSplitZone`).
 */
export function resolveCommitEdgeZone(target: DragResolvedTarget): DynamicEdgeZone | null {
  return target.finalEdge ?? target.selectedSplitZone;
}

/**
 * Whether a `POINTER_UP` over this target commits (vs cancels). Mirrors
 * `handleLeafDrop`: a `swap` always commits; an `edge-insert` commits only when a
 * concrete edge zone resolved; anything else (`none` / null / self-target) cancels.
 */
export function isCommittableTarget(
  target: DragResolvedTarget | null,
  sourceLeafId: string,
): boolean {
  if (target == null || target.leafId === sourceLeafId) {
    return false;
  }
  if (target.action === "swap") {
    return true;
  }
  if (target.action === "group-merge") {
    return true;
  }
  if (target.action === "edge-insert") {
    return resolveCommitEdgeZone(target) != null;
  }
  return false;
}

/**
 * TRUE live-reflow candidate tree. The rendered tree in live mode IS this — the
 * destination physically reflows to the post-drop result; there is NO projection
 * or result-shadow. Always derived from the ORIGINAL `layout` (never the previous
 * candidate) so zone jitter cannot accumulate, and it goes through the SAME pure
 * reducers the commit uses, so the committed tree equals the last candidate
 * (no release-time jump).
 *
 * - no target / self-target / non-committable → `removeLeafTile` (gap-closed
 *   base; the source rides the ghost over the closed gap).
 * - `swap` → `swapLeafTiles`.
 * - `edge-insert` → `insertLeafAdjacent` at the resolved edge.
 */
export function deriveCandidateTree(
  layout: DynamicLayoutNode,
  sourceLeafId: string | null,
  resolvedTarget: DragResolvedTarget | null,
): DynamicLayoutNode {
  if (sourceLeafId == null) {
    return layout;
  }
  if (resolvedTarget == null || resolvedTarget.leafId === sourceLeafId) {
    return removeLeafTile(layout, sourceLeafId);
  }
  if (resolvedTarget.action === "swap") {
    return swapLeafTiles(layout, sourceLeafId, resolvedTarget.leafId);
  }
  if (resolvedTarget.action === "group-merge") {
    const group = findGroupContainingLeaf(layout, resolvedTarget.leafId);
    if (group == null) {
      return removeLeafTile(layout, sourceLeafId);
    }
    return addLeafToGroup(layout, group.id, sourceLeafId);
  }
  if (resolvedTarget.action === "edge-insert") {
    const edgeZone: DynamicEdgeZone | null = resolveCommitEdgeZone(resolvedTarget);
    if (edgeZone == null) {
      return removeLeafTile(layout, sourceLeafId);
    }
    return insertLeafAdjacent(layout, sourceLeafId, resolvedTarget.leafId, PLACEMENT_BY_DROP_ZONE[edgeZone], {
      preserveParentSplitAxis: false,
      splitRatio: 0.5,
    });
  }
  return removeLeafTile(layout, sourceLeafId);
}

/**
 * The candidate-tree leaf whose slot CARRIES the dragged pane's content — the
 * single slot the ghost reserves (content-less) and HOPS INTO. Where the dragged
 * content lands in `deriveCandidateTree` differs by action, and the reservation /
 * seat MUST follow it (not the FSM source leaf id), otherwise a SWAP paints the
 * dragged pane twice:
 *
 * - `swap` (`swapLeafTiles` swaps tileIds IN PLACE) → the dragged content moves
 *   onto the RESOLVED TARGET leaf; the source leaf now carries the displaced
 *   target content and must render normally. So the seat is the TARGET leaf.
 * - `edge-insert` (`insertLeafAdjacent` moves the source leaf, still carrying the
 *   source content, next to the target) → the SOURCE leaf.
 * - no / self / non-committable target (`removeLeafTile` gap-closes the source
 *   out of the tree) → `null`: there is no in-tree slot, so the ghost free-follows.
 *
 * Keying the single-instance reservation + the seat measurement on this is the
 * fix for the SWAP double-paint (source slot was wrongly reserved while the
 * dragged content was painted at the target slot under the ghost). The candidate
 * TREE is unchanged (still `swapLeafTiles`), so the preview stays byte-identical
 * to the commit — only WHICH slot the ghost seats into changes.
 */
export function resolveDragGhostSeatLeafId(
  sourceLeafId: string | null,
  resolvedTarget: DragResolvedTarget | null,
): string | null {
  if (sourceLeafId == null) {
    return null;
  }
  if (resolvedTarget == null || resolvedTarget.leafId === sourceLeafId) {
    return null;
  }
  if (resolvedTarget.action === "swap") {
    return resolvedTarget.leafId;
  }
  if (resolvedTarget.action === "group-merge") {
    return resolvedTarget.leafId;
  }
  if (resolvedTarget.action === "edge-insert") {
    return resolveCommitEdgeZone(resolvedTarget) == null ? null : sourceLeafId;
  }
  return null;
}

/**
 * Single-instance gate. In live mode the picked-up source leaf only appears in
 * the candidate tree when a committable target is resolved (`swap` /
 * `edge-insert`) — `deriveCandidateTree` gap-closes it (`removeLeafTile`)
 * otherwise. When it DOES appear it sits in the destination slot, so painting
 * its full content there is a second copy of the source on top of the ghost.
 * ht's contract is EXACTLY ONE visible instance of the dragged pane content (the
 * ghost), so this returns `true` when the renderer should paint that slot as a
 * content-less RESERVATION instead of the source content: the candidate tree
 * still opens the slot (survivors reflow to make room — real reorganization),
 * and the single ghost (`DragPaneOverlay`) HOPS INTO and FILLS the reservation's
 * measured rect (the hop-in), so the slot is never an empty hole and the source
 * is never painted twice. Preview mode is unaffected (the source keeps its
 * dimmed in-place affordance), since the gate is live-only.
 */
export function shouldReserveDragSourceSlot(
  liveDragModeEnabled: boolean,
  isDragSource: boolean,
): boolean {
  return liveDragModeEnabled && isDragSource;
}

/**
 * Slot re-resolution / commitment policy after the ghost hops into a slot.
 * - `zone-exit-hold` (anchored / sticky): the seated target is pinned through
 *   small cursor movements; it re-resolves ONLY when the cursor crosses OUT of
 *   the seated target's (frozen) hit footprint. High hysteresis.
 * - `delta-responsive` (DEFAULT): the seated target re-resolves eagerly once the
 *   cursor travels beyond `reresolveDeltaPx` from the seat anchor, OR when it
 *   exits the seated footprint — whichever comes first. More responsive re-aim.
 */
export type DragSlotCommitmentMode = "zone-exit-hold" | "delta-responsive";

/** Default slot-commitment policy: the more responsive delta-driven re-aim. */
export const DEFAULT_DRAG_SLOT_COMMITMENT_MODE: DragSlotCommitmentMode = "delta-responsive";

/**
 * Default movement-delta (CSS px) before `delta-responsive` re-resolves a seated
 * target without requiring a full zone exit. Coarser than the 6px geometric zone
 * hysteresis (`DYNAMIC_DROP_INTENT_CONFIG.hysteresisPx`) on purpose — this gates
 * WHETHER to re-run resolution while seated, not WHICH edge resolves, so the two
 * dampers operate on different axes and never double-count.
 */
export const DEFAULT_DRAG_RERESOLVE_DELTA_PX: number = 24;

/**
 * Whether a seated target should re-resolve given the commitment policy. Pure so
 * both modes are unit-testable without a DOM. The renderer's coalescer consults
 * this before adopting a freshly-resolved target while a slot is already seated:
 * `false` holds the seated slot (no retarget, seat anchor unchanged); `true`
 * adopts the fresh resolution (and re-anchors the seat on a non-null target).
 *
 * The delta gate is NOT fed into `resolveDropIntent`'s `previousZone` — a
 * `delta-responsive` re-resolution still runs the normal 6px geometric
 * hysteresis once it fires, so the coarse "should I re-aim" delta and the fine
 * "which edge" hysteresis never apply to the same decision.
 */
export function shouldReresolveSeatedTarget(params: {
  mode: DragSlotCommitmentMode;
  seatAnchor: DragMachinePoint;
  currentClient: DragMachinePoint;
  reresolveDeltaPx: number;
  cursorWithinSeatedFootprint: boolean;
}): boolean {
  if (!params.cursorWithinSeatedFootprint) {
    return true;
  }
  if (params.mode === "zone-exit-hold") {
    return false;
  }
  const dx: number = params.currentClient.x - params.seatAnchor.x;
  const dy: number = params.currentClient.y - params.seatAnchor.y;
  return Math.hypot(dx, dy) >= params.reresolveDeltaPx;
}

/**
 * Release-time slot preservation (Hyprland-style). When the ghost is seated on a
 * committable target, do not clobber it if release coords resolve null or a
 * non-committable target — a quick flick off the slot still commits the seated
 * drop. During move samples this returns false so the slot-commitment policy
 * governs re-aim.
 */
export function shouldPreserveSeatedTargetOnRelease(
  seatedTarget: DragResolvedTarget | null,
  freshTarget: DragResolvedTarget | null,
  sourceLeafId: string,
  isReleaseSample: boolean,
): boolean {
  if (!isReleaseSample || seatedTarget == null) {
    return false;
  }
  if (!isCommittableTarget(seatedTarget, sourceLeafId)) {
    return false;
  }
  if (freshTarget == null) {
    return true;
  }
  return !isCommittableTarget(freshTarget, sourceLeafId);
}

/**
 * The hysteresis seed (`previousZone`) for re-resolving intent over a target —
 * the prior resolved zone IFF the prior target is the same leaf, else `null`.
 * Subsumes the old `stableDropStateRef`: the FSM's `resolvedTarget` IS the stable
 * zone source, so zone flips must overcome the geometric hysteresis band.
 */
export function previousZoneSeed(
  resolvedTarget: DragResolvedTarget | null,
  hoveredLeafId: string,
): DynamicLeafDropZone | null {
  if (resolvedTarget == null || resolvedTarget.leafId !== hoveredLeafId) {
    return null;
  }
  return resolvedTarget.zone;
}

/** True when an event targets a pointer the machine is NOT currently tracking. */
function isForeignPointer(state: DragMachineState, eventPointerId: number | undefined): boolean {
  if (eventPointerId == null) {
    return false;
  }
  if (state.phase === "armed" || state.phase === "dragging") {
    return eventPointerId !== state.pointerId;
  }
  return false;
}

function settleFrom(state: Extract<DragMachineState, { phase: "dragging" }>, outcome: DragSettleOutcome): DragMachineState {
  return {
    phase: "settling",
    outcome,
    sourceLeafId: state.sourceLeafId,
    resolvedTarget: outcome === "commit" ? state.resolvedTarget : null,
    fromFootprint: state.ghostFootprint,
    toFootprint: state.anchorFootprint,
  };
}

/**
 * Pure drag-lifecycle reducer. No side effects (no `setPointerCapture`, no
 * `onLayoutChange`) — those are run by the renderer in response to the resulting
 * phase. Every `(state, event)` pair has a defined transition; unmatched pairs
 * return the state unchanged, so the machine can never wedge.
 */
export function dragMachineReducer(state: DragMachineState, event: DragMachineEvent): DragMachineState {
  // Multi-touch / hijack guard: a foreign pointer cannot fork or steal the drag.
  if (isForeignPointer(state, "pointerId" in event ? event.pointerId : undefined)) {
    return state;
  }

  switch (state.phase) {
    case "idle": {
      if (event.type === "POINTER_DOWN") {
        return {
          phase: "armed",
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          touchDrag: event.pointerType === "touch",
          sourceLeafId: event.sourceLeafId,
          anchorFootprint: event.anchorFootprint,
          pointerAnchorOffset: event.pointerAnchorOffset,
          originClient: event.originClient,
        };
      }
      return state;
    }

    case "armed": {
      switch (event.type) {
        case "POINTER_MOVE": {
          // Touch must disambiguate a drag from a tap/scroll: a pre-long-press
          // scroll-axis flick releases to the page (→ idle); a non-scroll
          // threshold-crossing travel is a deliberate pickup. Mouse/pen keep the
          // immediate geometric threshold pickup (no long-press, no scroll axis).
          if (state.touchDrag) {
            const resolution: TouchArmedMoveResolution = resolveTouchArmedMove({
              origin: state.originClient,
              client: event.client,
              longPressSatisfied: false,
            });
            if (resolution === "scroll-escape") {
              return { phase: "idle" };
            }
            if (resolution === "hold") {
              return state;
            }
          } else if (!hasCrossedPickupThreshold(state.originClient, event.client)) {
            return state;
          }
          return {
            phase: "dragging",
            pointerId: state.pointerId,
            pointerType: state.pointerType,
            touchDrag: state.touchDrag,
            sourceLeafId: state.sourceLeafId,
            anchorFootprint: state.anchorFootprint,
            pointerAnchorOffset: state.pointerAnchorOffset,
            ghostFootprint: ghostFootprintAt(state.anchorFootprint, state.pointerAnchorOffset, event.client),
            resolvedTarget: null,
          };
        }
        // Touch long-press elapsed while the finger is held within tolerance →
        // begin the drag in place. The ghost lifts at the anchor (the finger is at
        // ~origin); the next POINTER_MOVE tracks it. Mouse/pen never receive this
        // event (the renderer arms the timer only for touch).
        case "LONG_PRESS": {
          if (!state.touchDrag) {
            return state;
          }
          return {
            phase: "dragging",
            pointerId: state.pointerId,
            pointerType: state.pointerType,
            touchDrag: state.touchDrag,
            sourceLeafId: state.sourceLeafId,
            anchorFootprint: state.anchorFootprint,
            pointerAnchorOffset: state.pointerAnchorOffset,
            ghostFootprint: ghostFootprintAt(state.anchorFootprint, state.pointerAnchorOffset, state.originClient),
            resolvedTarget: null,
          };
        }
        // Sub-threshold release / cancel / interruption: it was a click/tap,
        // nothing was ever mounted — return straight to idle.
        case "POINTER_UP":
        case "POINTER_CANCEL":
        case "ESCAPE":
        case "BLUR":
        case "VISIBILITY_HIDDEN":
          return { phase: "idle" };
        case "POINTER_DOWN":
          // Re-arm on a fresh primary press (the prior press is abandoned).
          return {
            phase: "armed",
            pointerId: event.pointerId,
            pointerType: event.pointerType,
            touchDrag: event.pointerType === "touch",
            sourceLeafId: event.sourceLeafId,
            anchorFootprint: event.anchorFootprint,
            pointerAnchorOffset: event.pointerAnchorOffset,
            originClient: event.originClient,
          };
        default:
          return state;
      }
    }

    case "dragging": {
      switch (event.type) {
        case "POINTER_MOVE":
          return {
            ...state,
            ghostFootprint: ghostFootprintAt(state.anchorFootprint, state.pointerAnchorOffset, event.client),
          };
        case "TARGET_RESOLVED":
          return { ...state, resolvedTarget: event.resolvedTarget };
        case "POINTER_UP":
          return settleFrom(state, isCommittableTarget(state.resolvedTarget, state.sourceLeafId) ? "commit" : "cancel");
        // Every interruption is an enumerated cancel edge → settling(cancel) →
        // idle. This is the structural elimination of "stuck on drag".
        case "POINTER_CANCEL":
        case "ESCAPE":
        case "BLUR":
        case "VISIBILITY_HIDDEN":
          return settleFrom(state, "cancel");
        default:
          return state;
      }
    }

    case "settling": {
      switch (event.type) {
        case "SETTLE_DONE":
          return { phase: "idle" };
        case "POINTER_DOWN":
          // Preempt a residual settle with a new pickup.
          return {
            phase: "armed",
            pointerId: event.pointerId,
            pointerType: event.pointerType,
            touchDrag: event.pointerType === "touch",
            sourceLeafId: event.sourceLeafId,
            anchorFootprint: event.anchorFootprint,
            pointerAnchorOffset: event.pointerAnchorOffset,
            originClient: event.originClient,
          };
        default:
          return state;
      }
    }

    default:
      return state;
  }
}

/**
 * The animation-frame scheduler the coalescer drives. Injectable so the
 * coalescing/teardown logic is unit-testable in a DOM-less environment with a
 * fake scheduler (the renderer passes the real `requestAnimationFrame` /
 * `cancelAnimationFrame`).
 */
export interface FrameScheduler {
  request: (callback: () => void) => number;
  cancel: (handle: number) => void;
}

/**
 * Coalesces a burst of payloads (raw `pointermove` coords) into AT MOST ONE
 * delivery per animation frame, always carrying the LATEST payload. This
 * decouples the input frame from the render frame: many `pointermove` events in
 * a single frame collapse to one target-resolution + candidate-tree recompute,
 * so mid-frame DOM mutation cannot race the event stream and reflow thrash is
 * bounded to one pass per frame.
 *
 * `schedule` records the latest payload and arms a single frame; `cancel` (the
 * teardown path) drops any pending frame AND the buffered payload, so a frame
 * can never fire after the drag has settled.
 */
export interface FrameCoalescer<TPayload> {
  schedule: (payload: TPayload) => void;
  cancel: () => void;
}

export function createFrameCoalescer<TPayload>(
  onFrame: (payload: TPayload) => void,
  scheduler: FrameScheduler,
): FrameCoalescer<TPayload> {
  let frameHandle: number | null = null;
  let pendingPayload: TPayload | null = null;
  let hasPending: boolean = false;

  const flush = (): void => {
    frameHandle = null;
    if (!hasPending) {
      return;
    }
    const payload: TPayload = pendingPayload as TPayload;
    hasPending = false;
    pendingPayload = null;
    onFrame(payload);
  };

  return {
    schedule: (payload: TPayload): void => {
      pendingPayload = payload;
      hasPending = true;
      if (frameHandle == null) {
        frameHandle = scheduler.request(flush);
      }
    },
    cancel: (): void => {
      if (frameHandle != null) {
        scheduler.cancel(frameHandle);
        frameHandle = null;
      }
      hasPending = false;
      pendingPayload = null;
    },
  };
}

/** The picked-up source leaf while a drag is materially in flight (dragging only). */
export function activeDragSourceLeafId(state: DragMachineState): string | null {
  return state.phase === "dragging" ? state.sourceLeafId : null;
}

/** The resolved hover target while dragging (the renderer's `dropState`). */
export function activeResolvedTarget(state: DragMachineState): DragResolvedTarget | null {
  return state.phase === "dragging" ? state.resolvedTarget : null;
}

/**
 * Pickup-origin leaf for presentation gating. Extends through `settling` commit so
 * hop-in reservation and empty-mode suppression do not flash off pre-commit.
 */
export function presentationDragSourceLeafId(
  state: DragMachineState,
): string | null {
  if (state.phase === "dragging") {
    return state.sourceLeafId;
  }
  if (state.phase === "settling" && state.outcome === "commit") {
    return state.sourceLeafId;
  }
  return null;
}

/**
 * Resolved target for presentation gating. Mirrors `activeResolvedTarget` but
 * holds through `settling` commit for seat measurement continuity.
 */
export function presentationResolvedTarget(
  state: DragMachineState,
): DragResolvedTarget | null {
  if (state.phase === "dragging") {
    return state.resolvedTarget;
  }
  if (state.phase === "settling" && state.outcome === "commit") {
    return state.resolvedTarget;
  }
  return null;
}
