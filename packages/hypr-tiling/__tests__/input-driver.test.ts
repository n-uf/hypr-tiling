import { describe, expect, it } from "@jest/globals";
import {
  DRAG_MACHINE_INITIAL_STATE,
  type DragMachineEvent,
  type DragMachinePoint,
  type DragMachineState,
  type DragPointerType,
  type DragResolvedTarget,
  dragMachineReducer,
  shouldSuppressCompetingCancel,
} from "../engine/drag-machine";
import {
  type DragInputDriver,
  type DragInputDriverHost,
  createDragInputDriver,
} from "../engine/input-driver";
import type {
  TilingDropAction,
  TilingLeafDropZone,
  TilingPaneFootprint,
} from "../engine/types";

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
    tuning: { centerRatio: 0.5, edgeThresholdRatio: 0.25, devicePixelRatio: 1 },
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
  /** Whether the drag hit holds home at the sample being processed (the host's `heldHome`). */
  setHome(home: boolean): void;
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
  let home: boolean = false;
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
    heldHome: (): boolean => home,
    capturePointer: (pointerId: number): void => {
      captures.push(pointerId);
    },
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
    setHome: (value: boolean): void => {
      home = value;
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

  it("holds no seat when the first target is not committable", (): void => {
    const harness: DriverHarness = createHarness();
    harness.setResolver((): DragResolvedTarget | null => null);
    harness.pointerDown({ x: 0, y: 0 });
    harness.driver.processPointerSample({ x: 10, y: 0 });
    expect(harness.state().phase).toBe("dragging");
    expect(harness.driver.committableSeat).toBeNull();
  });
});

describe("input-driver — the seat is the drag hit's, the driver holds nothing of its own", (): void => {
  function seatedHarness(): DriverHarness {
    const harness: DriverHarness = createHarness();
    const seat: DragResolvedTarget = makeTarget("C", "center", "swap");
    harness.setResolver((): DragResolvedTarget | null => seat);
    harness.pointerDown({ x: 0, y: 0 });
    // Promote + seat on C at (10,0).
    harness.driver.processPointerSample({ x: 10, y: 0 });
    return harness;
  }

  it("takes what the hit answers on every sample: a new place is the seat at once, however little the pointer moved", (): void => {
    const harness: DriverHarness = seatedHarness();
    const newSeat: DragResolvedTarget = makeTarget("B", "center", "swap");
    harness.setResolver((): DragResolvedTarget | null => newSeat);
    harness.driver.processPointerSample({ x: 11, y: 0 });
    expect(harness.driver.committableSeat?.leafId).toBe("B");
  });

  it("an answer of nothing clears the seat at once (the hold rule is the hit's: the driver keeps no seat it was not given)", (): void => {
    const harness: DriverHarness = seatedHarness();
    harness.setResolver((): DragResolvedTarget | null => null);
    harness.driver.processPointerSample({ x: 11, y: 0 });
    expect(harness.driver.committableSeat).toBeNull();
  });

  it("asks the host once per sample, with the previous target the machine holds", (): void => {
    const harness: DriverHarness = createHarness();
    const asked: Array<DragResolvedTarget | null> = [];
    harness.setResolver((_x, _y, _source, previous): DragResolvedTarget | null => {
      asked.push(previous);
      return makeTarget("C", "center", "swap");
    });
    harness.pointerDown({ x: 0, y: 0 });
    harness.driver.processPointerSample({ x: 10, y: 0 });
    harness.driver.processPointerSample({ x: 12, y: 0 });
    expect(asked).toHaveLength(2);
    expect(asked[0]).toBeNull();
    expect(asked[1]?.leafId).toBe("C");
  });

  it("a sample the hit holds home on has no seat and resolves no target, even where a place is answered; the machine is told home", (): void => {
    const harness: DriverHarness = createHarness();
    harness.setResolver((): DragResolvedTarget | null => makeTarget("C", "center", "swap"));
    harness.pointerDown({ x: 0, y: 0 });
    harness.setHome(true);
    harness.driver.processPointerSample({ x: 10, y: 0 });
    expect(harness.driver.committableSeat).toBeNull();
    const resolved: DragMachineEvent[] = targetResolvedEvents(harness.events);
    expect(resolved).toHaveLength(1);
    if (resolved[0]?.type === "TARGET_RESOLVED") {
      expect(resolved[0].resolvedTarget).toBeNull();
      expect(resolved[0].atHome).toBe(true);
    }
    const state: DragMachineState = harness.state();
    expect(state.phase === "dragging" && state.atHome).toBe(true);
    // Leaving home: the next sample's answer is the seat, and the machine is told it is away.
    harness.setHome(false);
    harness.driver.processPointerSample({ x: 40, y: 0 });
    expect(harness.driver.committableSeat?.leafId).toBe("C");
    const away: DragMachineState = harness.state();
    expect(away.phase === "dragging" && !away.atHome && away.leftHome).toBe(true);
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

  it("latchRelease latches what the last sample showed: after one clear there is no earlier seat to fall back to", (): void => {
    const harness: DriverHarness = createHarness();
    const seat: DragResolvedTarget = makeTarget("C", "center", "swap");
    harness.setResolver((): DragResolvedTarget | null => seat);
    harness.pointerDown({ x: 0, y: 0 });
    harness.driver.processPointerSample({ x: 10, y: 0 });
    // The next sample holds nothing (the hit let the place go): the seat clears, and a release there puts the
    // layout back, as the last frame drew it.
    harness.setResolver((): DragResolvedTarget | null => null);
    harness.driver.processPointerSample({ x: 12, y: 0 });
    expect(harness.driver.committableSeat).toBeNull();
    expect(harness.driver.latchRelease()).toBeNull();
    const state: DragMachineState = dragMachineReducer(harness.state(), { type: "POINTER_UP", pointerId: 1 });
    expect(state.phase === "settling" && state.outcome).toBe("cancel");
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
