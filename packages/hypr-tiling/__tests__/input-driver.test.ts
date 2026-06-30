import { describe, expect, it } from "@jest/globals";
import {
  DRAG_MACHINE_INITIAL_STATE,
  type DragMachineEvent,
  type DragMachinePoint,
  type DragMachineState,
  type DragPointerType,
  type DragResolvedTarget,
  type DragSlotCommitmentMode,
  dragMachineReducer,
  shouldSuppressCompetingCancel,
} from "../core/drag-machine";
import {
  type DragInputDriver,
  type DragInputDriverHost,
  type DragInputDriverSlotCommitment,
  createDragInputDriver,
} from "../core/input-driver";
import type {
  TilingDropAction,
  TilingLeafDropZone,
  TilingPaneFootprint,
} from "../core/types";

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

/**
 * A self-applying FSM harness around {@link createDragInputDriver}: `dispatch`
 * both records the event AND folds it through `dragMachineReducer`, so
 * `getState` reflects the same live phase the renderer's `dragStateRef` would.
 * `resolveTarget` is scripted per-call; `capturePointer` is spied. This pins the
 * driver's full `processPointerSample` + release-latch pipeline against
 * synthetic geometry with no DOM / React.
 */
interface DriverHarness {
  driver: DragInputDriver;
  state(): DragMachineState;
  readonly events: DragMachineEvent[];
  readonly captures: number[];
  setResolver(
    fn: (
      x: number,
      y: number,
      sourceLeafId: string,
      previousTarget: DragResolvedTarget | null,
    ) => DragResolvedTarget | null,
  ): void;
  setSlotCommitment(commitment: DragInputDriverSlotCommitment): void;
  pointerDown(point: DragMachinePoint, pointerType?: DragPointerType, pointerId?: number): void;
}

function createHarness(): DriverHarness {
  let state: DragMachineState = DRAG_MACHINE_INITIAL_STATE;
  const events: DragMachineEvent[] = [];
  const captures: number[] = [];
  let resolver: (
    x: number,
    y: number,
    sourceLeafId: string,
    previousTarget: DragResolvedTarget | null,
  ) => DragResolvedTarget | null = (): DragResolvedTarget | null => null;
  let slotCommitment: DragInputDriverSlotCommitment = {
    mode: "delta-responsive",
    reresolveDeltaPx: 24,
  };
  const host: DragInputDriverHost = {
    getState: (): DragMachineState => state,
    dispatch: (event: DragMachineEvent): void => {
      events.push(event);
      state = dragMachineReducer(state, event);
    },
    resolveTarget: (
      x: number,
      y: number,
      sourceLeafId: string,
      previousTarget: DragResolvedTarget | null,
    ): DragResolvedTarget | null => resolver(x, y, sourceLeafId, previousTarget),
    capturePointer: (pointerId: number): void => {
      captures.push(pointerId);
    },
    getSlotCommitment: (): DragInputDriverSlotCommitment => slotCommitment,
  };
  const driver: DragInputDriver = createDragInputDriver(host);
  return {
    driver,
    state: (): DragMachineState => state,
    events,
    captures,
    setResolver: (fn): void => {
      resolver = fn;
    },
    setSlotCommitment: (commitment): void => {
      slotCommitment = commitment;
    },
    pointerDown: (point, pointerType = "mouse", pointerId = 1): void => {
      events.push({
        type: "POINTER_DOWN",
        pointerId,
        pointerType,
        sourceLeafId: "A",
        anchorFootprint: ANCHOR,
        pointerAnchorOffset: { x: 0, y: 0 },
        originClient: { x: point.x, y: point.y },
      });
      state = dragMachineReducer(state, {
        type: "POINTER_DOWN",
        pointerId,
        pointerType,
        sourceLeafId: "A",
        anchorFootprint: ANCHOR,
        pointerAnchorOffset: { x: 0, y: 0 },
        originClient: { x: point.x, y: point.y },
      });
    },
  };
}

function targetResolvedEvents(events: DragMachineEvent[]): DragMachineEvent[] {
  return events.filter((event: DragMachineEvent): boolean => event.type === "TARGET_RESOLVED");
}

describe("input-driver — armed → threshold → dragging promotion", (): void => {
  it("holds armed (no capture, no dispatch) below the pickup threshold (mouse)", (): void => {
    const harness: DriverHarness = createHarness();
    harness.pointerDown({ x: 0, y: 0 });
    const eventsBefore: number = harness.events.length;
    harness.driver.processPointerSample({ x: 3, y: 0 });
    expect(harness.state().phase).toBe("armed");
    expect(harness.captures).toEqual([]);
    expect(harness.events.length).toBe(eventsBefore);
  });

  it("promotes to dragging + captures + resolves the first target past the threshold", (): void => {
    const harness: DriverHarness = createHarness();
    const seat: DragResolvedTarget = makeTarget("C", "center", "swap");
    harness.setResolver((): DragResolvedTarget | null => seat);
    harness.pointerDown({ x: 0, y: 0 });
    harness.driver.processPointerSample({ x: 10, y: 0 });
    expect(harness.state().phase).toBe("dragging");
    expect(harness.captures).toEqual([1]);
    expect(harness.driver.committableSeat?.leafId).toBe("C");
    // POINTER_MOVE (promote) then TARGET_RESOLVED(first target).
    const resolved: DragMachineEvent[] = targetResolvedEvents(harness.events);
    expect(resolved).toHaveLength(1);
    if (resolved[0]?.type === "TARGET_RESOLVED") {
      expect(resolved[0].resolvedTarget?.leafId).toBe("C");
    }
  });

  it("captures the seat anchor only when the first target is committable", (): void => {
    const harness: DriverHarness = createHarness();
    harness.setResolver((): DragResolvedTarget | null => null);
    harness.pointerDown({ x: 0, y: 0 });
    harness.driver.processPointerSample({ x: 10, y: 0 });
    expect(harness.state().phase).toBe("dragging");
    expect(harness.driver.committableSeat).toBeNull();
    expect(harness.driver.seatAnchor).toBeNull();
  });
});

describe("input-driver — seated hold (delta-responsive vs zone-exit-hold) + re-aim re-anchor", (): void => {
  function seatedHarness(mode: DragSlotCommitmentMode): DriverHarness {
    const harness: DriverHarness = createHarness();
    harness.setSlotCommitment({ mode, reresolveDeltaPx: 24 });
    const seat: DragResolvedTarget = makeTarget("C", "center", "swap");
    harness.setResolver((): DragResolvedTarget | null => seat);
    harness.pointerDown({ x: 0, y: 0 });
    // Promote + seat on C at (10,0).
    harness.driver.processPointerSample({ x: 10, y: 0 });
    return harness;
  }

  it("delta-responsive HOLDS the seat under a sub-delta move inside the footprint", (): void => {
    const harness: DriverHarness = seatedHarness("delta-responsive");
    // Resolver still returns C (same footprint); travel < 24px from anchor (10,0).
    harness.driver.processPointerSample({ x: 20, y: 0 });
    const resolved: DragMachineEvent[] = targetResolvedEvents(harness.events);
    const last: DragMachineEvent | undefined = resolved[resolved.length - 1];
    if (last?.type === "TARGET_RESOLVED") {
      expect(last.resolvedTarget?.leafId).toBe("C");
    }
    expect(harness.driver.committableSeat?.leafId).toBe("C");
    // The seat anchor stays at the original (10,0) seat (no re-anchor on a hold).
    expect(harness.driver.seatAnchor).toEqual({ x: 10, y: 0 });
  });

  it("delta-responsive RE-AIMS + re-anchors once travel exceeds the delta to a new seat", (): void => {
    const harness: DriverHarness = seatedHarness("delta-responsive");
    const newSeat: DragResolvedTarget = makeTarget("B", "center", "swap");
    harness.setResolver((): DragResolvedTarget | null => newSeat);
    harness.driver.processPointerSample({ x: 100, y: 0 });
    expect(harness.driver.committableSeat?.leafId).toBe("B");
    // Re-seated → anchor moves to the new sample position.
    expect(harness.driver.seatAnchor).toEqual({ x: 100, y: 0 });
  });

  it("zone-exit-hold PINS the seat through any in-footprint travel (no re-aim)", (): void => {
    const harness: DriverHarness = seatedHarness("zone-exit-hold");
    // A fresh resolution would pick B, but the cursor is still within C's
    // footprint (resolver returns C) → the seat is pinned, no re-resolve.
    harness.driver.processPointerSample({ x: 200, y: 0 });
    expect(harness.driver.committableSeat?.leafId).toBe("C");
  });

  it("zone-exit-hold RE-RESOLVES once the cursor exits the seated footprint", (): void => {
    const harness: DriverHarness = seatedHarness("zone-exit-hold");
    const exited: DragResolvedTarget = makeTarget("B", "center", "swap");
    harness.setResolver((): DragResolvedTarget | null => exited);
    harness.driver.processPointerSample({ x: 500, y: 0 });
    expect(harness.driver.committableSeat?.leafId).toBe("B");
  });
});

describe("input-driver — synchronous release-sample (snap-back nucleus)", (): void => {
  it("dispatches the latched seat verbatim on a release sample, ignoring the release coords", (): void => {
    const harness: DriverHarness = createHarness();
    const seat: DragResolvedTarget = makeTarget("C", "center", "swap");
    harness.setResolver((): DragResolvedTarget | null => seat);
    harness.pointerDown({ x: 0, y: 0 });
    harness.driver.processPointerSample({ x: 10, y: 0 });
    expect(harness.driver.committableSeat?.leafId).toBe("C");
    // The release coords resolve to NOTHING (cursor over a gap) — the classic
    // snap-back trigger. The release sample must NOT re-resolve.
    harness.setResolver((): DragResolvedTarget | null => null);
    harness.driver.latchRelease();
    const eventsBefore: number = harness.events.length;
    harness.driver.processPointerSample({ x: 9999, y: 9999 }, true);
    const resolved: DragMachineEvent[] = targetResolvedEvents(
      harness.events.slice(eventsBefore),
    );
    expect(resolved).toHaveLength(1);
    if (resolved[0]?.type === "TARGET_RESOLVED") {
      expect(resolved[0].resolvedTarget?.leafId).toBe("C");
    }
    // POINTER_UP then commits to the latched seat.
    const state: DragMachineState = dragMachineReducer(harness.state(), {
      type: "POINTER_UP",
      pointerId: 1,
    });
    expect(state.phase).toBe("settling");
    if (state.phase === "settling") {
      expect(state.outcome).toBe("commit");
      expect(state.resolvedTarget?.leafId).toBe("C");
    }
  });

  it("latchRelease falls back to the decayed last-committable seat on a single transient clear", (): void => {
    const harness: DriverHarness = createHarness();
    const seat: DragResolvedTarget = makeTarget("C", "center", "swap");
    harness.setResolver((): DragResolvedTarget | null => seat);
    harness.pointerDown({ x: 0, y: 0 });
    harness.driver.processPointerSample({ x: 10, y: 0 });
    // ONE transient clear (final-move sub-pixel jitter): committableSeat → null,
    // but the fallback retains C (first null is transient).
    harness.setResolver((): DragResolvedTarget | null => null);
    harness.driver.processPointerSample({ x: 12, y: 0 });
    expect(harness.driver.committableSeat).toBeNull();
    expect(harness.driver.latchRelease()?.leafId).toBe("C");
  });

  it("latchRelease cancels (null) after a SUSTAINED null run (genuine leave)", (): void => {
    const harness: DriverHarness = createHarness();
    const seat: DragResolvedTarget = makeTarget("C", "center", "swap");
    harness.setResolver((): DragResolvedTarget | null => seat);
    harness.pointerDown({ x: 0, y: 0 });
    harness.driver.processPointerSample({ x: 10, y: 0 });
    harness.setResolver((): DragResolvedTarget | null => null);
    // Two consecutive nulls = sustained leave → fallback decays to null.
    harness.driver.processPointerSample({ x: 200, y: 0 });
    harness.driver.processPointerSample({ x: 400, y: 0 });
    expect(harness.driver.latchRelease()).toBeNull();
  });
});

describe("input-driver — competing-cancel suppression inputs + reset", (): void => {
  it("a seated committable target suppresses competing cancels; reset clears it", (): void => {
    const harness: DriverHarness = createHarness();
    const seat: DragResolvedTarget = makeTarget("C", "center", "swap");
    harness.setResolver((): DragResolvedTarget | null => seat);
    harness.pointerDown({ x: 0, y: 0 });
    harness.driver.processPointerSample({ x: 10, y: 0 });
    expect(
      shouldSuppressCompetingCancel(
        harness.driver.releaseCommitLatched,
        harness.driver.committableSeat,
      ),
    ).toBe(true);
    harness.driver.reset();
    expect(harness.driver.committableSeat).toBeNull();
    expect(harness.driver.releaseCommitLatched).toBeNull();
    expect(harness.driver.seatAnchor).toBeNull();
    expect(
      shouldSuppressCompetingCancel(
        harness.driver.releaseCommitLatched,
        harness.driver.committableSeat,
      ),
    ).toBe(false);
  });

  it("a latched release suppresses competing cancels even after the seat is cleared", (): void => {
    const harness: DriverHarness = createHarness();
    const seat: DragResolvedTarget = makeTarget("C", "center", "swap");
    harness.setResolver((): DragResolvedTarget | null => seat);
    harness.pointerDown({ x: 0, y: 0 });
    harness.driver.processPointerSample({ x: 10, y: 0 });
    harness.driver.latchRelease();
    expect(harness.driver.releaseCommitLatched?.leafId).toBe("C");
    expect(
      shouldSuppressCompetingCancel(
        harness.driver.releaseCommitLatched,
        harness.driver.committableSeat,
      ),
    ).toBe(true);
  });
});
