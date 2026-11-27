import type {
  ScrollChainDirection,
  ScrollChainPort,
  TouchInputSample,
  WheelInputSample,
  WheelTouchInputListener,
  WheelTouchInputPort,
} from "../engine/wheel-touch-port";
import { findFoldFlipElement } from "./dom-scroll-chain-port";

/** After a touch pointer is cancelled, how long (ms) to wait for the finger's next touch event before ending. */
const TOUCH_FOLLOW_TIMEOUT_MS: number = 400;

/** `WheelEvent.deltaMode` line unit → CSS px (the Firefox line-mode convention). */
const WHEEL_LINE_PX: number = 16;

/** Options of {@link createDomWheelTouchPort}. */
export interface DomWheelTouchPortOptions {
  /** Attach the `wheel` listener. */
  wheel: boolean;
  /** Attach the touch (`pointer*` with `pointerType === "touch"`) listeners. */
  touch: boolean;
  /** Scroll-chain oracle for `canScrollFurther` (`createDomScrollChainPort` over the same root). */
  scrollChain: ScrollChainPort<EventTarget>;
  /** Monotonic clock (ms); default `performance.now()`. */
  now?: () => number;
}

function defaultNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** `deltaX` / `deltaY` in CSS px whatever the event's `deltaMode`. */
export function normaliseWheelDelta(event: WheelEvent, clientWidth: number): { dx: number; dy: number } {
  if (event.deltaMode === 1) {
    return { dx: event.deltaX * WHEEL_LINE_PX, dy: event.deltaY * WHEEL_LINE_PX };
  }
  if (event.deltaMode === 2) {
    return { dx: event.deltaX * clientWidth, dy: event.deltaY * clientWidth };
  }
  return { dx: event.deltaX, dy: event.deltaY };
}

function laidOutWidth(element: HTMLElement): number | null {
  const width: number = element.clientWidth;
  return width > 0 ? width : null;
}

/**
 * Default DOM-backed {@link WheelTouchInputPort} over one viewport root
 * element.
 *
 * - `wheel`: a `wheel` listener on `element`. Registered `passive: true` at
 *   rest so page scrolling is never blocked; `setTracking(true)` re-registers
 *   it `passive: false` and every sample then calls `preventDefault()` so the
 *   browser's own horizontal handling (history back-swipe, ancestor scroll)
 *   stays out of a gesture the FSM owns. `setTracking(false)` restores the
 *   passive listener.
 * - `touch`: `pointerdown` (`pointerType === "touch"`) on `element` starts a
 *   gesture; `pointermove` / `pointerup` / `pointercancel` on `window` follow
 *   that one `pointerId` until it ends. When the browser cancels the pointer
 *   (a touch that starts in a container it may pan, such as a pane's
 *   scrolling body), the same finger is followed through touch events
 *   (`touchmove` / `touchend`) instead; a second finger ends the gesture. The
 *   scroll chain is judged from the TOUCH-START target for the finger's
 *   current direction on every move.
 *
 * Samples carry `element.clientWidth` as `widthPx`, or `null` when the element
 * has no laid-out width (so the FSM keeps its context / config width).
 */
export function createDomWheelTouchPort(
  element: HTMLElement,
  options: DomWheelTouchPortOptions,
): WheelTouchInputPort {
  const now: () => number = options.now ?? defaultNow;
  const listeners: Set<WheelTouchInputListener> = new Set<WheelTouchInputListener>();
  let tracking: boolean = false;
  let wheelAttached: boolean = false;
  let wheelPassive: boolean = true;
  let touchAttached: boolean = false;
  let activeTouch: { pointerId: number; target: EventTarget | null; originX: number } | null = null;

  const onWheel = (event: WheelEvent): void => {
    if (tracking && event.cancelable) {
      event.preventDefault();
    }
    const { dx, dy } = normaliseWheelDelta(event, element.clientWidth);
    const direction: ScrollChainDirection = dx >= 0 ? 1 : -1;
    const sample: WheelInputSample = {
      dx,
      dy,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      ts: now(),
      canScrollFurther:
        dx === 0 ? false : options.scrollChain.canScrollFurther(event.target, "x", direction),
      widthPx: laidOutWidth(element),
    };
    for (const listener of listeners) {
      listener.onWheel(sample);
    }
  };

  const attachWheel = (passive: boolean): void => {
    if (wheelAttached) {
      element.removeEventListener("wheel", onWheel);
    }
    element.addEventListener("wheel", onWheel, { passive });
    wheelAttached = true;
    wheelPassive = passive;
  };

  const detachWheel = (): void => {
    if (wheelAttached) {
      element.removeEventListener("wheel", onWheel);
      wheelAttached = false;
    }
  };

  // After the browser cancels the touch pointer (it does when the touch starts
  // in a container it may pan, such as a pane's scrolling body), the same
  // finger is followed through touch events, which keep coming; without
  // them, or if none comes soon, the gesture ends as before.
  let followTimer: ReturnType<typeof setTimeout> | null = null;

  const stopFollowingTouches = (): void => {
    if (followTimer != null) {
      clearTimeout(followTimer);
      followTimer = null;
    }
    window.removeEventListener("touchmove", onTouchEventMove);
    window.removeEventListener("touchend", onTouchEventEnd);
    window.removeEventListener("touchcancel", onTouchEventEnd);
  };

  const endTouch = (): void => {
    if (activeTouch == null) {
      return;
    }
    activeTouch = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerEnd);
    window.removeEventListener("pointercancel", onPointerCancel);
    stopFollowingTouches();
    const ts: number = now();
    for (const listener of listeners) {
      listener.onTouchEnd(ts);
    }
  };

  const moveTo = (clientX: number, clientY: number): void => {
    if (activeTouch == null) {
      return;
    }
    // Finger moving LEFT reveals content on the right = scroll direction +1.
    const direction: ScrollChainDirection = clientX <= activeTouch.originX ? 1 : -1;
    const sample: TouchInputSample = {
      x: clientX,
      y: clientY,
      ts: now(),
      // A fold that turns this way takes the swipe first (`useFoldSwipe`): the
      // workspace swipe only arms past the last fold.
      canScrollFurther:
        options.scrollChain.canScrollFurther(activeTouch.target, "x", direction) ||
        findFoldFlipElement(activeTouch.target, "x", direction, element) != null,
      widthPx: laidOutWidth(element),
    };
    for (const listener of listeners) {
      listener.onTouchMove(sample);
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (activeTouch == null || event.pointerId !== activeTouch.pointerId) {
      return;
    }
    moveTo(event.clientX, event.clientY);
  };

  const onPointerEnd = (event: PointerEvent): void => {
    if (activeTouch == null || event.pointerId !== activeTouch.pointerId) {
      return;
    }
    endTouch();
  };

  function onTouchEventMove(event: TouchEvent): void {
    if (followTimer != null) {
      clearTimeout(followTimer);
      followTimer = null;
    }
    const finger = event.touches.length === 1 ? event.touches[0] : null;
    if (finger == null) {
      // A second finger (a pinch), or none: not a swipe.
      endTouch();
      return;
    }
    moveTo(finger.clientX, finger.clientY);
  }

  function onTouchEventEnd(event: TouchEvent): void {
    if (event.touches.length === 0) {
      endTouch();
    }
  }

  const onPointerCancel = (event: PointerEvent): void => {
    if (activeTouch == null || event.pointerId !== activeTouch.pointerId) {
      return;
    }
    if (typeof TouchEvent === "undefined") {
      endTouch();
      return;
    }
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerEnd);
    window.removeEventListener("pointercancel", onPointerCancel);
    window.addEventListener("touchmove", onTouchEventMove, { passive: true });
    window.addEventListener("touchend", onTouchEventEnd);
    window.addEventListener("touchcancel", onTouchEventEnd);
    followTimer = setTimeout((): void => {
      followTimer = null;
      endTouch();
    }, TOUCH_FOLLOW_TIMEOUT_MS);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType !== "touch" || !event.isPrimary) {
      return;
    }
    if (activeTouch != null) {
      endTouch();
    }
    activeTouch = { pointerId: event.pointerId, target: event.target, originX: event.clientX };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerCancel);
    const sample: TouchInputSample = {
      x: event.clientX,
      y: event.clientY,
      ts: now(),
      canScrollFurther: false,
      widthPx: laidOutWidth(element),
    };
    for (const listener of listeners) {
      listener.onTouchStart(sample);
    }
  };

  const attachTouch = (): void => {
    if (!touchAttached) {
      element.addEventListener("pointerdown", onPointerDown);
      touchAttached = true;
    }
  };

  const detachTouch = (): void => {
    if (touchAttached) {
      element.removeEventListener("pointerdown", onPointerDown);
      touchAttached = false;
    }
    if (activeTouch != null) {
      activeTouch = null;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerCancel);
      stopFollowingTouches();
    }
  };

  return {
    subscribe: (listener: WheelTouchInputListener): (() => void) => {
      listeners.add(listener);
      if (listeners.size === 1) {
        if (options.wheel) {
          attachWheel(!tracking);
        }
        if (options.touch) {
          attachTouch();
        }
      }
      return (): void => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          detachWheel();
          detachTouch();
        }
      };
    },
    setTracking: (next: boolean): void => {
      if (tracking === next) {
        return;
      }
      tracking = next;
      // Non-passive only while the FSM owns the gesture (so `preventDefault`
      // is honoured); passive otherwise so page scrolling is never blocked.
      if (wheelAttached && wheelPassive === next) {
        attachWheel(!next);
      }
    },
  };
}
