import { describe, expect, it } from "@jest/globals";
import {
  TILING_DROP_INTENT_CONFIG,
  buildGroupTabStripMergeIntent,
  classifyPaneZone,
  paneZoneCenterInsetPercent,
  pointInClientBounds,
  resolveDominantEdge,
  resolveDropIntent,
  resolveDropIntentHitZoneDiagnostics,
  resolveGroupTabStripHit,
  resolvePaneZoneGeometry,
  snapToDevicePixel,
  toPaneLocalPoint,
} from "../core/drop-intent-resolver";
import type { TilingPanePoint } from "../core/drop-intent-resolver";
import type {
  TilingPaneSize,
  TilingZoneGeometryConfig,
} from "../core/drop-intent-resolver";
import type {
  TilingLeafDropZone,
  TilingSplitAxis,
} from "../core/types";

const EMPTY_AXIS_PATH: ReadonlyArray<TilingSplitAxis> = [];
const SQUARE_PANE: TilingPaneSize = { width: 200, height: 200 };

interface ZoneEvaluation {
  isValid: boolean;
  rejectionReason: string | null;
}

function makeConfig(overrides?: Partial<TilingZoneGeometryConfig>): TilingZoneGeometryConfig {
  return {
    centerRatio: TILING_DROP_INTENT_CONFIG.centerRatio,
    centerMinPx: TILING_DROP_INTENT_CONFIG.centerMinPx,
    hysteresisPx: TILING_DROP_INTENT_CONFIG.hysteresisPx,
    devicePixelRatio: 1,
    ...overrides,
  };
}

function allValid(): ZoneEvaluation {
  return { isValid: true, rejectionReason: null };
}

function resolveAt(
  paneLocalX: number,
  paneLocalY: number,
  options?: {
    config?: TilingZoneGeometryConfig;
    previousZone?: TilingLeafDropZone | null;
    evaluateZone?: (zone: TilingLeafDropZone) => ZoneEvaluation;
    paneSize?: TilingPaneSize;
  },
) {
  return resolveDropIntent({
    leafId: "target",
    paneLocalX,
    paneLocalY,
    paneSize: options?.paneSize ?? SQUARE_PANE,
    axisPath: EMPTY_AXIS_PATH,
    geometryConfig: options?.config ?? makeConfig(),
    previousZone: options?.previousZone ?? null,
    evaluateZone: options?.evaluateZone ?? allValid,
  });
}

describe("hit-zone geometry (single source of truth)", (): void => {
  it("classifies the pane centroid as the center swap zone", (): void => {
    const result = resolveAt(100, 100);
    expect(result.zone).toBe("center");
    expect(result.action).toBe("swap");
    expect(result.finalEdge).toBeNull();
  });

  it("classifies each edge trapezoid deterministically", (): void => {
    expect(resolveAt(10, 100).zone).toBe("left");
    expect(resolveAt(190, 100).zone).toBe("right");
    expect(resolveAt(100, 10).zone).toBe("top");
    expect(resolveAt(100, 190).zone).toBe("bottom");
  });

  it("blocks the center swap when the evaluator rejects it", (): void => {
    const result = resolveAt(100, 100, {
      evaluateZone: (zone): ZoneEvaluation =>
        zone === "center"
          ? { isValid: false, rejectionReason: "same source and target leaf" }
          : allValid(),
    });
    expect(result.zone).toBe("center");
    expect(result.action).toBe("none");
    expect(result.blockedReason).toBe("same source and target leaf");
  });

  it("blocks an edge insert and records every rejected split reason", (): void => {
    const result = resolveAt(10, 100, {
      evaluateZone: (zone): ZoneEvaluation => ({
        isValid: false,
        rejectionReason: `${zone} blocked by min-pane constraint`,
      }),
    });
    expect(result.zone).toBe("left");
    expect(result.action).toBe("none");
    expect(result.blockedReason).toBe("left blocked by min-pane constraint");
    expect(result.rejectedSplitReasons.length).toBe(4);
  });
});

describe("parameterized geometry (centerRatio / centerMinPx / hysteresisPx)", (): void => {
  it("widens the center swap rectangle as centerRatio grows (edge band shrinks)", (): void => {
    // Default ratio 0.34 → center rect [66, 134]; (140,100) is in the RIGHT band.
    expect(resolveAt(140, 100).zone).toBe("right");
    // ratio 0.5 → center rect [50, 150]; the SAME point now lands in CENTER.
    const wide = resolveAt(140, 100, { config: makeConfig({ centerRatio: 0.5 }) });
    expect(wide.zone).toBe("center");
    expect(wide.action).toBe("swap");
  });

  it("derives the edge threshold ratio as the complement of centerRatio", (): void => {
    const result = resolveAt(100, 100, { config: makeConfig({ centerRatio: 0.5 }) });
    expect(result.tuning.centerRatio).toBe(0.5);
    expect(result.tuning.edgeThresholdRatio).toBeCloseTo((1 - 0.5) / 2, 6);
  });

  it("clamps centerRatio into [0.05, 0.95]", (): void => {
    const tooSmall = resolveAt(100, 100, { config: makeConfig({ centerRatio: 0.001 }) });
    expect(tooSmall.tuning.centerRatio).toBe(0.05);
    const tooLarge = resolveAt(100, 100, { config: makeConfig({ centerRatio: 1.5 }) });
    expect(tooLarge.tuning.centerRatio).toBe(0.95);
  });

  it("applies centerMinPx as the floor for the center rectangle on tiny panes", (): void => {
    const tinyPane: TilingPaneSize = { width: 50, height: 50 };
    // 50 * 0.34 = 17 < 24, so the floor wins: center rect is 24px wide.
    const floored = resolvePaneZoneGeometry(tinyPane, makeConfig({ centerMinPx: 24 }));
    expect(floored.centerRightPx - floored.centerLeftPx).toBe(24);
    // Drop the floor to 0 → the raw ratio extent (17px) governs instead.
    const unfloored = resolvePaneZoneGeometry(tinyPane, makeConfig({ centerMinPx: 0 }));
    expect(unfloored.centerRightPx - unfloored.centerLeftPx).toBeCloseTo(17, 6);
  });

  it("disables the hysteresis hold when hysteresisPx is 0", (): void => {
    // Default 6px holds the previous center zone at x=137; 0px must switch.
    const held = resolveAt(137, 100, { previousZone: "center" });
    expect(held.zone).toBe("center");
    const noHold = resolveAt(137, 100, { previousZone: "center", config: makeConfig({ hysteresisPx: 0 }) });
    expect(noHold.zone).toBe("right");
    expect(noHold.fallbackReason).toBeNull();
  });

  it("widens the hysteresis hold band as hysteresisPx grows", (): void => {
    // At 6px the cursor at x=145 has already switched to "right".
    expect(resolveAt(145, 100, { previousZone: "center" }).zone).toBe("right");
    // A larger 16px band still holds "center" at the same point.
    const wideBand = resolveAt(145, 100, { previousZone: "center", config: makeConfig({ hysteresisPx: 16 }) });
    expect(wideBand.zone).toBe("center");
    expect(wideBand.fallbackReason).toContain("hysteresis-hold");
  });
});

describe("corner / boundary determinism", (): void => {
  it("resolves a symmetric corner the same way every call (no oscillation)", (): void => {
    const first = resolveAt(20, 20);
    const second = resolveAt(20, 20);
    const third = resolveAt(20, 20);
    expect(first.zone).toBe(second.zone);
    expect(second.zone).toBe(third.zone);
    // top is enumerated before left, so an exact diagonal tie resolves to top.
    expect(first.zone).toBe("top");
  });

  it("partitions the pane with no center/edge overlap at the boundary", (): void => {
    const geometry = resolvePaneZoneGeometry(SQUARE_PANE, makeConfig());
    const justInside = classifyPaneZone(
      { x: geometry.centerRightPx - 0.5, y: 100 },
      geometry,
    );
    const justOutside = classifyPaneZone(
      { x: geometry.centerRightPx + 0.5, y: 100 },
      geometry,
    );
    expect(justInside).toBe("center");
    expect(justOutside).toBe("right");
  });
});

describe("geometric hysteresis", (): void => {
  it("holds the previous center zone within the hysteresis band", (): void => {
    // center right boundary is at x=134 for a 200px pane @ ratio 0.34.
    const held = resolveAt(137, 100, { previousZone: "center" });
    expect(held.zone).toBe("center");
    expect(held.fallbackReason).toContain("hysteresis-hold");
  });

  it("switches once the cursor crosses beyond the hysteresis band", (): void => {
    const switched = resolveAt(145, 100, { previousZone: "center" });
    expect(switched.zone).toBe("right");
    expect(switched.fallbackReason).toBeNull();
  });

  it("does not apply hysteresis when there is no previous zone", (): void => {
    const fresh = resolveAt(137, 100, { previousZone: null });
    expect(fresh.zone).toBe("right");
  });
});

describe("coordinate-origin transforms", (): void => {
  it("maps a client point through the pane rect origin into pane-local space", (): void => {
    const local = toPaneLocalPoint({ x: 150, y: 120 }, { left: 50, top: 20 });
    expect(local).toEqual({ x: 100, y: 100 });

    const result = resolveDropIntent({
      leafId: "target",
      paneLocalX: local.x,
      paneLocalY: local.y,
      paneSize: SQUARE_PANE,
      axisPath: EMPTY_AXIS_PATH,
      geometryConfig: makeConfig(),
      evaluateZone: allValid,
    });
    expect(result.zone).toBe("center");
    expect(result.paneLocalX).toBe(100);
    expect(result.paneLocalY).toBe(100);
  });

  it("is invariant to the absolute client offset of the pane", (): void => {
    const offsetA = toPaneLocalPoint({ x: 10, y: 100 }, { left: 0, top: 0 });
    const offsetB = toPaneLocalPoint({ x: 1010, y: 1100 }, { left: 1000, top: 1000 });
    expect(offsetA).toEqual(offsetB);
  });
});

describe("devicePixelRatio / Retina correctness", (): void => {
  it("snaps a value to the device-pixel grid", (): void => {
    expect(snapToDevicePixel(66.3, 2)).toBe(66.5);
    expect(snapToDevicePixel(66.3, 1)).toBe(66);
    expect(snapToDevicePixel(66.26, 0)).toBe(66);
  });

  it("snaps every center-rectangle boundary onto the device-pixel grid", (): void => {
    const geometry = resolvePaneZoneGeometry(
      { width: 201, height: 201 },
      makeConfig({ devicePixelRatio: 2 }),
    );
    for (const boundary of [
      geometry.centerLeftPx,
      geometry.centerTopPx,
      geometry.centerRightPx,
      geometry.centerBottomPx,
    ]) {
      expect((boundary * 2) % 1).toBe(0);
    }
  });

  it("reports the resolved device pixel ratio in tuning", (): void => {
    const result = resolveAt(100, 100, { config: makeConfig({ devicePixelRatio: 3 }) });
    expect(result.tuning.devicePixelRatio).toBe(3);
  });
});

describe("per-axis centerRatio (asymmetric swap-zone sizing)", (): void => {
  it("sizes the center rect independently per axis on a square pane", (): void => {
    // centerRatioX 0.5, centerRatioY 0.2 → wide-but-short center rect.
    const geometry = resolvePaneZoneGeometry(SQUARE_PANE, makeConfig({ centerRatioX: 0.5, centerRatioY: 0.2 }));
    const centerWidth: number = geometry.centerRightPx - geometry.centerLeftPx;
    const centerHeight: number = geometry.centerBottomPx - geometry.centerTopPx;
    expect(centerWidth).toBeCloseTo(SQUARE_PANE.width * 0.5, 6);
    expect(centerHeight).toBeCloseTo(SQUARE_PANE.height * 0.2, 6);
    expect(centerWidth).toBeGreaterThan(centerHeight);
  });

  it("falls back to the symmetric centerRatio for the unspecified axis", (): void => {
    const geometry = resolvePaneZoneGeometry(SQUARE_PANE, makeConfig({ centerRatio: 0.4, centerRatioX: 0.6 }));
    const centerWidth: number = geometry.centerRightPx - geometry.centerLeftPx;
    const centerHeight: number = geometry.centerBottomPx - geometry.centerTopPx;
    expect(centerWidth).toBeCloseTo(SQUARE_PANE.width * 0.6, 6);
    expect(centerHeight).toBeCloseTo(SQUARE_PANE.height * 0.4, 6);
  });

  it("reports both per-axis ratios in the hit-zone diagnostics", (): void => {
    const diagnostics = resolveDropIntentHitZoneDiagnostics({
      paneSize: SQUARE_PANE,
      geometryConfig: makeConfig({ centerRatioX: 0.5, centerRatioY: 0.2 }),
      evaluateZone: allValid,
    });
    expect(diagnostics.centerRatioX).toBe(0.5);
    expect(diagnostics.centerRatioY).toBe(0.2);
    // the representative `centerRatio` tracks the X axis
    expect(diagnostics.centerRatio).toBe(0.5);
  });

  it("derives per-axis center insets (paneZoneCenterInsetPercent)", (): void => {
    const inset = paneZoneCenterInsetPercent(0.5, 0.2);
    expect(inset.x).toBeCloseTo(25, 6); // (1 - 0.5) / 2 * 100
    expect(inset.y).toBeCloseTo(40, 6); // (1 - 0.2) / 2 * 100
  });
});

describe("zone / overlay agreement", (): void => {
  it("derives the same center inset for overlay and resolver", (): void => {
    const config = makeConfig();
    const result = resolveAt(100, 100, { config });
    const insetPercent = paneZoneCenterInsetPercent(config.centerRatio, config.centerRatio);
    // edge threshold ratio is the fractional inset; overlay uses the same value.
    // A symmetric ratio yields equal X / Y insets.
    expect(insetPercent.x).toBeCloseTo(insetPercent.y, 6);
    expect(result.edgeThresholdRatio * 100).toBeCloseTo(insetPercent.x, 6);
  });

  it("matches the diagnostics geometry used to draw the overlay", (): void => {
    const config = makeConfig();
    const diagnostics = resolveDropIntentHitZoneDiagnostics({
      paneSize: SQUARE_PANE,
      geometryConfig: config,
      evaluateZone: allValid,
    });
    const geometry = resolvePaneZoneGeometry(SQUARE_PANE, config);
    expect(diagnostics.geometry).toEqual(geometry);
    expect(diagnostics.edgeZones.length).toBe(4);
    expect(diagnostics.centerRectWidthPx).toBe(geometry.centerRightPx - geometry.centerLeftPx);
  });
});

describe("resolveDominantEdge (diagnostic)", (): void => {
  it("reports the edge the cursor leans toward outside the center rect", (): void => {
    const geometry = resolvePaneZoneGeometry(SQUARE_PANE, makeConfig());
    expect(resolveDominantEdge({ x: 10, y: 100 }, geometry)).toBe("left");
    expect(resolveDominantEdge({ x: 190, y: 100 }, geometry)).toBe("right");
    expect(resolveDominantEdge({ x: 100, y: 10 }, geometry)).toBe("top");
    expect(resolveDominantEdge({ x: 100, y: 190 }, geometry)).toBe("bottom");
  });

  it("resolves the symmetric center tie to top (canonical tie-break order)", (): void => {
    const geometry = resolvePaneZoneGeometry(SQUARE_PANE, makeConfig());
    // All four normalized penetrations are equal at the centroid; top wins.
    expect(resolveDominantEdge({ x: 100, y: 100 }, geometry)).toBe("top");
  });

  it("still names the leaning edge for a point inside the center rect", (): void => {
    const geometry = resolvePaneZoneGeometry(SQUARE_PANE, makeConfig());
    // Inside the center rect but pushed toward the right edge.
    expect(resolveDominantEdge({ x: 130, y: 100 }, geometry)).toBe("right");
  });
});

describe("geometric hysteresis (edge <-> edge diagonal)", (): void => {
  // Square pane @ ratio 0.34: center rect is [66, 134] on both axes. The
  // top/right boundary is the diagonal x + y = 200; points just past it raw to
  // "right" while a 6px nudge toward "top" pulls them back across.
  it("holds the previous edge zone across the diagonal within the band", (): void => {
    const held = resolveAt(151, 50, { previousZone: "top" });
    // Raw classification at (151,50) is "right"; hysteresis holds "top".
    expect(classifyPaneZone({ x: 151, y: 50 }, resolvePaneZoneGeometry(SQUARE_PANE, makeConfig()))).toBe("right");
    expect(held.zone).toBe("top");
    expect(held.fallbackReason).toContain("hysteresis-hold");
  });

  it("switches to the new edge zone once the diagonal crossing exceeds the band", (): void => {
    const switched = resolveAt(170, 55, { previousZone: "top" });
    expect(switched.zone).toBe("right");
    expect(switched.fallbackReason).toBeNull();
  });
});

describe("zone / overlay agreement on a NON-square pane", (): void => {
  // Independent re-derivation of the drawn overlay zone from the percent-based
  // clip-path polygons (NOT reusing classifyPaneZone), so the assertion proves
  // the resolver-resolved zone equals the drawn-overlay zone — including across
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
    const geometry = resolvePaneZoneGeometry(NON_SQUARE, makeConfig());
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
      expect(classifyPaneZone(point, geometry)).toBe(drawnOverlayZone(point));
    }
  });
});

describe("group tab strip drop helpers", (): void => {
  it("pointInClientBounds detects a client point inside bounds", (): void => {
    expect(pointInClientBounds(50, 50, { left: 0, top: 0, right: 100, bottom: 100 })).toBe(true);
    expect(pointInClientBounds(150, 50, { left: 0, top: 0, right: 100, bottom: 100 })).toBe(false);
  });

  it("resolveGroupTabStripHit returns the first matching strip", (): void => {
    const hit = resolveGroupTabStripHit(30, 10, [
      { groupId: "group-a", activeMemberLeafId: "a", bounds: { left: 0, top: 0, right: 40, bottom: 20 } },
      { groupId: "group-b", activeMemberLeafId: "b", bounds: { left: 50, top: 0, right: 90, bottom: 20 } },
    ]);
    expect(hit).toEqual({ groupId: "group-a", activeMemberLeafId: "a" });
  });

  it("buildGroupTabStripMergeIntent produces a valid group-merge center intent", (): void => {
    const intent = buildGroupTabStripMergeIntent({
      activeMemberLeafId: "b",
      evaluateCenter: (): ZoneEvaluation => ({ isValid: true, rejectionReason: null }),
    });
    expect(intent.leafId).toBe("b");
    expect(intent.zone).toBe("center");
    expect(intent.action).toBe("group-merge");
    expect(intent.fallbackReason).toBe("group-tab-strip");
  });
});

describe("group body center is SWAP, never group-merge (add-to-group is tab-strip-only)", (): void => {
  // Regression guard for the center/swap-zone-hijack bug: a center drop on a
  // GROUP body must resolve to `swap` (identical to a center drop on a leaf), so
  // the swap affordance is preserved on every slot. `resolveDropIntent` has no
  // group awareness at all — `group-merge` is reachable ONLY through the group's
  // tab strip (`resolveGroupTabStripHit` → `buildGroupTabStripMergeIntent`).
  it("resolves a center body drop to swap regardless of the target being a group", (): void => {
    const center = resolveAt(100, 100);
    expect(center.zone).toBe("center");
    expect(center.action).toBe("swap");
  });

  it("keeps group-body edges as edge-insert (the per-slot edge affordance)", (): void => {
    expect(resolveAt(10, 100).action).toBe("edge-insert");
    expect(resolveAt(100, 10).action).toBe("edge-insert");
  });

  it("the only group-merge path is the tab strip, which still merges", (): void => {
    const tabStripMerge = buildGroupTabStripMergeIntent({
      activeMemberLeafId: "b",
      evaluateCenter: (): ZoneEvaluation => ({ isValid: true, rejectionReason: null }),
    });
    expect(tabStripMerge.action).toBe("group-merge");
    // The pane-body resolver never emits group-merge for the same center point.
    expect(resolveAt(100, 100).action).not.toBe("group-merge");
  });
});
