/**
 * hypr-tiling's `TilingTree` adapter (`engine/tiling-drag-tree.ts`) under `@n-uf/placement/tiling`'s drag:
 * - the library's conformance properties hold on it, over the golden trees (plain, and with every node feature);
 * - every held place's layout is what the renderer lays out for that tree (`resolveLeafRects`), so a frame that draws
 *   `after(held).layout` draws the renderer's own geometry;
 * - a swap's tree is the tree the existing swap reducers make (`deriveCandidateTree`), for a pane and a whole group;
 * - the operator's case: a swap reopens the subject's old place and the partner lands there.
 */
import { describe, expect, it } from "@jest/globals";
import { splitTreeOps, tilingConformance, tilingDrag, type Rect, type TilingDragOptions } from "@n-uf/placement/tiling";
import { deriveCandidateTree, type DragResolvedTarget } from "../engine/drag-machine";
import { resolveLeafRects } from "../engine/leaf-geometry";
import { normalizeLayout } from "../engine/layout-normalize";
import { findGroupContainingLeaf, readLeafNodeIds } from "../engine/state";
import {
  createLayoutTilingDrag,
  createTilingDragOps,
  deriveDropCommitTree,
  resolveTilingSwapPreview,
  tilingDragSplitOptions,
  tilingDragSubjectOf,
  type TilingDragTree,
} from "../engine/tiling-drag-tree";
import type { TilingLayoutConfig, TilingLayoutNode, TilingLeafNode } from "../engine/types";
import { AREAS, CONFIGS, goldenTrees } from "./golden/cases";

const AREA: Rect = AREAS[0]!;
const CONFIG: TilingLayoutConfig = CONFIGS.default!;

/**
 * Whether `layout`'s panes overlap as the renderer lays it out. A few rich golden trees do at the lift (a pane pinned
 * static across a split is taller than its room, so it runs over its neighbour): there a pane's old place lies over a
 * pane the release did not move, which the library's `home-over-changed` rightly reports. That is the tree's own
 * geometry, not the adapter's, so conformance runs on the trees that tile.
 */
function overlaps(layout: TilingLayoutNode, area: Rect, config: TilingLayoutConfig): boolean {
  const rects = [...resolveLeafRects(layout, area, config).values()];
  return rects.some((a, i) =>
    rects.some((b, j) => j > i && Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1e-6 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1e-6),
  );
}

const treesFor = (config: TilingLayoutConfig): TilingDragTree[] =>
  goldenTrees()
    .filter(({ tree }) => !overlaps(tree, AREA, config))
    .map(({ tree }) => ({ layout: tree }));

/** A swap as the drop resolver reports it (only the fields the reducers read matter). */
const swapOnto = (leafId: string): DragResolvedTarget =>
  ({
    leafId,
    zone: "center",
    action: "swap",
    finalEdge: null,
    selectedSplitZone: null,
    blockedReason: null,
  }) as unknown as DragResolvedTarget;

/** Every leaf of `node` with its tile. */
function leavesOf(node: TilingLayoutNode): TilingLeafNode[] {
  if (node.kind === "leaf") return [node];
  if (node.kind === "group") return [...node.members];
  return [...leavesOf(node.first), ...leavesOf(node.second)];
}

/** The renderer's rects of `layout`, by the tile each shown leaf carries. */
function rendererRectsByTile(layout: TilingLayoutNode, area: Rect, config: TilingLayoutConfig): Map<string, Rect> {
  const tileOf = new Map(leavesOf(layout).map((leaf) => [leaf.id, leaf.tileId]));
  const out = new Map<string, Rect>();
  for (const [leafId, rect] of resolveLeafRects(layout, area, config)) out.set(tileOf.get(leafId)!, rect);
  return out;
}

const near = (a: Rect | undefined, b: Rect | undefined, by = 1e-6): boolean =>
  !!a && !!b && Math.abs(a.x - b.x) <= by && Math.abs(a.y - b.y) <= by && Math.abs(a.width - b.width) <= by && Math.abs(a.height - b.height) <= by;

describe("the adapter conforms to the library's tiling drag", () => {
  for (const [name, config] of Object.entries(CONFIGS)) {
    it(`holds every property over the golden trees (${name}, the renderer's sizing and floors)`, () => {
      const options: TilingDragOptions<TilingDragTree, string> = {
        ...tilingDragSplitOptions(config),
        ops: createTilingDragOps(),
        area: AREA,
        min: config.minPaneSizePx,
      };
      const trees = treesFor(config);
      expect(trees.length).toBeGreaterThan(50);
      const run = tilingConformance(trees, options, 10);
      expect(run.failures).toEqual([]);
      expect(run.ok).toBe(true);
      for (const property of ["subject-once", "swap-trades-slots", "swap-keeps-stack-mates", "release-first", "stack-moves-whole", "one-layout"] as const) {
        expect(run.counts[property].checked).toBeGreaterThan(0);
      }
    });
  }

  it("holds every property with no per-child callbacks, so the swap's exchange of rects is checked too", () => {
    const plain: TilingDragTree[] = goldenTrees()
      .filter(({ name }) => name.startsWith("plain-"))
      .map(({ tree }) => ({ layout: tree }));
    const run = tilingConformance(plain, { gap: CONFIG.gapPx, handle: CONFIG.handleSizePx, ops: createTilingDragOps(), area: AREA, min: 0 }, 10);
    expect(run.failures).toEqual([]);
    expect(run.counts["swap-exchanges"].checked).toBeGreaterThan(0);
  });

  it("holds every property with the renderer's commit-time reconciliation as normalize", () => {
    const normalize = (layout: TilingLayoutNode): TilingLayoutNode =>
      normalizeLayout(layout, { containerWidthPx: AREA.width, containerHeightPx: AREA.height, config: CONFIG });
    // Conformance takes its trees as committed ones: reconciled already.
    const committed: TilingDragTree[] = goldenTrees()
      .filter(({ name }) => name.startsWith("plain-"))
      .map(({ tree }) => ({ layout: normalize(tree) }));
    const run = tilingConformance(committed, { ...tilingDragSplitOptions(CONFIG), ops: createTilingDragOps({ normalize }), area: AREA, min: 0 }, 10);
    expect(run.failures).toEqual([]);
  });
});

describe("a held place's layout is the renderer's geometry of its tree", () => {
  it("for home, every swap, every side and every join of every subject of every golden tree", () => {
    const ops = createTilingDragOps();
    let checked = 0;
    for (const { tree } of goldenTrees()) {
      for (const leafId of readLeafNodeIds(tree)) {
        for (const subject of ["pane", "group"] as const) {
          const drag = createLayoutTilingDrag({ layout: tree, sourceLeafId: leafId, subject, container: AREA, config: CONFIG });
          expect(drag).not.toBeNull();
          const places = [{ kind: "home" as const }, ...[...drag!.base.layout.keys()].flatMap((at) => [
            { kind: "swap" as const, at },
            { kind: "beside" as const, at, side: "left" as const },
            { kind: "beside" as const, at, side: "bottom" as const },
            { kind: "join" as const, at },
          ])];
          for (const held of places) {
            const after = drag!.after(held);
            if (after.refusal != null || after.tree.layout == null) continue;
            const drawn = rendererRectsByTile(after.tree.layout, AREA, CONFIG);
            const laid = new Map([...after.layout].map(([tile, rect]) => [ops.stackOf!(after.tree, tile)?.active ?? tile, rect]));
            expect([...laid.keys()].sort()).toEqual([...drawn.keys()].sort());
            for (const [tile, rect] of laid) expect(near(rect, drawn.get(tile))).toBe(true);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe("a swap commits the tree the swap reducers make", () => {
  it("after(swap).tree is deriveCandidateTree's swap, for a pane and a whole group, onto every drawn pane", () => {
    let checked = 0;
    for (const { tree } of goldenTrees()) {
      for (const source of readLeafNodeIds(tree)) {
        for (const subject of ["pane", "group"] as const) {
          const drag = createLayoutTilingDrag({ layout: tree, sourceLeafId: source, subject, container: AREA, config: CONFIG });
          for (const target of resolveLeafRects(tree, AREA, CONFIG).keys()) {
            if (target === source) continue;
            const preview = resolveTilingSwapPreview(drag, target);
            if (preview == null) continue;
            expect(preview.layout).toEqual(deriveCandidateTree(tree, source, swapOnto(target), subject));
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it("the swap is refused (null) only where the library says the place is the subject's own", () => {
    const layout: TilingLayoutNode = {
      kind: "split",
      id: "root",
      axis: "horizontal",
      ratio: 0.5,
      first: {
        kind: "group",
        id: "g",
        members: [
          { kind: "leaf", id: "A", tileId: "a" },
          { kind: "leaf", id: "B", tileId: "b" },
          { kind: "leaf", id: "C", tileId: "c" },
        ],
        activeMemberId: "A",
      },
      second: { kind: "leaf", id: "D", tileId: "d" },
    };
    // A tab torn off its group, held over the group it left: its own place.
    const torn = createLayoutTilingDrag({ layout, sourceLeafId: "C", container: AREA, config: CONFIG });
    expect(resolveTilingSwapPreview(torn, "A")).toBeNull();
    expect(torn!.after({ kind: "swap", at: "a" }).refusal).toEqual({ code: "self" });
    // The same tab held over D: D takes its place in the group, at its index, and lands behind the group's active
    // tab, so its landing is the group's slot.
    const ontoD = resolveTilingSwapPreview(torn, "D");
    expect(ontoD).not.toBeNull();
    expect(findGroupContainingLeaf(ontoD!.layout, "C")!.members.map((m) => m.tileId)).toEqual(["a", "b", "d"]);
    expect(ontoD!.partnerRect).toEqual(torn!.lift.layout.get("a"));
  });

  it("names the subject as the library takes it: a pane by its tile, a group whole", () => {
    const layout: TilingLayoutNode = {
      kind: "split",
      id: "root",
      axis: "horizontal",
      ratio: 0.5,
      first: { kind: "group", id: "g", members: [{ kind: "leaf", id: "A", tileId: "a" }, { kind: "leaf", id: "B", tileId: "b" }], activeMemberId: "B" },
      second: { kind: "leaf", id: "D", tileId: "d" },
    };
    expect(tilingDragSubjectOf(layout, "A")).toEqual({ kind: "pane", pane: "a" });
    expect(tilingDragSubjectOf(layout, "B", "group")).toEqual({ kind: "stack", stack: { id: "g", members: ["a", "b"], active: "b" } });
    expect(tilingDragSubjectOf(layout, "D", "group")).toEqual({ kind: "pane", pane: "d" });
    expect(tilingDragSubjectOf(layout, "nope")).toBeNull();
  });
});

describe("the operator's case: 02 held over 03 Install", () => {
  // The site's columns: 01 above 02 in the first column, then 03, 04, 05.
  const layout: TilingLayoutNode = {
    kind: "split",
    id: "s0",
    axis: "horizontal",
    ratio: 0.25,
    first: {
      kind: "split",
      id: "col1",
      axis: "vertical",
      ratio: 0.5,
      first: { kind: "leaf", id: "leaf-01", tileId: "hypr-tiling" },
      second: { kind: "leaf", id: "leaf-02", tileId: "features" },
    },
    second: {
      kind: "split",
      id: "s1",
      axis: "horizontal",
      ratio: 1 / 3,
      first: { kind: "leaf", id: "leaf-03", tileId: "install" },
      second: {
        kind: "split",
        id: "s2",
        axis: "horizontal",
        ratio: 0.5,
        first: { kind: "leaf", id: "leaf-04", tileId: "use-cases" },
        second: { kind: "leaf", id: "leaf-05", tileId: "seo" },
      },
    },
  };
  const area: Rect = { x: 0, y: 0, width: 1600, height: 900 };
  const drag = createLayoutTilingDrag({ layout, sourceLeafId: "leaf-02", container: area, config: CONFIG })!;
  const lift = drag.lift.layout;

  it("closes the gap at rest: 01 grows into 02's place", () => {
    expect(drag.home).toEqual(lift.get("features"));
    expect(drag.base.layout.get("hypr-tiling")!.height).toBeGreaterThan(lift.get("hypr-tiling")!.height);
  });

  it("over 03 the old place reopens: 01 gives the room back and 03 lands where 02 was", () => {
    const preview = resolveTilingSwapPreview(drag, "leaf-03")!;
    expect(preview).not.toBeNull();
    expect(preview.partnerTileId).toBe("install");
    expect(near(preview.partnerRect, lift.get("features"))).toBe(true);
    expect(near(preview.landing, lift.get("install"))).toBe(true);
    expect(near(preview.after.layout.get("hypr-tiling"), lift.get("hypr-tiling"))).toBe(true);
    // Only the partner moves from where it was drawn at the lift.
    expect(preview.after.moved.map((m) => m.pane)).toEqual(["install"]);
  });

  it("the release commits exactly what was shown", () => {
    const preview = resolveTilingSwapPreview(drag, "leaf-03")!;
    const committed = deriveCandidateTree(layout, "leaf-02", swapOnto("leaf-03"));
    expect(preview.layout).toEqual(committed);
    const drawn = rendererRectsByTile(committed, area, CONFIG);
    for (const [tile, rect] of preview.after.layout) expect(near(rect, drawn.get(tile))).toBe(true);
  });

  it("is the reference adapter's answer on the same split (the library's own rule, not hypr's)", () => {
    const ops = createTilingDragOps();
    const split = ops.split({ layout })!;
    const reference = tilingDrag({ split }, { kind: "pane", pane: "features" }, { ...tilingDragSplitOptions(CONFIG), ops: splitTreeOps<string>(), area, min: 0 });
    const ours = drag.after({ kind: "swap", at: "install" });
    const theirs = reference.after({ kind: "swap", at: "install" });
    expect([...ours.layout.keys()].sort()).toEqual([...theirs.layout.keys()].sort());
    for (const [tile, rect] of theirs.layout) expect(near(ours.layout.get(tile), rect)).toBe(true);
  });
});

describe("deriveDropCommitTree: a release commits what the frame drew", () => {
  it("from the shown drag itself, its min and parts included, and else from a drag on the same min", () => {
    for (const { tree } of goldenTrees().slice(0, 6)) {
      const leaves = readLeafNodeIds(tree);
      if (leaves.length < 2) continue;
      const [source, other] = [leaves[0]!, leaves[1]!];
      const shown = createLayoutTilingDrag({ layout: tree, sourceLeafId: source, container: AREA, config: CONFIG, min: CONFIG.minPaneSizePx });
      const tile = (findLeafByIdIn(tree, other) as TilingLeafNode).tileId;
      const after = shown!.after({ kind: "swap", at: tile });
      if (after.refusal || !after.tree.layout) continue;
      const target = { leafId: other, place: { kind: "swap", at: tile } } as unknown as DragResolvedTarget;
      const base = { layout: tree, sourceLeafId: source, target, container: AREA, config: CONFIG };
      expect(deriveDropCommitTree({ ...base, drag: shown })).toBe(after.tree.layout);
      expect(deriveDropCommitTree(base)).toEqual(after.tree.layout);
    }
  });
});

function findLeafByIdIn(node: TilingLayoutNode, id: string): TilingLeafNode | null {
  if (node.kind === "leaf") return node.id === id ? node : null;
  if (node.kind === "group") return node.members.find((m) => m.id === id) ?? null;
  return findLeafByIdIn(node.first, id) ?? findLeafByIdIn(node.second, id);
}
