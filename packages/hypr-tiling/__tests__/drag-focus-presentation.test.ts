import { describe, expect, it } from "@jest/globals";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  TILING_OBSERVABILITY_COLOR_DEFAULTS,
  TILING_OBSERVABILITY_COLOR_ENABLE_DEFAULTS,
  DragSourceSlotReservation,
  buildDragPaneSnapshot,
  buildGhostTileArgs,
  renderDragPaneShell,
  type GhostTileCapabilityFlags,
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
import type {
  TilingDragPaneSnapshot,
  TilingRenderTileProps,
  TilingTile,
} from "../engine/types";

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
    expect(markup).toContain(accentHue("violet").focusGlowSoft);
  });
});

/**
 * The floating ghost routes through the consumer `renderTile` when one is
 * provided (so a custom skin's pane chrome travels with the drag), and falls
 * back to `renderDragPaneShell` (the built-in default surface) only when
 * `renderTile == null`. `buildGhostTileArgs` is the ghost's `TilingRenderTileProps`
 * builder; `DragPaneOverlay` renders `renderTile(buildGhostTileArgs(...))` inside
 * the transform wrapper, or `renderDragPaneShell(...)` when there is no renderer.
 * This exercises the pure builder + a mirror of the component's one-line routing,
 * which is the part that does NOT require a simulated DOM pointer drag.
 */
describe("floating drag ghost routes through consumer renderTile (custom skin travels with the drag)", (): void => {
  const GHOST_TILE: TilingTile = {
    id: "tile-src",
    title: "Source Pane",
    description: "carried body",
    accent: "violet",
    rows: ["ghost row one"],
    content: createElement("div", { "data-custom-body": "1" }, "custom body"),
  };
  const SOURCE_LEAF = "leaf-src";
  /**
   * A deliberately non-uniform flag set (mixed true/false) so the tests can
   * prove the ghost args carry the REAL resolved values, not hardcoded ones.
   */
  const REAL_FLAGS: GhostTileCapabilityFlags = {
    isRearrangeEnabled: true,
    isMaximizeEnabled: true,
    isTitleBarSizingEnabled: false,
    isTitleBarAcquireSpaceEnabled: true,
    isCollapseEnabled: false,
    isMultiSelectGroupingEnabled: false,
  };

  it("buildGhostTileArgs sets the traveling-pane flags a consumer expects", (): void => {
    const snapshot: TilingDragPaneSnapshot = buildDragPaneSnapshot(GHOST_TILE);
    const args: TilingRenderTileProps = buildGhostTileArgs(
      snapshot,
      SOURCE_LEAF,
      3,
      420,
      true,
      "drag-ghost",
      REAL_FLAGS,
    );
    expect(args.leafId).toBe(SOURCE_LEAF);
    expect(args.tile.id).toBe("tile-src");
    expect(args.tile.title).toBe("Source Pane");
    expect(args.tile.content).toBe(GHOST_TILE.content);
    expect(args.paneOrdinal).toBe(3);
    expect(args.paneWidthPx).toBe(420);
    // The traveling pane: it is the drag source, wears the focus frame, paints
    // content per the uniform CONTENT rule.
    expect(args.isDragSource).toBe(true);
    expect(args.isFocused).toBe(true);
    expect(args.paneBodyRenderMode).toBe("render-content");
    // Every other role flag is in its resting/false state.
    expect(args.isDropTarget).toBe(false);
    expect(args.isDropEligible).toBe(false);
    expect(args.isHoveringDropCandidate).toBe(false);
    expect(args.isInvalidDrop).toBe(false);
    expect(args.isMaximized).toBe(false);
    expect(args.isMoveSource).toBe(false);
    expect(args.isMultiSelected).toBe(false);
    expect(args.dropZone).toBeNull();
    expect(args.preview).toBeNull();
    // The traveling ghost is a single-pane silhouette — never a seated group
    // member — so the drag surfaces carry no group context.
    expect(args.group).toBeNull();
  });

  it("ghost args discriminate as surface 'drag-ghost' (in-tree panes are 'pane')", (): void => {
    const snapshot: TilingDragPaneSnapshot = buildDragPaneSnapshot(GHOST_TILE);
    const ghost: TilingRenderTileProps = buildGhostTileArgs(
      snapshot,
      SOURCE_LEAF,
      1,
      300,
      true,
      "drag-ghost",
      REAL_FLAGS,
    );
    expect(ghost.surface).toBe("drag-ghost");
    const cancel: TilingRenderTileProps = buildGhostTileArgs(
      snapshot,
      SOURCE_LEAF,
      1,
      300,
      true,
      "drag-cancel",
      REAL_FLAGS,
    );
    expect(cancel.surface).toBe("drag-cancel");
  });

  it("ghost args carry the REAL capability display flags (no mid-drag silhouette pop)", (): void => {
    const snapshot: TilingDragPaneSnapshot = buildDragPaneSnapshot(GHOST_TILE);
    const args: TilingRenderTileProps = buildGhostTileArgs(
      snapshot,
      SOURCE_LEAF,
      1,
      300,
      true,
      "drag-ghost",
      REAL_FLAGS,
    );
    // The mixed true/false fixture flows through verbatim — capability-keyed
    // chrome (maximize button, sizing controls, multi-select affordance) keeps
    // the exact visibility it had on the in-tree pane.
    expect(args.isRearrangeEnabled).toBe(true);
    expect(args.isMaximizeEnabled).toBe(true);
    expect(args.isTitleBarSizingEnabled).toBe(false);
    expect(args.isTitleBarAcquireSpaceEnabled).toBe(true);
    expect(args.isMultiSelectGroupingEnabled).toBe(false);
    // And the inverse mix proves nothing is hardcoded.
    const inverse: TilingRenderTileProps = buildGhostTileArgs(
      snapshot,
      SOURCE_LEAF,
      1,
      300,
      true,
      "drag-ghost",
      {
        isRearrangeEnabled: false,
        isMaximizeEnabled: false,
        isTitleBarSizingEnabled: true,
        isTitleBarAcquireSpaceEnabled: false,
        isCollapseEnabled: false,
        isMultiSelectGroupingEnabled: true,
      },
    );
    expect(inverse.isMaximizeEnabled).toBe(false);
    expect(inverse.isTitleBarSizingEnabled).toBe(true);
    expect(inverse.isMultiSelectGroupingEnabled).toBe(true);
  });

  it("respects the content toggle: hidden content → render-empty body mode", (): void => {
    const snapshot: TilingDragPaneSnapshot = buildDragPaneSnapshot(GHOST_TILE);
    const hidden: TilingRenderTileProps = buildGhostTileArgs(
      snapshot,
      SOURCE_LEAF,
      1,
      300,
      false,
      "drag-ghost",
      REAL_FLAGS,
    );
    expect(hidden.isPaneContentVisible).toBe(false);
    expect(hidden.paneBodyRenderMode).toBe("render-empty");
  });

  it("ghost interaction handlers are safe no-ops (ghost is aria-hidden / non-interactive)", (): void => {
    const snapshot: TilingDragPaneSnapshot = buildDragPaneSnapshot(GHOST_TILE);
    const args: TilingRenderTileProps = buildGhostTileArgs(
      snapshot,
      SOURCE_LEAF,
      1,
      300,
      true,
      "drag-ghost",
      REAL_FLAGS,
    );
    // Invoking every wired callback must not throw and must return nothing.
    expect(args.onToggleMaximize()).toBeUndefined();
    expect(args.onSetSizingMode("static-width")).toBeUndefined();
    expect(args.onAcquireSpace("right")).toBeUndefined();
    expect(args.onFocus()).toBeUndefined();
    expect(args.onToggleMultiSelect()).toBeUndefined();
    expect(args.onGroupMultiSelection(SOURCE_LEAF)).toBeUndefined();
    expect(args.onHandlePointerDown({} as never)).toBeUndefined();
    expect(args.onPointerMove({} as never)).toBeUndefined();
    expect(args.onPointerLeave({} as never)).toBeUndefined();
  });

  it("with a custom renderTile the ghost paints the custom skin (its data-leaf-id + body travel)", (): void => {
    const snapshot: TilingDragPaneSnapshot = buildDragPaneSnapshot(GHOST_TILE);
    const args: TilingRenderTileProps = buildGhostTileArgs(
      snapshot,
      SOURCE_LEAF,
      1,
      300,
      true,
      "drag-ghost",
      REAL_FLAGS,
    );
    // A custom skin: a root carrying data-leaf-id + a distinctive marker + a body
    // gated on paneBodyRenderMode (the documented custom-pane contract).
    const renderTile = (a: TilingRenderTileProps): ReactElement =>
      createElement(
        "section",
        { "data-leaf-id": a.leafId, "data-custom-skin": "yes" },
        a.tile.title,
        a.paneBodyRenderMode === "render-content" ? a.tile.content : null,
      );
    // DragPaneOverlay routing (renderTile != null → renderTile(ghostArgs)).
    const markup: string = renderToStaticMarkup(renderTile(args));
    expect(markup).toContain("data-custom-skin");
    expect(markup).toContain(`data-leaf-id="${SOURCE_LEAF}"`);
    expect(markup).toContain("Source Pane");
    expect(markup).toContain("data-custom-body");
    // The custom skin does NOT carry the library's built-in ghost surface chrome.
    expect(markup).not.toContain("drag header to swap");
  });

  it("with no renderTile the ghost falls back to the built-in default surface exactly", (): void => {
    const snapshot: TilingDragPaneSnapshot = buildDragPaneSnapshot(GHOST_TILE);
    // DragPaneOverlay routing (renderTile == null → renderDragPaneShell(...)).
    const markup: string = renderToStaticMarkup(
      renderDragPaneShell(snapshot, NEON, true),
    );
    // Built-in ghost surface chrome present; no custom-skin markers.
    expect(markup).toContain("Source Pane");
    expect(markup).not.toContain("data-custom-skin");
    expect(markup).toContain(accentHue("violet").focusGlowSoft);
  });
});

/**
 * The cancel fly-back mirrors the pickup-ghost characterization exactly:
 * `DragCancelOverlay` renders `renderTile(buildGhostTileArgs(snapshot, …,
 * "drag-cancel", flags))` when a consumer `renderTile` is supplied, keeping
 * `renderDragPaneShell` as the `renderTile == null` built-in fallback. Same
 * inert-handlers / real-capability-flags / no-group semantics as
 * `"drag-ghost"`; the only difference a custom pane observes is the
 * `surface: "drag-cancel"` discriminator.
 */
describe("cancel fly-back routes through consumer renderTile (custom skin glides home)", (): void => {
  const CANCEL_TILE: TilingTile = {
    id: "tile-cancel",
    title: "Cancelled Pane",
    accent: "emerald",
    rows: ["going home"],
    content: createElement("div", { "data-cancel-body": "1" }, "cancel body"),
  };
  const SOURCE_LEAF = "leaf-cancel-src";
  const FLAGS: GhostTileCapabilityFlags = {
    isRearrangeEnabled: true,
    isMaximizeEnabled: false,
    isTitleBarSizingEnabled: true,
    isTitleBarAcquireSpaceEnabled: false,
    isCollapseEnabled: false,
    isMultiSelectGroupingEnabled: true,
  };

  it("cancel tileArgs mirror the ghost semantics under the drag-cancel surface", (): void => {
    const snapshot: TilingDragPaneSnapshot = buildDragPaneSnapshot(CANCEL_TILE);
    const args: TilingRenderTileProps = buildGhostTileArgs(
      snapshot,
      SOURCE_LEAF,
      2,
      360,
      true,
      "drag-cancel",
      FLAGS,
    );
    expect(args.surface).toBe("drag-cancel");
    expect(args.leafId).toBe(SOURCE_LEAF);
    expect(args.tile.title).toBe("Cancelled Pane");
    // REAL capability display flags flow through (mixed fixture, verbatim).
    expect(args.isMaximizeEnabled).toBe(false);
    expect(args.isTitleBarSizingEnabled).toBe(true);
    expect(args.isMultiSelectGroupingEnabled).toBe(true);
    // Inert-handler + no-group semantics, identical to the pickup ghost.
    expect(args.group).toBeNull();
    expect(args.onToggleMaximize()).toBeUndefined();
    expect(args.onFocus()).toBeUndefined();
    expect(args.onHandlePointerDown({} as never)).toBeUndefined();
  });

  it("with a custom renderTile the cancel fly-back paints the custom skin (surface branch observable)", (): void => {
    const snapshot: TilingDragPaneSnapshot = buildDragPaneSnapshot(CANCEL_TILE);
    const args: TilingRenderTileProps = buildGhostTileArgs(
      snapshot,
      SOURCE_LEAF,
      1,
      300,
      true,
      "drag-cancel",
      FLAGS,
    );
    // A custom skin that branches on the surface discriminator: interactive
    // controls only on "pane", a marker attribute on the drag surfaces.
    const renderTile = (a: TilingRenderTileProps): ReactElement =>
      createElement(
        "section",
        {
          "data-leaf-id": a.leafId,
          "data-custom-skin": "yes",
          "data-render-surface": a.surface,
        },
        a.tile.title,
        a.surface === "pane"
          ? createElement("button", { type: "button" }, "controls")
          : null,
        a.paneBodyRenderMode === "render-content" ? a.tile.content : null,
      );
    // DragCancelOverlay routing (renderTile != null → renderTile(cancelArgs)).
    const markup: string = renderToStaticMarkup(renderTile(args));
    expect(markup).toContain('data-render-surface="drag-cancel"');
    expect(markup).toContain(`data-leaf-id="${SOURCE_LEAF}"`);
    expect(markup).toContain("Cancelled Pane");
    expect(markup).toContain("data-cancel-body");
    // The surface branch suppressed the interactive controls.
    expect(markup).not.toContain("<button");
    // And no built-in shell chrome leaked in.
    expect(markup).not.toContain("drag header to swap");
  });

  it("with no renderTile the cancel fly-back keeps the built-in shell fallback exactly", (): void => {
    const snapshot: TilingDragPaneSnapshot = buildDragPaneSnapshot(CANCEL_TILE);
    // DragCancelOverlay routing (renderTile == null → renderDragPaneShell(...)).
    const markup: string = renderToStaticMarkup(
      renderDragPaneShell(snapshot, NEON, true),
    );
    expect(markup).toContain("Cancelled Pane");
    expect(markup).not.toContain("data-custom-skin");
    expect(markup).toContain(accentHue("emerald").focusGlowSoft);
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
    expect(markup).toContain(accentHue("emerald").focusGlowSoft);
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
    expect(markup).toContain(accentHue("rose").focusGlowSoft);
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
