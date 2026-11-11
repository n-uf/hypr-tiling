import { describe, expect, it } from "@jest/globals";
import {
  resolveDragPresentation,
  resolveInitialPaneContentVisible,
  resolvePaneBodyRenderMode,
  type DragPresentationInput,
  type DragPresentationMode,
} from "../engine/drag-presentation";
import type { TilingPaneBodyRenderMode } from "../engine/types";

/**
 * Build a fully-typed presentation input with inert defaults; tests override
 * only the load-bearing fields. NOTE: the resolver is content-agnostic — there
 * is no `isPaneContentVisible` input — so content state cannot appear here.
 */
function input(overrides: Partial<DragPresentationInput>): DragPresentationInput {
  return {
    liveDragModeEnabled: true,
    dragPhase: "dragging",
    leafId: "X",
    pickupOriginLeafId: null,
    heldSlotLeafId: null,
    dropAction: null,
    dropZone: null,
    dropDominantEdge: null,
    ...overrides,
  };
}

describe("drag presentation resolver — content-agnostic drag mechanics", (): void => {
  it("the held slot is the reservation; the pickup origin is not", (): void => {
    const slot: DragPresentationMode = resolveDragPresentation(
      input({ leafId: "B", pickupOriginLeafId: "A", heldSlotLeafId: "B", dropAction: "swap", dropZone: "center" }),
    );
    expect(slot.isHeldSlotReservation).toBe(true);
    expect(slot.isHeldSlotLeaf).toBe(true);
    expect(slot.isPickupOriginLeaf).toBe(false);

    const origin: DragPresentationMode = resolveDragPresentation(
      input({ leafId: "A", pickupOriginLeafId: "A", heldSlotLeafId: "B", dropAction: "swap", dropZone: "center" }),
    );
    expect(origin.isHeldSlotReservation).toBe(false);
    expect(origin.isPickupOriginLeaf).toBe(true);
    expect(origin.isHeldSlotLeaf).toBe(false);
  });

  it("no held slot (the others closed the gap): nothing is a reservation", (): void => {
    for (const leafId of ["A", "B", "C"]) {
      expect(resolveDragPresentation(input({ leafId, pickupOriginLeafId: "A" })).isHeldSlotReservation).toBe(false);
    }
  });

  it("the reservation lasts only while dragging: a settle lands the pane in its slot", (): void => {
    for (const dragPhase of ["settling", "idle", "armed"] as const) {
      expect(
        resolveDragPresentation(input({ dragPhase, leafId: "B", heldSlotLeafId: "B" })).isHeldSlotReservation,
      ).toBe(false);
    }
  });

  it("preview mode (nothing is lifted) never produces a reservation", (): void => {
    expect(
      resolveDragPresentation(input({ liveDragModeEnabled: false, leafId: "A", heldSlotLeafId: "A" }))
        .isHeldSlotReservation,
    ).toBe(false);
  });
});

describe("drop-target chrome zone (SSOT — no caller-side ternary)", (): void => {
  it("non-target leaf has no chrome zone", (): void => {
    expect(resolveDragPresentation(input({ dropAction: null, dropZone: null })).dropChromeZone).toBeNull();
    expect(resolveDragPresentation(input({ dropAction: "none", dropZone: "center" })).dropChromeZone).toBeNull();
  });

  it("center swap chrome is the center zone", (): void => {
    expect(
      resolveDragPresentation(input({ dropAction: "swap", dropZone: "center", dropDominantEdge: "right" }))
        .dropChromeZone,
    ).toBe("center");
  });

  it("edge-insert chrome uses the resolved edge zone", (): void => {
    expect(
      resolveDragPresentation(input({ dropAction: "edge-insert", dropZone: "left", dropDominantEdge: "left" }))
        .dropChromeZone,
    ).toBe("left");
  });

  it("edge-insert at a center hit falls back to the dominant edge", (): void => {
    expect(
      resolveDragPresentation(input({ dropAction: "edge-insert", dropZone: "center", dropDominantEdge: "top" }))
        .dropChromeZone,
    ).toBe("top");
  });

  it("swap that resolved to a non-center zone (action/zone disagreement) renders that edge", (): void => {
    expect(
      resolveDragPresentation(input({ dropAction: "swap", dropZone: "bottom", dropDominantEdge: "right" }))
        .dropChromeZone,
    ).toBe("bottom");
  });

  it("group-merge chrome is the raw (center) zone", (): void => {
    expect(
      resolveDragPresentation(input({ dropAction: "group-merge", dropZone: "center", dropDominantEdge: "right" }))
        .dropChromeZone,
    ).toBe("center");
  });
});

/**
 * The uniform pane-body CONTENT rule, applied identically to every pane (the
 * dragged one included). Content presence is the ONLY delta between CONTENT
 * on / off, and a held-slot reservation stays content-less regardless.
 */
describe("uniform pane-body content rule", (): void => {
  it("a held-slot reservation is content-less regardless of CONTENT (the pane shows once)", (): void => {
    expect(resolvePaneBodyRenderMode(true, true)).toBe("render-reservation");
    expect(resolvePaneBodyRenderMode(true, false)).toBe("render-reservation");
  });

  it("every other pane — the lifted one included — honors the CONTENT toggle", (): void => {
    expect(resolvePaneBodyRenderMode(false, true)).toBe("render-content");
    expect(resolvePaneBodyRenderMode(false, false)).toBe("render-empty");
  });
});

describe("single painted instance — at most one held-slot reservation", (): void => {
  const ORIGIN = "A";
  const SLOT = "B";
  const OTHER = "C";

  function bodyModes(isPaneContentVisible: boolean): Record<"origin" | "slot" | "other", TilingPaneBodyRenderMode> {
    const mode = (leafId: string): TilingPaneBodyRenderMode =>
      resolvePaneBodyRenderMode(
        resolveDragPresentation(input({ leafId, pickupOriginLeafId: ORIGIN, heldSlotLeafId: SLOT }))
          .isHeldSlotReservation,
        isPaneContentVisible,
      );
    return { origin: mode(ORIGIN), slot: mode(SLOT), other: mode(OTHER) };
  }

  it("CONTENT on: the slot is the one reservation; the others paint content", (): void => {
    expect(bodyModes(true)).toEqual({ origin: "render-content", slot: "render-reservation", other: "render-content" });
  });

  it("CONTENT off: the SAME single reservation; the others are empty bodies", (): void => {
    expect(bodyModes(false)).toEqual({ origin: "render-empty", slot: "render-reservation", other: "render-empty" });
  });
});

/**
 * Default content visibility derived from the content toggle — the single
 * source of truth for embeddings that suppress the toggle (e.g. the docs/SEO
 * homepage).
 */
describe("initial pane-content visibility from showContentToggle", (): void => {
  it("toggle shown ⇒ content default off (legacy: empty until flipped)", (): void => {
    expect(resolveInitialPaneContentVisible(true)).toBe(false);
  });

  it("toggle suppressed ⇒ content default on (embedding owns content)", (): void => {
    expect(resolveInitialPaneContentVisible(false)).toBe(true);
  });
});
