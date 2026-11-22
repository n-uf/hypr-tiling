/**
 * The lifted pane's home holds until the pointer first leaves it: while the
 * pointer is inside the pane's place at the lift (its footprint, edges
 * included; for a tab torn off its group, the whole group), the tree a live
 * drag lays out is the original one (its place stays open, nothing moves), no
 * drop target is resolved (so the cursor is never "invalid" there), and a
 * release puts the layout back. One px past the home's edge the drag is as
 * before: the source is taken out and its gap closes.
 */
import { describe, expect, it } from "@jest/globals";
import {
  DRAG_MACHINE_INITIAL_STATE,
  deriveLiveDragTree,
  dragHomeFootprint,
  dragMachineReducer,
  isDragHomeHeld,
  type DragMachineEvent,
  type DragMachinePoint,
  type DragMachineState,
  type DragResolvedTarget,
} from "../engine/drag-machine";
import { resolveDragCursorPresentation } from "../engine/drag-cursor";
import { createDragInputDriver, type DragInputDriver } from "../engine/input-driver";
import { removeLeafTile } from "../engine/state";
import type { TilingDropAction, TilingLayoutNode, TilingLeafDropZone, TilingPaneFootprint } from "../engine/types";

/** Pane A's place at the lift. */
const HOME: TilingPaneFootprint = { left: 100, top: 100, width: 200, height: 150 };
/** Its group, for a tab torn off it. */
const GROUP_HOME: TilingPaneFootprint = { left: 100, top: 72, width: 200, height: 178 };

const LAYOUT: TilingLayoutNode = {
  kind: "split",
  id: "root",
  axis: "vertical",
  ratio: 0.5,
  first: { kind: "leaf", id: "A", tileId: "a" },
  second: { kind: "leaf", id: "B", tileId: "b" },
};

function target(leafId: string, zone: TilingLeafDropZone, action: TilingDropAction, blocked = false): DragResolvedTarget {
  return {
    leafId,
    zone,
    action,
    dominantEdge: "right",
    finalEdge: zone === "center" ? null : "right",
    fallbackReason: null,
    blockedReason: blocked ? "target-too-small" : null,
    axisPath: ["vertical"],
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
  } as unknown as DragResolvedTarget;
}

/** The driver over the real reducer, with a scripted resolver that records where it was asked. */
function harness(resolve: (point: DragMachinePoint) => DragResolvedTarget | null, homeFootprint?: TilingPaneFootprint) {
  let state: DragMachineState = DRAG_MACHINE_INITIAL_STATE;
  const asked: DragMachinePoint[] = [];
  const dispatch = (event: DragMachineEvent): void => {
    state = dragMachineReducer(state, event);
  };
  const driver: DragInputDriver = createDragInputDriver({
    getState: (): DragMachineState => state,
    dispatch,
    resolveTarget: (x: number, y: number): DragResolvedTarget | null => {
      asked.push({ x, y });
      return resolve({ x, y });
    },
    capturePointer: (): void => undefined,
    getSlotCommitment: () => ({ mode: "delta-responsive", reresolveDeltaPx: 24 }),
  });
  const press = (point: DragMachinePoint, pointerType: "mouse" | "touch" = "mouse"): void =>
    dispatch({
      type: "POINTER_DOWN",
      pointerId: 1,
      pointerType,
      sourceLeafId: "A",
      ...(homeFootprint != null ? { homeFootprint } : {}),
      anchorFootprint: HOME,
      pointerAnchorOffset: { x: point.x - HOME.left, y: point.y - HOME.top },
      originClient: point,
    });
  return {
    driver,
    asked,
    press,
    dispatch,
    state: (): DragMachineState => state,
    /** The tree the live drag lays out now (no room target). */
    tree: (): TilingLayoutNode =>
      deriveLiveDragTree({
        layout: LAYOUT,
        sourceLeafId: state.phase === "dragging" ? state.sourceLeafId : null,
        roomTarget: null,
        homeHeld: state.phase === "dragging" && !state.leftHome,
      }),
  };
}

describe("drag home — the rule", (): void => {
  it("home is homeFootprint when given (a torn tab's group), else anchorFootprint", (): void => {
    expect(dragHomeFootprint({ anchorFootprint: HOME })).toBe(HOME);
    expect(dragHomeFootprint({ homeFootprint: GROUP_HOME, anchorFootprint: HOME })).toBe(GROUP_HOME);
  });

  it("holds inside home, edges included, and lets go 1 px past an edge", (): void => {
    const h = harness(() => null);
    h.press({ x: 150, y: 110 });
    const armed = h.state();
    if (armed.phase !== "armed") throw new Error("not armed");
    for (const inside of [{ x: 100, y: 100 }, { x: 300, y: 250 }, { x: 100, y: 250 }, { x: 200, y: 175 }]) {
      expect(isDragHomeHeld(armed, inside)).toBe(true);
    }
    for (const past of [{ x: 99, y: 175 }, { x: 301, y: 175 }, { x: 200, y: 99 }, { x: 200, y: 251 }]) {
      expect(isDragHomeHeld(armed, past)).toBe(false);
    }
  });

  it("never holds again once the pointer has left: from then on the drag is as before", (): void => {
    const h = harness(() => null);
    h.press({ x: 150, y: 110 });
    h.dispatch({ type: "POINTER_MOVE", pointerId: 1, client: { x: 150, y: 251 } });
    h.dispatch({ type: "POINTER_MOVE", pointerId: 1, client: { x: 150, y: 200 } });
    const state = h.state();
    if (state.phase !== "dragging") throw new Error("not dragging");
    expect(state.leftHome).toBe(true);
    expect(isDragHomeHeld(state, { x: 150, y: 200 })).toBe(false);
  });
});

describe("drag home — the candidate tree", (): void => {
  it("while inside home the tree is the original (the same object): the pane's place stays open", (): void => {
    const h = harness(() => target("B", "center", "swap"));
    h.press({ x: 150, y: 110 });
    h.driver.processPointerSample({ x: 150, y: 120 });
    expect(h.state().phase).toBe("dragging");
    expect(h.tree()).toBe(LAYOUT);
    // Down to home's bottom edge: still home.
    h.driver.processPointerSample({ x: 150, y: 250 });
    expect(h.tree()).toBe(LAYOUT);
  });

  it("one px past home's edge the source is taken out and its gap closes, as before", (): void => {
    const h = harness(() => null);
    h.press({ x: 150, y: 110 });
    h.driver.processPointerSample({ x: 150, y: 120 });
    h.driver.processPointerSample({ x: 150, y: 251 });
    expect(h.tree()).toEqual(removeLeafTile(LAYOUT, "A"));
    // And stays closed when the pointer comes back over the old place.
    h.driver.processPointerSample({ x: 150, y: 200 });
    expect(h.tree()).toEqual(removeLeafTile(LAYOUT, "A"));
  });

  it("a room target outside home lays out the candidate tree, as before", (): void => {
    const tree = deriveLiveDragTree({ layout: LAYOUT, sourceLeafId: "A", roomTarget: target("B", "center", "swap"), homeHeld: false });
    expect(tree).not.toBe(LAYOUT);
    expect(tree.kind === "split" && tree.first.kind === "leaf" && tree.first.tileId).toBe("b");
  });
});

describe("drag home — no target, no invalid cursor, release restores", (): void => {
  it("inside home no target is resolved, even where the gap-closed geometry has a refused zone", (): void => {
    const h = harness(() => target("B", "top", "none", true));
    h.press({ x: 150, y: 110 });
    h.driver.processPointerSample({ x: 150, y: 120 });
    h.driver.processPointerSample({ x: 160, y: 200 });
    expect(h.asked).toEqual([]);
    const state = h.state();
    expect(state.phase === "dragging" && state.resolvedTarget).toBeNull();
    expect(h.driver.committableSeat).toBeNull();
    expect(resolveDragCursorPresentation(null, "A")).toEqual({ kind: "grab", tone: "neutral" });
  });

  it("outside home the resolution is as before (the refused zone shows)", (): void => {
    const h = harness(() => target("B", "top", "none", true));
    h.press({ x: 150, y: 110 });
    h.driver.processPointerSample({ x: 150, y: 120 });
    h.driver.processPointerSample({ x: 150, y: 251 });
    expect(h.asked).toEqual([{ x: 150, y: 251 }]);
    const state = h.state();
    const resolved = state.phase === "dragging" ? state.resolvedTarget : null;
    expect(resolveDragCursorPresentation(resolved, "A").kind).toBe("invalid");
  });

  it("a release inside home cancels: the layout as it was at the lift comes back", (): void => {
    const h = harness(() => target("B", "center", "swap"));
    h.press({ x: 150, y: 110 });
    h.driver.processPointerSample({ x: 150, y: 120 });
    h.driver.processPointerSample({ x: 290, y: 240 });
    expect(h.driver.latchRelease()).toBeNull();
    h.driver.processPointerSample({ x: 290, y: 240 }, true);
    h.dispatch({ type: "POINTER_UP", pointerId: 1 });
    const settled = h.state();
    expect(settled.phase === "settling" && settled.outcome).toBe("cancel");
  });

  it("a touch long-press lifts at home: no target until the finger leaves", (): void => {
    const h = harness(() => target("B", "center", "swap"));
    h.press({ x: 150, y: 110 }, "touch");
    h.dispatch({ type: "LONG_PRESS", pointerId: 1 });
    h.driver.captureInitialTarget("A", { x: 150, y: 110 }, 1);
    expect(h.asked).toEqual([]);
    const state = h.state();
    expect(state.phase === "dragging" && state.resolvedTarget).toBeNull();
    expect(h.tree()).toBe(LAYOUT);
  });

  it("a tab torn off its group holds over the whole group (its strip included)", (): void => {
    const h = harness(() => target("B", "center", "swap"), GROUP_HOME);
    h.press({ x: 150, y: 110 });
    h.driver.processPointerSample({ x: 150, y: 80 });
    expect(h.asked).toEqual([]);
    expect(h.tree()).toBe(LAYOUT);
    h.driver.processPointerSample({ x: 150, y: 71 });
    expect(h.asked).toEqual([{ x: 150, y: 71 }]);
  });
});
