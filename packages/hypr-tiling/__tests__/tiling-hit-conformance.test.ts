/**
 * The drag's hit half on hypr-tiling's own adapter: `@n-uf/placement/tiling`'s seven hit properties
 * (`tilingHitConformance`), on both bases, over layouts with splits, a tab group and pane parts (a group's tab strip
 * with a slot per member, a title bar band on every pane), as the renderer declares them at the lift.
 */
import { tilingHitConformance, type TilingDragOptions } from "@n-uf/placement/tiling";
import {
  createTilingDragOps,
  tilingDragParts,
  tilingDragSplitOptions,
  type TilingDragTree,
} from "../engine/tiling-drag-tree";
import type { TilingLayoutConfig, TilingLayoutNode } from "../engine/types";

const config: TilingLayoutConfig = { gapPx: 6, minPaneSizePx: 96, handleSizePx: 4 };
const L = (id: string, tileId: string): TilingLayoutNode => ({ kind: "leaf", id, tileId }) as TilingLayoutNode;
const split = (id: string, axis: "horizontal" | "vertical", ratio: number, first: TilingLayoutNode, second: TilingLayoutNode): TilingLayoutNode =>
  ({ kind: "split", id, axis, ratio, first, second }) as TilingLayoutNode;
const group = (id: string, members: TilingLayoutNode[], active: string): TilingLayoutNode =>
  ({ kind: "group", id, members, activeMemberId: active }) as TilingLayoutNode;

const three: TilingLayoutNode = split("root", "horizontal", 0.5, L("la", "a"), split("right", "vertical", 0.5, L("lb", "b"), L("lc", "c")));
const grouped: TilingLayoutNode = split("root", "horizontal", 0.5, L("la", "a"), group("g", [L("lb", "b"), L("lc", "c"), L("ld", "d")], "lb"));
const column: TilingLayoutNode = split(
  "root",
  "horizontal",
  0.26,
  split("col", "vertical", 0.66, group("hero", [L("l1", "t1"), L("l2", "t2"), L("l3", "t3")], "l1"), L("l4", "t4")),
  split("rest", "horizontal", 0.5, L("l5", "t5"), split("far", "horizontal", 0.6, L("l6", "t6"), L("l7", "t7"))),
);
const four: TilingLayoutNode = split("root", "vertical", 0.4, split("top", "horizontal", 0.3, L("la", "a"), L("lb", "b")), split("bottom", "horizontal", 0.7, L("lc", "c"), L("ld", "d")));

const tiles: readonly string[] = ["a", "b", "c", "d", "t1", "t2", "t3", "t4", "t5", "t6", "t7"];
const parts = tilingDragParts({
  strip: { top: 0, height: 30, left: 4, gap: 4, widths: new Map(tiles.map((t: string, i: number): [string, number] => [t, 110 + 10 * (i % 3)])) },
  bands: new Map(tiles.map((t: string): [string, ReadonlyArray<{ left: number; top: number; right: number; height: number }>] => [t, [{ left: 0, top: 0, right: 0, height: 37 }]])),
});

const options: TilingDragOptions<TilingDragTree, string> = {
  ...tilingDragSplitOptions(config),
  ops: createTilingDragOps({ parts }),
  area: { x: 0, y: 0, width: 1408, height: 868 },
  min: config.minPaneSizePx,
};

describe("the drag's hit on hypr-tiling's adapter: the seven properties", () => {
  it("hold on splits, a tab group and the home column, both bases", () => {
    const run = tilingHitConformance<TilingDragTree, string>([three, grouped, column, four].map((layout) => ({ layout })), options);
    expect(run.failures).toEqual([]);
    for (const c of Object.values(run.counts)) expect(c.checked).toBeGreaterThan(0);
    expect(run.ok).toBe(true);
  });
});
