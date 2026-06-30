import { describe, expect, it } from "@jest/globals";
import {
  clampCursorPointToViewport,
  resolveDragCursorPresentation,
  type DragCursorPresentation,
} from "../core/drag-cursor";
import type { DragResolvedTarget } from "../core/drag-machine";
import type { TilingDropAction, TilingLeafDropZone } from "../core/types";

const SOURCE_LEAF_ID: string = "leaf-source";
const TARGET_LEAF_ID: string = "leaf-target";

/**
 * Minimal `DragResolvedTarget` (= `TilingDropIntentState`) fixture. Only the
 * fields `resolveDragCursorPresentation` reads (`leafId`, `action`, `finalEdge`,
 * `selectedSplitZone`, `blockedReason`) are meaningful; the rest are filled with
 * inert defaults so the operation+validity → kind mapping can be exercised
 * without the full resolver.
 */
function intent(overrides: Partial<DragResolvedTarget>): DragResolvedTarget {
  const zone: TilingLeafDropZone = overrides.zone ?? "center";
  const action: TilingDropAction = overrides.action ?? "swap";
  return {
    leafId: TARGET_LEAF_ID,
    zone,
    action,
    dominantEdge: "top",
    finalEdge: null,
    fallbackReason: null,
    blockedReason: null,
    axisPath: [],
    edgeThresholdRatio: 0.33,
    centerRectWidthPx: 10,
    centerRectHeightPx: 10,
    centerDistancePx: 0,
    nearestEdgeDistancePx: 0,
    paneLocalX: 0,
    paneLocalY: 0,
    targetSplitId: null,
    targetSplitPlacement: null,
    selectedSplitZone: null,
    selectedSplitDistancePx: null,
    rejectedSplitReasons: [],
    tuning: { centerRatio: 0.34, edgeThresholdRatio: 0.33, hysteresisPx: 6, devicePixelRatio: 1 },
    ...overrides,
  };
}

describe("resolveDragCursorPresentation — operation + validity → kind (no direction)", () => {
  it("returns grab/neutral when there is no resolved target (ghost free-following)", () => {
    const presentation: DragCursorPresentation = resolveDragCursorPresentation(null, SOURCE_LEAF_ID);
    expect(presentation).toEqual({ kind: "grab", tone: "neutral" });
  });

  it("returns grab/neutral when the resolved target is the drag source itself", () => {
    const target: DragResolvedTarget = intent({ leafId: SOURCE_LEAF_ID, zone: "center", action: "swap" });
    expect(resolveDragCursorPresentation(target, SOURCE_LEAF_ID)).toEqual({ kind: "grab", tone: "neutral" });
  });

  it("returns swap/valid for a committable center/swap target", () => {
    const target: DragResolvedTarget = intent({ zone: "center", action: "swap" });
    expect(resolveDragCursorPresentation(target, SOURCE_LEAF_ID)).toEqual({ kind: "swap", tone: "valid" });
  });

  it("returns insert/valid for a committable edge-insert target (no direction encoded)", () => {
    const target: DragResolvedTarget = intent({ zone: "left", action: "edge-insert", finalEdge: "left" });
    expect(resolveDragCursorPresentation(target, SOURCE_LEAF_ID)).toEqual({ kind: "insert", tone: "valid" });
  });

  it("returns insert/valid for every committable edge-insert edge (kind does not vary by edge)", () => {
    const edges: ReadonlyArray<"top" | "right" | "bottom" | "left"> = ["top", "right", "bottom", "left"];
    for (const edge of edges) {
      const target: DragResolvedTarget = intent({ zone: edge, action: "edge-insert", finalEdge: edge });
      expect(resolveDragCursorPresentation(target, SOURCE_LEAF_ID)).toEqual({ kind: "insert", tone: "valid" });
    }
  });

  it("treats an edge-insert resolved via selectedSplitZone (finalEdge null) as a committable insert", () => {
    const target: DragResolvedTarget = intent({
      zone: "right",
      action: "edge-insert",
      finalEdge: null,
      selectedSplitZone: "right",
    });
    expect(resolveDragCursorPresentation(target, SOURCE_LEAF_ID)).toEqual({ kind: "insert", tone: "valid" });
  });

  it("returns invalid for a non-committable target with a blocked reason", () => {
    const target: DragResolvedTarget = intent({
      zone: "left",
      action: "none",
      finalEdge: null,
      selectedSplitZone: "left",
      blockedReason: "left-blocked",
    });
    expect(resolveDragCursorPresentation(target, SOURCE_LEAF_ID)).toEqual({ kind: "invalid", tone: "invalid" });
  });

  it("returns grab/neutral for a non-committable target with no blocked reason", () => {
    const target: DragResolvedTarget = intent({
      zone: "center",
      action: "none",
      finalEdge: null,
      selectedSplitZone: null,
      blockedReason: null,
    });
    expect(resolveDragCursorPresentation(target, SOURCE_LEAF_ID)).toEqual({ kind: "grab", tone: "neutral" });
  });

  it("prefers the valid insert kind over invalid when a committable edge also carries a stale reason", () => {
    // Commit gate wins: an edge-insert with a resolved edge is committable, so the
    // cursor reads valid even if a (non-authoritative) blockedReason is present.
    const target: DragResolvedTarget = intent({
      zone: "top",
      action: "edge-insert",
      finalEdge: "top",
      blockedReason: "stale",
    });
    expect(resolveDragCursorPresentation(target, SOURCE_LEAF_ID)).toEqual({ kind: "insert", tone: "valid" });
  });
});

describe("clampCursorPointToViewport", () => {
  const bounds = { left: 0, top: 0, right: 1000, bottom: 800 } as const;

  it("leaves an interior point unchanged", () => {
    expect(clampCursorPointToViewport({ x: 500, y: 400 }, bounds, 15)).toEqual({ x: 500, y: 400 });
  });

  it("clamps a point past the right/bottom edges inward by the margin", () => {
    expect(clampCursorPointToViewport({ x: 1200, y: 900 }, bounds, 15)).toEqual({ x: 985, y: 785 });
  });

  it("clamps a point past the left/top edges inward by the margin", () => {
    expect(clampCursorPointToViewport({ x: -50, y: -10 }, bounds, 15)).toEqual({ x: 15, y: 15 });
  });

  it("snaps to the axis midpoint when the viewport is narrower than twice the margin", () => {
    const tight = { left: 0, top: 0, right: 20, bottom: 800 } as const;
    expect(clampCursorPointToViewport({ x: 5, y: 400 }, tight, 15)).toEqual({ x: 10, y: 400 });
  });
});
