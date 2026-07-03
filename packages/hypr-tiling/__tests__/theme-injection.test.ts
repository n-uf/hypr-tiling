/**
 * @jest-environment jsdom
 *
 * Consumer theme injection: the `theme` prop on `TilingRenderer` accepts a FULL
 * consumer-authored `TilingTheme` (open id via `TilingThemeId | (string & {})`)
 * and takes precedence over the built-in `themeId` selection. These tests
 * characterize the resolution precedence and that custom theme tokens actually
 * reach the renderer-OWNED surfaces (root container, viewport, split divider,
 * default-tile pane shell) — the surfaces a consumer cannot repaint through
 * `renderTile`.
 *
 * jsdom note: geometry (`ResizeObserver` / `getBoundingClientRect`) is inert
 * here, but class-token application on the mounted tree is geometry-free.
 */
import { afterEach, beforeAll, describe, expect, it } from "@jest/globals";
import * as React from "react";
import { cleanup, render } from "@testing-library/react";
import { TilingRenderer } from "../react/tiling-renderer";
import { TILING_THEME_REGISTRY, resolveTilingTheme } from "../react/theme";
import type { TilingTheme } from "../react/theme";
import type {
  TilingLayoutNode,
  TilingTile,
} from "../engine/types";

beforeAll((): void => {
  const globalScope = globalThis as unknown as {
    ResizeObserver?: unknown;
  };
  if (typeof globalScope.ResizeObserver === "undefined") {
    class StubResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    globalScope.ResizeObserver = StubResizeObserver;
  }
  if (typeof window.requestAnimationFrame !== "function") {
    window.requestAnimationFrame = (callback: FrameRequestCallback): number =>
      window.setTimeout((): void => callback(Date.now()), 0) as unknown as number;
    window.cancelAnimationFrame = (handle: number): void =>
      window.clearTimeout(handle);
  }
});

afterEach((): void => {
  cleanup();
});

// A consumer-authored theme: a custom (non-built-in) id plus sentinel classes
// on renderer-owned surfaces, layered over a built-in for the tokens this test
// does not exercise. The sentinels are unique strings no built-in theme emits.
const CUSTOM_THEME: TilingTheme = {
  ...TILING_THEME_REGISTRY["clean-flat"],
  id: "consumer-brand",
  label: "consumer brand",
  root: {
    container: "custom-root-token flex h-full w-full flex-col",
    viewport: "custom-viewport-token relative min-h-0 flex-1",
  },
  paneShell: {
    ...TILING_THEME_REGISTRY["clean-flat"].paneShell,
    surface: "custom-pane-shell-token relative flex h-full w-full flex-col",
  },
  divider: {
    ...TILING_THEME_REGISTRY["clean-flat"].divider,
    base: "custom-divider-token shrink-0",
  },
};

const TILES: ReadonlyArray<TilingTile> = [
  { id: "a", title: "alpha", accent: "amber" },
  { id: "b", title: "beta", accent: "cyan" },
];

const LAYOUT: TilingLayoutNode = {
  kind: "split",
  id: "root",
  axis: "horizontal",
  ratio: 0.5,
  first: { kind: "leaf", id: "left", tileId: "a" },
  second: { kind: "leaf", id: "right", tileId: "b" },
};

function renderWith(props: {
  theme?: TilingTheme;
  themeId?: "neon-terminal" | "clean-flat" | "mosaic";
}): HTMLElement {
  const { container } = render(
    React.createElement(TilingRenderer, {
      layout: LAYOUT,
      tiles: TILES,
      config: { gapPx: 8, minPaneSizePx: 100, handleSizePx: 6 },
      onLayoutChange: (): void => {},
      theme: props.theme,
      themeId: props.themeId,
    }),
  );
  return container;
}

describe("TilingRenderer `theme` prop (consumer theme injection)", (): void => {
  it("the `theme` prop takes precedence over `themeId`", (): void => {
    const container: HTMLElement = renderWith({
      theme: CUSTOM_THEME,
      themeId: "mosaic",
    });
    const root: HTMLElement = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("custom-root-token");
    // No token of the losing built-in theme leaks onto the root ("bg-transparent"
    // is mosaic-specific among the classes involved here).
    expect(resolveTilingTheme("mosaic").root.container).toContain("bg-transparent");
    expect(root.className).not.toContain("bg-transparent");
  });

  it("custom theme tokens reach the renderer-owned surfaces (root, viewport, divider, default-tile shell)", (): void => {
    const container: HTMLElement = renderWith({ theme: CUSTOM_THEME });
    expect(
      (container.firstElementChild as HTMLElement).className,
    ).toContain("custom-root-token");
    expect(container.querySelector(".custom-viewport-token")).not.toBeNull();
    const divider: HTMLElement | null = container.querySelector(
      '[role="separator"]',
    );
    expect(divider).not.toBeNull();
    expect((divider as HTMLElement).className).toContain("custom-divider-token");
    // The default tile paints its article shell from the injected theme.
    const paneShell: HTMLElement | null = container.querySelector(
      '[data-leaf-id="left"]',
    );
    expect(paneShell).not.toBeNull();
    expect((paneShell as HTMLElement).className).toContain(
      "custom-pane-shell-token",
    );
  });

  it("without a `theme` prop, `themeId` still resolves the built-in registry", (): void => {
    const container: HTMLElement = renderWith({ themeId: "clean-flat" });
    const root: HTMLElement = container.firstElementChild as HTMLElement;
    expect(root.className).not.toContain("custom-root-token");
    // Spot-check a clean-flat root token (first class of the container group).
    expect(root.className).toContain(
      resolveTilingTheme("clean-flat").root.container.split(" ")[0],
    );
  });
});
