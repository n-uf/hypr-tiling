import { describe, expect, it } from "@jest/globals";
import {
  LAYOUT_FILL_SLACK_TOLERANCE_PX,
  assessLayoutTileIntegrity,
  measureLayoutFillSlackPx,
  normalizeLayout,
} from "../engine/layout-normalize";
import { isStaticAlongSplitAxis } from "../engine/pane-sizing";
import { tileOrderByLeafId } from "../engine/state";
import type {
  TilingLayoutConfig,
  TilingLayoutNode,
  TilingLeafNode,
  TilingSplitNode,
} from "../engine/types";

const EXPECTED_ANNOTATE_TILES: ReadonlyArray<string> = [
  "cases",
  "document",
  "review",
];

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

  it("rebuilds when a duplicate tileId leaves another expected tile unplaced", (): void => {
    const input: TilingSplitNode = {
      kind: "split",
      id: "root",
      axis: "horizontal",
      ratio: 0.5,
      first: leaf("leaf-cases", "cases", { width: "static", widthPx: 256 }),
      second: {
        kind: "split",
        id: "main",
        axis: "horizontal",
        ratio: 0.5,
        // Duplicate "cases" — document missing → void slot class.
        first: leaf("leaf-dup", "cases"),
        second: leaf("leaf-review", "review", {
          width: "static",
          widthPx: 384,
        }),
      },
    };
    const integrity = assessLayoutTileIntegrity(input, {
      expectedTileIds: EXPECTED_ANNOTATE_TILES,
    });
    expect(integrity.requiresRebuild).toBe(true);
    expect(integrity.duplicateTileIds).toContain("cases");
    expect(integrity.missingTileIds).toContain("document");

    const normalized: TilingLayoutNode = normalizeLayout(input, {
      containerWidthPx: 1400,
      containerHeightPx: 900,
      config: CONFIG,
      expectedTileIds: EXPECTED_ANNOTATE_TILES,
    });
    const order: ReadonlyArray<string> = tileOrderByLeafId(normalized);
    expect(new Set(order)).toEqual(new Set(EXPECTED_ANNOTATE_TILES));
    expect(order).toHaveLength(EXPECTED_ANNOTATE_TILES.length);
    expect(
      assessLayoutTileIntegrity(normalized, {
        expectedTileIds: EXPECTED_ANNOTATE_TILES,
      }).requiresRebuild,
    ).toBe(false);
  });

  it("rebuilds via fallbackLayout when an expected tile is missing", (): void => {
    const input: TilingSplitNode = {
      kind: "split",
      id: "root",
      axis: "horizontal",
      ratio: 0.4,
      first: leaf("leaf-cases", "cases"),
      second: leaf("leaf-review", "review"),
    };
    const fallback: TilingLayoutNode = annotateStyleLayout();
    const normalized: TilingLayoutNode = normalizeLayout(input, {
      containerWidthPx: 1400,
      containerHeightPx: 900,
      config: CONFIG,
      expectedTileIds: EXPECTED_ANNOTATE_TILES,
      fallbackLayout: fallback,
    });
    expect([...tileOrderByLeafId(normalized)].sort()).toEqual(
      [...EXPECTED_ANNOTATE_TILES].sort(),
    );
    expect(findLeaf(normalized, "leaf-document")).not.toBeNull();
    expect(
      isStaticAlongSplitAxis(findLeaf(normalized, "leaf-cases")!, "horizontal"),
    ).toBe(true);
  });

  it("heals a collapsed ratio empty branch without dropping tiles", (): void => {
    const input: TilingSplitNode = {
      kind: "split",
      id: "root",
      axis: "horizontal",
      ratio: 0.001,
      first: leaf("A", "a"),
      second: {
        kind: "split",
        id: "main",
        axis: "horizontal",
        ratio: 0.999,
        first: leaf("B", "b"),
        second: leaf("C", "c"),
      },
    };
    const integrity = assessLayoutTileIntegrity(input, {
      expectedTileIds: ["a", "b", "c"],
    });
    expect(integrity.hasCollapsedRatio).toBe(true);
    expect(integrity.requiresRebuild).toBe(false);

    const normalized = normalizeLayout(input, {
      containerWidthPx: 1200,
      containerHeightPx: 800,
      config: CONFIG,
      expectedTileIds: ["a", "b", "c"],
    }) as TilingSplitNode;
    expect(normalized.kind).toBe("split");
    expect(normalized.ratio).toBeGreaterThanOrEqual(0.05);
    expect(normalized.ratio).toBeLessThanOrEqual(0.95);
    const main = normalized.second as TilingSplitNode;
    expect(main.kind).toBe("split");
    expect(main.ratio).toBeGreaterThanOrEqual(0.05);
    expect(main.ratio).toBeLessThanOrEqual(0.95);
    expect(tileOrderByLeafId(normalized)).toEqual(["a", "b", "c"]);
  });
});
