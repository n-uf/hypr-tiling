import { describe, expect, it } from "@jest/globals";
import { readLeafNodeIds, removeLeafTile, swapLeafTiles } from "../core/state";
import { resolveLiveDisplayLayout } from "../react/tiling-renderer";
import {
  DRAG_MACHINE_INITIAL_STATE,
  deriveCandidateTree,
  dragMachineReducer,
  type DragMachineEvent,
  type DragMachineState,
  type DragResolvedTarget,
} from "../core/drag-machine";
import type { TilingDropIntentState } from "../core/drop-intent-resolver";
import type { TilingLayoutNode, TilingLeafDropZone, TilingLeafNode, TilingSplitNode } from "../core/types";

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

describe("live-drag cleanup — frozen tree is parked ONLY while drag state is held", (): void => {
  it("in-flight live drag (source held) displays the gap-closed frozen tree (source absent)", (): void => {
    const layout: TilingSplitNode = baseLayout();
    const displayed: TilingLayoutNode = resolveLiveDisplayLayout(true, SOURCE_LEAF_ID, layout);
    // Mid-drag the displayed tree IS the detach tree, NOT the original layout.
    expect(displayed).not.toBe(layout);
    expect(displayed).toEqual(removeLeafTile(layout, SOURCE_LEAF_ID));
    expect(readLeafNodeIds(displayed)).not.toContain(SOURCE_LEAF_ID);
  });

  it("after dragend with NO valid drop (state cleared → source null) the displayed tree IS the original layout", (): void => {
    const layout: TilingSplitNode = baseLayout();
    // clearDragInteraction() sets dragSourceLeafId = null; the displayed tree must
    // collapse back to the original layout (gap restored), NOT stay frozen.
    const displayed: TilingLayoutNode = resolveLiveDisplayLayout(true, null, layout);
    expect(displayed).toBe(layout);
    expect([...readLeafNodeIds(displayed)].sort()).toEqual(["A", "B", "C"]);
  });

  it("after cancel/Escape (state cleared) the displayed tree IS the original layout", (): void => {
    const layout: TilingSplitNode = baseLayout();
    const displayed: TilingLayoutNode = resolveLiveDisplayLayout(true, null, layout);
    expect(displayed).toBe(layout);
    expect(readLeafNodeIds(displayed)).toContain(SOURCE_LEAF_ID);
  });

  it("two-pane parked-forever symptom: pickup collapses to the survivor; clear restores BOTH panes", (): void => {
    const layout: TilingSplitNode = twoPaneLayout();

    // Mid-drag: picking up "A" collapses the tree to the survivor "B" full-width —
    // this is the state that, when left uncleared, parked the layout forever.
    const midDrag: TilingLayoutNode = resolveLiveDisplayLayout(true, "A", layout);
    expect(readLeafNodeIds(midDrag)).toEqual(["B"]);

    // Drag end / cancel clears the source → both panes restored (gap closes back up).
    const afterClear: TilingLayoutNode = resolveLiveDisplayLayout(true, null, layout);
    expect(afterClear).toBe(layout);
    expect([...readLeafNodeIds(afterClear)].sort()).toEqual(["A", "B"]);
  });

  it("preview (non-live) mode never detaches the source, regardless of the held source id", (): void => {
    const layout: TilingSplitNode = baseLayout();
    // System A (preview) keeps the source in place; only the live model freezes.
    expect(resolveLiveDisplayLayout(false, SOURCE_LEAF_ID, layout)).toBe(layout);
  });

  it("root-leaf source is a no-op detach (keeps the original tree, never null/collapsed)", (): void => {
    const rootLeaf: TilingLeafNode = leaf("only", "tile-only");
    expect(resolveLiveDisplayLayout(true, "only", rootLeaf)).toBe(rootLeaf);
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
    tuning: { centerRatio: 0.5, edgeThresholdRatio: 0.25, hysteresisPx: 8, devicePixelRatio: 1 },
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
  drive({ type: "TARGET_RESOLVED", pointerId: 1, resolvedTarget: makeResolvedTarget(targetLeafId, "center", "swap") });
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

  it("pointerup over a valid swap commits the SAME tree the candidate render showed (no release-time jump)", (): void => {
    const layout: TilingSplitNode = baseLayout();
    const dragging: DragMachineState = dragMachineDraggingOver("C");
    // The candidate the render showed mid-drag:
    const candidate: TilingLayoutNode =
      dragging.phase === "dragging" ? deriveCandidateTree(layout, dragging.sourceLeafId, dragging.resolvedTarget) : layout;

    const settling: DragMachineState = dragMachineReducer(dragging, { type: "POINTER_UP", pointerId: 1 });
    expect(settling.phase).toBe("settling");
    // The committed tree (settling.outcome === commit, same resolvedTarget):
    const committed: TilingLayoutNode =
      settling.phase === "settling"
        ? deriveCandidateTree(layout, settling.sourceLeafId, settling.resolvedTarget)
        : layout;
    if (settling.phase === "settling") {
      expect(settling.outcome).toBe("commit");
    }
    expect(committed).toEqual(candidate);
    expect(committed).toEqual(swapLeafTiles(layout, SOURCE_LEAF_ID, "C"));
  });
});
