/**
 * @jest-environment jsdom
 *
 * Under `dragPreview: "snap"` the drop a release commits depends only on where
 * the pointer is released, not on the slot it settled into on the way: two
 * different paths to the same release point give the same layout, the one the
 * drop indicator would show at that point. The snap hysteresis is visual only.
 *
 * jsdom has no layout: every leaf wrapper (`[data-hpt-leaf]`, keyed by tile id)
 * reports the rect in `GEOMETRY`; a group tab strip (and its tabs) reports
 * `GEOMETRY["strip"]`; the viewport is 1000×600.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "@jest/globals";
import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { TilingRenderer } from "../react/tiling-renderer";
import { findGroupContainingLeaf } from "../engine/state";
import type {
  TilingGroupNode,
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

/** a lifted: the group alone fills the viewport, its strip across the top. */
function paneLiftedGeometry(): void {
  GEOMETRY.set("c", { x: 0, y: STRIP_PX, width: 1000, height: 600 - STRIP_PX });
  GEOMETRY.set("strip", { x: 0, y: 0, width: 1000, height: STRIP_PX });
}

/** The group lifted: a alone fills the viewport. */
function groupLiftedGeometry(): void {
  GEOMETRY.set("a", { x: 0, y: 0, width: 1000, height: 600 });
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** The previews that make room for the dragged pane: snap to slot, and the indicator with `dragPreviewMakesRoom`. */
type RoomPreview = "snap" | "indicator-makes-room";

function Host({
  onLayoutReported,
  preview = "snap",
}: {
  onLayoutReported: (next: TilingLayoutNode) => void;
  preview?: RoomPreview;
}): React.ReactElement {
  const [layout, setLayout] = React.useState<TilingLayoutNode>(LAYOUT);
  return (
    <TilingRenderer
      layout={layout}
      tiles={TILES}
      config={CONFIG}
      paneIdentity="stable"
      dragPreview={preview === "snap" ? "snap" : "indicator"}
      dragPreviewMakesRoom={preview === "indicator-makes-room"}
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

interface Point {
  x: number;
  y: number;
}

async function moveTo(point: Point): Promise<void> {
  await act(async (): Promise<void> => {
    pointer(window, "pointermove", point.x, point.y);
    await wait(20);
  });
}

async function pressOn(element: Element | null, point: Point): Promise<void> {
  if (element == null) {
    throw new Error("nothing to press");
  }
  await act(async (): Promise<void> => {
    pointer(element, "pointerdown", point.x, point.y);
    await wait(5);
  });
}

async function release(point: Point): Promise<void> {
  await act(async (): Promise<void> => {
    pointer(window, "pointerup", point.x, point.y);
    await wait(20);
  });
}

const header = (container: HTMLElement, tileId: string): Element | null =>
  container.querySelector(`[data-hpt-leaf="${tileId}"] article header`);

/**
 * One drag under snap to slot: press at `press` on `grip`, set the lifted
 * geometry, glide through `via` to `to`, release there; the layout it commits.
 */
async function dragCommit(args: {
  grip: (container: HTMLElement) => Element | null;
  press: Point;
  lifted: () => void;
  via: ReadonlyArray<Point>;
  to: Point;
  preview?: RoomPreview;
  /** Runs once the pointer has been through `via`: the preview has made room, so stubbed geometry may move. */
  afterVia?: () => void;
}): Promise<TilingLayoutNode> {
  restGeometry();
  const changes: TilingLayoutNode[] = [];
  const { container, unmount } = render(
    <Host onLayoutReported={(next): void => void changes.push(next)} preview={args.preview} />,
  );
  await pressOn(args.grip(container), args.press);
  args.lifted();
  for (const point of args.via) {
    await moveTo(point);
  }
  args.afterVia?.();
  await moveTo(args.to);
  await release(args.to);
  unmount();
  expect(changes).toHaveLength(1);
  return changes[0]!;
}

function tileIdsOf(node: TilingLayoutNode): string[] {
  if (node.kind === "leaf") return [node.tileId];
  if (node.kind === "group") return node.members.map((member: TilingLeafNode): string => member.tileId);
  return [...tileIdsOf(node.first), ...tileIdsOf(node.second)];
}

describe("snap to slot — the drop depends only on where the pointer is released", (): void => {
  it("a pane released on a group's strip merges into it, whether it came straight or settled into another slot first", async (): Promise<void> => {
    const strip: Point = { x: 750, y: 10 };
    const straight: TilingLayoutNode = await dragCommit({
      grip: (container) => header(container, "a"),
      press: { x: 100, y: 20 },
      lifted: paneLiftedGeometry,
      via: [],
      to: strip,
    });
    // Over the group's body first: the pane settles into a slot that contains the strip point.
    const detour: TilingLayoutNode = await dragCommit({
      grip: (container) => header(container, "a"),
      press: { x: 100, y: 20 },
      lifted: paneLiftedGeometry,
      via: [{ x: 750, y: 60 }],
      to: strip,
    });
    const merged: TilingGroupNode | null = findGroupContainingLeaf(straight, "A");
    expect(merged?.members.map((m: TilingLeafNode): string => m.id).sort()).toEqual(["A", "B", "C"]);
    expect(merged?.activeMemberId).toBe("A");
    expect(detour).toEqual(straight);
  });

  it("a group released on a pane's lower edge lands there, whether it came straight or settled into a swap slot first", async (): Promise<void> => {
    const lowerEdge: Point = { x: 400, y: 580 };
    const grip = (container: HTMLElement): Element | null => header(container, "c");
    const straight: TilingLayoutNode = await dragCommit({
      grip,
      press: { x: 600, y: STRIP_PX + 10 },
      lifted: groupLiftedGeometry,
      via: [],
      to: lowerEdge,
    });
    // Over alpha's centre first: the group settles into alpha's own slot (a swap), which contains the release point.
    const detour: TilingLayoutNode = await dragCommit({
      grip,
      press: { x: 600, y: STRIP_PX + 10 },
      lifted: groupLiftedGeometry,
      via: [{ x: 50, y: 300 }],
      to: lowerEdge,
    });
    // Alpha above, the group (same members, order and active tab) below it.
    expect(straight.kind === "split" && straight.axis).toBe("vertical");
    expect(straight.kind === "split" && straight.first.kind === "leaf" && straight.first.tileId).toBe("a");
    const group: TilingGroupNode | null = findGroupContainingLeaf(straight, "B");
    expect(group?.members.map((m: TilingLeafNode): string => m.id)).toEqual(["B", "C"]);
    expect(group?.activeMemberId).toBe("C");
    expect([...tileIdsOf(straight)].sort()).toEqual(["a", "b", "c"]);
    expect(detour).toEqual(straight);
  });
});

describe("a preview that makes room moves the group's strip; a release on the strip's resting place still merges", (): void => {
  /** Over the group's top edge: the pane takes the top half and the group (strip and all) moves down. */
  const OVER_TOP_EDGE: Point = { x: 750, y: 60 };
  /** The strip where it rests, with no room made. */
  const STRIP_AT_REST: Point = { x: 750, y: 10 };
  const roomMadeGeometry = (): void => {
    GEOMETRY.set("strip", { x: 0, y: 300, width: 1000, height: STRIP_PX });
    GEOMETRY.set("c", { x: 0, y: 300 + STRIP_PX, width: 1000, height: 300 - STRIP_PX });
  };

  for (const preview of ["snap", "indicator-makes-room"] as const) {
    it(`${preview}: the strip is hit-tested where it rests, not where the preview moved it`, async (): Promise<void> => {
      const committed: TilingLayoutNode = await dragCommit({
        grip: (container) => header(container, "a"),
        press: { x: 100, y: 20 },
        lifted: paneLiftedGeometry,
        via: [OVER_TOP_EDGE],
        afterVia: roomMadeGeometry,
        to: STRIP_AT_REST,
        preview,
      });
      const merged: TilingGroupNode | null = findGroupContainingLeaf(committed, "A");
      expect(merged?.members.map((m: TilingLeafNode): string => m.id).sort()).toEqual(["A", "B", "C"]);
      expect(merged?.activeMemberId).toBe("A");
    });
  }
});
