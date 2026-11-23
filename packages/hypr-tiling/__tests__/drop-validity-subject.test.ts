/**
 * Drop validity judges the layout the release commits, for the subject the drag
 * moves. A column: the dragged subject on top (a tab group of three dragged whole,
 * or a single pane), short or tall, pane B below. Dragged forward over B's lower
 * half and below the column, the pointer meets B's bottom edge. The release there
 * commits the subject's own move (`deriveCandidateTree`: a whole group moves as
 * its node), so the verdict must be the one that tree gets: the subject below B,
 * which always fits this column. A verdict from a projection that moves only the
 * dragged leaf (the rest of the group left at its ratio) refused it for a tall
 * group: "projected source/target footprint violates min pane".
 */
import { describe, expect, it } from "@jest/globals";
import { dropFits } from "@n-uf/placement/tiling";
import {
  DEFAULT_TILING_LAYOUT_CONFIG,
  resolvePointerTargetFromMeasurement,
  resolveStableDragHitFootprints,
} from "../react/tiling-renderer";
import { deriveCandidateTree, isCommittableTarget, type DragSubject } from "../engine/drag-machine";
import { resolveInteractionCapabilities } from "../engine/interaction-capabilities";
import { resolveLayoutGeometry, resolveLeafRects } from "../engine/leaf-geometry";
import type { MeasurementPort } from "../engine/measurement-port";
import type { TilingLayoutConfig, TilingLayoutNode, TilingPaneFootprint } from "../engine/types";

const AREA = { x: 0, y: 0, width: 360, height: 784 };
const CONFIG: TilingLayoutConfig = { ...DEFAULT_TILING_LAYOUT_CONFIG, gapPx: 6, handleSizePx: 4, minPaneSizePx: 180 };
const CAPS = resolveInteractionCapabilities(undefined);

function viewportRect(): DOMRect {
  return { x: 0, y: 0, left: 0, top: 0, width: AREA.width, height: AREA.height, right: AREA.width, bottom: AREA.height, toJSON: (): unknown => ({}) } as DOMRect;
}

const PORT: MeasurementPort = {
  measureViewportRect: (): DOMRect | null => viewportRect(),
  measureLeafRect: (): DOMRect | null => null,
  measureGroupTabStripRect: (): DOMRect | null => null,
  measureGroupTabMemberRects: () => [],
  measureGroupDropTargetRects: (): ReadonlyArray<DOMRect> => [],
  readComputedTransform: (): string | null => null,
};

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
 * The drop resolved at every 8 px from B's middle (in the gap-closed geometry, where B fills the column) down to the
 * column's bottom and 24 px past it, at x = 180: `y zone action [reason]`, or `y -` for none.
 */
export function forwardSweep(subject: DragSubject, ratio: number): string[] {
  const layout = column(subject, ratio);
  const original = new Map<string, TilingPaneFootprint>(
    [...resolveLayoutGeometry(layout, AREA, CONFIG).leaves].map(([id, r]) => [id, { left: r.x, top: r.y, width: r.width, height: r.height }]),
  );
  const live = resolveStableDragHitFootprints(true, layout, "A", { width: AREA.width, height: AREA.height }, CONFIG, original, subject);
  const out: string[] = [];
  let previous = null;
  for (let y = AREA.height / 2; y <= AREA.height + 24; y += 8) {
    const target = resolvePointerTargetFromMeasurement(PORT, {
      clientX: 180,
      clientY: y,
      sourceLeafId: "A",
      subject,
      previousTarget: previous,
      isRearrangeEnabled: true,
      groupingEnabled: CAPS.grouping.enable,
      dropHitZoneGeometry: CAPS.dropHitZoneGeometry,
      liveDragModeEnabled: true,
      liveHitFootprintsById: live,
      leafFootprintsById: original,
      leafIds: ["A", "B"],
      rearrangeGatedLeafIds: new Set<string>(),
      layout,
      config: CONFIG,
      viewportSize: { width: AREA.width, height: AREA.height },
    });
    previous = target;
    out.push(
      target == null
        ? `${y} -`
        : `${y} ${target.zone} ${target.action}${target.blockedReason != null ? ` [${target.blockedReason}]` : ""}`,
    );
  }
  return out;
}

describe("drop validity — the subject's own move (dragging forward below the neighbour)", (): void => {
  for (const subject of ["group", "pane"] as const) {
    for (const [height, ratio] of [["short", 0.25], ["tall", 0.7]] as const) {
      it(`${subject}, ${height}: B's bottom edge is valid all the way down, as the committed tree fits`, (): void => {
        const sweep = forwardSweep(subject, ratio);
        // The pointer meets B's bottom edge in its lower part, and never a refusal.
        expect(sweep.some((line) => line.includes(" bottom edge-insert"))).toBe(true);
        expect(sweep.filter((line) => line.includes(" none"))).toEqual([]);
      });

      it(`${subject}, ${height}: every verdict over B is the verdict of the tree its release commits`, (): void => {
        const layout = column(subject, ratio);
        const original = new Map<string, TilingPaneFootprint>(
          [...resolveLayoutGeometry(layout, AREA, CONFIG).leaves].map(([id, r]) => [id, { left: r.x, top: r.y, width: r.width, height: r.height }]),
        );
        const live = resolveStableDragHitFootprints(true, layout, "A", { width: AREA.width, height: AREA.height }, CONFIG, original, subject);
        for (let y = 8; y <= AREA.height; y += 8) {
          for (const x of [12, 180, 348]) {
            const target = resolvePointerTargetFromMeasurement(PORT, {
              clientX: x,
              clientY: y,
              sourceLeafId: "A",
              subject,
              previousTarget: null,
              isRearrangeEnabled: true,
              groupingEnabled: CAPS.grouping.enable,
              dropHitZoneGeometry: CAPS.dropHitZoneGeometry,
              liveDragModeEnabled: true,
              liveHitFootprintsById: live,
              leafFootprintsById: original,
              leafIds: ["A", "B"],
              rearrangeGatedLeafIds: new Set<string>(),
              layout,
              config: CONFIG,
              viewportSize: { width: AREA.width, height: AREA.height },
            });
            if (target == null || target.zone === "center") continue;
            // The tree the release would commit for this edge, judged valid or not.
            const committed = deriveCandidateTree(layout, "A", { ...target, action: "edge-insert" }, subject);
            expect([x, y, target.zone, isCommittableTarget(target, "A")]).toEqual([x, y, target.zone, fits(committed)]);
          }
        }
      });
    }
  }
});
