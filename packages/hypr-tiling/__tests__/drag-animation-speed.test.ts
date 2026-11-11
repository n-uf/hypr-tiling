import { describe, expect, it } from "@jest/globals";
import { SETTLE_TEMPO } from "@n-uf/motion";
import { BASELINE_DRAG_HOP_DURATION_MS } from "../engine/drag-timing";
import {
  DRAG_ANIMATION_SPEED_MAX_PERCENT,
  DRAG_ANIMATION_SPEED_MIN_PERCENT,
  resolveDragAnimationDurationMs,
  resolveLeafMotionOmega,
} from "../react/tiling-renderer";

describe("dynamic-tiling-renderer — resolveDragAnimationDurationMs", () => {
  it("returns the baseline at 100%", () => {
    expect(resolveDragAnimationDurationMs(100)).toBe(BASELINE_DRAG_HOP_DURATION_MS);
  });

  it("is slower below 100% and faster above", () => {
    expect(resolveDragAnimationDurationMs(50)).toBeGreaterThan(BASELINE_DRAG_HOP_DURATION_MS);
    expect(resolveDragAnimationDurationMs(200)).toBeLessThan(BASELINE_DRAG_HOP_DURATION_MS);
  });

  it("yields ~10x the base at the 10% floor (the slow ~1700ms hop)", () => {
    // 10% is the slider floor: 170ms base * (100 / 10) = 1700ms. This is the
    // BUG 2 acceptance point — the resolved duration the ghost hop must honor.
    expect(resolveDragAnimationDurationMs(10)).toBe(BASELINE_DRAG_HOP_DURATION_MS * 10);
    expect(resolveDragAnimationDurationMs(10)).toBe(1700);
  });

  it("is strictly monotonic decreasing across the slider range (slowest at 10% … fastest at max)", () => {
    const percents: number[] = [
      DRAG_ANIMATION_SPEED_MIN_PERCENT,
      25,
      50,
      100,
      200,
      DRAG_ANIMATION_SPEED_MAX_PERCENT,
    ];
    for (let i = 1; i < percents.length; i += 1) {
      expect(resolveDragAnimationDurationMs(percents[i])).toBeLessThan(
        resolveDragAnimationDurationMs(percents[i - 1]),
      );
    }
  });

  it("clamps out-of-range percents to the min/max duration band", () => {
    expect(resolveDragAnimationDurationMs(0)).toBe(
      resolveDragAnimationDurationMs(DRAG_ANIMATION_SPEED_MIN_PERCENT),
    );
    expect(resolveDragAnimationDurationMs(10000)).toBe(
      resolveDragAnimationDurationMs(DRAG_ANIMATION_SPEED_MAX_PERCENT),
    );
  });
});

describe("tiling-renderer — resolveLeafMotionOmega (pane motion tempo)", () => {
  it("is the settle's default tempo at 100% (90 % of a move in 92 ms)", () => {
    expect(resolveLeafMotionOmega(100)).toBe(SETTLE_TEMPO.default);
    expect(Math.log(10) / resolveLeafMotionOmega(100)).toBeCloseTo(0.0921, 3);
  });

  it("scales in proportion: 200% arrives twice as fast", () => {
    expect(resolveLeafMotionOmega(200)).toBe(2 * SETTLE_TEMPO.default);
    expect(resolveLeafMotionOmega(50)).toBe(SETTLE_TEMPO.default / 2);
  });

  it("clamps out-of-range percents like every drag animation speed", () => {
    expect(resolveLeafMotionOmega(0)).toBe(resolveLeafMotionOmega(DRAG_ANIMATION_SPEED_MIN_PERCENT));
    expect(resolveLeafMotionOmega(10000)).toBe(resolveLeafMotionOmega(DRAG_ANIMATION_SPEED_MAX_PERCENT));
  });
});
