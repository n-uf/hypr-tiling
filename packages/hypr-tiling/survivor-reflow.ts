/**
 * Survivor-reflow FLIP — the pure (DOM-less) half of the live-drag survivor
 * easing.
 *
 * When the candidate tree re-derives during a live drag (slot opens, slot
 * closes / hop-out, cancel-settle gap re-open), the surviving panes change their
 * flex geometry instantly. To make them GLIDE rather than SNAP we apply FLIP
 * (First, Last, Invert, Play): measure each survivor's rect BEFORE the reflow
 * (First), let React commit the new flex geometry (Last), apply an inverting
 * `transform` so the node paints back at First, then play `transform → identity`
 * with a transition so it eases to Last. Only `transform` (translate + scale)
 * animates — GPU-composited, never `width`/`height`/`flex` of in-flow nodes, so
 * there is no layout thrash.
 *
 * The geometry decisions are extracted here as pure functions so they are unit
 * testable in the `node` jest environment (the renderer does the actual
 * `getBoundingClientRect` measurement + style mutation). Mirrors how the ghost
 * hop's gate (`drag-machine.ts:shouldReserveDragSourceSlot`) was tested at the
 * pure-function layer rather than through the DOM.
 *
 * Cross-ref: `_agent/single-instance-hop-in-drag-design.md` §4.2 (survivor
 * reflow FLIP), §7 (interruptible — First read from the live transformed box),
 * §10 (off-viewport clamp); `dynamic-tiling-renderer.tsx` (the survivor FLIP
 * layout effect + `DRAG_REFLOW_DURATION_MS` / `DRAG_REFLOW_EASING` knob).
 */

/** A measured client-coordinate rect (the subset of `DOMRect` FLIP needs). */
export interface SurvivorRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The inverting transform applied to a survivor: `translate(dx, dy) scale(sx,
 * sy)` with `transform-origin: top left`, which paints a node already laid out
 * at `last` back at `first`. Playing it to identity eases the node to `last`.
 */
export interface SurvivorFlipTransform {
  readonly dx: number;
  readonly dy: number;
  readonly sx: number;
  readonly sy: number;
}

/**
 * Sub-pixel translate threshold below which a survivor is treated as not having
 * moved (no transition armed — avoids a no-op 170ms transition that would just
 * delay settling). Matches the ghost hop's 0.5px gate.
 */
export const SURVIVOR_REFLOW_TRANSLATE_EPSILON_PX: number = 0.5;

/**
 * Scale-factor threshold below which a survivor is treated as not having
 * resized. Matches the ghost hop's 0.002 gate.
 */
export const SURVIVOR_REFLOW_SCALE_EPSILON: number = 0.002;

/** A rect with no positive area cannot be the source or target of a FLIP. */
export function isDegenerateRect(rect: SurvivorRect): boolean {
  return rect.width <= 0 || rect.height <= 0;
}

/**
 * Whether `rect` lies FULLY outside `viewport` (no overlap on either axis). Used
 * by the off-viewport clamp: a survivor whose First OR Last is fully off-screen
 * is snapped, not animated, so the compositor never tweens a far-off-screen
 * offset (`_agent/single-instance-hop-in-drag-design.md` §10).
 */
export function isRectFullyOutsideViewport(rect: SurvivorRect, viewport: SurvivorRect): boolean {
  return (
    rect.left + rect.width <= viewport.left
    || rect.left >= viewport.left + viewport.width
    || rect.top + rect.height <= viewport.top
    || rect.top >= viewport.top + viewport.height
  );
}

/**
 * The invert step. Given the survivor's pre-reflow box (`first`) and its
 * committed post-reflow box (`last`), returns the transform that paints it back
 * at `first`, or `null` when the move + resize are both below the epsilons (no
 * visible motion → caller skips arming a transition).
 */
export function deriveSurvivorFlipTransform(
  first: SurvivorRect,
  last: SurvivorRect,
  translateEpsilonPx: number = SURVIVOR_REFLOW_TRANSLATE_EPSILON_PX,
  scaleEpsilon: number = SURVIVOR_REFLOW_SCALE_EPSILON,
): SurvivorFlipTransform | null {
  const dx: number = first.left - last.left;
  const dy: number = first.top - last.top;
  const sx: number = last.width === 0 ? 1 : first.width / last.width;
  const sy: number = last.height === 0 ? 1 : first.height / last.height;
  if (
    Math.abs(dx) < translateEpsilonPx
    && Math.abs(dy) < translateEpsilonPx
    && Math.abs(sx - 1) < scaleEpsilon
    && Math.abs(sy - 1) < scaleEpsilon
  ) {
    return null;
  }
  return { dx, dy, sx, sy };
}

/**
 * Off-viewport / degenerate clamp. A survivor is animated only when both its
 * First and Last rects are non-degenerate AND neither is fully outside the
 * viewport. Otherwise it snaps (the renderer leaves it un-transformed).
 */
export function shouldAnimateSurvivorReflow(
  first: SurvivorRect,
  last: SurvivorRect,
  viewport: SurvivorRect,
): boolean {
  if (isDegenerateRect(first) || isDegenerateRect(last)) {
    return false;
  }
  if (isRectFullyOutsideViewport(first, viewport) || isRectFullyOutsideViewport(last, viewport)) {
    return false;
  }
  return true;
}

/**
 * The interrupt / retarget decision for the FLIP `First`.
 *
 * - When the survivor is mid-flight (an in-flight `transform` is present from a
 *   not-yet-finished prior FLIP), the LIVE transformed box IS the node's true
 *   current visual position, so retarget from there → the glide reverses /
 *   re-aims continuously with no snap (rapid open/close, fast zone crossing).
 * - When the survivor is at rest, the recorded pre-reflow rect is the correct
 *   First (the node's resting position before this reflow committed).
 * - A freshly mounted survivor (no recorded rect, not mid-flight) has no First →
 *   `null`, so it appears without an animation.
 *
 * This is the pure core of the §7 "First is the live `getBoundingClientRect`"
 * rule, made testable without a DOM.
 */
export function resolveSurvivorFlipFirst(params: {
  recordedPreReflowRect: SurvivorRect | null;
  liveVisualRect: SurvivorRect;
  hasInFlightTransform: boolean;
}): SurvivorRect | null {
  if (params.hasInFlightTransform) {
    return params.liveVisualRect;
  }
  return params.recordedPreReflowRect;
}
