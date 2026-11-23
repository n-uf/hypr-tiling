/**
 * The home of a lift that leaves no gap. A tab torn off a group that stays empties nothing: the group keeps its
 * place, with one tab fewer. Its home (the whole group frame) holds only until the pointer first leaves it; from then
 * on the group's own strip, the edges of its remaining pane and that pane itself are ordinary drop targets, as in
 * 26.11.9. A lift that empties its place (a pane on its own, a whole group) keeps its home for the whole drag.
 *
 * Driven through the input driver with the renderer's own pointer resolution (`resolvePointerTargetFromMeasurement`)
 * over synthetic rects: A on the left, the group g[B, C*] on the right (500..1000 × 0..600, strip 0..28).
 */
import { describe, expect, it } from "@jest/globals";
import {
  DEFAULT_TILING_LAYOUT_CONFIG,
  resolvePointerTargetFromMeasurement,
  resolveStableDragHitFootprints,
} from "../react/tiling-renderer";
import {
  DRAG_MACHINE_INITIAL_STATE,
  deriveCandidateTree,
  dragLiftLeavesGap,
  dragMachineReducer,
  isDragHomeHeld,
  type DragMachinePoint,
  type DragMachineState,
  type DragSubject,
} from "../engine/drag-machine";
import { createDragInputDriver } from "../engine/input-driver";
import { resolveInteractionCapabilities } from "../engine/interaction-capabilities";
import type { MeasurementPort } from "../engine/measurement-port";
import type { TilingLayoutNode, TilingPaneFootprint } from "../engine/types";

const VIEWPORT = { width: 1000, height: 600 };
const CONFIG = DEFAULT_TILING_LAYOUT_CONFIG;
const CAPS = resolveInteractionCapabilities(undefined);
const GROUP_FRAME: TilingPaneFootprint = { left: 500, top: 0, width: 500, height: 600 };
const PANE: TilingPaneFootprint = { left: 500, top: 28, width: 500, height: 572 };

const LAYOUT: TilingLayoutNode = {
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
    activeMemberId: "C",
  },
};

function domRect(left: number, top: number, width: number, height: number): DOMRect {
  return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: (): unknown => ({}) } as DOMRect;
}

const PORT: MeasurementPort = {
  measureViewportRect: (): DOMRect | null => domRect(0, 0, VIEWPORT.width, VIEWPORT.height),
  measureLeafRect: (): DOMRect | null => null,
  measureGroupTabStripRect: (groupId: string): DOMRect | null => (groupId === "g" ? domRect(500, 0, 500, 28) : null),
  measureGroupTabMemberRects: (groupId: string) =>
    groupId === "g"
      ? [
          { index: 0, left: 500, top: 0, right: 600, bottom: 28 },
          { index: 1, left: 600, top: 0, right: 700, bottom: 28 },
        ]
      : [],
  measureGroupDropTargetRects: (): ReadonlyArray<DOMRect> => [],
  readComputedTransform: (): string | null => null,
};

const ORIGINAL = new Map<string, TilingPaneFootprint>([
  ["A", { left: 0, top: 0, width: 495, height: 600 }],
  ["C", PANE],
]);

/** Tear `B` off by its tab (or, with `subject: "group"`, drag the group by its strip), then visit `path` and release. */
function drag(path: DragMachinePoint[], subject: DragSubject = "pane"): { settled: DragMachineState; tree: TilingLayoutNode; states: DragMachineState[] } {
  const sourceLeafId = subject === "group" ? "C" : "B";
  const live = resolveStableDragHitFootprints(true, LAYOUT, sourceLeafId, VIEWPORT, CONFIG, ORIGINAL, subject);
  let state: DragMachineState = DRAG_MACHINE_INITIAL_STATE;
  const driver = createDragInputDriver({
    getState: (): DragMachineState => state,
    dispatch: (event): void => {
      state = dragMachineReducer(state, event);
    },
    resolveTarget: (x, y, source, previous) =>
      resolvePointerTargetFromMeasurement(PORT, {
        clientX: x,
        clientY: y,
        sourceLeafId: source,
        subject,
        previousTarget: previous,
        isRearrangeEnabled: true,
        groupingEnabled: CAPS.grouping.enable,
        dropHitZoneGeometry: CAPS.dropHitZoneGeometry,
        liveDragModeEnabled: true,
        liveHitFootprintsById: live,
        leafFootprintsById: ORIGINAL,
        leafIds: ["A", "C"],
        rearrangeGatedLeafIds: new Set<string>(),
        layout: LAYOUT,
        config: CONFIG,
        viewportSize: VIEWPORT,
      }),
    capturePointer: (): void => undefined,
    getSlotCommitment: () => ({ mode: "delta-responsive", reresolveDeltaPx: 24 }),
  });
  const press: DragMachinePoint = subject === "group" ? { x: 900, y: 14 } : { x: 550, y: 14 };
  const anchor: TilingPaneFootprint = subject === "group" ? GROUP_FRAME : PANE;
  state = dragMachineReducer(state, {
    type: "POINTER_DOWN",
    pointerId: 1,
    pointerType: "mouse",
    sourceLeafId,
    subject,
    ...(subject === "group" ? {} : { homeFootprint: GROUP_FRAME }),
    liftLeavesGap: dragLiftLeavesGap(LAYOUT, sourceLeafId, subject),
    anchorFootprint: anchor,
    pointerAnchorOffset: { x: press.x - anchor.left, y: press.y - anchor.top },
    originClient: press,
  });
  const states: DragMachineState[] = [];
  for (const point of [{ x: press.x + 10, y: press.y + 10 }, ...path]) {
    driver.processPointerSample(point);
    states.push(state);
  }
  const lastPoint = path[path.length - 1]!;
  driver.latchRelease();
  driver.processPointerSample(lastPoint, true);
  const released = state;
  const target = released.phase === "dragging" ? released.resolvedTarget : null;
  state = dragMachineReducer(state, { type: "POINTER_UP", pointerId: 1 });
  return { settled: state, tree: deriveCandidateTree(LAYOUT, sourceLeafId, target, subject), states };
}

const OVER_A: DragMachinePoint = { x: 250, y: 300 };

describe("drag home — a lift that leaves no gap (a tab torn off a group that stays)", (): void => {
  it("the rule: a pane on its own or a whole group empties its place; a torn tab does not", (): void => {
    expect(dragLiftLeavesGap(LAYOUT, "A", "pane")).toBe(true);
    expect(dragLiftLeavesGap(LAYOUT, "B", "group")).toBe(true);
    expect(dragLiftLeavesGap(LAYOUT, "B", "pane")).toBe(false);
  });

  it("holds over the whole group until the pointer first leaves, then never again", (): void => {
    const { states } = drag([{ x: 760, y: 300 }, OVER_A, { x: 760, y: 300 }]);
    const atHome = states.map((s) => (s.phase === "dragging" ? s.atHome === true : null));
    expect(atHome).toEqual([true, true, false, false]);
    const last = states[states.length - 1]!;
    if (last.phase !== "dragging") throw new Error("not dragging");
    expect(isDragHomeHeld(last, { x: 760, y: 300 })).toBe(false);
  });

  it("back over the remaining pane's bottom edge, the release commits the edge insert (C-bottom)", (): void => {
    const { settled, tree } = drag([OVER_A, { x: 752, y: 562 }]);
    expect(settled.phase === "settling" && settled.outcome).toBe("commit");
    const target = settled.phase === "settling" ? settled.resolvedTarget : null;
    expect([target?.leafId, target?.zone, target?.action]).toEqual(["C", "bottom", "edge-insert"]);
    expect(tree).not.toEqual(LAYOUT);
  });

  it("a drop on its own strip merges it back at that tab's index", (): void => {
    const { settled, tree } = drag([OVER_A, { x: 690, y: 14 }]);
    expect(settled.phase === "settling" && settled.outcome).toBe("commit");
    const target = settled.phase === "settling" ? settled.resolvedTarget : null;
    expect([target?.leafId, target?.action, target?.memberInsertIndex]).toEqual(["C", "group-merge", 1]);
    // The commit is the reorder that index asks for (the strip's own reducer), with both tabs still in the group.
    expect(tree.kind === "split" && tree.second.kind === "group" && [...tree.second.members.map((m) => m.id)].sort()).toEqual(["B", "C"]);
  });

  it("a swap with the group's last remaining pane works", (): void => {
    const { settled, tree } = drag([OVER_A, { x: 750, y: 300 }]);
    expect(settled.phase === "settling" && settled.outcome).toBe("commit");
    const target = settled.phase === "settling" ? settled.resolvedTarget : null;
    expect([target?.leafId, target?.action]).toEqual(["C", "swap"]);
    expect(tree.kind === "split" && tree.second.kind === "group" && tree.second.members.map((m) => m.tileId)).toEqual(["c", "b"]);
  });

  it("a release over the group before ever leaving still puts the layout back", (): void => {
    const { settled } = drag([{ x: 752, y: 562 }]);
    expect(settled.phase === "settling" && settled.outcome).toBe("cancel");
  });

  it("a whole group dragged by its strip empties its place: back over it after leaving, the release cancels", (): void => {
    const { settled } = drag([OVER_A, { x: 752, y: 300 }], "group");
    expect(settled.phase === "settling" && settled.outcome).toBe("cancel");
  });
});
