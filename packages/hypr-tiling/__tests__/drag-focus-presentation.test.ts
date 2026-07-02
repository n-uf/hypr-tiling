import { describe, expect, it } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  TILING_OBSERVABILITY_COLOR_DEFAULTS,
  TILING_OBSERVABILITY_COLOR_ENABLE_DEFAULTS,
  DragSourceSlotReservation,
  buildDragPaneSnapshot,
  renderDragPaneShell,
} from "../react/tiling-renderer";
import { resolveDragCommitFocusLeafId } from "../engine/drag-machine";
import {
  TILING_THEME_REGISTRY,
  accentHue,
  resolvePaneDropAffordanceClasses,
  type PaneDropAffordanceFlags,
  type TilingTheme,
} from "../react/theme";
import type { TilingDropIntentState } from "../engine/drop-intent-resolver";
import type { TilingDragPaneSnapshot, TilingTile } from "../engine/types";

/**
 * Drag-visuals contract after the focus-follows-dragged-pane change:
 *
 * 1. No non-source pane wears a drag ring: the drop TARGET / hover-target / and
 *    the drop-eligible candidate all paint nothing (the faint dashed eligibility
 *    hint was removed too) — `resolvePaneDropAffordanceClasses` returns "" for
 *    every state except an invalid drop (the rose error ring).
 * 2. The dragged ghost (`renderDragPaneShell`) AND the seat it hops into
 *    (`DragSourceSlotReservation`) both wear the focus frame, so the single
 *    focus affordance travels with the dragged pane.
 * 3. On commit the dragged pane's content leaf is the one focused
 *    (`resolveDragCommitFocusLeafId`), so the dragged pane ends up focused.
 */

/**
 * Minimal-but-typed `TilingDropIntentState` fixture (mirrors the helper in
 * `live-render-invariant.test.ts`). Only `leafId` / `action` / the commit-edge
 * fields are load-bearing for the resolvers under test; the rest are inert.
 */
function makeResolvedTarget(
  targetLeafId: string,
  action: TilingDropIntentState["action"],
  finalEdge: TilingDropIntentState["finalEdge"] = null,
): TilingDropIntentState {
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

describe("drop-affordance rings — eligible / hover-target / drop-target paint nothing; only invalid drops ring", (): void => {
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

  it("renders NOTHING for a drop-eligible candidate (the dashed accent hint was removed)", (): void => {
    const flags: PaneDropAffordanceFlags = {
      isDropEligible: true,
      isHoveringDropCandidate: false,
      isDropTarget: false,
      isInvalidDrop: false,
    };
    const classes: string = resolvePaneDropAffordanceClasses(NEON, flags);
    // No eligibility ring at all — the sole drag affordance is the dragged pane.
    expect(classes).toBe("");
    expect(classes).not.toContain("ring-cyan-300/25");
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

  it("an eligible candidate that is also the hover/drop target (but valid) paints nothing", (): void => {
    const flags: PaneDropAffordanceFlags = {
      isDropEligible: true,
      isHoveringDropCandidate: true,
      isDropTarget: true,
      isInvalidDrop: false,
    };
    const classes: string = resolvePaneDropAffordanceClasses(NEON, flags);
    // No eligibility hint and no resolved-target focus-color ring — only an
    // invalid drop would paint (the rose error ring), and this one is valid.
    expect(classes).toBe("");
    expect(classes).not.toContain("ring-cyan-300/25");
    expect(classes).not.toContain(accentHue("cyan").focusBorder);
    expect(classes).not.toContain("ring-cyan-300/60");
  });

  it("the drop-eligible ring is gone across ALL built-in themes", (): void => {
    const eligibleOnly: PaneDropAffordanceFlags = {
      isDropEligible: true,
      isHoveringDropCandidate: false,
      isDropTarget: false,
      isInvalidDrop: false,
    };
    for (const theme of Object.values(TILING_THEME_REGISTRY)) {
      expect(resolvePaneDropAffordanceClasses(theme, eligibleOnly)).toBe("");
    }
  });

  it("the invalid-drop ring is still painted across ALL built-in themes", (): void => {
    const invalidOnly: PaneDropAffordanceFlags = {
      isDropEligible: true,
      isHoveringDropCandidate: true,
      isDropTarget: true,
      isInvalidDrop: true,
    };
    for (const theme of Object.values(TILING_THEME_REGISTRY)) {
      expect(resolvePaneDropAffordanceClasses(theme, invalidOnly)).toBe(
        theme.paneShell.invalidDropRing,
      );
    }
  });
});

describe("dragged ghost wears the focus frame (focus follows the dragged pane)", (): void => {
  it("the floating ghost shell carries the accent focus frame", (): void => {
    const tile: TilingTile = {
      id: "tile-a",
      title: "Alpha",
      accent: "violet",
      rows: ["row one"],
    };
    const snapshot: TilingDragPaneSnapshot = buildDragPaneSnapshot(tile);
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
        observabilityColors: TILING_OBSERVABILITY_COLOR_DEFAULTS,
        observabilityColorEnables: TILING_OBSERVABILITY_COLOR_ENABLE_DEFAULTS,
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
        observabilityColors: TILING_OBSERVABILITY_COLOR_DEFAULTS,
        observabilityColorEnables: {
          ...TILING_OBSERVABILITY_COLOR_ENABLE_DEFAULTS,
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
    const target: TilingDropIntentState = makeResolvedTarget("C", "swap");
    expect(resolveDragCommitFocusLeafId(SOURCE, target)).toBe("C");
  });

  it("edge-insert → focuses the SOURCE leaf (it moves carrying its own content)", (): void => {
    const target: TilingDropIntentState = makeResolvedTarget(
      "C",
      "edge-insert",
      "right",
    );
    expect(resolveDragCommitFocusLeafId(SOURCE, target)).toBe(SOURCE);
  });

  it("group-merge → focuses the SOURCE leaf (it becomes the group's added member)", (): void => {
    const target: TilingDropIntentState = makeResolvedTarget("C", "group-merge");
    expect(resolveDragCommitFocusLeafId(SOURCE, target)).toBe(SOURCE);
  });

  it("non-committable edge-insert (no resolved edge) → null (gap-close, no focus change)", (): void => {
    const target: TilingDropIntentState = makeResolvedTarget(
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
