/**
 * @jest-environment jsdom
 *
 * Overlay portal container: `TilingRendererProps.overlayPortalContainer`
 * redirects the `position: fixed` drag overlays (ghost + cursor badge) off
 * `document.body` into a consumer-supplied host so host theme tokens inherit.
 * jsdom geometry is stubbed (`getBoundingClientRect` + `ResizeObserver` + rAF
 * as `setTimeout(0)`) so a pointer-driven pickup can cross the 6px threshold
 * and actually mount the overlays.
 */
import { afterEach, beforeAll, describe, expect, it } from "@jest/globals";
import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { TilingRenderer } from "../react/tiling-renderer";
import type {
  TilingLayoutNode,
  TilingOverlayPortalContainer,
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

function renderRenderer(
  overlayPortalContainer?: TilingOverlayPortalContainer,
): HTMLElement {
  const { container } = render(
    React.createElement(TilingRenderer, {
      layout: LAYOUT,
      tiles: TILES,
      config: { gapPx: 8, minPaneSizePx: 100, handleSizePx: 6 },
      onLayoutChange: (): void => {},
      overlayPortalContainer,
      interaction: {
        dragRecovery: { enable: false },
        paneSwitching: { showTabStrip: false, showSwitcherOverlay: false },
      },
    }),
  );
  return container;
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

describe("TilingRenderer overlayPortalContainer", (): void => {
  it("mounts the drag ghost and cursor badge inside the supplied container", async (): Promise<void> => {
    const host: HTMLDivElement = document.createElement("div");
    host.setAttribute("data-overlay-host", "supplied");
    document.body.appendChild(host);
    const tree: HTMLElement = renderRenderer(host);
    await startLiveDrag(tree);
    expect(host.querySelector("[data-drag-ghost]")).not.toBeNull();
    expect(host.querySelector("[data-drag-cursor]")).not.toBeNull();
    expect(document.body.querySelector(":scope > [data-drag-ghost]")).toBeNull();
    host.remove();
  });

  it("falls back to document.body when overlayPortalContainer is absent", async (): Promise<void> => {
    const tree: HTMLElement = renderRenderer();
    await startLiveDrag(tree);
    const ghost: HTMLElement | null = document.body.querySelector(
      "[data-drag-ghost]",
    );
    const cursor: HTMLElement | null = document.body.querySelector(
      "[data-drag-cursor]",
    );
    expect(ghost).not.toBeNull();
    expect(cursor).not.toBeNull();
    expect(ghost?.parentElement).toBe(document.body);
    expect(cursor?.parentElement).toBe(document.body);
  });

  it("honours the function form (evaluated per render, including late-mounted hosts)", async (): Promise<void> => {
    const hostRef: { current: HTMLElement | null } = { current: null };

    function Harness(): React.ReactElement {
      const [host, setHost] = React.useState<HTMLElement | null>(null);
      hostRef.current = host;
      return React.createElement(
        React.Fragment,
        null,
        React.createElement("div", {
          "data-overlay-host": "thunk",
          ref: setHost,
        }),
        React.createElement(TilingRenderer, {
          layout: LAYOUT,
          tiles: TILES,
          config: { gapPx: 8, minPaneSizePx: 100, handleSizePx: 6 },
          onLayoutChange: (): void => {},
          overlayPortalContainer: (): HTMLElement | null => host,
          interaction: {
            dragRecovery: { enable: false },
            paneSwitching: { showTabStrip: false, showSwitcherOverlay: false },
          },
        }),
      );
    }

    const { container } = render(React.createElement(Harness));
    expect(hostRef.current).not.toBeNull();
    await startLiveDrag(container);
    const host: HTMLElement | null = hostRef.current;
    if (host == null) {
      throw new Error("expected the overlay host ref to resolve");
    }
    expect(host.querySelector("[data-drag-ghost]")).not.toBeNull();
    expect(host.querySelector("[data-drag-cursor]")).not.toBeNull();
    expect(document.body.querySelector(":scope > [data-drag-ghost]")).toBeNull();
  });
});
