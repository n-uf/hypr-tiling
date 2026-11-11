import { describe, expect, it } from "@jest/globals";
import { createStableDragMeasurement } from "../react/stable-drag-measurement";
import type { MeasurementPort } from "../engine/measurement-port";
import type { TilingGroupNode, TilingLayoutNode, TilingLeafNode, TilingPaneFootprint } from "../engine/types";

/**
 * While a preview makes room for the dragged pane the DOM-measured drop targets
 * (group strips, their tabs, host drop targets) move with the panes. The stable
 * measurement maps them back to where they are with no room made, so the drop
 * under a pointer never depends on where the pane has settled on its way.
 */

const leaf = (id: string, tileId: string): TilingLeafNode => ({ kind: "leaf", id, tileId });
const GROUP: TilingGroupNode = { kind: "group", id: "g", members: [leaf("B", "b"), leaf("C", "c")], activeMemberId: "C" };
/** a | g[b, c*] */
const LAYOUT: TilingLayoutNode = {
  kind: "split",
  id: "root",
  axis: "horizontal",
  ratio: 0.5,
  first: leaf("A", "a"),
  second: GROUP,
};

const VIEWPORT: DOMRect = rect(100, 50, 1000, 600);

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: (): void => undefined } as DOMRect;
}

/** The tree with the dragged pane taken out of the way: the group fills the viewport. */
const FOOTPRINTS: ReadonlyMap<string, TilingPaneFootprint> = new Map<string, TilingPaneFootprint>([
  ["C", { left: 0, top: 0, width: 1000, height: 600 }],
  ["A", { left: 0, top: 0, width: 500, height: 600 }],
]);

interface Tab {
  index: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function port(parts: {
  strip?: DOMRect | null;
  tabs?: ReadonlyArray<Tab>;
  hostTargets?: ReadonlyArray<DOMRect>;
  pane?: DOMRect | null;
  viewport?: DOMRect;
}): MeasurementPort {
  return {
    measureViewportRect: (): DOMRect => parts.viewport ?? VIEWPORT,
    measureLeafRect: (): DOMRect | null => parts.pane ?? null,
    measureGroupTabStripRect: (): DOMRect | null => parts.strip ?? null,
    measureGroupTabMemberRects: (): ReadonlyArray<Tab> => parts.tabs ?? [],
    measureGroupDropTargetRects: (): ReadonlyArray<DOMRect> => parts.hostTargets ?? [],
    readComputedTransform: (): string | null => null,
  };
}

const STRIP = { visible: true, heightPx: 28, placement: "top" } as const;

function measure(dom: MeasurementPort, extra: Partial<Parameters<typeof createStableDragMeasurement>[1]> = {}): MeasurementPort {
  return createStableDragMeasurement(dom, {
    footprints: FOOTPRINTS,
    layout: LAYOUT,
    viewportSize: { width: 1000, height: 600 },
    groupStrip: STRIP,
    insertedTabs: null,
    ...extra,
  });
}

describe("stable drag measurement — group tab strips", (): void => {
  it("the strip is where the group's slot is with no room made, whatever the preview drew", (): void => {
    // Drawn in the lower right (the group made room for the pane at its top).
    const drawn: DOMRect = rect(600, 350, 500, 28);
    expect(measure(port({ strip: drawn })).measureGroupTabStripRect("g")).toMatchObject({
      left: 100,
      top: 50,
      right: 1100,
      bottom: 78,
    });
  });

  it("the same strip is measured wherever the preview put it", (): void => {
    const edges = (value: DOMRect | null): unknown =>
      value == null ? null : { left: value.left, top: value.top, right: value.right, bottom: value.bottom };
    const here = measure(port({ strip: rect(100, 50, 1000, 28) })).measureGroupTabStripRect("g");
    const there = measure(port({ strip: rect(600, 400, 500, 28) })).measureGroupTabStripRect("g");
    expect(edges(there)).toEqual(edges(here));
  });

  it("a strip at the bottom of its slot stays at the bottom", (): void => {
    const strip = measure(port({ strip: rect(600, 400, 500, 28) }), {
      groupStrip: { visible: true, heightPx: 28, placement: "bottom" },
    }).measureGroupTabStripRect("g");
    expect(strip).toMatchObject({ top: 622, bottom: 650 });
  });

  it("an unknown group, or a strip that is not drawn, is left as the DOM reports it", (): void => {
    const drawn: DOMRect = rect(600, 350, 500, 28);
    expect(measure(port({ strip: drawn })).measureGroupTabStripRect("nope")).toBe(drawn);
    expect(measure(port({ strip: null })).measureGroupTabStripRect("g")).toBeNull();
  });

  it("tabs move with their strip", (): void => {
    const tabs: ReadonlyArray<Tab> = [
      { index: 0, left: 600, top: 350, right: 700, bottom: 378 },
      { index: 1, left: 704, top: 350, right: 804, bottom: 378 },
    ];
    expect(measure(port({ strip: rect(600, 350, 500, 28), tabs })).measureGroupTabMemberRects("g")).toEqual([
      { index: 0, left: 100, top: 50, right: 200, bottom: 78 },
      { index: 1, left: 204, top: 50, right: 304, bottom: 78 },
    ]);
  });

  it("the tabs the preview inserted are taken out, the gap closed and the rest re-indexed", (): void => {
    // The strip drew b, c and the two tabs of the dragged group inserted at 1 (g = [b, x, y, c]).
    const tabs: ReadonlyArray<Tab> = [
      { index: 0, left: 100, top: 50, right: 200, bottom: 78 },
      { index: 1, left: 204, top: 50, right: 304, bottom: 78 },
      { index: 2, left: 308, top: 50, right: 408, bottom: 78 },
      { index: 3, left: 412, top: 50, right: 512, bottom: 78 },
    ];
    expect(
      measure(port({ strip: rect(100, 50, 1000, 28), tabs }), {
        insertedTabs: { targetLeafId: "C", insertIndex: 1, count: 2 },
      }).measureGroupTabMemberRects("g"),
    ).toEqual([
      { index: 0, left: 100, top: 50, right: 200, bottom: 78 },
      { index: 1, left: 204, top: 50, right: 304, bottom: 78 },
    ]);
  });
});

describe("stable drag measurement — host drop targets", (): void => {
  it("a header keeps its place in the pane as the pane is drawn without room made", (): void => {
    // Alpha drawn in the right half of the viewport, 500 wide (room made on its left); its header is 40 px tall.
    const pane: DOMRect = rect(600, 50, 500, 600);
    const header: DOMRect = rect(600, 50, 500, 40);
    const [mapped] = measure(port({ pane, hostTargets: [header] })).measureGroupDropTargetRects("A");
    // With no room made alpha is the left half of the viewport: the header sits on its top edge, across it.
    expect(mapped).toMatchObject({ left: 100, top: 50, right: 600, bottom: 90 });
  });

  it("a footer stays on the bottom edge", (): void => {
    const pane: DOMRect = rect(600, 50, 500, 300);
    const footer: DOMRect = rect(600, 320, 500, 30);
    const [mapped] = measure(port({ pane, hostTargets: [footer] })).measureGroupDropTargetRects("A");
    expect(mapped).toMatchObject({ left: 100, top: 620, right: 600, bottom: 650 });
  });

  it("a pane the preview hides gives the rects it last had", (): void => {
    const cache = new Map<string, ReadonlyArray<{ left: number; top: number; right: number; bottom: number }>>();
    const visible = measure(port({ pane: rect(100, 50, 500, 600), hostTargets: [rect(100, 50, 500, 40)] }), { hostTargetCache: cache });
    expect(visible.measureGroupDropTargetRects("A")[0]).toMatchObject({ left: 100, top: 50, right: 600, bottom: 90 });
    // Later the pane is a hidden tab: nothing is drawn, whatever the cache last held stands in.
    const hidden = measure(port({ pane: null, hostTargets: [] }), { hostTargetCache: cache });
    expect(hidden.measureGroupDropTargetRects("A")[0]).toMatchObject({ left: 100, top: 50, right: 600, bottom: 90 });
    // A pane never seen has nothing to stand in.
    expect(hidden.measureGroupDropTargetRects("B")).toEqual([]);
  });
});

describe("stable drag measurement — a scaled viewport", (): void => {
  /** The 1000×600 viewport drawn at 0.8 under a scaled ancestor, its corner at (100, 50). */
  const SCALED: DOMRect = rect(100, 50, 800, 480);

  it("the strip spans the slot in client px and keeps the height it is drawn with", (): void => {
    // Drawn lower right, 22.4 client px tall (28 layout px at 0.8).
    const strip = measure(port({ viewport: SCALED, strip: rect(500, 300, 400, 22.4) })).measureGroupTabStripRect("g");
    expect(strip).toMatchObject({ left: 100, top: 50, right: 900 });
    expect(strip?.bottom).toBeCloseTo(72.4, 5);
  });

  it("tabs translate with the strip, at their drawn size", (): void => {
    const tabs: ReadonlyArray<Tab> = [{ index: 0, left: 500, top: 300, right: 580, bottom: 322.4 }];
    const [tab] = measure(port({ viewport: SCALED, strip: rect(500, 300, 400, 22.4), tabs })).measureGroupTabMemberRects("g");
    expect(tab).toMatchObject({ index: 0, left: 100, top: 50, right: 180 });
    expect(tab.bottom).toBeCloseTo(72.4, 5);
  });

  it("a header keeps its place across the pane, and the cache stands in for a hidden pane at the same scale", (): void => {
    const cache = new Map<string, ReadonlyArray<{ left: number; top: number; right: number; bottom: number }>>();
    // Alpha is the left half of the viewport: 500 × 600 layout px = 400 × 480 client px at (100, 50).
    const drawn = measure(
      port({ viewport: SCALED, pane: rect(500, 50, 400, 480), hostTargets: [rect(500, 50, 400, 32)] }),
      { hostTargetCache: cache },
    ).measureGroupDropTargetRects("A")[0];
    expect(drawn).toMatchObject({ left: 100, top: 50, right: 500 });
    expect(drawn.bottom).toBeCloseTo(82, 5);
    const hidden = measure(port({ viewport: SCALED, pane: null }), { hostTargetCache: cache }).measureGroupDropTargetRects("A")[0];
    expect(hidden).toMatchObject({ left: 100, top: 50, right: 500 });
    expect(hidden.bottom).toBeCloseTo(82, 5);
  });
});

describe("stable drag measurement — a tab torn off its own group", (): void => {
  it("the torn tab the preview appended is taken out of the tabs it drew: the append index counts the group without it", (): void => {
    // g[A, B*, C] with B torn off: the base tree has g[A, C]. Hovering g's merge zone appends B,
    // so the strip draws A, C, B.
    const base: TilingLayoutNode = { kind: "group", id: "g", members: [leaf("A", "a"), leaf("C", "c")], activeMemberId: "C" };
    const tabs: ReadonlyArray<Tab> = [
      { index: 0, left: 100, top: 50, right: 200, bottom: 78 },
      { index: 1, left: 204, top: 50, right: 304, bottom: 78 },
      { index: 2, left: 308, top: 50, right: 408, bottom: 78 },
    ];
    expect(
      measure(port({ strip: rect(100, 50, 1000, 28), tabs }), {
        layout: base,
        insertedTabs: { targetLeafId: "C", count: 1 },
      }).measureGroupTabMemberRects("g"),
    ).toEqual([
      { index: 0, left: 100, top: 50, right: 200, bottom: 78 },
      { index: 1, left: 204, top: 50, right: 304, bottom: 78 },
    ]);
  });
});
