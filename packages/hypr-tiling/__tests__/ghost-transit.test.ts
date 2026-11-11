import { describe, expect, it } from "@jest/globals";
import {
  DEFAULT_GHOST_PICKUP_SCALE_PERCENT,
  GHOST_PICKUP_SCALE_MAX_PERCENT,
  GHOST_PICKUP_SCALE_MIN_PERCENT,
  MAGNETIC_EASE_SAMPLE_COUNT,
  MAGNETIC_EASE_SPLIT,
  type GhostRect,
  buildLinearEasingCss,
  clampGhostPickupScalePercent,
  deriveGhostMorphTransform,
  deriveGhostPickupBox,
  ghostPickupScaleFactor,
  isDegenerateGhostRect,
  magneticEaseProgress,
  resolveGhostHopFirstRect,
} from "../engine/ghost-transit";

function rect(left: number, top: number, width: number, height: number): GhostRect {
  return { left, top, width, height };
}

describe("ghost-transit — clampGhostPickupScalePercent / ghostPickupScaleFactor", () => {
  it("clamps below the floor up to the min percent", () => {
    expect(clampGhostPickupScalePercent(0)).toBe(GHOST_PICKUP_SCALE_MIN_PERCENT);
    expect(clampGhostPickupScalePercent(5)).toBe(GHOST_PICKUP_SCALE_MIN_PERCENT);
  });

  it("clamps above the ceiling down to the max percent", () => {
    expect(clampGhostPickupScalePercent(400)).toBe(GHOST_PICKUP_SCALE_MAX_PERCENT);
  });

  it("passes through an interior percent", () => {
    expect(clampGhostPickupScalePercent(90)).toBe(90);
    expect(clampGhostPickupScalePercent(120)).toBe(120);
  });

  it("collapses NaN to the documented default", () => {
    expect(clampGhostPickupScalePercent(Number.NaN)).toBe(DEFAULT_GHOST_PICKUP_SCALE_PERCENT);
  });

  it("returns the clamped percent as a unit factor", () => {
    expect(ghostPickupScaleFactor(90)).toBeCloseTo(0.9, 6);
    expect(ghostPickupScaleFactor(5)).toBeCloseTo(GHOST_PICKUP_SCALE_MIN_PERCENT / 100, 6);
    expect(ghostPickupScaleFactor(1000)).toBeCloseTo(GHOST_PICKUP_SCALE_MAX_PERCENT / 100, 6);
  });
});

describe("ghost-transit — deriveGhostPickupBox", () => {
  it("shrinks about the grab point, keeping the grabbed content under the cursor", () => {
    const active: GhostRect = rect(100, 100, 200, 100);
    const grab = { x: 50, y: 20 };
    const box: GhostRect = deriveGhostPickupBox(active, grab, 0.9);
    expect(box.width).toBeCloseTo(180, 6);
    expect(box.height).toBeCloseTo(90, 6);
    expect(box.left).toBeCloseTo(105, 6);
    expect(box.top).toBeCloseTo(102, 6);
    // Grab point in client coords (active.left + gx) must equal the scaled grab
    // point (box.left + gx·f) so the cursor stays on the same content.
    const grabClientX: number = active.left + grab.x;
    const grabScaledX: number = box.left + grab.x * 0.9;
    expect(grabScaledX).toBeCloseTo(grabClientX, 6);
    const grabClientY: number = active.top + grab.y;
    const grabScaledY: number = box.top + grab.y * 0.9;
    expect(grabScaledY).toBeCloseTo(grabClientY, 6);
  });

  it("is the identity box at factor 1", () => {
    const active: GhostRect = rect(10, 20, 300, 150);
    const box: GhostRect = deriveGhostPickupBox(active, { x: 30, y: 40 }, 1);
    expect(box).toEqual(active);
  });
});

describe("ghost-transit — deriveGhostMorphTransform (FLIP invert)", () => {
  it("inverts a pure translate (First → Last)", () => {
    const transform = deriveGhostMorphTransform(rect(340, 50, 200, 150), rect(100, 50, 200, 150));
    expect(transform).not.toBeNull();
    expect(transform?.tx).toBe(240);
    expect(transform?.ty).toBe(0);
    expect(transform?.sx).toBeCloseTo(1, 6);
    expect(transform?.sy).toBeCloseTo(1, 6);
  });

  it("inverts a resize as a scale relative to the Last box", () => {
    const transform = deriveGhostMorphTransform(rect(0, 0, 400, 300), rect(0, 0, 200, 150));
    expect(transform?.sx).toBeCloseTo(2, 6);
    expect(transform?.sy).toBeCloseTo(2, 6);
  });

  it("returns null when move + resize are both below the epsilons", () => {
    expect(deriveGhostMorphTransform(rect(100, 100, 200, 100), rect(100.2, 100.1, 200, 100))).toBeNull();
  });
});

describe("ghost-transit — isDegenerateGhostRect", () => {
  it("flags zero / negative area", () => {
    expect(isDegenerateGhostRect(rect(0, 0, 0, 100))).toBe(true);
    expect(isDegenerateGhostRect(rect(0, 0, 100, -1))).toBe(true);
    expect(isDegenerateGhostRect(rect(0, 0, 100, 100))).toBe(false);
  });
});

describe("ghost-transit — magneticEaseProgress (segmentation)", () => {
  it("pins the endpoints", () => {
    expect(magneticEaseProgress(0)).toBe(0);
    expect(magneticEaseProgress(1)).toBe(1);
    expect(magneticEaseProgress(-0.5)).toBe(0);
    expect(magneticEaseProgress(2)).toBe(1);
  });

  it("is monotonic non-decreasing", () => {
    let previous: number = -1;
    for (let i = 0; i <= 100; i += 1) {
      const value: number = magneticEaseProgress(i / 100);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it("snaps: the last segment's average speed exceeds the approach's", () => {
    const split: number = MAGNETIC_EASE_SPLIT;
    const approachAvgSpeed: number = (magneticEaseProgress(split) - magneticEaseProgress(0)) / split;
    const tailAvgSpeed: number = (magneticEaseProgress(1) - magneticEaseProgress(split)) / (1 - split);
    expect(tailAvgSpeed).toBeGreaterThan(approachAvgSpeed);
  });
});

describe("ghost-transit — buildLinearEasingCss", () => {
  it("emits a linear() function with sampleCount + 1 points, pinned endpoints", () => {
    const css: string = buildLinearEasingCss();
    expect(css.startsWith("linear(")).toBe(true);
    expect(css.endsWith(")")).toBe(true);
    const inner: string = css.slice("linear(".length, -1);
    const points: string[] = inner.split(",").map((s: string): string => s.trim());
    expect(points.length).toBe(MAGNETIC_EASE_SAMPLE_COUNT + 1);
    expect(Number(points[0])).toBeCloseTo(0, 4);
    expect(Number(points[points.length - 1])).toBeCloseTo(1, 4);
  });
});

describe("ghost-transit — resolveGhostHopFirstRect (FLIP First at rest vs mid-flight)", () => {
  const previousBase: GhostRect = rect(100, 100, 300, 200);
  const liveVisual: GhostRect = rect(640, 480, 300, 200);

  it("uses the PREVIOUS committed base at rest so the hop has a non-zero invert", () => {
    // The live box at rest already equals the freshly-applied target base, so
    // reading it would zero the invert (the BUG 2 teleport). The prior-frame box
    // is the correct First — distinct from `last` → the hop travels + duration applies.
    const first: GhostRect = resolveGhostHopFirstRect({
      previousBaseRect: previousBase,
      liveVisualRect: liveVisual,
      hasInFlightTransform: false,
    });
    expect(first).toEqual(previousBase);
    const last: GhostRect = liveVisual;
    const moved: boolean = first.left !== last.left || first.top !== last.top;
    expect(moved).toBe(true);
    expect(deriveGhostMorphTransform(first, last)).not.toBeNull();
  });

  it("uses the LIVE transformed box mid-flight so an interrupted hop re-aims smoothly", () => {
    const first: GhostRect = resolveGhostHopFirstRect({
      previousBaseRect: previousBase,
      liveVisualRect: liveVisual,
      hasInFlightTransform: true,
    });
    expect(first).toEqual(liveVisual);
  });

  it("falls back to the live box when no previous rect was recorded yet", () => {
    const first: GhostRect = resolveGhostHopFirstRect({
      previousBaseRect: null,
      liveVisualRect: liveVisual,
      hasInFlightTransform: false,
    });
    expect(first).toEqual(liveVisual);
  });
});
