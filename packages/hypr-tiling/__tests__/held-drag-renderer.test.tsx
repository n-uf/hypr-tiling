/**
 * @jest-environment jsdom
 *
 * The held drag (live mode): past the click threshold the REAL pane is lifted
 * out of the layout and held 1:1 under the pointer, raised above the others,
 * while they close the gap; the drop preview is an indicator at the exact
 * landing rect (or, in snap mode, the pane itself settling into the slot);
 * the drop settles the pane from where it is drawn; a release that never left
 * the pane's place, or Escape, puts the layout back exactly.
 *
 * jsdom has no layout: every leaf wrapper (`[data-hpt-leaf]`, keyed by tile id)
 * reports the rect the test puts in `GEOMETRY` (offsets and client rect alike;
 * a pane fills its wrapper), the viewport is 1000×600 at the origin.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from "@jest/globals";
import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { TilingRenderer } from "../react/tiling-renderer";
import { resolveTileRect } from "../engine/drag-landing";
import type {
  TilingDragPreview,
  TilingExternalDragHover,
  TilingLayoutNode,
  TilingLeafNode,
  TilingOnExternalDrop,
  TilingTile,
} from "../engine/types";

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const GEOMETRY: Map<string, Box> = new Map<string, Box>();
const CONTAINER: { width: number; height: number } = { width: 1000, height: 600 };

function boxOf(element: HTMLElement): Box | null {
  const id: string | null = element.getAttribute("data-hpt-leaf");
  return id == null ? null : (GEOMETRY.get(id) ?? null);
}

function enclosingBox(element: HTMLElement): Box | null {
  const leafElement: HTMLElement | null = element.closest<HTMLElement>("[data-hpt-leaf]");
  return leafElement == null ? null : boxOf(leafElement);
}

const STUBBED: ReadonlyArray<[keyof HTMLElement, (element: HTMLElement) => unknown]> = [
  ["offsetParent", (element: HTMLElement): unknown => element.parentElement],
  ["offsetLeft", (element: HTMLElement): unknown => boxOf(element)?.x ?? 0],
  ["offsetTop", (element: HTMLElement): unknown => boxOf(element)?.y ?? 0],
  ["offsetWidth", (element: HTMLElement): unknown => enclosingBox(element)?.width ?? CONTAINER.width],
  ["offsetHeight", (element: HTMLElement): unknown => enclosingBox(element)?.height ?? CONTAINER.height],
  ["clientWidth", (): unknown => CONTAINER.width],
  ["clientHeight", (): unknown => CONTAINER.height],
];
const originals: Array<[keyof HTMLElement, PropertyDescriptor | undefined]> = [];
let originalRect: PropertyDescriptor | undefined;

beforeAll((): void => {
  originalRect = Object.getOwnPropertyDescriptor(Element.prototype, "getBoundingClientRect");
  Object.defineProperty(Element.prototype, "getBoundingClientRect", {
    configurable: true,
    value(this: Element): DOMRect {
      const box: Box | null = this instanceof HTMLElement ? enclosingBox(this) : null;
      const x: number = box?.x ?? 0;
      const y: number = box?.y ?? 0;
      const width: number = box?.width ?? CONTAINER.width;
      const height: number = box?.height ?? CONTAINER.height;
      return { x, y, left: x, top: y, width, height, right: x + width, bottom: y + height, toJSON: (): void => undefined } as DOMRect;
    },
  });
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: (): void => undefined,
    removeEventListener: (): void => undefined,
  })) as unknown as typeof window.matchMedia;
  const globalScope = globalThis as unknown as { ResizeObserver?: unknown; PointerEvent?: typeof PointerEvent };
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
    window.cancelAnimationFrame = (handle: number): void => window.clearTimeout(handle);
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
});

const leaf = (id: string, tileId: string): TilingLeafNode => ({ kind: "leaf", id, tileId });
const TILES: ReadonlyArray<TilingTile> = [
  { id: "a", title: "alpha" },
  { id: "b", title: "bravo" },
];
const CONFIG = { gapPx: 0, minPaneSizePx: 40, handleSizePx: 0 };
/** a | b */
const LAYOUT: TilingLayoutNode = {
  kind: "split",
  id: "root",
  axis: "horizontal",
  ratio: 0.5,
  first: leaf("A", "a"),
  second: leaf("B", "b"),
};

function restGeometry(): void {
  GEOMETRY.set("a", { x: 0, y: 0, width: 500, height: 600 });
  GEOMETRY.set("b", { x: 500, y: 0, width: 500, height: 600 });
}

/** a lifted: b alone fills the viewport (a's own geometry stays its lift rect). */
function liftedGeometry(): void {
  GEOMETRY.set("b", { x: 0, y: 0, width: 1000, height: 600 });
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function Host({
  onLayoutReported,
  dragPreview,
  dragPreviewMakesRoom,
  paneIdentity = "stable",
  externalDragHover,
  onExternalDrop,
}: {
  onLayoutReported: (next: TilingLayoutNode) => void;
  dragPreview?: TilingDragPreview;
  dragPreviewMakesRoom?: boolean;
  paneIdentity?: "stable" | "slot";
  externalDragHover?: TilingExternalDragHover | null;
  onExternalDrop?: TilingOnExternalDrop;
}): React.ReactElement {
  const [layout, setLayout] = React.useState<TilingLayoutNode>(LAYOUT);
  return (
    <TilingRenderer
      layout={layout}
      tiles={TILES}
      config={CONFIG}
      paneIdentity={paneIdentity}
      dragPreview={dragPreview}
      dragPreviewMakesRoom={dragPreviewMakesRoom}
      externalDragHover={externalDragHover}
      onExternalDrop={onExternalDrop}
      interaction={{
        dragRecovery: { enable: false },
        customCursor: false,
        paneSwitching: { showTabStrip: false, showSwitcherOverlay: false },
      }}
      onLayoutChange={(next: TilingLayoutNode): void => {
        onLayoutReported(next);
        setLayout(next);
      }}
    />
  );
}

function pointer(target: EventTarget, type: string, x: number, y: number): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      clientX: x,
      clientY: y,
    }),
  );
}

/** Move the pointer and let the coalesced frame + render + leaf-motion write run. */
async function moveTo(x: number, y: number): Promise<void> {
  await act(async (): Promise<void> => {
    pointer(window, "pointermove", x, y);
    await wait(20);
  });
}

async function press(container: HTMLElement, tileId: string, x: number, y: number): Promise<void> {
  const header: HTMLElement | null = container.querySelector<HTMLElement>(`[data-hpt-leaf="${tileId}"] article header`);
  if (header == null) {
    throw new Error(`no header for ${tileId}`);
  }
  await act(async (): Promise<void> => {
    pointer(header, "pointerdown", x, y);
    await wait(5);
  });
}

async function release(x: number, y: number): Promise<void> {
  await act(async (): Promise<void> => {
    pointer(window, "pointerup", x, y);
    await wait(20);
  });
}

function wrapperOf(container: HTMLElement, tileId: string): HTMLElement {
  return container.querySelector<HTMLElement>(`[data-hpt-leaf="${tileId}"]`)!;
}

function lifted(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>("[data-hpt-lifted]");
}

function indicatorRect(container: HTMLElement): Box | null {
  const indicator: HTMLElement | null = container.querySelector<HTMLElement>("[data-hpt-drop-indicator]");
  if (indicator == null) {
    return null;
  }
  return {
    x: parseFloat(indicator.style.left),
    y: parseFloat(indicator.style.top),
    width: parseFloat(indicator.style.width),
    height: parseFloat(indicator.style.height),
  };
}

function expectAtRest(wrapper: HTMLElement): void {
  expect(wrapper.style.transform).toBe("");
  expect(wrapper.querySelector<HTMLElement>(":scope > [data-hpt-leaf-frame]")!.style.display).toBe("none");
}

/** Press a's header at (100, 20) and drag past the threshold to (x, y); a is lifted. */
async function liftA(container: HTMLElement, x: number, y: number): Promise<void> {
  await press(container, "a", 100, 20);
  liftedGeometry();
  await moveTo(x, y);
}

describe("held drag — the click threshold", (): void => {
  it("a press that never passes the threshold changes nothing", async (): Promise<void> => {
    restGeometry();
    const changes = jest.fn((_next: TilingLayoutNode): void => undefined);
    const { container } = render(<Host onLayoutReported={changes} />);
    const article: HTMLElement = wrapperOf(container, "a").querySelector("article")!;
    await press(container, "a", 100, 20);
    await moveTo(103, 22);
    expect(lifted(container)).toBeNull();
    expect(container.querySelector("[data-hpt-drop-indicator]")).toBeNull();
    await release(103, 22);
    expect(changes).not.toHaveBeenCalled();
    expect(lifted(container)).toBeNull();
    // The same pane, in its place, nothing written.
    expect(wrapperOf(container, "a").querySelector("article")).toBe(article);
    expectAtRest(wrapperOf(container, "a"));
    expectAtRest(wrapperOf(container, "b"));
  });
});

describe("held drag — lift, hold, on top, reflow", (): void => {
  it("lifts the REAL pane, holds it 1:1 under the pointer, raises it, and the others close the gap", async (): Promise<void> => {
    restGeometry();
    const { container } = render(<Host onLayoutReported={(): void => undefined} />);
    const article: HTMLElement = wrapperOf(container, "a").querySelector("article")!;
    await liftA(container, 140, 60);

    const holder: HTMLElement | null = lifted(container);
    expect(holder).not.toBeNull();
    const a: HTMLElement = wrapperOf(container, "a");
    // The real pane (same mount), in the lifted wrapper laid out at its place, at its lift size.
    expect(holder!.contains(a)).toBe(true);
    expect(a.querySelector("article")).toBe(article);
    expect(holder!.style.left).toBe("0px");
    expect(holder!.style.width).toBe("500px");
    // Held exactly where the pointer put it: moved by the pointer's travel, never scaled.
    expect(a.style.transform).toBe("translate(40px, 40px)");
    // On top, with the lifted look.
    expect(a.hasAttribute("data-hpt-leaf-raised")).toBe(true);
    expect(Number(holder!.style.zIndex)).toBeGreaterThan(0);
    // b closes the gap on the settle curve: drawn where it was, gliding to fill the view.
    const b: HTMLElement = wrapperOf(container, "b");
    expect(lifted(container)!.contains(b)).toBe(false);
    expect(b.style.transform).toMatch(/^translate\(\d/);

    // Every move holds it exactly under the pointer (the same task as the event).
    act((): void => {
      pointer(window, "pointermove", 333, 222);
    });
    expect(a.style.transform).toBe("translate(233px, 202px)");
    act((): void => {
      pointer(window, "pointermove", 640, 410);
    });
    expect(a.style.transform).toBe("translate(540px, 390px)");
    await release(640, 410);
  });
});

describe("held drag — indicator preview and drop", (): void => {
  it("the indicator marks the exact rect the pane lands in, and the drop lands it there", async (): Promise<void> => {
    restGeometry();
    const changes: TilingLayoutNode[] = [];
    const { container } = render(<Host onLayoutReported={(next): void => void changes.push(next)} />);
    await liftA(container, 140, 60);
    // Over b's right edge (b fills the view now): drop to the right of b.
    await moveTo(960, 300);
    const indicator: Box | null = indicatorRect(container);
    expect(indicator).toEqual({ x: 500, y: 0, width: 500, height: 600 });
    // No room made by default: b stays laid out across the view.
    expect(container.querySelector("[data-drag-held-slot-leaf]")).toBeNull();

    GEOMETRY.set("a", { x: 500, y: 0, width: 500, height: 600 });
    GEOMETRY.set("b", { x: 0, y: 0, width: 500, height: 600 });
    await release(960, 300);
    expect(changes).toHaveLength(1);
    // Indicator rect == committed rect.
    expect(resolveTileRect(changes[0]!, "a", CONTAINER, CONFIG)).toEqual(indicator);
    expect(lifted(container)).toBeNull();
    expect(container.querySelector("[data-hpt-drop-indicator]")).toBeNull();
    // The pane settles into its slot from where it was drawn, still on top.
    const a: HTMLElement = wrapperOf(container, "a");
    expect(a.style.transform).not.toBe("");
    expect(a.hasAttribute("data-hpt-leaf-raised")).toBe(true);
    await act(async (): Promise<void> => {
      await wait(700);
    });
    expectAtRest(a);
    // Down once its drop settle ended.
    expect(a.hasAttribute("data-hpt-leaf-raised")).toBe(false);
  });

  it("with dragPreviewMakesRoom the others make room at the indicated slot, kept empty for the pane", async (): Promise<void> => {
    restGeometry();
    const { container } = render(<Host onLayoutReported={(): void => undefined} dragPreviewMakesRoom />);
    await liftA(container, 140, 60);
    await moveTo(960, 300);
    expect(indicatorRect(container)).toEqual({ x: 500, y: 0, width: 500, height: 600 });
    // The kept place is empty (not a pane: no second copy of a) and a is still held.
    expect(container.querySelector("[data-drag-held-slot-leaf]")).not.toBeNull();
    expect(container.querySelectorAll('[data-hpt-leaf="a"]')).toHaveLength(1);
    expect(lifted(container)!.contains(wrapperOf(container, "a"))).toBe(true);
    await release(960, 300);
  });
});

describe("held drag — snap preview", (): void => {
  it("snaps in once well inside a slot (others make room), stays while inside, settles back out when it leaves", async (): Promise<void> => {
    restGeometry();
    const changes: TilingLayoutNode[] = [];
    const { container } = render(<Host onLayoutReported={(next): void => void changes.push(next)} dragPreview="snap" />);
    await liftA(container, 140, 60);
    // Inside the landing slot (500..1000) but within 24 px of its edge: not yet.
    await moveTo(515, 300);
    expect(lifted(container)).not.toBeNull();
    expect(container.querySelector("[data-hpt-drop-indicator]")).toBeNull();
    // Well inside: the pane settles into the slot, in the tree, still on top.
    GEOMETRY.set("a", { x: 500, y: 0, width: 500, height: 600 });
    GEOMETRY.set("b", { x: 0, y: 0, width: 500, height: 600 });
    await moveTo(700, 300);
    expect(lifted(container)).toBeNull();
    const a: HTMLElement = wrapperOf(container, "a");
    expect(a.hasAttribute("data-hpt-leaf-raised")).toBe(true);
    expect(container.querySelector("[data-hpt-drop-indicator]")).toBeNull();
    // Back near the slot's edge, still inside it: stays snapped (hysteresis).
    await moveTo(505, 300);
    expect(lifted(container)).toBeNull();
    // Out of the slot (and not well inside another): back under the pointer at
    // its lift size; the others close the gap again.
    liftedGeometry();
    GEOMETRY.set("a", { x: 0, y: 0, width: 500, height: 600 });
    await moveTo(300, 10);
    expect(lifted(container)).not.toBeNull();
    expect(lifted(container)!.style.width).toBe("500px");
    // Back in and released: lands in the slot it snapped into.
    GEOMETRY.set("a", { x: 500, y: 0, width: 500, height: 600 });
    GEOMETRY.set("b", { x: 0, y: 0, width: 500, height: 600 });
    await moveTo(800, 300);
    expect(lifted(container)).toBeNull();
    await release(800, 300);
    expect(changes).toHaveLength(1);
    expect(resolveTileRect(changes[0]!, "a", CONTAINER, CONFIG)).toEqual({ x: 500, y: 0, width: 500, height: 600 });
  });
});

describe("held drag — home and cancel restore the exact layout", (): void => {
  it("a release that never left the pane's own place commits nothing; everything settles back", async (): Promise<void> => {
    restGeometry();
    const changes = jest.fn((_next: TilingLayoutNode): void => undefined);
    const { container } = render(<Host onLayoutReported={changes} />);
    await liftA(container, 140, 60);
    await moveTo(300, 400);
    restGeometry();
    await release(300, 400);
    expect(changes).not.toHaveBeenCalled();
    expect(lifted(container)).toBeNull();
    expect(container.querySelector('[data-hpt-leaf="a"]')).not.toBeNull();
    await act(async (): Promise<void> => {
      await wait(700);
    });
    expectAtRest(wrapperOf(container, "a"));
    expectAtRest(wrapperOf(container, "b"));
  });

  it("Escape cancels from anywhere: the layout as it was at the lift comes back", async (): Promise<void> => {
    restGeometry();
    const changes = jest.fn((_next: TilingLayoutNode): void => undefined);
    const { container } = render(<Host onLayoutReported={changes} />);
    await liftA(container, 140, 60);
    await moveTo(960, 300);
    expect(indicatorRect(container)).not.toBeNull();
    restGeometry();
    await act(async (): Promise<void> => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await wait(20);
    });
    expect(lifted(container)).toBeNull();
    expect(container.querySelector("[data-hpt-drop-indicator]")).toBeNull();
    // A late release is inert.
    await release(960, 300);
    expect(changes).not.toHaveBeenCalled();
    await act(async (): Promise<void> => {
      await wait(700);
    });
    expectAtRest(wrapperOf(container, "a"));
  });
});

describe('held drag — paneIdentity "slot"', (): void => {
  it("lifts and holds the pane like stable mode, but the lifted pane is a second mount", async (): Promise<void> => {
    restGeometry();
    const changes: TilingLayoutNode[] = [];
    const { container } = render(
      <Host onLayoutReported={(next): void => void changes.push(next)} paneIdentity="slot" />,
    );
    const article: HTMLElement = wrapperOf(container, "a").querySelector("article")!;
    await liftA(container, 140, 60);
    const holder: HTMLElement | null = lifted(container);
    expect(holder).not.toBeNull();
    const a: HTMLElement = wrapperOf(container, "a");
    expect(holder!.contains(a)).toBe(true);
    // One copy of a on screen, held 1:1 and on top, as in stable mode.
    expect(container.querySelectorAll('[data-hpt-leaf="a"]')).toHaveLength(1);
    expect(a.style.transform).toBe("translate(40px, 40px)");
    expect(a.hasAttribute("data-hpt-leaf-raised")).toBe(true);
    // Slot mode renders each pane where its slot is, so the lifted pane is
    // mounted afresh (state inside the tile does not carry over); only
    // `paneIdentity: "stable"` keeps the same instance.
    expect(a.querySelector("article")).not.toBe(article);
    // The drop still lands where the indicator said.
    await moveTo(960, 300);
    const indicator: Box | null = indicatorRect(container);
    GEOMETRY.set("a", { x: 500, y: 0, width: 500, height: 600 });
    GEOMETRY.set("b", { x: 0, y: 0, width: 500, height: 600 });
    await release(960, 300);
    expect(changes).toHaveLength(1);
    expect(resolveTileRect(changes[0]!, "a", CONTAINER, CONFIG)).toEqual(indicator);
    expect(lifted(container)).toBeNull();
  });
});

describe("held drag — host claim (onExternalDrop)", (): void => {
  const HOVER: TilingExternalDragHover = { targetId: "ws:ops", point: { x: 320, y: 24 } };

  it("a release over a host target calls onExternalDrop exactly once with the hover; nothing commits here", async (): Promise<void> => {
    restGeometry();
    const changes = jest.fn((_next: TilingLayoutNode): void => undefined);
    const onExternalDrop = jest.fn<TilingOnExternalDrop>();
    const { container } = render(
      <Host onLayoutReported={changes} externalDragHover={HOVER} onExternalDrop={onExternalDrop} />,
    );
    await liftA(container, 140, 60);
    await moveTo(320, 24);
    await release(320, 24);
    expect(onExternalDrop).toHaveBeenCalledTimes(1);
    expect(onExternalDrop).toHaveBeenCalledWith(
      "A",
      "ws:ops",
      { x: 320, y: 24 },
      HOVER,
      expect.objectContaining({ kind: "pane", groupId: null, activeLeafId: "A" }),
    );
    expect(changes).not.toHaveBeenCalled();
    expect(lifted(container)).toBeNull();
    // Later events do not claim again.
    await release(320, 24);
    expect(onExternalDrop).toHaveBeenCalledTimes(1);
  });

  it("without a hover the release never calls onExternalDrop, and the pane settles home", async (): Promise<void> => {
    restGeometry();
    const changes = jest.fn((_next: TilingLayoutNode): void => undefined);
    const onExternalDrop = jest.fn<TilingOnExternalDrop>();
    const { container } = render(<Host onLayoutReported={changes} onExternalDrop={onExternalDrop} />);
    await liftA(container, 140, 60);
    await release(140, 60);
    expect(onExternalDrop).not.toHaveBeenCalled();
    expect(changes).not.toHaveBeenCalled();
    expect(lifted(container)).toBeNull();
  });

  it("a declined claim (onExternalDrop returns false) cancels: the pane settles home", async (): Promise<void> => {
    restGeometry();
    const changes = jest.fn((_next: TilingLayoutNode): void => undefined);
    const onExternalDrop = jest.fn<TilingOnExternalDrop>(() => false);
    const { container } = render(
      <Host onLayoutReported={changes} externalDragHover={HOVER} onExternalDrop={onExternalDrop} />,
    );
    await liftA(container, 140, 60);
    await release(140, 60);
    expect(onExternalDrop).toHaveBeenCalledTimes(1);
    expect(changes).not.toHaveBeenCalled();
    expect(container.querySelectorAll('[data-hpt-leaf="a"]')).toHaveLength(1);
  });
});

describe("held drag — clean-up", (): void => {
  it("unmounting mid-drag leaves nothing written and ignores later pointer events", async (): Promise<void> => {
    restGeometry();
    const { container, unmount } = render(<Host onLayoutReported={(): void => undefined} />);
    await liftA(container, 140, 60);
    const a: HTMLElement = wrapperOf(container, "a");
    expect(a.style.transform).not.toBe("");
    unmount();
    expect(a.style.transform).toBe("");
    expect(() => {
      pointer(window, "pointermove", 500, 300);
      pointer(window, "pointerup", 500, 300);
    }).not.toThrow();
    await act(async (): Promise<void> => {
      await wait(50);
    });
    expect(a.style.transform).toBe("");
  });
});
