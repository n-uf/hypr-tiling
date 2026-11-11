import { describe, expect, it } from "@jest/globals";
import { SETTLE_TEMPO } from "@n-uf/motion";
import {
  DRAG_ANIMATION_SPEED_MAX_PERCENT,
  DRAG_ANIMATION_SPEED_MIN_PERCENT,
  resolveLeafMotionOmega,
} from "../react/tiling-renderer";

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
