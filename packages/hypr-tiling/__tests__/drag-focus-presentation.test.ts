import { describe, expect, it } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DYNAMIC_OBSERVABILITY_COLOR_DEFAULTS,
  DYNAMIC_OBSERVABILITY_COLOR_ENABLE_DEFAULTS,
  DragSourceSlotReservation,
  buildDragPaneSnapshot,
  renderDragPaneShell,
} from "../dynamic-tiling-renderer";
import { resolveDragCommitFocusLeafId } from "../drag-machine";
import {
  TILING_THEME_REGISTRY,
  accentHue,
  resolvePaneDropAffordanceClasses,
  type PaneDropAffordanceFlags,
  type TilingTheme,
} from "../theme";
import type { DynamicDropIntentState } from "../drop-intent-resolver";
import type { DynamicDragPaneSnapshot, DynamicTile } from "../types";

/**
 * Drag-visuals contract after the focus-follows-dragged-pane change:
 *
 * 1. The drop TARGET / hover-target pane no longer wears the accent focus-color
 *    ring (`resolvePaneDropAffordanceClasses` returns nothing for those states).
 * 2. The dragged ghost (`renderDragPaneShell`) AND the seat it hops into
 *    (`DragSourceSlotReservation`) both wear the focus frame, so the single
 *    focus affordance travels with the dragged pane.
 * 3. On commit the dragged pane's content leaf is the one focused
 *    (`resolveDragCommitFocusLeafId`), so the dragged pane ends up focused.
 */

/**
 * Minimal-but-typed `DynamicDropIntentState` fixture (mirrors the helper in
 * `live-render-invariant.test.ts`). Only `leafId` / `action` / the commit-edge
 * fields are load-bearing for the resolvers under test; the rest are inert.
 */
function makeResolvedTarget(
  targetLeafId: string,
  action: DynamicDropIntentState["action"],
  finalEdge: DynamicDropIntentState["finalEdge"] = null,
): DynamicDropIntentState {
  return {
    leafId: targetLeafId,
    zone: finalEdge ?? "center",
    action,
    dominantEdge: "right",
    finalEdge,
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
    selectedSplitZone: finalEdge,
    selectedSplitDistancePx: null,
    rejectedSplitReasons: [],
    tuning: {
      centerRatio: 0.5,
      edgeThresholdRatio: 0.25,
      hysteresisPx: 8,
      devicePixelRatio: 1,
    },
  };
}

const NEON: TilingTheme = TILING_THEME_REGISTRY["neon-terminal"];

describe("drop-affordance rings — hover-target / drop-target no longer reuse the focus color", (): void => {
  it("renders NOTHING for a resolved drop target (no accent focus-color ring)", (): void => {
    const flags: PaneDropAffordanceFlags = {
      isDropEligible: false,
      isHoveringDropCandidate: true,
      isDropTarget: true,
      isInvalidDrop: false,
    };
    const classes: string = resolvePaneDropAffordanceClasses(NEON, flags);
    expect(classes).toBe("");
    // It must NOT bring back the focus accent border/ring the focused pane wears.
    expect(classes).not.toContain(accentHue("cyan").focusBorder);
    expect(classes).not.toContain(accentHue("cyan").focusRing);
  });

  it("keeps the faint dashed eligibility hint on a candidate (non-focus, dashed)", (): void => {
    const flags: PaneDropAffordanceFlags = {
      isDropEligible: true,
      isHoveringDropCandidate: false,
      isDropTarget: false,
      isInvalidDrop: false,
    };
    const classes: string = resolvePaneDropAffordanceClasses(NEON, flags);
    // The dashed eligibility hint's accent ring is present (non-focus, faint).
    expect(classes).toContain("ring-cyan-300/25");
    expect(classes).not.toContain(accentHue("cyan").focusBorder);
  });

  it("keeps the rose invalid-drop ring (an error color, never the focus color)", (): void => {
    const flags: PaneDropAffordanceFlags = {
      isDropEligible: false,
      isHoveringDropCandidate: true,
      isDropTarget: false,
      isInvalidDrop: true,
    };
    const classes: string = resolvePaneDropAffordanceClasses(NEON, flags);
    expect(classes).toBe(NEON.paneShell.invalidDropRing);
    expect(classes).toContain("rose");
  });

  it("an eligible candidate that is also the hover/drop target shows ONLY the dashed hint", (): void => {
    const flags: PaneDropAffordanceFlags = {
      isDropEligible: true,
      isHoveringDropCandidate: true,
      isDropTarget: true,
      isInvalidDrop: false,
    };
    const classes: string = resolvePaneDropAffordanceClasses(NEON, flags);
    // Only the faint candidate hint — no resolved-target focus-color ring.
    expect(classes).toContain("ring-cyan-300/25");
    expect(classes).not.toContain(accentHue("cyan").focusBorder);
    expect(classes).not.toContain("ring-cyan-300/60");
  });
});

describe("dragged ghost wears the focus frame (focus follows the dragged pane)", (): void => {
  it("the floating ghost shell carries the accent focus frame", (): void => {
    const tile: DynamicTile = {
      id: "tile-a",
      title: "Alpha",
      accent: "violet",
      rows: ["row one"],
    };
    const snapshot: DynamicDragPaneSnapshot = buildDragPaneSnapshot(tile);
    const markup: string = renderToStaticMarkup(
      renderDragPaneShell(snapshot, NEON, true),
    );
    expect(markup).toContain(accentHue("violet").focusBorder);
    expect(markup).toContain(accentHue("violet").focusRing);
  });
});

describe("seat / hop-in slot wears the focus frame", (): void => {
  it("the reservation seat carries the DRAGGED pane's focus frame", (): void => {
    const markup: string = renderToStaticMarkup(
      createElement(DragSourceSlotReservation, {
        theme: NEON,
        accent: "emerald",
        observabilityColors: DYNAMIC_OBSERVABILITY_COLOR_DEFAULTS,
        observabilityColorEnables: DYNAMIC_OBSERVABILITY_COLOR_ENABLE_DEFAULTS,
      }),
    );
    expect(markup).toContain(accentHue("emerald").focusBorder);
    expect(markup).toContain(accentHue("emerald").focusRing);
    expect(markup).toContain("data-drag-source-reservation");
  });

  it("the reservation seat carries the focus frame even when the source-border observability layer is off", (): void => {
    const markup: string = renderToStaticMarkup(
      createElement(DragSourceSlotReservation, {
        theme: NEON,
        accent: "rose",
        observabilityColors: DYNAMIC_OBSERVABILITY_COLOR_DEFAULTS,
        observabilityColorEnables: {
          ...DYNAMIC_OBSERVABILITY_COLOR_ENABLE_DEFAULTS,
          dragSourceBorderEnabled: false,
        },
      }),
    );
    expect(markup).toContain(accentHue("rose").focusBorder);
  });
});

describe("commit-time focus follows the dragged pane to its destination leaf", (): void => {
  const SOURCE = "A";

  it("swap → focuses the TARGET leaf (swapLeafTiles moves the dragged content there)", (): void => {
    const target: DynamicDropIntentState = makeResolvedTarget("C", "swap");
    expect(resolveDragCommitFocusLeafId(SOURCE, target)).toBe("C");
  });

  it("edge-insert → focuses the SOURCE leaf (it moves carrying its own content)", (): void => {
    const target: DynamicDropIntentState = makeResolvedTarget(
      "C",
      "edge-insert",
      "right",
    );
    expect(resolveDragCommitFocusLeafId(SOURCE, target)).toBe(SOURCE);
  });

  it("group-merge → focuses the SOURCE leaf (it becomes the group's added member)", (): void => {
    const target: DynamicDropIntentState = makeResolvedTarget("C", "group-merge");
    expect(resolveDragCommitFocusLeafId(SOURCE, target)).toBe(SOURCE);
  });

  it("non-committable edge-insert (no resolved edge) → null (gap-close, no focus change)", (): void => {
    const target: DynamicDropIntentState = makeResolvedTarget(
      "C",
      "edge-insert",
      null,
    );
    expect(resolveDragCommitFocusLeafId(SOURCE, target)).toBeNull();
  });

  it("self-target / no target → null (nothing committed)", (): void => {
    expect(resolveDragCommitFocusLeafId(SOURCE, null)).toBeNull();
    expect(
      resolveDragCommitFocusLeafId(SOURCE, makeResolvedTarget(SOURCE, "swap")),
    ).toBeNull();
    expect(resolveDragCommitFocusLeafId(null, makeResolvedTarget("C", "swap"))).toBeNull();
  });
});
