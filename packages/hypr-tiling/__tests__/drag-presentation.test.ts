import { describe, expect, it } from "@jest/globals";
import {
  isDragPresentationActive,
  resolveDragPresentation,
  type DragPresentationInput,
  type DragPresentationMode,
} from "../drag-presentation";
import type { DynamicPaneBodyRenderMode } from "../types";

/**
 * Build a fully-typed presentation input with inert defaults; tests override
 * only the load-bearing fields.
 */
function input(overrides: Partial<DragPresentationInput>): DragPresentationInput {
  return {
    isPaneContentVisible: true,
    liveDragModeEnabled: true,
    dragPhase: "dragging",
    settlingOutcome: null,
    leafId: "X",
    pickupOriginLeafId: null,
    ghostSeatLeafId: null,
    dropAction: null,
    dropZone: null,
    dropDominantEdge: null,
    ...overrides,
  };
}

describe("drag presentation resolver", (): void => {
  it("keeps presentation active through settling commit, not cancel", (): void => {
    expect(isDragPresentationActive("dragging", null)).toBe(true);
    expect(isDragPresentationActive("settling", "commit")).toBe(true);
    expect(isDragPresentationActive("settling", "cancel")).toBe(false);
    expect(isDragPresentationActive("idle", null)).toBe(false);
  });

  it("keeps the hop-in reservation through settling commit", (): void => {
    expect(
      resolveDragPresentation(
        input({
          isPaneContentVisible: false,
          dragPhase: "settling",
          settlingOutcome: "commit",
          leafId: "B",
          pickupOriginLeafId: "A",
          ghostSeatLeafId: "B",
          dropAction: "swap",
          dropZone: "center",
        }),
      ).paneBodyRenderMode,
    ).toBe("render-reservation");
  });

  it("empty live swap: pickup origin placeholder, ghost-seat reservation", (): void => {
    const source: DragPresentationMode = resolveDragPresentation(
      input({
        isPaneContentVisible: false,
        leafId: "A",
        pickupOriginLeafId: "A",
        ghostSeatLeafId: "B",
        dropAction: "swap",
        dropZone: "center",
      }),
    );
    expect(source.paneBodyRenderMode).toBe("render-placeholder");
    expect(source.isPickupOriginLeaf).toBe(true);
    expect(source.isGhostSeatLeaf).toBe(false);

    const target: DragPresentationMode = resolveDragPresentation(
      input({
        isPaneContentVisible: false,
        leafId: "B",
        pickupOriginLeafId: "A",
        ghostSeatLeafId: "B",
        dropAction: "swap",
        dropZone: "center",
      }),
    );
    expect(target.paneBodyRenderMode).toBe("render-reservation");
    expect(target.isGhostSeatLeaf).toBe(true);
  });

  it("empty live edge-insert: pickup origin IS the ghost seat → reservation", (): void => {
    const source: DragPresentationMode = resolveDragPresentation(
      input({
        isPaneContentVisible: false,
        leafId: "A",
        pickupOriginLeafId: "A",
        ghostSeatLeafId: "A",
        dropAction: "edge-insert",
        dropZone: "right",
        dropDominantEdge: "right",
      }),
    );
    expect(source.paneBodyRenderMode).toBe("render-reservation");
  });

  it("preview empty mode: pickup origin reveals its content (no ghost)", (): void => {
    const source: DragPresentationMode = resolveDragPresentation(
      input({
        isPaneContentVisible: false,
        liveDragModeEnabled: false,
        leafId: "A",
        pickupOriginLeafId: "A",
        ghostSeatLeafId: "A",
        dropAction: "edge-insert",
        dropZone: "right",
      }),
    );
    expect(source.paneBodyRenderMode).toBe("render-content");
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
 * INVARIANT TESTS — the resolver is the single source consumed by EVERY surface,
 * so for a fixed `(content, action, phase)` the per-surface render-mode tuple
 * must be self-consistent. These pin the product rules across all three surfaces
 * at once (origin / ghost-seat / other), which the per-field assertions above
 * cannot.
 */
describe("presentation invariants — across all surfaces for one drag", (): void => {
  const ORIGIN = "A";
  const SEAT = "B";
  const OTHER = "C";

  function surfaces(
    args: Pick<
      DragPresentationInput,
      "isPaneContentVisible" | "liveDragModeEnabled" | "dragPhase" | "settlingOutcome" | "dropAction" | "dropZone"
    > & { ghostSeatLeafId: string },
  ): Record<"origin" | "seat" | "other", DynamicPaneBodyRenderMode> {
    const base = {
      isPaneContentVisible: args.isPaneContentVisible,
      liveDragModeEnabled: args.liveDragModeEnabled,
      dragPhase: args.dragPhase,
      settlingOutcome: args.settlingOutcome,
      pickupOriginLeafId: ORIGIN,
      ghostSeatLeafId: args.ghostSeatLeafId,
      dropAction: args.dropAction,
      dropZone: args.dropZone,
      dropDominantEdge: null,
    };
    return {
      origin: resolveDragPresentation({ ...base, leafId: ORIGIN }).paneBodyRenderMode,
      seat: resolveDragPresentation({ ...base, leafId: SEAT }).paneBodyRenderMode,
      other: resolveDragPresentation({ ...base, leafId: OTHER }).paneBodyRenderMode,
    };
  }

  it("I1 live swap: exactly one slot is a content-less reservation (the seat); the ghost is the only content painter", (): void => {
    const modes = surfaces({
      isPaneContentVisible: true,
      liveDragModeEnabled: true,
      dragPhase: "dragging",
      settlingOutcome: null,
      dropAction: "swap",
      dropZone: "center",
      ghostSeatLeafId: SEAT,
    });
    const reservations: number = Object.values(modes).filter(
      (mode: DynamicPaneBodyRenderMode): boolean => mode === "render-reservation",
    ).length;
    expect(reservations).toBe(1);
    expect(modes.seat).toBe("render-reservation");
    // No in-tree slot duplicates the ghost content: the seat is content-less,
    // origin (carrying the displaced content) and other paint normally.
    expect(modes.origin).toBe("render-content");
    expect(modes.other).toBe("render-content");
  });

  it("I2 empty live: the pickup-origin leaf NEVER paints dragged content", (): void => {
    // Swap (origin != seat): origin is gap-closed → placeholder.
    const swap = surfaces({
      isPaneContentVisible: false,
      liveDragModeEnabled: true,
      dragPhase: "dragging",
      settlingOutcome: null,
      dropAction: "swap",
      dropZone: "center",
      ghostSeatLeafId: SEAT,
    });
    expect(swap.origin).not.toBe("render-content");

    // Edge-insert (origin == seat): origin is the reservation → not content.
    const edge = surfaces({
      isPaneContentVisible: false,
      liveDragModeEnabled: true,
      dragPhase: "dragging",
      settlingOutcome: null,
      dropAction: "edge-insert",
      dropZone: "right",
      ghostSeatLeafId: ORIGIN,
    });
    expect(edge.origin).not.toBe("render-content");
    expect(edge.origin).toBe("render-reservation");
  });

  it("I1 holds through settling-commit (reservation persists, single content painter)", (): void => {
    const modes = surfaces({
      isPaneContentVisible: true,
      liveDragModeEnabled: true,
      dragPhase: "settling",
      settlingOutcome: "commit",
      dropAction: "swap",
      dropZone: "center",
      ghostSeatLeafId: SEAT,
    });
    expect(modes.seat).toBe("render-reservation");
    const reservations: number = Object.values(modes).filter(
      (mode: DynamicPaneBodyRenderMode): boolean => mode === "render-reservation",
    ).length;
    expect(reservations).toBe(1);
  });

  it("settling-cancel drops the reservation (layout restored, no content-less hole)", (): void => {
    const modes = surfaces({
      isPaneContentVisible: true,
      liveDragModeEnabled: true,
      dragPhase: "settling",
      settlingOutcome: "cancel",
      dropAction: "swap",
      dropZone: "center",
      ghostSeatLeafId: SEAT,
    });
    expect(Object.values(modes)).not.toContain("render-reservation");
  });
});
