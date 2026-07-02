import { describe, expect, it } from "@jest/globals";
import {
  DRAG_MACHINE_INITIAL_STATE,
  type DragMachineEvent,
  type DragMachinePoint,
  type DragMachineState,
  type DragResolvedTarget,
  dragMachineReducer,
} from "../engine/drag-machine";
import {
  type DragInputDriver,
  type DragInputDriverHost,
  type DragInputDriverSlotCommitment,
  createDragInputDriver,
  shouldArmIdleWatchdog,
} from "../engine/input-driver";
import type {
  TilingDropAction,
  TilingLeafDropZone,
  TilingPaneFootprint,
} from "../engine/types";

const ANCHOR: TilingPaneFootprint = { left: 100, top: 100, width: 200, height: 150 };

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

interface DriverHarness {
  driver: DragInputDriver;
  state(): DragMachineState;
  setResolver(fn: () => DragResolvedTarget | null): void;
  pointerDown(point: DragMachinePoint): void;
}

function createHarness(): DriverHarness {
  let state: DragMachineState = DRAG_MACHINE_INITIAL_STATE;
  let resolver: () => DragResolvedTarget | null = (): DragResolvedTarget | null => null;
  const slotCommitment: DragInputDriverSlotCommitment = {
    mode: "delta-responsive",
    reresolveDeltaPx: 24,
  };
  const host: DragInputDriverHost = {
    getState: (): DragMachineState => state,
    dispatch: (event: DragMachineEvent): void => {
      state = dragMachineReducer(state, event);
    },
    resolveTarget: (): DragResolvedTarget | null => resolver(),
    capturePointer: (): void => {},
    getSlotCommitment: (): DragInputDriverSlotCommitment => slotCommitment,
  };
  const driver: DragInputDriver = createDragInputDriver(host);
  return {
    driver,
    state: (): DragMachineState => state,
    setResolver: (fn): void => {
      resolver = fn;
    },
    pointerDown: (point): void => {
      state = dragMachineReducer(state, {
        type: "POINTER_DOWN",
        pointerId: 1,
        pointerType: "mouse",
        sourceLeafId: "A",
        anchorFootprint: ANCHOR,
        pointerAnchorOffset: { x: 0, y: 0 },
        originClient: { x: point.x, y: point.y },
      });
    },
  };
}

/** Build a driver in the named arbiter state. */
type ArbiterState = "idle" | "seated-committable" | "commit-latched";

function driverInState(arbiterState: ArbiterState): DragInputDriver {
  const harness: DriverHarness = createHarness();
  if (arbiterState === "idle") {
    // No seat, no latch — a genuinely-stuck drag (or no drag): cancels allowed.
    harness.pointerDown({ x: 0, y: 0 });
    harness.setResolver((): DragResolvedTarget | null => null);
    harness.driver.processPointerSample({ x: 10, y: 0 });
    return harness.driver;
  }
  const seat: DragResolvedTarget = makeTarget("C", "center", "swap");
  harness.setResolver((): DragResolvedTarget | null => seat);
  harness.pointerDown({ x: 0, y: 0 });
  harness.driver.processPointerSample({ x: 10, y: 0 });
  if (arbiterState === "commit-latched") {
    harness.driver.latchRelease();
  }
  return harness.driver;
}

// The four competing cancel sources that the renderer routes through the
// single suppression arbiter. The arbiter is SOURCE-AGNOSTIC by design — the
// matrix below asserts the decision depends only on the latch/seat state, so no
// source can special-case itself out of the policy.
const CANCEL_SOURCES: ReadonlyArray<string> = [
  "watchdog.onExpire",
  "lostpointercapture",
  "blur",
  "visibilitychange",
];

describe("competing-cancel matrix — every source × {idle, seated-committable, commit-latched}", (): void => {
  it("idle (no latch, no seat): EVERY source is allowed to dispatch its cancel", (): void => {
    const driver: DragInputDriver = driverInState("idle");
    expect(driver.committableSeat).toBeNull();
    expect(driver.releaseCommitLatched).toBeNull();
    for (const source of CANCEL_SOURCES) {
      expect(driver.shouldDispatchCompetingCancel()).toBe(true);
      void source;
    }
  });

  it("seated-committable (seat present, no latch): EVERY source is suppressed", (): void => {
    const driver: DragInputDriver = driverInState("seated-committable");
    expect(driver.committableSeat?.leafId).toBe("C");
    expect(driver.releaseCommitLatched).toBeNull();
    for (const source of CANCEL_SOURCES) {
      expect(driver.shouldDispatchCompetingCancel()).toBe(false);
      void source;
    }
  });

  it("commit-latched (release latched): EVERY source is suppressed", (): void => {
    const driver: DragInputDriver = driverInState("commit-latched");
    expect(driver.releaseCommitLatched?.leafId).toBe("C");
    for (const source of CANCEL_SOURCES) {
      expect(driver.shouldDispatchCompetingCancel()).toBe(false);
      void source;
    }
  });

  it("commit-latched stays suppressed even after the live seat is cleared", (): void => {
    const harness: DriverHarness = createHarness();
    const seat: DragResolvedTarget = makeTarget("C", "center", "swap");
    harness.setResolver((): DragResolvedTarget | null => seat);
    harness.pointerDown({ x: 0, y: 0 });
    harness.driver.processPointerSample({ x: 10, y: 0 });
    harness.driver.latchRelease();
    // A late competing move clears the live seat, but the latch persists.
    harness.setResolver((): DragResolvedTarget | null => null);
    harness.driver.processPointerSample({ x: 200, y: 0 });
    harness.driver.processPointerSample({ x: 400, y: 0 });
    expect(harness.driver.committableSeat).toBeNull();
    expect(harness.driver.releaseCommitLatched?.leafId).toBe("C");
    expect(harness.driver.shouldDispatchCompetingCancel()).toBe(false);
  });
});

describe("competing-cancel matrix — fallback decay feeds the release latch", (): void => {
  it("a single transient final-move clear → latch still commits the dwelled seat", (): void => {
    const harness: DriverHarness = createHarness();
    const seat: DragResolvedTarget = makeTarget("C", "center", "swap");
    harness.setResolver((): DragResolvedTarget | null => seat);
    harness.pointerDown({ x: 0, y: 0 });
    harness.driver.processPointerSample({ x: 10, y: 0 });
    harness.setResolver((): DragResolvedTarget | null => null);
    harness.driver.processPointerSample({ x: 12, y: 0 });
    expect(harness.driver.latchRelease()?.leafId).toBe("C");
  });

  it("a sustained null run (genuine leave) → latch cancels (null)", (): void => {
    const harness: DriverHarness = createHarness();
    const seat: DragResolvedTarget = makeTarget("C", "center", "swap");
    harness.setResolver((): DragResolvedTarget | null => seat);
    harness.pointerDown({ x: 0, y: 0 });
    harness.driver.processPointerSample({ x: 10, y: 0 });
    harness.setResolver((): DragResolvedTarget | null => null);
    harness.driver.processPointerSample({ x: 200, y: 0 });
    harness.driver.processPointerSample({ x: 400, y: 0 });
    expect(harness.driver.latchRelease()).toBeNull();
  });
});

describe("competing-cancel matrix — watchdog arming policy", (): void => {
  it("arms only for armed/dragging when drag-recovery is enabled", (): void => {
    expect(shouldArmIdleWatchdog("armed", true)).toBe(true);
    expect(shouldArmIdleWatchdog("dragging", true)).toBe(true);
    expect(shouldArmIdleWatchdog("idle", true)).toBe(false);
    expect(shouldArmIdleWatchdog("settling", true)).toBe(false);
  });

  it("never arms when drag-recovery is disabled", (): void => {
    expect(shouldArmIdleWatchdog("armed", false)).toBe(false);
    expect(shouldArmIdleWatchdog("dragging", false)).toBe(false);
    expect(shouldArmIdleWatchdog("idle", false)).toBe(false);
    expect(shouldArmIdleWatchdog("settling", false)).toBe(false);
  });
});
