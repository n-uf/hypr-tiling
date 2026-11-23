import { findGroupContainingLeaf, findLeafById, removeGroupNode, removeLeafTile } from "./state";
import type { TilingDropIntentState, TilingEdgeZone } from "./drop-intent-resolver";
import type {
  TilingExternalDropSubject,
  TilingGroupNode,
  TilingLayoutNode,
  TilingLeafNode,
  TilingPaneFootprint,
} from "./types";

/**
 * Pickup threshold in CSS px — the pointer must travel this far from the
 * pickup origin before a press becomes a drag. As the drag hit's 6 px edge
 * measure and the Hyprland `binds:drag_threshold` analog, so a
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

/** A window-client point (CSS px) as the drag FSM tracks it. */
export interface DragMachinePoint {
  /** Horizontal window-client coordinate. */
  x: number;
  /** Vertical window-client coordinate. */
  y: number;
}

/**
 * The resolved hover target the FSM tracks. Structurally a `TilingDropIntentState`
 * (the resolver output the renderer already produces), so the renderer can store
 * the full resolved intent verbatim and the commit reads the SAME object (its
 * held `place`) the preview render reads — no second resolution path.
 */
export type DragResolvedTarget = TilingDropIntentState;

export type DragSettleOutcome = "commit" | "cancel" | "claimed";

/**
 * What a drag moves. `"pane"`: the one pane on `sourceLeafId` (a tab torn off
 * its group, or an ungrouped pane). `"group"`: the whole tab group
 * `sourceLeafId` is the active member of — grabbed by its title bar or the
 * empty part of its tab strip — moved as one unit (same members, order and
 * active tab). Absent on a state means `"pane"`; a group subject whose source
 * is not in a group is treated as `"pane"`.
 */
export type DragSubject = "pane" | "group";

/**
 * The group a drag of `subject` on `sourceLeafId` moves as a whole, or `null`
 * when it moves the one pane.
 */
export function dragSubjectGroupId(
  layout: TilingLayoutNode,
  sourceLeafId: string,
  subject: DragSubject | undefined,
): string | null {
  return subject === "group" ? (findGroupContainingLeaf(layout, sourceLeafId)?.id ?? null) : null;
}

/**
 * The tree with the dragged subject taken out and the gap closed: the pane
 * (`removeLeafTile`) or its whole group (`removeGroupNode`).
 */
export function detachDragSubject(
  layout: TilingLayoutNode,
  sourceLeafId: string,
  subject?: DragSubject,
): TilingLayoutNode {
  const groupId: string | null = dragSubjectGroupId(layout, sourceLeafId, subject);
  return groupId == null ? removeLeafTile(layout, sourceLeafId) : removeGroupNode(layout, groupId);
}

/**
 * What a claim of the drag (a host `onExternalDrop`, a workspace-tab drop)
 * hands over: the whole group of a group drag, its members in tab order, or
 * the one pane.
 */
export function resolveExternalDropSubject(
  layout: TilingLayoutNode,
  sourceLeafId: string,
  subject: DragSubject | undefined,
): TilingExternalDropSubject {
  const group: TilingGroupNode | null =
    subject === "group" ? findGroupContainingLeaf(layout, sourceLeafId) : null;
  if (group != null) {
    return {
      kind: "group",
      groupId: group.id,
      members: group.members,
      activeLeafId: sourceLeafId,
    };
  }
  const leaf: TilingLeafNode | null = findLeafById(layout, sourceLeafId);
  return {
    kind: "pane",
    groupId: null,
    members: leaf == null ? [] : [leaf],
    activeLeafId: sourceLeafId,
  };
}

/**
 * The single discriminated-union drag-lifecycle state. One `useReducer` in the
 * renderer owns this; every non-idle phase has at least one enumerated edge back
 * to `idle`, so "stuck/parked" is structurally impossible (every terminal pointer
 * event routes `dragging → settling → idle`).
 *
 * - `idle` — no drag in flight.
 * - `armed` — pointer is down on a drag handle but the pickup threshold has not
 *   been crossed; a sub-threshold release is a click, not a drag.
 * - `dragging` — threshold crossed; pointer is captured; the lifted pane is held
 *   under the pointer, `resolvedTarget` tracks the hovered destination and
 *   `atHome` whether the pane's own place (its home) is the target now.
 * - `settling` — a terminal event fired; `outcome` says whether the renderer
 *   commits (`onLayoutChange`), cancels (the untouched layout comes back and
 *   every pane settles home), or was `claimed` by the host (`onExternalDrop` —
 *   no in-tree commit). Always transitions to `idle` on `SETTLE_DONE`.
 *
 * `idle` has a second entry edge into `dragging`: {@link DragRearmEvent}
 * (`REARM`), the spring-loaded tab drop's continuation drag on the leaf's new
 * seat under the still-held pointer. It is the only edge that skips `armed`.
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
      /** What the drag moves (absent: the one pane). */
      subject?: DragSubject;
      anchorFootprint: TilingPaneFootprint;
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
      /** What the drag moves (absent: the one pane). */
      subject?: DragSubject;
      anchorFootprint: TilingPaneFootprint;
      pointerAnchorOffset: DragMachinePoint;
      /** Where the pointer holds the pane: pointer minus grab offset, at its lift size. */
      heldFootprint: TilingPaneFootprint;
      resolvedTarget: DragResolvedTarget | null;
      /**
       * Whether the drag hit holds home now (its last `TARGET_RESOLVED`): the
       * pane's place at the lift, or a place whose release gives the lift back,
       * held by the hit's one hold rule. While it is, the layout is the one at
       * the lift and a release there is a cancel (that layout comes back).
       */
      atHome: boolean;
      /**
       * Whether the drag hit has let go of home at least once since the lift.
       * It decides nothing; `atHome` does.
       */
      leftHome: boolean;
    }
  | {
      phase: "settling";
      outcome: DragSettleOutcome;
      sourceLeafId: string;
      /** What the drag moved (absent: the one pane). */
      subject?: DragSubject;
      resolvedTarget: DragResolvedTarget | null;
    };

export type DragMachineEvent =
  | {
      type: "POINTER_DOWN";
      pointerId: number;
      pointerType: DragPointerType;
      sourceLeafId: string;
      /** What the press picks up: the pane (default) or its whole tab group. */
      subject?: DragSubject;
      anchorFootprint: TilingPaneFootprint;
      pointerAnchorOffset: DragMachinePoint;
      originClient: DragMachinePoint;
    }
  | { type: "POINTER_MOVE"; pointerId: number; client: DragMachinePoint }
  | { type: "LONG_PRESS"; pointerId: number }
  | {
      type: "TARGET_RESOLVED";
      pointerId: number;
      resolvedTarget: DragResolvedTarget | null;
      /** Whether the drag hit holds home at this sample (absent: unchanged). */
      atHome?: boolean;
    }
  | { type: "POINTER_UP"; pointerId: number; claimed?: boolean }
  | { type: "POINTER_CANCEL"; pointerId?: number }
  | { type: "ESCAPE" }
  | { type: "BLUR" }
  | { type: "VISIBILITY_HIDDEN" }
  | { type: "SETTLE_DONE" }
  | DragRearmEvent;

/**
 * `REARM` — start a NEW drag on `sourceLeafId` at the CURRENT pointer position
 * without a fresh `pointerdown`. The spring-loaded workspace-tab drop
 * (`engine/workspace-spring-load.ts`, plan N3) ends the running drag as a
 * `claimed` external commit (`moveLeafToWorkspace`), the set switches to the
 * destination workspace, and the still-held pointer must keep dragging the
 * leaf from its NEW seat — so the machine needs an edge from `idle` straight
 * into `dragging` that carries the pointer identity of the button that is
 * still down.
 *
 * Accepted ONLY in `idle` (see {@link canRearmDrag}); ignored in every other
 * phase, so a `REARM` can never fork a live drag or skip a pending settle
 * teardown (the settle effect must have run `SETTLE_DONE` first — that is
 * where the renderer releases the old seat / latch cluster and strips the old
 * tree's transient styles, INV-R1). The event carries a footprint measured on
 * the NEW tree: nothing from the previous drag's `anchorFootprint`,
 * `resolvedTarget` or `heldFootprint` survives into the re-armed state, so a
 * cancel after a rearm settles the leaf on its new seat, never in the old
 * workspace.
 *
 * `tileId` is informational for the host bridge; the reducer itself is
 * leaf-keyed and ignores it.
 */
export interface DragRearmEvent {
  /** Discriminant. */
  type: "REARM";
  /** The pointer that is still held down (the pointer the claimed drag ran on). */
  pointerId: number;
  /** Its device class; `touchDrag` is derived from it exactly as on `POINTER_DOWN`. */
  pointerType: DragPointerType;
  /** The leaf to drag from its seat in the NEW tree. */
  sourceLeafId: string;
  /**
   * What the re-armed drag moves (absent: the one pane). A group subject's
   * `anchorFootprint` is the group's frame, strip and pane together.
   */
  subject?: DragSubject;
  /** The tile the leaf carries — informational; unused by the reducer. */
  tileId?: string;
  /** The leaf's footprint measured on the NEW tree (its seat after the move). */
  anchorFootprint: TilingPaneFootprint;
  /**
   * Grab offset inside `anchorFootprint`. Omitted → {@link rearmPointerAnchorOffset}
   * (the pointer's own offset when it is inside the footprint, else its centre).
   */
  pointerAnchorOffset?: DragMachinePoint;
  /** The pointer's CURRENT window-client position — the re-armed drag's first sample. */
  client: DragMachinePoint;
}

export const DRAG_MACHINE_INITIAL_STATE: DragMachineState = { phase: "idle" };

/**
 * The phase gate of {@link DragRearmEvent}: `true` iff the machine is `idle`.
 * The set-mode wrapper consults it before dispatching `REARM` so a spring-load
 * whose settle has not finished (`settling`), or that races a fresh press
 * (`armed` / `dragging`), is dropped rather than queued.
 */
export function canRearmDrag(state: DragMachineState): boolean {
  return state.phase === "idle";
}

/**
 * The grab offset a re-armed drag uses when the host does not supply one. The
 * pointer is typically OUTSIDE the leaf's new seat at rearm time (it is still
 * over the workspace tab), so a raw `client − footprint.origin` offset would be
 * negative / oversized and the held pane would trail far from the
 * cursor. Inside the footprint the real offset is kept (the grab feels
 * continuous); outside, the pane is centred under the pointer.
 */
export function rearmPointerAnchorOffset(
  anchorFootprint: TilingPaneFootprint,
  client: DragMachinePoint,
): DragMachinePoint {
  const dx: number = client.x - anchorFootprint.left;
  const dy: number = client.y - anchorFootprint.top;
  const inside: boolean =
    dx >= 0 && dy >= 0 && dx <= anchorFootprint.width && dy <= anchorFootprint.height;
  if (inside) {
    return { x: dx, y: dy };
  }
  return { x: anchorFootprint.width / 2, y: anchorFootprint.height / 2 };
}

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

/** Where the pointer holds the lifted pane: pointer minus the grab offset, at its lift size. */
export function heldFootprintAt(
  anchorFootprint: TilingPaneFootprint,
  pointerAnchorOffset: DragMachinePoint,
  client: DragMachinePoint,
): TilingPaneFootprint {
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
export function resolveCommitEdgeZone(target: DragResolvedTarget): TilingEdgeZone | null {
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
 * The leaf whose SLOT the dragged pane lands in once the drop commits
 * (`after(place).tree`) — the slot the drop indicator marks, the snap preview
 * settles the pane into, and the others make room around. It differs by action:
 *
 * - `swap` (`swapLeafTiles` swaps tileIds IN PLACE) → the dragged pane moves
 *   onto the RESOLVED TARGET leaf; the source leaf now carries the displaced
 *   target pane. So the landing slot is the TARGET leaf's.
 * - `group-merge` → the target's slot (the group the pane joins, active).
 * - `edge-insert` (`insertLeafAdjacent` moves the source leaf, still carrying the
 *   source pane, next to the target) → the SOURCE leaf.
 * - no / self / non-committable target (`removeLeafTile` gap-closes the source
 *   out of the tree) → `null`: there is no landing slot.
 *
 * A whole group (`subject: "group"`) moves as its node, keyed by its active
 * member, which stays active in every action — the landing slot is the
 * SOURCE leaf's for any committable target.
 */
export function resolveDragLandingLeafId(
  sourceLeafId: string | null,
  resolvedTarget: DragResolvedTarget | null,
  subject?: DragSubject,
): string | null {
  if (sourceLeafId == null) {
    return null;
  }
  if (resolvedTarget == null || resolvedTarget.leafId === sourceLeafId) {
    return null;
  }
  if (subject === "group") {
    return isCommittableTarget(resolvedTarget, sourceLeafId) ? sourceLeafId : null;
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
 * The leaf id the dragged pane's CONTENT occupies AFTER a commit — the leaf the
 * renderer focuses so focus follows the dragged pane through the drop (the
 * dragged pane ends the gesture already focused). This differs from the
 * landing leaf for `group-merge`, so it is a distinct resolver:
 *
 * - `swap` (`swapLeafTiles` swaps tileIds IN PLACE) → the dragged content lands
 *   on the RESOLVED TARGET leaf; the source leaf now carries the displaced
 *   target content. Focus the TARGET leaf.
 * - `edge-insert` (`insertLeafAdjacent` moves the source leaf, still carrying its
 *   content) → focus the SOURCE leaf (committable edge only; a non-committable
 *   edge gap-closes, so there is nothing to focus → null).
 * - `group-merge` (`mergeDraggedLeafIntoTarget` moves the source leaf into the
 *   group — appending, or creating one around a loose target — keeping its id
 *   + content, source active) → focus the SOURCE leaf (NOT the target seat).
 * - no / self / non-committable target (`removeLeafTile` gap-closes the source)
 *   → `null`: there is no committed slot, so focus is left untouched.
 *
 * A whole group keeps its active member (the source) in every action: focus
 * the SOURCE leaf.
 */
export function resolveDragCommitFocusLeafId(
  sourceLeafId: string | null,
  resolvedTarget: DragResolvedTarget | null,
  subject?: DragSubject,
): string | null {
  if (sourceLeafId == null) {
    return null;
  }
  if (resolvedTarget == null || resolvedTarget.leafId === sourceLeafId) {
    return null;
  }
  if (subject === "group") {
    return isCommittableTarget(resolvedTarget, sourceLeafId) ? sourceLeafId : null;
  }
  if (resolvedTarget.action === "swap") {
    return resolvedTarget.leafId;
  }
  if (resolvedTarget.action === "group-merge") {
    return sourceLeafId;
  }
  if (resolvedTarget.action === "edge-insert") {
    return resolveCommitEdgeZone(resolvedTarget) == null ? null : sourceLeafId;
  }
  return null;
}

/**
 * The single authoritative committable seat captured from a sample during `dragging`: the drop the drag hit holds now
 * (`TilingDropIntentState.place`), verbatim iff it is a committable drop for `sourceLeafId`, else `null`. A release
 * commits exactly this, what the last frame showed: there is no fallback to an earlier seat (a release with nothing
 * held puts the layout back).
 *
 * Pairs with `isCommittableTarget` (the commit predicate `dragMachineReducer`
 * applies at `POINTER_UP`): `deriveCommittableSeat` is the capture rule, the
 * latter is the settle predicate, and both read the same `DragResolvedTarget`.
 */
export function deriveCommittableSeat(
  resolvedTarget: DragResolvedTarget | null,
  sourceLeafId: string,
): DragResolvedTarget | null {
  return isCommittableTarget(resolvedTarget, sourceLeafId) ? resolvedTarget : null;
}

/**
 * Whether a COMPETING cancel source must be suppressed because a commit is in
 * flight. The M3 watchdog's self-heal `onExpire`, `lostpointercapture`, `blur`,
 * and `visibilitychange` all dispatch a cancel with no commit awareness; under
 * frame starvation any of them can reach `dragging` before the release commit
 * and revert a deliberately-seated drop (first-terminal-event-wins). The cancel
 * is suppressed iff a release commit has been LATCHED (`releaseCommitLatched`)
 * OR a committable seat currently exists for the pointer (`committableSeat`) —
 * the watchdog's self-heal cancel survives ONLY the genuinely-stuck case (no
 * latch AND no committable seat), exactly where reverting to `idle` is correct.
 */
export function shouldSuppressCompetingCancel(
  releaseCommitLatched: DragResolvedTarget | null,
  committableSeat: DragResolvedTarget | null,
): boolean {
  return releaseCommitLatched != null || committableSeat != null;
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
    ...(state.subject != null ? { subject: state.subject } : {}),
    resolvedTarget: outcome === "commit" ? state.resolvedTarget : null,
  };
}

/** The `armed` state a `POINTER_DOWN` opens. */
function armedFrom(event: Extract<DragMachineEvent, { type: "POINTER_DOWN" }>): DragMachineState {
  return {
    phase: "armed",
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    touchDrag: event.pointerType === "touch",
    sourceLeafId: event.sourceLeafId,
    ...(event.subject != null ? { subject: event.subject } : {}),
    anchorFootprint: event.anchorFootprint,
    pointerAnchorOffset: event.pointerAnchorOffset,
    originClient: event.originClient,
  };
}

/** The dragging state after the pointer moved to `client`: held there. Home is the drag hit's (`TARGET_RESOLVED`). */
function movedTo(
  state: Extract<DragMachineState, { phase: "dragging" }>,
  client: DragMachinePoint,
): DragMachineState {
  return {
    ...state,
    heldFootprint: heldFootprintAt(state.anchorFootprint, state.pointerAnchorOffset, client),
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
        return armedFrom(event);
      }
      if (event.type === "REARM") {
        // Spring-load continuation: the previous drag settled `claimed` and
        // reached `idle` (settle teardown done); the pointer is still held.
        // Enter `dragging` directly on the leaf's NEW seat — every footprint is
        // from the event (the new tree), `resolvedTarget` starts null, so no
        // state of the old tree's drag survives.
        const pointerAnchorOffset: DragMachinePoint =
          event.pointerAnchorOffset ?? rearmPointerAnchorOffset(event.anchorFootprint, event.client);
        return {
          phase: "dragging",
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          touchDrag: event.pointerType === "touch",
          sourceLeafId: event.sourceLeafId,
          ...(event.subject != null ? { subject: event.subject } : {}),
          anchorFootprint: event.anchorFootprint,
          pointerAnchorOffset,
          heldFootprint: heldFootprintAt(event.anchorFootprint, pointerAnchorOffset, event.client),
          resolvedTarget: null,
          // The drag hit says where home is from its first sample (`TARGET_RESOLVED`).
          atHome: true,
          leftHome: false,
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
            ...(state.subject != null ? { subject: state.subject } : {}),
            anchorFootprint: state.anchorFootprint,
            pointerAnchorOffset: state.pointerAnchorOffset,
            heldFootprint: heldFootprintAt(state.anchorFootprint, state.pointerAnchorOffset, event.client),
            resolvedTarget: null,
            // The drag hit says where home is from its first sample (`TARGET_RESOLVED`).
            atHome: true,
            leftHome: false,
          };
        }
        // Touch long-press elapsed while the finger is held within tolerance →
        // begin the drag in place. The pane lifts at the anchor (the finger is at
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
            ...(state.subject != null ? { subject: state.subject } : {}),
            anchorFootprint: state.anchorFootprint,
            pointerAnchorOffset: state.pointerAnchorOffset,
            heldFootprint: heldFootprintAt(state.anchorFootprint, state.pointerAnchorOffset, state.originClient),
            resolvedTarget: null,
            atHome: true,
            leftHome: false,
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
          return armedFrom(event);
        default:
          return state;
      }
    }

    case "dragging": {
      switch (event.type) {
        case "POINTER_MOVE":
          return movedTo(state, event.client);
        case "TARGET_RESOLVED":
          if (event.atHome == null) {
            return { ...state, resolvedTarget: event.resolvedTarget };
          }
          return {
            ...state,
            resolvedTarget: event.resolvedTarget,
            atHome: event.atHome,
            leftHome: state.leftHome || !event.atHome,
          };
        case "POINTER_UP":
          if (event.claimed === true) {
            return settleFrom(state, "claimed");
          }
          // Home: a release over the pane's own place (whether or not the
          // pointer left it meanwhile) puts the layout back as it was at the
          // lift, whatever is under it now.
          return settleFrom(
            state,
            !state.atHome && isCommittableTarget(state.resolvedTarget, state.sourceLeafId) ? "commit" : "cancel",
          );
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
          return armedFrom(event);
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
 * the drop's presentation does not flash off before the committed layout lands.
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
 * holds through `settling` commit, until the committed layout lands.
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
