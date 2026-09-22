/**
 * Drag-motion reference durations — the prop-less internal timing anchors the
 * renderer's drag choreography (ghost hop, survivor reflow, pickup entrance,
 * swap dip) is derived from. Pure constants, no React: they live in the engine
 * layer so the `./engine` entry can expose them without importing the React
 * renderer. The consumer-facing knobs (`dragAnimationEnabled`,
 * `ghostTransitSpeedPercent`, `survivorReflowSpeedPercent`, and the
 * `DRAG_ANIMATION_SPEED_*` percents) stay on the `.` renderer surface.
 */

/** Baseline ghost-hop / survivor-reflow duration at `DEFAULT_DRAG_ANIMATION_SPEED_PERCENT`. */
export const BASELINE_DRAG_HOP_DURATION_MS: number = 170;

/** Duration the drag-motion timings collapse to when `dragAnimationEnabled` is `false`. */
export const INSTANT_DRAG_DURATION_MS: number = 1;
