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
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { TilingRenderer, resolveRearmHandle } from "../react/tiling-renderer";
import { HELD_FADE_OPACITY, HELD_THUMBNAIL_SCALE } from "../engine/held-look";
import type {
  TilingClientPoint,
  TilingDragPreview,
  TilingExternalDragHover,
  TilingHeldLook,
  TilingLayoutConfig,
  TilingLayoutNode,
  TilingLeafNode,
  TilingPaneIdentityMode,
  TilingRenderTileProps,
  TilingTile,
} from "../engine/types";
import type { TilingWorkspaceSet } from "../engine/workspace-set";

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
/** A small grip's side (px): too small to be a title bar. */
const GRIP_PX: number = 16;

function boxOf(element: HTMLElement): Box | null {
  const id: string | null = element.getAttribute("data-hpt-leaf");
  return id == null ? null : (GEOMETRY.get(id) ?? null);
}

function enclosingBox(element: HTMLElement): Box | null {
  // A tab group's strip (and its tabs): `GEOMETRY["strip"]`, or nothing when unset.
  if (element.closest("[data-hpt-group-tab-placement]") != null) {
    return GEOMETRY.get("strip") ?? { x: 0, y: 0, width: 0, height: 0 };
  }
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
      // A small grip (`data-test-grip`): a square at the pane's top-left, not a strip across it.
      const isGrip: boolean = this instanceof HTMLElement && this.hasAttribute("data-test-grip");
      const height: number = isGrip
        ? GRIP_PX
        : box != null && this.tagName === "HEADER" && HEADER.px != null
          ? HEADER.px
          : fullHeight;
      const rectWidth: number = isGrip ? GRIP_PX : width;
      return {
        x,
        y,
        left: x,
        top: y,
        width: rectWidth,
        height,
        right: x + rectWidth,
        bottom: y + height,
        toJSON: (): void => undefined,
      } as DOMRect;
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

const translateOf = (transform: string): { dx: number; dy: number } => {
  const match: RegExpExecArray | null = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(transform);
  return match == null ? { dx: 0, dy: 0 } : { dx: Number(match[1]), dy: Number(match[2]) };
};
const scaleOfTransform = (transform: string): number => {
  const match: RegExpExecArray | null = /scale\((-?[\d.]+)\)/.exec(transform);
  return match == null ? 1 : Number(match[1]);
};

/** The box the lifted pane is SEEN in (viewport px): its frame layer, moved by the leaf motion, scaled by the look layer about the grab point. */
function liftedSeenBox(container: HTMLElement): Box {
  const holder: HTMLElement = container.querySelector<HTMLElement>("[data-hpt-lifted]")!;
  const layer: HTMLElement = lookLayer(container)!;
  const wrapper: HTMLElement = holder.querySelector<HTMLElement>('[data-hpt-leaf="a"]')!;
  const frame: HTMLElement = wrapper.querySelector<HTMLElement>(":scope > [data-hpt-leaf-frame]")!;
  const { dx, dy } = translateOf(wrapper.style.transform);
  const [originX, originY] = layer.style.transformOrigin.split(" ").map((part: string): number => parseFloat(part));
  const scale: number = scaleOfTransform(layer.style.transform);
  return {
    x: parseFloat(holder.style.left) + originX! + scale * (dx - originX!),
    y: parseFloat(holder.style.top) + originY! + scale * (dy - originY!),
    width: scale * parseFloat(frame.style.width),
    height: scale * parseFloat(frame.style.height),
  };
}

/** The box a pane landed in `slot` is SEEN in (viewport px): its frame layer, moved by the leaf motion, scaled about the wrapper's top-left. */
function landedSeenBox(container: HTMLElement, slot: Box): Box {
  const wrapper: HTMLElement = container.querySelector<HTMLElement>('[data-hpt-leaf="a"]')!;
  const frame: HTMLElement = wrapper.querySelector<HTMLElement>(":scope > [data-hpt-leaf-frame]")!;
  const { dx, dy } = translateOf(wrapper.style.transform);
  const scale: number = scaleOfTransform(wrapper.style.transform);
  // At rest the frame layer is hidden: the box is the slot itself.
  const drawn: boolean = frame.style.display !== "none";
  return {
    x: slot.x + dx,
    y: slot.y + dy,
    width: scale * (drawn ? parseFloat(frame.style.width) : slot.width),
    height: scale * (drawn ? parseFloat(frame.style.height) : slot.height),
  };
}

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

describe("held look — a spring-load rearm switches the held look from the handle measured on the new seat", (): void => {
  const WS_TILES: ReadonlyArray<TilingTile> = [...TILES, { id: "c", title: "gamma" }];
  const DWELL_MS: number = 100;

  beforeEach((): void => {
    jest.useFakeTimers();
  });
  afterEach((): void => {
    jest.useRealTimers();
  });

  /** main: a | b, ops: c. */
  const wsSet = (): TilingWorkspaceSet => ({
    workspaces: [
      { id: "main", name: "Main", layout: LAYOUT },
      { id: "ops", name: "Ops", layout: leaf("C", "c") },
    ],
    activeId: "main",
  });

  /** The tab strip occupies y <= 30: a parked pointer there is over the `ops` tab. */
  const tabStrip = (point: TilingClientPoint): TilingExternalDragHover | null =>
    point.y > 30 ? null : { kind: "workspace-tab", targetId: "tab:ops", workspaceId: "ops", point };

  /** A pane whose drag handle is a title strip (`header`) or a small grip. */
  const handleTile =
    (handle: "header" | "grip") =>
    (args: TilingRenderTileProps): React.ReactNode => (
      <article data-leaf-id={args.leafId}>
        {handle === "header" ? (
          <header onPointerDown={args.onHandlePointerDown}>{args.tile.title}</header>
        ) : (
          <div data-test-grip="" onPointerDown={args.onHandlePointerDown} />
        )}
      </article>
    );

  function WsHost({
    handle,
    paneIdentity,
    onChange,
  }: {
    handle: "header" | "grip";
    paneIdentity?: TilingPaneIdentityMode;
    onChange?: (next: TilingWorkspaceSet) => void;
  }): React.ReactElement {
    const [set, setSet] = React.useState<TilingWorkspaceSet>(wsSet);
    return (
      <div data-host-active={set.activeId}>
        <TilingRenderer
          workspaces={set}
          tiles={WS_TILES}
          config={CONFIG}
          paneIdentity={paneIdentity}
          renderTile={handleTile(handle)}
          dragAnimationEnabled={false}
          interaction={{
            dragRecovery: { enable: false },
            customCursor: false,
            paneSwitching: { showTabStrip: false, showSwitcherOverlay: false },
            workspaces: { springLoad: { dwellMs: DWELL_MS } },
          }}
          resolveExternalDragHover={tabStrip}
          onWorkspacesChange={(next: TilingWorkspaceSet): void => {
            onChange?.(next);
            setSet(next);
          }}
        />
      </div>
    );
  }

  /** a | b in main; c takes the right half in ops (a's own seat stays the left half). */
  const wsGeometry = (): void => {
    restGeometry();
    GEOMETRY.set("c", { x: 500, y: 0, width: 500, height: 600 });
  };

  const activeOf = (container: HTMLElement): string | null =>
    container.querySelector("[data-host-active]")?.getAttribute("data-host-active") ?? null;

  const heldLookOf = (container: HTMLElement): string | null =>
    lookLayer(container)?.getAttribute("data-hpt-held-look") ?? null;

  /**
   * Pick `a` up by its handle, park over the `ops` tab until the rearm, and
   * report the look before and after (`afterPark` runs once parked: the
   * destination's own geometry).
   */
  function springLoad(
    container: HTMLElement,
    selector: string,
    afterPark?: () => void,
  ): { before: string | null; after: string | null; active: string | null } {
    const handle: HTMLElement | null = container.querySelector<HTMLElement>(`[data-hpt-leaf="a"] ${selector}`);
    if (handle == null) {
      throw new Error(`no handle ${selector} for a`);
    }
    // Fake timers drive the dwell (a window timer) and the input coalescer's frames: deterministic.
    const advance = (ms: number): void => {
      act((): void => {
        jest.advanceTimersByTime(ms);
      });
    };
    act((): void => {
      pointer(handle, "pointerdown", 100, 20);
    });
    advance(40);
    act((): void => {
      pointer(window, "pointermove", 140, 60);
    });
    advance(40);
    const before: string | null = heldLookOf(container);
    act((): void => {
      pointer(window, "pointermove", 320, 24);
    });
    advance(40);
    afterPark?.();
    advance(DWELL_MS + 40);
    advance(100);
    return {
      before,
      after: heldLookOf(container),
      active: activeOf(container),
    };
  }

  it("a header handle keeps the title-bar look across the rearm", (): void => {
    wsGeometry();
    const { container } = render(<WsHost handle="header" />);
    const seen = springLoad(container, "header");
    expect(seen).toEqual({ before: "title-bar", after: "title-bar", active: "ops" });
  });

  it("a small grip gives a thumbnail before and after the rearm", (): void => {
    wsGeometry();
    const { container } = render(<WsHost handle="grip" />);
    const seen = springLoad(container, "[data-test-grip]");
    expect(seen).toEqual({ before: "thumbnail", after: "thumbnail", active: "ops" });
  });

  it("slot identity mounts the pane afresh at the rearm: its handle is gone, so the continued drag has no title bar (documented)", (): void => {
    wsGeometry();
    const { container } = render(<WsHost handle="header" paneIdentity="slot" />);
    const seen = springLoad(container, "header");
    expect(seen).toEqual({ before: "title-bar", after: "thumbnail", active: "ops" });
  });

  it("the handle is measured again on the new seat: a header that is the whole pane there switches the look to a thumbnail", (): void => {
    wsGeometry();
    const { container } = render(<WsHost handle="header" />);
    const seen = springLoad(container, "header", (): void => {
      HEADER.px = null;
    });
    expect(seen).toEqual({ before: "title-bar", after: "thumbnail", active: "ops" });
  });
});

describe("held look — a tab group lands from its look: the strip pivots with the pane", (): void => {
  const STRIP_PX = 28;
  const GROUP_TILES: ReadonlyArray<TilingTile> = [...TILES, { id: "c", title: "charlie" }];
  /** a | g[b, c*] */
  const GROUP_LAYOUT: TilingLayoutNode = {
    kind: "split",
    id: "root",
    axis: "horizontal",
    ratio: 0.5,
    first: leaf("A", "a"),
    second: { kind: "group", id: "g", members: [leaf("B", "b"), leaf("C", "c")], activeMemberId: "C" },
  };

  /** The group's strip and its active pane `c` laid out in the half starting at `x` (the strip on top or below). */
  function groupAt(x: number, placement: "top" | "bottom"): void {
    const paneTop: number = placement === "top" ? STRIP_PX : 0;
    GEOMETRY.set("c", { x, y: paneTop, width: 500, height: 600 - STRIP_PX });
    GEOMETRY.set("strip", { x, y: placement === "top" ? 0 : 600 - STRIP_PX, width: 500, height: STRIP_PX });
  }

  function GroupHost({ look, placement }: { look: TilingHeldLook; placement: "top" | "bottom" }): React.ReactElement {
    const [layout, setLayout] = React.useState<TilingLayoutNode>(GROUP_LAYOUT);
    return (
      <TilingRenderer
        layout={layout}
        tiles={GROUP_TILES}
        config={CONFIG}
        heldLook={look}
        dragAnimationEnabled
        interaction={{
          dragRecovery: { enable: false },
          customCursor: false,
          paneSwitching: { showTabStrip: false, showSwitcherOverlay: false },
          grouping: { groupTabStrip: { placement } },
        }}
        onLayoutChange={setLayout}
      />
    );
  }

  const stripOf = (container: HTMLElement): HTMLElement =>
    container.querySelector<HTMLElement>('[data-group-id="g"] [data-hpt-group-tab-placement]')!;
  const translateScale = (transform: string): { dx: number; dy: number; scale: number } | null => {
    const match: RegExpExecArray | null = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(transform);
    return match == null ? null : { dx: Number(match[1]), dy: Number(match[2]), scale: Number(match[3]) };
  };

  /** Lift the group by its active pane's title bar, hold it over `a`'s centre, swap into a's half and release. */
  async function dropGroup(container: HTMLElement, placement: "top" | "bottom"): Promise<void> {
    const paneTop: number = placement === "top" ? STRIP_PX : 0;
    const header: HTMLElement = container.querySelector<HTMLElement>('[data-hpt-leaf="c"] article header')!;
    await act(async (): Promise<void> => {
      pointer(header, "pointerdown", 600, paneTop + 10);
      await wait(5);
    });
    GEOMETRY.set("a", { x: 0, y: 0, width: 1000, height: 600 });
    await moveTo(640, paneTop + 40);
    await frames(500);
    await moveTo(480, 300, 0);
    await frames(100);
    // The swap: a goes right, the group takes the left half.
    GEOMETRY.set("a", { x: 500, y: 0, width: 500, height: 600 });
    groupAt(0, placement);
    await act(async (): Promise<void> => {
      pointer(window, "pointerup", 480, 300);
    });
    expect(container.querySelector("[data-hpt-lifted]")).toBeNull();
  }

  for (const placement of ["top", "bottom"] as const) {
    it(`a thumbnail drop (strip ${placement}): the strip is scaled with the pane about the edge they share, then settles to full size`, async (): Promise<void> => {
      GEOMETRY.set("a", { x: 0, y: 0, width: 500, height: 600 });
      groupAt(500, placement);
      const { container } = render(<GroupHost look="thumbnail" placement={placement} />);
      await dropGroup(container, placement);
      const pane: HTMLElement = container.querySelector<HTMLElement>('[data-hpt-leaf="c"]')!;
      const strip: HTMLElement = stripOf(container);
      // The handover frame: the pane and its strip carry the thumbnail's scale.
      const paneNow = translateScale(pane.style.transform);
      const stripNow = translateScale(strip.style.transform);
      expect(paneNow?.scale).toBeCloseTo(HELD_THUMBNAIL_SCALE, 3);
      expect(stripNow?.scale).toBeCloseTo(HELD_THUMBNAIL_SCALE, 3);
      expect(strip.style.opacity).toBe("");
      // The pane pivots about its top-left; the strip about the corner it shares with the pane's scaled edge: its
      // bottom-left above the pane, its top-left below it.
      expect(pane.style.transformOrigin).toBe("0 0");
      expect(strip.style.transformOrigin).toBe(placement === "top" ? "0 100%" : "0 0");
      // Their edges meet: above, both are moved by the same dy; below, the strip follows the pane's scaled bottom.
      const paneHeight: number = 600 - STRIP_PX;
      expect(stripNow!.dy - paneNow!.dy).toBeCloseTo(
        placement === "top" ? 0 : paneHeight * (HELD_THUMBNAIL_SCALE - 1),
        1,
      );
      expect(strip.style.width).toBe("500px");
      await frames(60);
      const mid = translateScale(strip.style.transform);
      expect(mid?.scale ?? 1).toBeGreaterThan(HELD_THUMBNAIL_SCALE);
      await frames(900);
      expect(pane.style.transform).toBe("");
      expect(strip.style.transform).toBe("");
      expect(strip.style.width).toBe("");
      expect(strip.style.opacity).toBe("");
    });
  }

  it("a fade drop: the strip is faded with the pane, at full size, then settles to solid", async (): Promise<void> => {
    GEOMETRY.set("a", { x: 0, y: 0, width: 500, height: 600 });
    groupAt(500, "top");
    const { container } = render(<GroupHost look="fade" placement="top" />);
    await dropGroup(container, "top");
    const pane: HTMLElement = container.querySelector<HTMLElement>('[data-hpt-leaf="c"]')!;
    const strip: HTMLElement = stripOf(container);
    expect(Number(pane.style.opacity)).toBeCloseTo(HELD_FADE_OPACITY, 3);
    expect(Number(strip.style.opacity)).toBeCloseTo(HELD_FADE_OPACITY, 3);
    expect(translateScale(strip.style.transform)?.scale).toBe(1);
    await frames(60);
    expect(Number(strip.style.opacity)).toBeGreaterThan(HELD_FADE_OPACITY);
    await frames(900);
    expect(pane.style.opacity).toBe("");
    expect(strip.style.opacity).toBe("");
    expect(strip.style.transform).toBe("");
  });
});

describe("held look — a handover that is not taken does not wait for a later layout change", (): void => {
  function Controlled({ layout }: { layout: TilingLayoutNode }): React.ReactElement {
    return (
      <TilingRenderer
        layout={layout}
        tiles={layout.kind === "leaf" ? TILES.filter((tile: TilingTile): boolean => tile.id === layout.tileId) : TILES}
        config={CONFIG}
        heldLook="thumbnail"
        dragAnimationEnabled
        interaction={{
          dragRecovery: { enable: false },
          customCursor: false,
          paneSwitching: { showTabStrip: false, showSwitcherOverlay: false },
        }}
        onLayoutChange={(): void => undefined}
      />
    );
  }
  const narrow: TilingLayoutNode = { ...(LAYOUT as Extract<TilingLayoutNode, { kind: "split" }>), ratio: 0.3 };

  it("a held pane that left the tree (the host removed it mid-drag) lands from no look when it is back and moves", async (): Promise<void> => {
    restGeometry();
    const { container, rerender } = render(<Controlled layout={LAYOUT} />);
    await liftA(container);
    await frames(400);
    expect(seen(container).transform).toBe(`scale(${HELD_THUMBNAIL_SCALE})`);
    // The host drops `a` from the layout: the drag is cancelled and the pane is gone, with no handover.
    liftedGeometry();
    rerender(<Controlled layout={leaf("B", "b")} />);
    await frames(100);
    expect(container.querySelector("[data-hpt-lifted]")).toBeNull();
    expect(container.querySelector('[data-hpt-leaf="a"]')).toBeNull();
    // The host puts it back, and the pane settles where it is.
    restGeometry();
    rerender(<Controlled layout={LAYOUT} />);
    await frames(600);
    const a: HTMLElement = container.querySelector<HTMLElement>('[data-hpt-leaf="a"]')!;
    expect(a.style.transform).not.toMatch(/scale/);
    // A later layout change glides it plainly: nothing is drawn from the old look.
    GEOMETRY.set("a", { x: 0, y: 0, width: 300, height: 600 });
    GEOMETRY.set("b", { x: 300, y: 0, width: 700, height: 600 });
    rerender(<Controlled layout={narrow} />);
    expect(a.style.transform).not.toMatch(/scale/);
    expect(a.style.opacity).toBe("");
    await frames(600);
    expect(a.style.transform).not.toMatch(/scale/);
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

  it("a thumbnail dropped into a slot of another size than the lift: the box seen is continuous across the handover frame, then glides to the slot", async (): Promise<void> => {
    restGeometry();
    const { container } = render(<Host heldLook="thumbnail" animate />);
    await liftA(container);
    liftedGeometry();
    // Over b's centre, clear of the stage's edge: the thumbnail is not clamped.
    await moveTo(600, 300, 0);
    await frames(500);
    const before: Box = liftedSeenBox(container);
    expect(before.width).toBeCloseTo(500 * HELD_THUMBNAIL_SCALE, 1);
    expect(before.height).toBeCloseTo(FULL_HEIGHT * HELD_THUMBNAIL_SCALE, 1);
    // The slot it lands in is smaller than the pane was, and elsewhere.
    const SLOT: Box = { x: 650, y: 100, width: 300, height: 400 };
    GEOMETRY.set("a", SLOT);
    GEOMETRY.set("b", { x: 0, y: 0, width: 650, height: 600 });
    await act(async (): Promise<void> => {
      pointer(window, "pointerup", 600, 300);
    });
    expect(container.querySelector("[data-hpt-lifted]")).toBeNull();
    const a: HTMLElement = container.querySelector<HTMLElement>('[data-hpt-leaf="a"]')!;
    const handover: Box = landedSeenBox(container, SLOT);
    // The handover frame: the same box, to the pixel (no jump in size, scale or place).
    expect(handover.x).toBeCloseTo(before.x, 1);
    expect(handover.y).toBeCloseTo(before.y, 1);
    expect(handover.width).toBeCloseTo(before.width, 1);
    expect(handover.height).toBeCloseTo(before.height, 1);
    // Then it glides to the slot: the box stays between where it was seen and the slot (the width product of the
    // shrinking drawn rect and the growing scale may pass the slot by a pixel), and it ends there.
    for (let i = 0; i < 60; i++) {
      await frames(16);
      const box: Box = landedSeenBox(container, SLOT);
      expect(box.width).toBeGreaterThanOrEqual(Math.min(before.width, SLOT.width) - 1);
      expect(box.width).toBeLessThanOrEqual(Math.max(before.width, SLOT.width) + 2);
      expect(box.height).toBeGreaterThanOrEqual(Math.min(before.height, SLOT.height) - 1);
      expect(box.height).toBeLessThanOrEqual(Math.max(before.height, SLOT.height) + 2);
    }
    await frames(600);
    expect(a.style.transform).toBe("");
    expect(landedSeenBox(container, SLOT)).toMatchObject({ x: SLOT.x, y: SLOT.y, width: SLOT.width, height: SLOT.height });
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
