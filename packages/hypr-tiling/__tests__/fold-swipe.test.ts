import { describe, expect, it } from "@jest/globals";
import {
  FOLD_SWIPE_MAX_FOLLOW_FRACTION,
  foldFlipToken,
  foldSwipeFollowPx,
  resolveFoldSwipeAxis,
  resolveFoldSwipeRelease,
  scrollChainFlipToken,
} from "../engine/fold-swipe";

// Swipe to flip a fold: the pure rules.

describe("fold flip tokens", () => {
  it("a fold turns toward its spine, in scroll-chain terms", () => {
    expect(foldFlipToken("right")).toBe("x+");
    expect(foldFlipToken("left")).toBe("x-");
    expect(foldFlipToken("bottom")).toBe("y+");
    expect(foldFlipToken("top")).toBe("y-");
    expect(scrollChainFlipToken("x", 1)).toBe(foldFlipToken("right"));
    expect(scrollChainFlipToken("x", -1)).toBe(foldFlipToken("left"));
  });
});

describe("resolveFoldSwipeAxis", () => {
  it("nothing inside the slop; sideways only when |dx| > 2·|dy|", () => {
    expect(resolveFoldSwipeAxis(5, 3)).toBeNull();
    expect(resolveFoldSwipeAxis(-30, 10)).toBe("x");
    expect(resolveFoldSwipeAxis(20, 10)).toBe("y");
    expect(resolveFoldSwipeAxis(2, -40)).toBe("y");
  });
});

describe("foldSwipeFollowPx", () => {
  it("follows the finger at 0.6, up to 40 % of the extent either way", () => {
    expect(foldSwipeFollowPx(-100, 400)).toBeCloseTo(-60, 9);
    expect(foldSwipeFollowPx(-1000, 400)).toBeCloseTo(-400 * FOLD_SWIPE_MAX_FOLLOW_FRACTION, 9);
    expect(foldSwipeFollowPx(1000, 400)).toBeCloseTo(400 * FOLD_SWIPE_MAX_FOLLOW_FRACTION, 9);
  });
});

describe("resolveFoldSwipeRelease", () => {
  const spineRight = { direction: 1 as const, extentPx: 400 };
  it("far enough toward the spine turns the fold", () => {
    expect(resolveFoldSwipeRelease({ ...spineRight, travelPx: -101, velocityPxPerMs: 0 })).toBe(true);
    expect(resolveFoldSwipeRelease({ ...spineRight, travelPx: -99, velocityPxPerMs: 0 })).toBe(false);
  });

  it("a fling toward the spine turns it past the minimum travel", () => {
    expect(resolveFoldSwipeRelease({ ...spineRight, travelPx: -30, velocityPxPerMs: -0.5 })).toBe(true);
    expect(resolveFoldSwipeRelease({ ...spineRight, travelPx: -20, velocityPxPerMs: -0.5 })).toBe(false);
    expect(resolveFoldSwipeRelease({ ...spineRight, travelPx: -30, velocityPxPerMs: -0.2 })).toBe(false);
  });

  it("a swipe away from the spine never turns it", () => {
    expect(resolveFoldSwipeRelease({ ...spineRight, travelPx: 300, velocityPxPerMs: 2 })).toBe(false);
    expect(resolveFoldSwipeRelease({ direction: -1, extentPx: 400, travelPx: -300, velocityPxPerMs: -2 })).toBe(false);
    expect(resolveFoldSwipeRelease({ direction: -1, extentPx: 400, travelPx: 150, velocityPxPerMs: 0 })).toBe(true);
  });
});
