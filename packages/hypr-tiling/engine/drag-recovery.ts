/**
 * Drag self-healing recovery layer — the PURE (DOM-less) primitives that
 * harden the live drag against frame starvation (background-tab
 * `requestAnimationFrame` suspension, CPU throttling, long tasks, dropped/late
 * pointer events).
 *
 * The drag FINITE-STATE MACHINE (`drag-machine.ts`) is already logically
 * un-wedgeable — every non-idle phase has an enumerated cancel edge back to
 * `idle`. The exposure this module closes is a lost terminal event:
 *
 * - No max-duration watchdog on `armed` / `dragging`: if every terminal pointer
 *   event is lost the FSM stays `dragging` forever, holding pointer capture. → M3.
 *
 * The panes themselves — the dragged one included — move on leaf motion
 * (`leaf-motion.ts`): a settle stepped by one frame loop, with no CSS
 * transition to wait for, strip or rescue, so there is no animation arming to
 * harden either.
 *
 * Design constraints (mirrors `_agent/drag-subsystem-audit.md` §"self-healing"):
 * - DOM-less + injected clock / scheduler, exactly like `createFrameCoalescer`
 *   + `FrameScheduler` in `drag-machine.ts`, so every primitive is unit-testable
 *   in the `node` jest environment with fake timers + an injected `now`.
 *
 * The recovery layer composes AROUND the existing machine: M3 feeds the existing
 * `POINTER_CANCEL` edge (no new FSM phase / event).
 */

/**
 * Default M3 idle deadline (ms): a drag with no `POINTER_MOVE` /
 * `TARGET_RESOLVED` progress for this long (monotonic) is force-reconciled to
 * `idle` via the existing `POINTER_CANCEL` edge. Comfortably longer than any
 * real deliberate re-aim pause (so no genuine drag trips it), short enough that
 * a wedged `dragging` self-heals within a few seconds.
 */
export const DRAG_RECOVERY_DEFAULT_MAX_DRAGGING_IDLE_MS: number = 5100;

/** Injected timer scheduler for M3. */
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
