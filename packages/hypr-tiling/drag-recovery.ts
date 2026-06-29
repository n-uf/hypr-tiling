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
 * - Every FLIP "play-to-identity" step is armed inside a bare
 *   `requestAnimationFrame`; if that frame never arrives the element is frozen
 *   at its inverted `First` (visibly displaced / scaled). → M1.
 * - Transition style-cleanup that waits only on `transitionend` (or only on a
 *   frame) can be deferred indefinitely. → M2.
 * - No max-duration watchdog on `armed` / `dragging`: if every terminal pointer
 *   event is lost the FSM stays `dragging` forever, holding pointer capture and
 *   transient inline styles. → M3.
 * - Transient-style cleanup is eventually-total but not idempotent on every exit
 *   path and not starvation-proof. → M4.
 *
 * Design constraints (mirrors `_agent/drag-subsystem-audit.md` §"self-healing"):
 * - DOM-less + injected clock / scheduler, exactly like `createFrameCoalescer`
 *   + `FrameScheduler` in `drag-machine.ts`, so every primitive is unit-testable
 *   in the `node` jest environment with fake timers + an injected `now`.
 * - All deadlines are typed, documented multiples of the animation duration or
 *   of a frame — never symptom-tuned magic constants.
 * - Operates on MINIMAL typed style-target interfaces (mirrors
 *   `SurvivorReflowLeafStyleTarget` in `survivor-reflow.ts`), so the renderer
 *   feeds it real `HTMLElement`s / WAAPI `Animation`s without the module
 *   depending on the DOM.
 *
 * The recovery layer composes AROUND the existing machine: M3 feeds the existing
 * `POINTER_CANCEL` edge (no new FSM phase / event), M1 hardens the animation
 * arming, and M4 is the single idempotent teardown every exit path calls. The
 * FSM / candidate-tree / geometry core and the content-agnostic presentation
 * rule are untouched.
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
 * Default M2 transition-completion slack (ms). Names the `+60` mask-close slack
 * the survivor-reflow effect already uses (`survivorReflowDurationMs + 60`) as a
 * single typed knob: the cleanup fires on `transitionend` OR
 * `duration + transitionSlackMs`, whichever first.
 */
export const DRAG_RECOVERY_DEFAULT_TRANSITION_SLACK_MS: number = 60;

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
 * M1 — rAF-with-timeout race primitive (fixes V1 ghost-hop + V2 survivor-reflow
 * frozen-at-`First`).
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

/** A `transitionend`-event source — the minimal subset M2 subscribes to. */
export interface TransitionEndSource {
  addEventListener: (type: "transitionend", listener: () => void) => void;
  removeEventListener: (type: "transitionend", listener: () => void) => void;
}

/** Injected timer scheduler for M2 / M3 (no frame half needed). */
export interface TimerScheduler {
  setTimer: (callback: () => void, ms: number) => number;
  clearTimer: (handle: number) => void;
}

/** A cancelable, run-at-most-once transition-completion handle returned by M2. */
export interface TransitionSettledHandle {
  /** Detach the listener + clear the timer if the completion has not yet fired. */
  cancel: () => void;
}

/**
 * M2 — transition-completion guarantee (generalizes the existing `+60` mask
 * slack / `+40` fly-back slack the codebase already uses).
 *
 * Fires `onSettled` EXACTLY ONCE, on `transitionend` OR after a
 * `durationMs + transitionSlackMs` timeout — WHICHEVER FIRST. The timeout is the
 * starvation backstop: if the element is interrupted / unmounted / the
 * `transitionend` never arrives (which the codebase has no listeners for today,
 * so this is also the first place a `transitionend` is even consulted), the
 * timer still runs the cleanup. Idempotent + self-detaching.
 */
export function onTransitionSettled(params: {
  target: TransitionEndSource;
  durationMs: number;
  transitionSlackMs: number;
  scheduler: TimerScheduler;
  onSettled: () => void;
}): TransitionSettledHandle {
  let hasSettled: boolean = false;
  let timerHandle: number | null = null;

  const cleanup = (): void => {
    params.target.removeEventListener("transitionend", onTransitionEnd);
    if (timerHandle != null) {
      params.scheduler.clearTimer(timerHandle);
      timerHandle = null;
    }
  };

  const settleOnce = (): void => {
    if (hasSettled) {
      return;
    }
    hasSettled = true;
    cleanup();
    params.onSettled();
  };

  function onTransitionEnd(): void {
    settleOnce();
  }

  params.target.addEventListener("transitionend", onTransitionEnd);
  timerHandle = params.scheduler.setTimer(settleOnce, params.durationMs + params.transitionSlackMs);

  return {
    cancel: (): void => {
      if (hasSettled) {
        return;
      }
      hasSettled = true;
      cleanup();
    },
  };
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

/**
 * Minimal style surface M4 clears on the ghost node + each survivor
 * `[data-leaf-id]` element. Mirrors `SurvivorReflowLeafStyleTarget`
 * (`survivor-reflow.ts`); `transform` / `transition` are always present on a
 * `CSSStyleDeclaration`, the rest are optional so a fake test target can omit
 * them and a real element is structurally assignable.
 */
export interface TransientDragStyleTarget {
  readonly style: {
    transform: string;
    transition: string;
    transformOrigin?: string;
    willChange?: string;
    contain?: string;
  };
}

/** A cancelable handle (WAAPI `Animation` or an M1 `RacedFrameHandle`). */
export interface CancelableHandle {
  cancel: () => void;
}

/**
 * M4 — idempotent transient-style teardown (fixes the §1 transient-style
 * inventory gap + V6 visibility-hide cleanup).
 *
 * Clears `transform` / `transition` / `transform-origin` (and `will-change` /
 * `contain`, future-proof) to identity on the ghost node and every survivor
 * leaf, and cancels every tracked WAAPI animation + raced M1 handle. Idempotent
 * — clearing to identity and cancelling an already-finished handle are both
 * no-ops — so it is safe to call on EVERY exit path: settle teardown (after
 * pointer-capture release), watchdog expiry (M3), and visibilitychange
 * reconciliation (M5). `null` entries are skipped so the renderer can pass its
 * refs verbatim.
 */
export function stripTransientDragStyles(params: {
  ghost: TransientDragStyleTarget | null;
  leaves: ReadonlyArray<TransientDragStyleTarget | null>;
  animations?: ReadonlyArray<CancelableHandle | null>;
  racedHandles?: ReadonlyArray<CancelableHandle | null>;
}): void {
  for (const handle of params.animations ?? []) {
    handle?.cancel();
  }
  for (const handle of params.racedHandles ?? []) {
    handle?.cancel();
  }
  clearTransientStyle(params.ghost);
  for (const leaf of params.leaves) {
    clearTransientStyle(leaf);
  }
}

/** Reset one style target's transient drag properties to identity. */
function clearTransientStyle(target: TransientDragStyleTarget | null): void {
  if (target == null) {
    return;
  }
  target.style.transform = "none";
  target.style.transition = "none";
  if (target.style.transformOrigin !== undefined) {
    target.style.transformOrigin = "";
  }
  if (target.style.willChange !== undefined) {
    target.style.willChange = "auto";
  }
  if (target.style.contain !== undefined) {
    target.style.contain = "";
  }
}
