import { describe, expect, it } from "@jest/globals";
import {
  type DragMachineState,
  type DragResolvedTarget,
} from "../core/drag-machine";
import type { DragInputDriverSlotCommitment } from "../core/input-driver";
import {
  type TilingController,
  type TilingControllerHost,
  createTilingController,
} from "../core/controller";
import type {
  TilingDropAction,
  TilingLeafDropZone,
  TilingPaneFootprint,
} from "../core/types";

// IMPORT-GRAPH GATE: this file imports ONLY `core/` modules (controller,
// drag-machine, input-driver, types). There is NO `react` / `react-dom` and NO
// DOM (`document` / `window`) in its transitive import graph — the test runs
// the full pickup → seat → commit interaction against a scripted stub host,
// proving `createTilingController` is genuinely framework-free. If a future edit
// pulls a React/DOM dependency into `core/controller.ts`, this module will fail
// to load under the headless (node) path and the gate trips.

const ANCHOR: TilingPaneFootprint = {
  left: 100,
  top: 100,
  width: 200,
  height: 150,
};

/** A fully-typed resolved target; only `leafId`/`zone`/`action` are load-bearing here. */
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
    tuning: {
      centerRatio: 0.5,
      edgeThresholdRatio: 0.25,
      hysteresisPx: 6,
      devicePixelRatio: 1,
    },
  };
}

/**
 * A scripted stub {@link TilingControllerHost}: `resolveTarget` returns a fixed
 * seat, `capturePointer` is recorded, the slot-commitment policy is immediate.
 * No DOM, no React.
 */
function createStubHost(seat: DragResolvedTarget | null): {
  host: TilingControllerHost;
  readonly captures: number[];
} {
  const captures: number[] = [];
  return {
    captures,
    host: {
      resolveTarget: (): DragResolvedTarget | null => seat,
      capturePointer: (pointerId: number): void => {
        captures.push(pointerId);
      },
      getSlotCommitment: (): DragInputDriverSlotCommitment => ({
        mode: "delta-responsive",
        reresolveDeltaPx: 24,
      }),
    },
  };
}

describe("createTilingController — headless pickup → seat → commit (no React/DOM)", (): void => {
  it("drives a full mouse swap through the framework-free controller", (): void => {
    const seat: DragResolvedTarget = makeTarget("C", "center", "swap");
    const { host, captures } = createStubHost(seat);
    const controller: TilingController = createTilingController({ host });

    const transitions: DragMachineState["phase"][] = [];
    const unsubscribe: () => void = controller.subscribe((): void => {
      transitions.push(controller.getState().drag.phase);
    });

    // Idle at rest.
    expect(controller.getState().drag.phase).toBe("idle");

    // 1) Primary press arms the FSM.
    controller.dispatch({
      type: "POINTER_DOWN",
      pointerId: 1,
      pointerType: "mouse",
      sourceLeafId: "A",
      anchorFootprint: ANCHOR,
      pointerAnchorOffset: { x: 0, y: 0 },
      originClient: { x: 0, y: 0 },
    });
    expect(controller.getState().drag.phase).toBe("armed");

    // 2) A past-threshold move promotes armed → dragging, captures the pointer,
    //    and seats the first committable target.
    controller.input.processPointerSample({ x: 10, y: 0 });
    expect(controller.getState().drag.phase).toBe("dragging");
    expect(captures).toEqual([1]);
    expect(controller.input.committableSeat?.leafId).toBe("C");

    // 3) Release: latch the seat, run the synchronous release sample, then
    //    POINTER_UP commits the latched seat.
    const latched: DragResolvedTarget | null = controller.input.latchRelease();
    expect(latched?.leafId).toBe("C");
    controller.input.processPointerSample({ x: 12, y: 0 }, true);
    controller.dispatch({ type: "POINTER_UP", pointerId: 1 });

    const settled: DragMachineState = controller.getState().drag;
    expect(settled.phase).toBe("settling");
    if (settled.phase === "settling") {
      expect(settled.outcome).toBe("commit");
      expect(settled.resolvedTarget?.leafId).toBe("C");
    }

    // 4) SETTLE_DONE returns to idle; dispose drops the subscriber + resets.
    controller.dispatch({ type: "SETTLE_DONE" });
    expect(controller.getState().drag.phase).toBe("idle");

    // Each state-changing sub-dispatch notifies: promote = POINTER_MOVE +
    // TARGET_RESOLVED (2 × dragging); release sample = POINTER_MOVE +
    // TARGET_RESOLVED (2 × dragging); then POINTER_UP → settling, SETTLE_DONE →
    // idle.
    expect(transitions).toEqual([
      "armed",
      "dragging",
      "dragging",
      "dragging",
      "dragging",
      "settling",
      "idle",
    ]);

    unsubscribe();
    controller.dispose();
  });

  it("cancels (no commit) when the release leaves every target", (): void => {
    const { host } = createStubHost(null);
    const controller: TilingController = createTilingController({ host });

    controller.dispatch({
      type: "POINTER_DOWN",
      pointerId: 1,
      pointerType: "mouse",
      sourceLeafId: "A",
      anchorFootprint: ANCHOR,
      pointerAnchorOffset: { x: 0, y: 0 },
      originClient: { x: 0, y: 0 },
    });
    controller.input.processPointerSample({ x: 10, y: 0 });
    expect(controller.getState().drag.phase).toBe("dragging");
    expect(controller.input.committableSeat).toBeNull();

    controller.input.latchRelease();
    controller.input.processPointerSample({ x: 12, y: 0 }, true);
    controller.dispatch({ type: "POINTER_UP", pointerId: 1 });

    const settled: DragMachineState = controller.getState().drag;
    expect(settled.phase).toBe("settling");
    if (settled.phase === "settling") {
      expect(settled.outcome).toBe("cancel");
    }
    controller.dispose();
  });

  it("suppresses a no-op dispatch (stable snapshot reference)", (): void => {
    const { host } = createStubHost(null);
    const controller: TilingController = createTilingController({ host });
    const before = controller.getState();
    let notified: number = 0;
    controller.subscribe((): void => {
      notified += 1;
    });
    // SETTLE_DONE is a no-op while idle → reducer returns state verbatim →
    // snapshot reference unchanged, no notify.
    controller.dispatch({ type: "SETTLE_DONE" });
    expect(controller.getState()).toBe(before);
    expect(notified).toBe(0);
    controller.dispose();
  });
});
