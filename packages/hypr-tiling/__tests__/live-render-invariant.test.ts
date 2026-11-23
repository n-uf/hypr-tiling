import { describe, expect, it } from "@jest/globals";
import { readLeafNodeIds, removeLeafTile } from "../engine/state";
import { resolveLeafDropPreview, resolveLeafDropPreviewForMode } from "../react/tiling-renderer";
import type { TilingDropIntentState } from "../engine/drop-intent-resolver";
import type {
  TilingLayoutConfig,
  TilingLeafDropPreview,
  TilingLeafDropZone,
  TilingLeafNode,
  TilingSplitNode,
} from "../engine/types";
import { hitRun, layoutDrag } from "./golden/cases";

function leaf(id: string, tileId: string): TilingLeafNode {
  return { kind: "leaf", id, tileId };
}

/**
 * Base fixture tree (matches `state.test.ts`):
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

/**
 * Minimal-but-complete `TilingDropState` (= `TilingDropIntentState`) fixture.
 * `resolveLeafDropPreview` only reads `leafId` / `zone` / `action`; the remaining
 * fields are filled with inert defaults so the value is fully typed (no `any`).
 */
function makeDropState(
  targetLeafId: string,
  zone: TilingLeafDropZone,
  action: TilingDropIntentState["action"],
): TilingDropIntentState {
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
    tuning: {
      centerRatio: 0.5,
      edgeThresholdRatio: 0.25,
      devicePixelRatio: 1,
    },
  };
}

describe("live-mode render invariant — frozen gap-closed tree, no result-shadow leak", (): void => {
  // The source ("A") is detached on pickup; the destination ("C") is hovered with
  // a swap intent. These two values model an in-flight live drag.
  const SOURCE_LEAF_ID = "A";
  const TARGET_LEAF_ID = "C";

  it("live render equals removeLeafTile(layout, source) — the gap closes (source absent, sibling promoted)", (): void => {
    const layout: TilingSplitNode = baseLayout();
    const frozen = removeLeafTile(layout, SOURCE_LEAF_ID);
    const renderedIds: ReadonlyArray<string> = readLeafNodeIds(frozen);

    // The rendered (display) tree in live mode IS the frozen detach tree: the
    // source slot collapses and the surviving siblings promote into it.
    expect(renderedIds).not.toContain(SOURCE_LEAF_ID);
    expect([...renderedIds].sort()).toEqual(["B", "C"]);
  });

  it("preview mode: the target tile receives the drop-target-result-shadow preview (System B active)", (): void => {
    const dropState: TilingDropIntentState = makeDropState(TARGET_LEAF_ID, "center", "swap");
    const preview: TilingLeafDropPreview | null = resolveLeafDropPreviewForMode(
      false,
      TARGET_LEAF_ID,
      SOURCE_LEAF_ID,
      dropState,
    );
    expect(preview).not.toBeNull();
    expect(preview?.role).toBe("drop-target-result-shadow");
    expect(preview?.partnerLeafId).toBe(SOURCE_LEAF_ID);
  });

  it("live mode: the result-shadow path is suppressed for the SAME intent (System B gated off)", (): void => {
    const dropState: TilingDropIntentState = makeDropState(TARGET_LEAF_ID, "center", "swap");

    // The pure helper still computes a shadow for this intent...
    const ungated: TilingLeafDropPreview | null = resolveLeafDropPreview(
      TARGET_LEAF_ID,
      SOURCE_LEAF_ID,
      dropState,
    );
    expect(ungated).not.toBeNull();
    expect(ungated?.role).toBe("drop-target-result-shadow");

    // ...but the live-mode gate suppresses it (Hyprland: ghost only, no shadow).
    const gated: TilingLeafDropPreview | null = resolveLeafDropPreviewForMode(
      true,
      TARGET_LEAF_ID,
      SOURCE_LEAF_ID,
      dropState,
    );
    expect(gated).toBeNull();
  });

  it("group-merge intent: the target tile receives preview.mode group-merge for strip and host hits", (): void => {
    const origins: ReadonlyArray<string> = ["group-tab-strip", "host-group-drop-target"];
    for (const fallbackReason of origins) {
      const dropState: TilingDropIntentState = {
        ...makeDropState(TARGET_LEAF_ID, "center", "group-merge"),
        fallbackReason,
      };
      const target: TilingLeafDropPreview | null = resolveLeafDropPreview(
        TARGET_LEAF_ID,
        SOURCE_LEAF_ID,
        dropState,
      );
      expect(target?.mode).toBe("group-merge");
      expect(target?.role).toBe("drop-target-result-shadow");
      expect(target?.zone).toBe("center");
      expect(target?.partnerLeafId).toBe(SOURCE_LEAF_ID);
      expect(resolveLeafDropPreview(SOURCE_LEAF_ID, SOURCE_LEAF_ID, dropState)).toBeNull();
      expect(resolveLeafDropPreview("B", SOURCE_LEAF_ID, dropState)).toBeNull();
      expect(
        resolveLeafDropPreviewForMode(true, TARGET_LEAF_ID, SOURCE_LEAF_ID, dropState),
      ).toBeNull();
    }
  });

  it("edge-insert intent: same live-vs-preview divergence (shadow in preview, null in live)", (): void => {
    const dropState: TilingDropIntentState = makeDropState(TARGET_LEAF_ID, "left", "edge-insert");

    const previewModePreview: TilingLeafDropPreview | null = resolveLeafDropPreviewForMode(
      false,
      TARGET_LEAF_ID,
      SOURCE_LEAF_ID,
      dropState,
    );
    expect(previewModePreview?.role).toBe("drop-target-result-shadow");
    expect(previewModePreview?.mode).toBe("edge-insert");

    const liveModePreview: TilingLeafDropPreview | null = resolveLeafDropPreviewForMode(
      true,
      TARGET_LEAF_ID,
      SOURCE_LEAF_ID,
      dropState,
    );
    expect(liveModePreview).toBeNull();
  });

  it("regression guard: toggling preview↔live flips the result-shadow on/off for a fixed intent", (): void => {
    const dropState: TilingDropIntentState = makeDropState(TARGET_LEAF_ID, "center", "swap");
    const previewShadow = resolveLeafDropPreviewForMode(false, TARGET_LEAF_ID, SOURCE_LEAF_ID, dropState);
    const liveShadow = resolveLeafDropPreviewForMode(true, TARGET_LEAF_ID, SOURCE_LEAF_ID, dropState);
    expect(previewShadow).not.toBeNull();
    expect(liveShadow).toBeNull();
  });
});

describe("the drag hit's geometry — target resolution never chases the reflow", (): void => {
  // The drag's hit is built ONCE at the lift on one fixed layout (the lift for Indicator, the base for Snap), NOT the
  // displayed layout's rects. So a reflow — which moves panes under the cursor as the held place changes — cannot
  // move a hit zone and flip the place. That is the structural break of the reflow→retarget→re-reflow oscillation.
  const SOURCE_LEAF_ID = "A";
  const CONFIG: TilingLayoutConfig = { gapPx: 0, minPaneSizePx: 0, handleSizePx: 0 };
  const VIEWPORT = { width: 1000, height: 800 };

  it("the base basis hit-tests the gap-closed base (source removed), independent of any held place", (): void => {
    const layout: TilingSplitNode = baseLayout();
    const drag = layoutDrag(layout, SOURCE_LEAF_ID, VIEWPORT, CONFIG)!;
    const { hit } = hitRun(drag, "base");
    // The source slot is gone; only the survivors carry body targets, each at its base rect.
    const bodies = hit.targets.filter((t) => !t.part && !t.home);
    expect(bodies.map((t) => t.pane).sort()).toEqual(["tile-b", "tile-c"]);
    expect(drag.base.tree.layout).toEqual(removeLeafTile(layout, SOURCE_LEAF_ID));
    for (const t of bodies) expect(t.hit).toEqual(drag.base.layout.get(t.pane));
  });

  it("the lift basis hit-tests the lift (source still in place)", (): void => {
    const layout: TilingSplitNode = baseLayout();
    const drag = layoutDrag(layout, SOURCE_LEAF_ID, VIEWPORT, CONFIG)!;
    const { hit } = hitRun(drag, "lift");
    // The source's own slot is home, not a body; the others are at their lift rects.
    const bodies = hit.targets.filter((t) => !t.part && !t.home);
    expect(bodies.map((t) => t.pane).sort()).toEqual(["tile-b", "tile-c"]);
    for (const t of bodies) expect(t.hit).toEqual(drag.lift.layout.get(t.pane));
    expect(hit.targets.find((t) => t.home)?.hit).toEqual(drag.lift.layout.get("tile-a"));
  });

  it("INVARIANT: the zone map is the same at every point however the pointer has moved and whatever is held", (): void => {
    const layout: TilingSplitNode = baseLayout();
    for (const basis of ["lift", "base"] as const) {
      const drag = layoutDrag(layout, SOURCE_LEAF_ID, VIEWPORT, CONFIG)!;
      const run = hitRun(drag, basis);
      const grid: Array<{ x: number; y: number }> = [];
      for (let y = 0; y <= VIEWPORT.height; y += 40) for (let x = 0; x <= VIEWPORT.width; x += 50) grid.push({ x, y });
      const targets = run.hit.targets;
      const before: Array<string | null> = grid.map((p): string | null => run.hit.placeAt(p));
      // Hold different places in turn (the reflow of each): a swap on B, a side of C, nothing, home.
      for (const p of [{ x: 750, y: 100 }, { x: 900, y: 700 }, { x: 500, y: 790 }, { x: 100, y: 100 }]) run.at(p);
      expect(run.hit.targets).toBe(targets);
      expect(grid.map((p): string | null => run.hit.placeAt(p))).toEqual(before);
    }
  });
});
