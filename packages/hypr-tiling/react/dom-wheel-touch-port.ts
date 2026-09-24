import type {
  ScrollChainDirection,
  ScrollChainPort,
  TouchInputSample,
  WheelInputSample,
  WheelTouchInputListener,
  WheelTouchInputPort,
} from "../engine/wheel-touch-port";

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
 *   that one `pointerId` until it ends. The scroll chain is judged from the
 *   TOUCH-START target for the finger's current direction on every move.
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

  const endTouch = (): void => {
    if (activeTouch == null) {
      return;
    }
    activeTouch = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerEnd);
    window.removeEventListener("pointercancel", onPointerEnd);
    const ts: number = now();
    for (const listener of listeners) {
      listener.onTouchEnd(ts);
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (activeTouch == null || event.pointerId !== activeTouch.pointerId) {
      return;
    }
    // Finger moving LEFT reveals content on the right = scroll direction +1.
    const direction: ScrollChainDirection = event.clientX <= activeTouch.originX ? 1 : -1;
    const sample: TouchInputSample = {
      x: event.clientX,
      y: event.clientY,
      ts: now(),
      canScrollFurther: options.scrollChain.canScrollFurther(activeTouch.target, "x", direction),
      widthPx: laidOutWidth(element),
    };
    for (const listener of listeners) {
      listener.onTouchMove(sample);
    }
  };

  const onPointerEnd = (event: PointerEvent): void => {
    if (activeTouch == null || event.pointerId !== activeTouch.pointerId) {
      return;
    }
    endTouch();
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
    window.addEventListener("pointercancel", onPointerEnd);
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
      window.removeEventListener("pointercancel", onPointerEnd);
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
