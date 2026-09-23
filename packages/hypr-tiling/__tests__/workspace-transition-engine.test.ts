/**
 * Pure workspace-switch transition helpers (N2): mode resolution, unit
 * progress, slide / fade transforms. No DOM.
 */
import { describe, expect, it } from "@jest/globals";
import { DEFAULT_DRAG_HOP_EASING } from "../engine/drag-easing";
import {
  DEFAULT_WORKSPACE_TRANSITION_CONFIG,
  DEFAULT_WORKSPACE_TRANSITION_DURATION_MS,
  DEFAULT_WORKSPACE_TRANSITION_EASING,
  clampUnitProgress,
  resolveTransitionMode,
  sampleTransitionEase,
  transitionTransform,
  unitProgressFromSigned,
  type TilingWorkspaceTransitionDirection,
  type TilingWorkspaceTransitionMode,
} from "../engine/workspace-transition";

describe("DEFAULT_WORKSPACE_TRANSITION_CONFIG", (): void => {
  it("defaults to none / 200 ms / drag-hop easing", (): void => {
    expect(DEFAULT_WORKSPACE_TRANSITION_CONFIG.mode).toBe("none");
    expect(DEFAULT_WORKSPACE_TRANSITION_DURATION_MS).toBe(200);
    expect(DEFAULT_WORKSPACE_TRANSITION_CONFIG.durationMs).toBe(200);
    expect(DEFAULT_WORKSPACE_TRANSITION_EASING).toBe(DEFAULT_DRAG_HOP_EASING);
    expect(DEFAULT_WORKSPACE_TRANSITION_CONFIG.easing).toBe(
      DEFAULT_DRAG_HOP_EASING,
    );
  });
});

describe("resolveTransitionMode", (): void => {
  const modes: ReadonlyArray<TilingWorkspaceTransitionMode> = [
    "none",
    "slide",
    "fade",
  ];

  it("resolves every requested mode to none under reduced motion", (): void => {
    for (const requested of modes) {
      expect(
        resolveTransitionMode(requested, {
          reducedMotion: true,
          degraded: false,
        }),
      ).toBe("none");
      expect(
        resolveTransitionMode(requested, {
          reducedMotion: true,
          degraded: true,
        }),
      ).toBe("none");
    }
  });

  it("falls a degraded slide back to fade (bitmap missing)", (): void => {
    expect(
      resolveTransitionMode("slide", { reducedMotion: false, degraded: true }),
    ).toBe("fade");
  });

  it("keeps fade and none when only degraded is set", (): void => {
    expect(
      resolveTransitionMode("fade", { reducedMotion: false, degraded: true }),
    ).toBe("fade");
    expect(
      resolveTransitionMode("none", { reducedMotion: false, degraded: true }),
    ).toBe("none");
  });

  it("returns the requested mode when nothing overrides it", (): void => {
    for (const requested of modes) {
      expect(
        resolveTransitionMode(requested, {
          reducedMotion: false,
          degraded: false,
        }),
      ).toBe(requested);
    }
  });
});

describe("clampUnitProgress / unitProgressFromSigned", (): void => {
  it("clamps unit progress into [0, 1] and collapses NaN to 0", (): void => {
    expect(clampUnitProgress(-0.5)).toBe(0);
    expect(clampUnitProgress(0)).toBe(0);
    expect(clampUnitProgress(0.5)).toBe(0.5);
    expect(clampUnitProgress(1)).toBe(1);
    expect(clampUnitProgress(1.5)).toBe(1);
    expect(clampUnitProgress(Number.NaN)).toBe(0);
  });

  it("maps signed swipe progress onto the requested direction", (): void => {
    expect(unitProgressFromSigned(0, "next")).toBe(0);
    expect(unitProgressFromSigned(0.5, "next")).toBe(0.5);
    expect(unitProgressFromSigned(1, "next")).toBe(1);
    expect(unitProgressFromSigned(-0.5, "next")).toBe(0);
    expect(unitProgressFromSigned(-1, "prev")).toBe(1);
    expect(unitProgressFromSigned(-0.5, "prev")).toBe(0.5);
    expect(unitProgressFromSigned(0.5, "prev")).toBe(0);
  });
});

describe("sampleTransitionEase", (): void => {
  it("is ease-out cubic: 0 → 0, 1 → 1, mid above the linear diagonal", (): void => {
    expect(sampleTransitionEase(0)).toBe(0);
    expect(sampleTransitionEase(1)).toBe(1);
    expect(sampleTransitionEase(0.5)).toBeGreaterThan(0.5);
    expect(sampleTransitionEase(-1)).toBe(0);
    expect(sampleTransitionEase(2)).toBe(1);
  });
});

describe("transitionTransform — slide prev/next at 0 / 0.5 / 1", (): void => {
  function sample(
    progress: number,
    direction: TilingWorkspaceTransitionDirection,
  ): ReturnType<typeof transitionTransform> {
    return transitionTransform(progress, direction, "slide");
  }

  it("starts with the clone covering and the incoming off-screen", (): void => {
    const next = sample(0, "next");
    expect(next.outgoing.transform).toBe("translateX(0%)");
    expect(next.incoming.transform).toBe("translateX(100%)");
    expect(next.outgoing.opacity).toBe(1);
    expect(next.incoming.opacity).toBe(1);

    const prev = sample(0, "prev");
    expect(prev.outgoing.transform).toBe("translateX(0%)");
    expect(prev.incoming.transform).toBe("translateX(-100%)");
  });

  it("is halfway at progress 0.5", (): void => {
    const next = sample(0.5, "next");
    expect(next.outgoing.transform).toBe("translateX(-50%)");
    expect(next.incoming.transform).toBe("translateX(50%)");

    const prev = sample(0.5, "prev");
    expect(prev.outgoing.transform).toBe("translateX(50%)");
    expect(prev.incoming.transform).toBe("translateX(-50%)");
  });

  it("ends with the clone off-screen and the incoming covering", (): void => {
    const next = sample(1, "next");
    expect(next.outgoing.transform).toBe("translateX(-100%)");
    expect(next.incoming.transform).toBe("translateX(0%)");

    const prev = sample(1, "prev");
    expect(prev.outgoing.transform).toBe("translateX(100%)");
    expect(prev.incoming.transform).toBe("translateX(0%)");
  });
});

describe("transitionTransform — fade / none", (): void => {
  it("fades outgoing opacity 1 → 0 and keeps incoming opacity 1", (): void => {
    const start = transitionTransform(0, "next", "fade");
    expect(start.outgoing.opacity).toBe(1);
    expect(start.incoming.opacity).toBe(1);
    expect(start.outgoing.transform).toBe("none");
    expect(start.incoming.transform).toBe("none");

    const mid = transitionTransform(0.5, "prev", "fade");
    expect(mid.outgoing.opacity).toBe(0.5);
    expect(mid.incoming.opacity).toBe(1);

    const end = transitionTransform(1, "next", "fade");
    expect(end.outgoing.opacity).toBe(0);
    expect(end.incoming.opacity).toBe(1);
  });

  it("is identity for mode none at every progress", (): void => {
    for (const progress of [0, 0.5, 1]) {
      const painted = transitionTransform(progress, "next", "none");
      expect(painted.outgoing.transform).toBe("none");
      expect(painted.incoming.transform).toBe("none");
      expect(painted.outgoing.opacity).toBe(1);
      expect(painted.incoming.opacity).toBe(1);
    }
  });
});
