import { describe, expect, it } from "@jest/globals";
import {
  resolvePaneBodyRenderMode,
  resolveSplitDividerRenderMode,
} from "../dynamic-tiling-renderer";

describe("pane body render policy", (): void => {
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

  it("reveals hop-in slot content in live drag when empty mode is on", (): void => {
    expect(
      resolvePaneBodyRenderMode({
        isPaneContentVisible: false,
        liveDragModeEnabled: true,
        dragPhase: "dragging",
        isDragSource: true,
        isReservedSlot: true,
      }),
    ).toBe("render-content");
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

describe("split divider render policy", (): void => {
  it("omits divider when boundary is not resizable", (): void => {
    expect(
      resolveSplitDividerRenderMode({
        isBoundaryResizable: false,
        resizeHandlesVisible: true,
        isResizeAxisEnabled: true,
      }),
    ).toBe("render-divider-absent");
  });

  it("keeps interactive divider when handles visibility toggle is off", (): void => {
    expect(
      resolveSplitDividerRenderMode({
        isBoundaryResizable: true,
        resizeHandlesVisible: false,
        isResizeAxisEnabled: true,
      }),
    ).toBe("render-divider-enabled-hidden");
  });

  it("renders disabled divider when visible but axis resize is disabled", (): void => {
    expect(
      resolveSplitDividerRenderMode({
        isBoundaryResizable: true,
        resizeHandlesVisible: true,
        isResizeAxisEnabled: false,
      }),
    ).toBe("render-divider-disabled-visible");
  });

  it("renders disabled divider hit-target with hidden chrome when handles are hidden and axis resize is disabled", (): void => {
    expect(
      resolveSplitDividerRenderMode({
        isBoundaryResizable: true,
        resizeHandlesVisible: false,
        isResizeAxisEnabled: false,
      }),
    ).toBe("render-divider-disabled-hidden");
  });

  it("renders interactive divider when visible and axis resize is enabled", (): void => {
    expect(
      resolveSplitDividerRenderMode({
        isBoundaryResizable: true,
        resizeHandlesVisible: true,
        isResizeAxisEnabled: true,
      }),
    ).toBe("render-divider-enabled-visible");
  });
});
