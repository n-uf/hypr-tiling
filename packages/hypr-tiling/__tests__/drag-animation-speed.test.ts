import { describe, expect, it } from "@jest/globals";
import {
  BASELINE_DRAG_HOP_DURATION_MS,
  DRAG_ANIMATION_SPEED_MAX_PERCENT,
  DRAG_ANIMATION_SPEED_MIN_PERCENT,
  dragSpeedsAtParity,
  resolveDragAnimationDurationMs,
} from "../react/dynamic-tiling-renderer";

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

describe("dynamic-tiling-renderer — dragSpeedsAtParity", () => {
  it("is true for equal speeds (linked regime)", () => {
    expect(dragSpeedsAtParity(100, 100)).toBe(true);
    expect(dragSpeedsAtParity(40, 40)).toBe(true);
  });

  it("is false for differing speeds (split / unlinked regime)", () => {
    expect(dragSpeedsAtParity(100, 50)).toBe(false);
    expect(dragSpeedsAtParity(200, 100)).toBe(false);
  });

  it("compares RESOLVED timing, so percents that clamp to the same duration are parity", () => {
    // Both clamp above the ceiling → identical resolved duration → parity.
    expect(dragSpeedsAtParity(DRAG_ANIMATION_SPEED_MAX_PERCENT + 100, DRAG_ANIMATION_SPEED_MAX_PERCENT + 500)).toBe(true);
    // Both clamp below the floor → identical resolved duration → parity.
    expect(dragSpeedsAtParity(1, 5)).toBe(true);
  });
});
