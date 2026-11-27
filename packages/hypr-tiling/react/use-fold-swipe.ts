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
  readonly pointerId: number;
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

/**
 * Swipe to flip a fold (touch): a sideways swipe over a fold's open side (marked by the renderer, see
 * `FOLD_FLIP_ATTRIBUTE`) toward its spine follows the finger; released far or fast enough it calls `onFlip` with the
 * fold's split id, which opens the spine. A container that can still scroll that way first takes the swipe; past the
 * last fold the swipe is left to the workspace swipe (the touch port reports the fold as scrollable until then).
 * Vertical swipes scroll the panes as before; a second finger (a pinch) ends the swipe. Nothing happens while
 * `isBlocked` (a pane lifted by a drag).
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

    const stopListening = (): void => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
    const release = (flip: boolean): void => {
      const tracked: TrackedTouch | null = touch;
      touch = null;
      stopListening();
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

    function onMove(event: PointerEvent): void {
      const tracked: TrackedTouch | null = touch;
      if (tracked == null) {
        return;
      }
      if (event.pointerId !== tracked.pointerId) {
        // A second finger: a pinch, not a swipe.
        if (event.pointerType === "touch") release(false);
        return;
      }
      if (latestRef.current.isBlocked()) {
        release(false);
        return;
      }
      const dx: number = event.clientX - tracked.originX;
      const dy: number = event.clientY - tracked.originY;
      if (event.timeStamp > tracked.lastTs) {
        tracked.velocityPxPerMs = (event.clientX - tracked.lastX) / (event.timeStamp - tracked.lastTs);
      }
      tracked.lastX = event.clientX;
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
        const followPx: number = foldSwipeFollowPx(dx, claimed.element.clientWidth, claimed.direction);
        claimed.element.style.transform = followPx === 0 ? "" : `translateX(${followPx}px)`;
      }
    }

    function onUp(event: PointerEvent): void {
      const tracked: TrackedTouch | null = touch;
      if (tracked == null || event.pointerId !== tracked.pointerId) {
        return;
      }
      const claimed = tracked.claimed;
      // A finger that rested before it lifted is not flinging.
      const velocityPxPerMs: number =
        event.timeStamp - tracked.lastTs > FOLD_SWIPE_FLING_IDLE_MS ? 0 : tracked.velocityPxPerMs;
      release(
        claimed != null &&
          resolveFoldSwipeRelease({
            travelPx: event.clientX - tracked.originX,
            velocityPxPerMs,
            direction: claimed.direction,
            extentPx: claimed.element.clientWidth,
          }),
      );
    }

    function onCancel(event: PointerEvent): void {
      if (touch != null && event.pointerId === touch.pointerId) {
        release(false);
      }
    }

    const onDown = (event: PointerEvent): void => {
      if (event.pointerType !== "touch") {
        return;
      }
      if (!event.isPrimary) {
        // A second finger: a pinch, not a swipe.
        if (touch != null) release(false);
        return;
      }
      if (touch != null) {
        release(false);
      }
      touch = {
        pointerId: event.pointerId,
        target: event.target,
        originX: event.clientX,
        originY: event.clientY,
        lastX: event.clientX,
        lastTs: event.timeStamp,
        velocityPxPerMs: 0,
        axis: null,
        claimed: null,
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
    };

    root.addEventListener("pointerdown", onDown);
    return (): void => {
      root.removeEventListener("pointerdown", onDown);
      release(false);
    };
  }, [enabled, rootRef]);
}
