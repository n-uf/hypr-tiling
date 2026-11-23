/**
 * The home of a lift that leaves no gap. A tab torn off a group that stays empties nothing: the group keeps its
 * place, with one tab fewer. Its home (the whole group frame) holds only until the pointer first leaves it; from then
 * on the group's own strip, the edges of its remaining pane and that pane itself are ordinary drop targets, as in
 * 26.11.9. A lift that empties its place (a pane on its own, a whole group) keeps its home for the whole drag.
 *
 * Driven through the input driver with the renderer's own pointer resolution (`resolvePointerTargetFromMeasurement`)
 * over synthetic rects: A on the left, the group on the right (500..1000 × 0..600, strip 0..28, C active), with two
 * tabs (B, C: tearing B leaves C alone, without a strip) or three (B, C, D: the strip of C, D stays).
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

/** A on the left; on the right the group of `tabs`, C active. */
function withGroup(tabs: readonly string[]): TilingLayoutNode {
  return {
    kind: "split",
    id: "root",
    axis: "horizontal",
    ratio: 0.5,
    first: { kind: "leaf", id: "A", tileId: "a" },
    second: {
      kind: "group",
      id: "g",
      members: tabs.map((id) => ({ kind: "leaf" as const, id, tileId: id.toLowerCase() })),
      activeMemberId: "C",
    },
  };
}

const TWO_TABS: TilingLayoutNode = withGroup(["B", "C"]);
const THREE_TABS: TilingLayoutNode = withGroup(["B", "C", "D"]);

function domRect(left: number, top: number, width: number, height: number): DOMRect {
  return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: (): unknown => ({}) } as DOMRect;
}

/**
 * The page as the live drag draws it: a strip of `strip` tabs (100 px each from x = 500), or none; with no strip,
 * C's title bar (the frame's top 41 px) is a host group-drop target, as the home page's panes have.
 */
function port(strip: readonly string[]): MeasurementPort {
  return {
    measureViewportRect: (): DOMRect | null => domRect(0, 0, VIEWPORT.width, VIEWPORT.height),
    measureLeafRect: (): DOMRect | null => null,
    measureGroupTabStripRect: (groupId: string): DOMRect | null =>
      groupId === "g" && strip.length > 0 ? domRect(500, 0, 500, 28) : null,
    measureGroupTabMemberRects: (groupId: string) =>
      groupId === "g" ? strip.map((_, index) => ({ index, left: 500 + index * 100, top: 0, right: 600 + index * 100, bottom: 28 })) : [],
    measureGroupDropTargetRects: (leafId: string): ReadonlyArray<DOMRect> =>
      leafId === "C" && strip.length === 0 ? [domRect(500, 0, 500, 41)] : [],
    readComputedTransform: (): string | null => null,
  };
}

const ORIGINAL = new Map<string, TilingPaneFootprint>([
  ["A", { left: 0, top: 0, width: 495, height: 600 }],
  ["C", PANE],
]);

/**
 * Tear `B` off `layout` by its tab (or, with `subject: "group"`, drag the whole group by its strip), then visit
 * `path` and release. The live strip is what stays: C, D for three tabs, none for two; a whole group keeps its own.
 */
function drag(
  path: DragMachinePoint[],
  options: { subject?: DragSubject; layout?: TilingLayoutNode } = {},
): { settled: DragMachineState; tree: TilingLayoutNode; states: DragMachineState[] } {
  const subject: DragSubject = options.subject ?? "pane";
  const layout: TilingLayoutNode = options.layout ?? TWO_TABS;
  const tabs: string[] = layout.kind === "split" && layout.second.kind === "group" ? layout.second.members.map((m) => m.id) : [];
  const strip: string[] = subject === "group" ? tabs : tabs.length > 2 ? tabs.filter((id) => id !== "B") : [];
  const measurement: MeasurementPort = port(strip);
  const sourceLeafId = subject === "group" ? "C" : "B";
  const live = resolveStableDragHitFootprints(true, layout, sourceLeafId, VIEWPORT, CONFIG, ORIGINAL, subject);
  let state: DragMachineState = DRAG_MACHINE_INITIAL_STATE;
  const driver = createDragInputDriver({
    getState: (): DragMachineState => state,
    dispatch: (event): void => {
      state = dragMachineReducer(state, event);
    },
    resolveTarget: (x, y, source, previous) =>
      resolvePointerTargetFromMeasurement(measurement, {
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
        layout,
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
    liftLeavesGap: dragLiftLeavesGap(layout, sourceLeafId, subject),
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
  return { settled: state, tree: deriveCandidateTree(layout, sourceLeafId, target, subject), states };
}

const OVER_A: DragMachinePoint = { x: 250, y: 300 };
const settledTarget = (settled: DragMachineState) => (settled.phase === "settling" ? settled.resolvedTarget : null);
const groupMembers = (tree: TilingLayoutNode): string[] | false =>
  tree.kind === "split" && tree.second.kind === "group" && tree.second.members.map((m) => m.id);

describe("drag home — a lift that leaves no gap (a tab torn off a group that stays)", (): void => {
  it("the rule: a pane on its own or a whole group empties its place; a tab of a group of 2 or 3 does not", (): void => {
    expect(dragLiftLeavesGap(TWO_TABS, "A", "pane")).toBe(true);
    expect(dragLiftLeavesGap(TWO_TABS, "B", "group")).toBe(true);
    expect(dragLiftLeavesGap(THREE_TABS, "B", "group")).toBe(true);
    expect(dragLiftLeavesGap(TWO_TABS, "B", "pane")).toBe(false);
    expect(dragLiftLeavesGap(THREE_TABS, "B", "pane")).toBe(false);
  });

  it("holds over the whole group until the pointer first leaves, then never again", (): void => {
    const { states } = drag([{ x: 760, y: 300 }, OVER_A, { x: 760, y: 300 }]);
    const atHome = states.map((s) => (s.phase === "dragging" ? s.atHome === true : null));
    expect(atHome).toEqual([true, true, false, false]);
    const last = states[states.length - 1]!;
    if (last.phase !== "dragging") throw new Error("not dragging");
    expect(isDragHomeHeld(last, { x: 760, y: 300 })).toBe(false);
  });

  for (const [tabs, layout] of [["2", TWO_TABS], ["3", THREE_TABS]] as const) {
    it(`${tabs} tabs: back over the remaining pane's bottom edge, the release commits the edge insert (C-bottom)`, (): void => {
      const { settled, tree } = drag([OVER_A, { x: 752, y: 562 }], { layout });
      expect(settled.phase === "settling" && settled.outcome).toBe("commit");
      const target = settledTarget(settled);
      expect([target?.leafId, target?.zone, target?.action]).toEqual(["C", "bottom", "edge-insert"]);
      expect(tree).not.toEqual(layout);
    });

    it(`${tabs} tabs: a swap with the group's remaining active pane works`, (): void => {
      const { settled, tree } = drag([OVER_A, { x: 750, y: 300 }], { layout });
      expect(settled.phase === "settling" && settled.outcome).toBe("commit");
      const target = settledTarget(settled);
      expect([target?.leafId, target?.action]).toEqual(["C", "swap"]);
      expect(tree.kind === "split" && tree.second.kind === "group" && tree.second.members.map((m) => m.tileId)).toEqual(
        tabs === "2" ? ["c", "b"] : ["c", "b", "d"],
      );
    });

    it(`${tabs} tabs: a release over the group before ever leaving still puts the layout back`, (): void => {
      const { settled } = drag([{ x: 752, y: 562 }], { layout });
      expect(settled.phase === "settling" && settled.outcome).toBe("cancel");
    });
  }

  it("3 tabs: a drop on its own strip resolves a merge at that tab's index, and commits", (): void => {
    // The strip left is C, D; D's tab (index 1) at 600..700.
    const { settled, tree } = drag([OVER_A, { x: 650, y: 14 }], { layout: THREE_TABS });
    expect(settled.phase === "settling" && settled.outcome).toBe("commit");
    const target = settledTarget(settled);
    expect([target?.leafId, target?.action, target?.fallbackReason, target?.memberInsertIndex]).toEqual([
      "C",
      "group-merge",
      "group-tab-strip",
      1,
    ]);
    // The commit is `addLeafToGroup`'s, unchanged since 26.11.9: B is still a member of the group in the tree at the
    // lift, so the merge leaves the tree as it was (same reference); it does not reorder the tabs.
    expect(tree).toBe(THREE_TABS);
    expect(groupMembers(tree)).toEqual(["B", "C", "D"]);
  });

  it("2 tabs: C is alone once B is torn off, with no strip; over C's title bar the drop is C's top edge, never home", (): void => {
    // C's title bar is a host group-drop target, but C's group (in the tree at the lift) still lists B, so the
    // resolver skips it as a merge B is already in; the pointer is over C's top edge, a valid insert above C.
    const { settled, tree } = drag([OVER_A, { x: 750, y: 20 }]);
    expect(settled.phase === "settling" && settled.outcome).toBe("commit");
    const target = settledTarget(settled);
    expect([target?.leafId, target?.zone, target?.action]).toEqual(["C", "top", "edge-insert"]);
    expect(tree).not.toEqual(TWO_TABS);
  });

  it("a whole group dragged by its strip empties its place: back over it after leaving, the release cancels", (): void => {
    const { settled } = drag([OVER_A, { x: 752, y: 300 }], { subject: "group" });
    expect(settled.phase === "settling" && settled.outcome).toBe("cancel");
  });
});
