/**
 * The one move rule: a keyboard move (move mode's commit) and the move commands (`swap-panes`, `insert-adjacent`) are
 * each the drag of a subject to one place, and commit through placement's `tilingDrag` as a pointer drag does.
 *
 * For seeded trees (plain, and with every node feature), every source, every target and every keyboard or command
 * move, on two stages and two configs: the tree the move commits equals `after(place).tree` of the matching drag
 * place (the drag the renderer builds at a lift: the same subject, minimum and still panes), and the move is refused
 * exactly when that place is, with the same refusal. A still source is refused `still`, as a drag never lifts it.
 */
import { describe, expect, it } from "@jest/globals";
import type { TilingHeld } from "@n-uf/placement/tiling";
import { findGroupContainingLeaf, findLeafById, readLeafNodeIds } from "../engine/state";
import { collectStaticGatedLeafIds, resolveTilingMove, type TilingKeyboardMove } from "../engine/tiling-drag-tree";
import type { TilingLayoutConfig, TilingLayoutNode, TilingMovePlacement } from "../engine/types";
import { AREAS, CONFIGS, layoutDrag, randomTree, seeded, tilesOf } from "./golden/cases";

const SIDES: readonly TilingMovePlacement[] = ["left", "right", "top", "bottom"];
const STAGES: ReadonlyArray<{ readonly area: { width: number; height: number }; readonly config: TilingLayoutConfig }> = [
  { area: AREAS[0]!, config: CONFIGS.default! },
  { area: AREAS[2]!, config: CONFIGS.default! },
  { area: AREAS[1]!, config: CONFIGS.wide! },
];

function trees(): TilingLayoutNode[] {
  const out: TilingLayoutNode[] = [];
  for (let i = 0; i < 24; i++) {
    const r = seeded(31_000 + i);
    out.push(randomTree(r, tilesOf(2 + Math.floor(r() * 6)), i % 2 === 1, `m${i}`));
  }
  return out;
}

/** Every keyboard or command move of `source` onto `target`. */
function movesOf(source: string, target: string): TilingKeyboardMove[] {
  return [
    { kind: "swap-panes", sourceLeafId: source, targetLeafId: target },
    ...SIDES.map((placement): TilingKeyboardMove => ({ kind: "insert-adjacent", sourceLeafId: source, targetLeafId: target, placement })),
    ...SIDES.map((placement): TilingKeyboardMove => ({ kind: "move-mode", sourceLeafId: source, targetLeafId: target, placement })),
  ];
}

/**
 * The drag place a move matches, built here from what a pointer drag does: a move command drags the pane it names;
 * move mode drags what the pane's title bar drags (its whole tab group, when it is in one of two or more). The place
 * is on the target's tile: the swap, or the side.
 */
function matchingDrag(tree: TilingLayoutNode, move: TilingKeyboardMove): { subject?: "group"; place: Exclude<TilingHeld<string>, { kind: "home" }> } {
  const at: string = findLeafById(tree, move.targetLeafId)!.tileId;
  const group = move.kind === "move-mode" ? findGroupContainingLeaf(tree, move.sourceLeafId) : null;
  const place: Exclude<TilingHeld<string>, { kind: "home" }> =
    move.kind === "swap-panes" ? { kind: "swap", at } : { kind: "beside", at, side: move.placement };
  return group != null && group.members.length >= 2 ? { subject: "group", place } : { place };
}

describe("one move rule: a keyboard or command move is the drag's after(place)", () => {
  it("commits after(place).tree of the matching drag place, and is refused exactly when it is, with the same refusal", () => {
    const counts = { moves: 0, committed: 0, refused: 0, stillSource: 0 };
    const codes = new Map<string, number>();
    for (const tree of trees()) {
      const ids = readLeafNodeIds(tree);
      const gated = collectStaticGatedLeafIds(tree);
      for (const { area, config } of STAGES) {
        for (const source of ids) {
          for (const target of ids) {
            if (target === source) continue;
            for (const move of movesOf(source, target)) {
              counts.moves += 1;
              const result = resolveTilingMove({ layout: tree, move, container: area, config });
              if (gated.has(source)) {
                // A drag never lifts a still pane: every move of it is refused.
                counts.stillSource += 1;
                expect(result).toEqual({ layout: null, refusal: { code: "still" } });
                continue;
              }
              const { subject, place } = matchingDrag(tree, move);
              const drag = layoutDrag(tree, source, area, config, subject);
              expect(drag).not.toBeNull();
              const after = drag!.after(place);
              if (after.refusal != null) {
                counts.refused += 1;
                codes.set(after.refusal.code, (codes.get(after.refusal.code) ?? 0) + 1);
                expect([move, result]).toEqual([move, { layout: null, refusal: after.refusal }]);
              } else {
                counts.committed += 1;
                expect([move, result.refusal]).toEqual([move, null]);
                expect(result.layout).toEqual(after.tree.layout);
              }
            }
          }
        }
      }
    }
    // Both verdicts occur, and the size rules among the refusals.
    expect(counts.committed).toBeGreaterThan(1000);
    expect(counts.refused).toBeGreaterThan(200);
    expect(counts.moves).toBe(counts.committed + counts.refused + counts.stillSource);
    expect([...codes.keys()].some((code) => code === "fit" || code.startsWith("room"))).toBe(true);
  });

  it("a move under the minimum, onto a still pane, or with no room is refused where a pointer drag is", () => {
    const leaf = (id: string) => ({ kind: "leaf" as const, id, tileId: `t${id}` });
    // A | (B / C), C pinned static at 200 px: C is still, B is not.
    const tree: TilingLayoutNode = {
      kind: "split",
      id: "r",
      axis: "horizontal",
      ratio: 0.5,
      first: leaf("A"),
      second: {
        kind: "split",
        id: "s",
        axis: "vertical",
        ratio: 0.5,
        first: leaf("B"),
        second: { ...leaf("C"), sizing: { height: "static", heightPx: 200 } },
      },
    };
    const config: TilingLayoutConfig = { gapPx: 0, handleSizePx: 0, minPaneSizePx: 200 };
    const roomy = { width: 1000, height: 800 };
    expect([...collectStaticGatedLeafIds(tree)]).toEqual(["C"]);
    const still = resolveTilingMove({ layout: tree, move: { kind: "swap-panes", sourceLeafId: "A", targetLeafId: "C" }, container: roomy, config });
    expect(still.refusal?.code).toBe("still");
    const fromStill = resolveTilingMove({ layout: tree, move: { kind: "swap-panes", sourceLeafId: "C", targetLeafId: "A" }, container: roomy, config });
    expect(fromStill.refusal?.code).toBe("still");
    // With A released, B is 600 px tall: a side on top of it fits two panes of 200, not two of 450.
    const side = { kind: "insert-adjacent", sourceLeafId: "A", targetLeafId: "B", placement: "top" } as const;
    expect(resolveTilingMove({ layout: tree, move: side, container: roomy, config }).refusal).toBeNull();
    const tight = resolveTilingMove({ layout: tree, move: side, container: roomy, config: { ...config, minPaneSizePx: 450 } });
    expect(tight.layout).toBeNull();
    expect(["fit", "room-along", "room-across"]).toContain(tight.refusal?.code);
    // A missing pane is refused `missing`.
    expect(resolveTilingMove({ layout: tree, move: { kind: "swap-panes", sourceLeafId: "A", targetLeafId: "Z" }, container: roomy, config }).refusal?.code).toBe(
      "missing",
    );
  });
});
