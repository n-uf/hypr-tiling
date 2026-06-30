import { describe, expect, it } from "@jest/globals";
import {
  isDragPresentationActive,
  resolveDragPresentation,
  resolveInitialPaneContentVisible,
  resolvePaneBodyRenderMode,
  type DragPresentationInput,
  type DragPresentationMode,
} from "../drag-presentation";
import type { DynamicPaneBodyRenderMode } from "../types";

/**
 * Build a fully-typed presentation input with inert defaults; tests override
 * only the load-bearing fields. NOTE: the resolver is content-agnostic — there
 * is no `isPaneContentVisible` input — so content state cannot appear here.
 */
function input(overrides: Partial<DragPresentationInput>): DragPresentationInput {
  return {
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

describe("drag presentation resolver — content-agnostic drag mechanics", (): void => {
  it("keeps presentation active through settling commit, not cancel", (): void => {
    expect(isDragPresentationActive("dragging", null)).toBe(true);
    expect(isDragPresentationActive("settling", "commit")).toBe(true);
    expect(isDragPresentationActive("settling", "cancel")).toBe(false);
    expect(isDragPresentationActive("idle", null)).toBe(false);
  });

  it("ghost-seat leaf is the reservation; pickup-origin is not", (): void => {
    const seat: DragPresentationMode = resolveDragPresentation(
      input({
        leafId: "B",
        pickupOriginLeafId: "A",
        ghostSeatLeafId: "B",
        dropAction: "swap",
        dropZone: "center",
      }),
    );
    expect(seat.isGhostSeatReservation).toBe(true);
    expect(seat.isGhostSeatLeaf).toBe(true);
    expect(seat.isPickupOriginLeaf).toBe(false);

    const origin: DragPresentationMode = resolveDragPresentation(
      input({
        leafId: "A",
        pickupOriginLeafId: "A",
        ghostSeatLeafId: "B",
        dropAction: "swap",
        dropZone: "center",
      }),
    );
    expect(origin.isGhostSeatReservation).toBe(false);
    expect(origin.isPickupOriginLeaf).toBe(true);
    expect(origin.isGhostSeatLeaf).toBe(false);
  });

  it("edge-insert: pickup origin IS the ghost seat → reservation", (): void => {
    const source: DragPresentationMode = resolveDragPresentation(
      input({
        leafId: "A",
        pickupOriginLeafId: "A",
        ghostSeatLeafId: "A",
        dropAction: "edge-insert",
        dropZone: "right",
        dropDominantEdge: "right",
      }),
    );
    expect(source.isGhostSeatReservation).toBe(true);
  });

  it("keeps the hop-in reservation through settling commit", (): void => {
    expect(
      resolveDragPresentation(
        input({
          dragPhase: "settling",
          settlingOutcome: "commit",
          leafId: "B",
          pickupOriginLeafId: "A",
          ghostSeatLeafId: "B",
          dropAction: "swap",
          dropZone: "center",
        }),
      ).isGhostSeatReservation,
    ).toBe(true);
  });

  it("preview mode (no ghost) never produces a reservation", (): void => {
    const source: DragPresentationMode = resolveDragPresentation(
      input({
        liveDragModeEnabled: false,
        leafId: "A",
        pickupOriginLeafId: "A",
        ghostSeatLeafId: "A",
        dropAction: "edge-insert",
        dropZone: "right",
      }),
    );
    expect(source.isGhostSeatReservation).toBe(false);
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
 * (a) Drag presentation is IDENTICAL for CONTENT on vs off.
 *
 * The resolver has no content input, so its output is trivially content-agnostic
 * — but we pin it explicitly across every surface so a future regression that
 * reintroduces content-conditioned drag presentation fails here. The render-mode
 * delta between content-on and content-off is produced SOLELY by the uniform
 * `resolvePaneBodyRenderMode` rule (below), never by the drag resolver.
 */
describe("(a) drag presentation is identical regardless of CONTENT state", (): void => {
  const ORIGIN = "A";
  const SEAT = "B";
  const OTHER = "C";

  function presentationTuple(
    leafId: string,
  ): Pick<DragPresentationMode, "isGhostSeatReservation" | "isPickupOriginLeaf" | "isGhostSeatLeaf"> {
    const { isGhostSeatReservation, isPickupOriginLeaf, isGhostSeatLeaf } = resolveDragPresentation(
      input({
        leafId,
        pickupOriginLeafId: ORIGIN,
        ghostSeatLeafId: SEAT,
        dropAction: "swap",
        dropZone: "center",
      }),
    );
    return { isGhostSeatReservation, isPickupOriginLeaf, isGhostSeatLeaf };
  }

  it("each surface's drag-mechanic tuple is fixed (content is not an input)", (): void => {
    expect(presentationTuple(ORIGIN)).toEqual({
      isGhostSeatReservation: false,
      isPickupOriginLeaf: true,
      isGhostSeatLeaf: false,
    });
    expect(presentationTuple(SEAT)).toEqual({
      isGhostSeatReservation: true,
      isPickupOriginLeaf: false,
      isGhostSeatLeaf: true,
    });
    expect(presentationTuple(OTHER)).toEqual({
      isGhostSeatReservation: false,
      isPickupOriginLeaf: false,
      isGhostSeatLeaf: false,
    });
  });
});

/**
 * (b) The uniform pane-body CONTENT rule, applied identically to EVERY
 * representation of a pane (in-tree pane, source slot, hop-in slot, AND the
 * portaled ghost). Content presence is the ONLY delta between CONTENT on / off,
 * and a ghost-seat reservation stays content-less regardless of the toggle.
 */
describe("(b)/(c) uniform pane-body content rule", (): void => {
  it("ghost-seat reservation is a content-less seat regardless of CONTENT (no double-paint)", (): void => {
    expect(resolvePaneBodyRenderMode(true, true)).toBe("render-reservation");
    expect(resolvePaneBodyRenderMode(true, false)).toBe("render-reservation");
  });

  it("a non-reservation pane (incl. the ghost) honors the CONTENT toggle", (): void => {
    // CONTENT on → paints content; CONTENT off → empty body (frame/header kept).
    expect(resolvePaneBodyRenderMode(false, true)).toBe("render-content");
    expect(resolvePaneBodyRenderMode(false, false)).toBe("render-empty");
  });

  it("the ghost (single instance, never a seat) paints content iff CONTENT is on", (): void => {
    // The ghost calls resolvePaneBodyRenderMode(false, isPaneContentVisible) —
    // the SAME rule as an in-tree pane body, no drag-specific branch.
    expect(resolvePaneBodyRenderMode(false, true)).toBe("render-content");
    expect(resolvePaneBodyRenderMode(false, false)).toBe("render-empty");
  });
});

/**
 * (c) Single-instance / no-double-paint invariant, expressed at the resolver +
 * uniform-rule layer: across all surfaces of one live drag, EXACTLY ONE slot is
 * the content-less ghost-seat reservation (the seat the single ghost hops into),
 * and this holds for CONTENT on and off identically.
 */
describe("(c) single painted instance — exactly one ghost-seat reservation", (): void => {
  const ORIGIN = "A";
  const SEAT = "B";
  const OTHER = "C";

  function bodyModes(
    args: Pick<
      DragPresentationInput,
      "liveDragModeEnabled" | "dragPhase" | "settlingOutcome" | "dropAction" | "dropZone"
    > & { ghostSeatLeafId: string; isPaneContentVisible: boolean },
  ): Record<"origin" | "seat" | "other", DynamicPaneBodyRenderMode> {
    const base = {
      liveDragModeEnabled: args.liveDragModeEnabled,
      dragPhase: args.dragPhase,
      settlingOutcome: args.settlingOutcome,
      pickupOriginLeafId: ORIGIN,
      ghostSeatLeafId: args.ghostSeatLeafId,
      dropAction: args.dropAction,
      dropZone: args.dropZone,
      dropDominantEdge: null,
    };
    const mode = (leafId: string): DynamicPaneBodyRenderMode =>
      resolvePaneBodyRenderMode(
        resolveDragPresentation({ ...base, leafId }).isGhostSeatReservation,
        args.isPaneContentVisible,
      );
    return { origin: mode(ORIGIN), seat: mode(SEAT), other: mode(OTHER) };
  }

  function reservationCount(modes: Record<string, DynamicPaneBodyRenderMode>): number {
    return Object.values(modes).filter(
      (mode: DynamicPaneBodyRenderMode): boolean => mode === "render-reservation",
    ).length;
  }

  it("live swap, CONTENT on: exactly one reservation (the seat); origin/other paint content", (): void => {
    const modes = bodyModes({
      isPaneContentVisible: true,
      liveDragModeEnabled: true,
      dragPhase: "dragging",
      settlingOutcome: null,
      dropAction: "swap",
      dropZone: "center",
      ghostSeatLeafId: SEAT,
    });
    expect(reservationCount(modes)).toBe(1);
    expect(modes.seat).toBe("render-reservation");
    expect(modes.origin).toBe("render-content");
    expect(modes.other).toBe("render-content");
  });

  it("live swap, CONTENT off: SAME single reservation; origin/other are empty bodies (not content)", (): void => {
    const modes = bodyModes({
      isPaneContentVisible: false,
      liveDragModeEnabled: true,
      dragPhase: "dragging",
      settlingOutcome: null,
      dropAction: "swap",
      dropZone: "center",
      ghostSeatLeafId: SEAT,
    });
    expect(reservationCount(modes)).toBe(1);
    expect(modes.seat).toBe("render-reservation");
    // Content presence is the ONLY delta vs CONTENT-on: the reservation is
    // identical; the other slots are empty bodies rather than content.
    expect(modes.origin).toBe("render-empty");
    expect(modes.other).toBe("render-empty");
  });

  it("holds through settling-commit (reservation persists; single content-less seat)", (): void => {
    const modes = bodyModes({
      isPaneContentVisible: true,
      liveDragModeEnabled: true,
      dragPhase: "settling",
      settlingOutcome: "commit",
      dropAction: "swap",
      dropZone: "center",
      ghostSeatLeafId: SEAT,
    });
    expect(modes.seat).toBe("render-reservation");
    expect(reservationCount(modes)).toBe(1);
  });

  it("settling-cancel drops the reservation (layout restored, no content-less hole)", (): void => {
    const modes = bodyModes({
      isPaneContentVisible: true,
      liveDragModeEnabled: true,
      dragPhase: "settling",
      settlingOutcome: "cancel",
      dropAction: "swap",
      dropZone: "center",
      ghostSeatLeafId: SEAT,
    });
    expect(reservationCount(modes)).toBe(0);
  });
});

/**
 * (d) Default content visibility derived from the content toggle — the
 * single-source-of-truth default that makes the drag ghost match the seated body
 * for embeddings that suppress the toggle (e.g. the docs/SEO homepage).
 */
describe("(d) initial pane-content visibility from showContentToggle", (): void => {
  it("toggle shown ⇒ content default off (legacy: empty until flipped)", (): void => {
    expect(resolveInitialPaneContentVisible(true)).toBe(false);
  });

  it("toggle suppressed ⇒ content default on (embedding owns content)", (): void => {
    expect(resolveInitialPaneContentVisible(false)).toBe(true);
  });

  it("showContentToggle:false ⇒ ghost AND seated body resolve render-content; reservation stays empty", (): void => {
    // The homepage embedding: `paneSwitching.showContentToggle: false` pins the
    // initial content-visible flag true via the single source of truth, so the
    // SAME flag drives every surface.
    const contentVisible: boolean = resolveInitialPaneContentVisible(false);
    expect(contentVisible).toBe(true);

    const ORIGIN = "A";
    const SEAT = "B";
    const base = {
      liveDragModeEnabled: true,
      dragPhase: "dragging" as const,
      settlingOutcome: null,
      pickupOriginLeafId: ORIGIN,
      ghostSeatLeafId: SEAT,
      dropAction: "swap" as const,
      dropZone: "center" as const,
      dropDominantEdge: null,
    };
    const seatPresentation = resolveDragPresentation({ ...base, leafId: SEAT });
    const originPresentation = resolveDragPresentation({ ...base, leafId: ORIGIN });

    // The ghost-seat reservation slot stays empty (a drag mechanic, independent
    // of the content flag).
    expect(
      resolvePaneBodyRenderMode(
        seatPresentation.isGhostSeatReservation,
        contentVisible,
      ),
    ).toBe("render-reservation");

    // The seated origin pane AND the ghost (never a reservation) paint content,
    // so the ghost body matches the in-tree body — no empty-bodied ghost.
    expect(
      resolvePaneBodyRenderMode(
        originPresentation.isGhostSeatReservation,
        contentVisible,
      ),
    ).toBe("render-content");
    // The ghost calls resolvePaneBodyRenderMode(false, contentVisible).
    expect(resolvePaneBodyRenderMode(false, contentVisible)).toBe(
      "render-content",
    );
  });
});
