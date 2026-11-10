import { describe, expect, it } from "@jest/globals";
import {
  resolveLayoutGeometry,
  resolveLeafRects,
  type TilingLayoutConfig,
  type TilingLayoutNode,
  type TilingLeafNode,
  type TilingRect,
  type TilingSplitNode,
} from "../engine";
import { collectLeafFootprints } from "../engine/leaf-geometry";

// The public geometry export (`@n-uf/hypr-tiling/engine`): the renderer's own leaf geometry in px, as rects.

function leaf(id: string): TilingLeafNode {
  return { kind: "leaf", id, tileId: `tile-${id}` };
}

function split(id: string, axis: "horizontal" | "vertical", ratio: number, first: TilingLayoutNode, second: TilingLayoutNode): TilingSplitNode {
  return { kind: "split", id, axis, ratio, first, second };
}

/** A gap, no handle, no floors: the plain ratio math */
const PLAIN: TilingLayoutConfig = { gapPx: 10, minPaneSizePx: 0, handleSizePx: 0, resizeFloor: "body" };
const BOX: TilingRect = { x: 0, y: 0, width: 1000, height: 600 };

describe("resolveLayoutGeometry: dwindle (binary splits)", () => {
  it("a split gives each side its ratio of the extent less half the gap", () => {
    const tree = split("r", "horizontal", 0.5, leaf("a"), split("r1", "vertical", 0.5, leaf("b"), leaf("c")));
    const { leaves, splits } = resolveLayoutGeometry(tree, BOX, PLAIN);
    expect(leaves.get("a")).toEqual({ x: 0, y: 0, width: 495, height: 600 });
    expect(leaves.get("b")).toEqual({ x: 505, y: 0, width: 495, height: 295 });
    expect(leaves.get("c")).toEqual({ x: 505, y: 305, width: 495, height: 295 });
    expect([...leaves.keys()]).toEqual(["a", "b", "c"]);
    expect(splits.get("r")).toEqual({ rect: BOX, ratio: 0.5 });
    expect(splits.get("r1")).toEqual({ rect: { x: 505, y: 0, width: 495, height: 600 }, ratio: 0.5 });
  });

  it("nested splits and uneven ratios, in a container that doesn't start at the origin", () => {
    const tree = split("r", "vertical", 0.25, leaf("top"), split("r1", "horizontal", 0.75, split("r10", "vertical", 0.5, leaf("x"), leaf("y")), leaf("z")));
    const leaves = resolveLeafRects(tree, { x: 20, y: 40, width: 800, height: 400 }, { ...PLAIN, gapPx: 0 });
    expect(leaves.get("top")).toEqual({ x: 20, y: 40, width: 800, height: 100 });
    expect(leaves.get("x")).toEqual({ x: 20, y: 140, width: 600, height: 150 });
    expect(leaves.get("y")).toEqual({ x: 20, y: 290, width: 600, height: 150 });
    expect(leaves.get("z")).toEqual({ x: 620, y: 140, width: 200, height: 300 });
  });

  it("nothing is rounded: an odd extent splits into fractional px", () => {
    const halves = resolveLeafRects(split("r", "horizontal", 0.5, leaf("a"), leaf("b")), { x: 0, y: 0, width: 101, height: 51 }, { ...PLAIN, gapPx: 0 });
    expect(halves.get("a")).toEqual({ x: 0, y: 0, width: 50.5, height: 51 });
    expect(halves.get("b")).toEqual({ x: 50.5, y: 0, width: 50.5, height: 51 });
    const thirds = resolveLeafRects(split("r", "horizontal", 1 / 3, leaf("a"), leaf("b")), { x: 0, y: 0, width: 100, height: 10 }, { ...PLAIN, gapPx: 3 });
    expect(thirds.get("a")!.width).toBeCloseTo(100 / 3 - 1.5, 10);
    expect(thirds.get("b")!.x).toBeCloseTo(100 / 3 + 1.5, 10);
    expect(Number.isInteger(thirds.get("a")!.width)).toBe(false);
  });

  it("the gutter is the gap plus the handle; a split's own gapPx wins over the config's", () => {
    const withHandle = resolveLeafRects(split("r", "horizontal", 0.5, leaf("a"), leaf("b")), BOX, { ...PLAIN, gapPx: 8, handleSizePx: 4 });
    expect(withHandle.get("a")!.width).toBe(494);
    expect(withHandle.get("b")).toMatchObject({ x: 506, width: 494 });
    const own: TilingSplitNode = { ...split("r", "horizontal", 0.5, leaf("a"), leaf("b")), gapPx: 20 };
    expect(resolveLeafRects(own, BOX, PLAIN).get("b")).toMatchObject({ x: 510, width: 490 });
  });

  it("the ratio in effect: clamped to 5–95%, and by the panes' floors (0.5 when both can't fit)", () => {
    const wide = resolveLayoutGeometry(split("r", "horizontal", 0.99, leaf("a"), leaf("b")), BOX, { ...PLAIN, gapPx: 0 });
    expect(wide.splits.get("r")!.ratio).toBe(0.95);
    expect(wide.leaves.get("a")!.width).toBe(950);
    const floored = resolveLayoutGeometry(split("r", "horizontal", 0.1, leaf("a"), leaf("b")), BOX, { ...PLAIN, gapPx: 0, minPaneSizePx: 300 });
    expect(floored.splits.get("r")!.ratio).toBeCloseTo(0.3, 10);
    expect(floored.leaves.get("a")!.width).toBeCloseTo(300, 10);
    const tooSmall = resolveLayoutGeometry(split("r", "horizontal", 0.2, leaf("a"), leaf("b")), BOX, { ...PLAIN, gapPx: 0, minPaneSizePx: 600 });
    expect(tooSmall.splits.get("r")!.ratio).toBe(0.5);
  });

  it("a child static along the split takes its px pin; the split reports the boundary at the gutter's middle", () => {
    const pinned: TilingLeafNode = { ...leaf("a"), sizing: { width: "static", widthPx: 200 } };
    const { leaves, splits } = resolveLayoutGeometry(split("r", "horizontal", 0.5, pinned, leaf("b")), BOX, PLAIN);
    expect(leaves.get("a")).toEqual({ x: 0, y: 0, width: 200, height: 600 });
    expect(leaves.get("b")).toEqual({ x: 210, y: 0, width: 790, height: 600 });
    expect(splits.get("r")!.ratio).toBeCloseTo(205 / 1000, 10);
  });

  it("the default resize floor is the collapsed title bar, with no 5–95% net", () => {
    const { splits } = resolveLayoutGeometry(split("r", "horizontal", 0.99, leaf("a"), leaf("b")), BOX, { gapPx: 0, minPaneSizePx: 0, handleSizePx: 0, collapsedExtentPx: 40 });
    expect(splits.get("r")!.ratio).toBeCloseTo(1 - 40 / 1000, 10);
  });

  it("a container smaller than its gutters gives zero-size panes, never negative ones", () => {
    const leaves = resolveLeafRects(split("r", "horizontal", 0.5, leaf("a"), leaf("b")), { x: 0, y: 0, width: 6, height: 10 }, { ...PLAIN, gapPx: 20 });
    expect(leaves.get("a")!.width).toBe(0);
    expect(leaves.get("b")!.width).toBe(0);
  });
});

describe("resolveLayoutGeometry: master layouts", () => {
  const master = (orientation: "left" | "right" | "top" | "bottom", count = 1): TilingSplitNode => ({
    ...split("m", "horizontal", 0.6, leaf("a"), split("m1", "horizontal", 0.5, leaf("b"), leaf("c"))),
    layoutMode: "master",
    masterCount: count,
    masterOrientation: orientation,
  });

  it("left: a master column of `ratio` of the width less one gap, the stack beside it divided equally", () => {
    const { leaves, splits } = resolveLayoutGeometry(master("left"), BOX, PLAIN);
    expect(leaves.get("a")).toEqual({ x: 0, y: 0, width: 594, height: 600 });
    expect(leaves.get("b")).toEqual({ x: 604, y: 0, width: 396, height: 295 });
    expect(leaves.get("c")).toEqual({ x: 604, y: 305, width: 396, height: 295 });
    // The master split is reported; the splits under it are flattened into slots, never laid out as splits
    expect([...splits.keys()]).toEqual(["m"]);
    expect(splits.get("m")).toEqual({ rect: BOX, ratio: 0.6 });
  });

  it("top with two masters: a master row, its two tiles side by side, the stack below", () => {
    const leaves = resolveLeafRects(master("top", 2), BOX, PLAIN);
    expect(leaves.get("a")).toEqual({ x: 0, y: 0, width: 495, height: 354 });
    expect(leaves.get("b")).toEqual({ x: 505, y: 0, width: 495, height: 354 });
    expect(leaves.get("c")).toEqual({ x: 0, y: 364, width: 1000, height: 236 });
  });

  it("right: the stack first, the master after it", () => {
    const leaves = resolveLeafRects(master("right"), BOX, PLAIN);
    expect(leaves.get("a")).toEqual({ x: 406, y: 0, width: 594, height: 600 });
    expect(leaves.get("b")).toMatchObject({ x: 0, width: 396 });
  });
});

describe("resolveLayoutGeometry: groups, and the renderer's math", () => {
  it("a group shows its active member in the whole slot", () => {
    const group: TilingLayoutNode = { kind: "group", id: "g", members: [leaf("p"), leaf("q")], activeMemberId: "q" };
    const leaves = resolveLeafRects(split("r", "horizontal", 0.5, leaf("a"), group), BOX, PLAIN);
    expect([...leaves.keys()]).toEqual(["a", "q"]);
    expect(leaves.get("q")).toEqual({ x: 505, y: 0, width: 495, height: 600 });
  });

  it("is the renderer's own footprint pass, as rects", () => {
    const tree = split("r", "horizontal", 0.37, split("r0", "vertical", 0.61, leaf("a"), leaf("b")), {
      ...split("m", "vertical", 0.45, leaf("c"), split("m1", "horizontal", 0.5, leaf("d"), leaf("e"))),
      layoutMode: "master",
      masterOrientation: "bottom",
    });
    const config: TilingLayoutConfig = { gapPx: 7, minPaneSizePx: 40, handleSizePx: 3 };
    const box: TilingRect = { x: 13, y: 17, width: 1237, height: 731 };
    const ours = resolveLeafRects(tree, box, config);
    const theirs = collectLeafFootprints(tree, box.x, box.y, box.width, box.height, config);
    expect(theirs.length).toBe(ours.size);
    for (const f of theirs) expect(ours.get(f.leafId)).toEqual({ x: f.left, y: f.top, width: f.width, height: f.height });
  });
});
