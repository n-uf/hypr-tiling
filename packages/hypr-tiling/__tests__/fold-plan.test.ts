import { describe, expect, it } from "@jest/globals";
import {
  TILING_DEFAULT_FOLD_SPINE_PX,
  findFoldToward,
  resolveFoldPlan,
  resolveLayoutGeometry,
  type TilingFold,
  type TilingFoldPlan,
  type TilingGroupNode,
  type TilingLayoutConfig,
  type TilingLayoutNode,
  type TilingLeafNode,
  type TilingRect,
  type TilingSplitNode,
} from "../engine";
import { clampByMinSize, clampByMinSizeOrFold } from "../engine/pane-sizing";

// The fold plan (`resolveFoldPlan`): a split that can't give both children their floor folds into a spine; one
// that can is laid out exactly as with folding off.

function leaf(id: string, extra: Partial<TilingLeafNode> = {}): TilingLeafNode {
  return { kind: "leaf", id, tileId: id, ...extra };
}

function split(id: string, axis: "horizontal" | "vertical", ratio: number, first: TilingLayoutNode, second: TilingLayoutNode, extra: Partial<TilingSplitNode> = {}): TilingSplitNode {
  return { kind: "split", id, axis, ratio, first, second, ...extra };
}

/** hypr-tiling.n-uf.com's Home tree (apps/web/src/home-workspaces.ts) */
const HERO: TilingGroupNode = {
  kind: "group",
  id: "home-hero",
  activeMemberId: "intro",
  members: [leaf("intro"), leaf("proof"), leaf("scenarios")],
};
const HOME: TilingLayoutNode = split(
  "home-root",
  "horizontal",
  0.26,
  split("home-intro-stack", "vertical", 0.675, HERO, leaf("discoverability")),
  split("home-features-rest", "horizontal", 0.365, leaf("features"), split("home-install-uses", "horizontal", 0.585, leaf("install"), leaf("usecases"))),
);

/** The site's layout config (apps/web/src/page.tsx) */
const SITE: TilingLayoutConfig = { gapPx: 14, minPaneSizePx: 180, handleSizePx: 8 };
/**
 * The site's config with folding on. Floors every pane of the Home tree already has at 1440 × 900 (the narrowest,
 * Use cases, is about 231 px wide), and that a 390 px phone can't give two panes side by side.
 */
const SITE_FOLD: TilingLayoutConfig = { ...SITE, fold: { minPanePx: { width: 220, height: 200 } } };
/** Where the geometry puts a split's boundary: the middle of the gutter (22 px here) at `ratio` of the extent */
const firstPx = (ratio: number, extentPx: number): number => ratio * extentPx - 11;

const box = (width: number, height: number): TilingRect => ({ x: 0, y: 0, width, height });

function expectRect(actual: TilingRect | undefined, expected: TilingRect): void {
  expect(actual).toBeDefined();
  const rect = actual as TilingRect;
  expect(rect.x).toBeCloseTo(expected.x, 6);
  expect(rect.y).toBeCloseTo(expected.y, 6);
  expect(rect.width).toBeCloseTo(expected.width, 6);
  expect(rect.height).toBeCloseTo(expected.height, 6);
}

const foldOf = (plan: TilingFoldPlan, splitId: string): TilingFold => {
  const fold = plan.folds.find((candidate) => candidate.splitId === splitId);
  if (fold == null) throw new Error(`no fold ${splitId}`);
  return fold;
};

function deepFreeze<T>(value: T): T {
  if (value != null && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

describe("clampByMinSizeOrFold", () => {
  it("reports fold where clampByMinSize falls back to 0.5", () => {
    expect(clampByMinSizeOrFold(0.3, 500, 20, 300, 300)).toBe("fold");
    expect(clampByMinSize(0.3, 500, 20, 300, 300)).toBe(0.5);
  });

  it("clamps like clampByMinSize where both floors fit", () => {
    for (const ratio of [0, 0.1, 0.5, 0.9, 1]) {
      expect(clampByMinSizeOrFold(ratio, 1000, 20, 300, 200)).toBe(clampByMinSize(ratio, 1000, 20, 300, 200));
    }
  });
});

describe("resolveFoldPlan: folding off", () => {
  it("undefined or false: the geometry, unchanged, at every size", () => {
    for (const fold of [undefined, false] as const) {
      for (const [width, height] of [[390, 844], [844, 390], [1440, 900]]) {
        const plan = resolveFoldPlan(HOME, box(width, height), { ...SITE, fold }, "intro");
        const geometry = resolveLayoutGeometry(HOME, box(width, height), SITE);
        expect(plan.leaves).toEqual(geometry.leaves);
        expect(plan.splits).toEqual(geometry.splits);
        expect(plan.folds).toEqual([]);
        expect(plan.foldedLeafIds.size).toBe(0);
        expect([...plan.leafFolds.values()].every((folds) => folds.length === 0)).toBe(true);
      }
    }
  });
});

describe("resolveFoldPlan: desktop stays pixel-identical wherever both floors fit", () => {
  it("the Home tree at desktop sizes folds nothing and matches the geometry exactly", () => {
    for (const [width, height] of [[1440, 900], [1920, 1080], [2560, 1440]]) {
      const plan = resolveFoldPlan(HOME, box(width, height), SITE_FOLD, "intro");
      const geometry = resolveLayoutGeometry(HOME, box(width, height), SITE);
      expect(plan.folds).toEqual([]);
      expect(plan.fittedRatios.size).toBe(0);
      expect(plan.leaves).toEqual(geometry.leaves);
      expect(plan.splits).toEqual(geometry.splits);
      expect([...plan.leaves.keys()]).toEqual(["intro", "discoverability", "features", "install", "usecases"]);
    }
  });

  it("at any size where nothing folds, the plan is the geometry (sweep)", () => {
    let unfolded = 0;
    for (let width = 300; width <= 2400; width += 37) {
      for (let height = 300; height <= 1400; height += 61) {
        const plan = resolveFoldPlan(HOME, box(width, height), SITE_FOLD, "features");
        if (plan.folds.length > 0 || plan.fittedRatios.size > 0) continue;
        unfolded += 1;
        const geometry = resolveLayoutGeometry(HOME, box(width, height), SITE);
        expect(plan.leaves).toEqual(geometry.leaves);
        expect(plan.splits).toEqual(geometry.splits);
      }
    }
    expect(unfolded).toBeGreaterThan(50);
  });

  it("a split that fits but whose ratio squeezes a pane under the floor moves its boundary to the floor", () => {
    // 700 px holds two 300 px floors, so it stays a split; its 0.2 ratio would leave the first side 140 px.
    const tree = split("r", "horizontal", 0.2, leaf("a"), leaf("b"));
    const config: TilingLayoutConfig = { gapPx: 0, minPaneSizePx: 0, handleSizePx: 0, fold: { minPanePx: 300 } };
    const plan = resolveFoldPlan(tree, box(700, 400), config, "a");
    expect(plan.folds).toEqual([]);
    expect(plan.fittedRatios.get("r")).toBeCloseTo(300 / 700, 9);
    expectRect(plan.leaves.get("a"), { x: 0, y: 0, width: 300, height: 400 });
    expectRect(plan.leaves.get("b"), { x: 300, y: 0, width: 400, height: 400 });
    expect(plan.splits.get("r")?.ratio).toBeCloseTo(300 / 700, 9);
    // the stored tree keeps its ratio
    expect(tree.ratio).toBe(0.2);
  });

  it("a pane already on its floor doesn't move, with a gutter and an asymmetric floor", () => {
    // a gets 0.775 × 400 − 8 = 302 (floor 300), b 82 (floor 50): both have their floor
    const tree = split("r", "horizontal", 0.775, leaf("a", { minBBoxPx: { widthPx: 300 } }), leaf("b"));
    const config: TilingLayoutConfig = { gapPx: 10, minPaneSizePx: 0, handleSizePx: 6, fold: { minPanePx: 50 } };
    const plan = resolveFoldPlan(tree, box(400, 300), config, "a");
    expect(plan.fittedRatios.size).toBe(0);
    expect(plan.leaves).toEqual(resolveLayoutGeometry(tree, box(400, 300), config).leaves);
  });

  it("a pane under its floor is moved exactly onto it, the other side too", () => {
    const config: TilingLayoutConfig = { gapPx: 10, minPaneSizePx: 0, handleSizePx: 6, fold: { minPanePx: 100 } };
    const second = resolveFoldPlan(split("r", "horizontal", 0.9, leaf("a"), leaf("b")), box(400, 300), config, "a");
    expect(second.leaves.get("b")?.width).toBeCloseTo(100, 9);
    const first = resolveFoldPlan(split("r", "vertical", 0.1, leaf("a"), leaf("b")), box(300, 400), config, "a");
    expect(first.leaves.get("a")?.height).toBeCloseTo(100, 9);
  });

  it("no refit for a floor of 0, even at an out-of-range stored ratio", () => {
    const tree = split("r", "horizontal", 2, leaf("a"), leaf("b"));
    const config: TilingLayoutConfig = { gapPx: 10, minPaneSizePx: 0, handleSizePx: 0, fold: { minPanePx: 0 } };
    const plan = resolveFoldPlan(tree, box(400, 300), config, "a");
    expect(plan.fittedRatios.size).toBe(0);
    expect(plan.folds).toEqual([]);
  });

  it("a split with a static child keeps its pin", () => {
    const tree = split("r", "horizontal", 0.5, leaf("a", { sizing: { width: "static", widthPx: 120 } }), leaf("b"));
    const config: TilingLayoutConfig = { gapPx: 0, minPaneSizePx: 0, handleSizePx: 0, fold: { minPanePx: 100 } };
    const plan = resolveFoldPlan(tree, box(700, 400), config, "a");
    expect(plan.fittedRatios.size).toBe(0);
    expect(plan.leaves).toEqual(resolveLayoutGeometry(tree, box(700, 400), config).leaves);
  });
});

describe("resolveFoldPlan: the Home tree on a phone", () => {
  it("390 × 844, focus on the hero: the root folds, the open column keeps its real vertical split", () => {
    const plan = resolveFoldPlan(HOME, box(390, 844), SITE_FOLD, "intro");
    expect(plan.folds.map((fold) => fold.splitId)).toEqual(["home-root"]);
    const root = foldOf(plan, "home-root");
    expect(root).toMatchObject({ axis: "horizontal", openSide: "first", spineEdge: "right", parentSplitId: null });
    expect(root.leafIds).toEqual(["features", "install", "usecases"]);
    expect(root.targetLeafId).toBe("features");
    expectRect(root.spineRect, { x: 360, y: 0, width: TILING_DEFAULT_FOLD_SPINE_PX, height: 844 });
    expectRect(root.openRect, { x: 0, y: 0, width: 346, height: 844 });
    // hero over SEO + LLM, by the renderer's own geometry in the open box
    expectRect(plan.leaves.get("intro"), { x: 0, y: 0, width: 346, height: firstPx(0.675, 844) });
    expectRect(plan.leaves.get("discoverability"), { x: 0, y: firstPx(0.675, 844) + 22, width: 346, height: 844 - firstPx(0.675, 844) - 22 });
    expect(plan.fittedRatios.size).toBe(0);
    expect([...plan.leaves.keys()]).toEqual(["intro", "discoverability"]);
    expect(plan.splits.has("home-intro-stack")).toBe(true);
    expect(plan.splits.has("home-root")).toBe(false);
    expect([...plan.foldedLeafIds]).toEqual(["features", "install", "usecases"]);
    expect(plan.leafFolds.get("intro")).toEqual(["home-root"]);
  });

  it("390 × 844, focus on Features: the root opens its second side, and the nested split folds too", () => {
    const plan = resolveFoldPlan(HOME, box(390, 844), SITE_FOLD, "features");
    expect(plan.folds.map((fold) => fold.splitId)).toEqual(["home-root", "home-features-rest"]);
    const root = foldOf(plan, "home-root");
    expect(root).toMatchObject({ openSide: "second", spineEdge: "left" });
    expect(root.leafIds).toEqual(["intro", "discoverability"]);
    expectRect(root.spineRect, { x: 0, y: 0, width: 30, height: 844 });
    expectRect(root.openRect, { x: 44, y: 0, width: 346, height: 844 });
    const rest = foldOf(plan, "home-features-rest");
    expect(rest).toMatchObject({ openSide: "first", spineEdge: "right", parentSplitId: "home-root" });
    expect(rest.leafIds).toEqual(["install", "usecases"]);
    expectRect(rest.spineRect, { x: 360, y: 0, width: 30, height: 844 });
    expectRect(plan.leaves.get("features"), { x: 44, y: 0, width: 302, height: 844 });
    expect([...plan.leaves.keys()]).toEqual(["features"]);
    expect(plan.leafFolds.get("features")).toEqual(["home-root", "home-features-rest"]);
    // the hero group's members are folded with it
    expect([...plan.foldedLeafIds].sort()).toEqual(["discoverability", "install", "intro", "proof", "scenarios", "usecases"]);
  });

  it("844 × 390: three columns (the boundaries move to the floor); the hero's stack and Install · Use cases fold", () => {
    const plan = resolveFoldPlan(HOME, box(844, 390), SITE_FOLD, "intro");
    expect(plan.folds.map((fold) => fold.splitId)).toEqual(["home-intro-stack", "home-install-uses"]);
    // the root's 0.26 would leave the hero 208 px wide: its boundary moves so the hero is exactly 220 px
    const rootRatio = (220 + 11) / 844;
    expect(plan.fittedRatios.get("home-root")).toBeCloseTo(rootRatio, 9);
    expect(plan.splits.has("home-root")).toBe(true);
    const heroWidth = firstPx(rootRatio, 844);
    expect(heroWidth).toBeCloseTo(220, 9);
    const stack = foldOf(plan, "home-intro-stack");
    expect(stack).toMatchObject({ axis: "vertical", openSide: "first", spineEdge: "bottom", leafIds: ["discoverability"] });
    expectRect(stack.spineRect, { x: 0, y: 360, width: heroWidth, height: 30 });
    expectRect(plan.leaves.get("intro"), { x: 0, y: 0, width: heroWidth, height: 346 });
    // Features, moved to its floor too
    const restX = heroWidth + 22;
    const restWidth = 844 - restX;
    const featuresRatio = (220 + 11) / restWidth;
    expect(plan.fittedRatios.get("home-features-rest")).toBeCloseTo(featuresRatio, 9);
    const featuresWidth = firstPx(featuresRatio, restWidth);
    expect(featuresWidth).toBeCloseTo(220, 9);
    expectRect(plan.leaves.get("features"), { x: restX, y: 0, width: featuresWidth, height: 390 });
    // focus is in another column: the first side opens
    const uses = foldOf(plan, "home-install-uses");
    expect(uses).toMatchObject({ axis: "horizontal", openSide: "first", spineEdge: "right", leafIds: ["usecases"] });
    const installX = restX + featuresWidth + 22;
    expectRect(plan.leaves.get("install"), { x: installX, y: 0, width: 844 - installX - 44, height: 390 });
    expect([...plan.leaves.keys()]).toEqual(["intro", "features", "install"]);
  });

  it("never writes into the layout", () => {
    const frozen = deepFreeze(structuredClone(HOME));
    expect(() => resolveFoldPlan(frozen, box(390, 844), SITE_FOLD, "usecases")).not.toThrow();
    expect(frozen).toEqual(HOME);
  });
});

describe("resolveFoldPlan: which side opens, and the spine's target", () => {
  const pair = split("r", "horizontal", 0.5, leaf("a"), leaf("b"));
  const NARROW: TilingLayoutConfig = { gapPx: 10, minPaneSizePx: 0, handleSizePx: 0, fold: { minPanePx: 300, spineSizePx: 24 } };

  it("the side holding focus opens; spineSizePx sets the spine", () => {
    const plan = resolveFoldPlan(pair, box(400, 300), NARROW, "b");
    const fold = foldOf(plan, "r");
    expect(fold).toMatchObject({ openSide: "second", spineEdge: "left", leafIds: ["a"], targetLeafId: "a" });
    expectRect(fold.spineRect, { x: 0, y: 0, width: 24, height: 300 });
    expectRect(plan.leaves.get("b"), { x: 34, y: 0, width: 366, height: 300 });
  });

  it("no focus: the side holding the most recent leaf, else the first", () => {
    expect(foldOf(resolveFoldPlan(pair, box(400, 300), NARROW, null, ["b"]), "r").openSide).toBe("second");
    expect(foldOf(resolveFoldPlan(pair, box(400, 300), NARROW, null), "r").openSide).toBe("first");
    expect(foldOf(resolveFoldPlan(pair, box(400, 300), NARROW, "elsewhere"), "r").openSide).toBe("first");
  });

  it("a spine targets the leaf on it focused most recently", () => {
    const tree = split("r", "horizontal", 0.5, leaf("a"), split("s", "vertical", 0.5, leaf("b"), leaf("c")));
    const plan = resolveFoldPlan(tree, box(400, 900), NARROW, "a", ["a", "c", "b"]);
    expect(foldOf(plan, "r")).toMatchObject({ leafIds: ["b", "c"], targetLeafId: "c" });
  });
});

describe("resolveFoldPlan: the floor, most specific first", () => {
  const BASE: TilingLayoutConfig = { gapPx: 0, minPaneSizePx: 0, handleSizePx: 0, fold: { minPanePx: 100 } };
  const folds = (tree: TilingLayoutNode, config: TilingLayoutConfig = BASE): boolean =>
    resolveFoldPlan(tree, box(700, 400), config, "a").folds.length > 0;

  it("the fold config's floor, per axis", () => {
    expect(folds(split("r", "horizontal", 0.5, leaf("a"), leaf("b")))).toBe(false);
    expect(folds(split("r", "horizontal", 0.5, leaf("a"), leaf("b")), { ...BASE, fold: { minPanePx: { width: 351, height: 10 } } })).toBe(true);
    expect(folds(split("r", "vertical", 0.5, leaf("a"), leaf("b")), { ...BASE, fold: { minPanePx: { width: 10, height: 201 } } })).toBe(true);
  });

  it("a leaf's minBBoxPx wins over the fold floor", () => {
    expect(folds(split("r", "horizontal", 0.5, leaf("a", { minBBoxPx: { widthPx: 590 } }), leaf("b")))).toBe(false);
    expect(folds(split("r", "horizontal", 0.5, leaf("a", { minBBoxPx: { widthPx: 610 } }), leaf("b")))).toBe(true);
  });

  it("a split's minPaneSizePx wins over the fold floor", () => {
    expect(folds(split("r", "horizontal", 0.5, leaf("a"), leaf("b"), { minPaneSizePx: 351 }))).toBe(true);
  });

  it("a static child's px pin is its floor", () => {
    const pinned = leaf("a", { sizing: { width: "static", widthPx: 610 } });
    expect(folds(split("r", "horizontal", 0.5, pinned, leaf("b")))).toBe(true);
  });

  it("with no fold floor, the config's minPaneSizePx", () => {
    expect(folds(split("r", "horizontal", 0.5, leaf("a"), leaf("b")), { ...BASE, minPaneSizePx: 351, fold: {} })).toBe(true);
    expect(folds(split("r", "horizontal", 0.5, leaf("a"), leaf("b")), { ...BASE, minPaneSizePx: 349, fold: {} })).toBe(false);
  });

  it("the gutter counts: gap and handle", () => {
    expect(folds(split("r", "horizontal", 0.5, leaf("a"), leaf("b")), { ...BASE, fold: { minPanePx: 340 } })).toBe(false);
    expect(folds(split("r", "horizontal", 0.5, leaf("a"), leaf("b")), { ...BASE, gapPx: 12, handleSizePx: 10, fold: { minPanePx: 340 } })).toBe(true);
  });

  it("a split's own minPaneSizePx of 0 opts it out of the fold floor", () => {
    expect(folds(split("r", "horizontal", 0.5, leaf("a"), leaf("b"), { minPaneSizePx: 0 }), { ...BASE, fold: { minPanePx: 400 } })).toBe(false);
  });

  it("one floor bigger than the split folds even against a sibling with none", () => {
    const tree = split("r", "horizontal", 0.5, leaf("a", { minBBoxPx: { widthPx: 800 } }), leaf("b"));
    expect(folds(tree, { ...BASE, fold: {} })).toBe(true);
  });

  it("a tree that repeats a split id is laid out unfolded", () => {
    const tree = split("x", "horizontal", 0.5, leaf("a"), split("x", "horizontal", 0.5, leaf("b"), leaf("c")));
    const plan = resolveFoldPlan(tree, box(250, 100), { ...BASE, fold: { minPanePx: 100 } }, "a");
    expect(plan.folds).toEqual([]);
    expect([...plan.leaves.keys()]).toEqual(["a", "b", "c"]);
  });

  it("a negative container gives no negative spine", () => {
    const plan = resolveFoldPlan(split("r", "horizontal", 0.5, leaf("a"), leaf("b")), { x: 0, y: 0, width: -50, height: 100 }, { ...BASE, fold: { minPanePx: 100 } }, "a");
    for (const fold of plan.folds) {
      expect(fold.spineRect.width).toBeGreaterThanOrEqual(0);
      expect(fold.openRect.width).toBeGreaterThanOrEqual(0);
    }
  });

  it("a master split never folds", () => {
    const master = split("r", "horizontal", 0.5, leaf("a"), split("s", "vertical", 0.5, leaf("b"), leaf("c")), { layoutMode: "master" });
    const plan = resolveFoldPlan(master, box(300, 300), { ...BASE, fold: { minPanePx: 400 } }, "a");
    expect(plan.folds).toEqual([]);
    expect([...plan.leaves.keys()]).toEqual(["a", "b", "c"]);
  });
});

describe("findFoldToward", () => {
  it("the nearest enclosing fold whose spine lies that way", () => {
    const plan = resolveFoldPlan(HOME, box(390, 844), SITE_FOLD, "features");
    expect(findFoldToward(plan, "features", "right")?.splitId).toBe("home-features-rest");
    expect(findFoldToward(plan, "features", "left")?.splitId).toBe("home-root");
    expect(findFoldToward(plan, "features", "up")).toBeNull();
    expect(findFoldToward(plan, "install", "left")).toBeNull();
  });

  it("past the last fold that way: null (the swipe carries on into the workspace)", () => {
    const plan = resolveFoldPlan(HOME, box(390, 844), SITE_FOLD, "intro");
    expect(findFoldToward(plan, "intro", "right")?.splitId).toBe("home-root");
    expect(findFoldToward(plan, "intro", "left")).toBeNull();
    const landscape = resolveFoldPlan(HOME, box(844, 390), SITE_FOLD, "intro");
    expect(findFoldToward(landscape, "intro", "down")?.splitId).toBe("home-intro-stack");
  });
});
