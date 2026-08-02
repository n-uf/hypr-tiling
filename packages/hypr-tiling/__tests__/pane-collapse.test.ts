import { describe, expect, it } from "@jest/globals";
import {
  findLeafById,
  isLeafCollapsed,
  setLeafCollapsed,
  toggleLeafCollapsed,
} from "../engine/state";
import { collectLeafFootprints, type TilingLeafFootprint } from "../engine/leaf-geometry";
import { isStaticAlongSplitAxis } from "../engine/pane-sizing";
import { commandRequiredCapability, isCommandEnabled } from "../engine/commands";
import type { TilingCommandGates } from "../engine/commands";
import {
  TILING_DASHBOARD_PRESET,
  resolveInteractionCapabilities,
} from "../engine/interaction-capabilities";
import { resolvePaneBodyRenderMode } from "../engine/drag-presentation";
import {
  TILING_DEFAULT_COLLAPSED_EXTENT_PX,
  type TilingLayoutConfig,
  type TilingLayoutNode,
  type TilingLeafNode,
  type TilingPaneSizing,
  type TilingSplitNode,
} from "../engine/types";

/**
 * Pure coverage for titlebar-only collapse (HT-PANE-COLLAPSE): the layout
 * reducers (`setLeafCollapsed` / `toggleLeafCollapsed`), the geometry reflow it
 * produces (a collapsed leaf pins its height to the chrome extent, its stacked
 * sibling reclaims the freed space), expand restore of the pre-collapse sizing,
 * the command→capability gate, and the body-render-mode + capability defaults.
 */

const COLLAPSE_PX = 40;
const GAP_FREE_CONFIG: TilingLayoutConfig = { gapPx: 0, minPaneSizePx: 0, handleSizePx: 0 };

function leaf(id: string, sizing?: TilingPaneSizing): TilingLeafNode {
  return sizing == null
    ? { kind: "leaf", id, tileId: `tile-${id}` }
    : { kind: "leaf", id, tileId: `tile-${id}`, sizing };
}

function vsplit(ratio: number, first: TilingLayoutNode, second: TilingLayoutNode): TilingSplitNode {
  return { kind: "split", id: `v-${first.id}-${second.id}`, axis: "vertical", ratio, first, second };
}

function hsplit(ratio: number, first: TilingLayoutNode, second: TilingLayoutNode): TilingSplitNode {
  return { kind: "split", id: `h-${first.id}-${second.id}`, axis: "horizontal", ratio, first, second };
}

function byId(footprints: ReadonlyArray<TilingLeafFootprint>): Map<string, TilingLeafFootprint> {
  return new Map(
    footprints.map((f: TilingLeafFootprint): [string, TilingLeafFootprint] => [f.leafId, f]),
  );
}

const ALL_ENABLED_GATES: TilingCommandGates = {
  maximizeEnabled: true,
  paneSwitchingEnabled: true,
  focusEnabled: true,
  rearrangeEnabled: true,
  sizingEnabled: true,
  acquireSpaceEnabled: true,
  collapseEnabled: true,
  resizeEnabled: true,
  layoutEnabled: true,
  groupingEnabled: true,
};

describe("setLeafCollapsed — leaf state", (): void => {
  it("collapses a leaf: pins height static to the extent, flags collapsed, snapshots restore", (): void => {
    const layout: TilingLayoutNode = vsplit(0.5, leaf("A"), leaf("B"));
    const next: TilingLayoutNode = setLeafCollapsed(layout, "A", true, COLLAPSE_PX);
    const a: TilingLeafNode | null = findLeafById(next, "A");
    expect(a?.collapsed).toBe(true);
    expect(a?.sizing?.height).toBe("static");
    expect(a?.sizing?.heightPx).toBe(COLLAPSE_PX);
    // The pinned dimension is recorded explicitly, not just re-derivable from
    // `sizing` — a consumer's chrome branches on this (HT-PANE-COLLAPSE-AXIS).
    expect(a?.collapsedDimension).toBe("height");
    // Prior sizing was flexible (undefined) → no restore snapshot recorded.
    expect(a?.collapsedRestore).toBeUndefined();
    expect(isLeafCollapsed(next, "A")).toBe(true);
    expect(isLeafCollapsed(next, "B")).toBe(false);
  });

  it("preserves a pre-collapse cross-axis (width) static pin and restores it on expand", (): void => {
    const layout: TilingLayoutNode = vsplit(0.5, leaf("A", { width: "static", widthPx: 120 }), leaf("B"));
    const collapsed: TilingLayoutNode = setLeafCollapsed(layout, "A", true, COLLAPSE_PX);
    const a: TilingLeafNode | null = findLeafById(collapsed, "A");
    // Width pin preserved through collapse; height overwritten with the collapse pin.
    expect(a?.sizing?.width).toBe("static");
    expect(a?.sizing?.widthPx).toBe(120);
    expect(a?.sizing?.height).toBe("static");
    expect(a?.sizing?.heightPx).toBe(COLLAPSE_PX);
    expect(a?.collapsedRestore).toEqual({ width: "static", widthPx: 120 });

    const expanded: TilingLayoutNode = setLeafCollapsed(collapsed, "A", false, COLLAPSE_PX);
    const restored: TilingLeafNode | null = findLeafById(expanded, "A");
    expect(restored?.collapsed).toBeUndefined();
    expect(restored?.collapsedRestore).toBeUndefined();
    expect(restored?.collapsedDimension).toBeUndefined();
    expect(restored?.sizing).toEqual({ width: "static", widthPx: 120 });
  });

  it("expand from a previously-flexible leaf clears the pin entirely", (): void => {
    const layout: TilingLayoutNode = vsplit(0.5, leaf("A"), leaf("B"));
    const collapsed: TilingLayoutNode = setLeafCollapsed(layout, "A", true, COLLAPSE_PX);
    const expanded: TilingLayoutNode = setLeafCollapsed(collapsed, "A", false, COLLAPSE_PX);
    const a: TilingLeafNode | null = findLeafById(expanded, "A");
    expect(a?.collapsed).toBeUndefined();
    expect(a?.sizing).toBeUndefined();
  });

  it("is idempotent: re-collapsing returns the same tree reference (restore not clobbered)", (): void => {
    const layout: TilingLayoutNode = vsplit(0.5, leaf("A", { width: "static", widthPx: 120 }), leaf("B"));
    const once: TilingLayoutNode = setLeafCollapsed(layout, "A", true, COLLAPSE_PX);
    const twice: TilingLayoutNode = setLeafCollapsed(once, "A", true, COLLAPSE_PX);
    expect(twice).toBe(once);
    expect(findLeafById(twice, "A")?.collapsedRestore).toEqual({ width: "static", widthPx: 120 });
  });

  it("a missing / no-op target returns the same tree reference", (): void => {
    const layout: TilingLayoutNode = vsplit(0.5, leaf("A"), leaf("B"));
    expect(setLeafCollapsed(layout, "missing", true, COLLAPSE_PX)).toBe(layout);
    // Expanding an already-expanded leaf is a no-op.
    expect(setLeafCollapsed(layout, "A", false, COLLAPSE_PX)).toBe(layout);
  });
});

describe("toggleLeafCollapsed", (): void => {
  it("flips collapse state and no-ops on a missing leaf", (): void => {
    const layout: TilingLayoutNode = vsplit(0.5, leaf("A"), leaf("B"));
    const collapsed: TilingLayoutNode = toggleLeafCollapsed(layout, "A", COLLAPSE_PX);
    expect(isLeafCollapsed(collapsed, "A")).toBe(true);
    const expanded: TilingLayoutNode = toggleLeafCollapsed(collapsed, "A", COLLAPSE_PX);
    expect(isLeafCollapsed(expanded, "A")).toBe(false);
    expect(toggleLeafCollapsed(layout, "missing", COLLAPSE_PX)).toBe(layout);
  });
});

describe("collapse geometry — stacked (vertical) split reflow", (): void => {
  it("collapsed FIRST leaf shrinks to the extent; the sibling reclaims the freed height", (): void => {
    const base: TilingLayoutNode = vsplit(0.5, leaf("A"), leaf("B"));
    const collapsed: TilingLayoutNode = setLeafCollapsed(base, "A", true, COLLAPSE_PX);
    const map = byId(collectLeafFootprints(collapsed, 0, 0, 1000, 800, GAP_FREE_CONFIG));
    expect(map.get("A")).toEqual({ leafId: "A", left: 0, top: 0, width: 1000, height: COLLAPSE_PX });
    expect(map.get("B")).toEqual({
      leafId: "B",
      left: 0,
      top: COLLAPSE_PX,
      width: 1000,
      height: 800 - COLLAPSE_PX,
    });
  });

  it("collapsed SECOND leaf pins to the extent at the bottom; the first fills the rest", (): void => {
    const base: TilingLayoutNode = vsplit(0.5, leaf("A"), leaf("B"));
    const collapsed: TilingLayoutNode = setLeafCollapsed(base, "B", true, COLLAPSE_PX);
    const map = byId(collectLeafFootprints(collapsed, 0, 0, 1000, 800, GAP_FREE_CONFIG));
    expect(map.get("A")?.height).toBe(800 - COLLAPSE_PX);
    expect(map.get("B")?.top).toBe(800 - COLLAPSE_PX);
    expect(map.get("B")?.height).toBe(COLLAPSE_PX);
  });

  it("expand restores the flexible ratio distribution", (): void => {
    const base: TilingLayoutNode = vsplit(0.5, leaf("A"), leaf("B"));
    const roundTrip: TilingLayoutNode = setLeafCollapsed(
      setLeafCollapsed(base, "A", true, COLLAPSE_PX),
      "A",
      false,
      COLLAPSE_PX,
    );
    const map = byId(collectLeafFootprints(roundTrip, 0, 0, 1000, 800, GAP_FREE_CONFIG));
    expect(map.get("A")?.height).toBe(400);
    expect(map.get("B")?.height).toBe(400);
  });

  it("both stacked siblings collapsed: normalize un-collapses the demoted second (collapse truth stays in sync with geometry)", (): void => {
    const base: TilingLayoutNode = vsplit(0.5, leaf("A"), leaf("B"));
    const both: TilingLayoutNode = setLeafCollapsed(
      setLeafCollapsed(base, "A", true, COLLAPSE_PX),
      "B",
      true,
      COLLAPSE_PX,
    );
    const split = both as TilingSplitNode;
    const firstStatic: boolean = isStaticAlongSplitAxis(split.first, "vertical");
    const secondStatic: boolean = isStaticAlongSplitAxis(split.second, "vertical");
    expect(firstStatic && secondStatic).toBe(false);

    // "A" stays collapsed; "B" — demoted back to flexible by the both-static
    // backstop — is fully un-collapsed rather than left `collapsed: true` while
    // geometrically expanded (HT-PANE-COLLAPSE collapse/geometry coherence).
    const a: TilingLeafNode | null = findLeafById(both, "A");
    const b: TilingLeafNode | null = findLeafById(both, "B");
    expect(a?.collapsed).toBe(true);
    expect(a?.collapsedDimension).toBe("height");
    expect(b?.collapsed).toBeUndefined();
    expect(b?.collapsedRestore).toBeUndefined();
    expect(b?.collapsedDimension).toBeUndefined();
    expect(b?.sizing).toBeUndefined();

    const map = byId(collectLeafFootprints(both, 0, 0, 1000, 800, GAP_FREE_CONFIG));
    expect(map.get("A")?.height).toBe(COLLAPSE_PX);
    expect(map.get("B")?.height).toBe(800 - COLLAPSE_PX);
  });
});

describe("collapse geometry — side-by-side (horizontal) split is along-axis (width)", (): void => {
  it("collapse in a horizontal split pins WIDTH (the along-axis dimension), not height", (): void => {
    const base: TilingLayoutNode = hsplit(0.5, leaf("A"), leaf("B"));
    const collapsed: TilingLayoutNode = setLeafCollapsed(base, "A", true, COLLAPSE_PX);
    const a: TilingLeafNode | null = findLeafById(collapsed, "A");
    expect(a?.sizing?.width).toBe("static");
    expect(a?.sizing?.widthPx).toBe(COLLAPSE_PX);
    expect(a?.sizing?.height).toBeUndefined();
    expect(a?.collapsedDimension).toBe("width");
    expect(isStaticAlongSplitAxis(a as TilingLeafNode, "horizontal")).toBe(true);
  });

  it("collapsed FIRST leaf shrinks to the extent WIDTH; the sibling reclaims the freed width", (): void => {
    const base: TilingLayoutNode = hsplit(0.5, leaf("A"), leaf("B"));
    const collapsed: TilingLayoutNode = setLeafCollapsed(base, "A", true, COLLAPSE_PX);
    const map = byId(collectLeafFootprints(collapsed, 0, 0, 1000, 800, GAP_FREE_CONFIG));
    expect(map.get("A")).toEqual({ leafId: "A", left: 0, top: 0, width: COLLAPSE_PX, height: 800 });
    expect(map.get("B")).toEqual({
      leafId: "B",
      left: COLLAPSE_PX,
      top: 0,
      width: 1000 - COLLAPSE_PX,
      height: 800,
    });
  });

  it("collapsed SECOND leaf pins to the extent at the right edge; the first fills the rest", (): void => {
    const base: TilingLayoutNode = hsplit(0.5, leaf("A"), leaf("B"));
    const collapsed: TilingLayoutNode = setLeafCollapsed(base, "B", true, COLLAPSE_PX);
    const map = byId(collectLeafFootprints(collapsed, 0, 0, 1000, 800, GAP_FREE_CONFIG));
    expect(map.get("A")?.width).toBe(1000 - COLLAPSE_PX);
    expect(map.get("B")?.left).toBe(1000 - COLLAPSE_PX);
    expect(map.get("B")?.width).toBe(COLLAPSE_PX);
  });

  it("expand restores the flexible ratio distribution (horizontal)", (): void => {
    const base: TilingLayoutNode = hsplit(0.5, leaf("A"), leaf("B"));
    const roundTrip: TilingLayoutNode = setLeafCollapsed(
      setLeafCollapsed(base, "A", true, COLLAPSE_PX),
      "A",
      false,
      COLLAPSE_PX,
    );
    const map = byId(collectLeafFootprints(roundTrip, 0, 0, 1000, 800, GAP_FREE_CONFIG));
    expect(map.get("A")?.width).toBe(500);
    expect(map.get("B")?.width).toBe(500);
  });

  it("preserves a pre-collapse cross-axis (height) static pin, shrinks the footprint to it, and restores on expand", (): void => {
    const base: TilingLayoutNode = hsplit(
      0.5,
      leaf("A", { height: "static", heightPx: 120 }),
      leaf("B"),
    );
    const collapsed: TilingLayoutNode = setLeafCollapsed(base, "A", true, COLLAPSE_PX);
    const a: TilingLeafNode | null = findLeafById(collapsed, "A");
    expect(a?.sizing?.height).toBe("static");
    expect(a?.sizing?.heightPx).toBe(120);
    expect(a?.sizing?.width).toBe("static");
    expect(a?.sizing?.widthPx).toBe(COLLAPSE_PX);
    expect(a?.collapsedRestore).toEqual({ height: "static", heightPx: 120 });
    // Footprint mirrors the DOM `align-self: flex-start` cross-axis content-size
    // (HT-PANE-COLLAPSE footprint/DOM divergence fix): height shrinks to 120,
    // not the full 800px container — no phantom full-column rect.
    const map = byId(collectLeafFootprints(collapsed, 0, 0, 1000, 800, GAP_FREE_CONFIG));
    expect(map.get("A")).toEqual({ leafId: "A", left: 0, top: 0, width: COLLAPSE_PX, height: 120 });

    const expanded: TilingLayoutNode = setLeafCollapsed(collapsed, "A", false, COLLAPSE_PX);
    const restored: TilingLeafNode | null = findLeafById(expanded, "A");
    expect(restored?.collapsed).toBeUndefined();
    expect(restored?.sizing).toEqual({ height: "static", heightPx: 120 });
  });

  it("both side-by-side siblings collapsed: normalize un-collapses the demoted second (collapse truth stays in sync with geometry)", (): void => {
    const base: TilingLayoutNode = hsplit(0.5, leaf("A"), leaf("B"));
    const both: TilingLayoutNode = setLeafCollapsed(
      setLeafCollapsed(base, "A", true, COLLAPSE_PX),
      "B",
      true,
      COLLAPSE_PX,
    );
    const split = both as TilingSplitNode;
    const firstStatic: boolean = isStaticAlongSplitAxis(split.first, "horizontal");
    const secondStatic: boolean = isStaticAlongSplitAxis(split.second, "horizontal");
    expect(firstStatic && secondStatic).toBe(false);

    // "A" stays collapsed (the pin that survives); "B" is fully un-collapsed —
    // never a fully-expanded pane still flagged `collapsed: true` with an
    // emptied body.
    const a: TilingLeafNode | null = findLeafById(both, "A");
    const b: TilingLeafNode | null = findLeafById(both, "B");
    expect(a?.collapsed).toBe(true);
    expect(a?.collapsedDimension).toBe("width");
    expect(b?.collapsed).toBeUndefined();
    expect(b?.collapsedRestore).toBeUndefined();
    expect(b?.collapsedDimension).toBeUndefined();
    expect(b?.sizing).toBeUndefined();

    const map = byId(collectLeafFootprints(both, 0, 0, 1000, 800, GAP_FREE_CONFIG));
    expect(map.get("A")?.width).toBe(COLLAPSE_PX);
    expect(map.get("B")?.width).toBe(1000 - COLLAPSE_PX);
  });
});

describe("collapse geometry — cross-axis static footprint (HT-PANE-COLLAPSE footprint/DOM divergence)", (): void => {
  it("shrinks a cross-axis-static leaf's footprint to its pin instead of the full container extent", (): void => {
    // Not collapse-specific: any leaf static on the CROSS axis (align-self:
    // flex-start in the DOM) must not report a phantom full-cross-extent rect.
    const layout: TilingLayoutNode = hsplit(
      0.5,
      leaf("A", { height: "static", heightPx: 100 }),
      leaf("B"),
    );
    const map = byId(collectLeafFootprints(layout, 0, 0, 1000, 800, GAP_FREE_CONFIG));
    expect(map.get("A")).toEqual({ leafId: "A", left: 0, top: 0, width: 500, height: 100 });
    expect(map.get("B")).toEqual({ leafId: "B", left: 500, top: 0, width: 500, height: 800 });
  });
});

describe("collapse command gate", (): void => {
  it("maps toggle-collapse / set-collapsed to the collapse capability", (): void => {
    expect(commandRequiredCapability({ kind: "toggle-collapse" })).toBe("collapseEnabled");
    expect(commandRequiredCapability({ kind: "set-collapsed", collapsed: true })).toBe(
      "collapseEnabled",
    );
  });

  it("gates dispatch on collapseEnabled", (): void => {
    expect(isCommandEnabled({ kind: "toggle-collapse" }, ALL_ENABLED_GATES)).toBe(true);
    expect(
      isCommandEnabled(
        { kind: "toggle-collapse" },
        { ...ALL_ENABLED_GATES, collapseEnabled: false },
      ),
    ).toBe(false);
    expect(
      isCommandEnabled(
        { kind: "set-collapsed", collapsed: false },
        { ...ALL_ENABLED_GATES, collapseEnabled: false },
      ),
    ).toBe(false);
  });
});

describe("collapse capability defaults", (): void => {
  it("collapse is opt-in (default false) and an explicit true is respected", (): void => {
    expect(resolveInteractionCapabilities(undefined).paneTitleBarControls.collapse).toBe(false);
    expect(
      resolveInteractionCapabilities({ paneTitleBarControls: { collapse: true } })
        .paneTitleBarControls.collapse,
    ).toBe(true);
    // Sibling controls keep their all-enabled defaults regardless.
    const partial = resolveInteractionCapabilities({ paneTitleBarControls: { collapse: true } });
    expect(partial.paneTitleBarControls.sizing).toBe(true);
    expect(partial.paneTitleBarControls.acquireSpace).toBe(true);
  });

  it("the dashboard preset resolves collapse off", (): void => {
    expect(
      resolveInteractionCapabilities(TILING_DASHBOARD_PRESET).paneTitleBarControls.collapse,
    ).toBe(false);
  });
});

describe("collapsed pane body render mode", (): void => {
  it("a collapsed pane empties its body (titlebar-only) even when content is visible", (): void => {
    expect(resolvePaneBodyRenderMode(false, true, true)).toBe("render-empty");
    expect(resolvePaneBodyRenderMode(false, true, false)).toBe("render-content");
    // A ghost-seat reservation still wins over collapse.
    expect(resolvePaneBodyRenderMode(true, true, true)).toBe("render-reservation");
  });
});

describe("default collapsed extent", (): void => {
  it("exposes a positive default titlebar extent", (): void => {
    expect(TILING_DEFAULT_COLLAPSED_EXTENT_PX).toBeGreaterThan(0);
  });
});
