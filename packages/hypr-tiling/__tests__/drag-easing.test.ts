import { describe, expect, it } from "@jest/globals";
import {
  DEFAULT_DRAG_HOP_EASING,
  DEFAULT_DRAG_REFLOW_EASING,
  isCssEasing,
  resolveDragEasing,
} from "../engine/drag-easing";

/**
 * Pure unit coverage for the consumer-configurable easing SDK surface
 * (HT-ANIM-EASING-CONFIG): the shape validator (`isCssEasing`) and the
 * fallback-collapsing resolver (`resolveDragEasing`).
 */

describe("isCssEasing (CSS <easing-function> shape check)", (): void => {
  it("accepts the global timing-function keywords", (): void => {
    for (const keyword of ["linear", "ease", "ease-in", "ease-out", "ease-in-out", "step-start", "step-end"]) {
      expect(isCssEasing(keyword)).toBe(true);
    }
  });

  it("accepts cubic-bezier / linear / steps functional forms", (): void => {
    expect(isCssEasing("cubic-bezier(0.2, 0.8, 0.2, 1)")).toBe(true);
    expect(isCssEasing("cubic-bezier(0.34, 1.56, 0.64, 1)")).toBe(true);
    expect(isCssEasing("linear(0, 0.25, 1)")).toBe(true);
    expect(isCssEasing("steps(4, jump-end)")).toBe(true);
  });

  it("is case-insensitive and ignores surrounding whitespace", (): void => {
    expect(isCssEasing("  EASE-IN-OUT  ")).toBe(true);
    expect(isCssEasing("CUBIC-BEZIER(0.1, 0.1, 0.1, 0.1)")).toBe(true);
  });

  it("rejects empty / blank strings", (): void => {
    expect(isCssEasing("")).toBe(false);
    expect(isCssEasing("   ")).toBe(false);
  });

  it("rejects unknown keywords and malformed functional forms", (): void => {
    expect(isCssEasing("bouncy")).toBe(false);
    expect(isCssEasing("cubic-bezier")).toBe(false);
    expect(isCssEasing("cubic-bezier(")).toBe(false);
    // nested parens are not a plausible single easing function
    expect(isCssEasing("cubic-bezier(calc(1))")).toBe(false);
    // injection-shaped string must not slip through
    expect(isCssEasing("red; background: url(x)")).toBe(false);
  });

  it("treats the library defaults as valid easings", (): void => {
    expect(isCssEasing(DEFAULT_DRAG_HOP_EASING)).toBe(true);
    expect(isCssEasing(DEFAULT_DRAG_REFLOW_EASING)).toBe(true);
  });
});

describe("resolveDragEasing (resolve to a usable timing function)", (): void => {
  it("returns the trimmed value when it is a plausible easing", (): void => {
    expect(resolveDragEasing("ease-out", DEFAULT_DRAG_HOP_EASING)).toBe("ease-out");
    expect(resolveDragEasing("  linear  ", DEFAULT_DRAG_HOP_EASING)).toBe("linear");
  });

  it("collapses null / undefined to the fallback", (): void => {
    expect(resolveDragEasing(undefined, DEFAULT_DRAG_HOP_EASING)).toBe(DEFAULT_DRAG_HOP_EASING);
    expect(resolveDragEasing(null, DEFAULT_DRAG_HOP_EASING)).toBe(DEFAULT_DRAG_HOP_EASING);
  });

  it("collapses blank / malformed values to the fallback", (): void => {
    expect(resolveDragEasing("", "ease-in")).toBe("ease-in");
    expect(resolveDragEasing("   ", "ease-in")).toBe("ease-in");
    expect(resolveDragEasing("not-an-easing", "ease-in")).toBe("ease-in");
  });

  it("supports the renderer's reflow→hop fallback chaining", (): void => {
    // reflow undefined falls back to the resolved hop curve
    const hop: string = resolveDragEasing("ease-out", DEFAULT_DRAG_HOP_EASING);
    expect(resolveDragEasing(undefined, hop)).toBe("ease-out");
  });

  it("defaults: reflow default equals hop default (coordinated motion)", (): void => {
    expect(DEFAULT_DRAG_REFLOW_EASING).toBe(DEFAULT_DRAG_HOP_EASING);
  });
});
