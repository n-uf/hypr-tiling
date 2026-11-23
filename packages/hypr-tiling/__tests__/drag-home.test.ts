/**
 * The lifted pane's home is a drop target for the whole drag: whenever the
 * pointer is inside the pane's place at the lift (its footprint, edges
 * included; for a tab torn off its group, the whole group), the first time or
 * coming back after leaving, the tree a live drag lays out is the original one
 * (its place open, the others where they were), no drop target is resolved
 * (so the cursor is never "invalid" there), and a release puts the layout
 * back. One px past the home's edge the drag is as before: the source is taken
 * out and its gap closes. Once the page moves under the drag, the home is lost
 * for the rest of it.
 */
import { describe, expect, it } from "@jest/globals";
import {
  DRAG_MACHINE_INITIAL_STATE,
  deriveCandidateTree,
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
import { evaluateZoneCandidate } from "../engine/drop-validity";
import { createDragInputDriver, type DragInputDriver } from "../engine/input-driver";
import { resolveLayoutGeometry } from "../engine/leaf-geometry";
import { removeLeafTile } from "../engine/state";
import type {
  TilingDropAction,
  TilingLayoutConfig,
  TilingLayoutNode,
  TilingLeafDropZone,
  TilingPaneFootprint,
} from "../engine/types";

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
        homeHeld: state.phase === "dragging" && state.atHome,
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

  it("holds again whenever the pointer comes back: atHome follows the pointer, leftHome remembers it left", (): void => {
    const h = harness(() => null);
    h.press({ x: 150, y: 110 });
    h.dispatch({ type: "POINTER_MOVE", pointerId: 1, client: { x: 150, y: 251 } });
    const away = h.state();
    if (away.phase !== "dragging") throw new Error("not dragging");
    expect(away.atHome).toBe(false);
    expect(away.leftHome).toBe(true);
    h.dispatch({ type: "POINTER_MOVE", pointerId: 1, client: { x: 150, y: 200 } });
    const back = h.state();
    if (back.phase !== "dragging") throw new Error("not dragging");
    expect(back.atHome).toBe(true);
    expect(back.leftHome).toBe(true);
    expect(isDragHomeHeld(back, { x: 150, y: 200 })).toBe(true);
  });
});

describe("drag home — back home after leaving", (): void => {
  it("the home is a drop target for the whole drag: back over it, nothing is resolved and the original tree is laid out", (): void => {
    // Outside home the gap-closed geometry puts a refused zone under the pane's old place.
    const h = harness(() => target("B", "top", "none", true));
    h.press({ x: 150, y: 110 });
    h.driver.processPointerSample({ x: 150, y: 120 });
    h.driver.processPointerSample({ x: 150, y: 400 });
    expect(h.asked).toEqual([{ x: 150, y: 400 }]);
    // Back over the pane's place at the lift (its header).
    h.driver.processPointerSample({ x: 150, y: 110 });
    const state = h.state();
    if (state.phase !== "dragging") throw new Error("not dragging");
    expect(h.asked).toEqual([{ x: 150, y: 400 }]);
    expect(isDragHomeHeld(state, { x: 150, y: 110 })).toBe(true);
    expect(state.atHome).toBe(true);
    expect(state.resolvedTarget).toBeNull();
    expect(resolveDragCursorPresentation(state.resolvedTarget, "A").kind).not.toBe("invalid");
    expect(h.tree()).toBe(LAYOUT);
    // And out again: the gap closes again, the refused zone shows again.
    h.driver.processPointerSample({ x: 150, y: 400 });
    expect(h.tree()).toEqual(removeLeafTile(LAYOUT, "A"));
    const out = h.state();
    expect(resolveDragCursorPresentation(out.phase === "dragging" ? out.resolvedTarget : null, "A").kind).toBe("invalid");
  });

  it("back home wins over a seat held by the slot commitment", (): void => {
    // The resolver would keep answering B's swap everywhere; home still wins.
    const h = harness(() => target("B", "center", "swap"));
    h.press({ x: 150, y: 110 });
    h.driver.processPointerSample({ x: 150, y: 120 });
    h.driver.processPointerSample({ x: 150, y: 400 });
    expect(h.driver.committableSeat?.leafId).toBe("B");
    h.driver.processPointerSample({ x: 150, y: 240 });
    const state = h.state();
    expect(state.phase === "dragging" && state.resolvedTarget).toBeNull();
    expect(h.driver.committableSeat).toBeNull();
    expect(h.tree()).toBe(LAYOUT);
  });

  it("a release back home restores the layout, even after a committable seat outside", (): void => {
    const h = harness((point) => (point.y > 250 ? target("B", "center", "swap") : null));
    h.press({ x: 150, y: 110 });
    h.driver.processPointerSample({ x: 150, y: 120 });
    h.driver.processPointerSample({ x: 150, y: 400 });
    expect(h.driver.committableSeat?.leafId).toBe("B");
    h.driver.processPointerSample({ x: 150, y: 110 });
    expect(h.driver.committableSeat).toBeNull();
    expect(h.driver.latchRelease()).toBeNull();
    h.driver.processPointerSample({ x: 150, y: 110 }, true);
    h.dispatch({ type: "POINTER_UP", pointerId: 1 });
    const settled = h.state();
    expect(settled.phase === "settling" && settled.outcome).toBe("cancel");
  });
});

describe("drag home — the page moved under the drag", (): void => {
  it("HOME_INVALIDATED loses the home for good: targets resolve again and the gap closes, inside the old rect too", (): void => {
    const h = harness(() => target("B", "center", "swap"));
    h.press({ x: 150, y: 110 });
    h.driver.processPointerSample({ x: 150, y: 120 });
    expect(h.tree()).toBe(LAYOUT);
    h.dispatch({ type: "HOME_INVALIDATED" });
    const state = h.state();
    expect(state.phase === "dragging" && state.homeLost && !state.atHome && state.leftHome).toBe(true);
    expect(h.tree()).toEqual(removeLeafTile(LAYOUT, "A"));
    // Still inside the stale rect: resolved as once the pointer has left.
    h.driver.processPointerSample({ x: 160, y: 130 });
    expect(h.asked).toEqual([{ x: 160, y: 130 }]);
    expect(h.driver.latchRelease()?.leafId).toBe("B");
    h.driver.processPointerSample({ x: 160, y: 130 }, true);
    h.dispatch({ type: "POINTER_UP", pointerId: 1 });
    const settled = h.state();
    expect(settled.phase === "settling" && settled.outcome).toBe("commit");
  });

  it("after the pointer has left, it still loses the home: coming back over the old rect resolves as elsewhere", (): void => {
    const h = harness(() => target("B", "center", "swap"));
    h.press({ x: 150, y: 110 });
    h.driver.processPointerSample({ x: 150, y: 120 });
    h.driver.processPointerSample({ x: 150, y: 400 });
    h.dispatch({ type: "HOME_INVALIDATED" });
    h.driver.processPointerSample({ x: 150, y: 110 });
    expect(h.asked).toEqual([{ x: 150, y: 400 }, { x: 150, y: 110 }]);
    expect(h.tree()).toEqual(removeLeafTile(LAYOUT, "A"));
    const state = h.state();
    expect(state.phase === "dragging" && state.atHome).toBe(false);
  });

  it("is a no-op outside dragging and once the home is lost", (): void => {
    expect(dragMachineReducer(DRAG_MACHINE_INITIAL_STATE, { type: "HOME_INVALIDATED" })).toBe(DRAG_MACHINE_INITIAL_STATE);
    const h = harness(() => null);
    h.press({ x: 150, y: 110 });
    const armed = h.state();
    expect(dragMachineReducer(armed, { type: "HOME_INVALIDATED" })).toBe(armed);
    h.driver.processPointerSample({ x: 150, y: 251 });
    h.dispatch({ type: "HOME_INVALIDATED" });
    const lost = h.state();
    expect(dragMachineReducer(lost, { type: "HOME_INVALIDATED" })).toBe(lost);
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
    // And opens again when the pointer comes back over the old place.
    h.driver.processPointerSample({ x: 150, y: 200 });
    expect(h.tree()).toBe(LAYOUT);
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

/**
 * A column: the dragged subject on top (a tab group of three, dragged whole, or a single pane), short or tall, and
 * pane B below. Once the subject lifts, B grows to fill the column, so the subject's header lies over B's title bar
 * band and the top edge of B's body. There the gap-closed geometry resolves:
 * - over B's title bar: a group merge into B (a host title-bar drop target);
 * - just below it: B's top edge-insert, whose verdict comes from the projected tree. For a group subject that
 *   projection moves only the dragged leaf and leaves the rest of the group at its ratio, so a TALL group leaves too
 *   little room and the edge is refused (the ⊘ cursor), while a short one is valid (a release would commit a new
 *   split, not the old layout).
 * Coming back over the home must beat all of them, at either height.
 */
describe("drag home — back over a column neighbour that grew (short / tall, group / single)", (): void => {
  const AREA = { x: 0, y: 0, width: 360, height: 784 };
  const CONFIG: TilingLayoutConfig = { gapPx: 6, handleSizePx: 4, minPaneSizePx: 180 };
  const TITLE_BAR_PX = 41;
  const column = (subject: "group" | "pane", ratio: number): TilingLayoutNode => ({
    kind: "split",
    id: "col",
    axis: "vertical",
    ratio,
    first:
      subject === "group"
        ? {
            kind: "group",
            id: "g",
            members: [
              { kind: "leaf", id: "A", tileId: "a" },
              { kind: "leaf", id: "P", tileId: "p" },
              { kind: "leaf", id: "S", tileId: "s" },
            ],
            activeMemberId: "A",
          }
        : { kind: "leaf", id: "A", tileId: "a" },
    second: { kind: "leaf", id: "B", tileId: "b" },
  });
  const footprint = (r: { x: number; y: number; width: number; height: number }): TilingPaneFootprint => ({
    left: r.x,
    top: r.y,
    width: r.width,
    height: r.height,
  });

  for (const subject of ["group", "pane"] as const) {
    for (const [height, ratio] of [["short", 0.25], ["tall", 0.7]] as const) {
      it(`${subject}, ${height}: back over its header or over B's grown title bar, home wins and the release restores`, (): void => {
        const layout = column(subject, ratio);
        const home = footprint(resolveLayoutGeometry(layout, AREA, CONFIG).leaves.get("A")!);
        const closed = deriveCandidateTree(layout, "A", null, subject === "group" ? "group" : undefined);
        const grownB = footprint(resolveLayoutGeometry(closed, AREA, CONFIG).leaves.get("B")!);
        // B fills the column once the subject is out.
        expect(grownB.top).toBe(AREA.y);
        expect(grownB.height).toBe(AREA.height);
        // B's top edge as the gap-closed geometry judges it (the drop the pointer met there before).
        const topEdge = evaluateZoneCandidate({
          zone: "top",
          layout,
          sourceLeafId: "A",
          targetLeafId: "B",
          targetFootprint: grownB,
          config: CONFIG,
          viewportWidth: AREA.width,
          viewportHeight: AREA.height,
        });
        expect(topEdge.isValid).toBe(!(subject === "group" && height === "tall"));
        const resolver = (point: DragMachinePoint): DragResolvedTarget | null => {
          if (point.y > AREA.y + AREA.height) return null;
          if (point.y <= grownB.top + TITLE_BAR_PX) return { ...target("B", "center", "group-merge" as TilingDropAction), fallbackReason: "host-group-drop-target" } as DragResolvedTarget;
          if (point.y <= grownB.top + grownB.height / 4) return target("B", "top", topEdge.isValid ? "edge-insert" : "none", !topEdge.isValid);
          return target("B", "center", "swap");
        };
        for (const back of [
          { x: home.left + 150, y: home.top + 20 },
          { x: home.left + 150, y: home.top + 8 },
        ]) {
          let state: DragMachineState = DRAG_MACHINE_INITIAL_STATE;
          const asked: DragMachinePoint[] = [];
          const driver = createDragInputDriver({
            getState: (): DragMachineState => state,
            dispatch: (event: DragMachineEvent): void => {
              state = dragMachineReducer(state, event);
            },
            resolveTarget: (x: number, y: number): DragResolvedTarget | null => {
              asked.push({ x, y });
              return resolver({ x, y });
            },
            capturePointer: (): void => undefined,
            getSlotCommitment: () => ({ mode: "delta-responsive", reresolveDeltaPx: 24 }),
          });
          const press = { x: home.left + 150, y: home.top + 20 };
          state = dragMachineReducer(state, {
            type: "POINTER_DOWN",
            pointerId: 1,
            pointerType: "mouse",
            sourceLeafId: "A",
            ...(subject === "group" ? { subject: "group" as const } : {}),
            anchorFootprint: home,
            pointerAnchorOffset: { x: press.x - home.left, y: press.y - home.top },
            originClient: press,
          });
          driver.processPointerSample({ x: press.x, y: press.y + 10 });
          // Below the column, then over B's lower part (a committable swap is seated).
          driver.processPointerSample({ x: press.x, y: AREA.height + 30 });
          driver.processPointerSample({ x: press.x, y: AREA.height - 40 });
          expect(driver.committableSeat?.action).toBe("swap");
          const askedAway = asked.length;
          // Back: over the header (B's top edge in the gap-closed geometry) or B's grown title bar.
          driver.processPointerSample(back);
          if (state.phase !== "dragging") throw new Error("not dragging");
          expect(asked.length).toBe(askedAway);
          expect(state.atHome).toBe(true);
          expect(state.resolvedTarget).toBeNull();
          expect(resolveDragCursorPresentation(state.resolvedTarget, "A").kind).not.toBe("invalid");
          // The room comes back: the tree laid out is the original one.
          expect(
            deriveLiveDragTree({ layout, sourceLeafId: "A", roomTarget: null, subject: subject === "group" ? "group" : undefined, homeHeld: state.atHome }),
          ).toBe(layout);
          driver.latchRelease();
          driver.processPointerSample(back, true);
          state = dragMachineReducer(state, { type: "POINTER_UP", pointerId: 1 });
          expect(state.phase === "settling" && state.outcome).toBe("cancel");
        }
      });
    }
  }
});
