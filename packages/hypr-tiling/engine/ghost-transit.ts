/**
 * Ghost bbox transit — the pure (DOM-less) half of the drag-ghost motion:
 * pickup-scale, hop-in / hop-out scale-morph and the magnetic ease.
 *
 * The renderer (`tiling-renderer.tsx`, `DragPaneOverlay`) does the actual
 * `getBoundingClientRect` measurement + style mutation; the geometry + easing
 * decisions live here as pure functions so they are unit-testable in the
 * `node` jest environment. The panes themselves move on leaf motion
 * (`leaf-motion.ts`); only the ghost keeps this FLIP until it is replaced.
 *
 * Cross-ref: `_agent/ghost-bbox-transit-design.md` (§2 scale-morph math, §5
 * magnetic ease), `drag-machine.ts` (the drag FSM the ghost sub-states map onto).
 */

/** A measured client-coordinate rect (the subset of `DOMRect` the morph needs). @internal */
export interface GhostRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** A client-coordinate point (a pointer-anchor offset within the ghost box). @internal */
export interface GhostPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * The FLIP morph transform applied to the ghost: `translate(tx, ty) scale(sx,
 * sy)` with `transform-origin: top left`, which paints a node laid out at `last`
 * back at `first`. Playing it to identity eases the node to `last`.
 * @internal
 */
export interface GhostMorphTransform {
  readonly tx: number;
  readonly ty: number;
  readonly sx: number;
  readonly sy: number;
}

/** Min / max / default for the ghost pickup scale (percent of the source bbox). @internal */
export const GHOST_PICKUP_SCALE_MIN_PERCENT: number = 10;
/** @internal */
export const GHOST_PICKUP_SCALE_MAX_PERCENT: number = 150;
/** @internal */
export const DEFAULT_GHOST_PICKUP_SCALE_PERCENT: number = 90;

/** Sub-pixel translate / scale no-op gates for the ghost hop. @internal */
export const GHOST_MORPH_TRANSLATE_EPSILON_PX: number = 0.5;
/** @internal */
export const GHOST_MORPH_SCALE_EPSILON: number = 0.002;

/** Fraction of the hop after which the magnetic ease snaps into the slot (last ~15%). @internal */
export const MAGNETIC_EASE_SPLIT: number = 0.85;

/** Distance fraction covered by the end of the magnetic decel segment (the rest snaps in). */
const MAGNETIC_EASE_SPLIT_VALUE: number = 0.8;

/** Default sample count for `buildLinearEasingCss` (resolution of the `linear()` curve). @internal */
export const MAGNETIC_EASE_SAMPLE_COUNT: number = 16;

/** Clamp a pickup-scale percent into `[10, 150]`; `NaN` collapses to the default. @internal */
export function clampGhostPickupScalePercent(percent: number): number {
  if (Number.isNaN(percent)) {
    return DEFAULT_GHOST_PICKUP_SCALE_PERCENT;
  }
  return Math.min(Math.max(percent, GHOST_PICKUP_SCALE_MIN_PERCENT), GHOST_PICKUP_SCALE_MAX_PERCENT);
}

/** The clamped pickup-scale percent as a unit factor (e.g. `90` → `0.9`). @internal */
export function ghostPickupScaleFactor(percent: number): number {
  return clampGhostPickupScalePercent(percent) / 100;
}

/** A rect with no positive area cannot be a morph source or target. @internal */
export function isDegenerateGhostRect(rect: GhostRect): boolean {
  return rect.width <= 0 || rect.height <= 0;
}

/**
 * The free-following ghost's resting box: the source box scaled by `scaleFactor`
 * ABOUT THE GRAB POINT, so the grabbed content stays under the cursor. With the
 * grab offset `(gx, gy)` inside the source box, scaling by `f` about that point
 * leaves the grab point fixed: `left' = left + gx·(1 − f)`, `width' = width·f`.
 * @internal
 */
export function deriveGhostPickupBox(
  activeFootprint: GhostRect,
  pointerAnchorOffset: GhostPoint,
  scaleFactor: number,
): GhostRect {
  return {
    left: activeFootprint.left + pointerAnchorOffset.x * (1 - scaleFactor),
    top: activeFootprint.top + pointerAnchorOffset.y * (1 - scaleFactor),
    width: activeFootprint.width * scaleFactor,
    height: activeFootprint.height * scaleFactor,
  };
}

/**
 * The FLIP invert step for the ghost morph. Given the ghost's pre-morph box
 * (`first`, the LIVE `getBoundingClientRect`) and its committed resting box
 * (`last`, the node's new layout box), returns the transform that paints it back
 * at `first`, or `null` when the move + resize are both below the epsilons (no
 * visible motion → caller skips arming a transition).
 * @internal
 */
export function deriveGhostMorphTransform(
  first: GhostRect,
  last: GhostRect,
  translateEpsilonPx: number = GHOST_MORPH_TRANSLATE_EPSILON_PX,
  scaleEpsilon: number = GHOST_MORPH_SCALE_EPSILON,
): GhostMorphTransform | null {
  const tx: number = first.left - last.left;
  const ty: number = first.top - last.top;
  const sx: number = last.width === 0 ? 1 : first.width / last.width;
  const sy: number = last.height === 0 ? 1 : first.height / last.height;
  if (
    Math.abs(tx) < translateEpsilonPx
    && Math.abs(ty) < translateEpsilonPx
    && Math.abs(sx - 1) < scaleEpsilon
    && Math.abs(sy - 1) < scaleEpsilon
  ) {
    return null;
  }
  return { tx, ty, sx, sy };
}

/**
 * The interrupt / retarget decision for the ghost-hop FLIP `First`.
 *
 * The ghost outer `fixed` div is positioned by React inline `left`/`top` from
 * its base rect (the cursor pickup box while free-following, the slot rect when
 * seated). React applies that inline base in the SAME commit, BEFORE the morph
 * layout effect runs — so `node.getBoundingClientRect()` read inside the effect
 * already reports the NEW base (e.g. the slot), not the box the ghost was
 * painted at last frame. Using that live box as First on a CLEAN hop (no
 * in-flight transform) makes First === Last → a zero invert → no transition is
 * armed → the ghost teleports and the resolved hop duration has NO visible
 * effect. The previous-frame box is therefore the correct First at rest:
 *
 * - Mid-flight (an in-flight `transform` from a not-yet-finished prior hop is
 *   present): the LIVE transformed box IS the ghost's true current visual box,
 *   so retarget from there → an interrupted / re-seated hop re-aims smoothly.
 * - At rest: the PREVIOUS committed base rect (the box painted last frame — the
 *   cursor box on a follow→seat hop-in, the slot on a seat→follow hop-out) is
 *   the correct First, so the hop glides the full distance over the duration.
 * - No previous rect recorded yet (very first frame, not mid-flight) → fall back
 *   to the live box so the caller always has a usable, non-null First.
 *
 * Cross-ref: `_agent/single-instance-hop-in-drag-design.md` §4.1 (the FLIP First
 * "measured BEFORE the new base is applied" rule this restores).
 * @internal
 */
export function resolveGhostHopFirstRect(params: {
  previousBaseRect: GhostRect | null;
  liveVisualRect: GhostRect;
  hasInFlightTransform: boolean;
}): GhostRect {
  if (params.hasInFlightTransform) {
    return params.liveVisualRect;
  }
  return params.previousBaseRect ?? params.liveVisualRect;
}

function easeOutCubic(u: number): number {
  return 1 - Math.pow(1 - u, 3);
}

function easeInCubic(v: number): number {
  return v * v * v;
}

/**
 * Magnetic hop-in progress: a two-segment ease that decelerates approaching the
 * slot (the `[0, split]` ease-out reaching `MAGNETIC_EASE_SPLIT_VALUE`) then
 * SNAPS the remaining distance over the last `(1 − split)` of the time
 * (accelerating ease-in to `1`). The last segment's average speed exceeds the
 * approach's average speed — the "click into the slot" pull. Endpoints are
 * pinned `progress(0) = 0`, `progress(1) = 1`; monotonic non-decreasing, so it
 * never passes the slot.
 * @internal
 */
export function magneticEaseProgress(t: number, split: number = MAGNETIC_EASE_SPLIT): number {
  if (t <= 0) {
    return 0;
  }
  if (t >= 1) {
    return 1;
  }
  if (t < split) {
    return MAGNETIC_EASE_SPLIT_VALUE * easeOutCubic(t / split);
  }
  const tailProgress: number = (t - split) / (1 - split);
  return MAGNETIC_EASE_SPLIT_VALUE + (1 - MAGNETIC_EASE_SPLIT_VALUE) * easeInCubic(tailProgress);
}

/**
 * Build a CSS `linear()` timing function by sampling `magneticEaseProgress` at
 * `sampleCount + 1` evenly-spaced points. CSS single cubic-beziers cannot
 * express the two-segment magnetic ease, so the sampled `linear()` curve carries
 * it to the compositor. Evergreen-engine feature (the host-app target).
 * @internal
 */
export function buildLinearEasingCss(sampleCount: number = MAGNETIC_EASE_SAMPLE_COUNT): string {
  const points: string[] = [];
  for (let index: number = 0; index <= sampleCount; index += 1) {
    const t: number = index / sampleCount;
    points.push(magneticEaseProgress(t).toFixed(4));
  }
  return `linear(${points.join(", ")})`;
}
