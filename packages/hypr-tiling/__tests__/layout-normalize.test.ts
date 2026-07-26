import { describe, expect, it } from "@jest/globals";
import {
  LAYOUT_FILL_SLACK_TOLERANCE_PX,
  measureLayoutFillSlackPx,
  normalizeLayout,
} from "../engine/layout-normalize";
import { isStaticAlongSplitAxis } from "../engine/pane-sizing";
import type {
  TilingLayoutConfig,
  TilingLayoutNode,
  TilingLeafNode,
  TilingSplitNode,
} from "../engine/types";

const CONFIG: TilingLayoutConfig = {
  gapPx: 8,
  minPaneSizePx: 200,
  handleSizePx: 4,
};

function leaf(
  id: string,
  tileId: string,
  sizing?: TilingLeafNode["sizing"],
): TilingLeafNode {
  return sizing == null
    ? { kind: "leaf", id, tileId }
    : { kind: "leaf", id, tileId, sizing };
}

/**
 * Annotate-style tree: static cases | flexible document | static review.
 *
 *   root (horizontal)
 *   ├── cases (W• 256)
 *   └── main (horizontal)
 *       ├── document (flexible)
 *       └── review (W• 384)
 */
function annotateStyleLayout(
  casesPinPx: number = 256,
  reviewPinPx: number = 384,
  rootRatio: number = 0.18,
  mainRatio: number = 0.66,
): TilingSplitNode {
  return {
    kind: "split",
    id: "annotate-root",
    axis: "horizontal",
    ratio: rootRatio,
    first: leaf("leaf-cases", "cases", {
      width: "static",
      widthPx: casesPinPx,
    }),
    second: {
      kind: "split",
      id: "annotate-main",
      axis: "horizontal",
      ratio: mainRatio,
      first: leaf("leaf-document", "document"),
      second: leaf("leaf-review", "review", {
        width: "static",
        widthPx: reviewPinPx,
      }),
    },
  };
}

function findLeaf(node: TilingLayoutNode, leafId: string): TilingLeafNode | null {
  if (node.kind === "leaf") {
    return node.id === leafId ? node : null;
  }
  if (node.kind === "group") {
    return node.members.find((member) => member.id === leafId) ?? null;
  }
  return findLeaf(node.first, leafId) ?? findLeaf(node.second, leafId);
}

describe("normalizeLayout", (): void => {
  it("demotes an unfit outer pin after extreme resize (cases pin too wide)", (): void => {
    // pin 900 + gutter 12 cannot fit in a 500px viewport.
    const input: TilingLayoutNode = annotateStyleLayout(900, 120, 0.9, 0.5);
    const normalized: TilingLayoutNode = normalizeLayout(input, {
      containerWidthPx: 500,
      containerHeightPx: 800,
      config: CONFIG,
    });
    const cases: TilingLeafNode | null = findLeaf(normalized, "leaf-cases");
    expect(cases).not.toBeNull();
    expect(isStaticAlongSplitAxis(cases!, "horizontal")).toBe(false);
  });

  it("demotes an unfit nested pin in the fill region (review in tight middle)", (): void => {
    // Outer cases pin fits (256 + 12 < 1000). Inner fill ≈ 1000 - 256 - 12 = 732.
    // Review pin 700 + gutter 12 = 712 fits; pin 720 + 12 = 732 does NOT (< requires
    // pin + gutter < container → 732 < 732 is false).
    const input: TilingLayoutNode = annotateStyleLayout(256, 720, 0.18, 0.9);
    const normalized: TilingLayoutNode = normalizeLayout(input, {
      containerWidthPx: 1000,
      containerHeightPx: 800,
      config: CONFIG,
    });
    const review: TilingLeafNode | null = findLeaf(normalized, "leaf-review");
    expect(review).not.toBeNull();
    expect(isStaticAlongSplitAxis(review!, "horizontal")).toBe(false);
    // Cases pin still fits and stays static.
    const cases: TilingLeafNode | null = findLeaf(normalized, "leaf-cases");
    expect(cases).not.toBeNull();
    expect(isStaticAlongSplitAxis(cases!, "horizontal")).toBe(true);
  });

  it("keeps fitting multi-static + flexible middle pins after normalize", (): void => {
    const input: TilingLayoutNode = annotateStyleLayout(256, 384, 0.18, 0.66);
    const normalized: TilingLayoutNode = normalizeLayout(input, {
      containerWidthPx: 1400,
      containerHeightPx: 900,
      config: CONFIG,
    });
    expect(isStaticAlongSplitAxis(findLeaf(normalized, "leaf-cases")!, "horizontal")).toBe(
      true,
    );
    expect(isStaticAlongSplitAxis(findLeaf(normalized, "leaf-review")!, "horizontal")).toBe(
      true,
    );
    expect(findLeaf(normalized, "leaf-document")?.sizing).toBeUndefined();
  });

  it("post-commit fill slack is below tolerance for annotate-style layout", (): void => {
    const input: TilingLayoutNode = annotateStyleLayout(256, 384, 0.05, 0.95);
    const normalized: TilingLayoutNode = normalizeLayout(input, {
      containerWidthPx: 1200,
      containerHeightPx: 800,
      config: CONFIG,
    });
    const slackPx: number = measureLayoutFillSlackPx(normalized, {
      containerWidthPx: 1200,
      containerHeightPx: 800,
      config: CONFIG,
    });
    expect(slackPx).toBeLessThan(LAYOUT_FILL_SLACK_TOLERANCE_PX);
  });

  it("is idempotent when the tree already fills the container", (): void => {
    const input: TilingLayoutNode = annotateStyleLayout();
    const once: TilingLayoutNode = normalizeLayout(input, {
      containerWidthPx: 1400,
      containerHeightPx: 900,
      config: CONFIG,
    });
    const twice: TilingLayoutNode = normalizeLayout(once, {
      containerWidthPx: 1400,
      containerHeightPx: 900,
      config: CONFIG,
    });
    expect(twice).toBe(once);
  });

  it("clamps extreme flexible ratios against min-pane + full gutter", (): void => {
    const input: TilingSplitNode = {
      kind: "split",
      id: "root",
      axis: "horizontal",
      ratio: 0.99,
      first: leaf("A", "a"),
      second: leaf("B", "b"),
    };
    const normalized = normalizeLayout(input, {
      containerWidthPx: 1000,
      containerHeightPx: 600,
      config: CONFIG,
    }) as TilingSplitNode;
    expect(normalized.kind).toBe("split");
    // available = 1000 - 12 = 988; min ratio = 200/988 ≈ 0.202
    expect(normalized.ratio).toBeGreaterThanOrEqual(0.2);
    expect(normalized.ratio).toBeLessThan(0.99);
  });

  it("reports fill slack for an unfit declared pin (pre-normalize void)", (): void => {
    const input: TilingLayoutNode = annotateStyleLayout(990, 100, 0.9, 0.5);
    const slackPx: number = measureLayoutFillSlackPx(input, {
      containerWidthPx: 1000,
      containerHeightPx: 800,
      config: CONFIG,
    });
    expect(slackPx).toBeGreaterThanOrEqual(LAYOUT_FILL_SLACK_TOLERANCE_PX);
  });
});
