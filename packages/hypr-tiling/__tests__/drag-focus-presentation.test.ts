import { describe, expect, it } from "@jest/globals";
import {
  TILING_OBSERVABILITY_COLOR_ENABLE_DEFAULTS,
  dragCursorToneClassName,
} from "../react/tiling-renderer";
import { resolveDragCommitFocusLeafId } from "../engine/drag-machine";
import { accentHue } from "../engine/accent-hues";
import {
  TILING_THEME_REGISTRY,
  resolveDragChrome,
  resolvePaneDropAffordanceClasses,
  type PaneDropAffordanceFlags,
  type TilingTheme,
  type TilingThemeDragChromeTokens,
} from "../react/theme";
import type { TilingDropIntentState } from "../engine/drop-intent-resolver";

/**
 * Drag-visuals contract (focus follows the dragged pane):
 *
 * 1. No non-source pane wears a drag ring: the drop TARGET / hover-target / and
 *    the drop-eligible candidate all paint nothing — `resolvePaneDropAffordanceClasses`
 *    returns "" for every state except an invalid drop (the rose error ring).
 * 2. The dragged pane is the real pane (it keeps its own focus frame); the
 *    theme's `dragChrome` adds the lifted look and the drop indicator.
 * 3. On commit the dragged pane's leaf is the one focused
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

/**
 * The `dragChrome` slot: OPTIONAL and PARTIAL; omitted tokens resolve to a
 * neutral default; the neon-terminal look is expressed purely through it.
 */
describe("dragChrome slot — neutral defaults + partial overrides", (): void => {
  const CLEAN_FLAT: TilingTheme = TILING_THEME_REGISTRY["clean-flat"];
  const SQUARE_HOST: TilingTheme = { ...CLEAN_FLAT, id: "square-host", label: "square host", dragChrome: undefined };

  it("a theme with no dragChrome resolves every token to the neutral default", (): void => {
    const chrome: TilingThemeDragChromeTokens = resolveDragChrome(SQUARE_HOST);
    expect(chrome.dropTarget).toBe("");
    expect(chrome.sourcePane).toBe("opacity-60");
    // The lifted look is a shadow that follows the drawn pane, never a size or
    // opacity change (the pane is held 1:1).
    expect(chrome.liftedPane).toContain("drop-shadow");
    expect(chrome.liftedPane).not.toMatch(/scale-|opacity-/);
    // The drop indicator: a colour no pane accent uses, a translucent fill, a
    // halo, rounded.
    expect(chrome.dropIndicator).toContain("orange");
    expect(chrome.dropIndicator).toMatch(/bg-orange-\d+\/\[?0?\.?\d+\]?/);
    expect(chrome.dropIndicator).toContain("shadow-");
    expect(chrome.dropIndicator).toContain("rounded");
  });

  it("the indicator colour is not a pane accent", (): void => {
    for (const accent of ["cyan", "sky", "violet", "indigo", "emerald", "amber", "rose", "pink"]) {
      for (const theme of Object.values(TILING_THEME_REGISTRY)) {
        expect(resolveDragChrome(theme).dropIndicator).not.toContain(`${accent}-`);
      }
    }
  });

  it("the slot is partial — overriding one token keeps every other token at its default", (): void => {
    const themed: TilingTheme = { ...SQUARE_HOST, dragChrome: { sourcePane: "opacity-40" } };
    const chrome: TilingThemeDragChromeTokens = resolveDragChrome(themed);
    const defaults: TilingThemeDragChromeTokens = resolveDragChrome(SQUARE_HOST);
    expect(chrome.sourcePane).toBe("opacity-40");
    expect(chrome.liftedPane).toBe(defaults.liftedPane);
    expect(chrome.dropIndicator).toBe(defaults.dropIndicator);
    expect(chrome.cursorBadge).toBe(defaults.cursorBadge);
  });

  it("neon-terminal expresses its drag look purely through the slot", (): void => {
    const chrome: TilingThemeDragChromeTokens = resolveDragChrome(NEON);
    expect(NEON.dragChrome).toBeDefined();
    expect(chrome.liftedPane).toContain("drop-shadow-[0_26px_32px_rgba(2,6,23,0.7)]");
    expect(chrome.dropIndicator).toContain("orange");
    expect(chrome.sourcePane).toBe("opacity-70");
    expect(chrome.cursorBadge).toContain("rounded-full");
    expect(chrome.cursorBadgeValid).toContain("cyan");
    expect(chrome.cursorBadgeInvalid).toContain("rose");
  });

  it("the live-drag observability layers (source tint, target ring) are OFF by default", (): void => {
    expect(TILING_OBSERVABILITY_COLOR_ENABLE_DEFAULTS.dragSourceBorderEnabled).toBe(false);
    expect(TILING_OBSERVABILITY_COLOR_ENABLE_DEFAULTS.dragTargetBorderEnabled).toBe(false);
  });

  it("the cursor badge tones come from the slot (valid / invalid / neutral)", (): void => {
    const themed: TilingTheme = {
      ...SQUARE_HOST,
      dragChrome: {
        cursorBadge: "rounded-none border",
        cursorBadgeValid: "badge-valid-token",
        cursorBadgeInvalid: "badge-invalid-token",
        cursorBadgeNeutral: "badge-neutral-token",
      },
    };
    const chrome: TilingThemeDragChromeTokens = resolveDragChrome(themed);
    expect(dragCursorToneClassName(chrome, "valid")).toBe("badge-valid-token");
    expect(dragCursorToneClassName(chrome, "invalid")).toBe("badge-invalid-token");
    expect(dragCursorToneClassName(chrome, "neutral")).toBe("badge-neutral-token");
    expect(chrome.cursorBadge).toBe("rounded-none border");
  });

  it("paneShell no longer carries a drag-source opacity — the whole-pane dim lives in dragChrome.sourcePane", (): void => {
    for (const theme of Object.values(TILING_THEME_REGISTRY)) {
      expect("dragSourceOpacity" in theme.paneShell).toBe(false);
      expect(resolveDragChrome(theme).sourcePane).toMatch(/^opacity-\d+$/);
    }
  });
});

describe("commit-time focus follows the dragged pane to its destination leaf", (): void => {
  const SOURCE = "A";

  it("swap → focuses the TARGET leaf (swapLeafTiles moves the dragged content there)", (): void => {
    const target: TilingDropIntentState = makeResolvedTarget("C", "swap");
    expect(resolveDragCommitFocusLeafId(SOURCE, target)).toBe("C");
  });

  it("edge-insert → focuses the SOURCE leaf (it moves carrying its own content)", (): void => {
    const target: TilingDropIntentState = makeResolvedTarget("C", "edge-insert", "right");
    expect(resolveDragCommitFocusLeafId(SOURCE, target)).toBe(SOURCE);
  });

  it("group-merge → focuses the SOURCE leaf (it becomes the group's added member)", (): void => {
    const target: TilingDropIntentState = makeResolvedTarget("C", "group-merge");
    expect(resolveDragCommitFocusLeafId(SOURCE, target)).toBe(SOURCE);
  });

  it("non-committable edge-insert (no resolved edge) → null (gap-close, no focus change)", (): void => {
    const target: TilingDropIntentState = makeResolvedTarget("C", "edge-insert", null);
    expect(resolveDragCommitFocusLeafId(SOURCE, target)).toBeNull();
  });

  it("self-target / no target → null (nothing committed)", (): void => {
    expect(resolveDragCommitFocusLeafId(SOURCE, null)).toBeNull();
    expect(resolveDragCommitFocusLeafId(SOURCE, makeResolvedTarget(SOURCE, "swap"))).toBeNull();
    expect(resolveDragCommitFocusLeafId(null, makeResolvedTarget("C", "swap"))).toBeNull();
  });
});
