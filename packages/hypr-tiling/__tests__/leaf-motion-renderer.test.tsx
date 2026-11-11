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

const STUBBED: ReadonlyArray<[keyof HTMLElement, (element: HTMLElement) => unknown]> = [
  ["offsetParent", (element: HTMLElement): unknown => element.parentElement],
  ["offsetLeft", (element: HTMLElement): unknown => boxOf(element)?.x ?? 0],
  ["offsetTop", (element: HTMLElement): unknown => boxOf(element)?.y ?? 0],
  ["offsetWidth", (element: HTMLElement): unknown => sizeOf(element)?.width ?? 1000],
  ["offsetHeight", (element: HTMLElement): unknown => sizeOf(element)?.height ?? 600],
];
const originals: Array<[keyof HTMLElement, PropertyDescriptor | undefined]> = [];

beforeAll((): void => {
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
  for (const [name, descriptor] of originals) {
    if (descriptor != null) {
      Object.defineProperty(HTMLElement.prototype, name, descriptor);
    }
  }
});

afterEach((): void => {
  cleanup();
  GEOMETRY.clear();
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
