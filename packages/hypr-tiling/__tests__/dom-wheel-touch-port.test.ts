/**
 * @jest-environment jsdom
 *
 * `createDomWheelTouchPort` stamps modifier keys from the DOM `WheelEvent`
 * onto `WheelInputSample` so the swipe FSM can apply the modifier gate.
 */
import { describe, expect, it } from "@jest/globals";
import { createDomWheelTouchPort } from "../react/dom-wheel-touch-port";
import type {
  ScrollChainPort,
  TouchInputSample,
  WheelInputSample,
  WheelTouchInputListener,
} from "../engine/wheel-touch-port";

const NO_SCROLL: ScrollChainPort<EventTarget> = {
  canScrollFurther: (): boolean => false,
};

function emptyListener(onWheel: (sample: WheelInputSample) => void): WheelTouchInputListener {
  return {
    onWheel,
    onTouchStart: (_sample: TouchInputSample): void => {},
    onTouchMove: (_sample: TouchInputSample): void => {},
    onTouchEnd: (_ts: number): void => {},
  };
}

describe("createDomWheelTouchPort — modifier keys", (): void => {
  it("populates metaKey / altKey / shiftKey from the DOM WheelEvent", (): void => {
    const element: HTMLElement = document.createElement("div");
    document.body.appendChild(element);
    const port = createDomWheelTouchPort(element, {
      wheel: true,
      touch: false,
      scrollChain: NO_SCROLL,
      now: (): number => 42,
    });
    const seen: WheelInputSample[] = [];
    const unsubscribe: () => void = port.subscribe(
      emptyListener((sample: WheelInputSample): void => {
        seen.push(sample);
      }),
    );

    element.dispatchEvent(
      new WheelEvent("wheel", {
        deltaX: 12,
        deltaY: 3,
        metaKey: true,
        altKey: false,
        shiftKey: true,
        ctrlKey: false,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      dx: 12,
      dy: 3,
      ctrlKey: false,
      metaKey: true,
      altKey: false,
      shiftKey: true,
      ts: 42,
      canScrollFurther: false,
    });

    unsubscribe();
    element.remove();
  });

  it("does not preventDefault while the FSM is not tracking", (): void => {
    const element: HTMLElement = document.createElement("div");
    document.body.appendChild(element);
    const port = createDomWheelTouchPort(element, {
      wheel: true,
      touch: false,
      scrollChain: NO_SCROLL,
    });
    port.subscribe(emptyListener((): void => {}));
    const event: WheelEvent = new WheelEvent("wheel", {
      deltaX: 20,
      metaKey: false,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    element.remove();
  });
});
