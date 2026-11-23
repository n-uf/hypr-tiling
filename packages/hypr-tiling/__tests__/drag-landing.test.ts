import { describe, expect, it } from "@jest/globals";
import { findLeafByTileId, resolveTileRect } from "../engine/drag-landing";
import { resolveLeafRects } from "../engine/leaf-geometry";
import { createLayoutTilingDrag } from "../engine/tiling-drag-tree";
import type { TilingLayoutConfig, TilingLayoutNode } from "../engine/types";

/**
 * Where a dragged pane lands: the drop indicator's rect, the snap slot and the
 * committed layout's rect for the pane all come from the same tree, the drag's
 * `after(place)`.
 */

const CONFIG: TilingLayoutConfig = { gapPx: 0, minPaneSizePx: 40, handleSizePx: 0 };
const CONTAINER = { width: 1000, height: 600 };

/** A | (B / C) */
const LAYOUT: TilingLayoutNode = {
  kind: "split",
  id: "root",
  axis: "horizontal",
  ratio: 0.5,
  first: { kind: "leaf", id: "A", tileId: "a" },
  second: {
    kind: "split",
    id: "right",
    axis: "vertical",
    ratio: 0.5,
    first: { kind: "leaf", id: "B", tileId: "b" },
    second: { kind: "leaf", id: "C", tileId: "c" },
  },
};

describe("the landing: after(place).landing, the pane's rect in the tree the commit applies", (): void => {
  const drag = createLayoutTilingDrag({ layout: LAYOUT, sourceLeafId: "A", container: CONTAINER, config: CONFIG, min: CONFIG.minPaneSizePx })!;

  it("a side: the bottom half of B's slot, as the committed tree lays A out", (): void => {
    const after = drag.after({ kind: "beside", at: "b", side: "bottom" });
    // The others close over A's gap: B / C fill the width; A splits B's half.
    const expected = resolveLeafRects(after.tree.layout!, { x: 0, y: 0, ...CONTAINER }, CONFIG).get("A");
    expect(after.landing).toEqual(expected);
    expect(after.landing).toEqual({ x: 0, y: 150, width: 1000, height: 150 });
  });

  it("swap: the pane lands in the target's place in the original layout", (): void => {
    expect(drag.after({ kind: "swap", at: "c" }).landing).toEqual({ x: 500, y: 300, width: 500, height: 300 });
  });

  it("no landing where a release commits nothing (the pane's own place)", (): void => {
    expect(drag.after({ kind: "swap", at: "a" }).landing).toBeNull();
  });
});

describe("findLeafByTileId / resolveTileRect", (): void => {
  it("finds the leaf carrying a tile anywhere, groups included", (): void => {
    expect(findLeafByTileId(LAYOUT, "c")?.id).toBe("C");
    expect(findLeafByTileId(LAYOUT, "zz")).toBeNull();
    const grouped: TilingLayoutNode = {
      kind: "group",
      id: "g",
      activeMemberId: "B",
      members: [
        { kind: "leaf", id: "A", tileId: "a" },
        { kind: "leaf", id: "B", tileId: "b" },
      ],
    };
    expect(findLeafByTileId(grouped, "a")?.id).toBe("A");
    // An inactive member is not shown: no rect.
    expect(resolveTileRect(grouped, "a", CONTAINER, CONFIG)).toBeNull();
    expect(resolveTileRect(grouped, "b", CONTAINER, CONFIG)).toEqual({ x: 0, y: 0, width: 1000, height: 600 });
  });
});
