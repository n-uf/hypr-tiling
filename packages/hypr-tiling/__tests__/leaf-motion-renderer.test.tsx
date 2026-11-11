/**
 * @jest-environment jsdom
 *
 * Leaf motion in the renderer: every committed layout change hands each
 * window's LAYOUT rect to the leaf motion, which draws it from where it was
 * (translate + a frame layer at the drawn size + a content clip, never a
 * scale) before the browser paints, glides it on the shared frame loop, and
 * clears everything once it rests.
 *
 * jsdom has no layout, so the offset geometry the renderer reads
 * (`offsetParent` / `offsetLeft` / `offsetWidth` …) is stubbed: every leaf
 * wrapper (`[data-hpt-leaf]`, keyed by tile id) reports the rect the test puts
 * in `GEOMETRY`; every other element sits at 0,0 in a 1000×600 box.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "@jest/globals";
import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { TilingRenderer } from "../react/tiling-renderer";
import { swapLeafTiles } from "../engine/state";
import type { TilingLayoutNode, TilingLeafNode, TilingTile } from "../engine/types";

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const GEOMETRY: Map<string, Box> = new Map<string, Box>();

function boxOf(element: HTMLElement): Box | null {
  const id: string | null = element.getAttribute("data-hpt-leaf");
  return id == null ? null : (GEOMETRY.get(id) ?? null);
}

/** A leaf's content fills its wrapper: it takes the enclosing leaf's size. */
function sizeOf(element: HTMLElement): Box | null {
  const leafElement: HTMLElement | null = element.closest<HTMLElement>("[data-hpt-leaf]");
  return leafElement == null ? null : boxOf(leafElement);
}

/** Every element outside a leaf is this big (the viewport and the splits). */
const CONTAINER: { width: number; height: number } = { width: 1000, height: 600 };
/** What `(prefers-reduced-motion: reduce)` answers. */
let REDUCED_MOTION: boolean = false;

const STUBBED: ReadonlyArray<[keyof HTMLElement, (element: HTMLElement) => unknown]> = [
  ["offsetParent", (element: HTMLElement): unknown => element.parentElement],
  ["offsetLeft", (element: HTMLElement): unknown => boxOf(element)?.x ?? 0],
  ["offsetTop", (element: HTMLElement): unknown => boxOf(element)?.y ?? 0],
  ["offsetWidth", (element: HTMLElement): unknown => sizeOf(element)?.width ?? CONTAINER.width],
  ["offsetHeight", (element: HTMLElement): unknown => sizeOf(element)?.height ?? CONTAINER.height],
];
const originals: Array<[keyof HTMLElement, PropertyDescriptor | undefined]> = [];
let originalRect: PropertyDescriptor | undefined;

beforeAll((): void => {
  // Divider drags measure their split with getBoundingClientRect.
  originalRect = Object.getOwnPropertyDescriptor(Element.prototype, "getBoundingClientRect");
  Object.defineProperty(Element.prototype, "getBoundingClientRect", {
    configurable: true,
    value(this: Element): DOMRect {
      const box: Box | null = this instanceof HTMLElement ? boxOf(this) : null;
      const x: number = box?.x ?? 0;
      const y: number = box?.y ?? 0;
      const width: number = box?.width ?? CONTAINER.width;
      const height: number = box?.height ?? CONTAINER.height;
      return { x, y, left: x, top: y, width, height, right: x + width, bottom: y + height, toJSON: (): void => undefined } as DOMRect;
    },
  });
  window.matchMedia = ((query: string) => ({
    get matches(): boolean {
      return REDUCED_MOTION && query.includes("reduce");
    },
    media: query,
    addEventListener: (): void => undefined,
    removeEventListener: (): void => undefined,
  })) as unknown as typeof window.matchMedia;
  const globalScope = globalThis as unknown as { ResizeObserver?: unknown };
  if (typeof globalScope.ResizeObserver === "undefined") {
    class StubResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    globalScope.ResizeObserver = StubResizeObserver;
  }
  for (const [name, read] of STUBBED) {
    originals.push([name, Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)]);
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      get(this: HTMLElement): unknown {
        return read(this);
      },
    });
  }
});

afterAll((): void => {
  if (originalRect != null) {
    Object.defineProperty(Element.prototype, "getBoundingClientRect", originalRect);
  }
  for (const [name, descriptor] of originals) {
    if (descriptor != null) {
      Object.defineProperty(HTMLElement.prototype, name, descriptor);
    }
  }
});

afterEach((): void => {
  cleanup();
  GEOMETRY.clear();
  CONTAINER.width = 1000;
  CONTAINER.height = 600;
  REDUCED_MOTION = false;
});

const leaf = (id: string, tileId: string): TilingLeafNode => ({ kind: "leaf", id, tileId });
const TILES: ReadonlyArray<TilingTile> = [
  { id: "a", title: "a" },
  { id: "b", title: "b" },
];
const CONFIG = { gapPx: 0, minPaneSizePx: 40, handleSizePx: 0 };
const LAYOUT: TilingLayoutNode = {
  kind: "split",
  id: "root",
  axis: "horizontal",
  ratio: 0.5,
  first: leaf("left", "a"),
  second: leaf("right", "b"),
};

function wrapperOf(container: HTMLElement, tileId: string): HTMLElement {
  return container.querySelector<HTMLElement>(`[data-hpt-leaf="${tileId}"]`)!;
}

function frameOf(wrapper: HTMLElement): HTMLElement {
  return wrapper.querySelector<HTMLElement>(":scope > [data-hpt-leaf-frame]")!;
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe("renderer leaf motion", (): void => {
  it("renders one wrapper per window with a hidden frame layer, and writes nothing at rest", (): void => {
    GEOMETRY.set("a", { x: 0, y: 0, width: 500, height: 600 });
    GEOMETRY.set("b", { x: 500, y: 0, width: 500, height: 600 });
    const { container } = render(
      <TilingRenderer layout={LAYOUT} tiles={TILES} config={CONFIG} onLayoutChange={(): void => undefined} />,
    );
    for (const tileId of ["a", "b"]) {
      const wrapper: HTMLElement = wrapperOf(container, tileId);
      expect(wrapper).not.toBeNull();
      expect(wrapper.style.transform).toBe("");
      expect(frameOf(wrapper).style.display).toBe("none");
    }
  });

  it("a swap draws both windows where they were before the paint, then glides them home and clears", async (): Promise<void> => {
    GEOMETRY.set("a", { x: 0, y: 0, width: 400, height: 600 });
    GEOMETRY.set("b", { x: 400, y: 0, width: 600, height: 600 });
    const { container, rerender } = render(
      <TilingRenderer layout={LAYOUT} tiles={TILES} config={CONFIG} onLayoutChange={(): void => undefined} />,
    );
    // The swap trades tiles: tile a is now laid out on the right, b on the left.
    GEOMETRY.set("a", { x: 600, y: 0, width: 400, height: 600 });
    GEOMETRY.set("b", { x: 0, y: 0, width: 600, height: 600 });
    act((): void => {
      rerender(
        <TilingRenderer
          layout={swapLeafTiles(LAYOUT, "left", "right")}
          tiles={TILES}
          config={CONFIG}
          onLayoutChange={(): void => undefined}
        />,
      );
    });
    const a: HTMLElement = wrapperOf(container, "a");
    const b: HTMLElement = wrapperOf(container, "b");
    // Drawn where they were: a translated back 600px to the left, b 400px right.
    expect(a.style.transform).toBe("translate(-600px, 0px)");
    expect(b.style.transform).toBe("translate(400px, 0px)");
    for (const wrapper of [a, b]) {
      expect(wrapper.style.transform).not.toContain("scale");
    }
    // b was 600 wide and is still drawn 600 wide; its frame takes the drawn size.
    expect(frameOf(b).style.display).toBe("block");
    expect(frameOf(b).style.width).toBe("600px");
    await act(async (): Promise<void> => {
      await wait(600);
    });
    for (const wrapper of [a, b]) {
      expect(wrapper.style.transform).toBe("");
      expect(frameOf(wrapper).style.display).toBe("none");
    }
  });
});

/** Nothing leaf motion writes is on the wrapper or its frame layer. */
function expectAtRest(wrapper: HTMLElement): void {
  expect(wrapper.getAttribute("style") ?? "").toBe("");
  expect(frameOf(wrapper).style.display).toBe("none");
}

/** A host that applies every layout the renderer reports (a divider drag needs it). */
function Host({
  initial,
  onLayoutReported,
}: {
  initial: TilingLayoutNode;
  onLayoutReported: (next: TilingLayoutNode) => void;
}): React.ReactElement {
  const [layout, setLayout] = React.useState<TilingLayoutNode>(initial);
  return (
    <TilingRenderer
      layout={layout}
      tiles={TILES}
      config={CONFIG}
      onLayoutChange={(next: TilingLayoutNode): void => {
        onLayoutReported(next);
        setLayout(next);
      }}
    />
  );
}

function startGeometry(): void {
  GEOMETRY.set("a", { x: 0, y: 0, width: 400, height: 600 });
  GEOMETRY.set("b", { x: 400, y: 0, width: 600, height: 600 });
}

function swappedGeometry(): void {
  GEOMETRY.set("a", { x: 600, y: 0, width: 400, height: 600 });
  GEOMETRY.set("b", { x: 0, y: 0, width: 600, height: 600 });
}

const SWAPPED: TilingLayoutNode = swapLeafTiles(LAYOUT, "left", "right");

describe("renderer leaf motion — snaps, holds and clean-up", (): void => {
  beforeAll((): void => {
    if (typeof window.requestAnimationFrame !== "function") {
      window.requestAnimationFrame = (callback: FrameRequestCallback): number =>
        window.setTimeout((): void => callback(Date.now()), 0) as unknown as number;
      window.cancelAnimationFrame = (handle: number): void => window.clearTimeout(handle);
    }
  });

  it("a divider drag holds the panes 1:1: no transform, no frame layer, mid-drag", async (): Promise<void> => {
    startGeometry();
    const changes: number[] = [];
    const { container } = render(
      <Host
        initial={LAYOUT}
        onLayoutReported={(next: TilingLayoutNode): void => {
          if (next.kind === "split") {
            changes.push(next.ratio);
          }
        }}
      />,
    );
    const divider: HTMLElement = container.querySelector<HTMLElement>('[data-resize-enabled="true"]')!;
    expect(divider).not.toBeNull();
    act((): void => {
      divider.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 400, button: 0 }));
    });
    GEOMETRY.set("a", { x: 0, y: 0, width: 600, height: 600 });
    GEOMETRY.set("b", { x: 600, y: 0, width: 400, height: 600 });
    await act(async (): Promise<void> => {
      window.dispatchEvent(new MouseEvent("pointermove", { clientX: 600, buttons: 1 }));
      await wait(50);
    });
    // The resize committed (the root split moved) and the panes follow it 1:1.
    expect(changes).toContain(0.7);
    for (const tileId of ["a", "b"]) {
      expectAtRest(wrapperOf(container, tileId));
    }
    act((): void => {
      window.dispatchEvent(new MouseEvent("pointerup", { clientX: 600 }));
    });
  });

  it("a resized container snaps the panes instead of gliding", (): void => {
    startGeometry();
    const { container, rerender } = render(
      <TilingRenderer layout={LAYOUT} tiles={TILES} config={CONFIG} onLayoutChange={(): void => undefined} />,
    );
    CONTAINER.width = 1400;
    GEOMETRY.set("a", { x: 0, y: 0, width: 700, height: 600 });
    GEOMETRY.set("b", { x: 700, y: 0, width: 700, height: 600 });
    act((): void => {
      rerender(<TilingRenderer layout={{ ...LAYOUT }} tiles={TILES} config={CONFIG} onLayoutChange={(): void => undefined} />);
    });
    for (const tileId of ["a", "b"]) {
      expectAtRest(wrapperOf(container, tileId));
    }
  });

  it("prefers-reduced-motion snaps a swap", (): void => {
    REDUCED_MOTION = true;
    startGeometry();
    const { container, rerender } = render(
      <TilingRenderer layout={LAYOUT} tiles={TILES} config={CONFIG} onLayoutChange={(): void => undefined} />,
    );
    swappedGeometry();
    act((): void => {
      rerender(<TilingRenderer layout={SWAPPED} tiles={TILES} config={CONFIG} onLayoutChange={(): void => undefined} />);
    });
    for (const tileId of ["a", "b"]) {
      expectAtRest(wrapperOf(container, tileId));
    }
  });

  it("dragAnimationEnabled={false} snaps a swap", (): void => {
    startGeometry();
    const props = { tiles: TILES, config: CONFIG, onLayoutChange: (): void => undefined, dragAnimationEnabled: false };
    const { container, rerender } = render(<TilingRenderer layout={LAYOUT} {...props} />);
    swappedGeometry();
    act((): void => {
      rerender(<TilingRenderer layout={SWAPPED} {...props} />);
    });
    for (const tileId of ["a", "b"]) {
      expectAtRest(wrapperOf(container, tileId));
    }
  });

  it("unmounting mid-glide clears what was written and stops the loop", async (): Promise<void> => {
    startGeometry();
    const { container, rerender, unmount } = render(
      <TilingRenderer layout={LAYOUT} tiles={TILES} config={CONFIG} onLayoutChange={(): void => undefined} />,
    );
    swappedGeometry();
    act((): void => {
      rerender(<TilingRenderer layout={SWAPPED} tiles={TILES} config={CONFIG} onLayoutChange={(): void => undefined} />);
    });
    const a: HTMLElement = wrapperOf(container, "a");
    expect(a.style.transform).not.toBe("");
    unmount();
    expectAtRest(a);
    await act(async (): Promise<void> => {
      await wait(100);
    });
    expectAtRest(a);
  });

  it("removing a tile mid-glide clears its wrapper; the other settles", async (): Promise<void> => {
    startGeometry();
    const { container, rerender } = render(
      <TilingRenderer layout={LAYOUT} tiles={TILES} config={CONFIG} onLayoutChange={(): void => undefined} />,
    );
    swappedGeometry();
    act((): void => {
      rerender(<TilingRenderer layout={SWAPPED} tiles={TILES} config={CONFIG} onLayoutChange={(): void => undefined} />);
    });
    const a: HTMLElement = wrapperOf(container, "a");
    expect(a.style.transform).not.toBe("");
    GEOMETRY.set("b", { x: 0, y: 0, width: 1000, height: 600 });
    act((): void => {
      rerender(
        <TilingRenderer layout={leaf("right", "b")} tiles={[TILES[1]!]} config={CONFIG} onLayoutChange={(): void => undefined} />,
      );
    });
    expect(container.querySelector('[data-hpt-leaf="a"]')).toBeNull();
    expectAtRest(a);
    await act(async (): Promise<void> => {
      await wait(600);
    });
    expectAtRest(wrapperOf(container, "b"));
  });

  it("a style the host writes on the pane mid-glide survives the end of the glide", async (): Promise<void> => {
    startGeometry();
    const pane =
      (color: string) =>
      (args: { leafId: string }): React.ReactNode => (
        <article data-leaf-id={args.leafId} style={{ borderTopColor: color, boxShadow: "0 0 2px red" }}>
          pane
        </article>
      );
    const props = { tiles: TILES, config: CONFIG, onLayoutChange: (): void => undefined };
    const { container, rerender } = render(<TilingRenderer layout={LAYOUT} {...props} renderTile={pane("red")} />);
    swappedGeometry();
    act((): void => {
      rerender(<TilingRenderer layout={SWAPPED} {...props} renderTile={pane("red")} />);
    });
    const article: HTMLElement = wrapperOf(container, "a").querySelector<HTMLElement>("article")!;
    expect(article.style.boxShadow).toBe("none");
    act((): void => {
      rerender(<TilingRenderer layout={SWAPPED} {...props} renderTile={pane("blue")} />);
    });
    await act(async (): Promise<void> => {
      await wait(600);
    });
    expectAtRest(wrapperOf(container, "a"));
    expect(article.style.borderTopColor).toBe("blue");
    expect(article.style.boxShadow).toBe("0 0 2px red");
    expect(article.style.transition).toBe("");
  });

  it("a workspace-transition snapshot inside the viewport is not taken for panes", (): void => {
    startGeometry();
    const tiles: ReadonlyArray<TilingTile> = [...TILES, { id: "c", title: "c" }, { id: "d", title: "d" }];
    const props = { tiles, config: CONFIG, onLayoutChange: (): void => undefined };
    const { container, rerender } = render(<TilingRenderer layout={LAYOUT} {...props} />);
    // The transition stage's snapshot of the old view, still carrying wrappers.
    const layer: HTMLDivElement = document.createElement("div");
    layer.setAttribute("data-hpt-workspace-transition-layer", "");
    for (const tileId of ["a", "b"]) {
      const clone: HTMLDivElement = document.createElement("div");
      clone.setAttribute("data-hpt-leaf", tileId);
      layer.appendChild(clone);
    }
    wrapperOf(container, "a").parentElement!.appendChild(layer);
    // Switch to a layout of other tiles: a whole new set just appears.
    GEOMETRY.set("c", { x: 0, y: 0, width: 500, height: 600 });
    GEOMETRY.set("d", { x: 500, y: 0, width: 500, height: 600 });
    act((): void => {
      rerender(
        <TilingRenderer
          layout={{ ...LAYOUT, first: leaf("left", "c"), second: leaf("right", "d") }}
          {...props}
        />,
      );
    });
    for (const tileId of ["c", "d"]) {
      expectAtRest(wrapperOf(container, tileId));
    }
  });
});
