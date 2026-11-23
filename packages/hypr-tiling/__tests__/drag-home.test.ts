/**
 * The lifted pane's home is a place of the drag's hit for the whole drag: the drag hit
 * (`@n-uf/placement/tiling`'s `tilingDrag(...).hit`, built once at the lift) holds home with its one hold rule (the
 * pane's slot at the lift, edges included, then 6 px past an edge), the first time or coming back after leaving. While
 * it does, the drag machine's `atHome` is set from the hit (`TARGET_RESOLVED`), no drop target is resolved (so the
 * cursor is never "invalid" there), a frame draws the layout at the lift (its place open, the others where they were)
 * and a release puts the layout back.
 */
import { describe, expect, it } from "@jest/globals";
import {
  DRAG_MACHINE_INITIAL_STATE,
  dragMachineReducer,
  type DragMachineEvent,
  type DragMachinePoint,
  type DragMachineState,
  type DragResolvedTarget,
} from "../engine/drag-machine";
import { resolveDragCursorPresentation } from "../engine/drag-cursor";
import { createDragInputDriver, type DragInputDriver } from "../engine/input-driver";
import { resolveLayoutGeometry } from "../engine/leaf-geometry";
import { removeLeafTile } from "../engine/state";
import { deriveDropCommitTree } from "../engine/tiling-drag-tree";
import type { TilingHeld } from "@n-uf/placement/tiling";
import type {
  TilingDropAction,
  TilingLayoutConfig,
  TilingLayoutNode,
  TilingLeafDropZone,
  TilingPaneFootprint,
} from "../engine/types";
import { hitRun, layoutDrag } from "./golden/cases";

/** Pane A's place at the lift, as the machine is told it (its footprint anchors the held pane). */
const HOME: TilingPaneFootprint = { left: 100, top: 100, width: 200, height: 150 };

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
    tuning: { centerRatio: 0.5, edgeThresholdRatio: 0.25, devicePixelRatio: 1 },
  } as unknown as DragResolvedTarget;
}

/**
 * The driver over the real reducer. The host answers as the drag hit would: `resolve` is the drop held at a point and
 * `homeAt` says whether home is held there (the hit's `held.kind === "home"`); `asked` records where it was asked.
 */
function harness(resolve: (point: DragMachinePoint) => DragResolvedTarget | null, homeAt: (point: DragMachinePoint) => boolean) {
  let state: DragMachineState = DRAG_MACHINE_INITIAL_STATE;
  const asked: DragMachinePoint[] = [];
  let last: DragMachinePoint = { x: 0, y: 0 };
  const dispatch = (event: DragMachineEvent): void => {
    state = dragMachineReducer(state, event);
  };
  const driver: DragInputDriver = createDragInputDriver({
    getState: (): DragMachineState => state,
    dispatch,
    resolveTarget: (x: number, y: number): DragResolvedTarget | null => {
      asked.push({ x, y });
      last = { x, y };
      return resolve(last);
    },
    heldHome: (): boolean => homeAt(last),
    capturePointer: (): void => undefined,
  });
  const press = (point: DragMachinePoint, pointerType: "mouse" | "touch" = "mouse"): void =>
    dispatch({
      type: "POINTER_DOWN",
      pointerId: 1,
      pointerType,
      sourceLeafId: "A",
      anchorFootprint: HOME,
      pointerAnchorOffset: { x: point.x - HOME.left, y: point.y - HOME.top },
      originClient: point,
    });
  return { driver, asked, press, dispatch, state: (): DragMachineState => state };
}

const insideHome = (p: DragMachinePoint): boolean => p.x >= HOME.left && p.x <= HOME.left + HOME.width && p.y >= HOME.top && p.y <= HOME.top + HOME.height;

describe("drag home — the machine keeps what the hit says", (): void => {
  it("a lifted drag starts at home: atHome is set, leftHome is not, until the hit says otherwise", (): void => {
    const h = harness(() => null, insideHome);
    h.press({ x: 150, y: 110 });
    h.dispatch({ type: "POINTER_MOVE", pointerId: 1, client: { x: 150, y: 400 } });
    const state = h.state();
    if (state.phase !== "dragging") throw new Error("not dragging");
    expect(state.atHome).toBe(true);
    expect(state.leftHome).toBe(false);
  });

  it("a move alone does not change home: only the hit's sample does (the pointer over the old rect is not home)", (): void => {
    const h = harness(() => null, () => false);
    h.press({ x: 150, y: 110 });
    h.dispatch({ type: "POINTER_MOVE", pointerId: 1, client: { x: 150, y: 400 } });
    h.dispatch({ type: "POINTER_MOVE", pointerId: 1, client: { x: 150, y: 120 } });
    const state = h.state();
    if (state.phase !== "dragging") throw new Error("not dragging");
    expect(state.atHome).toBe(true);
    expect(state.leftHome).toBe(false);
  });

  it("TARGET_RESOLVED carries whether the hit holds home: atHome follows it, leftHome remembers it left", (): void => {
    const h = harness(() => null, () => false);
    h.press({ x: 150, y: 110 });
    h.dispatch({ type: "POINTER_MOVE", pointerId: 1, client: { x: 150, y: 120 } });
    h.dispatch({ type: "TARGET_RESOLVED", pointerId: 1, resolvedTarget: null, atHome: false });
    const away = h.state();
    if (away.phase !== "dragging") throw new Error("not dragging");
    expect(away.atHome).toBe(false);
    expect(away.leftHome).toBe(true);
    h.dispatch({ type: "TARGET_RESOLVED", pointerId: 1, resolvedTarget: null, atHome: true });
    const back = h.state();
    if (back.phase !== "dragging") throw new Error("not dragging");
    expect(back.atHome).toBe(true);
    expect(back.leftHome).toBe(true);
  });

  it("a TARGET_RESOLVED without atHome leaves home as it was", (): void => {
    const h = harness(() => null, () => false);
    h.press({ x: 150, y: 110 });
    h.dispatch({ type: "POINTER_MOVE", pointerId: 1, client: { x: 150, y: 120 } });
    h.dispatch({ type: "TARGET_RESOLVED", pointerId: 1, resolvedTarget: null, atHome: false });
    h.dispatch({ type: "TARGET_RESOLVED", pointerId: 1, resolvedTarget: target("B", "center", "swap") });
    const state = h.state();
    if (state.phase !== "dragging") throw new Error("not dragging");
    expect(state.atHome).toBe(false);
    expect(state.resolvedTarget?.leafId).toBe("B");
  });
});

describe("drag home — back home after leaving, through the driver", (): void => {
  it("the home the hit holds resolves no target, even where the resolver would answer one, and the cursor is not invalid", (): void => {
    const h = harness(() => target("B", "top", "none", true), insideHome);
    h.press({ x: 150, y: 110 });
    h.driver.processPointerSample({ x: 150, y: 120 });
    const state = h.state();
    if (state.phase !== "dragging") throw new Error("not dragging");
    expect(state.atHome).toBe(true);
    expect(state.resolvedTarget).toBeNull();
    expect(h.driver.committableSeat).toBeNull();
    expect(resolveDragCursorPresentation(state.resolvedTarget, "A")).toEqual({ kind: "grab", tone: "neutral" });
  });

  it("away from home the target the hit holds is resolved (a refused place shows the invalid cursor)", (): void => {
    const h = harness(() => target("B", "top", "none", true), insideHome);
    h.press({ x: 150, y: 110 });
    h.driver.processPointerSample({ x: 150, y: 120 });
    h.driver.processPointerSample({ x: 150, y: 400 });
    const state = h.state();
    if (state.phase !== "dragging") throw new Error("not dragging");
    expect(state.atHome).toBe(false);
    expect(state.leftHome).toBe(true);
    expect(resolveDragCursorPresentation(state.resolvedTarget, "A").kind).toBe("invalid");
  });

  it("back home wins over a seat: nothing is committable there", (): void => {
    // The resolver would keep answering B's swap everywhere; the hit holding home still wins.
    const h = harness(() => target("B", "center", "swap"), insideHome);
    h.press({ x: 150, y: 110 });
    h.driver.processPointerSample({ x: 150, y: 120 });
    h.driver.processPointerSample({ x: 150, y: 400 });
    expect(h.driver.committableSeat?.leafId).toBe("B");
    h.driver.processPointerSample({ x: 150, y: 240 });
    const state = h.state();
    expect(state.phase === "dragging" && state.resolvedTarget).toBeNull();
    expect(state.phase === "dragging" && state.atHome).toBe(true);
    expect(h.driver.committableSeat).toBeNull();
  });

  it("a release back home restores the layout, even after a committable seat outside", (): void => {
    const h = harness((point) => (point.y > 250 ? target("B", "center", "swap") : null), insideHome);
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

  it("a release at home cancels even over a committable target the resolver answers", (): void => {
    const h = harness(() => target("B", "center", "swap"), insideHome);
    h.press({ x: 150, y: 110 });
    h.driver.processPointerSample({ x: 150, y: 120 });
    h.driver.processPointerSample({ x: 290, y: 240 });
    expect(h.driver.latchRelease()).toBeNull();
    h.driver.processPointerSample({ x: 290, y: 240 }, true);
    h.dispatch({ type: "POINTER_UP", pointerId: 1 });
    const settled = h.state();
    expect(settled.phase === "settling" && settled.outcome).toBe("cancel");
  });

  it("away from home a committable target commits", (): void => {
    const h = harness(() => target("B", "center", "swap"), insideHome);
    h.press({ x: 150, y: 110 });
    h.driver.processPointerSample({ x: 150, y: 120 });
    h.driver.processPointerSample({ x: 150, y: 400 });
    expect(h.driver.latchRelease()?.leafId).toBe("B");
    h.driver.processPointerSample({ x: 150, y: 400 }, true);
    h.dispatch({ type: "POINTER_UP", pointerId: 1 });
    const settled = h.state();
    expect(settled.phase === "settling" && settled.outcome).toBe("commit");
  });

  it("a touch long-press lifts at home: no target until the hit holds something else", (): void => {
    const h = harness(() => target("B", "center", "swap"), insideHome);
    h.press({ x: 150, y: 110 }, "touch");
    h.dispatch({ type: "LONG_PRESS", pointerId: 1 });
    h.driver.captureInitialTarget("A", { x: 150, y: 110 }, 1);
    const state = h.state();
    expect(state.phase === "dragging" && state.atHome).toBe(true);
    expect(state.phase === "dragging" && state.resolvedTarget).toBeNull();
  });

  it("a host that does not say never holds home", (): void => {
    let state: DragMachineState = DRAG_MACHINE_INITIAL_STATE;
    const driver: DragInputDriver = createDragInputDriver({
      getState: (): DragMachineState => state,
      dispatch: (event: DragMachineEvent): void => {
        state = dragMachineReducer(state, event);
      },
      resolveTarget: (): DragResolvedTarget => target("B", "center", "swap"),
      capturePointer: (): void => undefined,
    });
    state = dragMachineReducer(state, {
      type: "POINTER_DOWN",
      pointerId: 1,
      pointerType: "mouse",
      sourceLeafId: "A",
      anchorFootprint: HOME,
      pointerAnchorOffset: { x: 50, y: 10 },
      originClient: { x: 150, y: 110 },
    });
    driver.processPointerSample({ x: 150, y: 120 });
    expect(state.phase === "dragging" && state.atHome).toBe(false);
    expect(driver.committableSeat?.leafId).toBe("B");
  });
});

/** The hit's pane geometry: a 400 × 500 stage, A over B, 6 px gap and 4 px handle. */
const AREA = { x: 0, y: 0, width: 400, height: 500 };
const CONFIG: TilingLayoutConfig = { gapPx: 6, handleSizePx: 4, minPaneSizePx: 96 };

describe("drag home — the drag's hit holds it (both bases)", (): void => {
  const a = resolveLayoutGeometry(LAYOUT, AREA, CONFIG).leaves.get("A")!;
  const inside = [
    { x: a.x, y: a.y },
    { x: a.x + a.width, y: a.y + a.height },
    { x: a.x, y: a.y + a.height },
    { x: a.x + a.width / 2, y: a.y + a.height / 2 },
  ];
  for (const basis of ["lift", "base"] as const) {
    it(`${basis}: holds inside home, edges included, 1 px past an edge, and lets go 7 px past it`, (): void => {
      const run = hitRun(layoutDrag(LAYOUT, "A", AREA, CONFIG)!, basis);
      for (const point of inside) {
        expect(run.at(point).held).toEqual({ kind: "home" });
      }
      expect(run.at({ x: a.x + a.width / 2, y: a.y + a.height + 1 }).held).toEqual({ kind: "home" });
      expect(run.at({ x: a.x + a.width / 2, y: a.y + a.height + 7 }).held).not.toEqual({ kind: "home" });
    });

    it(`${basis}: holds again whenever the pointer comes back`, (): void => {
      const run = hitRun(layoutDrag(LAYOUT, "A", AREA, CONFIG)!, basis);
      const cx = a.x + a.width / 2;
      expect(run.at({ x: cx, y: a.y + 20 }).held).toEqual({ kind: "home" });
      expect(run.at({ x: cx, y: AREA.height - 10 }).held).not.toEqual({ kind: "home" });
      expect(run.at({ x: cx, y: a.y + 20 }).held).toEqual({ kind: "home" });
    });

    it(`${basis}: a release over home commits nothing: the lift comes back`, (): void => {
      const drag = layoutDrag(LAYOUT, "A", AREA, CONFIG)!;
      const run = hitRun(drag, basis);
      const cx = a.x + a.width / 2;
      run.at({ x: cx, y: AREA.height - 10 });
      const read = run.at({ x: cx, y: a.y + 20 });
      expect(read.held).toEqual({ kind: "home" });
      expect(run.hit.release(read).tree).toBe(drag.lift.tree);
    });
  }
});

/**
 * A column: the dragged subject on top (a tab group of three, dragged whole, or a single pane), short or tall, and
 * pane B below with a 41 px title bar that takes a join. On the base basis, once the subject is out, B fills the
 * column, so the subject's header lies over B's grown title bar and the top edge of B's body. Coming back over the
 * home must beat all of them, at either height, on either basis.
 */
describe("drag home — back over a column neighbour that grew (short / tall, group / single)", (): void => {
  const COLUMN_AREA = { x: 0, y: 0, width: 360, height: 784 };
  const COLUMN_CONFIG: TilingLayoutConfig = { gapPx: 6, handleSizePx: 4, minPaneSizePx: 180 };
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

  for (const subject of ["group", "pane"] as const) {
    for (const [height, ratio] of [["short", 0.25], ["tall", 0.7]] as const) {
      for (const basis of ["lift", "base"] as const) {
        it(`${subject}, ${height}, ${basis}: back over its header or over B's grown title bar, home wins and the release restores`, (): void => {
          const layout = column(subject, ratio);
          const drag = layoutDrag(layout, "A", COLUMN_AREA, COLUMN_CONFIG, subject, {
            bands: new Map([["b", [{ left: 0, top: 0, right: 0, height: TITLE_BAR_PX }]]]),
          })!;
          const home = resolveLayoutGeometry(layout, COLUMN_AREA, COLUMN_CONFIG).leaves.get("A")!;
          // In the base B fills the column once the subject is out.
          const grownB = drag.base.layout.get("b")!;
          expect(grownB.y).toBe(COLUMN_AREA.y);
          expect(grownB.height).toBe(COLUMN_AREA.height);
          // B's top edge as the base judges it: the whole subject is released first (a group as its node), so B fills
          // the column and the subject fits above it, short or tall: the place is taken, never a refusal.
          expect(drag.after({ kind: "beside", at: "b", side: "top" }).refusal).toBeNull();
          const x = home.x + 150;
          for (const back of [{ x, y: home.y + 20 }, { x, y: home.y + 8 }]) {
            const run = hitRun(drag, basis);
            run.at({ x, y: home.y + 30 });
            // Below the column, then over B's lower part: the hit holds a place on B.
            run.at({ x, y: COLUMN_AREA.height + 30 });
            const over = run.at({ x, y: COLUMN_AREA.height - 40 });
            expect(over.held != null && over.held.kind !== "home").toBe(true);
            // Back: over the header (B's top edge, where the gap closed) or the top of the subject's own slot.
            const read = run.at(back);
            expect(read.held).toEqual({ kind: "home" });
            expect(run.hit.drawn(read).tree).toBe(drag.lift.tree);
            expect(run.hit.release(read).tree).toBe(drag.lift.tree);
          }
        });
      }
    }
  }
});

describe("drag home — a tab torn off its group", (): void => {
  const GROUP: TilingLayoutNode = {
    kind: "split",
    id: "root",
    axis: "horizontal",
    ratio: 0.5,
    first: { kind: "leaf", id: "A", tileId: "a" },
    second: {
      kind: "group",
      id: "g",
      members: [
        { kind: "leaf", id: "B", tileId: "b" },
        { kind: "leaf", id: "C", tileId: "c" },
      ],
      activeMemberId: "B",
    },
  };

  it("leaves no slot open (the group stays drawn), so there is no home to hold: the drag hit has none", (): void => {
    const drag = layoutDrag(GROUP, "B", AREA, CONFIG)!;
    expect(drag.home).toBeNull();
    const run = hitRun(drag, "lift");
    const g = resolveLayoutGeometry(GROUP, AREA, CONFIG).leaves.get("B")!;
    // Over the group's own body, where the tab came from: it is not home.
    expect(run.at({ x: g.x + g.width / 2, y: g.y + g.height / 2 }).held).not.toEqual({ kind: "home" });
  });
});

describe("drag home — a torn tab released over its own tab cell or its group's body puts the layout back", (): void => {
  const STRIP_PX = 28;
  const TAB_PX = 40;
  for (const size of [2, 3] as const) {
    const members = ["B", "C", "D"].slice(0, size).map((id: string) => ({ kind: "leaf" as const, id, tileId: id.toLowerCase() }));
    for (const torn of ["first", "last"] as const) {
      const index: number = torn === "first" ? 0 : size - 1;
      const tab: string = members[index]!.id;
      it(`a group of ${size}, the ${torn} tab torn: its own cell is home and commits nothing; the body is refused (self) and commits nothing`, (): void => {
        const layout: TilingLayoutNode = {
          kind: "split",
          id: "root",
          axis: "horizontal",
          ratio: 0.5,
          first: { kind: "leaf", id: "A", tileId: "a" },
          second: { kind: "group", id: "g", members, activeMemberId: tab },
        };
        const widths = new Map(members.map((m): [string, number] => [m.tileId, TAB_PX]));
        const drag = layoutDrag(layout, tab, AREA, CONFIG, undefined, { strip: { top: 0, height: STRIP_PX, left: 0, gap: 0, widths } })!;
        const slot = resolveLayoutGeometry(layout, AREA, CONFIG).leaves.get(tab)!;
        const commitOf = (place: TilingHeld<string> | null): TilingLayoutNode | null =>
          deriveDropCommitTree({
            layout,
            sourceLeafId: tab,
            target: place == null ? null : ({ leafId: tab, place } as unknown as DragResolvedTarget),
            container: AREA,
            config: CONFIG,
            drag,
          });

        // Over its own tab cell: the join back at its own index gives the lift's tree back, so it is home.
        const cell = hitRun(drag, "lift").at({ x: slot.x + TAB_PX * index + TAB_PX / 2, y: slot.y + STRIP_PX / 2 });
        expect(cell.held).toEqual({ kind: "home" });
        // The pane the group draws once the tab is out: the other tab of two, else the middle one of three.
        const drawn: string = members[size === 2 ? 1 - index : 1]!.tileId;
        expect(drag.after({ kind: "join", at: drawn, index }).tree.layout).toEqual(layout);
        expect(commitOf(cell.held)).toBeNull();

        // Over the group's body: a swap with its own stack, refused `self`; a release there commits nothing.
        const body = hitRun(drag, "lift").at({ x: slot.x + slot.width / 2, y: slot.y + slot.height / 2 });
        expect(body.held).toBeNull();
        expect(body.refused?.kind).toBe("swap");
        expect(drag.after(body.refused!).refusal?.code).toBe("self");
        expect(commitOf(body.refused)).toBeNull();
      });
    }
  }
});


describe("drag home — the layout a frame draws", (): void => {
  const cx = 200;
  it("at home, on either basis, the lift: the pane's place open, the others where they were", (): void => {
    for (const basis of ["lift", "base"] as const) {
      const drag = layoutDrag(LAYOUT, "A", AREA, CONFIG)!;
      const run = hitRun(drag, basis);
      expect(run.hit.drawn(run.at({ x: cx, y: 100 })).tree).toBe(drag.lift.tree);
    }
  });

  it("Indicator (the lift basis) draws the lift for the whole drag, whatever is held", (): void => {
    const drag = layoutDrag(LAYOUT, "A", AREA, CONFIG)!;
    const run = hitRun(drag, "lift");
    const read = run.at({ x: cx, y: 400 });
    expect(read.held).toEqual({ kind: "swap", at: "b" });
    expect(run.hit.drawn(read).tree).toBe(drag.lift.tree);
    expect(run.hit.drawn(run.at({ x: cx, y: 100 })).tree).toBe(drag.lift.tree);
  });

  it("Snap (the base basis) draws after(held) as soon as a place is held: a swap lands the partner, no waiting", (): void => {
    const drag = layoutDrag(LAYOUT, "A", AREA, CONFIG)!;
    const run = hitRun(drag, "base");
    const read = run.at({ x: cx, y: 400 });
    expect(read.held).toEqual({ kind: "swap", at: "b" });
    const drawn = run.hit.drawn(read);
    expect(drawn.tree).toBe(drag.after({ kind: "swap", at: "b" }).tree);
    expect(drawn.tree.layout?.kind === "split" && drawn.tree.layout.first.kind === "leaf" && drawn.tree.layout.first.tileId).toBe("b");
  });

  it("Snap with nothing held draws the base: the subject taken out, its gap closed", (): void => {
    const drag = layoutDrag(LAYOUT, "A", AREA, CONFIG)!;
    const run = hitRun(drag, "base");
    // Past home, off the stage (the base has B filling it): no place is held there.
    run.at({ x: cx, y: 100 });
    const read = run.at({ x: 450, y: 252 });
    expect(read.held).toBeNull();
    const drawn = run.hit.drawn(read);
    expect(drawn.tree).toBe(drag.base.tree);
    expect(drawn.tree.layout).toEqual(removeLeafTile(LAYOUT, "A"));
  });
});
