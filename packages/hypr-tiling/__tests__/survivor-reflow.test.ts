import { describe, expect, it } from "@jest/globals";
import {
  SURVIVOR_REFLOW_SCALE_EPSILON,
  SURVIVOR_REFLOW_TRANSLATE_EPSILON_PX,
  type SurvivorRect,
  deriveSurvivorFlipTransform,
  isDegenerateRect,
  isRectFullyOutsideViewport,
  resolveSurvivorFlipFirst,
  shouldAnimateSurvivorReflow,
} from "../core/survivor-reflow";

function rect(left: number, top: number, width: number, height: number): SurvivorRect {
  return { left, top, width, height };
}

const VIEWPORT: SurvivorRect = rect(0, 0, 1000, 800);

describe("survivor-reflow FLIP — deriveSurvivorFlipTransform (invert)", () => {
  it("inverts a pure translate (Last → First) so the node paints back at First", () => {
    const first: SurvivorRect = rect(100, 50, 200, 150);
    const last: SurvivorRect = rect(340, 50, 200, 150);
    const transform = deriveSurvivorFlipTransform(first, last);
    expect(transform).not.toBeNull();
    // dx/dy carry the node from its committed slot back to its pre-reflow slot.
    expect(transform?.dx).toBe(-240);
    expect(transform?.dy).toBe(0);
    expect(transform?.sx).toBeCloseTo(1, 6);
    expect(transform?.sy).toBeCloseTo(1, 6);
  });

  it("inverts a resize as a scale relative to the committed (Last) box", () => {
    const first: SurvivorRect = rect(0, 0, 400, 300);
    const last: SurvivorRect = rect(0, 0, 200, 150);
    const transform = deriveSurvivorFlipTransform(first, last);
    expect(transform?.sx).toBeCloseTo(2, 6);
    expect(transform?.sy).toBeCloseTo(2, 6);
  });

  it("returns null when the move + resize are both below the epsilons (no-op skip)", () => {
    const first: SurvivorRect = rect(100, 100, 300, 200);
    const last: SurvivorRect = rect(
      100 + SURVIVOR_REFLOW_TRANSLATE_EPSILON_PX / 2,
      100 + SURVIVOR_REFLOW_TRANSLATE_EPSILON_PX / 2,
      300,
      200,
    );
    expect(deriveSurvivorFlipTransform(first, last)).toBeNull();
  });

  it("animates when only the scale exceeds its epsilon (sub-pixel translate)", () => {
    const first: SurvivorRect = rect(0, 0, 300 * (1 + SURVIVOR_REFLOW_SCALE_EPSILON * 4), 200);
    const last: SurvivorRect = rect(0, 0, 300, 200);
    expect(deriveSurvivorFlipTransform(first, last)).not.toBeNull();
  });

  it("guards a zero-width committed box (no division by zero → scale 1)", () => {
    const first: SurvivorRect = rect(0, 0, 200, 200);
    const last: SurvivorRect = rect(50, 0, 0, 200);
    const transform = deriveSurvivorFlipTransform(first, last);
    expect(transform?.sx).toBe(1);
    expect(transform?.dx).toBe(-50);
  });
});

describe("survivor-reflow FLIP — off-viewport / degenerate clamp", () => {
  it("flags a zero-area rect as degenerate", () => {
    expect(isDegenerateRect(rect(0, 0, 0, 100))).toBe(true);
    expect(isDegenerateRect(rect(0, 0, 100, 0))).toBe(true);
    expect(isDegenerateRect(rect(0, 0, 100, 100))).toBe(false);
  });

  it("detects a rect fully outside the viewport on each axis", () => {
    expect(isRectFullyOutsideViewport(rect(-300, 0, 200, 200), VIEWPORT)).toBe(true); // left of
    expect(isRectFullyOutsideViewport(rect(1200, 0, 200, 200), VIEWPORT)).toBe(true); // right of
    expect(isRectFullyOutsideViewport(rect(0, -300, 200, 200), VIEWPORT)).toBe(true); // above
    expect(isRectFullyOutsideViewport(rect(0, 1000, 200, 200), VIEWPORT)).toBe(true); // below
    expect(isRectFullyOutsideViewport(rect(100, 100, 200, 200), VIEWPORT)).toBe(false); // inside
    expect(isRectFullyOutsideViewport(rect(-50, 0, 200, 200), VIEWPORT)).toBe(false); // partial overlap
  });

  it("animates an on-screen reflow", () => {
    expect(shouldAnimateSurvivorReflow(rect(100, 50, 200, 150), rect(340, 50, 200, 150), VIEWPORT)).toBe(true);
  });

  it("skips when either endpoint is fully off-screen (no far-offset tween)", () => {
    // First off-screen (e.g. pane entering from a scrolled-out region).
    expect(shouldAnimateSurvivorReflow(rect(-400, 0, 200, 200), rect(100, 0, 200, 200), VIEWPORT)).toBe(false);
    // Last off-screen (e.g. pane leaving for a scrolled-out region).
    expect(shouldAnimateSurvivorReflow(rect(100, 0, 200, 200), rect(1400, 0, 200, 200), VIEWPORT)).toBe(false);
  });

  it("skips a degenerate endpoint", () => {
    expect(shouldAnimateSurvivorReflow(rect(0, 0, 0, 200), rect(100, 0, 200, 200), VIEWPORT)).toBe(false);
    expect(shouldAnimateSurvivorReflow(rect(100, 0, 200, 200), rect(0, 0, 200, 0), VIEWPORT)).toBe(false);
  });
});

describe("survivor-reflow FLIP — interrupt / retarget First selection", () => {
  const recorded: SurvivorRect = rect(100, 100, 200, 200);
  const live: SurvivorRect = rect(173, 142, 200, 200);

  it("uses the recorded pre-reflow rect when the survivor is at rest", () => {
    expect(
      resolveSurvivorFlipFirst({
        recordedPreReflowRect: recorded,
        liveVisualRect: live,
        hasInFlightTransform: false,
      }),
    ).toBe(recorded);
  });

  it("uses the LIVE transformed box mid-flight so a re-aim retargets without a jump", () => {
    expect(
      resolveSurvivorFlipFirst({
        recordedPreReflowRect: recorded,
        liveVisualRect: live,
        hasInFlightTransform: true,
      }),
    ).toBe(live);
  });

  it("returns null for a freshly mounted survivor (no recorded rect, not mid-flight)", () => {
    expect(
      resolveSurvivorFlipFirst({
        recordedPreReflowRect: null,
        liveVisualRect: live,
        hasInFlightTransform: false,
      }),
    ).toBeNull();
  });

  it("still retargets from the live box when mid-flight even with no recorded rect", () => {
    expect(
      resolveSurvivorFlipFirst({
        recordedPreReflowRect: null,
        liveVisualRect: live,
        hasInFlightTransform: true,
      }),
    ).toBe(live);
  });
});
