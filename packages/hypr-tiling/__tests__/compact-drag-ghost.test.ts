/**
 * @jest-environment jsdom
 *
 * Compact drag ghost + external-drop claim (26.9.x standalone subset of
 * `_agent/workspace-set-concept.md` §5.5). jsdom geometry is stubbed the
 * same way as `overlay-portal-container.test.ts` so a pointer-driven pickup
 * crosses the 6px threshold and mounts the overlays.
 */
import { afterEach, beforeAll, describe, expect, it, jest } from "@jest/globals";
import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { TilingRenderer } from "../react/tiling-renderer";
import { resolveTilingTheme, type TilingTheme } from "../react/theme";
import type {
  TilingDragGhostMode,
  TilingExternalDragHover,
  TilingGhostChipContext,
  TilingLayoutNode,
  TilingOnExternalDrop,
  TilingTile,
} from "../engine/types";

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

const HOVER: TilingExternalDragHover = {
  targetId: "ws:ops",
  point: { x: 320, y: 24 },
};

const PANE_RECT: DOMRect = {
  x: 10,
  y: 10,
  left: 10,
  top: 10,
  right: 210,
  bottom: 160,
  width: 200,
  height: 150,
  toJSON: (): Record<string, number> => ({}),
};

beforeAll((): void => {
  const globalScope = globalThis as unknown as {
    ResizeObserver?: unknown;
    PointerEvent?: typeof PointerEvent;
  };
  if (typeof globalScope.ResizeObserver === "undefined") {
    class StubResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    globalScope.ResizeObserver = StubResizeObserver;
  }
  if (typeof globalScope.PointerEvent === "undefined") {
    class StubPointerEvent extends MouseEvent {
      readonly pointerId: number;
      readonly pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
        this.pointerType = init.pointerType ?? "mouse";
      }
    }
    globalScope.PointerEvent = StubPointerEvent as unknown as typeof PointerEvent;
  }
  if (typeof window.requestAnimationFrame !== "function") {
    window.requestAnimationFrame = (callback: FrameRequestCallback): number =>
      window.setTimeout((): void => callback(Date.now()), 0) as unknown as number;
    window.cancelAnimationFrame = (handle: number): void =>
      window.clearTimeout(handle);
  }
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect(): DOMRect {
    return PANE_RECT;
  };
});

afterEach((): void => {
  cleanup();
});

interface HarnessProps {
  dragGhostMode?: TilingDragGhostMode;
  externalDragHover?: TilingExternalDragHover | null;
  onExternalDrop?: TilingOnExternalDrop;
  theme?: TilingTheme;
}

function Harness(props: HarnessProps): React.ReactElement {
  return React.createElement(TilingRenderer, {
    layout: LAYOUT,
    tiles: TILES,
    config: { gapPx: 8, minPaneSizePx: 100, handleSizePx: 6 },
    onLayoutChange: (): void => {},
    interaction: {
      dragRecovery: { enable: false },
      paneSwitching: { showTabStrip: false, showSwitcherOverlay: false },
    },
    ...props,
  });
}

async function flushFrames(): Promise<void> {
  await act(async (): Promise<void> => {
    await new Promise<void>((resolve: (value: void) => void): void => {
      window.requestAnimationFrame((): void => {
        window.requestAnimationFrame((): void => {
          resolve();
        });
      });
    });
  });
}

function dispatchPointer(
  target: EventTarget,
  type: string,
  init: PointerEventInit,
): void {
  const event: PointerEvent = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: "mouse",
    button: 0,
    buttons: type === "pointerup" ? 0 : 1,
    ...init,
  });
  target.dispatchEvent(event);
}

async function startLiveDrag(tree: HTMLElement): Promise<void> {
  const header: HTMLElement | null = tree.querySelector(
    "article[data-leaf-id] header",
  );
  if (header == null) {
    throw new Error(
      `expected a default-tile header; tree=${tree.innerHTML.slice(0, 400)}`,
    );
  }
  await act(async (): Promise<void> => {
    dispatchPointer(header, "pointerdown", { clientX: 20, clientY: 20 });
  });
  await flushFrames();
  await act(async (): Promise<void> => {
    dispatchPointer(window, "pointermove", { clientX: 40, clientY: 40 });
  });
  await flushFrames();
}

async function releaseDrag(): Promise<void> {
  await act(async (): Promise<void> => {
    dispatchPointer(window, "pointerup", { clientX: 80, clientY: 90 });
  });
  await flushFrames();
}

describe("TilingRenderer compact drag ghost", (): void => {
  it("auto mode paints footprint until external hover is set, then compact, then footprint again", async (): Promise<void> => {
    const view = render(React.createElement(Harness, { dragGhostMode: "auto" }));
    await startLiveDrag(view.container);
    const footprintGhost: HTMLElement | null = document.querySelector(
      "[data-drag-ghost][data-drag-ghost-mode='footprint']",
    );
    expect(footprintGhost).not.toBeNull();
    const hiddenChip: HTMLElement | null = document.querySelector(
      "[data-drag-ghost-chip][data-drag-ghost-mode='footprint']",
    );
    expect(hiddenChip).not.toBeNull();
    expect(hiddenChip?.style.opacity).toBe("0");

    view.rerender(
      React.createElement(Harness, {
        dragGhostMode: "auto",
        externalDragHover: HOVER,
      }),
    );
    await flushFrames();
    const compactGhost: HTMLElement | null = document.querySelector(
      "[data-drag-ghost][data-drag-ghost-mode='compact']",
    );
    const compactChip: HTMLElement | null = document.querySelector(
      "[data-drag-ghost-chip][data-drag-ghost-mode='compact']",
    );
    expect(compactGhost).not.toBeNull();
    expect(compactChip).not.toBeNull();
    expect(compactChip?.style.opacity).toBe("1");
    expect(compactChip?.getAttribute("data-drag-ghost-target")).toBe("ws:ops");

    view.rerender(
      React.createElement(Harness, {
        dragGhostMode: "auto",
        externalDragHover: null,
      }),
    );
    await flushFrames();
    expect(
      document.querySelector(
        "[data-drag-ghost][data-drag-ghost-mode='footprint']",
      ),
    ).not.toBeNull();
    const restoredChip: HTMLElement | null = document.querySelector(
      "[data-drag-ghost-chip][data-drag-ghost-mode='footprint']",
    );
    expect(restoredChip?.style.opacity).toBe("0");
  });

  it("compact mode is always compact, even with no external hover", async (): Promise<void> => {
    const { container } = render(
      React.createElement(Harness, { dragGhostMode: "compact" }),
    );
    await startLiveDrag(container);
    const chip: HTMLElement | null = document.querySelector(
      "[data-drag-ghost-chip][data-drag-ghost-mode='compact']",
    );
    expect(chip).not.toBeNull();
    expect(chip?.style.opacity).toBe("1");
    expect(
      document.querySelector(
        "[data-drag-ghost][data-drag-ghost-mode='compact']",
      ),
    ).not.toBeNull();
  });

  it("renders the theme ghostChip slot with point and targetId", async (): Promise<void> => {
    const theme: TilingTheme = {
      ...resolveTilingTheme("neon-terminal"),
      ghostChip: (ctx: TilingGhostChipContext): React.ReactNode =>
        React.createElement(
          "div",
          {
            "data-testid": "host-chip",
            "data-leaf": ctx.leafId,
            "data-title": ctx.title ?? "",
            "data-point-x": String(ctx.point.x),
            "data-point-y": String(ctx.point.y),
            "data-target": ctx.targetId ?? "",
          },
          ctx.title,
        ),
    };
    const { container } = render(
      React.createElement(Harness, {
        dragGhostMode: "auto",
        externalDragHover: HOVER,
        theme,
      }),
    );
    await startLiveDrag(container);
    const hostChip: HTMLElement | null = document.querySelector(
      "[data-testid='host-chip']",
    );
    expect(hostChip).not.toBeNull();
    expect(hostChip?.getAttribute("data-leaf")).toBe("left");
    expect(hostChip?.getAttribute("data-title")).toBe("alpha");
    expect(hostChip?.getAttribute("data-point-x")).toBe("320");
    expect(hostChip?.getAttribute("data-point-y")).toBe("24");
    expect(hostChip?.getAttribute("data-target")).toBe("ws:ops");
  });

  it("release with hover set calls onExternalDrop once and renders no cancel overlay", async (): Promise<void> => {
    const onExternalDrop: jest.Mock<TilingOnExternalDrop> = jest.fn();
    const { container } = render(
      React.createElement(Harness, {
        dragGhostMode: "auto",
        externalDragHover: HOVER,
        onExternalDrop,
      }),
    );
    await startLiveDrag(container);
    await releaseDrag();
    expect(onExternalDrop).toHaveBeenCalledTimes(1);
    expect(onExternalDrop).toHaveBeenCalledWith("left", "ws:ops", {
      x: 320,
      y: 24,
    });
    expect(document.querySelector("[data-drag-cancel]")).toBeNull();
  });

  it("release without hover does not call onExternalDrop and still paints the cancel overlay", async (): Promise<void> => {
    const onExternalDrop: jest.Mock<TilingOnExternalDrop> = jest.fn();
    const { container } = render(
      React.createElement(Harness, {
        dragGhostMode: "auto",
        onExternalDrop,
      }),
    );
    await startLiveDrag(container);
    await releaseDrag();
    expect(onExternalDrop).not.toHaveBeenCalled();
    expect(document.querySelector("[data-drag-cancel]")).not.toBeNull();
  });

  it("reduced-motion path uses an instant (transition: none) compact swap", async (): Promise<void> => {
    const originalMatchMedia: typeof window.matchMedia | undefined =
      window.matchMedia;
    window.matchMedia = (query: string): MediaQueryList => {
      const matches: boolean =
        query.includes("prefers-reduced-motion") && query.includes("reduce");
      return {
        matches,
        media: query,
        onchange: null,
        addEventListener: (): void => {},
        removeEventListener: (): void => {},
        addListener: (): void => {},
        removeListener: (): void => {},
        dispatchEvent: (): boolean => false,
      } as MediaQueryList;
    };
    try {
      const { container } = render(
        React.createElement(Harness, {
          dragGhostMode: "compact",
          externalDragHover: HOVER,
        }),
      );
      await startLiveDrag(container);
      await flushFrames();
      const chip: HTMLElement | null = document.querySelector(
        "[data-drag-ghost-chip][data-drag-ghost-mode='compact']",
      );
      expect(chip).not.toBeNull();
      expect(chip?.style.transition).toBe("none");
      const wrapper: HTMLElement | null = document.querySelector(
        "[data-drag-ghost-wrapper]",
      );
      expect(wrapper?.style.transition).toBe("none");
    } finally {
      if (originalMatchMedia != null) {
        window.matchMedia = originalMatchMedia;
      }
    }
  });
});
