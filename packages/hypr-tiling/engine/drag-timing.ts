/**
 * Drag-motion reference durations — the prop-less internal timing anchors the
 * renderer's ghost choreography (ghost hop, pickup entrance) is derived from.
 * Pure constants, no React: they live in the engine layer so the `./engine`
 * entry can expose them without importing the React renderer. The
 * consumer-facing knobs (`dragAnimationEnabled`, `ghostTransitSpeedPercent`,
 * `survivorReflowSpeedPercent`, and the `DRAG_ANIMATION_SPEED_*` percents) stay
 * on the `.` renderer surface. Panes move on the leaf-motion settle, whose
 * tempo is a rate (ω), not a duration.
 */

/** Baseline ghost-hop duration at `DEFAULT_DRAG_ANIMATION_SPEED_PERCENT`. */
export const BASELINE_DRAG_HOP_DURATION_MS: number = 170;

/** Duration the drag-motion timings collapse to when `dragAnimationEnabled` is `false`. */
export const INSTANT_DRAG_DURATION_MS: number = 1;
