/**
 * @jest-environment jsdom
 *
 * Fold flips come before the workspace swipe: the touch port reports a fold
 * that turns in the finger's direction as "can still scroll" (so the
 * workspace swipe doesn't arm), and past the last fold it doesn't (so the
 * swipe carries on into the next workspace). A container that can scroll
 * that way first takes the swipe from the fold. The wheel is unchanged.
 */
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { findFoldFlipElement } from "../react/dom-scroll-chain-port";
import { createDomWheelTouchPort } from "../react/dom-wheel-touch-port";
import type { ScrollChainPort, TouchInputSample } from "../engine/wheel-touch-port";

const NO_SCROLL: ScrollChainPort<EventTarget> = { canScrollFurther: (): boolean => false };

beforeAll((): void => {
  const globalScope = globalThis as unknown as { PointerEvent?: unknown };
  if (typeof globalScope.PointerEvent === "undefined") {
    class StubPointerEvent extends MouseEvent {
      readonly pointerId: number;
      readonly pointerType: string;
      readonly isPrimary: boolean;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
        this.pointerType = init.pointerType ?? "mouse";
        this.isPrimary = init.isPrimary ?? true;
      }
    }
    globalScope.PointerEvent = StubPointerEvent;
  }
});

afterAll((): void => {
  document.body.innerHTML = "";
});

/** root > fold open side (turns `mark`) > pane */
function tree(mark: string): { root: HTMLElement; open: HTMLElement; pane: HTMLElement } {
  const root: HTMLElement = document.createElement("div");
  const open: HTMLElement = document.createElement("div");
  open.setAttribute("data-hpt-fold-flip", mark);
  const pane: HTMLElement = document.createElement("div");
  open.appendChild(pane);
  root.appendChild(open);
  document.body.appendChild(root);
  return { root, open, pane };
}

const touch = (target: EventTarget, type: string, x: number): void => {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 3, pointerType: "touch", isPrimary: true, clientX: x, clientY: 100 }));
};

function movesOver(root: HTMLElement, pane: HTMLElement, toX: number): TouchInputSample {
  const port = createDomWheelTouchPort(root, { wheel: false, touch: true, scrollChain: NO_SCROLL, now: (): number => 1 });
  const moves: Array<TouchInputSample> = [];
  const unsubscribe = port.subscribe({
    onWheel: (): void => undefined,
    onTouchStart: (): void => undefined,
    onTouchMove: (sample: TouchInputSample): void => {
      moves.push(sample);
    },
    onTouchEnd: (): void => undefined,
  });
  touch(pane, "pointerdown", 200);
  touch(window, "pointermove", toX);
  touch(window, "pointerup", toX);
  unsubscribe();
  return moves[0];
}

describe("fold flips come before the workspace swipe", () => {
  it("a finger moving toward a fold's spine: the fold can still turn, the workspace swipe waits", () => {
    const { root, pane } = tree("x+");
    expect(movesOver(root, pane, 120).canScrollFurther).toBe(true);
  });

  it("the other way, past the last fold: the workspace swipe may take it", () => {
    const { root, pane } = tree("x+");
    expect(movesOver(root, pane, 280).canScrollFurther).toBe(false);
  });

  it("the nearest fold that turns that way is found through folds that don't", () => {
    const { open: outer, pane } = tree("x-");
    const inner: HTMLElement = document.createElement("div");
    inner.setAttribute("data-hpt-fold-flip", "x+");
    outer.replaceChild(inner, pane);
    inner.appendChild(pane);
    expect(findFoldFlipElement(pane, "x", 1)).toBe(inner);
    expect(findFoldFlipElement(pane, "x", -1)).toBe(outer);
    expect(findFoldFlipElement(pane, "y", 1)).toBeNull();
  });

  it("a container that can still scroll that way takes the swipe first", () => {
    const { open, pane } = tree("x+");
    const scroller: HTMLElement = document.createElement("div");
    scroller.style.overflowX = "auto";
    Object.defineProperty(scroller, "scrollWidth", { value: 800 });
    Object.defineProperty(scroller, "clientWidth", { value: 300 });
    open.replaceChild(scroller, pane);
    scroller.appendChild(pane);
    expect(findFoldFlipElement(pane, "x", 1)).toBeNull();
  });
});
