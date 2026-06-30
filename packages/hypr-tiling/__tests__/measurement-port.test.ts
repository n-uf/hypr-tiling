import { describe, expect, it } from "@jest/globals";
import {
  DEFAULT_TILING_LAYOUT_CONFIG,
  resolvePointerTargetFromMeasurement,
  resolveSeatFootprint,
} from "../react/dynamic-tiling-renderer";
import { resolveInteractionCapabilities } from "../core/interaction-capabilities";
import type { MeasurementPort } from "../core/measurement-port";
import type {
  ResolvedTilingInteractionCapabilities,
  TilingLayoutConfig,
  TilingLeafNode,
  TilingPaneFootprint,
  TilingSplitNode,
} from "../core/types";

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
    groupingEnabled: CAPS.grouping,
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
