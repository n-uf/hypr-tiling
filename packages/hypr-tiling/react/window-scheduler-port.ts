import type { SchedulerPort } from "../core/scheduler-port";

/**
 * Default `window`-backed {@link SchedulerPort} host adapter. Repackages — without
 * any behavioral or timing change — the three `window` schedulers the renderer
 * grew independently:
 *
 *   - `requestFrame`/`cancelFrame` ← `window.requestAnimationFrame` /
 *     `window.cancelAnimationFrame` (formerly `WINDOW_FRAME_OR_TIMEOUT_SCHEDULER`'s
 *     frame half + the rAF coalescer's inline `{request,cancel}`).
 *   - `setTimer`/`clearTimer` ← `window.setTimeout` / `window.clearTimeout`
 *     (formerly `WINDOW_FRAME_OR_TIMEOUT_SCHEDULER` + `WINDOW_TIMER_SCHEDULER`).
 *   - `now` ← `performance.now()` where available, else `Date.now()` (formerly
 *     the `monotonicNow` helper).
 *
 * `window` / `performance` are touched only inside the returned closures, so a
 * port created at module scope is SSR-safe (the closures run only in a browser,
 * inside effects) — matching the stable module-scope identity the constants had.
 */
export function createWindowSchedulerPort(): SchedulerPort {
  return {
    requestFrame: (callback: () => void): number => window.requestAnimationFrame(callback),
    cancelFrame: (handle: number): void => window.cancelAnimationFrame(handle),
    setTimer: (callback: () => void, ms: number): number => window.setTimeout(callback, ms),
    clearTimer: (handle: number): void => window.clearTimeout(handle),
    now: (): number => (typeof performance !== "undefined" ? performance.now() : Date.now()),
  };
}
