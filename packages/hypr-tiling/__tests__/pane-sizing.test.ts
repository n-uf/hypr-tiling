import { describe, expect, it } from "@jest/globals";
import {
  clampByMinSize,
  crossAxisDimension,
  isStaticAlongSplitAxis,
  isStaticInDimension,
  isStaticOnCrossAxis,
  layoutContainsStaticPane,
  measuredStaticSizing,
  RATIO_SAFETY_BOUNDS_DEFAULT,
  RATIO_SAFETY_BOUNDS_UNBOUNDED,
  renormalizeFlexibleRatios,
  resolveAlongAxisFloor,
  resolveAlongAxisMinPaneSizePx,
  resolveBinarySplitDistribution,
  resolveEffectiveStaticAlong,
  resolveRatioSafetyBounds,
  resolveStaticAlongExtents,
  resolveSizingMode,
  shouldRenderSplitDivider,
  splitAxisDimension,
  splitBoundaryGutterPx,
  titleBarSizingModeId,
} from "../engine/pane-sizing";
import { TILING_DEFAULT_COLLAPSED_EXTENT_PX } from "../engine/types";
import type {
  TilingLayoutConfig,
  TilingLeafNode,
  TilingLayoutNode,
  TilingMinBBoxPx,
  TilingPaneSizing,
} from "../engine/types";

function leaf(
  id: string,
  sizing?: TilingPaneSizing,
  minBBoxPx?: TilingMinBBoxPx,
  resizeFloor?: "body" | "chrome",
): TilingLeafNode {
  const node: TilingLeafNode = { kind: "leaf", id, tileId: id, sizing };
  if (minBBoxPx != null) {
    node.minBBoxPx = minBBoxPx;
  }
  if (resizeFloor != null) {
    node.resizeFloor = resizeFloor;
  }
  return node;
}

function split(axis: "horizontal" | "vertical", first: TilingLayoutNode, second: TilingLayoutNode, minPaneSizePx?: number): TilingLayoutNode {
  return { kind: "split", id: `${axis}-${first.id}-${second.id}`, axis, ratio: 0.5, first, second, minPaneSizePx };
}

const CONFIG: TilingLayoutConfig = { gapPx: 8, minPaneSizePx: 96, handleSizePx: 4 };

describe("split-axis → dimension mapping", () => {
  it("maps horizontal split (flex-row, side-by-side) to width main axis", () => {
    expect(splitAxisDimension("horizontal")).toBe("width");
    expect(crossAxisDimension("horizontal")).toBe("height");
  });

  it("maps vertical split (flex-col, stacked) to height main axis", () => {
    expect(splitAxisDimension("vertical")).toBe("height");
    expect(crossAxisDimension("vertical")).toBe("width");
  });
});

describe("resolveSizingMode (undefined defaults to flexible)", () => {
  it("returns flexible for undefined sizing and undefined dimensions", () => {
    expect(resolveSizingMode(undefined, "width")).toBe("flexible");
    expect(resolveSizingMode({}, "height")).toBe("flexible");
    expect(resolveSizingMode({ width: "static" }, "height")).toBe("flexible");
  });

  it("returns the declared mode for a present dimension", () => {
    expect(resolveSizingMode({ width: "static" }, "width")).toBe("static");
    expect(resolveSizingMode({ height: "flexible" }, "height")).toBe("flexible");
  });
});

describe("per-dimension static predicates across vertical vs horizontal parents", () => {
  it("static-height-only: along-axis in a VERTICAL split, cross-axis in a HORIZONTAL split", () => {
    const node = leaf("a", { height: "static" });
    expect(isStaticInDimension(node, "height")).toBe(true);
    expect(isStaticInDimension(node, "width")).toBe(false);

    // Vertical parent → main axis is height → static-height runs ALONG the axis.
    expect(isStaticAlongSplitAxis(node, "vertical")).toBe(true);
    expect(isStaticOnCrossAxis(node, "vertical")).toBe(false);

    // Horizontal parent → main axis is width → static-height is the CROSS axis.
    expect(isStaticAlongSplitAxis(node, "horizontal")).toBe(false);
    expect(isStaticOnCrossAxis(node, "horizontal")).toBe(true);
  });

  it("static-width-only: along-axis in a HORIZONTAL split, cross-axis in a VERTICAL split", () => {
    const node = leaf("a", { width: "static" });

    expect(isStaticAlongSplitAxis(node, "horizontal")).toBe(true);
    expect(isStaticOnCrossAxis(node, "horizontal")).toBe(false);

    expect(isStaticAlongSplitAxis(node, "vertical")).toBe(false);
    expect(isStaticOnCrossAxis(node, "vertical")).toBe(true);
  });

  it("both: static along the axis AND cross axis for either parent orientation", () => {
    const node = leaf("a", { width: "static", height: "static" });

    expect(isStaticAlongSplitAxis(node, "vertical")).toBe(true);
    expect(isStaticOnCrossAxis(node, "vertical")).toBe(true);
    expect(isStaticAlongSplitAxis(node, "horizontal")).toBe(true);
    expect(isStaticOnCrossAxis(node, "horizontal")).toBe(true);
  });

  it("flexible (no sizing): never static in either dimension", () => {
    const node = leaf("a");
    expect(isStaticAlongSplitAxis(node, "vertical")).toBe(false);
    expect(isStaticOnCrossAxis(node, "vertical")).toBe(false);
    expect(isStaticAlongSplitAxis(node, "horizontal")).toBe(false);
    expect(isStaticOnCrossAxis(node, "horizontal")).toBe(false);
  });
});

describe("layoutContainsStaticPane (whole-tree drag gate)", () => {
  it("returns false for an all-flexible tree", () => {
    const tree: TilingLayoutNode = {
      kind: "split",
      id: "s",
      axis: "vertical",
      ratio: 0.5,
      first: leaf("a"),
      second: leaf("b"),
    };
    expect(layoutContainsStaticPane(tree)).toBe(false);
  });

  it("returns true when any nested leaf is static in any dimension", () => {
    const tree: TilingLayoutNode = {
      kind: "split",
      id: "s",
      axis: "vertical",
      ratio: 0.5,
      first: leaf("a"),
      second: {
        kind: "split",
        id: "s2",
        axis: "horizontal",
        ratio: 0.5,
        first: leaf("b", { height: "static" }),
        second: leaf("c"),
      },
    };
    expect(layoutContainsStaticPane(tree)).toBe(true);
  });

  it("returns true when a split node itself declares static sizing", () => {
    const tree: TilingLayoutNode = {
      kind: "split",
      id: "s",
      axis: "vertical",
      ratio: 0.5,
      sizing: { height: "static" },
      first: leaf("a"),
      second: leaf("b"),
    };
    expect(layoutContainsStaticPane(tree)).toBe(true);
  });
});

describe("shouldRenderSplitDivider (handle only between flexible-along-axis boundaries)", () => {
  it("renders the divider only when resize enabled and neither boundary is static along the axis", () => {
    expect(
      shouldRenderSplitDivider({
        resizeEnabled: true,
        firstStaticAlongAxis: false,
        secondStaticAlongAxis: false,
      }),
    ).toBe(true);
  });

  it("omits the divider when resize is disabled", () => {
    expect(
      shouldRenderSplitDivider({
        resizeEnabled: false,
        firstStaticAlongAxis: false,
        secondStaticAlongAxis: false,
      }),
    ).toBe(false);
  });

  it("omits the divider when either boundary is static along the axis", () => {
    expect(
      shouldRenderSplitDivider({
        resizeEnabled: true,
        firstStaticAlongAxis: true,
        secondStaticAlongAxis: false,
      }),
    ).toBe(false);
    expect(
      shouldRenderSplitDivider({
        resizeEnabled: true,
        firstStaticAlongAxis: false,
        secondStaticAlongAxis: true,
      }),
    ).toBe(false);
  });
});

describe("renormalizeFlexibleRatios (flexible-only distribution)", () => {
  it("leaves two flexible ratios summing to 1 unchanged", () => {
    expect(
      renormalizeFlexibleRatios([
        { ratio: 0.3, staticAlongAxis: false },
        { ratio: 0.7, staticAlongAxis: false },
      ]),
    ).toEqual([0.3, 0.7]);
  });

  it("assigns weight 0 to static children and 1.0 to the sole flexible child", () => {
    expect(
      renormalizeFlexibleRatios([
        { ratio: 0.24, staticAlongAxis: true },
        { ratio: 0.76, staticAlongAxis: false },
      ]),
    ).toEqual([0, 1]);
  });

  it("renormalizes flexible ratios over flexible children only (ignoring static)", () => {
    const weights = renormalizeFlexibleRatios([
      { ratio: 0.2, staticAlongAxis: false },
      { ratio: 0.5, staticAlongAxis: true },
      { ratio: 0.6, staticAlongAxis: false },
    ]);
    expect(weights[1]).toBe(0);
    expect(weights[0]).toBeCloseTo(0.25, 10);
    expect(weights[2]).toBeCloseTo(0.75, 10);
    expect(weights[0] + weights[2]).toBeCloseTo(1, 10);
  });

  it("splits evenly when flexible ratios sum to zero", () => {
    expect(
      renormalizeFlexibleRatios([
        { ratio: 0, staticAlongAxis: false },
        { ratio: 0, staticAlongAxis: false },
      ]),
    ).toEqual([0.5, 0.5]);
  });

  it("returns all-zero weights when every child is static", () => {
    expect(
      renormalizeFlexibleRatios([
        { ratio: 0.5, staticAlongAxis: true },
        { ratio: 0.5, staticAlongAxis: true },
      ]),
    ).toEqual([0, 0]);
  });
});

describe("resolveBinarySplitDistribution", () => {
  it("both flexible → ratio distribution", () => {
    expect(resolveBinarySplitDistribution(false, false, 0.24)).toEqual({
      first: { kind: "ratio", basisFraction: 0.24 },
      second: { kind: "ratio", basisFraction: 0.76 },
    });
  });

  it("first static → first content-sized, second fills the rest", () => {
    expect(resolveBinarySplitDistribution(true, false, 0.24)).toEqual({
      first: { kind: "content" },
      second: { kind: "fill" },
    });
  });

  it("second static → second content-sized, first fills the rest", () => {
    expect(resolveBinarySplitDistribution(false, true, 0.7)).toEqual({
      first: { kind: "fill" },
      second: { kind: "content" },
    });
  });

  it("both static, non-collapsed (bothCollapsedVoid omitted/false) → first content-sized, second FILLS (backstop: axis must keep a filler)", () => {
    // Round-2 static-gap backstop: two fixed extents cannot sum to a variable
    // container, so even a both-static-along-axis split must keep one filling
    // child or it opens a trailing gap on container resize. This arm only
    // reaches the renderer via an unnormalized tree — `normalizeStaticAxisFill`
    // forbids storing it for any OTHER both-static-along-axis pair.
    expect(resolveBinarySplitDistribution(true, true, 0.5)).toEqual({
      first: { kind: "content" },
      second: { kind: "fill" },
    });
    expect(resolveBinarySplitDistribution(true, true, 0.5, false)).toEqual({
      first: { kind: "content" },
      second: { kind: "fill" },
    });
  });

  it("both static, bothCollapsedVoid=true (HT-PANE-COLLAPSE-VOID) → BOTH content-sized, no filler", () => {
    // Both-collapsed siblings never drift with the container the way an
    // arbitrary static pin can, so there is no Round-2 gap to guard against —
    // the locked design prefers both stay collapsed with a split slack void.
    expect(resolveBinarySplitDistribution(true, true, 0.5, true)).toEqual({
      first: { kind: "content" },
      second: { kind: "content" },
    });
  });

  it("NO distribution branch returns two non-flexing (content) children", () => {
    const inputs: ReadonlyArray<readonly [boolean, boolean]> = [
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ];
    for (const [firstStatic, secondStatic] of inputs) {
      const distribution = resolveBinarySplitDistribution(firstStatic, secondStatic, 0.5);
      const bothContent: boolean =
        distribution.first.kind === "content" && distribution.second.kind === "content";
      expect(bothContent).toBe(false);
    }
  });
});

describe("splitBoundaryGutterPx / resolveStaticAlongExtents", () => {
  it("boundary gutter is gapPx + handleSizePx (flexible and static share the same total)", () => {
    expect(splitBoundaryGutterPx(8, 4)).toBe(12);
    expect(splitBoundaryGutterPx(0, 4)).toBe(4);
    expect(splitBoundaryGutterPx(8, 0)).toBe(8);
    expect(splitBoundaryGutterPx(-2, -3)).toBe(0);
  });

  it("static-first: pin exact, gutter reserved, flexible fills remainder", () => {
    expect(resolveStaticAlongExtents(1000, 200, true, 10, 4)).toEqual({
      firstPx: 200,
      secondPx: 786,
      gutterPx: 14,
    });
  });

  it("static-second: flexible fills leading remainder after pin + gutter", () => {
    expect(resolveStaticAlongExtents(1000, 384, false, 8, 4)).toEqual({
      firstPx: 1000 - 384 - 12,
      secondPx: 384,
      gutterPx: 12,
    });
  });

  it("returns null when pin + gutter cannot fit (fit-guard)", () => {
    expect(resolveStaticAlongExtents(1000, 990, true, 10, 4)).toBeNull();
    expect(resolveStaticAlongExtents(1000, 0, true, 10, 4)).toBeNull();
  });
});

describe("resolveEffectiveStaticAlong (pin fit-guard demotes to flexible)", () => {
  it("keeps a fitting pin as static-along and returns extents", () => {
    const resolved = resolveEffectiveStaticAlong(true, false, 256, null, 1200, 8, 4);
    expect(resolved.firstStaticAlongAxis).toBe(true);
    expect(resolved.secondStaticAlongAxis).toBe(false);
    expect(resolved.staticExtents).toEqual({
      firstPx: 256,
      secondPx: 1200 - 256 - 12,
      gutterPx: 12,
    });
  });

  it("demotes a non-fitting pin to flexible so DOM can fall back to ratio", () => {
    // pin 990 + gutter 14 does not fit 1000 — treat as flexible this frame.
    const resolved = resolveEffectiveStaticAlong(true, false, 990, null, 1000, 10, 4);
    expect(resolved.firstStaticAlongAxis).toBe(false);
    expect(resolved.secondStaticAlongAxis).toBe(false);
    expect(resolved.staticExtents).toBeNull();
  });

  it("demotes a non-fitting second-child pin (annotate review-in-tight-fill)", () => {
    const resolved = resolveEffectiveStaticAlong(false, true, null, 320, 330, 8, 4);
    expect(resolved.firstStaticAlongAxis).toBe(false);
    expect(resolved.secondStaticAlongAxis).toBe(false);
    expect(resolved.staticExtents).toBeNull();
  });

  it("bothCollapsedVoid omitted (default false): both static + both pinned still falls to the single-pin (first-wins) branch", () => {
    const resolved = resolveEffectiveStaticAlong(true, true, 40, 40, 1000, 0, 0);
    expect(resolved.firstStaticAlongAxis).toBe(true);
    expect(resolved.secondStaticAlongAxis).toBe(true);
    // Without the flag, the second child's "pin" is really the leftover
    // container space, not its own 40px extent — the pre-HT-PANE-COLLAPSE-VOID
    // behavior this function must NOT apply outside the both-collapsed case.
    expect(resolved.staticExtents).toEqual({ firstPx: 40, secondPx: 960, gutterPx: 0 });
  });

  it("bothCollapsedVoid=true (HT-PANE-COLLAPSE-VOID): both static + both fitting pins keep their OWN extents, leftover space unaccounted", () => {
    const resolved = resolveEffectiveStaticAlong(true, true, 40, 40, 1000, 0, 0, true);
    expect(resolved.firstStaticAlongAxis).toBe(true);
    expect(resolved.secondStaticAlongAxis).toBe(true);
    expect(resolved.staticExtents).toEqual({ firstPx: 40, secondPx: 40, gutterPx: 0 });
  });

  it("bothCollapsedVoid=true still fit-guards: a non-positive pin falls through to the single-pin branch", () => {
    const resolved = resolveEffectiveStaticAlong(true, true, 40, 0, 1000, 0, 0, true);
    // secondPinPx is not a usable pin (<=0) → the dual-pin arm does not apply;
    // falls back to the first-wins single-pin branch (still fits).
    expect(resolved.staticExtents).toEqual({ firstPx: 40, secondPx: 960, gutterPx: 0 });
  });

  it("bothCollapsedVoid=true with the void larger than the container: both pins still honored (no refuse, no demote)", () => {
    // Two 40px collapse extents in a 50px container is a pathological edge
    // case, but the locked design is "not refuse" — both keep their own pin
    // rather than being demoted back to flexible.
    const resolved = resolveEffectiveStaticAlong(true, true, 40, 40, 50, 0, 0, true);
    expect(resolved.firstStaticAlongAxis).toBe(true);
    expect(resolved.secondStaticAlongAxis).toBe(true);
    expect(resolved.staticExtents).toEqual({ firstPx: 40, secondPx: 40, gutterPx: 0 });
  });
});

describe("measuredStaticSizing (title-bar bbox freeze — pure set/clear)", () => {
  it("FLEX clears the sizing (returns undefined)", () => {
    expect(measuredStaticSizing("flexible", 412, 318)).toBeUndefined();
  });

  it("STATIC H pins height only to the measured px", () => {
    expect(measuredStaticSizing("static-height", 412, 318)).toEqual({
      height: "static",
      heightPx: 318,
    });
  });

  it("STATIC W pins width only to the measured px", () => {
    expect(measuredStaticSizing("static-width", 412, 318)).toEqual({
      width: "static",
      widthPx: 412,
    });
  });

  it("BOTH pins width and height to the measured px", () => {
    expect(measuredStaticSizing("static-both", 412, 318)).toEqual({
      width: "static",
      height: "static",
      widthPx: 412,
      heightPx: 318,
    });
  });

  it("captures the exact measured value verbatim (no rounding inside the pure helper)", () => {
    expect(measuredStaticSizing("static-both", 100.5, 200.25)).toEqual({
      width: "static",
      height: "static",
      widthPx: 100.5,
      heightPx: 200.25,
    });
  });

  // Zero/negative-px guard (locks the §5 collapse amplifier): a non-positive
  // measured dimension must NEVER produce a `*Px:0` static pin — that pin +
  // flexShrink:0 collapses the pane and opens the reported dead-space gap.
  it("BOTH with a 0×0 measurement yields NO static pin (returns undefined)", () => {
    expect(measuredStaticSizing("static-both", 0, 0)).toBeUndefined();
  });

  it("STATIC H with a 0 height measurement yields NO height pin (returns undefined)", () => {
    expect(measuredStaticSizing("static-height", 412, 0)).toBeUndefined();
  });

  it("STATIC W with a 0 width measurement yields NO width pin (returns undefined)", () => {
    expect(measuredStaticSizing("static-width", 0, 318)).toBeUndefined();
  });

  it("negative measured px never becomes a static pin", () => {
    expect(measuredStaticSizing("static-both", -10, -20)).toBeUndefined();
    expect(measuredStaticSizing("static-height", 412, -1)).toBeUndefined();
    expect(measuredStaticSizing("static-width", -1, 318)).toBeUndefined();
  });

  it("BOTH with one non-positive dimension pins only the positive one (no zero pin)", () => {
    expect(measuredStaticSizing("static-both", 412, 0)).toEqual({
      width: "static",
      widthPx: 412,
    });
    expect(measuredStaticSizing("static-both", 0, 318)).toEqual({
      height: "static",
      heightPx: 318,
    });
  });
});

describe("static-switch layout-sum invariant (no zero/collapsed pin, no dead space)", () => {
  // Composes the pure core the renderer uses on a STATIC switch: a flexible leaf
  // is measured (>0) and pinned, its sibling resolves to `fill`, and the pinned
  // px + fill px reconstruct the container with no gap. Replicates the renderer's
  // `childMainPx` fill math (fill child absorbs `container − pinnedPx`).
  it("static-along-axis leaf pins >0, sibling fills, pinned + fill ≈ container", () => {
    const containerPx: number = 800;
    const measuredHeightPx: number = 318;
    const sizing: TilingPaneSizing | undefined = measuredStaticSizing(
      "static-height",
      412,
      measuredHeightPx,
    );
    expect(sizing).toEqual({ height: "static", heightPx: 318 });
    const pinnedPx: number = sizing?.heightPx ?? 0;
    expect(pinnedPx).toBeGreaterThan(0);

    // The pinned leaf is static-along-axis (height) in a vertical split → content,
    // sibling → fill.
    const distribution = resolveBinarySplitDistribution(true, false, 0.5);
    expect(distribution.first).toEqual({ kind: "content" });
    expect(distribution.second).toEqual({ kind: "fill" });

    const fillPx: number = containerPx - pinnedPx;
    expect(fillPx).toBeGreaterThan(0);
    expect(pinnedPx + fillPx).toBe(containerPx);
  });

  it("a missed measurement (0 px) yields no pin, so the leaf stays flexible (no collapse)", () => {
    const sizing: TilingPaneSizing | undefined = measuredStaticSizing("static-height", 412, 0);
    expect(sizing).toBeUndefined();
    // With no static pin the leaf remains flexible-along-axis; both siblings stay
    // ratio-distributed and reconstruct the container — no zero-collapse gap.
    const distribution = resolveBinarySplitDistribution(false, false, 0.5);
    expect(distribution.first).toEqual({ kind: "ratio", basisFraction: 0.5 });
    expect(distribution.second).toEqual({ kind: "ratio", basisFraction: 0.5 });
  });
});

describe("titleBarSizingModeId (active control state from resolved modes)", () => {
  it("flexible when both dimensions are flexible", () => {
    expect(titleBarSizingModeId("flexible", "flexible")).toBe("flexible");
  });

  it("static-height when only height is static", () => {
    expect(titleBarSizingModeId("flexible", "static")).toBe("static-height");
  });

  it("static-width when only width is static", () => {
    expect(titleBarSizingModeId("static", "flexible")).toBe("static-width");
  });

  it("static-both when both dimensions are static", () => {
    expect(titleBarSizingModeId("static", "static")).toBe("static-both");
  });
});

describe("resolveAlongAxisMinPaneSizePx (HT-MIN-BBOX-PX precedence)", () => {
  it("falls through to config.minPaneSizePx when neither leaf.minBBoxPx nor split.minPaneSizePx are set", () => {
    expect(resolveAlongAxisMinPaneSizePx(leaf("A"), "horizontal", undefined, 96)).toBe(96);
  });

  it("split.minPaneSizePx wins over config.minPaneSizePx", () => {
    expect(resolveAlongAxisMinPaneSizePx(leaf("A"), "horizontal", 40, 96)).toBe(40);
  });

  it("leaf.minBBoxPx (along-axis component) wins over split.minPaneSizePx and config.minPaneSizePx", () => {
    const withFloor = leaf("A", undefined, { widthPx: 300 });
    expect(resolveAlongAxisMinPaneSizePx(withFloor, "horizontal", 40, 96)).toBe(300);
  });

  it("reads widthPx for a horizontal split and heightPx for a vertical split", () => {
    const withBoth = leaf("A", undefined, { widthPx: 300, heightPx: 150 });
    expect(resolveAlongAxisMinPaneSizePx(withBoth, "horizontal", undefined, 96)).toBe(300);
    expect(resolveAlongAxisMinPaneSizePx(withBoth, "vertical", undefined, 96)).toBe(150);
  });

  it("the CROSS-axis component does not leak into the along-axis floor", () => {
    // Only heightPx set — irrelevant to a horizontal split's along-axis (width).
    const crossOnly = leaf("A", undefined, { heightPx: 300 });
    expect(resolveAlongAxisMinPaneSizePx(crossOnly, "horizontal", 40, 96)).toBe(40);
  });

  it("ignores a non-positive or non-finite leaf floor (falls through)", () => {
    expect(resolveAlongAxisMinPaneSizePx(leaf("A", undefined, { widthPx: 0 }), "horizontal", 40, 96)).toBe(40);
    expect(resolveAlongAxisMinPaneSizePx(leaf("A", undefined, { widthPx: -10 }), "horizontal", 40, 96)).toBe(40);
    expect(
      resolveAlongAxisMinPaneSizePx(leaf("A", undefined, { widthPx: Number.NaN }), "horizontal", 40, 96),
    ).toBe(40);
  });

  it("a nested split/group child has no leaf floor at this boundary (falls through)", () => {
    const nested = split("vertical", leaf("X"), leaf("Y"));
    expect(resolveAlongAxisMinPaneSizePx(nested, "horizontal", 40, 96)).toBe(40);
  });
});

describe("clampByMinSize (generalized: independent per-side floors)", () => {
  it("is backward-compatible: a single 4th arg clamps both sides symmetrically", () => {
    // container 1000, gap 0, min 100 → boundedMin = 0.1, boundedMax = 0.9.
    expect(clampByMinSize(0.5, 1000, 0, 100)).toBeCloseTo(0.5);
    expect(clampByMinSize(0.02, 1000, 0, 100)).toBeCloseTo(0.1);
    expect(clampByMinSize(0.98, 1000, 0, 100)).toBeCloseTo(0.9);
  });

  it("clamps each side independently when the two floors differ", () => {
    // container 1000, gap 0: first floor 300 → boundedMin 0.3; second floor 100 → boundedMax 0.9.
    expect(clampByMinSize(0.05, 1000, 0, 300, 100)).toBeCloseTo(0.3);
    expect(clampByMinSize(0.95, 1000, 0, 300, 100)).toBeCloseTo(0.9);
    expect(clampByMinSize(0.5, 1000, 0, 300, 100)).toBeCloseTo(0.5);
  });

  it("falls back to 0.5 when the two floors cannot both be satisfied", () => {
    expect(clampByMinSize(0.5, 500, 0, 400, 400)).toBe(0.5);
  });

  it("the default 5% safety bound raises a tiny real requirement", () => {
    // container 100000, min 40 → real fraction 0.0004, raised to the 5% floor.
    expect(clampByMinSize(0, 100000, 0, 40)).toBeCloseTo(0.05);
  });

  it("RATIO_SAFETY_BOUNDS_UNBOUNDED reflects only the real per-side px requirement", () => {
    expect(clampByMinSize(0, 100000, 0, 40, 40, RATIO_SAFETY_BOUNDS_UNBOUNDED)).toBeCloseTo(0.0004);
  });
});

describe("resolveAlongAxisFloor (HT-RESIZE-FLOOR: body vs chrome size-out)", () => {
  it("defaults to chrome mode (HT-RESIZE-FLOOR-DEFAULT) when neither the leaf nor config declare a floor", () => {
    // A leaf's own minBBoxPx is IGNORED under the chrome default — it only
    // matters once a consumer opts back into "body" (see below).
    const withMin = leaf("A", undefined, { widthPx: 300 });
    const resolved = resolveAlongAxisFloor(withMin, "horizontal", 40, CONFIG);
    expect(resolved).toEqual({
      floorPx: TILING_DEFAULT_COLLAPSED_EXTENT_PX,
      isChromeFloor: true,
    });
  });

  it("body opt-in via config.resizeFloor: \"body\" restores resolveAlongAxisMinPaneSizePx behavior library-wide", () => {
    const withMin = leaf("A", undefined, { widthPx: 300 });
    const resolved = resolveAlongAxisFloor(withMin, "horizontal", 40, {
      ...CONFIG,
      resizeFloor: "body",
    });
    expect(resolved).toEqual({ floorPx: 300, isChromeFloor: false });
  });

  it("body opt-in via a leaf's own resizeFloor: \"body\" restores resolveAlongAxisMinPaneSizePx for just that leaf", () => {
    const withMin = leaf("A", undefined, { widthPx: 300 }, "body");
    const resolved = resolveAlongAxisFloor(withMin, "horizontal", 40, CONFIG);
    expect(resolved).toEqual({ floorPx: 300, isChromeFloor: false });
  });

  it("a leaf's own resizeFloor: \"chrome\" replaces the body floor chain with the config chrome extent", () => {
    const chromeLeaf = leaf("A", undefined, { widthPx: 300 }, "chrome");
    const resolved = resolveAlongAxisFloor(chromeLeaf, "horizontal", 40, {
      ...CONFIG,
      collapsedExtentPx: 35,
    });
    // minBBoxPx (300) is IGNORED — chrome mode is an explicit opt-in, not layered.
    expect(resolved).toEqual({ floorPx: 35, isChromeFloor: true });
  });

  it("falls back to TILING_DEFAULT_COLLAPSED_EXTENT_PX (40) when config.collapsedExtentPx is unset", () => {
    const chromeLeaf = leaf("A", undefined, undefined, "chrome");
    const resolved = resolveAlongAxisFloor(chromeLeaf, "horizontal", 40, CONFIG);
    expect(resolved).toEqual({ floorPx: 40, isChromeFloor: true });
  });

  it("config.resizeFloor: \"chrome\" applies to a leaf with no per-leaf override", () => {
    const plainLeaf = leaf("A");
    const resolved = resolveAlongAxisFloor(plainLeaf, "horizontal", undefined, {
      ...CONFIG,
      resizeFloor: "chrome",
      collapsedExtentPx: 35,
    });
    expect(resolved).toEqual({ floorPx: 35, isChromeFloor: true });
  });

  it("a leaf's own resizeFloor: \"body\" wins over config.resizeFloor: \"chrome\"", () => {
    const bodyLeaf = leaf("A", undefined, undefined, "body");
    const resolved = resolveAlongAxisFloor(bodyLeaf, "horizontal", 40, {
      ...CONFIG,
      resizeFloor: "chrome",
    });
    expect(resolved).toEqual({ floorPx: 40, isChromeFloor: false });
  });

  it("a nested split/group child is never in chrome mode (no leaf to carry the override)", () => {
    const nested = split("vertical", leaf("X"), leaf("Y"));
    const resolved = resolveAlongAxisFloor(nested, "horizontal", 40, {
      ...CONFIG,
      resizeFloor: "chrome",
    });
    // config.resizeFloor still applies (it is not leaf-scoped) — only a
    // per-leaf OVERRIDE requires a bare leaf.
    expect(resolved.isChromeFloor).toBe(true);
  });
});

describe("resolveRatioSafetyBounds (neutralizes the 5%/95% net when either side is chrome)", () => {
  // Both sides opt into "body" explicitly — the chrome LIBRARY DEFAULT
  // (HT-RESIZE-FLOOR-DEFAULT) would otherwise make every bare leaf chrome.
  it("keeps the default safety net when neither side is chrome", () => {
    const first = resolveAlongAxisFloor(leaf("A", undefined, undefined, "body"), "horizontal", undefined, CONFIG);
    const second = resolveAlongAxisFloor(leaf("B", undefined, undefined, "body"), "horizontal", undefined, CONFIG);
    expect(resolveRatioSafetyBounds(first, second)).toBe(RATIO_SAFETY_BOUNDS_DEFAULT);
  });

  it("neutralizes the safety net when the FIRST side is chrome", () => {
    const first = resolveAlongAxisFloor(leaf("A", undefined, undefined, "chrome"), "horizontal", undefined, CONFIG);
    const second = resolveAlongAxisFloor(leaf("B", undefined, undefined, "body"), "horizontal", undefined, CONFIG);
    expect(resolveRatioSafetyBounds(first, second)).toBe(RATIO_SAFETY_BOUNDS_UNBOUNDED);
  });

  it("neutralizes the safety net when the SECOND side is chrome", () => {
    const first = resolveAlongAxisFloor(leaf("A", undefined, undefined, "body"), "horizontal", undefined, CONFIG);
    const second = resolveAlongAxisFloor(leaf("B", undefined, undefined, "chrome"), "horizontal", undefined, CONFIG);
    expect(resolveRatioSafetyBounds(first, second)).toBe(RATIO_SAFETY_BOUNDS_UNBOUNDED);
  });

  it("end-to-end: a chrome-floor side can shrink well below the default 5% ratio floor", () => {
    // container 2000, gap 0: a 35px chrome floor is 1.75% — under the default
    // 5% net (which would raise it to 100px). Unbounded lets it stay at 35.
    // "document" opts into "body" so this stays a mixed chrome/body boundary
    // rather than both sides picking up the chrome default.
    const chromeLeaf = leaf("review", undefined, undefined, "chrome");
    const config: TilingLayoutConfig = { ...CONFIG, collapsedExtentPx: 35 };
    const first = resolveAlongAxisFloor(leaf("document", undefined, undefined, "body"), "horizontal", undefined, config);
    const second = resolveAlongAxisFloor(chromeLeaf, "horizontal", undefined, config);
    const bounds = resolveRatioSafetyBounds(first, second);
    const ratio = clampByMinSize(0.99, 2000, 0, first.floorPx, second.floorPx, bounds);
    expect(ratio).toBeCloseTo(1 - 35 / 2000);
    expect(2000 * (1 - ratio)).toBeCloseTo(35);
  });

  it("a chrome-floor pane NEVER auto-sets collapsed — resolveAlongAxisFloor touches no collapse fields", () => {
    const chromeLeaf = leaf("review", undefined, undefined, "chrome");
    resolveAlongAxisFloor(chromeLeaf, "horizontal", undefined, CONFIG);
    expect(chromeLeaf.collapsed).toBeUndefined();
    expect(chromeLeaf.sizing).toBeUndefined();
  });
});
