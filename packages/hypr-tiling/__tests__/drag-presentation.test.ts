import { describe, expect, it } from "@jest/globals";
import {
  isDragPresentationActive,
  resolveDragPresentation,
  resolvePaneBodyRenderMode,
} from "../drag-presentation";

describe("drag presentation resolver", (): void => {
  it("shows ghost only while dragging phase is active", (): void => {
    expect(
      resolveDragPresentation({
        isPaneContentVisible: false,
        liveDragModeEnabled: true,
        dragPhase: "dragging",
        settlingOutcome: null,
        leafId: "B",
        pickupOriginLeafId: "A",
        ghostSeatLeafId: "B",
        dropAction: "swap",
        dropZone: "center",
      }).showGhost,
    ).toBe(true);
    expect(
      resolveDragPresentation({
        isPaneContentVisible: false,
        liveDragModeEnabled: true,
        dragPhase: "settling",
        settlingOutcome: "commit",
        leafId: "B",
        pickupOriginLeafId: "A",
        ghostSeatLeafId: "B",
        dropAction: "swap",
        dropZone: "center",
      }).showGhost,
    ).toBe(false);
  });

  it("keeps hop-in reservation active through settling commit", (): void => {
    expect(isDragPresentationActive("settling", "commit")).toBe(true);
    expect(isDragPresentationActive("settling", "cancel")).toBe(false);
    expect(
      resolveDragPresentation({
        isPaneContentVisible: false,
        liveDragModeEnabled: true,
        dragPhase: "settling",
        settlingOutcome: "commit",
        leafId: "B",
        pickupOriginLeafId: "A",
        ghostSeatLeafId: "B",
        dropAction: "swap",
        dropZone: "center",
      }).paneBodyRenderMode,
    ).toBe("render-reservation");
  });

  it("empty live swap: pickup origin placeholder, ghost-seat reservation", (): void => {
    const sourcePresentation = resolveDragPresentation({
      isPaneContentVisible: false,
      liveDragModeEnabled: true,
      dragPhase: "dragging",
      settlingOutcome: null,
      leafId: "A",
      pickupOriginLeafId: "A",
      ghostSeatLeafId: "B",
      dropAction: "swap",
      dropZone: "center",
    });
    expect(sourcePresentation.paneBodyRenderMode).toBe("render-placeholder");
    expect(sourcePresentation.suppressSourceContentInEmptyMode).toBe(true);
    expect(sourcePresentation.isPickupOriginLeaf).toBe(true);
    expect(sourcePresentation.isGhostSeatLeaf).toBe(false);

    const targetPresentation = resolveDragPresentation({
      isPaneContentVisible: false,
      liveDragModeEnabled: true,
      dragPhase: "dragging",
      settlingOutcome: null,
      leafId: "B",
      pickupOriginLeafId: "A",
      ghostSeatLeafId: "B",
      dropAction: "swap",
      dropZone: "center",
    });
    expect(targetPresentation.paneBodyRenderMode).toBe("render-reservation");
    expect(targetPresentation.showInTreeHopIn).toBe(true);
    expect(targetPresentation.hopInLeafId).toBe("B");
  });

  it("empty live edge-insert: pickup origin is ghost seat → reservation not content", (): void => {
    const sourcePresentation = resolveDragPresentation({
      isPaneContentVisible: false,
      liveDragModeEnabled: true,
      dragPhase: "dragging",
      settlingOutcome: null,
      leafId: "A",
      pickupOriginLeafId: "A",
      ghostSeatLeafId: "A",
      dropAction: "edge-insert",
      dropZone: "right",
    });
    expect(sourcePresentation.paneBodyRenderMode).toBe("render-reservation");
    expect(sourcePresentation.suppressSourceContentInEmptyMode).toBe(true);
  });

  it("flags edge-insert chrome preference and action/zone mismatch", (): void => {
    expect(
      resolveDragPresentation({
        isPaneContentVisible: true,
        liveDragModeEnabled: true,
        dragPhase: "dragging",
        settlingOutcome: null,
        leafId: "B",
        pickupOriginLeafId: "A",
        ghostSeatLeafId: "B",
        dropAction: "edge-insert",
        dropZone: "left",
      }).preferEdgeInsertChrome,
    ).toBe(true);
    expect(
      resolveDragPresentation({
        isPaneContentVisible: true,
        liveDragModeEnabled: true,
        dragPhase: "dragging",
        settlingOutcome: null,
        leafId: "B",
        pickupOriginLeafId: "A",
        ghostSeatLeafId: "B",
        dropAction: "swap",
        dropZone: "left",
      }).isActionZoneMismatch,
    ).toBe(true);
  });
});

describe("pane body render policy (via drag presentation)", (): void => {
  it("renders content when global visibility is enabled", (): void => {
    expect(
      resolvePaneBodyRenderMode({
        isPaneContentVisible: true,
        liveDragModeEnabled: false,
        dragPhase: "idle",
        isDragSource: false,
        isReservedSlot: false,
      }),
    ).toBe("render-content");
  });

  it("renders placeholder when global visibility is disabled and pane is not drag source", (): void => {
    expect(
      resolvePaneBodyRenderMode({
        isPaneContentVisible: false,
        liveDragModeEnabled: false,
        dragPhase: "idle",
        isDragSource: false,
        isReservedSlot: false,
      }),
    ).toBe("render-placeholder");
  });

  it("reveals drag source content in preview drag mode when hidden", (): void => {
    expect(
      resolvePaneBodyRenderMode({
        isPaneContentVisible: false,
        liveDragModeEnabled: false,
        dragPhase: "dragging",
        isDragSource: true,
        isReservedSlot: true,
      }),
    ).toBe("render-content");
  });

  it("renders reservation for live drag ghost-seat in empty mode (never in-tree content)", (): void => {
    expect(
      resolvePaneBodyRenderMode({
        isPaneContentVisible: false,
        liveDragModeEnabled: true,
        dragPhase: "dragging",
        isDragSource: true,
        isReservedSlot: true,
      }),
    ).toBe("render-reservation");
  });

  it("renders placeholder for live drag pickup origin in empty mode when not ghost seat", (): void => {
    expect(
      resolvePaneBodyRenderMode({
        isPaneContentVisible: false,
        liveDragModeEnabled: true,
        dragPhase: "dragging",
        leafId: "A",
        pickupOriginLeafId: "A",
        isDragSource: false,
        isReservedSlot: false,
      }),
    ).toBe("render-placeholder");
  });

  it("renders reservation for live drag source slot while dragging when content is visible", (): void => {
    expect(
      resolvePaneBodyRenderMode({
        isPaneContentVisible: true,
        liveDragModeEnabled: true,
        dragPhase: "dragging",
        isDragSource: true,
        isReservedSlot: true,
      }),
    ).toBe("render-reservation");
  });
});
