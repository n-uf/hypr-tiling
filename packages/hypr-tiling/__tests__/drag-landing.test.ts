import { describe, expect, it } from "@jest/globals";
import { deriveCandidateTree, type DragResolvedTarget } from "../engine/drag-machine";
import { findLeafByTileId, resolveDragLandingRect, resolveTileRect } from "../engine/drag-landing";
import { resolveLeafRects } from "../engine/leaf-geometry";
import type { TilingEdgeZone } from "../engine/drop-intent-resolver";
import type { TilingDropAction, TilingLayoutConfig, TilingLayoutNode } from "../engine/types";

/**
 * Where a dragged pane lands: the drop indicator's rect, the snap slot and the
 * committed layout's rect for the pane all come from the same candidate tree.
 */

const CONFIG: TilingLayoutConfig = { gapPx: 0, minPaneSizePx: 40, handleSizePx: 0 };
const CONTAINER = { width: 1000, height: 600 };

/** A | (B / C) */
const LAYOUT: TilingLayoutNode = {
  kind: "split",
  id: "root",
  axis: "horizontal",
  ratio: 0.5,
  first: { kind: "leaf", id: "A", tileId: "a" },
  second: {
    kind: "split",
    id: "right",
    axis: "vertical",
    ratio: 0.5,
    first: { kind: "leaf", id: "B", tileId: "b" },
    second: { kind: "leaf", id: "C", tileId: "c" },
  },
};

function target(leafId: string, action: TilingDropAction, edge: TilingEdgeZone | null): DragResolvedTarget {
  return {
    leafId,
    zone: edge ?? "center",
    action,
    dominantEdge: edge ?? "right",
    finalEdge: edge,
    fallbackReason: null,
    blockedReason: null,
    axisPath: ["horizontal"],
    edgeThresholdRatio: 0.25,
    centerRectWidthPx: 100,
    centerRectHeightPx: 100,
    centerDistancePx: 0,
    nearestEdgeDistancePx: 0,
    paneLocalX: 0,
    paneLocalY: 0,
    targetSplitId: null,
    targetSplitPlacement: null,
    selectedSplitZone: edge,
    selectedSplitDistancePx: null,
    rejectedSplitReasons: [],
    tuning: { centerRatio: 0.5, edgeThresholdRatio: 0.25, hysteresisPx: 6, devicePixelRatio: 1 },
  };
}

describe("resolveDragLandingRect", (): void => {
  it("edge-insert: the pane's rect in the tree the commit applies (bottom half of B's slot)", (): void => {
    const drop: DragResolvedTarget = target("B", "edge-insert", "bottom");
    const rect = resolveDragLandingRect({ layout: LAYOUT, sourceLeafId: "A", target: drop, container: CONTAINER, config: CONFIG });
    // The others close over A's gap: B / C fill the width; A splits B's half.
    const committed: TilingLayoutNode = deriveCandidateTree(LAYOUT, "A", drop);
    const expected = resolveLeafRects(committed, { x: 0, y: 0, ...CONTAINER }, CONFIG).get("A");
    expect(rect).toEqual(expected);
    expect(rect).toEqual({ x: 0, y: 150, width: 1000, height: 150 });
  });

  it("swap: the pane lands in the target's place in the original layout", (): void => {
    const rect = resolveDragLandingRect({
      layout: LAYOUT,
      sourceLeafId: "A",
      target: target("C", "swap", null),
      container: CONTAINER,
      config: CONFIG,
    });
    expect(rect).toEqual({ x: 500, y: 300, width: 500, height: 300 });
  });

  it("group-merge: the pane joins the target's slot, beside the group's tab strip when it shows", (): void => {
    const drop: DragResolvedTarget = target("C", "group-merge", null);
    const bare = resolveDragLandingRect({ layout: LAYOUT, sourceLeafId: "A", target: drop, container: CONTAINER, config: CONFIG });
    const withStrip = resolveDragLandingRect({
      layout: LAYOUT,
      sourceLeafId: "A",
      target: drop,
      container: CONTAINER,
      config: CONFIG,
      groupStrip: { visible: true, heightPx: 28, placement: "top" },
    });
    expect(bare).not.toBeNull();
    expect(withStrip).toEqual({ x: bare!.x, y: bare!.y + 28, width: bare!.width, height: bare!.height - 28 });
    const below = resolveDragLandingRect({
      layout: LAYOUT,
      sourceLeafId: "A",
      target: drop,
      container: CONTAINER,
      config: CONFIG,
      groupStrip: { visible: true, heightPx: 28, placement: "bottom" },
    });
    expect(below).toEqual({ x: bare!.x, y: bare!.y, width: bare!.width, height: bare!.height - 28 });
  });

  it("no landing for a target that does not commit (none, the source itself, no target)", (): void => {
    const base = { layout: LAYOUT, sourceLeafId: "A", container: CONTAINER, config: CONFIG };
    expect(resolveDragLandingRect({ ...base, target: null })).toBeNull();
    expect(resolveDragLandingRect({ ...base, target: target("A", "swap", null) })).toBeNull();
    expect(resolveDragLandingRect({ ...base, target: target("B", "none", null) })).toBeNull();
    expect(resolveDragLandingRect({ ...base, target: target("B", "edge-insert", null) })).toBeNull();
  });

  it("an unknown source has no landing", (): void => {
    expect(
      resolveDragLandingRect({ layout: LAYOUT, sourceLeafId: "Z", target: target("B", "swap", null), container: CONTAINER, config: CONFIG }),
    ).toBeNull();
  });
});

describe("findLeafByTileId / resolveTileRect", (): void => {
  it("finds the leaf carrying a tile anywhere, groups included", (): void => {
    expect(findLeafByTileId(LAYOUT, "c")?.id).toBe("C");
    expect(findLeafByTileId(LAYOUT, "zz")).toBeNull();
    const grouped: TilingLayoutNode = {
      kind: "group",
      id: "g",
      activeMemberId: "B",
      members: [
        { kind: "leaf", id: "A", tileId: "a" },
        { kind: "leaf", id: "B", tileId: "b" },
      ],
    };
    expect(findLeafByTileId(grouped, "a")?.id).toBe("A");
    // An inactive member is not shown: no rect.
    expect(resolveTileRect(grouped, "a", CONTAINER, CONFIG)).toBeNull();
    expect(resolveTileRect(grouped, "b", CONTAINER, CONFIG)).toEqual({ x: 0, y: 0, width: 1000, height: 600 });
  });
});
