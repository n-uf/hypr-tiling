/**
 * Properties of the layout, drop and region rules over seeded trees. Together with the golden answers they are the
 * regression gate for moving the engine onto the shared libraries: these say what must hold for any input, the
 * golden answers what the answers were.
 */
import { describe, expect, it } from "@jest/globals";
import { classifyPaneZone, resolvePaneZoneGeometry, TILING_DROP_INTENT_CONFIG } from "../engine/drop-intent-resolver";
import { deriveCandidateTree } from "../engine/drag-machine";
import { resolveLayoutGeometry } from "../engine/leaf-geometry";
import { readLeafNodeIds, removeLeafTile, siblingSubtreeForLeaf, tileOrderByLeafId } from "../engine/state";
import type { TilingLayoutConfig, TilingLayoutNode, TilingSplitNode } from "../engine/types";
import { AREAS, randomTree, seeded, shape, tilesOf } from "./golden/cases";

const SEEDS = 120;
const plainTrees = (): TilingLayoutNode[] =>
  Array.from({ length: SEEDS }, (_, i) => {
    const r = seeded(20_000 + i);
    return randomTree(r, tilesOf(2 + Math.floor(r() * 8)), false);
  });

const overlapArea = (a: { x: number; y: number; width: number; height: number }, b: typeof a): number =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

function splitsOf(node: TilingLayoutNode): TilingSplitNode[] {
  return node.kind === "split" ? [node, ...splitsOf(node.first), ...splitsOf(node.second)] : [];
}

describe("layout properties", () => {
  const configs: TilingLayoutConfig[] = [
    { gapPx: 0, handleSizePx: 0, minPaneSizePx: 0, resizeFloor: "body" },
    { gapPx: 6, handleSizePx: 4, minPaneSizePx: 96 },
    { gapPx: 6, handleSizePx: 4, minPaneSizePx: 96, resizeFloor: "body" },
  ];

  it("panes never overlap and no size is negative", () => {
    for (const tree of plainTrees()) {
      for (const config of configs) {
        for (const area of AREAS.slice(0, 3)) {
          const rects = [...resolveLayoutGeometry(tree, area, config).leaves.values()];
          for (const r of rects) expect(r.width >= 0 && r.height >= 0).toBe(true);
          for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlapArea(rects[i]!, rects[j]!)).toBeLessThanOrEqual(0.5);
        }
      }
    }
  });

  it("with no floor in force the middle of each gutter sits at ratio × extent", () => {
    const config: TilingLayoutConfig = { gapPx: 8, handleSizePx: 2, minPaneSizePx: 0, resizeFloor: "body" };
    for (const tree of plainTrees()) {
      const geometry = resolveLayoutGeometry(tree, AREAS[0]!, config);
      // A box smaller than a gutter lays its panes at no size, possibly past its end: not this property's case.
      if ([...geometry.leaves.values()].some((r) => r.width < 10 || r.height < 10)) continue;
      for (const split of splitsOf(tree)) {
        const laid = geometry.splits.get(split.id);
        if (!laid || split.ratio < 0.05 || split.ratio > 0.95) continue;
        expect(laid.ratio).toBeCloseTo(split.ratio, 12);
        const firstLeaf = readLeafNodeIds(split.first)[0]!;
        const first = geometry.leaves.get(firstLeaf)!;
        const extent = split.axis === "horizontal" ? laid.rect.width : laid.rect.height;
        const start = split.axis === "horizontal" ? laid.rect.x : laid.rect.y;
        const firstStart = split.axis === "horizontal" ? first.x : first.y;
        expect(firstStart).toBeCloseTo(start, 9);
        // the first side's subtree ends half a gutter before ratio × extent
        const firstEnd = Math.max(
          ...readLeafNodeIds(split.first).map((id) => {
            const r = geometry.leaves.get(id)!;
            return split.axis === "horizontal" ? r.x + r.width : r.y + r.height;
          }),
        );
        if (extent * split.ratio - 5 > 0) expect(firstEnd).toBeCloseTo(start + extent * split.ratio - 5, 6);
      }
    }
  });

  it("each side keeps its floor when both floors fit; otherwise the ratio is 0.5", () => {
    const config: TilingLayoutConfig = { gapPx: 6, handleSizePx: 4, minPaneSizePx: 96, resizeFloor: "body" };
    for (const tree of plainTrees()) {
      for (const area of AREAS.slice(0, 3)) {
        const geometry = resolveLayoutGeometry(tree, area, config);
        for (const split of splitsOf(tree)) {
          const laid = geometry.splits.get(split.id);
          if (!laid) continue;
          const extent = split.axis === "horizontal" ? laid.rect.width : laid.rect.height;
          const avail = Math.max(extent - 10, 1);
          if (96 + 96 > avail) expect(laid.ratio).toBe(0.5);
          else {
            expect(laid.ratio * avail).toBeGreaterThanOrEqual(96 - 1e-9);
            expect((1 - laid.ratio) * avail).toBeGreaterThanOrEqual(96 - 1e-9);
          }
        }
      }
    }
  });
});

describe("edit and drop properties", () => {
  it("closing a pane leaves its sibling's subtree as it was", () => {
    for (const tree of plainTrees()) {
      for (const id of readLeafNodeIds(tree)) {
        const sibling = siblingSubtreeForLeaf(tree, id);
        if (sibling == null) continue;
        expect(shape(removeLeafTile(tree, id))).toContain(shape(sibling));
      }
    }
  });

  it("a drop keeps the set of tiles, and an edge drop taken back out gives the lifted tree", () => {
    for (const tree of plainTrees().slice(0, 40)) {
      const tiles = [...tileOrderByLeafId(tree)].sort();
      const ids = readLeafNodeIds(tree);
      for (const s of ids) {
        for (const t of ids) {
          if (s === t) continue;
          for (const zone of ["center", "top", "right", "bottom", "left"] as const) {
            const target = { leafId: t, zone, action: zone === "center" ? "swap" : "edge-insert", finalEdge: zone === "center" ? null : zone, selectedSplitZone: zone === "center" ? null : zone } as unknown as Parameters<typeof deriveCandidateTree>[2];
            const after = deriveCandidateTree(tree, s, target);
            expect([...tileOrderByLeafId(after)].sort()).toEqual(tiles);
            if (zone !== "center") expect(shape(removeLeafTile(after, s))).toEqual(shape(removeLeafTile(tree, s)));
          }
        }
      }
    }
  });
});

describe("drop region properties", () => {
  const sizes = [
    { width: 600, height: 400 },
    { width: 90, height: 260 },
    { width: 24, height: 24 },
  ];
  const step = (p: { x: number; y: number }, zone: string, by: number, size: { width: number; height: number }): { x: number; y: number } => {
    if (zone === "left") return { x: p.x - by, y: p.y };
    if (zone === "right") return { x: p.x + by, y: p.y };
    if (zone === "top") return { x: p.x, y: p.y - by };
    if (zone === "bottom") return { x: p.x, y: p.y + by };
    const dx = size.width / 2 - p.x;
    const dy = size.height / 2 - p.y;
    const len = Math.hypot(dx, dy);
    return len <= by || len === 0 ? { x: size.width / 2, y: size.height / 2 } : { x: p.x + (dx / len) * by, y: p.y + (dy / len) * by };
  };

  it("every point of a pane is in exactly one region, and a held region is never more than the hysteresis past its boundary", () => {
    const zones = ["center", "top", "right", "bottom", "left"] as const;
    for (const size of sizes) {
      const geometry = resolvePaneZoneGeometry(size, { ...TILING_DROP_INTENT_CONFIG, devicePixelRatio: 1 });
      const r = seeded(size.width);
      for (let i = 0; i < 2000; i++) {
        const p = { x: r() * size.width, y: r() * size.height };
        const raw = classifyPaneZone(p, geometry);
        expect(zones).toContain(raw);
        for (const previous of zones) {
          const held = classifyPaneZone(p, geometry, { previousZone: previous, hysteresisPx: 6 });
          expect([raw, previous]).toContain(held);
          if (held !== raw) expect(classifyPaneZone(step(p, previous, 6, size), geometry)).toBe(previous);
        }
      }
    }
  });
});
