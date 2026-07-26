import { describe, expect, it } from "@jest/globals";
import {
  crossAxisDimension,
  isStaticAlongSplitAxis,
  isStaticInDimension,
  isStaticOnCrossAxis,
  layoutContainsStaticPane,
  measuredStaticSizing,
  renormalizeFlexibleRatios,
  resolveBinarySplitDistribution,
  resolveEffectiveStaticAlong,
  resolveStaticAlongExtents,
  resolveSizingMode,
  shouldRenderSplitDivider,
  splitAxisDimension,
  splitBoundaryGutterPx,
  titleBarSizingModeId,
} from "../engine/pane-sizing";
import type { TilingLeafNode, TilingLayoutNode, TilingPaneSizing } from "../engine/types";

function leaf(id: string, sizing?: TilingPaneSizing): TilingLeafNode {
  return { kind: "leaf", id, tileId: id, sizing };
}

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

  it("both static → first content-sized, second FILLS (backstop: axis must keep a filler)", () => {
    // Round-2 static-gap backstop: two fixed extents cannot sum to a variable
    // container, so even a both-static-along-axis split must keep one filling
    // child or it opens a trailing gap on container resize.
    expect(resolveBinarySplitDistribution(true, true, 0.5)).toEqual({
      first: { kind: "content" },
      second: { kind: "fill" },
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
