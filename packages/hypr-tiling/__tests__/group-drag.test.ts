/**
 * Dragging a whole tab group (engine half): the group node moves as one —
 * taken out (gap closed), swapped, inserted beside a target, or merged into it
 * (every member joins as a tab, the dragged active tab active) — and the drag
 * machine carries the subject.
 */
import { describe, expect, it } from "@jest/globals";
import {
  DRAG_MACHINE_INITIAL_STATE,
  detachDragSubject,
  dragMachineReducer,
  resolveDragCommitFocusLeafId,
  resolveDragLandingLeafId,
  type DragMachineState,
  type DragResolvedTarget,
} from "../engine/drag-machine";
import { createLayoutTilingDrag } from "../engine/tiling-drag-tree";
import {
  insertGroupAdjacent,
  mergeGroupIntoTarget,
  removeGroupNode,
  swapGroupWithSlot,
} from "../engine/state";
import type { TilingGroupNode, TilingLayoutNode, TilingLeafNode } from "../engine/types";

const leaf = (id: string, tileId: string): TilingLeafNode => ({ kind: "leaf", id, tileId });
const GROUP: TilingGroupNode = {
  kind: "group",
  id: "g",
  members: [leaf("B", "b"), leaf("C", "c")],
  activeMemberId: "C",
};
/** a | (g[b, c*] / d) */
const LAYOUT: TilingLayoutNode = {
  kind: "split",
  id: "root",
  axis: "horizontal",
  ratio: 0.5,
  first: leaf("A", "a"),
  second: { kind: "split", id: "right", axis: "vertical", ratio: 0.5, first: GROUP, second: leaf("D", "d") },
};

const target = (leafId: string, action: DragResolvedTarget["action"], extra: Partial<DragResolvedTarget> = {}): DragResolvedTarget =>
  ({ leafId, action, zone: "center", finalEdge: null, selectedSplitZone: null, ...extra }) as DragResolvedTarget;

function groupOf(node: TilingLayoutNode, id: string): TilingGroupNode | null {
  if (node.kind === "group") return node.id === id ? node : null;
  if (node.kind === "leaf") return null;
  return groupOf(node.first, id) ?? groupOf(node.second, id);
}

describe("whole-group tree moves", (): void => {
  it("removeGroupNode closes the gap the group leaves", (): void => {
    expect(removeGroupNode(LAYOUT, "g")).toEqual({
      kind: "split",
      id: "root",
      axis: "horizontal",
      ratio: 0.5,
      first: leaf("A", "a"),
      second: leaf("D", "d"),
    });
    expect(removeGroupNode(LAYOUT, "missing")).toBe(LAYOUT);
  });

  it("swapGroupWithSlot exchanges the group and the target's slot, both unchanged", (): void => {
    const next = swapGroupWithSlot(LAYOUT, "g", "A");
    expect(next.kind === "split" && next.first).toBe(GROUP);
    expect(next.kind === "split" && next.second.kind === "split" && next.second.first).toEqual(leaf("A", "a"));
  });

  it("insertGroupAdjacent moves the same group beside the target", (): void => {
    const next = insertGroupAdjacent(LAYOUT, "g", "A", "left");
    expect(next.kind).toBe("split");
    if (next.kind !== "split") return;
    // The group left its slot (d fills the right column) and sits left of a.
    expect(next.second).toEqual(leaf("D", "d"));
    expect(next.first.kind === "split" && next.first.first).toBe(GROUP);
    expect(next.first.kind === "split" && next.first.second).toEqual(leaf("A", "a"));
  });

  it("mergeGroupIntoTarget: every member joins, in order, the dragged active tab active", (): void => {
    const intoLeaf = mergeGroupIntoTarget(LAYOUT, "g", "A");
    const made = groupOf(intoLeaf, "group-A");
    expect(made?.members.map((m) => m.id)).toEqual(["A", "B", "C"]);
    expect(made?.activeMemberId).toBe("C");
    const twoGroups: TilingLayoutNode = {
      ...LAYOUT,
      first: { kind: "group", id: "h", members: [leaf("A", "a"), leaf("E", "e")], activeMemberId: "A" },
    } as TilingLayoutNode;
    const intoGroup = mergeGroupIntoTarget(twoGroups, "g", "A", 1);
    const host = groupOf(intoGroup, "h");
    expect(host?.members.map((m) => m.id)).toEqual(["A", "B", "C", "E"]);
    expect(host?.activeMemberId).toBe("C");
    expect(groupOf(intoGroup, "g")).toBeNull();
  });
});

describe("a drag with a group subject", (): void => {
  it("moves the group node: after(swap) is the slot swap, a side keeps the group whole, and the base takes it out", (): void => {
    const drag = createLayoutTilingDrag({
      layout: LAYOUT,
      sourceLeafId: "C",
      subject: "group",
      container: { width: 1000, height: 600 },
      config: { gapPx: 0, minPaneSizePx: 40, handleSizePx: 0 },
    })!;
    expect(drag.base.tree.layout).toEqual(removeGroupNode(LAYOUT, "g"));
    expect(drag.after({ kind: "swap", at: "a" }).tree.layout).toEqual(swapGroupWithSlot(LAYOUT, "g", "A"));
    const beside = drag.after({ kind: "beside", at: "a", side: "left" });
    expect(beside.refusal).toBeNull();
    expect(groupOf(beside.tree.layout!, "g")?.members.map((m) => m.id)).toEqual(["B", "C"]);
  });

  it("a pane subject (or no group) moves the one pane, as before", (): void => {
    expect(detachDragSubject(LAYOUT, "C", "pane")).not.toEqual(removeGroupNode(LAYOUT, "g"));
    expect(detachDragSubject(LAYOUT, "A", "group")).toEqual(detachDragSubject(LAYOUT, "A", "pane"));
  });

  it("the group lands keyed by its active member, which keeps focus", (): void => {
    expect(resolveDragLandingLeafId("C", target("A", "swap"), "group")).toBe("C");
    expect(resolveDragLandingLeafId("C", target("A", "group-merge"), "group")).toBe("C");
    expect(resolveDragLandingLeafId("C", null, "group")).toBeNull();
    expect(resolveDragCommitFocusLeafId("C", target("A", "swap"), "group")).toBe("C");
  });

  it("the landing rect of a group is its whole slot (strip included), the rect of the group it lands as", (): void => {
    const drag = createLayoutTilingDrag({
      layout: LAYOUT,
      sourceLeafId: "C",
      subject: "group",
      container: { width: 1000, height: 600 },
      config: { gapPx: 0, minPaneSizePx: 40, handleSizePx: 0 },
    })!;
    expect(drag.after({ kind: "swap", at: "a" }).landing).toEqual({ x: 0, y: 0, width: 500, height: 600 });
  });
});

describe("drag machine: subject", (): void => {
  const down = {
    type: "POINTER_DOWN" as const,
    pointerId: 1,
    pointerType: "mouse" as const,
    sourceLeafId: "B",
    anchorFootprint: { left: 500, top: 28, width: 500, height: 272 },
    pointerAnchorOffset: { x: 20, y: -14 },
    originClient: { x: 520, y: 14 },
  };

  it("carries the subject from the press to the settle", (): void => {
    let state: DragMachineState = dragMachineReducer(DRAG_MACHINE_INITIAL_STATE, { ...down, sourceLeafId: "C", subject: "group" });
    expect(state.phase === "armed" && state.subject).toBe("group");
    state = dragMachineReducer(state, { type: "POINTER_MOVE", pointerId: 1, client: { x: 540, y: 40 } });
    expect(state.phase === "dragging" && state.subject).toBe("group");
    state = dragMachineReducer(state, { type: "ESCAPE" });
    expect(state.phase === "settling" && state.subject).toBe("group");
  });
});
