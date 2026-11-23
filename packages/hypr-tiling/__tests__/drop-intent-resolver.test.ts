import { describe, expect, it } from "@jest/globals";
import { paneRegion, type PaneRegion } from "@n-uf/placement/tiling";
import {
  TILING_DROP_INTENT_CONFIG,
  paneZoneCenterInsetPercent,
  paneZoneClipPaths,
  resolveCenterRatios,
  resolvePaneCenterGeometry,
  toPaneLocalPoint,
} from "../engine/drop-intent-resolver";
import type { TilingPanePoint, TilingPaneSize, TilingZoneGeometryConfig } from "../engine/drop-intent-resolver";
import type { TilingLayoutConfig, TilingLayoutNode } from "../engine/types";
import { hitRun, layoutDrag } from "./golden/cases";

/**
 * The drop hit zones: the pane's center rectangle as the drop hit zone geometry gives it
 * (`resolvePaneCenterGeometry`), and the region a point is in by placement's `paneRegion` on that center, which is how
 * the drag's hit reads a pane. Which place the pointer holds is the hit's (see `drag-home`, `tiling-hit-conformance`
 * and the properties of `golden-properties`); here are the zones themselves, and what the hit makes of a group.
 */

const SQUARE_PANE: TilingPaneSize = { width: 200, height: 200 };

function makeConfig(overrides?: Partial<TilingZoneGeometryConfig>): TilingZoneGeometryConfig {
  return {
    centerRatio: TILING_DROP_INTENT_CONFIG.centerRatio,
    centerMinPx: TILING_DROP_INTENT_CONFIG.centerMinPx,
    devicePixelRatio: 1,
    ...overrides,
  };
}

/** The region of the pane-local point (`x`, `y`) of a pane of `size`, on the center the geometry gives it. */
function regionAt(x: number, y: number, options?: { config?: TilingZoneGeometryConfig; paneSize?: TilingPaneSize }): PaneRegion {
  const size: TilingPaneSize = options?.paneSize ?? SQUARE_PANE;
  const g = resolvePaneCenterGeometry(size, options?.config ?? makeConfig());
  const paneCenter = { width: g.width, height: g.height, left: g.centerLeftPx, top: g.centerTopPx, right: g.centerRightPx, bottom: g.centerBottomPx };
  return paneRegion({ x: 0, y: 0, ...size }, { x, y }, null, { paneCenter });
}

describe("hit-zone geometry (single source of truth)", (): void => {
  it("classifies the pane centroid as the center swap zone", (): void => {
    expect(regionAt(100, 100)).toBe("center");
  });

  it("classifies each edge trapezoid deterministically", (): void => {
    expect(regionAt(10, 100)).toBe("left");
    expect(regionAt(190, 100)).toBe("right");
    expect(regionAt(100, 10)).toBe("top");
    expect(regionAt(100, 190)).toBe("bottom");
  });
});

describe("parameterized geometry (centerRatio / centerMinPx)", (): void => {
  it("widens the center swap rectangle as centerRatio grows (edge band shrinks)", (): void => {
    // Default ratio 0.34 → center rect [66, 134]; (140,100) is in the RIGHT band.
    expect(regionAt(140, 100)).toBe("right");
    // ratio 0.5 → center rect [50, 150]; the SAME point now lands in CENTER.
    expect(regionAt(140, 100, { config: makeConfig({ centerRatio: 0.5 }) })).toBe("center");
  });

  it("clamps centerRatio into [0.05, 0.95]", (): void => {
    expect(resolveCenterRatios({ centerRatio: 0.001, centerMinPx: 24 })).toEqual({ x: 0.05, y: 0.05 });
    expect(resolveCenterRatios({ centerRatio: 1.5, centerMinPx: 24 })).toEqual({ x: 0.95, y: 0.95 });
  });

  it("applies centerMinPx as the floor for the center rectangle on tiny panes", (): void => {
    const tinyPane: TilingPaneSize = { width: 50, height: 50 };
    // 50 * 0.34 = 17 < 24, so the floor wins: center rect is 24px wide.
    const floored = resolvePaneCenterGeometry(tinyPane, makeConfig({ centerMinPx: 24 }));
    expect(floored.centerRightPx - floored.centerLeftPx).toBe(24);
    // Drop the floor to 0 → the raw ratio extent (17px) governs instead.
    const unfloored = resolvePaneCenterGeometry(tinyPane, makeConfig({ centerMinPx: 0 }));
    expect(unfloored.centerRightPx - unfloored.centerLeftPx).toBeCloseTo(17, 6);
  });
});

describe("corner / boundary determinism", (): void => {
  it("resolves a symmetric corner the same way every call (no oscillation)", (): void => {
    const first = regionAt(20, 20);
    expect(regionAt(20, 20)).toBe(first);
    expect(regionAt(20, 20)).toBe(first);
    // top is enumerated before left, so an exact diagonal tie resolves to top.
    expect(first).toBe("top");
  });

  it("partitions the pane with no center/edge overlap at the boundary", (): void => {
    const geometry = resolvePaneCenterGeometry(SQUARE_PANE, makeConfig());
    expect(regionAt(geometry.centerRightPx - 0.5, 100)).toBe("center");
    expect(regionAt(geometry.centerRightPx + 0.5, 100)).toBe("right");
  });
});

describe("coordinate-origin transforms", (): void => {
  it("maps a client point through the pane rect origin into pane-local space", (): void => {
    const local = toPaneLocalPoint({ x: 150, y: 120 }, { left: 50, top: 20 });
    expect(local).toEqual({ x: 100, y: 100 });
    expect(regionAt(local.x, local.y)).toBe("center");
  });

  it("is invariant to the absolute client offset of the pane", (): void => {
    const offsetA = toPaneLocalPoint({ x: 10, y: 100 }, { left: 0, top: 0 });
    const offsetB = toPaneLocalPoint({ x: 1010, y: 1100 }, { left: 1000, top: 1000 });
    expect(offsetA).toEqual(offsetB);
  });
});

describe("devicePixelRatio / Retina correctness", (): void => {
  it("snaps every center-rectangle boundary onto the device-pixel grid", (): void => {
    const geometry = resolvePaneCenterGeometry({ width: 201, height: 201 }, makeConfig({ devicePixelRatio: 2 }));
    for (const boundary of [geometry.centerLeftPx, geometry.centerTopPx, geometry.centerRightPx, geometry.centerBottomPx]) {
      expect((boundary * 2) % 1).toBe(0);
    }
  });

  it("reports the device pixel ratio in the geometry", (): void => {
    expect(resolvePaneCenterGeometry(SQUARE_PANE, makeConfig({ devicePixelRatio: 3 })).devicePixelRatio).toBe(3);
  });
});

describe("per-axis centerRatio (asymmetric swap-zone sizing)", (): void => {
  it("sizes the center rect independently per axis on a square pane", (): void => {
    // centerRatioX 0.5, centerRatioY 0.2 → wide-but-short center rect.
    const geometry = resolvePaneCenterGeometry(SQUARE_PANE, makeConfig({ centerRatioX: 0.5, centerRatioY: 0.2 }));
    const centerWidth: number = geometry.centerRightPx - geometry.centerLeftPx;
    const centerHeight: number = geometry.centerBottomPx - geometry.centerTopPx;
    expect(centerWidth).toBeCloseTo(SQUARE_PANE.width * 0.5, 6);
    expect(centerHeight).toBeCloseTo(SQUARE_PANE.height * 0.2, 6);
    expect(centerWidth).toBeGreaterThan(centerHeight);
  });

  it("falls back to the symmetric centerRatio for the unspecified axis", (): void => {
    const geometry = resolvePaneCenterGeometry(SQUARE_PANE, makeConfig({ centerRatio: 0.4, centerRatioX: 0.6 }));
    const centerWidth: number = geometry.centerRightPx - geometry.centerLeftPx;
    const centerHeight: number = geometry.centerBottomPx - geometry.centerTopPx;
    expect(centerWidth).toBeCloseTo(SQUARE_PANE.width * 0.6, 6);
    expect(centerHeight).toBeCloseTo(SQUARE_PANE.height * 0.4, 6);
  });

  it("resolves both per-axis ratios", (): void => {
    expect(resolveCenterRatios({ centerRatio: 0.34, centerRatioX: 0.5, centerRatioY: 0.2, centerMinPx: 24 })).toEqual({ x: 0.5, y: 0.2 });
  });

  it("derives per-axis center insets (paneZoneCenterInsetPercent)", (): void => {
    const inset = paneZoneCenterInsetPercent(0.5, 0.2);
    expect(inset.x).toBeCloseTo(25, 6); // (1 - 0.5) / 2 * 100
    expect(inset.y).toBeCloseTo(40, 6); // (1 - 0.2) / 2 * 100
  });
});

describe("zone / overlay agreement", (): void => {
  it("derives the same center inset for overlay and geometry", (): void => {
    const config = makeConfig();
    const geometry = resolvePaneCenterGeometry(SQUARE_PANE, config);
    const insetPercent = paneZoneCenterInsetPercent(config.centerRatio, config.centerRatio);
    // A symmetric ratio yields equal X / Y insets.
    expect(insetPercent.x).toBeCloseTo(insetPercent.y, 6);
    expect((geometry.centerLeftPx / SQUARE_PANE.width) * 100).toBeCloseTo(insetPercent.x, 6);
  });

  it("draws one trapezoid per edge and each pane corner on the diagonal to the center's nearest corner", (): void => {
    const paths = paneZoneClipPaths(0.5, 0.2);
    expect(Object.keys(paths).sort()).toEqual(["bottom", "left", "right", "top"]);
    expect(paths.top).toBe("polygon(0% 0%, 100% 0%, 75.0000% 40.0000%, 25.0000% 40.0000%)");
  });
});

describe("zone / overlay agreement on a NON-square pane", (): void => {
  // Independent re-derivation of the drawn overlay zone from the percent-based
  // clip-path polygons (NOT reusing paneRegion), so the assertion proves
  // the region equals the drawn-overlay zone — including across
  // the normalized-penetration boundary, which is the interesting case on a
  // non-square aspect ratio.
  const NON_SQUARE = { width: 300, height: 200 } as const;
  const RATIO = TILING_DROP_INTENT_CONFIG.centerRatio;

  function pointInPolygon(point: TilingPanePoint, polygon: ReadonlyArray<readonly [number, number]>): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      const intersects =
        yi > point.y !== yj > point.y &&
        point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
      if (intersects) {
        inside = !inside;
      }
    }
    return inside;
  }

  function drawnOverlayZone(point: TilingPanePoint): "center" | "left" | "right" | "top" | "bottom" {
    const low: number = (1 - RATIO) / 2;
    const high: number = (1 + RATIO) / 2;
    const lowX: number = low * NON_SQUARE.width;
    const highX: number = high * NON_SQUARE.width;
    const lowY: number = low * NON_SQUARE.height;
    const highY: number = high * NON_SQUARE.height;
    if (point.x >= lowX && point.x <= highX && point.y >= lowY && point.y <= highY) {
      return "center";
    }
    const polygons: Record<"top" | "right" | "bottom" | "left", ReadonlyArray<readonly [number, number]>> = {
      top: [[0, 0], [NON_SQUARE.width, 0], [highX, lowY], [lowX, lowY]],
      right: [[NON_SQUARE.width, 0], [NON_SQUARE.width, NON_SQUARE.height], [highX, highY], [highX, lowY]],
      bottom: [[0, NON_SQUARE.height], [NON_SQUARE.width, NON_SQUARE.height], [highX, highY], [lowX, highY]],
      left: [[0, 0], [0, NON_SQUARE.height], [lowX, highY], [lowX, lowY]],
    };
    for (const zone of ["top", "right", "bottom", "left"] as const) {
      if (pointInPolygon(point, polygons[zone])) {
        return zone;
      }
    }
    return "center";
  }

  it("agrees with the drawn overlay for points in every region (incl. diagonal boundary)", (): void => {
    const samplePoints: ReadonlyArray<TilingPanePoint> = [
      { x: 150, y: 100 }, // center
      { x: 150, y: 20 }, // clearly top
      { x: 20, y: 100 }, // clearly left
      { x: 280, y: 100 }, // clearly right
      { x: 150, y: 180 }, // clearly bottom
      { x: 60, y: 30 }, // above the (0,0)->(99,66) diagonal -> top
      { x: 60, y: 50 }, // below the same diagonal -> left
      { x: 250, y: 30 }, // top/right corner region
      { x: 250, y: 170 }, // bottom/right corner region
    ];
    for (const point of samplePoints) {
      expect(regionAt(point.x, point.y, { paneSize: NON_SQUARE })).toBe(drawnOverlayZone(point));
    }
  });
});

/**
 * A group in the drag's hit: its body is a pane like any other (the center swaps, a side goes beside), and a join is
 * only ever the group's tab strip (a slot per member, giving the index) or a host drop element declared on the pane.
 */
describe("group body center is SWAP, never join (body partition stays swap)", (): void => {
  const CONFIG: TilingLayoutConfig = { gapPx: 6, handleSizePx: 4, minPaneSizePx: 96 };
  const AREA = { width: 1000, height: 600 };
  const leaf = (id: string, tileId: string): TilingLayoutNode => ({ kind: "leaf", id, tileId });
  const LAYOUT: TilingLayoutNode = {
    kind: "split",
    id: "root",
    axis: "horizontal",
    ratio: 0.3,
    first: leaf("A", "a"),
    second: {
      kind: "group",
      id: "g",
      members: [
        { kind: "leaf", id: "B", tileId: "b" },
        { kind: "leaf", id: "C", tileId: "c" },
        { kind: "leaf", id: "D", tileId: "d" },
      ],
      activeMemberId: "B",
    },
  };
  const STRIP = { top: 0, height: 30, left: 4, gap: 4, widths: new Map([["b", 100], ["c", 100], ["d", 100]]) };
  const drag = layoutDrag(LAYOUT, "A", AREA, CONFIG, undefined, { strip: STRIP })!;
  const g = drag.lift.layout.get("b")!;
  const centerX = g.x + g.width / 2;
  const centerY = g.y + g.height / 2;

  it("resolves a center body drop to swap with the group's drawn pane", (): void => {
    expect(hitRun(drag, "lift").at({ x: centerX, y: centerY }).held).toEqual({ kind: "swap", at: "b" });
  });

  it("keeps group-body edges as sides (the per-slot edge affordance)", (): void => {
    expect(hitRun(drag, "lift").at({ x: g.x + g.width - 10, y: centerY }).held).toEqual({ kind: "beside", at: "b", side: "right" });
    expect(hitRun(drag, "lift").at({ x: centerX, y: g.y + g.height - 10 }).held).toEqual({ kind: "beside", at: "b", side: "bottom" });
  });

  it("the body never gives a join; the tab strip does, with the slot under the pointer as its index", (): void => {
    const bodyHeld = hitRun(drag, "lift").at({ x: centerX, y: centerY }).held;
    expect(bodyHeld?.kind).not.toBe("join");
    // Slot i stands before the i-th member: the strip's first tab starts 4 px in, each slot is its tab's width plus the gap.
    expect(hitRun(drag, "lift").at({ x: g.x + 4 + 20, y: g.y + 10 }).held).toEqual({ kind: "join", at: "b", index: 0 });
    expect(hitRun(drag, "lift").at({ x: g.x + 4 + 104 + 20, y: g.y + 10 }).held).toEqual({ kind: "join", at: "b", index: 1 });
  });
});
