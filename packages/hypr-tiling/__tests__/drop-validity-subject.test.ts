/**
 * Drop validity judges the layout the release commits, for the subject the drag
 * moves. A column: the dragged subject on top (a tab group of three dragged whole,
 * or a single pane), short or tall, pane B below. Dragged forward over B's lower
 * half and below the column, the pointer meets B's lower part, which for the run
 * neighbour of the subject is the swap (the subject below B is the swap's own
 * arrangement). The release there commits the subject's own move (the drag's
 * `after(place)`: a whole group moves as its node), so the verdict must be the one
 * that tree gets: the subject below B, which always fits this column. A verdict
 * from a projection that moves only the dragged leaf (the rest of the group left
 * at its ratio) refused it for a tall group: "projected source/target footprint
 * violates min pane". The sides of B give the verdict of the tree each commits.
 */
import { describe, expect, it } from "@jest/globals";
import { dropFits, type TilingBasis } from "@n-uf/placement/tiling";
import { DEFAULT_TILING_LAYOUT_CONFIG } from "../react/tiling-renderer";
import type { DragSubject } from "../engine/drag-machine";
import { resolveLeafRects } from "../engine/leaf-geometry";
import type { TilingLayoutConfig, TilingLayoutNode } from "../engine/types";
import { hitRun, layoutDrag, shape } from "./golden/cases";

const AREA = { x: 0, y: 0, width: 360, height: 784 };
const CONFIG: TilingLayoutConfig = { ...DEFAULT_TILING_LAYOUT_CONFIG, gapPx: 6, handleSizePx: 4, minPaneSizePx: 180 };

export function column(subject: DragSubject, ratio: number): TilingLayoutNode {
  return {
    kind: "split",
    id: "col",
    axis: "vertical",
    ratio,
    first:
      subject === "group"
        ? {
            kind: "group",
            id: "g",
            members: [
              { kind: "leaf", id: "A", tileId: "a" },
              { kind: "leaf", id: "P", tileId: "p" },
              { kind: "leaf", id: "S", tileId: "s" },
            ],
            activeMemberId: "A",
          }
        : { kind: "leaf", id: "A", tileId: "a" },
    second: { kind: "leaf", id: "B", tileId: "b" },
  };
}

/** Whether the tree fits: every leaf at least the minimum along both axes. */
function fits(tree: TilingLayoutNode): boolean {
  return dropFits(resolveLeafRects(tree, AREA, CONFIG), "A", "B", AREA, { min: CONFIG.minPaneSizePx, side: "bottom" }).ok;
}

/**
 * What the drag's hit reads at every 8 px from B's middle down to the column's bottom and 24 px past it, at x = 180:
 * `y held`, with ` refused <code>` appended when the place under the pointer is refused, or `y -` for nothing.
 */
export function forwardSweep(subject: DragSubject, ratio: number, basis: TilingBasis): string[] {
  const layout = column(subject, ratio);
  const drag = layoutDrag(layout, "A", AREA, CONFIG, subject)!;
  const run = hitRun(drag, basis);
  const out: string[] = [];
  for (let y = AREA.height / 2; y <= AREA.height + 24; y += 8) {
    const read = run.at({ x: 180, y });
    const held = read.held == null ? "-" : read.held.kind === "beside" ? `${read.held.side} of ${read.held.at}` : read.held.kind === "swap" ? `swap ${read.held.at}` : read.held.kind;
    const refused = read.refused == null ? "" : ` refused ${drag.after(read.refused).refusal?.code ?? "?"}`;
    out.push(`${y} ${held}${refused}`);
  }
  return out;
}

describe("drop validity — the subject's own move (dragging forward below the neighbour)", (): void => {
  for (const subject of ["group", "pane"] as const) {
    for (const [height, ratio] of [["short", 0.25], ["tall", 0.7]] as const) {
      for (const basis of ["lift", "base"] as const) {
        it(`${subject}, ${height}, ${basis}: B's lower part is valid all the way down, as the committed tree fits`, (): void => {
          const sweep = forwardSweep(subject, ratio, basis);
          // B sits right below the subject in one run with equal bounds across, so it has no side along the run: the
          // subject placed below B is the swap's arrangement, and B's bottom strip belongs to the swap. The pointer
          // meets that swap in B's lower part, and never a refusal.
          expect(sweep.some((line) => line.includes(" swap b"))).toBe(true);
          expect(sweep.some((line) => line.includes(" bottom of b"))).toBe(false);
          expect(sweep.filter((line) => line.includes(" refused"))).toEqual([]);
          // The swap commits the subject below B, which always fits this column.
          const layout = column(subject, ratio);
          const swapped = layoutDrag(layout, "A", AREA, CONFIG, subject)!.after({ kind: "swap", at: "b" });
          expect(swapped.refusal).toBeNull();
          expect(fits(swapped.tree.layout!)).toBe(true);
        });
      }

      it(`${subject}, ${height}: every verdict of B's sides is the verdict of the tree its release commits`, (): void => {
        const layout = column(subject, ratio);
        const drag = layoutDrag(layout, "A", AREA, CONFIG, subject)!;
        // The same drag with no minimum: its `after` is the tree the change makes, never refused for size.
        const open = layoutDrag(layout, "A", AREA, { ...CONFIG, minPaneSizePx: 0 }, subject)!;
        for (const side of ["top", "right", "bottom", "left"] as const) {
          const after = drag.after({ kind: "beside", at: "b", side });
          // The tree this side's change makes, judged valid or not.
          const committed = open.after({ kind: "beside", at: "b", side }).tree.layout!;
          expect([side, after.refusal == null]).toEqual([side, fits(committed)]);
          // And what the drag's hit stores is that same tree.
          if (after.refusal == null) expect(shape(after.tree.layout)).toBe(shape(committed));
        }
      });
    }
  }
});
