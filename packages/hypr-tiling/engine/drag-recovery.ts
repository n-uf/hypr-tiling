/**
 * Drag / transition self-healing recovery layer — the PURE (DOM-less) primitives
 * that harden the live-drag animation + timing layer against frame starvation
 * (background-tab `requestAnimationFrame` suspension, CPU throttling, long
 * tasks, dropped/late pointer events, interrupted transitions).
 *
 * The drag FINITE-STATE MACHINE (`drag-machine.ts`) is already logically
 * un-wedgeable — every non-idle phase has an enumerated cancel edge back to
 * `idle`. The exposure this module closes is the ANIMATION + TIMING layer that
 * sits around the FSM:
 *
 * - The ghost hop's FLIP "play-to-identity" step is armed inside a bare
 *   `requestAnimationFrame`; if that frame never arrives the ghost is frozen
 *   at its inverted `First` (visibly displaced / scaled). → M1.
 * - No max-duration watchdog on `armed` / `dragging`: if every terminal pointer
 *   event is lost the FSM stays `dragging` forever, holding pointer capture. → M3.
 *
 * The panes themselves move on leaf motion (`leaf-motion.ts`): a settle stepped
 * by one frame loop, with no CSS transition to wait for, strip or rescue, so
 * the old transition-end race (M2), stuck-transform guard (M2b) and style
 * teardown (M4) went with the survivor FLIP they guarded.
 *
 * Design constraints (mirrors `_agent/drag-subsystem-audit.md` §"self-healing"):
 * - DOM-less + injected clock / scheduler, exactly like `createFrameCoalescer`
 *   + `FrameScheduler` in `drag-machine.ts`, so every primitive is unit-testable
 *   in the `node` jest environment with fake timers + an injected `now`.
 * - All deadlines are typed, documented multiples of the animation duration or
 *   of a frame — never symptom-tuned magic constants.
 *
 * The recovery layer composes AROUND the existing machine: M3 feeds the existing
 * `POINTER_CANCEL` edge (no new FSM phase / event) and M1 hardens the ghost's
 * animation arming. The FSM / candidate-tree / geometry core and the
 * content-agnostic presentation rule are untouched.
 */

/**
 * Multiple of the baseline hop duration used as the DEFAULT drag idle-watchdog
 * deadline (M3). Expressed as a documented multiple — never a symptom-tuned
 * constant — so the deadline scales with the configured animation speed. 30×
 * ≈ 5100ms: comfortably longer than any real deliberate re-aim pause (so no
 * genuine drag trips it), short enough that a wedged `dragging` self-heals
 * within a few seconds.
 */
export const DRAG_RECOVERY_MAX_DRAGGING_IDLE_HOP_MULTIPLE: number = 30;

/**
 * Pure mirror of the renderer's `BASELINE_DRAG_HOP_DURATION_MS` (170ms at
 * default animation speed). The recovery defaults derive from it WITHOUT
 * importing the renderer: `interaction-capabilities.ts` (where these defaults
 * are consumed) is itself imported BY the renderer, so importing the renderer
 * constant back would form an evaluation-order import cycle that leaves the
 * defaults `NaN`. Kept private; only the derived defaults below are exported.
 */
const BASELINE_HOP_DURATION_MS: number = 170;

/**
 * Default M3 idle deadline (ms): `30 × 170 ≈ 5100`. A drag with no
 * `POINTER_MOVE` / `TARGET_RESOLVED` progress for this long (monotonic) is
 * force-reconciled to `idle` via the existing `POINTER_CANCEL` edge.
 */
export const DRAG_RECOVERY_DEFAULT_MAX_DRAGGING_IDLE_MS: number =
  DRAG_RECOVERY_MAX_DRAGGING_IDLE_HOP_MULTIPLE * BASELINE_HOP_DURATION_MS;

/**
 * Default M1 rAF-fallback slack (ms) ≈ 2 frames @ 60Hz. Only guarantees the
 * "play-to-identity" transition gets WRITTEN when the compositor frame is
 * starved; the easing duration itself is unchanged.
 */
export const DRAG_RECOVERY_DEFAULT_FRAME_DEADLINE_MS: number = 32;

/**
 * Injected frame + timer scheduler for M1's rAF-with-timeout race. The renderer
 * supplies the real `window.requestAnimationFrame` / `window.setTimeout`
 * family; tests supply controllable fakes. Kept separate from
 * `drag-machine.ts:FrameScheduler` (which has only `request`/`cancel`) because
 * M1 additionally needs the timer half to race the frame.
 */
export interface FrameOrTimeoutScheduler {
  requestFrame: (callback: () => void) => number;
  cancelFrame: (handle: number) => void;
  setTimer: (callback: () => void, ms: number) => number;
  clearTimer: (handle: number) => void;
}

/** A cancelable, run-at-most-once raced handle returned by M1. */
export interface RacedFrameHandle {
  /** Cancel the pending frame + timer if the callback has not yet run. */
  cancel: () => void;
}

/**
 * M1 — rAF-with-timeout race primitive (fixes V1, the ghost hop frozen at its
 * `First`).
 *
 * Races `requestFrame` against `setTimer(frameDeadlineMs)`. The FIRST to fire
 * runs `callback`; the loser is cancelled. The run is IDEMPOTENT — a `hasRun`
 * guard guarantees the "play-to-identity" write happens EXACTLY ONCE and ALWAYS,
 * even if the compositor frame is starved for the whole gesture (the timer wins)
 * or both fire in the same tick. `cancel()` drops both pending handles iff the
 * callback has not already run, so a superseding hop / teardown can abort a
 * still-pending play without double-running it.
 *
 * `frameDeadlineMs` is the rAF-fallback slack (default ≈2 frames upstream), NOT
 * the easing duration — it only guarantees the transition gets WRITTEN when the
 * frame is late; the actual ease timing is unchanged.
 */
export function scheduleFrameOrTimeout(
  scheduler: FrameOrTimeoutScheduler,
  frameDeadlineMs: number,
  callback: () => void,
): RacedFrameHandle {
  let hasRun: boolean = false;
  let frameHandle: number | null = null;
  let timerHandle: number | null = null;

  const clearPending = (): void => {
    if (frameHandle != null) {
      scheduler.cancelFrame(frameHandle);
      frameHandle = null;
    }
    if (timerHandle != null) {
      scheduler.clearTimer(timerHandle);
      timerHandle = null;
    }
  };

  const runOnce = (): void => {
    if (hasRun) {
      return;
    }
    hasRun = true;
    clearPending();
    callback();
  };

  frameHandle = scheduler.requestFrame(runOnce);
  timerHandle = scheduler.setTimer(runOnce, frameDeadlineMs);

  return {
    cancel: (): void => {
      if (hasRun) {
        return;
      }
      hasRun = true;
      clearPending();
    },
  };
}

/** Injected timer scheduler for M3 (no frame half needed). */
export interface TimerScheduler {
  setTimer: (callback: () => void, ms: number) => number;
  clearTimer: (handle: number) => void;
}

/**
 * M3 — drag idle watchdog (fixes V4, the central self-healing gap). The
 * imperative handle the renderer drives from its drag-phase effect.
 */
export interface DragWatchdog {
  /**
   * Record a progress event (`POINTER_MOVE` / `TARGET_RESOLVED`, or the initial
   * arm). Stamps the last-progress time with the injected `now` and (re-)arms
   * the idle timer. Calling this is how the watchdog is started AND re-armed.
   */
  progress: () => void;
  /** Disarm the watchdog (a terminal phase was reached). Idempotent. */
  cancel: () => void;
}

/**
 * M3 factory — a timer armed on entering `armed` / `dragging`, RESET on every
 * progress event, that compares the injected monotonic clock against the
 * last-progress timestamp when it fires.
 *
 * The MONOTONIC idle measure (time since last progress, not wall-time since
 * pickup) is what makes it throttle-robust: a LATE timer that fires after real
 * progress simply re-arms for the remaining idle budget; it only trips on
 * genuine inactivity, correct at ANY throttle rate without per-rate tuning. On
 * a genuine expiry it calls `onExpire`, which the renderer wires to
 * `dispatchDrag({ type: "POINTER_CANCEL" })` — reusing the EXISTING enumerated
 * cancel edge (no new FSM phase / event).
 */
export function createDragWatchdog(params: {
  maxIdleMs: number;
  now: () => number;
  scheduler: TimerScheduler;
  onExpire: () => void;
}): DragWatchdog {
  let timerHandle: number | null = null;
  let lastProgressAt: number | null = null;

  const clearTimer = (): void => {
    if (timerHandle != null) {
      params.scheduler.clearTimer(timerHandle);
      timerHandle = null;
    }
  };

  const arm = (delayMs: number): void => {
    timerHandle = params.scheduler.setTimer(onTimer, delayMs);
  };

  function onTimer(): void {
    timerHandle = null;
    if (lastProgressAt == null) {
      return;
    }
    const idleMs: number = params.now() - lastProgressAt;
    // Monotonic re-check: a late fire after real progress re-arms for the
    // remaining budget rather than tripping. Only genuine inactivity expires.
    if (idleMs >= params.maxIdleMs) {
      lastProgressAt = null;
      params.onExpire();
      return;
    }
    arm(params.maxIdleMs - idleMs);
  }

  return {
    progress: (): void => {
      lastProgressAt = params.now();
      clearTimer();
      arm(params.maxIdleMs);
    },
    cancel: (): void => {
      lastProgressAt = null;
      clearTimer();
    },
  };
}
