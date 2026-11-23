/**
 * Properties of the layout, drop and region rules over seeded trees. Together with the golden answers they are the
 * regression gate for moving the engine onto the shared libraries: these say what must hold for any input, the
 * golden answers what the answers were.
 */
import { describe, expect, it } from "@jest/globals";
import { paneRegion, type PaneRegion } from "@n-uf/placement/tiling";
import { resolvePaneCenterGeometry, TILING_DROP_INTENT_CONFIG } from "../engine/drop-intent-resolver";
import { clampHeldRectToStage } from "../engine/drag-landing";
import { resolveLayoutGeometry } from "../engine/leaf-geometry";
import { findLeafById, readLeafNodeIds, removeLeafTile, siblingSubtreeForLeaf, tileOrderByLeafId } from "../engine/state";
import type { TilingLayoutConfig, TilingLayoutNode, TilingSplitNode } from "../engine/types";
import { AREAS, hitRun, layoutDrag, randomTree, seeded, shape, tilesOf } from "./golden/cases";

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
    const open: TilingLayoutConfig = { gapPx: 0, handleSizePx: 0, minPaneSizePx: 0 };
    let taken = 0;
    for (const tree of plainTrees().slice(0, 40)) {
      const tiles = [...tileOrderByLeafId(tree)].sort();
      const ids = readLeafNodeIds(tree);
      for (const s of ids) {
        const drag = layoutDrag(tree, s, AREAS[0]!, open)!;
        for (const t of ids) {
          if (s === t) continue;
          const at: string = findLeafById(tree, t)!.tileId;
          for (const zone of ["center", "top", "right", "bottom", "left"] as const) {
            const after = drag.after(zone === "center" ? { kind: "swap", at } : { kind: "beside", at, side: zone });
            if (after.refusal != null || after.tree.layout == null) continue;
            taken += 1;
            expect([...tileOrderByLeafId(after.tree.layout)].sort()).toEqual(tiles);
            if (zone !== "center") expect(shape(removeLeafTile(after.tree.layout, s))).toEqual(shape(removeLeafTile(tree, s)));
          }
        }
      }
    }
    expect(taken).toBeGreaterThan(0);
  });
});

describe("drop region properties", () => {
  const sizes = [
    { width: 600, height: 400 },
    { width: 90, height: 260 },
    { width: 24, height: 24 },
  ];
  it("every point of a pane is in exactly one region, the center on the drop hit zone geometry's rectangle", () => {
    const zones: readonly PaneRegion[] = ["center", "top", "right", "bottom", "left"];
    for (const size of sizes) {
      const geometry = resolvePaneCenterGeometry(size, { ...TILING_DROP_INTENT_CONFIG, devicePixelRatio: 1 });
      const paneCenter = { width: geometry.width, height: geometry.height, left: geometry.centerLeftPx, top: geometry.centerTopPx, right: geometry.centerRightPx, bottom: geometry.centerBottomPx };
      const r = seeded(size.width);
      for (let i = 0; i < 2000; i++) {
        const p = { x: r() * size.width, y: r() * size.height };
        const region = paneRegion({ x: 0, y: 0, ...size }, p, null, { paneCenter });
        expect(zones).toContain(region);
        const inCenter = p.x >= geometry.centerLeftPx && p.x <= geometry.centerRightPx && p.y >= geometry.centerTopPx && p.y <= geometry.centerBottomPx;
        if (inCenter) expect(region).toBe("center");
        if (!inCenter) expect(region).not.toBe("center");
      }
    }
  });
});

/** Whether some point within `px` per axis of `p` (probed every half pixel) reads `place` on the hit's zone map. */
function zoneWithin(hit: { placeAt(point: { x: number; y: number }): string | null }, p: { x: number; y: number }, px: number, place: string): boolean {
  for (let dx = -px; dx <= px; dx += 0.5) {
    for (let dy = -px; dy <= px; dy += 0.5) {
      if (hit.placeAt({ x: p.x + dx, y: p.y + dy }) === place) return true;
    }
  }
  return false;
}

describe("drag hit hold properties", () => {
  it("what the hit holds is the zone under the pointer or the place it held before, and nothing is held before the first sample", () => {
    // Counted, so the property cannot pass on hits that held nothing.
    let hits = 0;
    let kept = 0;
    let keptByEdge = 0;
    let switched = 0;
    for (const tree of plainTrees().slice(0, 30)) {
      const rects = resolveLayoutGeometry(tree, AREAS[0]!, { gapPx: 6, handleSizePx: 4, minPaneSizePx: 96 }).leaves;
      for (const leafId of [...rects.keys()].slice(0, 3)) {
        const drag = layoutDrag(tree, leafId, AREAS[0]!, { gapPx: 6, handleSizePx: 4, minPaneSizePx: 96 });
        if (drag == null) continue;
        for (const basis of ["lift", "base"] as const) {
          const { hit } = hitRun(drag, basis);
          hits++;
          const r = seeded(Math.round(AREAS[0]!.width * 3 + hits));
          const point = () => ({ x: r() * AREAS[0]!.width, y: r() * AREAS[0]!.height });
          for (let i = 0; i < 60; i++) {
            const p = point();
            expect(hit.hold(null, p)?.place ?? null).toBe(hit.placeAt(p));
            const q = point();
            const taken = hit.hold(null, q);
            if (taken == null) continue;
            const held = hit.hold(taken, p);
            const raw = hit.placeAt(p);
            if (held == null) expect(raw).toBeNull();
            else expect([raw, taken.place]).toContain(held.place);
            if (held?.place === taken.place && raw !== taken.place) {
              kept++;
              // The upper bound: a place is kept only within 6 px past the part of its zone that shows, or within the
              // travel (capped, so at most 24 px per axis) of where it was taken; past both, the point reads the raw
              // zone. Home's rim included: home wins over a zone that runs on beneath it.
              if (Math.abs(p.x - taken.from.x) >= 24 || Math.abs(p.y - taken.from.y) >= 24) {
                keptByEdge++;
                expect(zoneWithin(hit, p, 6, taken.place)).toBe(true);
              }
            }
            if (held != null && held.place !== taken.place) switched++;
          }
        }
      }
    }
    expect(hits).toBeGreaterThan(100);
    expect(kept).toBeGreaterThan(0);
    expect(keptByEdge).toBeGreaterThan(0);
    expect(switched).toBeGreaterThan(0);
  });
});

describe("drag home properties", () => {
  it("while the pointer has stayed inside the lifted pane's home, the hit holds home, the layout drawn is the lift's and a release cancels", () => {
    // Counted, so the property cannot pass on drags that never held anything.
    let drags = 0;
    let samples = 0;
    let releases = 0;
    for (const tree of plainTrees().slice(0, 40)) {
      const config: TilingLayoutConfig = { gapPx: 6, handleSizePx: 4, minPaneSizePx: 96 };
      const rects = resolveLayoutGeometry(tree, AREAS[0]!, config).leaves;
      for (const [leafId, rect] of rects) {
        const drag = layoutDrag(tree, leafId, AREAS[0]!, config);
        if (drag == null) continue;
        for (const basis of ["lift", "base"] as const) {
          const run = hitRun(drag, basis);
          const r = seeded(rect.x * 7 + rect.y * 13 + rect.width + (basis === "lift" ? 0 : 1));
          let read = run.at({ x: rect.x + r() * rect.width, y: rect.y + r() * rect.height });
          for (let i = 0; i < 40; i++) {
            // Edges included: some samples sit exactly on the home's edges.
            const roll = r();
            const x = roll < 0.1 ? rect.x : roll < 0.2 ? rect.x + rect.width : rect.x + r() * rect.width;
            const y = roll > 0.9 ? rect.y + rect.height : rect.y + r() * rect.height;
            read = run.at({ x, y });
            samples++;
            expect(read.held).toEqual({ kind: "home" });
            // The frame draws the layout at the lift: the pane's place open, the others where they were.
            expect(run.hit.drawn(read).tree).toBe(drag.lift.tree);
          }
          // A release there restores: it commits home's tree, the lift itself.
          expect(run.hit.release(read).tree).toBe(drag.lift.tree);
          drags++;
          releases++;
        }
      }
    }
    expect(drags).toBeGreaterThan(300);
    expect(releases).toBe(drags);
    expect(samples).toBeGreaterThanOrEqual(drags * 40);
  });
});

describe("held pane properties", () => {
  it("the drawn rect keeps the held size, lies within the stage when it fits, keeps the stage's top-left along an axis it does not fit, and is the held rect when that is inside", () => {
    const r = seeded(7_777);
    for (let i = 0; i < 5000; i++) {
      const stage = { width: 50 + r() * 2000, height: 50 + r() * 1400 };
      const size = { width: r() * stage.width * 1.4, height: r() * stage.height * 1.4 };
      const held = { x: (r() * 4 - 2) * stage.width, y: (r() * 4 - 2) * stage.height, ...size };
      const drawn = clampHeldRectToStage(held, stage);
      expect([drawn.width, drawn.height]).toEqual([held.width, held.height]);
      if (size.width <= stage.width) expect(drawn.x >= 0 && drawn.x + drawn.width <= stage.width + 1e-9).toBe(true);
      else expect(drawn.x).toBe(0);
      if (size.height <= stage.height) expect(drawn.y >= 0 && drawn.y + drawn.height <= stage.height + 1e-9).toBe(true);
      else expect(drawn.y).toBe(0);
      const inside = held.x >= 0 && held.y >= 0 && held.x + held.width <= stage.width && held.y + held.height <= stage.height;
      if (inside) expect(drawn).toEqual(held);
    }
  });
});
