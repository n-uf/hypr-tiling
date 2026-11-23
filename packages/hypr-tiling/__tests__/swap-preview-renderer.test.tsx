/**
 * @jest-environment jsdom
 *
 * A held swap through placement's `tilingDrag`, in both drop previews: the pane's old place reopens (the neighbour
 * that grew into it at the lift gives the room back) with the partner drawn landed there, a wash marks it (tinted,
 * ⇄ and the partner's name, no frame), the held pane keeps its held look under the wash, and the release commits
 * exactly the tree the frame drew. Off the swap the gap closes again.
 *
 * jsdom has no layout: every leaf wrapper (`[data-hpt-leaf]`, keyed by tile id) reports the rect in `GEOMETRY`; the
 * viewport is 1000×600. Columns: 01 above 02 on the left, 03 on the right (the operator's case, 02 held over 03).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "@jest/globals";
import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { TilingRenderer } from "../react/tiling-renderer";
import { swapLeafTiles } from "../engine/state";
import { deriveDropCommitTree } from "../engine/tiling-drag-tree";
import { resolveDragRoomTarget, type DragResolvedTarget } from "../engine/drag-machine";
import type { TilingDragPreview, TilingHeldLook, TilingLayoutNode, TilingLeafNode, TilingTile } from "../engine/types";

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
  { id: "one", title: "hypr-tiling" },
  { id: "two", title: "Features" },
  { id: "three", title: "Install" },
];
const CONFIG = { gapPx: 0, minPaneSizePx: 40, handleSizePx: 0 };
/** 01 above 02 on the left, 03 on the right. */
const LAYOUT: TilingLayoutNode = {
  kind: "split",
  id: "root",
  axis: "horizontal",
  ratio: 0.5,
  first: { kind: "split", id: "col", axis: "vertical", ratio: 0.5, first: leaf("L1", "one"), second: leaf("L2", "two") },
  second: leaf("L3", "three"),
};
/** 02's place at the lift, where 03 lands. */
const OLD_PLACE: Box = { x: 0, y: 300, width: 500, height: 300 };
/** 03's place at the lift, where 02 lands. */
const PARTNER_PLACE: Box = { x: 500, y: 0, width: 500, height: 600 };

function restGeometry(): void {
  GEOMETRY.set("one", { x: 0, y: 0, width: 500, height: 300 });
  GEOMETRY.set("two", OLD_PLACE);
  GEOMETRY.set("three", PARTNER_PLACE);
}

/** 02 lifted: 01 grew into its place. */
function liftedGeometry(): void {
  GEOMETRY.set("one", { x: 0, y: 0, width: 500, height: 600 });
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function Host({
  onLayoutReported,
  preview,
  heldLook,
}: {
  onLayoutReported: (next: TilingLayoutNode) => void;
  preview: TilingDragPreview;
  heldLook: TilingHeldLook;
}): React.ReactElement {
  const [layout, setLayout] = React.useState<TilingLayoutNode>(LAYOUT);
  return (
    <TilingRenderer
      layout={layout}
      tiles={TILES}
      config={CONFIG}
      dragPreview={preview}
      heldLook={heldLook}
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

async function moveTo(x: number, y: number): Promise<void> {
  await act(async (): Promise<void> => {
    pointer(window, "pointermove", x, y);
    await wait(20);
  });
}

/** The tree as drawn, in document order: each pane's tile, and `slot:<leaf>` for the held pane's kept place. */
function drawnOrder(container: HTMLElement): string[] {
  const viewport: Element = container;
  return [...viewport.querySelectorAll<HTMLElement>("[data-hpt-leaf], [data-drag-held-slot-leaf]")]
    .filter((element) => element.closest("[data-hpt-lifted]") == null)
    .map((element) => element.getAttribute("data-hpt-leaf") ?? `slot:${element.getAttribute("data-drag-held-slot-leaf")}`);
}

const washOf = (container: HTMLElement): HTMLElement | null => container.querySelector<HTMLElement>("[data-hpt-swap-wash]");

/** Press 02's title bar, lift it, and hold it over the middle of 03. */
async function holdTwoOverThree(args: { preview: TilingDragPreview; heldLook: TilingHeldLook; changes: TilingLayoutNode[] }) {
  restGeometry();
  const view = render(<Host preview={args.preview} heldLook={args.heldLook} onLayoutReported={(next): void => void args.changes.push(next)} />);
  const grip: Element | null = view.container.querySelector('[data-hpt-leaf="two"] article header');
  expect(grip).not.toBeNull();
  await act(async (): Promise<void> => {
    pointer(grip!, "pointerdown", 100, 320);
    await wait(5);
  });
  liftedGeometry();
  await moveTo(300, 400);
  await moveTo(750, 300);
  return view;
}

const PREVIEWS: ReadonlyArray<TilingDragPreview> = ["indicator", "snap"];
const HELD_LOOKS: ReadonlyArray<TilingHeldLook> = ["title-bar", "thumbnail", "fade", "none"];

describe("a held swap reopens the old place, marks where the partner lands, and commits what it drew", (): void => {
  for (const preview of PREVIEWS) {
    it(`${preview}: 02 over 03 — 01 gives the room back, 03 is drawn in 02's old place under the wash`, async (): Promise<void> => {
      const changes: TilingLayoutNode[] = [];
      const { container } = await holdTwoOverThree({ preview, heldLook: "title-bar", changes });
      // The left column again holds two panes: 01, and 03 where 02 was. 02's landing is 03's old place: kept empty
      // while it is held (indicator), or the pane itself once it has settled there (snap).
      const order: string[] = drawnOrder(container);
      expect(order.slice(0, 2)).toEqual(["one", "three"]);
      expect(order[2]).toBe(preview === "snap" ? "two" : "slot:L3");
      const wash: HTMLElement | null = washOf(container);
      expect(wash).not.toBeNull();
      expect(wash!.getAttribute("data-hpt-swap-partner")).toBe("three");
      expect(wash!.textContent).toBe("⇄Install");
      expect({ x: parseFloat(wash!.style.left), y: parseFloat(wash!.style.top), width: parseFloat(wash!.style.width), height: parseFloat(wash!.style.height) }).toEqual(OLD_PLACE);
      // A tinted wash, no frame: no border, no outline, no shadow.
      const style: CSSStyleDeclaration = window.getComputedStyle(wash!);
      expect(["", "none"]).toContain(style.borderTopStyle);
      expect(["", "0px"]).toContain(style.borderTopWidth);
      expect(["", "none"]).toContain(style.outlineStyle);
      expect(["", "none"]).toContain(style.boxShadow);
      expect(wash!.style.background).toContain("color-mix");
      if (preview === "indicator") {
        // The drop indicator marks 02's landing: 03's old place.
        const indicator: HTMLElement | null = container.querySelector<HTMLElement>("[data-hpt-drop-indicator]");
        expect({ x: parseFloat(indicator!.style.left), y: parseFloat(indicator!.style.top), width: parseFloat(indicator!.style.width), height: parseFloat(indicator!.style.height) }).toEqual(PARTNER_PLACE);
      }
      // The release commits exactly the tree the frame drew: 02 and 03 trade places.
      await act(async (): Promise<void> => {
        pointer(window, "pointerup", 750, 300);
        await wait(20);
      });
      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual(swapLeafTiles(LAYOUT, "L2", "L3"));
      expect(washOf(container)).toBeNull();
    });
  }

  for (const heldLook of HELD_LOOKS) {
    it(`the wash stays above the held pane (heldLook "${heldLook}")`, async (): Promise<void> => {
      const { container } = await holdTwoOverThree({ preview: "indicator", heldLook, changes: [] });
      const lifted: HTMLElement | null = container.querySelector<HTMLElement>("[data-hpt-lifted]");
      const wash: HTMLElement | null = washOf(container);
      expect(lifted).not.toBeNull();
      expect(wash).not.toBeNull();
      // The held look is kept (jsdom measures no title bar, so "title-bar" falls back to the thumbnail there).
      expect(lifted!.querySelector("[data-hpt-held-look]")!.getAttribute("data-hpt-held-look")).toBe(heldLook === "title-bar" ? "thumbnail" : heldLook);
      expect(Number(wash!.style.zIndex)).toBeGreaterThan(Number(lifted!.style.zIndex));
      // The wash is the viewport's, beside the lifted layer (one stacking context), never inside it.
      expect(wash!.parentElement).toBe(lifted!.parentElement);
    });
  }

  it("off the swap target the gap closes again and the wash goes", async (): Promise<void> => {
    const { container } = await holdTwoOverThree({ preview: "indicator", heldLook: "title-bar", changes: [] });
    expect(washOf(container)).not.toBeNull();
    // Over the middle of 01 as the gap closed it (just above 02's old place, its home): a swap with 01, which lands
    // in 02's old place.
    await moveTo(250, 260);
    expect(washOf(container)?.getAttribute("data-hpt-swap-partner") ?? null).toBe("one");
    expect(parseFloat(washOf(container)!.style.top)).toBe(OLD_PLACE.y);
    // Over 03's right edge: a side drop, no swap. The indicator preview makes no room: 01 fills the left column.
    await moveTo(985, 300);
    expect(washOf(container)).toBeNull();
    expect(drawnOrder(container)).toEqual(["one", "three"]);
  });
});

describe("the room rule and the commit tree", (): void => {
  const swap = { leafId: "L3", action: "swap", zone: "center" } as unknown as DragResolvedTarget;
  const edge = { leafId: "L3", action: "edge-insert", zone: "right", finalEdge: "right" } as unknown as DragResolvedTarget;

  it("a committable swap makes room in both previews; other drops as before", (): void => {
    for (const preview of ["indicator", "snap"] as const) {
      expect(resolveDragRoomTarget({ preview, makesRoom: false, snapped: null, committable: swap })).toBe(swap);
    }
    expect(resolveDragRoomTarget({ preview: "indicator", makesRoom: false, snapped: null, committable: edge })).toBeNull();
    expect(resolveDragRoomTarget({ preview: "indicator", makesRoom: true, snapped: null, committable: edge })).toBe(edge);
    expect(resolveDragRoomTarget({ preview: "snap", makesRoom: false, snapped: null, committable: edge })).toBeNull();
    expect(resolveDragRoomTarget({ preview: "snap", makesRoom: false, snapped: edge, committable: edge })).toBe(edge);
  });

  it("a swap commits tilingDrag's after(swap).tree, the swap reducer's tree", (): void => {
    const committed = deriveDropCommitTree({ layout: LAYOUT, sourceLeafId: "L2", target: swap, container: CONTAINER, config: CONFIG });
    expect(committed).toEqual(swapLeafTiles(LAYOUT, "L2", "L3"));
  });
});
