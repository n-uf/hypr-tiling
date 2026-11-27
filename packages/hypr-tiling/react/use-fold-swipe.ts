import * as React from "react";
import { prefersReducedMotion } from "@n-uf/motion/browser";
import type { ElementRef } from "../engine/element-ref";
import {
  FOLD_SPLIT_ATTRIBUTE,
  FOLD_SWIPE_FLING_IDLE_MS,
  foldSwipeFollowPx,
  resolveFoldSwipeAxis,
  resolveFoldSwipeRelease,
} from "../engine/fold-swipe";
import type { ScrollChainDirection } from "../engine/wheel-touch-port";
import { findFoldFlipElement } from "./dom-scroll-chain-port";

/** How long a swipe that doesn't turn the fold takes to slide back (ms). */
const FOLD_SWIPE_RETURN_MS: number = 180;

interface TrackedTouch {
  /** The finger's `Touch.identifier` */
  readonly id: number;
  readonly target: EventTarget | null;
  readonly originX: number;
  readonly originY: number;
  lastX: number;
  /** The last move's event time (ms) */
  lastTs: number;
  velocityPxPerMs: number;
  /** "x" once the touch is sideways, "y" once vertical (then ignored), null inside the slop */
  axis: "x" | "y" | null;
  /** The fold open side the swipe drives, and the direction it turns */
  claimed: { element: HTMLElement; direction: ScrollChainDirection } | null;
}

/** The changed touch of the tracked finger, if this event carries it. */
function trackedTouchOf(event: TouchEvent, id: number): { clientX: number; clientY: number } | null {
  const touches = event.changedTouches;
  for (let index = 0; index < touches.length; index += 1) {
    const touch = touches[index];
    if (touch.identifier === id) return touch;
  }
  return null;
}

/**
 * Swipe to flip a fold (touch): a sideways swipe over a fold's open side (marked by the renderer, see
 * `FOLD_FLIP_ATTRIBUTE`) toward its spine follows the finger; released far or fast enough it calls `onFlip` with the
 * fold's split id, which opens the spine. A container that can still scroll that way first takes the swipe; past the
 * last fold the swipe is left to the workspace swipe (the touch port reports the fold as scrollable until then).
 * Vertical swipes scroll the panes as before; a second finger (a pinch) ends the swipe. Nothing happens while
 * `isBlocked` (a pane lifted by a drag).
 *
 * It listens to touch events, not pointer events: a pane's body is a scroll container the browser may pan, and once
 * it does it cancels the pointer (`pointercancel`) while the touch events keep coming. Once the swipe has claimed a
 * fold its moves are not the browser's (`preventDefault`).
 */
export function useFoldSwipe(params: {
  rootRef: ElementRef<HTMLElement | null>;
  enabled: boolean;
  isBlocked: () => boolean;
  onFlip: (splitId: string) => void;
}): void {
  const { rootRef, enabled } = params;
  const latestRef = React.useRef(params);
  latestRef.current = params;

  React.useEffect((): (() => void) | void => {
    const root: HTMLElement | null = rootRef.current;
    if (!enabled || root == null) {
      return;
    }
    let touch: TrackedTouch | null = null;
    const readReducedMotion: () => boolean = prefersReducedMotion();

    const release = (flip: boolean): void => {
      const tracked: TrackedTouch | null = touch;
      touch = null;
      const claimed = tracked?.claimed;
      if (tracked == null || claimed == null) {
        return;
      }
      const { element } = claimed;
      const followed: string = element.style.transform;
      element.style.transform = "";
      const splitId: string | null = element.getAttribute(FOLD_SPLIT_ATTRIBUTE);
      if (flip && splitId != null) {
        latestRef.current.onFlip(splitId);
        return;
      }
      if (followed !== "" && !readReducedMotion() && typeof element.animate === "function") {
        element.animate([{ transform: followed }, { transform: "none" }], {
          duration: FOLD_SWIPE_RETURN_MS,
          easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        });
      }
    };

    const onStart = (event: TouchEvent): void => {
      if (event.touches.length > 1) {
        // A second finger: a pinch, not a swipe.
        release(false);
        return;
      }
      const start = event.changedTouches[0];
      if (start == null) {
        return;
      }
      release(false);
      touch = {
        id: start.identifier,
        target: event.target,
        originX: start.clientX,
        originY: start.clientY,
        lastX: start.clientX,
        lastTs: event.timeStamp,
        velocityPxPerMs: 0,
        axis: null,
        claimed: null,
      };
    };

    const onMove = (event: TouchEvent): void => {
      const tracked: TrackedTouch | null = touch;
      if (tracked == null) {
        return;
      }
      if (event.touches.length > 1) {
        release(false);
        return;
      }
      const point = trackedTouchOf(event, tracked.id);
      if (point == null) {
        return;
      }
      if (latestRef.current.isBlocked()) {
        release(false);
        return;
      }
      const dx: number = point.clientX - tracked.originX;
      const dy: number = point.clientY - tracked.originY;
      // Moves sharing a time stamp (coalesced) count as 1 ms apart: fast.
      tracked.velocityPxPerMs = (point.clientX - tracked.lastX) / Math.max(1, event.timeStamp - tracked.lastTs);
      tracked.lastX = point.clientX;
      tracked.lastTs = event.timeStamp;
      if (tracked.axis == null) {
        tracked.axis = resolveFoldSwipeAxis(dx, dy);
        if (tracked.axis == null) {
          return;
        }
        if (tracked.axis === "y") {
          release(false);
          return;
        }
        // A finger moving left reveals what is on the right: scroll direction +1.
        const direction: ScrollChainDirection = dx < 0 ? 1 : -1;
        const element: HTMLElement | null = findFoldFlipElement(tracked.target, "x", direction, root);
        if (element == null) {
          release(false);
          return;
        }
        tracked.claimed = { element, direction };
      }
      const claimed = tracked.claimed;
      if (claimed != null) {
        if (event.cancelable) event.preventDefault();
        const followPx: number = foldSwipeFollowPx(dx, claimed.element.clientWidth, claimed.direction);
        claimed.element.style.transform = followPx === 0 ? "" : `translateX(${followPx}px)`;
      }
    };

    const onEnd = (event: TouchEvent): void => {
      const tracked: TrackedTouch | null = touch;
      if (tracked == null) {
        return;
      }
      const point = trackedTouchOf(event, tracked.id);
      if (point == null) {
        return;
      }
      const claimed = tracked.claimed;
      // A finger that rested before it lifted is not flinging.
      const velocityPxPerMs: number =
        event.timeStamp - tracked.lastTs > FOLD_SWIPE_FLING_IDLE_MS ? 0 : tracked.velocityPxPerMs;
      release(
        claimed != null &&
          resolveFoldSwipeRelease({
            travelPx: point.clientX - tracked.originX,
            velocityPxPerMs,
            direction: claimed.direction,
            extentPx: claimed.element.clientWidth,
          }),
      );
    };

    const onCancel = (event: TouchEvent): void => {
      if (touch != null && trackedTouchOf(event, touch.id) != null) {
        release(false);
      }
    };

    // Touch events go to the element the touch started on, inside the root.
    root.addEventListener("touchstart", onStart, { passive: true });
    root.addEventListener("touchmove", onMove, { passive: false });
    root.addEventListener("touchend", onEnd);
    root.addEventListener("touchcancel", onCancel);
    return (): void => {
      root.removeEventListener("touchstart", onStart);
      root.removeEventListener("touchmove", onMove);
      root.removeEventListener("touchend", onEnd);
      root.removeEventListener("touchcancel", onCancel);
      release(false);
    };
  }, [enabled, rootRef]);
}
