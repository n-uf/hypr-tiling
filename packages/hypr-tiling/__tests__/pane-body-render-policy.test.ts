import { describe, expect, it } from "@jest/globals";
import { resolveSplitDividerRenderMode } from "../react/dynamic-tiling-renderer";

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
