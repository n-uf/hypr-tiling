/**
 * `WheelTouchInputPort` + `ScrollChainPort` — the wheel / touch input seam the
 * workspace swipe FSM (`engine/workspace-navigation.ts`) needs from its host.
 * The drag layer's `DragInputDriver` is pointer-only (pickup / seat / release),
 * so the swipe stream gets its own small port rather than widening that driver.
 *
 * The port delivers SAMPLES already annotated with the two facts only the DOM
 * knows: whether an element between the event target and the viewport can
 * still scroll horizontally in the sample's direction (`ScrollChainPort`), and
 * the viewport width the FSM normalises travel against. The reducer therefore
 * stays pure over the sample; the host adapter
 * (`react/dom-wheel-touch-port.ts`) owns the listeners, `passive` policy and
 * `preventDefault`.
 */

/** The axis a scroll-chain query asks about. */
export type ScrollChainAxis = "x" | "y";

/** Scroll direction along an axis: `1` towards the end (right / down), `-1` towards the start. */
export type ScrollChainDirection = -1 | 1;

/**
 * Read-only capability: can any scroll container from `element` up to (and
 * including) the viewport root still scroll along `axis` in `direction`? The
 * FSM refuses to arm while `true` — the inner content owns that wheel /
 * pan. `element` is opaque to the engine (the DOM adapter narrows it).
 */
export interface ScrollChainPort<TElement = unknown> {
  /** `true` while some container from `element` to the root can still scroll along `axis` in `direction`. */
  canScrollFurther(element: TElement | null, axis: ScrollChainAxis, direction: ScrollChainDirection): boolean;
}

/** One wheel sample, in the FSM's `WHEEL` event shape plus the port's annotations. */
export interface WheelInputSample {
  /** Horizontal scroll delta (CSS px, `deltaMode` already normalised to pixels). */
  dx: number;
  /** Vertical scroll delta (CSS px). */
  dy: number;
  /** `ctrlKey` (trackpad pinch-zoom reports as a ctrl-wheel). */
  ctrlKey: boolean;
  /** `WheelEvent.metaKey` at the sample (swipe modifier gate). */
  metaKey: boolean;
  /** `WheelEvent.altKey` at the sample (swipe modifier gate). */
  altKey: boolean;
  /** `WheelEvent.shiftKey` at the sample (swipe modifier gate). */
  shiftKey: boolean;
  /** Monotonic clock reading (ms). */
  ts: number;
  /** The scroll chain under the event target can still scroll on X in `dx`'s direction. */
  canScrollFurther: boolean;
  /** Viewport width (CSS px) at the sample; `null` when the host has no laid-out width. */
  widthPx: number | null;
}

/** One touch position sample (`TOUCH_START` / `TOUCH_MOVE`). */
export interface TouchInputSample {
  /** Finger client X. */
  x: number;
  /** Finger client Y. */
  y: number;
  /** Monotonic clock reading (ms). */
  ts: number;
  /**
   * The scroll chain under the TOUCH-START target can still scroll on X in
   * the finger's direction (judged per move; `false` on the start sample).
   */
  canScrollFurther: boolean;
  /** Viewport width (CSS px) at the sample; `null` when the host has no laid-out width. */
  widthPx: number | null;
}

/** The sink a {@link WheelTouchInputPort} delivers samples to. */
export interface WheelTouchInputListener {
  /** One `wheel` event, normalised to pixels and annotated. */
  onWheel(sample: WheelInputSample): void;
  /** A primary touch pointer went down on the host. */
  onTouchStart(sample: TouchInputSample): void;
  /** The tracked touch pointer moved. */
  onTouchMove(sample: TouchInputSample): void;
  /** The finger lifted or the browser took the touch (`pointercancel`). */
  onTouchEnd(ts: number): void;
}

/**
 * The wheel / touch subscription the swipe host runs the FSM on.
 *
 * - `subscribe` attaches the listeners (idempotent per listener) and returns
 *   the detach function.
 * - `setTracking(true)` tells the port the FSM owns the gesture: the adapter
 *   may now cancel the browser default (a non-passive `wheel` listener that
 *   calls `preventDefault`, stopping history back-swipe). Outside tracking the
 *   listeners are passive so the page scrolls normally.
 */
export interface WheelTouchInputPort {
  /** Attach `listener`; returns its detach function. Listeners are attached lazily on the first subscriber. */
  subscribe(listener: WheelTouchInputListener): () => void;
  /** The FSM is (`true`) / is not (`false`) tracking a gesture — toggles the non-passive `preventDefault` policy. */
  setTracking(tracking: boolean): void;
}
