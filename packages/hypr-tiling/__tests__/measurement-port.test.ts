import { describe, expect, it } from "@jest/globals";
import {
  DEFAULT_TILING_LAYOUT_CONFIG,
  resolvePointerTargetFromMeasurement,
  resolveSeatFootprint,
} from "../react/tiling-renderer";
import { resolveInteractionCapabilities } from "../engine/interaction-capabilities";
import type { MeasurementPort } from "../engine/measurement-port";
import type {
  ResolvedTilingInteractionCapabilities,
  TilingGroupNode,
  TilingLayoutConfig,
  TilingLeafNode,
  TilingPaneFootprint,
  TilingSplitNode,
} from "../engine/types";

/**
 * Stage-3 measurement-port characterization tests. These pin the observable
 * behavior of the two pure cores the `MeasurementPort` now feeds —
 * `resolvePointerTargetFromMeasurement` (the pointer→drop-target hit resolution)
 * and `resolveSeatFootprint` (the ghost-seat clamp) — driven entirely against
 * INJECTED synthetic rects, with no live DOM. They are the behavior-preservation
 * gate for the Stage-3 inline-read → port-call lift.
 */

/** A DOMRect-shaped fixture (only the rect fields the ports read are populated). */
function rect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    x: left,
    y: top,
    width,
    height,
    left,
    top,
    right: left + width,
    bottom: top + height,
    toJSON: (): unknown => ({}),
  } as DOMRect;
}

/** A MeasurementPort whose methods all return `null` unless overridden. */
function fakePort(overrides: Partial<MeasurementPort>): MeasurementPort {
  return {
    measureViewportRect: (): DOMRect | null => null,
    measureLeafRect: (): DOMRect | null => null,
    measureReservationRect: (): DOMRect | null => null,
    measureGroupTabStripRect: (): DOMRect | null => null,
    measureGroupTabMemberRects: (): ReadonlyArray<{
      index: number;
      left: number;
      top: number;
      right: number;
      bottom: number;
    }> => [],
    measureGroupDropTargetRects: (): ReadonlyArray<DOMRect> => [],
    readComputedTransform: (): string | null => null,
    ...overrides,
  };
}

function leaf(id: string, tileId: string): TilingLeafNode {
  return { kind: "leaf", id, tileId };
}

/** A + B side by side under a horizontal split. */
function twoLeafLayout(): TilingSplitNode {
  return {
    kind: "split",
    id: "root",
    axis: "horizontal",
    ratio: 0.5,
    first: leaf("A", "tile-a"),
    second: leaf("B", "tile-b"),
  };
}

const CAPS: ResolvedTilingInteractionCapabilities =
  resolveInteractionCapabilities(undefined);
const CONFIG: TilingLayoutConfig = DEFAULT_TILING_LAYOUT_CONFIG;

// Viewport at client offset (100, 50): a client point (cx, cy) maps to the
// viewport-local point (cx - 100, cy - 50) the footprint hit-test uses.
const VIEWPORT = rect(100, 50, 400, 400);
const FOOTPRINTS: ReadonlyMap<string, TilingPaneFootprint> = new Map([
  ["A", { left: 0, top: 0, width: 200, height: 400 }],
  ["B", { left: 200, top: 0, width: 200, height: 400 }],
]);

function pointerInput(
  clientX: number,
  clientY: number,
  sourceLeafId: string,
  overrides?: Partial<Parameters<typeof resolvePointerTargetFromMeasurement>[1]>,
): Parameters<typeof resolvePointerTargetFromMeasurement>[1] {
  return {
    clientX,
    clientY,
    sourceLeafId,
    previousTarget: null,
    isRearrangeEnabled: true,
    groupingEnabled: CAPS.grouping.enable,
    dropHitZoneGeometry: CAPS.dropHitZoneGeometry,
    liveDragModeEnabled: true,
    liveHitFootprintsById: FOOTPRINTS,
    leafFootprintsById: FOOTPRINTS,
    leafIds: ["A", "B"],
    rearrangeGatedLeafIds: new Set<string>(),
    layout: twoLeafLayout(),
    config: CONFIG,
    viewportSize: { width: 400, height: 400 },
    ...overrides,
  };
}

describe("resolvePointerTargetFromMeasurement — synthetic-rect characterization", (): void => {
  it("returns null when the viewport rect is unmeasurable (port → null)", (): void => {
    const port: MeasurementPort = fakePort({ measureViewportRect: () => null });
    // client (400, 250) would land inside B if the viewport were measurable.
    const result = resolvePointerTargetFromMeasurement(
      port,
      pointerInput(400, 250, "A"),
    );
    expect(result).toBeNull();
  });

  it("returns null when rearrange is disabled (never reads the viewport)", (): void => {
    let viewportReads = 0;
    const port: MeasurementPort = fakePort({
      measureViewportRect: () => {
        viewportReads += 1;
        return VIEWPORT;
      },
    });
    const result = resolvePointerTargetFromMeasurement(
      port,
      pointerInput(400, 250, "A", { isRearrangeEnabled: false }),
    );
    expect(result).toBeNull();
    expect(viewportReads).toBe(0);
  });

  it("resolves a hit on a non-source leaf, translating client→viewport-local via the injected rect", (): void => {
    const port: MeasurementPort = fakePort({ measureViewportRect: () => VIEWPORT });
    // client (400, 250) → local (300, 200): inside B's footprint [200..400]×[0..400].
    const result = resolvePointerTargetFromMeasurement(
      port,
      pointerInput(400, 250, "A"),
    );
    expect(result).not.toBeNull();
    expect(result?.leafId).toBe("B");
  });

  it("returns null over the drag source's own footprint (source is skipped)", (): void => {
    const port: MeasurementPort = fakePort({ measureViewportRect: () => VIEWPORT });
    // client (200, 250) → local (100, 200): inside A — but A is the source.
    const result = resolvePointerTargetFromMeasurement(
      port,
      pointerInput(200, 250, "A"),
    );
    expect(result).toBeNull();
  });

  it("returns null in a gap outside every footprint", (): void => {
    const port: MeasurementPort = fakePort({ measureViewportRect: () => VIEWPORT });
    // client (600, 250) → local (500, 200): right of B's right edge (400).
    const result = resolvePointerTargetFromMeasurement(
      port,
      pointerInput(600, 250, "A"),
    );
    expect(result).toBeNull();
  });

  it("returns null when the only hittable leaf is statically gated", (): void => {
    const port: MeasurementPort = fakePort({ measureViewportRect: () => VIEWPORT });
    const result = resolvePointerTargetFromMeasurement(
      port,
      pointerInput(400, 250, "A", {
        rearrangeGatedLeafIds: new Set<string>(["B"]),
      }),
    );
    expect(result).toBeNull();
  });

  it("resolves a host group-drop target as group-merge, ahead of the body zone it overlaps", (): void => {
    // client (310, 60) → local (210, 10): the top edge band of B. The host
    // element covers that band, so the hit is group-merge rather than edge-insert.
    const port: MeasurementPort = fakePort({
      measureViewportRect: () => VIEWPORT,
      measureGroupDropTargetRects: (leafId: string): ReadonlyArray<DOMRect> =>
        leafId === "B" ? [rect(300, 50, 40, 30)] : [],
    });
    const result = resolvePointerTargetFromMeasurement(
      port,
      pointerInput(310, 60, "A"),
    );
    expect(result?.action).toBe("group-merge");
    expect(result?.leafId).toBe("B");
    expect(result?.fallbackReason).toBe("host-group-drop-target");
  });

  it("keeps a centre body drop as swap when no host target covers it", (): void => {
    const port: MeasurementPort = fakePort({ measureViewportRect: () => VIEWPORT });
    const result = resolvePointerTargetFromMeasurement(
      port,
      pointerInput(400, 250, "A"),
    );
    expect(result?.leafId).toBe("B");
    expect(result?.action).toBe("swap");
  });

  it("keeps an uncovered edge band as edge-insert", (): void => {
    const port: MeasurementPort = fakePort({
      measureViewportRect: () => VIEWPORT,
      measureGroupDropTargetRects: (): ReadonlyArray<DOMRect> => [
        rect(0, 0, 8, 8),
      ],
    });
    const result = resolvePointerTargetFromMeasurement(
      port,
      pointerInput(310, 250, "A", {
        config: { ...CONFIG, minPaneSizePx: 40 },
      }),
    );
    expect(result?.leafId).toBe("B");
    expect(result?.action).toBe("edge-insert");
  });

  it("ignores the drag source's own host target", (): void => {
    const port: MeasurementPort = fakePort({
      measureViewportRect: () => VIEWPORT,
      measureGroupDropTargetRects: (leafId: string): ReadonlyArray<DOMRect> =>
        leafId === "A" ? [rect(150, 200, 80, 40)] : [],
    });
    const result = resolvePointerTargetFromMeasurement(
      port,
      pointerInput(180, 220, "A"),
    );
    expect(result).toBeNull();
  });

  it("falls through to the body zone when the source is already in the target group", (): void => {
    const grouped: TilingGroupNode = {
      kind: "group",
      id: "group-B",
      activeMemberId: "B",
      members: [leaf("B", "tile-b"), leaf("A", "tile-a")],
    };
    const port: MeasurementPort = fakePort({
      measureViewportRect: () => VIEWPORT,
      measureGroupDropTargetRects: (leafId: string): ReadonlyArray<DOMRect> =>
        leafId === "B" ? [rect(350, 200, 80, 40)] : [],
    });
    const result = resolvePointerTargetFromMeasurement(
      port,
      pointerInput(400, 250, "A", {
        layout: grouped,
        leafIds: ["B"],
        liveHitFootprintsById: new Map<string, TilingPaneFootprint>([
          ["B", { left: 200, top: 0, width: 200, height: 400 }],
        ]),
        leafFootprintsById: new Map<string, TilingPaneFootprint>([
          ["B", { left: 200, top: 0, width: 200, height: 400 }],
        ]),
      }),
    );
    expect(result?.action).toBe("swap");
    expect(result?.leafId).toBe("B");
  });

  it("ignores host targets when grouping is disabled", (): void => {
    const port: MeasurementPort = fakePort({
      measureViewportRect: () => VIEWPORT,
      measureGroupDropTargetRects: (leafId: string): ReadonlyArray<DOMRect> =>
        leafId === "B" ? [rect(350, 200, 80, 40)] : [],
    });
    const result = resolvePointerTargetFromMeasurement(
      port,
      pointerInput(400, 250, "A", { groupingEnabled: false }),
    );
    expect(result?.action).toBe("swap");
    expect(result?.fallbackReason).not.toBe("host-group-drop-target");
  });
});

describe("resolveSeatFootprint — off-screen / degenerate seat clamp", (): void => {
  const onScreenViewport = rect(0, 0, 1000, 800);

  it("nulls the seat when the reservation rect is unmeasurable", (): void => {
    expect(
      resolveSeatFootprint({
        reservationRect: null,
        viewportRect: onScreenViewport,
      }),
    ).toBeNull();
  });

  it("nulls the seat for a degenerate (zero-width) reservation rect", (): void => {
    expect(
      resolveSeatFootprint({
        reservationRect: rect(10, 10, 0, 120),
        viewportRect: onScreenViewport,
      }),
    ).toBeNull();
  });

  it("nulls the seat for a degenerate (zero-height) reservation rect", (): void => {
    expect(
      resolveSeatFootprint({
        reservationRect: rect(10, 10, 120, 0),
        viewportRect: onScreenViewport,
      }),
    ).toBeNull();
  });

  it("nulls the seat when the reservation rect lies entirely off-screen", (): void => {
    // Entirely left of the viewport (right edge < viewport.left).
    expect(
      resolveSeatFootprint({
        reservationRect: rect(-300, 10, 100, 100),
        viewportRect: onScreenViewport,
      }),
    ).toBeNull();
    // Entirely below the viewport (top > viewport.bottom).
    expect(
      resolveSeatFootprint({
        reservationRect: rect(10, 1200, 100, 100),
        viewportRect: onScreenViewport,
      }),
    ).toBeNull();
  });

  it("returns the seat footprint for an on-screen, positive-area reservation rect", (): void => {
    expect(
      resolveSeatFootprint({
        reservationRect: rect(40, 60, 200, 150),
        viewportRect: onScreenViewport,
      }),
    ).toEqual({ left: 40, top: 60, width: 200, height: 150 });
  });

  it("skips the off-screen clamp when the viewport is unmeasurable (null viewport)", (): void => {
    expect(
      resolveSeatFootprint({
        reservationRect: rect(-300, 10, 100, 100),
        viewportRect: null,
      }),
    ).toEqual({ left: -300, top: 10, width: 100, height: 100 });
  });
});
