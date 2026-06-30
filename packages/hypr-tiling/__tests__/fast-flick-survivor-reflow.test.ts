import { describe, expect, it } from "@jest/globals";
import {
  DRAG_MACHINE_INITIAL_STATE,
  type DragMachineEvent,
  type DragMachineState,
  type DragResolvedTarget,
  dragMachineReducer,
} from "../core/drag-machine";
import type { TilingDropAction, TilingLeafDropZone, TilingPaneFootprint } from "../core/types";
import {
  applySurvivorReflowSnapLeafStyles,
  shouldPlaySurvivorReflowFlip,
  shouldSnapSurvivorReflowOnSettleCommit,
  type SurvivorReflowLeafStyleTarget,
} from "../core/survivor-reflow";

const SOURCE_LEAF_ID = "A";

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

function pointerDown(): DragMachineEvent {
  return {
    type: "POINTER_DOWN",
    pointerId: 1,
    pointerType: "mouse",
    sourceLeafId: SOURCE_LEAF_ID,
    anchorFootprint: ANCHOR,
    pointerAnchorOffset: { x: 10, y: 10 },
    originClient: { x: 110, y: 110 },
  };
}

/**
 * Same-task release path the renderer runs synchronously from `pointerup`:
 * promote + resolve from the release coords, then POINTER_UP — no painted
 * `dragging` frame for survivor-reflow (didPaintDraggingFrame stays false).
 */
function fastFlickSettlingCommit(): DragMachineState {
  const releaseClient = { x: 300, y: 300 };
  let state: DragMachineState = dragMachineReducer(DRAG_MACHINE_INITIAL_STATE, pointerDown());
  state = dragMachineReducer(state, { type: "POINTER_MOVE", pointerId: 1, client: releaseClient });
  state = dragMachineReducer(state, {
    type: "TARGET_RESOLVED",
    pointerId: 1,
    resolvedTarget: makeTarget("C", "center", "swap"),
  });
  state = dragMachineReducer(state, { type: "POINTER_UP", pointerId: 1 });
  return state;
}

function mockLeafStyleTarget(
  leafId: string,
  initial: { transition?: string; transform?: string },
): SurvivorReflowLeafStyleTarget & { dataset: { leafId: string } } {
  return {
    dataset: { leafId },
    style: {
      transition: initial.transition ?? "",
      transform: initial.transform ?? "",
      transformOrigin: "top left",
    },
  };
}

describe("fast-flick survivor-reflow — settle-commit snap gate (pure)", (): void => {
  it("flags a same-task settling commit with no painted dragging frame", (): void => {
    expect(
      shouldSnapSurvivorReflowOnSettleCommit({
        liveDragModeEnabled: true,
        dragPhase: "settling",
        settleOutcome: "commit",
        didPaintDraggingFrame: false,
      }),
    ).toBe(true);
    expect(
      shouldPlaySurvivorReflowFlip({
        liveDragModeEnabled: true,
        dragPhase: "settling",
        settleOutcome: "commit",
        didPaintDraggingFrame: false,
      }),
    ).toBe(false);
  });

  it("still plays FLIP on settling commit when a dragging frame was painted", (): void => {
    expect(
      shouldSnapSurvivorReflowOnSettleCommit({
        liveDragModeEnabled: true,
        dragPhase: "settling",
        settleOutcome: "commit",
        didPaintDraggingFrame: true,
      }),
    ).toBe(false);
    expect(
      shouldPlaySurvivorReflowFlip({
        liveDragModeEnabled: true,
        dragPhase: "settling",
        settleOutcome: "commit",
        didPaintDraggingFrame: true,
      }),
    ).toBe(true);
  });

  it("does not snap a settling cancel (fly-back may still reflow survivors)", (): void => {
    expect(
      shouldSnapSurvivorReflowOnSettleCommit({
        liveDragModeEnabled: true,
        dragPhase: "settling",
        settleOutcome: "cancel",
        didPaintDraggingFrame: false,
      }),
    ).toBe(false);
    expect(
      shouldPlaySurvivorReflowFlip({
        liveDragModeEnabled: true,
        dragPhase: "settling",
        settleOutcome: "cancel",
        didPaintDraggingFrame: false,
      }),
    ).toBe(true);
  });
});

describe("fast-flick survivor-reflow — FSM same-task release → settling commit", (): void => {
  it("release-time resolve settles to commit without an intermediate idle hop", (): void => {
    const settling: DragMachineState = fastFlickSettlingCommit();
    expect(settling.phase).toBe("settling");
    if (settling.phase === "settling") {
      expect(settling.outcome).toBe("commit");
      expect(settling.resolvedTarget?.leafId).toBe("C");
      expect(settling.sourceLeafId).toBe(SOURCE_LEAF_ID);
    }
  });
});

describe("fast-flick survivor-reflow — DOM snap path (no FLIP transition armed)", (): void => {
  it("snap path leaves the source leaf at identity styles (no transform transition armed)", (): void => {
    const settling: DragMachineState = fastFlickSettlingCommit();
    expect(settling.phase).toBe("settling");

    const snap: boolean = shouldSnapSurvivorReflowOnSettleCommit({
      liveDragModeEnabled: true,
      dragPhase: "settling",
      settleOutcome: settling.phase === "settling" ? settling.outcome : null,
      didPaintDraggingFrame: false,
    });
    expect(snap).toBe(true);

    const sourceLeaf = mockLeafStyleTarget(SOURCE_LEAF_ID, {
      transition: "transform 170ms cubic-bezier(0.2, 0.8, 0.2, 1)",
      transform: "translate(-240px, 0px) scale(1, 1)",
    });
    const survivorLeaf = mockLeafStyleTarget("B", {
      transition: "transform 170ms cubic-bezier(0.2, 0.8, 0.2, 1)",
      transform: "translate(120px, 0px) scale(0.5, 1)",
    });

    applySurvivorReflowSnapLeafStyles(sourceLeaf);
    applySurvivorReflowSnapLeafStyles(survivorLeaf);

    expect(sourceLeaf.style.transition).toBe("none");
    expect(sourceLeaf.style.transform).toBe("none");
    expect(sourceLeaf.style.transform).not.toContain("translate");
    expect(survivorLeaf.style.transition).toBe("none");
    expect(survivorLeaf.style.transform).toBe("none");
  });
});
