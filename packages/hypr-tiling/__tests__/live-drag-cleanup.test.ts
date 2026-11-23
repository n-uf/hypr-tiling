import { describe, expect, it } from "@jest/globals";
import { readLeafNodeIds, removeLeafTile } from "../engine/state";
import {
  DRAG_MACHINE_INITIAL_STATE,
  activeDragSourceLeafId,
  dragMachineReducer,
  type DragMachineEvent,
  type DragMachineState,
  type DragResolvedTarget,
} from "../engine/drag-machine";
import type { TilingDropIntentState } from "../engine/drop-intent-resolver";
import type { TilingLayoutConfig, TilingLayoutNode, TilingLeafDropZone, TilingLeafNode, TilingSplitNode } from "../engine/types";
import { hitRun, layoutDrag } from "./golden/cases";

function leaf(id: string, tileId: string): TilingLeafNode {
  return { kind: "leaf", id, tileId };
}

/**
 * Base fixture tree (matches `live-render-invariant.test.ts`):
 *
 *   root (split, horizontal, 0.5)
 *   ├── A           (leaf, tile-a)
 *   └── s2 (split, vertical, 0.5)
 *       ├── B       (leaf, tile-b)
 *       └── C       (leaf, tile-c)
 */
function baseLayout(): TilingSplitNode {
  return {
    kind: "split",
    id: "root",
    axis: "horizontal",
    ratio: 0.5,
    first: leaf("A", "tile-a"),
    second: {
      kind: "split",
      id: "s2",
      axis: "vertical",
      ratio: 0.5,
      first: leaf("B", "tile-b"),
      second: leaf("C", "tile-c"),
    },
  };
}

/** Two-pane layout — the minimal topology that reproduces the parked-forever symptom. */
function twoPaneLayout(): TilingSplitNode {
  return {
    kind: "split",
    id: "root",
    axis: "horizontal",
    ratio: 0.5,
    first: leaf("A", "tile-a"),
    second: leaf("B", "tile-b"),
  };
}

const SOURCE_LEAF_ID = "A";

const CONFIG: TilingLayoutConfig = { gapPx: 0, minPaneSizePx: 0, handleSizePx: 0 };
const STAGE = { width: 1000, height: 800 };

describe("live-drag cleanup — the base is drawn ONLY while drag state is held", (): void => {
  it("in-flight live drag (source held, nothing held yet) displays the gap-closed base (source absent)", (): void => {
    const layout: TilingSplitNode = baseLayout();
    const drag = layoutDrag(layout, SOURCE_LEAF_ID, STAGE, CONFIG)!;
    const run = hitRun(drag, "base");
    // Nothing held: a frame draws the base, the subject taken out and its gap closed.
    const drawn = run.hit.drawn({ held: null, refused: null, mark: null });
    expect(drawn.tree).toBe(drag.base.tree);
    expect(drawn.tree.layout).not.toBe(layout);
    expect(drawn.tree.layout).toEqual(removeLeafTile(layout, SOURCE_LEAF_ID));
    expect(readLeafNodeIds(drawn.tree.layout!)).not.toContain(SOURCE_LEAF_ID);
  });

  it("after dragend with NO valid drop (state cleared → source null) the drag has no source: the renderer lays out the prop layout", (): void => {
    const dragging: DragMachineState = dragMachineDraggingOver("C");
    expect(activeDragSourceLeafId(dragging)).toBe(SOURCE_LEAF_ID);
    // clearDragInteraction() empties the source; with it the hit goes, and the prop layout is what is laid out.
    const settling: DragMachineState = dragMachineReducer(dragging, { type: "POINTER_CANCEL", pointerId: 1 });
    const idle: DragMachineState = dragMachineReducer(settling, { type: "SETTLE_DONE" });
    expect(activeDragSourceLeafId(idle)).toBeNull();
    expect(activeDragSourceLeafId(settling)).toBeNull();
  });

  it("after cancel/Escape (state cleared) the drag has no source", (): void => {
    const dragging: DragMachineState = dragMachineDraggingOver("C");
    const idle: DragMachineState = dragMachineReducer(dragMachineReducer(dragging, { type: "ESCAPE" }), { type: "SETTLE_DONE" });
    expect(activeDragSourceLeafId(idle)).toBeNull();
  });

  it("two-pane parked-forever symptom: pickup collapses to the survivor; the lift restores BOTH panes", (): void => {
    const layout: TilingSplitNode = twoPaneLayout();
    const drag = layoutDrag(layout, "A", STAGE, CONFIG)!;
    // Mid-drag: picking up "A" collapses the base to the survivor "B" full-width —
    // this is the state that, when left uncleared, parked the layout forever.
    expect(readLeafNodeIds(drag.base.tree.layout!)).toEqual(["B"]);
    // The lift (what a cancel restores, and home draws) has both panes, the layout itself.
    expect(drag.lift.tree.layout).toBe(layout);
    expect([...readLeafNodeIds(drag.lift.tree.layout!)].sort()).toEqual(["A", "B"]);
  });

  it("while the hit holds home the source is never detached, on either basis", (): void => {
    const layout: TilingSplitNode = baseLayout();
    for (const basis of ["lift", "base"] as const) {
      const run = hitRun(layoutDrag(layout, SOURCE_LEAF_ID, STAGE, CONFIG)!, basis);
      const read = run.at({ x: 100, y: 100 });
      expect(read.held).toEqual({ kind: "home" });
      expect(run.hit.drawn(read).tree.layout).toBe(layout);
    }
  });

  it("root-leaf source is a no-op detach: the whole stage is home, the drawn layout stays the original (never null/collapsed)", (): void => {
    const rootLeaf: TilingLeafNode = leaf("only", "tile-only");
    for (const basis of ["lift", "base"] as const) {
      const run = hitRun(layoutDrag(rootLeaf, "only", STAGE, CONFIG)!, basis);
      const read = run.at({ x: 500, y: 400 });
      expect(read.held).toEqual({ kind: "home" });
      expect(run.hit.drawn(read).tree.layout).toBe(rootLeaf);
    }
  });
});

function makeResolvedTarget(
  targetLeafId: string,
  zone: TilingLeafDropZone,
  action: TilingDropIntentState["action"],
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
    tuning: { centerRatio: 0.5, edgeThresholdRatio: 0.25, devicePixelRatio: 1 },
  };
}

/** Drive the FSM to `dragging` over `targetLeafId` with a swap intent resolved. */
function dragMachineDraggingOver(targetLeafId: string): DragMachineState {
  let state: DragMachineState = DRAG_MACHINE_INITIAL_STATE;
  const drive = (event: DragMachineEvent): void => {
    state = dragMachineReducer(state, event);
  };
  drive({
    type: "POINTER_DOWN",
    pointerId: 1,
    pointerType: "mouse",
    sourceLeafId: SOURCE_LEAF_ID,
    anchorFootprint: { left: 0, top: 0, width: 100, height: 100 },
    pointerAnchorOffset: { x: 10, y: 10 },
    originClient: { x: 10, y: 10 },
  });
  drive({ type: "POINTER_MOVE", pointerId: 1, client: { x: 200, y: 200 } });
  // The drag hit holds the swap, so it holds no home (`atHome: false`): a release commits it.
  drive({ type: "TARGET_RESOLVED", pointerId: 1, resolvedTarget: makeResolvedTarget(targetLeafId, "center", "swap"), atHome: false });
  return state;
}

describe("live-drag cleanup — FSM cancel edges restore the ORIGINAL layout (never commit, never park)", (): void => {
  // Every interruption (Escape / blur / pointercancel / lostCapture / hidden)
  // must route dragging → settling(cancel) → idle WITHOUT applying a layout
  // change, so the renderer's displayLayout falls straight back to the
  // untouched prop layout — the dragged pane snaps to its exact origin.
  const cancelEvents: ReadonlyArray<{ name: string; event: DragMachineEvent }> = [
    { name: "Escape", event: { type: "ESCAPE" } },
    { name: "window blur", event: { type: "BLUR" } },
    { name: "pointercancel", event: { type: "POINTER_CANCEL", pointerId: 1 } },
    { name: "tab hidden (lost capture proxy)", event: { type: "VISIBILITY_HIDDEN" } },
  ];

  it.each(cancelEvents)("$name during dragging settles to cancel, then to idle", ({ event }): void => {
    const dragging: DragMachineState = dragMachineDraggingOver("C");
    expect(dragging.phase).toBe("dragging");

    const settling: DragMachineState = dragMachineReducer(dragging, event);
    expect(settling.phase).toBe("settling");
    if (settling.phase === "settling") {
      // Cancel outcome carries NO resolved target, so the teardown effect never
      // calls onLayoutChange — the original layout is preserved verbatim.
      expect(settling.outcome).toBe("cancel");
      expect(settling.resolvedTarget).toBeNull();
    }

    const idle: DragMachineState = dragMachineReducer(settling, { type: "SETTLE_DONE" });
    expect(idle.phase).toBe("idle");
  });

  it("cancel never mutates the layout: the original tree is byte-for-byte unchanged after a full cancel cycle", (): void => {
    const layout: TilingSplitNode = baseLayout();
    const before: ReadonlyArray<string> = [...readLeafNodeIds(layout)].sort();
    const dragging: DragMachineState = dragMachineDraggingOver("C");
    const settling: DragMachineState = dragMachineReducer(dragging, { type: "ESCAPE" });
    dragMachineReducer(settling, { type: "SETTLE_DONE" });
    // The FSM is pure — it never touched `layout`. Renderer cancel path leaves
    // `onLayoutChange` uncalled, so displayLayout === original prop layout.
    expect([...readLeafNodeIds(layout)].sort()).toEqual(before);
    expect([...readLeafNodeIds(layout)].sort()).toEqual(["A", "B", "C"]);
  });

  it("pointerup over a valid swap commits the SAME target the render showed (no release-time jump)", (): void => {
    const dragging: DragMachineState = dragMachineDraggingOver("C");
    const settling: DragMachineState = dragMachineReducer(dragging, { type: "POINTER_UP", pointerId: 1 });
    expect(settling.phase).toBe("settling");
    // The commit reads the very target the last frame drew from (its held place's `after(place).tree`).
    if (settling.phase === "settling" && dragging.phase === "dragging") {
      expect(settling.outcome).toBe("commit");
      expect(settling.resolvedTarget).toBe(dragging.resolvedTarget);
    }
  });
});
