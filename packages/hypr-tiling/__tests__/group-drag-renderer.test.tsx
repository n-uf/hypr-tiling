/**
 * @jest-environment jsdom
 *
 * Dragging a tab group (live mode): the active pane's title bar or the empty
 * part of the group's strip lifts the WHOLE group (it renders as a group while
 * held, the others close its gap) and drops it as the same group; a tab tears
 * off just that pane; a group dropped on another pane's title bar merges into
 * it; Escape or a release at home puts the group back exactly.
 *
 * jsdom has no layout: every leaf wrapper (`[data-hpt-leaf]`, keyed by tile id)
 * reports the rect in `GEOMETRY`; a group tab strip (and its tabs) reports
 * `GEOMETRY["strip"]` (nothing when unset); the viewport is 1000×600.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "@jest/globals";
import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { TilingRenderer } from "../react/tiling-renderer";
import { resolveTileRect } from "../engine/drag-landing";
import { findGroupContainingLeaf } from "../engine/state";
import type {
  TilingGroupNode,
  TilingLayoutNode,
  TilingLeafNode,
  TilingRenderTileProps,
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
const STRIP_PX: number = 28;
const NONE: Box = { x: 0, y: 0, width: 0, height: 0 };

function boxOf(element: HTMLElement): Box | null {
  const id: string | null = element.getAttribute("data-hpt-leaf");
  return id == null ? null : (GEOMETRY.get(id) ?? null);
}

function enclosingBox(element: HTMLElement): Box | null {
  if (element.closest("[data-hpt-group-tab-placement]") != null) {
    return GEOMETRY.get("strip") ?? NONE;
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
  { id: "c", title: "charlie" },
];
const CONFIG = { gapPx: 0, minPaneSizePx: 40, handleSizePx: 0 };
const GROUP: TilingGroupNode = { kind: "group", id: "g", members: [leaf("B", "b"), leaf("C", "c")], activeMemberId: "C" };
/** a | g[b, c*] */
const LAYOUT: TilingLayoutNode = { kind: "split", id: "root", axis: "horizontal", ratio: 0.5, first: leaf("A", "a"), second: GROUP };

/** At rest: a on the left, the group on the right (strip on top, c under it). */
function restGeometry(): void {
  GEOMETRY.set("a", { x: 0, y: 0, width: 500, height: 600 });
  GEOMETRY.set("c", { x: 500, y: STRIP_PX, width: 500, height: 600 - STRIP_PX });
  GEOMETRY.set("strip", { x: 500, y: 0, width: 500, height: STRIP_PX });
}

/** The group lifted: a alone fills the viewport. */
function groupLiftedGeometry(): void {
  GEOMETRY.set("a", { x: 0, y: 0, width: 1000, height: 600 });
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** A custom tile whose header is a group drop target (as the homepage's). */
function HostTile(args: TilingRenderTileProps): React.ReactElement {
  return (
    <article data-leaf-id={args.leafId}>
      <header ref={args.groupDropTargetRef} onPointerDown={args.onHandlePointerDown}>
        {args.tile.title}
      </header>
    </article>
  );
}

function Host({
  onLayoutReported,
  hostTiles = false,
}: {
  onLayoutReported: (next: TilingLayoutNode) => void;
  hostTiles?: boolean;
}): React.ReactElement {
  const [layout, setLayout] = React.useState<TilingLayoutNode>(LAYOUT);
  return (
    <TilingRenderer
      layout={layout}
      tiles={TILES}
      config={CONFIG}
      paneIdentity="stable"
      interaction={{
        dragRecovery: { enable: false },
        customCursor: false,
        paneSwitching: { showTabStrip: false, showSwitcherOverlay: false },
      }}
      renderTile={hostTiles ? (args: TilingRenderTileProps): React.ReactNode => <HostTile {...args} /> : undefined}
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

async function pressOn(element: Element | null, x: number, y: number): Promise<void> {
  if (element == null) {
    throw new Error("nothing to press");
  }
  await act(async (): Promise<void> => {
    pointer(element, "pointerdown", x, y);
    await wait(5);
  });
}

async function release(x: number, y: number): Promise<void> {
  await act(async (): Promise<void> => {
    pointer(window, "pointerup", x, y);
    await wait(20);
  });
}

const header = (container: HTMLElement, tileId: string): Element | null =>
  container.querySelector(`[data-hpt-leaf="${tileId}"] article header`);
const strip = (container: HTMLElement): Element | null =>
  container.querySelector('[data-group-id="g"] [data-hpt-group-tab-placement]');
const tab = (container: HTMLElement, index: number): Element | null =>
  container.querySelector(`[data-group-id="g"] [data-member-index="${index}"]`);
const lifted = (container: HTMLElement): HTMLElement | null => container.querySelector<HTMLElement>("[data-hpt-lifted]");

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

function groupOf(node: TilingLayoutNode, groupId: string): TilingGroupNode | null {
  if (node.kind === "group") return node.id === groupId ? node : null;
  if (node.kind === "leaf") return null;
  return groupOf(node.first, groupId) ?? groupOf(node.second, groupId);
}

/** Every leaf's tile id in the tree, in order (a group contributes its members). */
function tileIdsOf(node: TilingLayoutNode): string[] {
  if (node.kind === "leaf") return [node.tileId];
  if (node.kind === "group") return node.members.map((member: TilingLeafNode): string => member.tileId);
  return [...tileIdsOf(node.first), ...tileIdsOf(node.second)];
}

/** Whether some split has the leaves of tiles `first` and `second` as its two children, in that order. */
function hasSiblings(node: TilingLayoutNode, first: string, second: string): boolean {
  if (node.kind !== "split") return false;
  const isLeafOf = (child: TilingLayoutNode, tileId: string): boolean => child.kind === "leaf" && child.tileId === tileId;
  return (
    (isLeafOf(node.first, first) && isLeafOf(node.second, second)) ||
    hasSiblings(node.first, first, second) ||
    hasSiblings(node.second, first, second)
  );
}

function expectGroupIntact(layout: TilingLayoutNode): void {
  const group: TilingGroupNode | null = groupOf(layout, "g");
  expect(group?.members.map((m: TilingLeafNode): string => m.id)).toEqual(["B", "C"]);
  expect(group?.activeMemberId).toBe("C");
}

describe("group drag — the title bar of a grouped pane moves the whole group", (): void => {
  it("lifts the group (as a group), the others close its gap, and a swap lands it as the same group where the indicator was", async (): Promise<void> => {
    restGeometry();
    const changes: TilingLayoutNode[] = [];
    const { container } = render(<Host onLayoutReported={(next): void => void changes.push(next)} />);
    await pressOn(header(container, "c"), 600, STRIP_PX + 10);
    groupLiftedGeometry();
    await moveTo(640, STRIP_PX + 40);
    const holder: HTMLElement | null = lifted(container);
    expect(holder).not.toBeNull();
    // Held as a group: its strip and its active pane, in the lifted layer.
    expect(holder!.querySelector('[data-group-id="g"] [data-hpt-group-tab-placement]')).not.toBeNull();
    expect(holder!.querySelector('[data-hpt-leaf="c"]')).not.toBeNull();
    expect(holder!.style.width).toBe("500px");
    expect(holder!.style.height).toBe("600px");
    // The tree keeps no copy of it.
    expect(container.querySelectorAll('[data-group-id="g"]')).toHaveLength(1);
    // Over a's centre (left of the group's home): a swap; the indicator marks
    // the whole slot the group lands in.
    await moveTo(480, 300);
    const indicator: Box | null = indicatorRect(container);
    expect(indicator).toEqual({ x: 0, y: 0, width: 500, height: 600 });
    GEOMETRY.set("a", { x: 500, y: 0, width: 500, height: 600 });
    GEOMETRY.set("c", { x: 0, y: STRIP_PX, width: 500, height: 600 - STRIP_PX });
    await release(480, 300);
    expect(changes).toHaveLength(1);
    const next: TilingLayoutNode = changes[0]!;
    expectGroupIntact(next);
    expect(next.kind === "split" && next.first.kind === "group" && next.first.id).toBe("g");
    // Indicator == the slot the group was laid out at.
    expect(resolveTileRect(next, "c", CONTAINER, CONFIG)).toEqual(indicator);
    expect(lifted(container)).toBeNull();
  });

  it("an ungrouped pane still drags alone", async (): Promise<void> => {
    restGeometry();
    const { container } = render(<Host onLayoutReported={(): void => undefined} />);
    await pressOn(header(container, "a"), 100, 20);
    GEOMETRY.set("c", { x: 0, y: STRIP_PX, width: 1000, height: 600 - STRIP_PX });
    await moveTo(140, 60);
    const holder: HTMLElement | null = lifted(container);
    expect(holder).not.toBeNull();
    expect(holder!.querySelector("[data-group-id]")).toBeNull();
    expect(holder!.querySelector('[data-hpt-leaf="a"]')).not.toBeNull();
    await release(140, 60);
  });
});

describe("group drag — the empty part of the tab strip", (): void => {
  it("lifts the whole group; a release at home puts it back exactly", async (): Promise<void> => {
    restGeometry();
    const changes: TilingLayoutNode[] = [];
    const { container } = render(<Host onLayoutReported={(next): void => void changes.push(next)} />);
    await pressOn(strip(container), 900, 10);
    groupLiftedGeometry();
    await moveTo(910, 40);
    expect(lifted(container)?.querySelector('[data-group-id="g"]')).not.toBeNull();
    await release(910, 40);
    expect(changes).toHaveLength(0);
    expect(lifted(container)).toBeNull();
    expect(container.querySelector('[data-group-id="g"] [data-member-index="1"]')).not.toBeNull();
  });

  it("Escape from anywhere puts the group back exactly", async (): Promise<void> => {
    restGeometry();
    const changes: TilingLayoutNode[] = [];
    const { container } = render(<Host onLayoutReported={(next): void => void changes.push(next)} />);
    await pressOn(strip(container), 900, 10);
    groupLiftedGeometry();
    await moveTo(300, 300);
    expect(lifted(container)).not.toBeNull();
    await act(async (): Promise<void> => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await wait(20);
    });
    await release(300, 300);
    expect(changes).toHaveLength(0);
    expect(lifted(container)).toBeNull();
    expect(container.querySelectorAll('[data-group-id="g"] [role="tab"]')).toHaveLength(2);
  });
});

describe("group drag — a tab tears off one pane", (): void => {
  it("a click on a tab only switches tabs", async (): Promise<void> => {
    restGeometry();
    const changes: TilingLayoutNode[] = [];
    const { container } = render(<Host onLayoutReported={(next): void => void changes.push(next)} />);
    await pressOn(tab(container, 0), 530, 10);
    await moveTo(532, 11);
    expect(lifted(container)).toBeNull();
    await release(532, 11);
    await act(async (): Promise<void> => {
      (tab(container, 0) as HTMLElement).click();
      await wait(10);
    });
    expect(changes.at(-1) != null && groupOf(changes.at(-1)!, "g")?.activeMemberId).toBe("B");
    expect(changes.at(-1) != null && groupOf(changes.at(-1)!, "g")?.members).toHaveLength(2);
  });

  it("dragging a tab detaches just that pane; with one pane left the group becomes that pane", async (): Promise<void> => {
    restGeometry();
    const changes: TilingLayoutNode[] = [];
    const { container } = render(<Host onLayoutReported={(next): void => void changes.push(next)} />);
    await pressOn(tab(container, 0), 530, 10);
    // b out: the group is c alone (a bare leaf, the library's rule for a group of one).
    GEOMETRY.set("c", { x: 500, y: 0, width: 500, height: 600 });
    await moveTo(400, 300);
    const holder: HTMLElement | null = lifted(container);
    expect(holder).not.toBeNull();
    expect(holder!.querySelector("[data-group-id]")).toBeNull();
    expect(holder!.querySelector('[data-hpt-leaf="b"]')).not.toBeNull();
    // Onto a's left edge: b goes beside a.
    await moveTo(20, 300);
    await release(20, 300);
    expect(changes).toHaveLength(1);
    const next: TilingLayoutNode = changes[0]!;
    expect(groupOf(next, "g")).toBeNull();
    expect(findGroupContainingLeaf(next, "B")).toBeNull();
    expect(findGroupContainingLeaf(next, "C")).toBeNull();
    // No pane lost or duplicated, and b sits beside a, on its left.
    expect([...tileIdsOf(next)].sort()).toEqual(["a", "b", "c"]);
    expect(hasSiblings(next, "b", "a")).toBe(true);
  });
});

describe("group drag — a group dropped on another pane's title bar merges", (): void => {
  it("all its panes join as tabs; its active tab becomes the active tab", async (): Promise<void> => {
    restGeometry();
    const changes: TilingLayoutNode[] = [];
    const { container } = render(<Host onLayoutReported={(next): void => void changes.push(next)} hostTiles />);
    await pressOn(header(container, "c"), 600, STRIP_PX + 10);
    groupLiftedGeometry();
    await moveTo(300, 200);
    await release(300, 200);
    expect(changes).toHaveLength(1);
    const merged: TilingGroupNode | null = findGroupContainingLeaf(changes[0]!, "A");
    expect(merged?.members.map((m: TilingLeafNode): string => m.id)).toEqual(["A", "B", "C"]);
    expect(merged?.activeMemberId).toBe("C");
  });
});
