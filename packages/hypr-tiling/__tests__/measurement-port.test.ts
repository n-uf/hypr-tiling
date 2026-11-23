import { describe, expect, it } from "@jest/globals";
import { createLayoutTilingDrag, tilingDragParts } from "../engine/tiling-drag-tree";
import type { TilingGroupNode, TilingLayoutConfig, TilingLayoutNode, TilingLeafNode, TilingSplitNode } from "../engine/types";
import { hitRun, layoutDrag } from "./golden/cases";

/**
 * The drag hit on synthetic pane geometry, characterized without a DOM. What the pointer holds comes from the drag's
 * hit, built once at the lift over the layout and the pane parts the renderer measured then (the parts are declared
 * geometry: `tilingDragParts` over insets of the pane's slot, as `measureDragPartGeometry` reads them off the
 * `MeasurementPort`). These pin the observable behavior the old pointer-to-target resolution had against injected
 * rects: a hit on another pane, the source's own place, gaps, gated panes, host drop elements and a group the source
 * is already in.
 */

function leaf(id: string, tileId: string): TilingLeafNode {
  return { kind: "leaf", id, tileId };
}

/** A + B side by side under a horizontal split. */
function twoLeafLayout(): TilingSplitNode {
  return {
    kind: "split",
    id: "root",
    axis: "horizontal",
    ratio: 0.5,
    first: leaf("A", "tile-a"),
    second: leaf("B", "tile-b"),
  };
}

const CONFIG: TilingLayoutConfig = { gapPx: 0, handleSizePx: 0, minPaneSizePx: 40 };
// A 400 × 400 stage: A is [0..200] wide, B is [200..400], both full height.
const STAGE = { width: 400, height: 400 };

/** A host drop element on a pane's top: inset 100 px from its left, 60 px from its right, 30 px high. */
const TOP_ELEMENT = { left: 100, top: 0, right: 60, height: 30 };

describe("the drag hit on synthetic geometry — characterization", (): void => {
  it("holds a place on a non-source pane (a centre point is a swap with it)", (): void => {
    const run = hitRun(layoutDrag(twoLeafLayout(), "A", STAGE, CONFIG)!, "lift");
    expect(run.at({ x: 300, y: 200 }).held).toEqual({ kind: "swap", at: "tile-b" });
  });

  it("holds home over the drag source's own place (the source is skipped as a target)", (): void => {
    const run = hitRun(layoutDrag(twoLeafLayout(), "A", STAGE, CONFIG)!, "lift");
    expect(run.at({ x: 100, y: 200 }).held).toEqual({ kind: "home" });
  });

  it("holds nothing in a gap outside every pane", (): void => {
    const run = hitRun(layoutDrag(twoLeafLayout(), "A", STAGE, CONFIG)!, "lift");
    const read = run.at({ x: 500, y: 200 });
    expect(read.held).toBeNull();
    expect(read.refused).toBeNull();
  });

  it("a pane that takes no drop (statically gated) is no target at all: nothing is held or shown refused on it, and a release there is `still`", (): void => {
    const drag = createLayoutTilingDrag({
      layout: twoLeafLayout(),
      sourceLeafId: "A",
      container: STAGE,
      config: CONFIG,
      min: CONFIG.minPaneSizePx,
      still: (tile: string): boolean => tile === "tile-b",
    })!;
    const run = hitRun(drag, "lift");
    const read = run.at({ x: 300, y: 200 });
    expect(read.held).toBeNull();
    expect(read.refused).toBeNull();
    expect(drag.after({ kind: "swap", at: "tile-b" }).refusal).toEqual({ code: "still" });
  });

  it("resolves a host drop element as a join, ahead of the edge band it overlaps", (): void => {
    // (310, 10) is the top edge band of B, which the host element covers: a join with no index, not a side.
    const drag = layoutDrag(twoLeafLayout(), "A", STAGE, CONFIG, undefined, { bands: new Map([["tile-b", [TOP_ELEMENT]]]) })!;
    const read = hitRun(drag, "lift").at({ x: 310, y: 10 });
    expect(read.held).toEqual({ kind: "join", at: "tile-b" });
    // Without the element the same point is B's top side.
    const bare = layoutDrag(twoLeafLayout(), "A", STAGE, CONFIG)!;
    expect(hitRun(bare, "lift").at({ x: 310, y: 10 }).held).toEqual({ kind: "beside", at: "tile-b", side: "top" });
  });

  it("keeps a centre body drop as swap when no host element covers it", (): void => {
    const drag = layoutDrag(twoLeafLayout(), "A", STAGE, CONFIG, undefined, { bands: new Map([["tile-b", [TOP_ELEMENT]]]) })!;
    expect(hitRun(drag, "lift").at({ x: 300, y: 200 }).held).toEqual({ kind: "swap", at: "tile-b" });
  });

  it("keeps an uncovered edge band as a side (across the run; along it, B next to A has no side: its strip is the swap's)", (): void => {
    const drag = layoutDrag(twoLeafLayout(), "A", STAGE, CONFIG, undefined, {
      bands: new Map([["tile-b", [{ left: 0, top: 0, right: 192, height: 8 }]]]),
    })!;
    expect(hitRun(drag, "lift").at({ x: 300, y: 20 }).held).toEqual({ kind: "beside", at: "tile-b", side: "top" });
    // B is the subject's run neighbor: its left strip belongs to the center.
    expect(hitRun(drag, "lift").at({ x: 210, y: 200 }).held).toEqual({ kind: "swap", at: "tile-b" });
  });

  it("ignores the drag source's own host element: its place is home", (): void => {
    const drag = layoutDrag(twoLeafLayout(), "A", STAGE, CONFIG, undefined, { bands: new Map([["tile-a", [{ left: 50, top: 190, right: 70, height: 40 }]]]) })!;
    expect(hitRun(drag, "lift").at({ x: 100, y: 200 }).held).toEqual({ kind: "home" });
  });

  it("a source already in the target group: joining it back changes nothing (a place with the lift's arrangement is home), and its body is refused (self)", (): void => {
    const grouped: TilingGroupNode = {
      kind: "group",
      id: "group-B",
      activeMemberId: "B",
      members: [leaf("B", "tile-b"), leaf("A", "tile-a")],
    };
    const layout: TilingLayoutNode = { kind: "split", id: "root", axis: "horizontal", ratio: 0.5, first: leaf("C", "tile-c"), second: grouped };
    const drag = createLayoutTilingDrag({
      layout,
      sourceLeafId: "A",
      container: STAGE,
      config: CONFIG,
      min: CONFIG.minPaneSizePx,
      parts: tilingDragParts({ bands: new Map([["tile-b", [TOP_ELEMENT]]]) }),
    })!;
    // The group is drawn on the right half as tile-b; A is a tab torn off it.
    // A tab torn off its group leaves no slot open (the group stays drawn): the drag has no home rect of its own.
    expect(drag.home).toBeNull();
    // The host element, joined back to the group it came from, gives the lift's own layout: that place is home.
    expect(drag.after({ kind: "join", at: "tile-b" }).refusal).toBeNull();
    // (The tab joins as the group's active one, so the group is drawn under its key; the panes' rects are the lift's.)
    expect([...drag.after({ kind: "join", at: "tile-b" }).layout.values()]).toEqual([...drag.lift.layout.values()]);
    expect(hitRun(drag, "lift").at({ x: 310, y: 10 }).held).toEqual({ kind: "home" });
    // Its body: a swap with its own group is refused, so nothing is held and the refused place shows.
    const onBody = hitRun(drag, "lift").at({ x: 300, y: 200 });
    expect(onBody.held).toBeNull();
    expect(onBody.refused).toEqual({ kind: "swap", at: "tile-b" });
    expect(drag.after({ kind: "swap", at: "tile-b" }).refusal).toEqual({ code: "self" });
  });
});
