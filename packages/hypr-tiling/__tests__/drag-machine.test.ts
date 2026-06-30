import { describe, expect, it, jest } from "@jest/globals";
import {
  DRAG_MACHINE_INITIAL_STATE,
  activeDragSourceLeafId,
  activeResolvedTarget,
  DRAG_PICKUP_THRESHOLD_PX,
  DRAG_TOUCH_SCROLL_ESCAPE_PX,
  DEFAULT_TOUCH_LONG_PRESS_MS,
  type DragMachineEvent,
  type DragMachineState,
  type DragPointerType,
  type DragResolvedTarget,
  type FrameScheduler,
  type TouchArmedMoveResolution,
  createFrameCoalescer,
  deriveCandidateTree,
  dragMachineReducer,
  ghostFootprintAt,
  hasCrossedPickupThreshold,
  DEFAULT_DRAG_RERESOLVE_DELTA_PX,
  DEFAULT_DRAG_SLOT_COMMITMENT_MODE,
  isCommittableTarget,
  previousZoneSeed,
  resolveDragGhostSeatLeafId,
  presentationDragSourceLeafId,
  presentationResolvedTarget,
  resolveTouchArmedMove,
  shouldReserveDragSourceSlot,
  shouldReresolveSeatedTarget,
  deriveCommittableSeat,
  foldCommittableSeatFallback,
  resolveReleaseCommitSeat,
  shouldSuppressCompetingCancel,
  EMPTY_COMMITTABLE_SEAT_FALLBACK,
  type CommittableSeatFallback,
} from "../core/drag-machine";
import { createDragWatchdog } from "../core/drag-recovery";
import { collectGroups, findGroupContainingLeaf, findLeafById, groupLeaves, insertLeafAdjacent, readLeafNodeIds, removeLeafTile, swapLeafTiles } from "../core/state";
import type {
  TilingDropAction,
  TilingLayoutNode,
  TilingGroupNode,
  TilingLeafDropZone,
  TilingLeafNode,
  TilingPaneFootprint,
  TilingSplitNode,
} from "../core/types";

function leaf(id: string, tileId: string): TilingLeafNode {
  return { kind: "leaf", id, tileId };
}

function memberIdsFromGroup(group: TilingGroupNode): ReadonlyArray<string> {
  return group.members.map((member: TilingLeafNode): string => member.id);
}

/**
 * Base fixture tree (matches `live-render-invariant.test.ts` / `state.test.ts`):
 *
 *   root (split, horizontal, 0.5)
 *   ├── A           (leaf, tile-a)
 *   └── s2 (split, vertical, 0.5)
 *       ├── B       (leaf, tile-b)
 *       └── C       (leaf, tile-c)
 */
function baseLayout(): TilingSplitNode {
  return {
    kind: "split",
    id: "root",
    axis: "horizontal",
    ratio: 0.5,
    first: leaf("A", "tile-a"),
    second: {
      kind: "split",
      id: "s2",
      axis: "vertical",
      ratio: 0.5,
      first: leaf("B", "tile-b"),
      second: leaf("C", "tile-c"),
    },
  };
}

const ANCHOR: TilingPaneFootprint = { left: 100, top: 100, width: 200, height: 150 };

/** A fully-typed resolved target; only `leafId`/`zone`/`action`/edge fields are load-bearing. */
function makeTarget(
  targetLeafId: string,
  zone: TilingLeafDropZone,
  action: TilingDropAction,
): DragResolvedTarget {
  return {
    leafId: targetLeafId,
    zone,
    action,
    dominantEdge: "right",
    finalEdge: zone === "center" ? null : "right",
    fallbackReason: null,
    blockedReason: null,
    axisPath: ["horizontal"],
    edgeThresholdRatio: 0.25,
    centerRectWidthPx: 100,
    centerRectHeightPx: 100,
    centerDistancePx: 0,
    nearestEdgeDistancePx: 0,
    paneLocalX: 10,
    paneLocalY: 10,
    targetSplitId: null,
    targetSplitPlacement: null,
    selectedSplitZone: zone === "center" ? null : "right",
    selectedSplitDistancePx: null,
    rejectedSplitReasons: [],
    tuning: { centerRatio: 0.5, edgeThresholdRatio: 0.25, hysteresisPx: 6, devicePixelRatio: 1 },
  };
}

function pointerDown(pointerId: number = 1, pointerType: DragPointerType = "mouse"): DragMachineEvent {
  return {
    type: "POINTER_DOWN",
    pointerId,
    pointerType,
    sourceLeafId: "A",
    anchorFootprint: ANCHOR,
    pointerAnchorOffset: { x: 10, y: 10 },
    originClient: { x: 110, y: 110 },
  };
}

/** A touch press at the same origin as `pointerDown`. */
function touchPointerDown(pointerId: number = 1): DragMachineEvent {
  return pointerDown(pointerId, "touch");
}

/** Drive idle → armed for a TOUCH press (still armed; long-press not yet elapsed). */
function toTouchArmed(pointerId: number = 1): DragMachineState {
  return dragMachineReducer(DRAG_MACHINE_INITIAL_STATE, touchPointerDown(pointerId));
}

/** Drive idle → armed → dragging (threshold crossed). */
function toDragging(pointerId: number = 1): DragMachineState {
  let state: DragMachineState = dragMachineReducer(DRAG_MACHINE_INITIAL_STATE, pointerDown(pointerId));
  state = dragMachineReducer(state, { type: "POINTER_MOVE", pointerId, client: { x: 200, y: 200 } });
  return state;
}

describe("drag-machine — pickup threshold + ghost geometry", (): void => {
  it("does not cross the threshold under the pickup distance", (): void => {
    expect(hasCrossedPickupThreshold({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(false);
  });

  it("crosses the threshold at/over the pickup distance", (): void => {
    expect(hasCrossedPickupThreshold({ x: 0, y: 0 }, { x: DRAG_PICKUP_THRESHOLD_PX, y: 0 })).toBe(true);
  });

  it("anchors the ghost at the grab offset (footprint follows the pointer)", (): void => {
    const footprint: TilingPaneFootprint = ghostFootprintAt(ANCHOR, { x: 10, y: 10 }, { x: 250, y: 260 });
    expect(footprint).toEqual({ left: 240, top: 250, width: 200, height: 150 });
  });
});

describe("drag-machine — lifecycle transitions", (): void => {
  it("idle + POINTER_DOWN → armed (nothing mounted yet)", (): void => {
    const state: DragMachineState = dragMachineReducer(DRAG_MACHINE_INITIAL_STATE, pointerDown());
    expect(state.phase).toBe("armed");
  });

  it("armed + sub-threshold POINTER_MOVE stays armed", (): void => {
    const armed: DragMachineState = dragMachineReducer(DRAG_MACHINE_INITIAL_STATE, pointerDown());
    const next: DragMachineState = dragMachineReducer(armed, { type: "POINTER_MOVE", pointerId: 1, client: { x: 112, y: 112 } });
    expect(next.phase).toBe("armed");
  });

  it("armed + threshold POINTER_MOVE → dragging (capture taken by renderer)", (): void => {
    const state: DragMachineState = toDragging();
    expect(state.phase).toBe("dragging");
    if (state.phase === "dragging") {
      expect(state.sourceLeafId).toBe("A");
      expect(state.resolvedTarget).toBeNull();
    }
  });

  it("armed + POINTER_UP (sub-threshold) → idle (it was a click, no drag)", (): void => {
    const armed: DragMachineState = dragMachineReducer(DRAG_MACHINE_INITIAL_STATE, pointerDown());
    const next: DragMachineState = dragMachineReducer(armed, { type: "POINTER_UP", pointerId: 1 });
    expect(next.phase).toBe("idle");
  });

  it("dragging + POINTER_MOVE updates the ghost footprint, keeps phase", (): void => {
    let state: DragMachineState = toDragging();
    state = dragMachineReducer(state, { type: "POINTER_MOVE", pointerId: 1, client: { x: 300, y: 320 } });
    expect(state.phase).toBe("dragging");
    if (state.phase === "dragging") {
      expect(state.ghostFootprint).toEqual({ left: 290, top: 310, width: 200, height: 150 });
    }
  });

  it("dragging + TARGET_RESOLVED stores the resolved target", (): void => {
    let state: DragMachineState = toDragging();
    const target: DragResolvedTarget = makeTarget("C", "center", "swap");
    state = dragMachineReducer(state, { type: "TARGET_RESOLVED", pointerId: 1, resolvedTarget: target });
    expect(state.phase).toBe("dragging");
    if (state.phase === "dragging") {
      expect(state.resolvedTarget?.leafId).toBe("C");
    }
  });

  it("dragging + POINTER_UP with a valid target → settling(commit) carrying the target", (): void => {
    let state: DragMachineState = toDragging();
    state = dragMachineReducer(state, { type: "TARGET_RESOLVED", pointerId: 1, resolvedTarget: makeTarget("C", "center", "swap") });
    state = dragMachineReducer(state, { type: "POINTER_UP", pointerId: 1 });
    expect(state.phase).toBe("settling");
    if (state.phase === "settling") {
      expect(state.outcome).toBe("commit");
      expect(state.resolvedTarget?.leafId).toBe("C");
    }
  });

  it("dragging + POINTER_UP with NO target → settling(cancel), no target carried", (): void => {
    const state: DragMachineState = dragMachineReducer(toDragging(), { type: "POINTER_UP", pointerId: 1 });
    expect(state.phase).toBe("settling");
    if (state.phase === "settling") {
      expect(state.outcome).toBe("cancel");
      expect(state.resolvedTarget).toBeNull();
    }
  });

  it("dragging + POINTER_UP over a 'none'-action target → settling(cancel)", (): void => {
    let state: DragMachineState = toDragging();
    state = dragMachineReducer(state, { type: "TARGET_RESOLVED", pointerId: 1, resolvedTarget: makeTarget("C", "center", "none") });
    state = dragMachineReducer(state, { type: "POINTER_UP", pointerId: 1 });
    expect(state.phase === "settling" && state.outcome).toBe("cancel");
  });

  it("settling + SETTLE_DONE → idle (single teardown edge)", (): void => {
    let state: DragMachineState = dragMachineReducer(toDragging(), { type: "POINTER_UP", pointerId: 1 });
    state = dragMachineReducer(state, { type: "SETTLE_DONE" });
    expect(state.phase).toBe("idle");
  });

  it("settling + POINTER_DOWN preempts into a fresh armed drag", (): void => {
    const settling: DragMachineState = dragMachineReducer(toDragging(), { type: "POINTER_UP", pointerId: 1 });
    const next: DragMachineState = dragMachineReducer(settling, pointerDown(2));
    expect(next.phase).toBe("armed");
  });
});

describe("drag-machine — idle-watchdog force-reconcile (M3 → existing POINTER_CANCEL edge)", (): void => {
  it("a watchdog expiry drives dragging → settling(cancel) → idle via POINTER_CANCEL (no new phase)", (): void => {
    // Model the renderer wiring: the watchdog's onExpire dispatches the EXISTING
    // POINTER_CANCEL event into the reducer. A drag that loses every terminal
    // pointer event is force-reconciled to idle — the structural anti-stuck net
    // for the one interruption class the enumerated edges did not previously
    // cover (INV-R2), reusing the cancel edge rather than adding an FSM state.
    let state: DragMachineState = toDragging();
    state = dragMachineReducer(state, { type: "TARGET_RESOLVED", pointerId: 1, resolvedTarget: makeTarget("C", "center", "swap") });

    const scheduler: { setTimer: (cb: () => void, ms: number) => number; clearTimer: (h: number) => void } & {
      fire: () => void;
    } = (() => {
      let pending: (() => void) | null = null;
      return {
        setTimer: (cb: () => void, _ms: number): number => {
          pending = cb;
          return 1;
        },
        clearTimer: (_h: number): void => {
          pending = null;
        },
        fire: (): void => {
          const cb: (() => void) | null = pending;
          pending = null;
          cb?.();
        },
      };
    })();

    let nowMs: number = 0;
    const watchdog = createDragWatchdog({
      maxIdleMs: 5100,
      now: (): number => nowMs,
      scheduler,
      onExpire: (): void => {
        state = dragMachineReducer(state, { type: "POINTER_CANCEL", pointerId: 1 });
      },
    });

    watchdog.progress();
    // No progress for longer than the idle deadline (monotonic), then the timer
    // fires: the watchdog reconciles the wedged drag.
    nowMs = 5100;
    scheduler.fire();

    expect(state.phase).toBe("settling");
    if (state.phase === "settling") {
      // Force-reconcile is always a CANCEL — never a half-committed state.
      expect(state.outcome).toBe("cancel");
      expect(state.resolvedTarget).toBeNull();
    }
    state = dragMachineReducer(state, { type: "SETTLE_DONE" });
    expect(state.phase).toBe("idle");
  });
});

describe("drag-machine — guaranteed teardown on EVERY terminal edge (anti-stuck regression wall)", (): void => {
  const terminalEvents: ReadonlyArray<{ name: string; event: DragMachineEvent }> = [
    { name: "POINTER_UP", event: { type: "POINTER_UP", pointerId: 1 } },
    { name: "POINTER_CANCEL", event: { type: "POINTER_CANCEL", pointerId: 1 } },
    { name: "ESCAPE", event: { type: "ESCAPE" } },
    { name: "BLUR", event: { type: "BLUR" } },
    { name: "VISIBILITY_HIDDEN", event: { type: "VISIBILITY_HIDDEN" } },
  ];

  for (const { name, event } of terminalEvents) {
    it(`dragging + ${name} reaches idle (via settling) — no drag state remains`, (): void => {
      let state: DragMachineState = dragMachineReducer(toDragging(), event);
      expect(state.phase).toBe("settling");
      state = dragMachineReducer(state, { type: "SETTLE_DONE" });
      expect(state).toEqual({ phase: "idle" });
    });

    it(`armed + ${name} reaches idle directly (no orphaned armed state)`, (): void => {
      const armed: DragMachineState = dragMachineReducer(DRAG_MACHINE_INITIAL_STATE, pointerDown());
      const next: DragMachineState = dragMachineReducer(armed, event);
      expect(next).toEqual({ phase: "idle" });
    });
  }

  it("POINTER_CANCEL (lost-capture) mid-drag cancels (never commits a half-state)", (): void => {
    let state: DragMachineState = toDragging();
    state = dragMachineReducer(state, { type: "TARGET_RESOLVED", pointerId: 1, resolvedTarget: makeTarget("C", "left", "edge-insert") });
    state = dragMachineReducer(state, { type: "POINTER_CANCEL", pointerId: 1 });
    expect(state.phase === "settling" && state.outcome).toBe("cancel");
    if (state.phase === "settling") {
      expect(state.resolvedTarget).toBeNull();
    }
  });
});

describe("drag-machine — multi-touch / foreign-pointer guard", (): void => {
  it("a foreign pointerId cannot move, resolve, or release an in-flight drag", (): void => {
    const dragging: DragMachineState = toDragging(1);
    expect(dragMachineReducer(dragging, { type: "POINTER_MOVE", pointerId: 9, client: { x: 999, y: 999 } })).toBe(dragging);
    expect(dragMachineReducer(dragging, { type: "POINTER_UP", pointerId: 9 })).toBe(dragging);
    expect(dragMachineReducer(dragging, { type: "POINTER_CANCEL", pointerId: 9 })).toBe(dragging);
  });

  it("the owning pointer still drives the drag after a foreign pointer is ignored", (): void => {
    let state: DragMachineState = toDragging(1);
    state = dragMachineReducer(state, { type: "POINTER_MOVE", pointerId: 9, client: { x: 999, y: 999 } });
    state = dragMachineReducer(state, { type: "POINTER_UP", pointerId: 1 });
    expect(state.phase).toBe("settling");
  });
});

describe("drag-machine — commit eligibility (mirrors handleLeafDrop)", (): void => {
  it("swap onto a different leaf is committable", (): void => {
    expect(isCommittableTarget(makeTarget("C", "center", "swap"), "A")).toBe(true);
  });

  it("edge-insert with a resolved edge is committable", (): void => {
    expect(isCommittableTarget(makeTarget("C", "left", "edge-insert"), "A")).toBe(true);
  });

  it("self-target / null / none are NOT committable", (): void => {
    expect(isCommittableTarget(makeTarget("A", "center", "swap"), "A")).toBe(false);
    expect(isCommittableTarget(null, "A")).toBe(false);
    expect(isCommittableTarget(makeTarget("C", "center", "none"), "A")).toBe(false);
  });

  it("group-merge onto a group representative leaf is committable", (): void => {
    expect(isCommittableTarget(makeTarget("B", "center", "group-merge"), "C")).toBe(true);
  });
});

describe("drag-machine — derived candidate tree IS the live reflow (== commit, never a projection)", (): void => {
  it("null target → removeLeafTile(layout, source) (gap-closed base; ghost floats free)", (): void => {
    const layout: TilingSplitNode = baseLayout();
    expect(deriveCandidateTree(layout, "A", null)).toEqual(removeLeafTile(layout, "A"));
    expect(readLeafNodeIds(deriveCandidateTree(layout, "A", null))).not.toContain("A");
  });

  it("self-target → removeLeafTile(layout, source) (no double image at the source)", (): void => {
    const layout: TilingSplitNode = baseLayout();
    expect(deriveCandidateTree(layout, "A", makeTarget("A", "center", "swap"))).toEqual(removeLeafTile(layout, "A"));
  });

  it("swap candidate === swapLeafTiles commit (release never jumps)", (): void => {
    const layout: TilingSplitNode = baseLayout();
    const candidate = deriveCandidateTree(layout, "A", makeTarget("C", "center", "swap"));
    expect(candidate).toEqual(swapLeafTiles(layout, "A", "C"));
    // The candidate is a REAL reflowed tree (every leaf present), not a projection.
    expect([...readLeafNodeIds(candidate)].sort()).toEqual(["A", "B", "C"]);
  });

  it("edge-insert candidate === insertLeafAdjacent commit (the destination physically reflows)", (): void => {
    const layout: TilingSplitNode = baseLayout();
    const target: DragResolvedTarget = makeTarget("C", "left", "edge-insert"); // finalEdge "right"
    const candidate = deriveCandidateTree(layout, "A", target);
    const commit = insertLeafAdjacent(layout, "A", "C", "right", { preserveParentSplitAxis: false, splitRatio: 0.5 });
    expect(candidate).toEqual(commit);
    expect([...readLeafNodeIds(candidate)].sort()).toEqual(["A", "B", "C"]);
  });

  it("null source → original layout untouched", (): void => {
    const layout: TilingSplitNode = baseLayout();
    expect(deriveCandidateTree(layout, null, null)).toBe(layout);
  });

  it("group-merge candidate === addLeafToGroup commit", (): void => {
    const layout: TilingLayoutNode = groupLeaves(baseLayout(), ["A", "B"]);
    const target: DragResolvedTarget = makeTarget("A", "center", "group-merge");
    const candidate: TilingLayoutNode = deriveCandidateTree(layout, "C", target);
    const groups = collectGroups(candidate);
    expect(groups).toHaveLength(1);
    expect([...memberIdsFromGroup(groups[0])].sort()).toEqual(["A", "B", "C"]);
    expect(findGroupContainingLeaf(candidate, "C")?.id).toBe(groups[0].id);
  });
});

describe("drag-machine — single-instance reservation gate (ghost fills the slot)", (): void => {
  // The source content is suppressed (the single ghost is the only painted
  // instance, and it HOPS INTO and FILLS the slot) only when BOTH live mode is
  // on AND this leaf is the drag source. The slot itself still reflows open
  // (deriveCandidateTree, above) — only the painted content is gated to a
  // content-less reservation, so survivors still physically reorganize.
  it("live mode + drag source → reserve the slot (ghost hops in to fill it, single instance)", (): void => {
    expect(shouldReserveDragSourceSlot(true, true)).toBe(true);
  });

  it("live mode + NOT the drag source → render the tile normally (a survivor)", (): void => {
    expect(shouldReserveDragSourceSlot(true, false)).toBe(false);
  });

  it("preview mode + drag source → keep the in-place dimmed source affordance (gate is live-only)", (): void => {
    expect(shouldReserveDragSourceSlot(false, true)).toBe(false);
  });

  it("preview mode + NOT the drag source → render the tile normally", (): void => {
    expect(shouldReserveDragSourceSlot(false, false)).toBe(false);
  });

  it("only fires for a leaf actually in the candidate tree — a resolved target puts the source in the destination slot", (): void => {
    // With a committable target the source IS present in the candidate tree (it
    // sits in the destination slot) → exactly the leaf the gate reserves. Gate
    // + candidate derivation together: open slot, no in-slot source content,
    // the single ghost hops in to fill it.
    const layout: TilingSplitNode = baseLayout();
    const candidate = deriveCandidateTree(layout, "A", makeTarget("C", "center", "swap"));
    expect(readLeafNodeIds(candidate)).toContain("A");
    expect(shouldReserveDragSourceSlot(true, true)).toBe(true);

    // With no target the source is gap-closed OUT of the tree → never rendered,
    // so there is no in-slot copy to reserve in the first place (ghost free-follows).
    const gapClosed = deriveCandidateTree(layout, "A", null);
    expect(readLeafNodeIds(gapClosed)).not.toContain("A");
  });
});

describe("drag-machine — ghost-seat leaf (swap reserves the TARGET slot, not the source slot)", (): void => {
  // BUG-1 regression: `swapLeafTiles` swaps tileIds IN PLACE, so the dragged
  // content lands on the resolved TARGET leaf. The single-instance reservation +
  // the ghost seat must follow it there; reserving the source slot (the old
  // behavior) double-painted the dragged pane (source-slot ghost + target-slot
  // content) and hid the displaced pane.
  it("swap → seat leaf is the resolved TARGET leaf (where the dragged content lands)", (): void => {
    expect(resolveDragGhostSeatLeafId("A", makeTarget("C", "center", "swap"))).toBe("C");
  });

  it("edge-insert (committable) → seat leaf is the SOURCE leaf (it moves, still carrying source content)", (): void => {
    expect(resolveDragGhostSeatLeafId("A", makeTarget("C", "left", "edge-insert"))).toBe("A");
  });

  it("no target / self-target / non-committable → no seat (null); the ghost free-follows", (): void => {
    expect(resolveDragGhostSeatLeafId("A", null)).toBeNull();
    expect(resolveDragGhostSeatLeafId("A", makeTarget("A", "center", "swap"))).toBeNull();
    expect(resolveDragGhostSeatLeafId("A", makeTarget("C", "center", "none"))).toBeNull();
    expect(resolveDragGhostSeatLeafId(null, makeTarget("C", "center", "swap"))).toBeNull();
  });

  it("seat leaf RE-TARGETS when the resolved target changes (preview is reactive to target change)", (): void => {
    // Hover C (swap) → seat C; re-hover B (swap) → seat B. The seat tracks the
    // live resolved target so the candidate + ghost re-derive promptly per target.
    expect(resolveDragGhostSeatLeafId("A", makeTarget("C", "center", "swap"))).toBe("C");
    expect(resolveDragGhostSeatLeafId("A", makeTarget("B", "center", "swap"))).toBe("B");
  });

  it("SWAP preview == commit: candidate exchanges the two tiles, dragged content lives ONCE at the seat (target) leaf", (): void => {
    const layout: TilingSplitNode = baseLayout();
    const target: DragResolvedTarget = makeTarget("C", "center", "swap");
    const candidate = deriveCandidateTree(layout, "A", target);
    const seatLeafId: string | null = resolveDragGhostSeatLeafId("A", target);
    expect(seatLeafId).toBe("C");

    // The dragged pane's content (tile-a) sits exactly once, at the seat/target
    // leaf — this is the slot the single ghost reserves + fills.
    const allLeafIds: ReadonlyArray<string> = readLeafNodeIds(candidate);
    const tileAHolders: ReadonlyArray<string> = allLeafIds.filter(
      (id: string): boolean => findLeafById(candidate, id)?.tileId === "tile-a",
    );
    expect(tileAHolders).toEqual(["C"]);

    // The displaced target content (tile-c) reflows into the vacated source slot
    // (leaf "A"); both panes are present, exchanged — identical to the commit.
    expect(findLeafById(candidate, "A")?.tileId).toBe("tile-c");
    expect(findLeafById(candidate, "C")?.tileId).toBe("tile-a");
    expect(candidate).toEqual(swapLeafTiles(layout, "A", "C"));
  });
});

describe("drag-machine — slot-commitment policy (zone-exit-hold vs delta-responsive)", (): void => {
  it("defaults: mode is delta-responsive, delta is 24px", (): void => {
    expect(DEFAULT_DRAG_SLOT_COMMITMENT_MODE).toBe("delta-responsive");
    expect(DEFAULT_DRAG_RERESOLVE_DELTA_PX).toBe(24);
  });

  it("exiting the seated footprint always re-resolves (both modes)", (): void => {
    for (const mode of ["zone-exit-hold", "delta-responsive"] as const) {
      expect(
        shouldReresolveSeatedTarget({
          mode,
          seatAnchor: { x: 100, y: 100 },
          currentClient: { x: 101, y: 101 },
          reresolveDeltaPx: 24,
          cursorWithinSeatedFootprint: false,
        }),
      ).toBe(true);
    }
  });

  it("zone-exit-hold: holds through any movement WITHIN the seated footprint", (): void => {
    expect(
      shouldReresolveSeatedTarget({
        mode: "zone-exit-hold",
        seatAnchor: { x: 100, y: 100 },
        currentClient: { x: 100 + 500, y: 100 }, // huge move, still inside the pane
        reresolveDeltaPx: 24,
        cursorWithinSeatedFootprint: true,
      }),
    ).toBe(false);
  });

  it("delta-responsive: holds below the delta, re-resolves at/above it (without exiting)", (): void => {
    const within = (dx: number): boolean =>
      shouldReresolveSeatedTarget({
        mode: "delta-responsive",
        seatAnchor: { x: 100, y: 100 },
        currentClient: { x: 100 + dx, y: 100 },
        reresolveDeltaPx: 24,
        cursorWithinSeatedFootprint: true,
      });
    expect(within(10)).toBe(false); // below threshold → held
    expect(within(24)).toBe(true); // exactly threshold → re-aim
    expect(within(40)).toBe(true); // beyond threshold → re-aim
  });
});

describe("drag-machine — hysteresis seed (subsumes stableDropStateRef)", (): void => {
  it("returns the prior zone only for the same hovered leaf", (): void => {
    const target: DragResolvedTarget = makeTarget("C", "left", "edge-insert");
    expect(previousZoneSeed(target, "C")).toBe("left");
    expect(previousZoneSeed(target, "B")).toBeNull();
    expect(previousZoneSeed(null, "C")).toBeNull();
  });
});

describe("drag-machine — touch pickup classifier (resolveTouchArmedMove, pure)", (): void => {
  const origin = { x: 100, y: 100 };

  it("below the pickup threshold (jitter) → hold (no drag, no scroll escape)", (): void => {
    const resolution: TouchArmedMoveResolution = resolveTouchArmedMove({
      origin,
      client: { x: 103, y: 102 },
      longPressSatisfied: false,
    });
    expect(resolution).toBe("hold");
  });

  it("predominant scroll-axis travel past the escape distance (pre-long-press) → scroll-escape", (): void => {
    // Vertical-dominant flick past DRAG_TOUCH_SCROLL_ESCAPE_PX (default 10) → scroll.
    const resolution: TouchArmedMoveResolution = resolveTouchArmedMove({
      origin,
      client: { x: 102, y: 100 + DRAG_TOUCH_SCROLL_ESCAPE_PX + 2 },
      longPressSatisfied: false,
    });
    expect(resolution).toBe("scroll-escape");
  });

  it("non-scroll-dominant travel past the pickup threshold (pre-long-press) → pickup (deliberate drag)", (): void => {
    // Horizontal-dominant move past the 6px pickup threshold, not scroll-axis → drag.
    const resolution: TouchArmedMoveResolution = resolveTouchArmedMove({
      origin,
      client: { x: 100 + 20, y: 102 },
      longPressSatisfied: false,
    });
    expect(resolution).toBe("pickup");
  });

  it("once the long-press elapsed, any threshold-crossing travel is a pickup (scroll escape no longer applies)", (): void => {
    // A vertical move that WOULD have been a scroll escape pre-long-press is now a pickup.
    const resolution: TouchArmedMoveResolution = resolveTouchArmedMove({
      origin,
      client: { x: 100, y: 100 + DRAG_TOUCH_SCROLL_ESCAPE_PX + 50 },
      longPressSatisfied: true,
    });
    expect(resolution).toBe("pickup");
  });

  it("long-press satisfied but sub-threshold travel → hold", (): void => {
    expect(
      resolveTouchArmedMove({ origin, client: { x: 101, y: 101 }, longPressSatisfied: true }),
    ).toBe("hold");
  });

  it("honors a configurable scroll axis (horizontal) + custom escape distance", (): void => {
    // With a horizontal scroll axis, a horizontal flick escapes; a vertical drag picks up.
    expect(
      resolveTouchArmedMove({
        origin,
        client: { x: 100 + 16, y: 101 },
        longPressSatisfied: false,
        scrollAxis: "horizontal",
        scrollEscapePx: 12,
      }),
    ).toBe("scroll-escape");
    expect(
      resolveTouchArmedMove({
        origin,
        client: { x: 101, y: 100 + 16 },
        longPressSatisfied: false,
        scrollAxis: "horizontal",
        scrollEscapePx: 12,
      }),
    ).toBe("pickup");
  });
});

describe("drag-machine — touch lifecycle (long-press, scroll-escape, multi-touch, pointer-loss)", (): void => {
  it("touch POINTER_DOWN → armed carries touchDrag: true; mouse carries touchDrag: false", (): void => {
    const touchArmed: DragMachineState = toTouchArmed();
    expect(touchArmed.phase).toBe("armed");
    if (touchArmed.phase === "armed") {
      expect(touchArmed.touchDrag).toBe(true);
      expect(touchArmed.pointerType).toBe("touch");
    }
    const mouseArmed: DragMachineState = dragMachineReducer(DRAG_MACHINE_INITIAL_STATE, pointerDown());
    if (mouseArmed.phase === "armed") {
      expect(mouseArmed.touchDrag).toBe(false);
    }
  });

  it("touch armed + LONG_PRESS → dragging (ghost lifts at the anchor, touchDrag carried)", (): void => {
    const armed: DragMachineState = toTouchArmed();
    const dragging: DragMachineState = dragMachineReducer(armed, { type: "LONG_PRESS", pointerId: 1 });
    expect(dragging.phase).toBe("dragging");
    if (dragging.phase === "dragging") {
      expect(dragging.touchDrag).toBe(true);
      expect(dragging.sourceLeafId).toBe("A");
      expect(dragging.resolvedTarget).toBeNull();
      // The ghost seats at the anchor (finger at ~origin {110,110}, grab offset {10,10}).
      expect(dragging.ghostFootprint).toEqual({ left: 100, top: 100, width: 200, height: 150 });
    }
  });

  it("touch armed + sub-threshold POINTER_MOVE (no long-press) stays armed (finger jitter)", (): void => {
    const armed: DragMachineState = toTouchArmed();
    const next: DragMachineState = dragMachineReducer(armed, { type: "POINTER_MOVE", pointerId: 1, client: { x: 112, y: 112 } });
    expect(next.phase).toBe("armed");
  });

  it("touch armed + scroll-axis flick before long-press → idle (released to the page, no drag)", (): void => {
    const armed: DragMachineState = toTouchArmed();
    // Origin is {110,110}; a vertical flick past the 10px escape, vertical-dominant.
    const next: DragMachineState = dragMachineReducer(armed, { type: "POINTER_MOVE", pointerId: 1, client: { x: 112, y: 140 } });
    expect(next).toEqual({ phase: "idle" });
  });

  it("touch armed + deliberate non-scroll travel past threshold before long-press → dragging (pickup)", (): void => {
    const armed: DragMachineState = toTouchArmed();
    // Horizontal-dominant move (drag intent), past the 6px threshold.
    const next: DragMachineState = dragMachineReducer(armed, { type: "POINTER_MOVE", pointerId: 1, client: { x: 150, y: 112 } });
    expect(next.phase).toBe("dragging");
    if (next.phase === "dragging") {
      expect(next.touchDrag).toBe(true);
    }
  });

  it("LONG_PRESS on a MOUSE armed state is a no-op (mouse never long-presses)", (): void => {
    const mouseArmed: DragMachineState = dragMachineReducer(DRAG_MACHINE_INITIAL_STATE, pointerDown());
    const next: DragMachineState = dragMachineReducer(mouseArmed, { type: "LONG_PRESS", pointerId: 1 });
    expect(next).toBe(mouseArmed);
  });

  it("LONG_PRESS while dragging is a no-op (already picked up; never re-enters armed)", (): void => {
    let state: DragMachineState = dragMachineReducer(toTouchArmed(), { type: "LONG_PRESS", pointerId: 1 });
    expect(state.phase).toBe("dragging");
    const after: DragMachineState = dragMachineReducer(state, { type: "LONG_PRESS", pointerId: 1 });
    expect(after).toBe(state);
  });

  it("multi-touch guard: a foreign second finger cannot long-press, move, or release a touch drag", (): void => {
    const dragging: DragMachineState = dragMachineReducer(toTouchArmed(1), { type: "LONG_PRESS", pointerId: 1 });
    expect(dragging.phase).toBe("dragging");
    expect(dragMachineReducer(dragging, { type: "LONG_PRESS", pointerId: 7 })).toBe(dragging);
    expect(dragMachineReducer(dragging, { type: "POINTER_MOVE", pointerId: 7, client: { x: 900, y: 900 } })).toBe(dragging);
    expect(dragMachineReducer(dragging, { type: "POINTER_UP", pointerId: 7 })).toBe(dragging);
    expect(dragMachineReducer(dragging, { type: "POINTER_CANCEL", pointerId: 7 })).toBe(dragging);
  });

  it("a foreign second finger cannot long-press a still-armed touch press into a drag", (): void => {
    const armed: DragMachineState = toTouchArmed(1);
    expect(dragMachineReducer(armed, { type: "LONG_PRESS", pointerId: 5 })).toBe(armed);
  });

  it("owning-pointer loss mid-touch-drag (POINTER_CANCEL) → settling(cancel) → idle (clean teardown)", (): void => {
    let state: DragMachineState = dragMachineReducer(toTouchArmed(1), { type: "LONG_PRESS", pointerId: 1 });
    state = dragMachineReducer(state, { type: "TARGET_RESOLVED", pointerId: 1, resolvedTarget: makeTarget("C", "center", "swap") });
    state = dragMachineReducer(state, { type: "POINTER_CANCEL", pointerId: 1 });
    expect(state.phase === "settling" && state.outcome).toBe("cancel");
    if (state.phase === "settling") {
      expect(state.resolvedTarget).toBeNull();
    }
    state = dragMachineReducer(state, { type: "SETTLE_DONE" });
    expect(state).toEqual({ phase: "idle" });
  });

  it("touch armed + tap release (POINTER_UP before long-press) → idle (it was a tap, no drag)", (): void => {
    const armed: DragMachineState = toTouchArmed();
    const next: DragMachineState = dragMachineReducer(armed, { type: "POINTER_UP", pointerId: 1 });
    expect(next).toEqual({ phase: "idle" });
  });

  it("the long-press default is a sane disambiguation delay (220ms)", (): void => {
    expect(DEFAULT_TOUCH_LONG_PRESS_MS).toBe(220);
  });
});

interface FakeFrameScheduler extends FrameScheduler {
  /** Run every currently-queued frame callback (in request order). */
  runFrames: () => void;
  /** Count of frames requested but not yet cancelled (pending). */
  pendingCount: () => number;
}

/** A deterministic, manually-pumped rAF stand-in for DOM-less coalescer tests. */
function makeFakeScheduler(): FakeFrameScheduler {
  const callbacks = new Map<number, () => void>();
  let nextHandle = 1;
  return {
    request: (callback: () => void): number => {
      const handle: number = nextHandle++;
      callbacks.set(handle, callback);
      return handle;
    },
    cancel: (handle: number): void => {
      callbacks.delete(handle);
    },
    runFrames: (): void => {
      const queued: ReadonlyArray<() => void> = [...callbacks.values()];
      callbacks.clear();
      for (const callback of queued) {
        callback();
      }
    },
    pendingCount: (): number => callbacks.size,
  };
}

describe("createFrameCoalescer — rAF coalescing + teardown cleanup", (): void => {
  it("coalesces a burst of schedules into ONE frame carrying the LATEST payload", (): void => {
    const scheduler: FakeFrameScheduler = makeFakeScheduler();
    const onFrame = jest.fn<(payload: { x: number; y: number }) => void>();
    const coalescer = createFrameCoalescer(onFrame, scheduler);

    coalescer.schedule({ x: 1, y: 1 });
    coalescer.schedule({ x: 2, y: 2 });
    coalescer.schedule({ x: 3, y: 3 });
    // Only one frame should be armed for the whole burst.
    expect(scheduler.pendingCount()).toBe(1);
    expect(onFrame).not.toHaveBeenCalled();

    scheduler.runFrames();
    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(onFrame).toHaveBeenCalledWith({ x: 3, y: 3 });
  });

  it("re-arms a fresh frame for the next burst after a flush", (): void => {
    const scheduler: FakeFrameScheduler = makeFakeScheduler();
    const onFrame = jest.fn<(payload: { x: number; y: number }) => void>();
    const coalescer = createFrameCoalescer(onFrame, scheduler);

    coalescer.schedule({ x: 1, y: 1 });
    scheduler.runFrames();
    coalescer.schedule({ x: 9, y: 9 });
    expect(scheduler.pendingCount()).toBe(1);
    scheduler.runFrames();

    expect(onFrame).toHaveBeenCalledTimes(2);
    expect(onFrame).toHaveBeenNthCalledWith(2, { x: 9, y: 9 });
  });

  it("teardown cancel() drops the pending frame AND the buffered payload (never fires post-settle)", (): void => {
    const scheduler: FakeFrameScheduler = makeFakeScheduler();
    const onFrame = jest.fn<(payload: { x: number; y: number }) => void>();
    const coalescer = createFrameCoalescer(onFrame, scheduler);

    coalescer.schedule({ x: 5, y: 5 });
    expect(scheduler.pendingCount()).toBe(1);

    coalescer.cancel();
    expect(scheduler.pendingCount()).toBe(0);

    // Even if a stray frame were pumped, the buffered payload is gone.
    scheduler.runFrames();
    expect(onFrame).not.toHaveBeenCalled();
  });

  it("cancel() is idempotent and safe with no pending frame", (): void => {
    const scheduler: FakeFrameScheduler = makeFakeScheduler();
    const onFrame = jest.fn<(payload: number) => void>();
    const coalescer = createFrameCoalescer(onFrame, scheduler);
    expect((): void => coalescer.cancel()).not.toThrow();
    coalescer.schedule(1);
    coalescer.cancel();
    coalescer.cancel();
    expect(scheduler.pendingCount()).toBe(0);
  });
});

describe("drag-machine — fast drag-release commits at the release position (coalescer-race regression)", (): void => {
  // Failure reproduced empirically (CDP probe, headless Chrome against the dev
  // server): a SLOW drag (a frame between each move, so the rAF coalescer
  // flushes and resolves a target) commits the swap; a FAST flick (moves + the
  // `pointerup` within a single frame, before the coalescer flushes) does NOT —
  // the pane snaps back to its origin.
  //
  // Root cause: the rAF coalescer is the ONLY thing that promotes `armed →
  // dragging` AND resolves the drop target. On a fast release the buffered
  // sample never runs before `pointerup`, and teardown `cancel()`s it — so the
  // FSM is still `armed` (or holds a stale/empty target) when POINTER_UP
  // arrives, settling as a click/cancel.
  //
  // Fix: the renderer's `handlePointerUp` cancels the buffered frame and runs
  // the SAME resolution synchronously from the RELEASE pointer position before
  // dispatching POINTER_UP. For a mouse/pen flick past the pickup threshold
  // that produces the reducer event sequence asserted below.

  it("the buggy path: a buffered move that never flushes leaves the target unresolved (dropped frame)", (): void => {
    const scheduler: FakeFrameScheduler = makeFakeScheduler();
    const onFrame = jest.fn<(payload: { x: number; y: number }) => void>();
    const coalescer = createFrameCoalescer(onFrame, scheduler);
    // Fast flick: a burst of moves arms ONE frame …
    coalescer.schedule({ x: 200, y: 200 });
    coalescer.schedule({ x: 300, y: 300 });
    expect(scheduler.pendingCount()).toBe(1);
    // … but the release tears the drag down before the frame runs.
    coalescer.cancel();
    scheduler.runFrames();
    // The sample that would have promoted + resolved the target NEVER ran.
    expect(onFrame).not.toHaveBeenCalled();
  });

  it("armed + bare POINTER_UP → idle (the un-fixed revert: release settles as a click, no commit)", (): void => {
    const armed: DragMachineState = dragMachineReducer(DRAG_MACHINE_INITIAL_STATE, pointerDown());
    const released: DragMachineState = dragMachineReducer(armed, { type: "POINTER_UP", pointerId: 1 });
    expect(released).toEqual({ phase: "idle" });
  });

  it("the fix: the release-time event sequence (POINTER_MOVE → TARGET_RESOLVED → POINTER_UP) settles to a commit carrying the release-position target", (): void => {
    // This is exactly what the renderer's `handlePointerUp` now enqueues by
    // calling `processPointerSample(releaseClient)` (which dispatches
    // POINTER_MOVE then TARGET_RESOLVED) immediately before POINTER_UP.
    const releaseClient = { x: 300, y: 300 }; // past the pickup threshold from origin {110,110}
    let state: DragMachineState = dragMachineReducer(DRAG_MACHINE_INITIAL_STATE, pointerDown());
    state = dragMachineReducer(state, { type: "POINTER_MOVE", pointerId: 1, client: releaseClient });
    expect(state.phase).toBe("dragging");
    state = dragMachineReducer(state, {
      type: "TARGET_RESOLVED",
      pointerId: 1,
      resolvedTarget: makeTarget("C", "center", "swap"),
    });
    state = dragMachineReducer(state, { type: "POINTER_UP", pointerId: 1 });
    expect(state.phase).toBe("settling");
    if (state.phase === "settling") {
      expect(state.outcome).toBe("commit");
      expect(state.resolvedTarget?.leafId).toBe("C");
    }
  });

  it("the fix preserves click-vs-drag: a sub-threshold release-position sample never promotes (stays a click → idle)", (): void => {
    // `processPointerSample` only promotes when the pickup threshold is crossed;
    // a tiny release at {112,112} (2px from origin) does not, so POINTER_UP from
    // `armed` is still a click.
    let state: DragMachineState = dragMachineReducer(DRAG_MACHINE_INITIAL_STATE, pointerDown());
    const subThreshold = { x: 112, y: 112 };
    if (!hasCrossedPickupThreshold({ x: 110, y: 110 }, subThreshold)) {
      // no promotion dispatched
      state = dragMachineReducer(state, { type: "POINTER_UP", pointerId: 1 });
    }
    expect(state).toEqual({ phase: "idle" });
  });
});

describe("drag-machine — committable-seat SSOT + atomic seated-release commit (dwell-then-release snap-back regression)", (): void => {
  // The seated-then-release snap-back: a deliberate drag seats the dragged pane in
  // a valid target slot (the ghost hops in and DWELLS there for multiple frames),
  // then `pointerup` reverted the layout instead of committing. The renderer's
  // RELEASE path used to RE-RESOLVE the drop target from the raw `pointerup`
  // coordinates; that re-resolution could resolve `null` (cursor over a layout gap
  // / off the gap-closed hit footprint) or a different target and clobber the
  // seated committable target, so POINTER_UP settled as a cancel.
  //
  // Fix: the renderer captures the single authoritative committable seat
  // synchronously on every processed sample via `deriveCommittableSeat`
  // (`committableSeatRef`), and the release path commits THAT verbatim — it no
  // longer re-resolves at release. POINTER_UP commits the seat (or cancels when it
  // is `null`). These assertions pin both the capture rule and the resulting
  // commit/cancel settle.
  const seatedSwap: DragResolvedTarget = makeTarget("C", "center", "swap");

  it("deriveCommittableSeat captures a committable swap / edge-insert / group-merge verbatim", (): void => {
    expect(deriveCommittableSeat(seatedSwap, "A")).toBe(seatedSwap);
    const edgeInsert: DragResolvedTarget = makeTarget("C", "right", "edge-insert");
    expect(deriveCommittableSeat(edgeInsert, "A")).toBe(edgeInsert);
    const groupMerge: DragResolvedTarget = makeTarget("C", "center", "group-merge");
    expect(deriveCommittableSeat(groupMerge, "A")).toBe(groupMerge);
  });

  it("deriveCommittableSeat returns null for null / non-committable / self-target (nothing to commit)", (): void => {
    expect(deriveCommittableSeat(null, "A")).toBeNull();
    expect(deriveCommittableSeat(makeTarget("C", "center", "none"), "A")).toBeNull();
    // edge-insert with no resolved edge zone is non-committable.
    const edgeNoZone: DragResolvedTarget = {
      ...makeTarget("C", "center", "edge-insert"),
      finalEdge: null,
      selectedSplitZone: null,
    };
    expect(deriveCommittableSeat(edgeNoZone, "A")).toBeNull();
    // self-target (source === target) is never committable.
    expect(deriveCommittableSeat(makeTarget("A", "center", "swap"), "A")).toBeNull();
  });

  it("dwell-then-release: the captured committable seat commits even though release-time re-resolution would have resolved null over a gap", (): void => {
    // Pickup → threshold pickup → seat on a committable swap (the dwell).
    let state: DragMachineState = dragMachineReducer(
      DRAG_MACHINE_INITIAL_STATE,
      pointerDown(),
    );
    state = dragMachineReducer(state, {
      type: "POINTER_MOVE",
      pointerId: 1,
      client: { x: 200, y: 200 },
    });
    state = dragMachineReducer(state, {
      type: "TARGET_RESOLVED",
      pointerId: 1,
      resolvedTarget: seatedSwap,
    });
    // The seat the renderer captured at this dwell frame.
    const committableSeat: DragResolvedTarget | null = deriveCommittableSeat(
      activeResolvedTarget(state),
      "A",
    );
    expect(committableSeat).toBe(seatedSwap);
    // RELEASE: the renderer does NOT re-resolve the release coordinates (which over
    // a gap would resolve null); it dispatches the captured committable seat.
    state = dragMachineReducer(state, {
      type: "TARGET_RESOLVED",
      pointerId: 1,
      resolvedTarget: committableSeat,
    });
    state = dragMachineReducer(state, { type: "POINTER_UP", pointerId: 1 });
    expect(state.phase).toBe("settling");
    if (state.phase === "settling") {
      expect(state.outcome).toBe("commit");
      expect(state.resolvedTarget?.leafId).toBe("C");
    }
  });

  it("release over a genuinely non-committable position (no captured seat) settles as cancel", (): void => {
    let state: DragMachineState = dragMachineReducer(
      DRAG_MACHINE_INITIAL_STATE,
      pointerDown(),
    );
    state = dragMachineReducer(state, {
      type: "POINTER_MOVE",
      pointerId: 1,
      client: { x: 200, y: 200 },
    });
    // The cursor is over a layout gap → the move policy clears the seat to null.
    const committableSeat: DragResolvedTarget | null = deriveCommittableSeat(
      null,
      "A",
    );
    expect(committableSeat).toBeNull();
    state = dragMachineReducer(state, {
      type: "TARGET_RESOLVED",
      pointerId: 1,
      resolvedTarget: committableSeat,
    });
    state = dragMachineReducer(state, { type: "POINTER_UP", pointerId: 1 });
    expect(state.phase).toBe("settling");
    if (state.phase === "settling") {
      expect(state.outcome).toBe("cancel");
    }
  });

  it("release commit is synchronous: POINTER_UP settles immediately from the resolved target with no settling window / time gate", (): void => {
    // Operator directive: mouse release must commit immediately and
    // synchronously — the commit decision must NOT be reactive/deferred behind
    // any intentional settling window, debounce, hold-threshold, or timer. The
    // FSM encodes this structurally: the commit/cancel outcome is a pure function
    // of `resolvedTarget` at the POINTER_UP transition (`settleFrom` →
    // `isCommittableTarget`), evaluated in the SAME synchronous reducer call —
    // there is no elapsed-time input and no intermediate "pending-commit" state to
    // wait through. The renderer's `handlePointerUp` runs this exact sequence in
    // one task (`coalescer.cancel()` → release sample dispatches POINTER_MOVE +
    // TARGET_RESOLVED(committableSeatRef) → POINTER_UP), so no dwell is required
    // and no timer gates the commit. A future regression that introduced a
    // settling window would have to add an event/state between TARGET_RESOLVED and
    // the commit, breaking this single-call invariant.
    let state: DragMachineState = dragMachineReducer(
      DRAG_MACHINE_INITIAL_STATE,
      pointerDown(),
    );
    state = dragMachineReducer(state, {
      type: "POINTER_MOVE",
      pointerId: 1,
      client: { x: 200, y: 200 },
    });
    state = dragMachineReducer(state, {
      type: "TARGET_RESOLVED",
      pointerId: 1,
      resolvedTarget: seatedSwap,
    });
    // Still `dragging` — no auto-advance toward commit without the release event.
    expect(state.phase).toBe("dragging");
    // The very next reducer call (POINTER_UP) IS the commit — one step, no window.
    const settled: DragMachineState = dragMachineReducer(state, {
      type: "POINTER_UP",
      pointerId: 1,
    });
    expect(settled.phase).toBe("settling");
    if (settled.phase === "settling") {
      expect(settled.outcome).toBe("commit");
      expect(settled.resolvedTarget?.leafId).toBe("C");
    }
  });
});

describe("drag-machine — presentation selectors extend through settling commit", (): void => {
  const seatedSwap: DragResolvedTarget = makeTarget("B", "center", "swap");

  it("presentationDragSourceLeafId holds source through settling commit", (): void => {
    let state: DragMachineState = {
      phase: "settling",
      sourceLeafId: "A",
      outcome: "commit",
      resolvedTarget: seatedSwap,
      fromFootprint: { left: 0, top: 0, width: 100, height: 100 },
      toFootprint: { left: 0, top: 0, width: 100, height: 100 },
    };
    expect(presentationDragSourceLeafId(state)).toBe("A");
    expect(activeDragSourceLeafId(state)).toBeNull();
    state = { ...state, outcome: "cancel" };
    expect(presentationDragSourceLeafId(state)).toBeNull();
  });

  it("presentationResolvedTarget holds target through settling commit", (): void => {
    const state: DragMachineState = {
      phase: "settling",
      sourceLeafId: "A",
      outcome: "commit",
      resolvedTarget: seatedSwap,
      fromFootprint: { left: 0, top: 0, width: 100, height: 100 },
      toFootprint: { left: 0, top: 0, width: 100, height: 100 },
    };
    expect(presentationResolvedTarget(state)).toEqual(seatedSwap);
    expect(activeResolvedTarget(state)).toBeNull();
  });
});

describe("drag-machine — commit latch wins over competing cancel (throttling snap-back race)", (): void => {
  // The throttling snap-back: a pane seats correctly during the drag but SNAPS
  // BACK on release, intermittently. Two race surfaces beyond the (already-fixed)
  // committable-seat SSOT: (1) under rAF starvation the M3 watchdog / a competing
  // cancel source (`lostpointercapture` / `blur` / `visibilitychange`) reaches
  // `dragging` before the release commit and reverts the layout
  // (first-terminal-event-wins); (2) the FINAL coalesced move can transiently
  // clear `committableSeatRef` to null right before release, so the release
  // commits null → cancel. Fix A latches the commit seat at `pointerup` and
  // no-ops competing cancels; the decaying fallback closes the transient-clear
  // tertiary. These pin the pure logic behind that wiring.
  const seatC: DragResolvedTarget = makeTarget("C", "center", "swap");
  const seatB: DragResolvedTarget = makeTarget("B", "center", "swap");

  describe("foldCommittableSeatFallback — decaying last-committable-seat fallback", (): void => {
    it("a non-null seat refreshes the fallback and resets the null run", (): void => {
      const folded: CommittableSeatFallback = foldCommittableSeatFallback(
        { lastCommittableSeat: seatB, consecutiveNullSeats: 1 },
        seatC,
      );
      expect(folded.lastCommittableSeat).toBe(seatC);
      expect(folded.consecutiveNullSeats).toBe(0);
    });

    it("a SINGLE null seat preserves the fallback (transient final-move clear)", (): void => {
      const folded: CommittableSeatFallback = foldCommittableSeatFallback(
        { lastCommittableSeat: seatC, consecutiveNullSeats: 0 },
        null,
      );
      expect(folded.lastCommittableSeat).toBe(seatC);
      expect(folded.consecutiveNullSeats).toBe(1);
    });

    it("a SUSTAINED null run (>= 2) drops the fallback (genuine leave → no stale commit)", (): void => {
      let fallback: CommittableSeatFallback = { lastCommittableSeat: seatC, consecutiveNullSeats: 0 };
      fallback = foldCommittableSeatFallback(fallback, null); // 1st null — transient, kept
      expect(fallback.lastCommittableSeat).toBe(seatC);
      fallback = foldCommittableSeatFallback(fallback, null); // 2nd null — sustained, dropped
      expect(fallback.lastCommittableSeat).toBeNull();
      expect(fallback.consecutiveNullSeats).toBe(2);
    });
  });

  describe("resolveReleaseCommitSeat — the seat the release latches", (): void => {
    it("prefers the live seat captured on the final sample", (): void => {
      expect(
        resolveReleaseCommitSeat(seatC, { lastCommittableSeat: seatB, consecutiveNullSeats: 0 }),
      ).toBe(seatC);
    });

    it("falls back to the last committable seat when the final move transiently cleared it", (): void => {
      expect(
        resolveReleaseCommitSeat(null, { lastCommittableSeat: seatC, consecutiveNullSeats: 1 }),
      ).toBe(seatC);
    });

    it("stays null when there was never a committable seat (fallback empty → release cancels)", (): void => {
      expect(resolveReleaseCommitSeat(null, EMPTY_COMMITTABLE_SEAT_FALLBACK)).toBeNull();
    });
  });

  describe("shouldSuppressCompetingCancel — self-heal only for the genuinely-stuck case", (): void => {
    it("suppresses a competing cancel while a release commit is latched", (): void => {
      expect(shouldSuppressCompetingCancel(seatC, null)).toBe(true);
    });

    it("suppresses a competing cancel while a committable seat exists for the pointer", (): void => {
      expect(shouldSuppressCompetingCancel(null, seatC)).toBe(true);
    });

    it("does NOT suppress when there is no latch and no committable seat (genuinely stuck → self-heal)", (): void => {
      expect(shouldSuppressCompetingCancel(null, null)).toBe(false);
    });
  });

  // The renderer gates every competing cancel source (M3 watchdog `onExpire`,
  // `lostpointercapture`, `blur`, `visibilitychange`) behind
  // `shouldSuppressCompetingCancel`. This models that gate against the reducer:
  // a suppressed cancel is simply not dispatched, so the FSM stays `dragging` and
  // the subsequent `POINTER_UP` commits.
  function competingCancel(
    state: DragMachineState,
    releaseCommitLatched: DragResolvedTarget | null,
    committableSeat: DragResolvedTarget | null,
  ): DragMachineState {
    if (shouldSuppressCompetingCancel(releaseCommitLatched, committableSeat)) {
      return state;
    }
    return dragMachineReducer(state, { type: "POINTER_CANCEL", pointerId: 1 });
  }

  it("(assertion 1) a cancel (watchdog onExpire / lostpointercapture / blur) AFTER a commit is latched does NOT revert — commit wins", (): void => {
    let state: DragMachineState = toDragging();
    state = dragMachineReducer(state, { type: "TARGET_RESOLVED", pointerId: 1, resolvedTarget: seatC });
    // Release latches the committable seat (live seat present, fallback irrelevant).
    const latched: DragResolvedTarget | null = resolveReleaseCommitSeat(
      seatC,
      foldCommittableSeatFallback(EMPTY_COMMITTABLE_SEAT_FALLBACK, seatC),
    );
    expect(latched).toBe(seatC);
    // A competing cancel arrives in the same task — suppressed, FSM untouched.
    state = competingCancel(state, latched, seatC);
    expect(state.phase).toBe("dragging");
    // POINTER_UP then commits the latched seat.
    state = dragMachineReducer(state, { type: "TARGET_RESOLVED", pointerId: 1, resolvedTarget: latched });
    state = dragMachineReducer(state, { type: "POINTER_UP", pointerId: 1 });
    expect(state.phase).toBe("settling");
    if (state.phase === "settling") {
      expect(state.outcome).toBe("commit");
      expect(state.resolvedTarget?.leafId).toBe("C");
    }
  });

  it("the same cancel WITHOUT a latch (no committable seat) DOES revert — self-heal preserved for the stuck case", (): void => {
    let state: DragMachineState = toDragging();
    // No committable seat ever resolved; a genuine stuck-drag cancel must revert.
    state = competingCancel(state, null, null);
    expect(state.phase).toBe("settling");
    if (state.phase === "settling") {
      expect(state.outcome).toBe("cancel");
    }
  });

  it("(assertion 3) a final move that transiently clears the seat still commits the last committable seat on release", (): void => {
    let fallback: CommittableSeatFallback = EMPTY_COMMITTABLE_SEAT_FALLBACK;
    // Dwell sample: seated on a committable swap.
    let liveSeat: DragResolvedTarget | null = deriveCommittableSeat(seatC, "A");
    fallback = foldCommittableSeatFallback(fallback, liveSeat);
    expect(liveSeat).toBe(seatC);
    // FINAL move: a sub-pixel/footprint-edge jitter resolves null → seat cleared.
    liveSeat = deriveCommittableSeat(null, "A");
    fallback = foldCommittableSeatFallback(fallback, liveSeat);
    expect(liveSeat).toBeNull();
    // Release latch falls back to the dwelled seat (single transient clear kept).
    const latched: DragResolvedTarget | null = resolveReleaseCommitSeat(liveSeat, fallback);
    expect(latched).toBe(seatC);
    // FSM commits the latched seat.
    let state: DragMachineState = toDragging();
    state = dragMachineReducer(state, { type: "TARGET_RESOLVED", pointerId: 1, resolvedTarget: latched });
    state = dragMachineReducer(state, { type: "POINTER_UP", pointerId: 1 });
    expect(state.phase).toBe("settling");
    if (state.phase === "settling") {
      expect(state.outcome).toBe("commit");
      expect(state.resolvedTarget?.leafId).toBe("C");
    }
  });

  it("a SUSTAINED leave (cursor left all targets and held) decays the fallback → release cancels (no stale commit)", (): void => {
    let fallback: CommittableSeatFallback = EMPTY_COMMITTABLE_SEAT_FALLBACK;
    fallback = foldCommittableSeatFallback(fallback, deriveCommittableSeat(seatC, "A")); // seated
    fallback = foldCommittableSeatFallback(fallback, deriveCommittableSeat(null, "A")); // left (1)
    fallback = foldCommittableSeatFallback(fallback, deriveCommittableSeat(null, "A")); // still off (2) → decay
    const latched: DragResolvedTarget | null = resolveReleaseCommitSeat(null, fallback);
    expect(latched).toBeNull();
    let state: DragMachineState = toDragging();
    state = dragMachineReducer(state, { type: "TARGET_RESOLVED", pointerId: 1, resolvedTarget: latched });
    state = dragMachineReducer(state, { type: "POINTER_UP", pointerId: 1 });
    expect(state.phase === "settling" && state.outcome).toBe("cancel");
  });

  it("(assertion 4) with NO committable seat ever, release still cancels (no false commit)", (): void => {
    let fallback: CommittableSeatFallback = EMPTY_COMMITTABLE_SEAT_FALLBACK;
    // Every sample resolved a non-committable position (free-following over gaps).
    fallback = foldCommittableSeatFallback(fallback, deriveCommittableSeat(null, "A"));
    fallback = foldCommittableSeatFallback(fallback, deriveCommittableSeat(makeTarget("A", "center", "swap"), "A")); // self-target → null
    const latched: DragResolvedTarget | null = resolveReleaseCommitSeat(
      deriveCommittableSeat(null, "A"),
      fallback,
    );
    expect(latched).toBeNull();
    expect(shouldSuppressCompetingCancel(latched, null)).toBe(false);
    let state: DragMachineState = toDragging();
    state = dragMachineReducer(state, { type: "TARGET_RESOLVED", pointerId: 1, resolvedTarget: latched });
    state = dragMachineReducer(state, { type: "POINTER_UP", pointerId: 1 });
    expect(state.phase).toBe("settling");
    if (state.phase === "settling") {
      expect(state.outcome).toBe("cancel");
    }
  });
});
