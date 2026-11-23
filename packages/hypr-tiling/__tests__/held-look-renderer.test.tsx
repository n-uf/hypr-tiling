/**
 * @jest-environment jsdom
 *
 * The held pane's look (`heldLook`): from the lift the held pane folds to its
 * title bar, shrinks to a thumbnail or fades (and the drop indicator draws
 * above it), and keeps that look for the whole drag, wherever the pointer is.
 * It comes back to full size only as it lands (into its slot on a drop, home
 * on a release there), settling there from the look. Drawing only: the drop it
 * commits is the same in every look.
 *
 * jsdom has no layout: every leaf wrapper (`[data-hpt-leaf]`, keyed by tile id)
 * reports the rect the test puts in `GEOMETRY`, a pane's header reports a
 * `HEADER.px` strip along its top (or the whole pane: no title bar), and the
 * viewport is 1000×600 at the origin.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "@jest/globals";
import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { TilingRenderer, resolveRearmHandle } from "../react/tiling-renderer";
import { HELD_FADE_OPACITY, HELD_THUMBNAIL_SCALE } from "../engine/held-look";
import type {
  TilingDragPreview,
  TilingHeldLook,
  TilingLayoutConfig,
  TilingLayoutNode,
  TilingLeafNode,
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
/** The pane header's height (a title bar), or `null`: the header is the whole pane (no title bar). */
const HEADER: { px: number | null } = { px: 40 };
const MEDIA: { reducedMotion: boolean } = { reducedMotion: false };

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
      const fullHeight: number = box?.height ?? CONTAINER.height;
      const height: number = box != null && this.tagName === "HEADER" && HEADER.px != null ? HEADER.px : fullHeight;
      return { x, y, left: x, top: y, width, height, right: x + width, bottom: y + height, toJSON: (): void => undefined } as DOMRect;
    },
  });
  window.matchMedia = ((query: string) => ({
    matches: query.includes("reduce") ? MEDIA.reducedMotion : false,
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
  HEADER.px = 40;
  MEDIA.reducedMotion = false;
});

const leaf = (id: string, tileId: string): TilingLeafNode => ({ kind: "leaf", id, tileId });
const TILES: ReadonlyArray<TilingTile> = [
  { id: "a", title: "alpha" },
  { id: "b", title: "bravo" },
];
const CONFIG: TilingLayoutConfig = { gapPx: 0, minPaneSizePx: 40, handleSizePx: 0 };
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
  heldLook,
  tiles = TILES,
  dragPreview,
  animate = false,
  config = CONFIG,
}: {
  onLayoutReported?: (next: TilingLayoutNode) => void;
  heldLook?: TilingHeldLook;
  tiles?: ReadonlyArray<TilingTile>;
  dragPreview?: TilingDragPreview;
  animate?: boolean;
  config?: TilingLayoutConfig;
}): React.ReactElement {
  const [layout, setLayout] = React.useState<TilingLayoutNode>(LAYOUT);
  return (
    <TilingRenderer
      layout={layout}
      tiles={tiles}
      config={config}
      dragPreview={dragPreview}
      heldLook={heldLook}
      dragAnimationEnabled={animate}
      interaction={{
        dragRecovery: { enable: false },
        customCursor: false,
        paneSwitching: { showTabStrip: false, showSwitcherOverlay: false },
      }}
      onLayoutChange={(next: TilingLayoutNode): void => {
        onLayoutReported?.(next);
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

async function moveTo(x: number, y: number, ms: number = 20): Promise<void> {
  await act(async (): Promise<void> => {
    pointer(window, "pointermove", x, y);
    await wait(ms);
  });
}

async function release(x: number, y: number): Promise<void> {
  await act(async (): Promise<void> => {
    pointer(window, "pointerup", x, y);
    await wait(20);
  });
}

async function escape(): Promise<void> {
  await act(async (): Promise<void> => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await wait(20);
  });
}

/** Press a's header at (100, 20) and drag past the threshold over its own place; a is lifted. */
async function liftA(container: HTMLElement): Promise<void> {
  const header: HTMLElement | null = container.querySelector<HTMLElement>('[data-hpt-leaf="a"] article header');
  if (header == null) {
    throw new Error("no header for a");
  }
  await act(async (): Promise<void> => {
    pointer(header, "pointerdown", 100, 20);
    await wait(5);
  });
  await moveTo(140, 60);
}

function lookLayer(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>("[data-hpt-lifted] [data-hpt-held-look]");
}

/** The held pane's drawn frame height (the leaf motion's frame layer), or `null` when it is not moving. */
function drawnHeight(container: HTMLElement): number | null {
  const frame: HTMLElement | null = container.querySelector<HTMLElement>(
    '[data-hpt-lifted] [data-hpt-leaf="a"] > [data-hpt-leaf-frame]',
  );
  return frame == null || frame.style.height === "" ? null : parseFloat(frame.style.height);
}

interface SeenLook {
  readonly look: string | null;
  readonly transform: string;
  readonly opacity: string;
  readonly height: number | null;
  readonly indicatorZ: number | null;
}

function seen(container: HTMLElement): SeenLook {
  const layer: HTMLElement | null = lookLayer(container);
  const indicator: HTMLElement | null = container.querySelector<HTMLElement>("[data-hpt-drop-indicator]");
  return {
    look: layer?.getAttribute("data-hpt-held-look") ?? null,
    transform: layer?.style.transform ?? "",
    opacity: layer?.style.opacity ?? "",
    height: drawnHeight(container),
    indicatorZ: indicator == null ? null : Number(indicator.style.zIndex),
  };
}

const FULL_HEIGHT: number = 600;

/** Let `ms` pass (leaf-motion frames run on timers here). */
async function frames(ms: number): Promise<void> {
  await act(async (): Promise<void> => {
    await wait(ms);
  });
}

/** The held pane over its home (at the lift), over a target, in free space. */
async function walk(container: HTMLElement): Promise<Record<"home" | "target" | "free", SeenLook>> {
  await liftA(container);
  const home: SeenLook = seen(container);
  liftedGeometry();
  // Over b's right edge (b fills the view now): a drop to the right of b.
  await moveTo(960, 300);
  const target: SeenLook = seen(container);
  // Out past the viewport: no drop.
  await moveTo(1300, 300);
  const free: SeenLook = seen(container);
  return { home, target, free };
}

describe("held look — kept for the whole drag, every look (snapping: no animation)", (): void => {
  it("auto on a pane with a title bar folds to the title bar from the lift: at home, over a target, in free space", async (): Promise<void> => {
    restGeometry();
    const { container } = render(<Host />);
    const states = await walk(container);
    expect([states.home, states.target, states.free].map((state) => state.height)).toEqual([40, 40, 40]);
    for (const state of [states.home, states.target, states.free]) {
      expect(state).toMatchObject({ look: "title-bar", transform: "", opacity: "", height: 40 });
    }
    await escape();
  });

  it("auto on a pane with no title bar is a thumbnail everywhere", async (): Promise<void> => {
    HEADER.px = null;
    restGeometry();
    const { container } = render(<Host />);
    const states = await walk(container);
    for (const state of [states.home, states.target, states.free]) {
      expect(state).toMatchObject({ look: "thumbnail", transform: `scale(${HELD_THUMBNAIL_SCALE})` });
    }
    await escape();
  });

  it("thumbnail scales about the grab point; the pane itself is held at full size", async (): Promise<void> => {
    restGeometry();
    const { container } = render(<Host heldLook="thumbnail" />);
    const states = await walk(container);
    for (const state of [states.home, states.target, states.free]) {
      expect(state).toMatchObject({ look: "thumbnail", transform: `scale(${HELD_THUMBNAIL_SCALE})` });
      expect(state.height === null || state.height === FULL_HEIGHT).toBe(true);
    }
    await escape();
  });

  it("fade keeps the full pane at the fade opacity everywhere, with the drop indicator above it", async (): Promise<void> => {
    restGeometry();
    const { container } = render(<Host heldLook="fade" />);
    const states = await walk(container);
    for (const state of [states.home, states.target, states.free]) {
      expect(state).toMatchObject({ look: "fade", opacity: String(HELD_FADE_OPACITY), transform: "" });
    }
    const lifted: HTMLElement = container.querySelector<HTMLElement>("[data-hpt-lifted]")!;
    expect(states.target.indicatorZ).toBeGreaterThan(Number(lifted.style.zIndex));
    await escape();
  });

  it("none keeps today's look: full size and solid everywhere, the pane above the indicator", async (): Promise<void> => {
    restGeometry();
    const { container } = render(<Host heldLook="none" />);
    const states = await walk(container);
    for (const state of [states.home, states.target, states.free]) {
      expect(state).toMatchObject({ look: "none", transform: "", opacity: "" });
      expect(state.height === null || state.height === FULL_HEIGHT).toBe(true);
    }
    const lifted: HTMLElement = container.querySelector<HTMLElement>("[data-hpt-lifted]")!;
    expect(states.target.indicatorZ).toBeLessThan(Number(lifted.style.zIndex));
    await escape();
  });

  it("over a refused place the look holds", async (): Promise<void> => {
    restGeometry();
    // b (1000 px once a is lifted) cannot be split into two panes of 600 px:
    // an edge insert beside it is refused.
    const { container } = render(<Host heldLook="thumbnail" config={{ ...CONFIG, minPaneSizePx: 600 }} />);
    await liftA(container);
    liftedGeometry();
    await moveTo(960, 300);
    expect(container.querySelector("[data-hpt-drop-indicator]")).toBeNull();
    expect(seen(container)).toMatchObject({ look: "thumbnail", transform: `scale(${HELD_THUMBNAIL_SCALE})` });
    await escape();
  });

  it("near the stage's edge what is seen (the thumbnail's box) is kept inside the stage", async (): Promise<void> => {
    restGeometry();
    const { container } = render(<Host heldLook="thumbnail" />);
    await liftA(container);
    liftedGeometry();
    // Grabbed at (100, 20) of a 500×600 pane; the box seen is 200×240 about
    // the grab point, so at (960, 590) it would reach (1120, 822): it is
    // moved back inside the 1000×600 stage, to (800, 360).
    await moveTo(960, 590);
    const layer: HTMLElement = lookLayer(container)!;
    expect(layer.style.transform).toBe(`scale(${HELD_THUMBNAIL_SCALE})`);
    expect(layer.style.transformOrigin).toBe("840px 368px");
    const a: HTMLElement = container.querySelector<HTMLElement>('[data-hpt-lifted] [data-hpt-leaf="a"]')!;
    expect(a.style.transform).toBe("translate(740px, 348px)");
    // The box seen: the origin plus the pane's offset from it, scaled.
    const seenX: number = 840 + (740 - 840) * HELD_THUMBNAIL_SCALE;
    const seenY: number = 368 + (348 - 368) * HELD_THUMBNAIL_SCALE;
    expect([seenX, seenY, seenX + 500 * HELD_THUMBNAIL_SCALE, seenY + 600 * HELD_THUMBNAIL_SCALE]).toEqual([800, 360, 1000, 600]);
    await escape();
  });
});

describe("held look — the tile spec beats the renderer prop", (): void => {
  it("a tile's own look wins for that pane", async (): Promise<void> => {
    restGeometry();
    const tiles: ReadonlyArray<TilingTile> = [{ id: "a", title: "alpha", heldLook: "fade" }, TILES[1]!];
    const { container } = render(<Host heldLook="thumbnail" tiles={tiles} />);
    const states = await walk(container);
    expect(states.target).toMatchObject({ look: "fade", opacity: String(HELD_FADE_OPACITY), transform: "" });
    await escape();
  });

  it("a tile's auto beats a renderer's fixed look", async (): Promise<void> => {
    restGeometry();
    const tiles: ReadonlyArray<TilingTile> = [{ id: "a", title: "alpha", heldLook: "auto" }, TILES[1]!];
    const { container } = render(<Host heldLook="none" tiles={tiles} />);
    const states = await walk(container);
    expect(states.target).toMatchObject({ look: "title-bar", height: 40 });
    await escape();
  });
});

describe("held look — motion", (): void => {
  it("at the lift the pane glides from full size into its fold, then keeps it in free space", async (): Promise<void> => {
    restGeometry();
    const { container } = render(<Host animate />);
    await liftA(container);
    const heights: number[] = [];
    for (let i = 0; i < 30; i++) {
      await frames(16);
      const height: number | null = drawnHeight(container);
      if (height != null) {
        heights.push(height);
      }
    }
    // It went part of the way first (a glide, not a jump), then arrived.
    expect(heights.some((height: number): boolean => height > 40 + 1 && height < FULL_HEIGHT - 1)).toBe(true);
    expect(heights.at(-1)).toBeCloseTo(40, 0);
    for (let i = 1; i < heights.length; i++) {
      expect(heights[i]!).toBeLessThanOrEqual(heights[i - 1]! + 0.01);
      expect(heights[i]!).toBeGreaterThanOrEqual(40 - 0.01);
    }
    // Out in free space: still folded.
    liftedGeometry();
    await moveTo(1300, 300);
    await frames(200);
    expect(drawnHeight(container)).toBeCloseTo(40, 0);
    await escape();
  });

  it("a release over home lands the pane at full size, smoothly, from its look", async (): Promise<void> => {
    restGeometry();
    const changes: TilingLayoutNode[] = [];
    const { container } = render(
      <Host heldLook="thumbnail" animate onLayoutReported={(next): void => void changes.push(next)} />,
    );
    await liftA(container);
    await frames(400);
    expect(seen(container).transform).toBe(`scale(${HELD_THUMBNAIL_SCALE})`);
    await act(async (): Promise<void> => {
      pointer(window, "pointerup", 140, 60);
    });
    expect(changes).toHaveLength(0);
    expect(container.querySelector("[data-hpt-lifted]")).toBeNull();
    const a: HTMLElement = container.querySelector<HTMLElement>('[data-hpt-leaf="a"]')!;
    // Back in the tree, it lands from the thumbnail: the same content scale,
    // about its top-left, growing back to full size.
    const scales: number[] = [];
    const scaleOf = (): number | null => {
      const match: RegExpExecArray | null = /scale\(([\d.]+)\)/.exec(a.style.transform);
      return match == null ? null : Number(match[1]);
    };
    expect(scaleOf()).toBeCloseTo(HELD_THUMBNAIL_SCALE, 3);
    expect(a.style.transformOrigin).toBe("0 0");
    for (let i = 0; i < 40; i++) {
      await frames(16);
      const scale: number | null = scaleOf();
      if (scale != null) {
        scales.push(scale);
      }
    }
    expect(scales.some((scale: number): boolean => scale > HELD_THUMBNAIL_SCALE + 0.01 && scale < 0.99)).toBe(true);
    for (let i = 1; i < scales.length; i++) {
      expect(scales[i]!).toBeGreaterThanOrEqual(scales[i - 1]! - 0.0001);
      expect(scales[i]!).toBeLessThanOrEqual(1.0001);
    }
    await frames(400);
    // At rest at home, full size: nothing written.
    expect(a.style.transform).toBe("");
    expect(a.style.opacity).toBe("");
  });

  it("under reduced motion it snaps into the look at the lift and lands with no look", async (): Promise<void> => {
    MEDIA.reducedMotion = true;
    restGeometry();
    const { container } = render(<Host animate heldLook="thumbnail" />);
    await liftA(container);
    // One move (the coalesced frame and its render), no frames after it.
    expect(seen(container).transform).toBe(`scale(${HELD_THUMBNAIL_SCALE})`);
    await act(async (): Promise<void> => {
      pointer(window, "pointerup", 140, 60);
    });
    const a: HTMLElement = container.querySelector<HTMLElement>('[data-hpt-leaf="a"]')!;
    expect(a.style.transform).not.toMatch(/scale/);
  });
});

describe("held look — snap preview", (): void => {
  it("the look shows while held, the pane is full size in the slot it snaps into, and glides back into its look when it leaves", async (): Promise<void> => {
    restGeometry();
    const { container } = render(<Host heldLook="thumbnail" dragPreview="snap" />);
    await liftA(container);
    liftedGeometry();
    // Inside the landing slot (500..1000) but within 24 px of its edge: held, in its look.
    await moveTo(515, 300);
    expect(seen(container)).toMatchObject({ look: "thumbnail", transform: `scale(${HELD_THUMBNAIL_SCALE})` });
    // Well inside: the pane sits in the slot, in the tree, at full size.
    GEOMETRY.set("a", { x: 500, y: 0, width: 500, height: 600 });
    GEOMETRY.set("b", { x: 0, y: 0, width: 500, height: 600 });
    await moveTo(700, 300);
    expect(container.querySelector("[data-hpt-lifted]")).toBeNull();
    const a: HTMLElement = container.querySelector<HTMLElement>('[data-hpt-leaf="a"]')!;
    expect(a.style.transform).not.toMatch(/scale/);
    // Out of the slot: held again, in its look.
    liftedGeometry();
    GEOMETRY.set("a", { x: 0, y: 0, width: 500, height: 600 });
    await moveTo(300, 10);
    expect(seen(container)).toMatchObject({ look: "thumbnail", transform: `scale(${HELD_THUMBNAIL_SCALE})` });
    await escape();
  });
});

describe("held look — a spring-load rearm measures the handle on the new seat", (): void => {
  it("a handle still on the page in the seat is measured again; one gone or elsewhere leaves none", (): void => {
    const seat: HTMLElement = document.createElement("article");
    const header: HTMLElement = document.createElement("header");
    seat.appendChild(header);
    document.body.appendChild(seat);
    const elsewhere: HTMLElement = document.createElement("div");
    document.body.appendChild(elsewhere);
    try {
      const measured = resolveRearmHandle({ element: header }, seat);
      expect(measured?.element).toBe(header);
      expect(measured?.rect).toEqual({ left: 0, top: 0, width: CONTAINER.width, height: CONTAINER.height });
      expect(resolveRearmHandle({ element: elsewhere }, seat)).toBeNull();
      expect(resolveRearmHandle(null, seat)).toBeNull();
      header.remove();
      expect(resolveRearmHandle({ element: header }, seat)).toBeNull();
    } finally {
      seat.remove();
      elsewhere.remove();
    }
  });
});

describe("held look — drawing only: the drop is the same in every look", (): void => {
  it("every look commits the same layout for the same drop", async (): Promise<void> => {
    const committed: string[] = [];
    for (const look of ["auto", "title-bar", "thumbnail", "fade", "none"] as const) {
      restGeometry();
      const changes: TilingLayoutNode[] = [];
      const { container, unmount } = render(
        <Host heldLook={look} onLayoutReported={(next): void => void changes.push(next)} />,
      );
      await liftA(container);
      liftedGeometry();
      await moveTo(960, 300);
      GEOMETRY.set("a", { x: 500, y: 0, width: 500, height: 600 });
      GEOMETRY.set("b", { x: 0, y: 0, width: 500, height: 600 });
      await release(960, 300);
      expect(changes).toHaveLength(1);
      committed.push(JSON.stringify(changes[0]));
      unmount();
      GEOMETRY.clear();
    }
    expect(new Set(committed).size).toBe(1);
  });

  it("a thumbnail drop lands from the thumbnail: the same content scale at the handover, settling to full size", async (): Promise<void> => {
    restGeometry();
    const { container } = render(<Host heldLook="thumbnail" animate />);
    await liftA(container);
    liftedGeometry();
    await moveTo(960, 300, 0);
    await frames(500);
    const layer: HTMLElement = lookLayer(container)!;
    expect(layer.style.transform).toBe(`scale(${HELD_THUMBNAIL_SCALE})`);
    GEOMETRY.set("a", { x: 500, y: 0, width: 500, height: 600 });
    GEOMETRY.set("b", { x: 0, y: 0, width: 500, height: 600 });
    await act(async (): Promise<void> => {
      pointer(window, "pointerup", 960, 300);
    });
    expect(container.querySelector("[data-hpt-lifted]")).toBeNull();
    // The handover frame: in the tree now, its content still scaled by the
    // thumbnail's scale (no pop to full-size text), about its top-left, the
    // drawn rect at the lift size; then the scale settles to 1.
    const a: HTMLElement = container.querySelector<HTMLElement>('[data-hpt-leaf="a"]')!;
    const frame: HTMLElement = a.querySelector<HTMLElement>(":scope > [data-hpt-leaf-frame]")!;
    const scaleOf = (): number | null => {
      const match: RegExpExecArray | null = /scale\(([\d.]+)\)/.exec(a.style.transform);
      return match == null ? null : Number(match[1]);
    };
    expect(scaleOf()).toBeCloseTo(HELD_THUMBNAIL_SCALE, 3);
    expect(a.style.transformOrigin).toBe("0 0");
    expect(parseFloat(frame.style.height)).toBeCloseTo(FULL_HEIGHT, 0);
    await frames(60);
    const mid: number | null = scaleOf();
    expect(mid).not.toBeNull();
    expect(mid!).toBeGreaterThan(HELD_THUMBNAIL_SCALE);
    expect(mid!).toBeLessThanOrEqual(1);
    await frames(700);
    expect(a.style.transform).toBe("");
    expect(frame.style.display).toBe("none");
  });

  it("a fade drop lands from the fade: the same opacity at the handover, settling to solid", async (): Promise<void> => {
    restGeometry();
    const { container } = render(<Host heldLook="fade" animate />);
    await liftA(container);
    liftedGeometry();
    await moveTo(960, 300, 0);
    await frames(500);
    expect(seen(container).opacity).toBe(String(HELD_FADE_OPACITY));
    GEOMETRY.set("a", { x: 500, y: 0, width: 500, height: 600 });
    GEOMETRY.set("b", { x: 0, y: 0, width: 500, height: 600 });
    await act(async (): Promise<void> => {
      pointer(window, "pointerup", 960, 300);
    });
    const a: HTMLElement = container.querySelector<HTMLElement>('[data-hpt-leaf="a"]')!;
    expect(Number(a.style.opacity)).toBeCloseTo(HELD_FADE_OPACITY, 3);
    await frames(60);
    expect(Number(a.style.opacity)).toBeGreaterThan(HELD_FADE_OPACITY);
    await frames(700);
    expect(a.style.opacity).toBe("");
  });
});
