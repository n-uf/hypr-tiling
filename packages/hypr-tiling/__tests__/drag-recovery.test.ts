import { describe, expect, it, jest } from "@jest/globals";
import {
  DRAG_RECOVERY_DEFAULT_FRAME_DEADLINE_MS,
  DRAG_RECOVERY_DEFAULT_MAX_DRAGGING_IDLE_MS,
  DRAG_RECOVERY_DEFAULT_TRANSITION_SLACK_MS,
  DRAG_RECOVERY_MAX_DRAGGING_IDLE_HOP_MULTIPLE,
  IDENTITY_COMPUTED_TRANSFORMS,
  type CancelableHandle,
  type FrameOrTimeoutScheduler,
  type TransientDragStyleTarget,
  type TransitionEndSource,
  armTransformSettleGuard,
  createDragWatchdog,
  isComputedTransformIdentity,
  onTransitionSettled,
  scheduleFrameOrTimeout,
  stripTransientDragStyles,
} from "../drag-recovery";

/**
 * Deterministic fake frame/timer scheduler + monotonic clock. The recovery
 * primitives take an INJECTED scheduler (mirrors `createFrameCoalescer` +
 * `FrameScheduler`), so the tests drive frames/timers explicitly rather than
 * leaning on jest's global fake timers — every race is exercised by hand.
 *
 * The watchdog keeps exactly one armed timer at a time; `fireActiveTimer` /
 * `fireActiveFrame` fire the most-recently-scheduled live handle, which is the
 * one a real environment would deliver.
 */
interface FakeHandle {
  id: number;
  callback: () => void;
  live: boolean;
}

class FakeScheduler implements FrameOrTimeoutScheduler {
  private nextId: number = 1;
  readonly timers: FakeHandle[] = [];
  readonly frames: FakeHandle[] = [];

  requestFrame = (callback: () => void): number => {
    const id: number = this.nextId++;
    this.frames.push({ id, callback, live: true });
    return id;
  };

  cancelFrame = (handle: number): void => {
    const frame: FakeHandle | undefined = this.frames.find((f: FakeHandle): boolean => f.id === handle);
    if (frame != null) {
      frame.live = false;
    }
  };

  setTimer = (callback: () => void, _ms: number): number => {
    const id: number = this.nextId++;
    this.timers.push({ id, callback, live: true });
    return id;
  };

  clearTimer = (handle: number): void => {
    const timer: FakeHandle | undefined = this.timers.find((t: FakeHandle): boolean => t.id === handle);
    if (timer != null) {
      timer.live = false;
    }
  };

  fireActiveFrame = (): void => {
    const frame: FakeHandle | undefined = [...this.frames].reverse().find((f: FakeHandle): boolean => f.live);
    if (frame != null) {
      frame.live = false;
      frame.callback();
    }
  };

  fireActiveTimer = (): void => {
    const timer: FakeHandle | undefined = [...this.timers].reverse().find((t: FakeHandle): boolean => t.live);
    if (timer != null) {
      timer.live = false;
      timer.callback();
    }
  };

  liveTimerCount = (): number => this.timers.filter((t: FakeHandle): boolean => t.live).length;
  liveFrameCount = (): number => this.frames.filter((f: FakeHandle): boolean => f.live).length;
}

describe("drag-recovery — non-ad-hoc defaults (documented multiples)", (): void => {
  it("maxDraggingIdleMs default is 30 × the 170ms baseline hop duration", (): void => {
    expect(DRAG_RECOVERY_MAX_DRAGGING_IDLE_HOP_MULTIPLE).toBe(30);
    expect(DRAG_RECOVERY_DEFAULT_MAX_DRAGGING_IDLE_MS).toBe(30 * 170);
    expect(DRAG_RECOVERY_DEFAULT_MAX_DRAGGING_IDLE_MS).toBe(5100);
  });

  it("frameDeadlineMs default is ~2 frames and transitionSlackMs names the +60 slack", (): void => {
    expect(DRAG_RECOVERY_DEFAULT_FRAME_DEADLINE_MS).toBe(32);
    expect(DRAG_RECOVERY_DEFAULT_TRANSITION_SLACK_MS).toBe(60);
  });
});

describe("drag-recovery — M1 scheduleFrameOrTimeout (rAF-with-timeout race, first-wins + idempotent)", (): void => {
  it("runs the callback EXACTLY ONCE when the frame wins (timeout loser cancelled)", (): void => {
    const scheduler: FakeScheduler = new FakeScheduler();
    const callback = jest.fn();
    scheduleFrameOrTimeout(scheduler, 32, callback);

    scheduler.fireActiveFrame();
    expect(callback).toHaveBeenCalledTimes(1);
    // The loser timer is cancelled, so firing it is a no-op (no double run).
    expect(scheduler.liveTimerCount()).toBe(0);
    scheduler.fireActiveTimer();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("runs the callback EXACTLY ONCE when the timeout wins (starved frame fallback)", (): void => {
    const scheduler: FakeScheduler = new FakeScheduler();
    const callback = jest.fn();
    scheduleFrameOrTimeout(scheduler, 32, callback);

    // Simulate a never-arriving rAF: the timeout fires first.
    scheduler.fireActiveTimer();
    expect(callback).toHaveBeenCalledTimes(1);
    // The loser frame is cancelled, so a late resumed frame never double-runs.
    expect(scheduler.liveFrameCount()).toBe(0);
    scheduler.fireActiveFrame();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("cancel() before either fires drops both handles and never runs the callback", (): void => {
    const scheduler: FakeScheduler = new FakeScheduler();
    const callback = jest.fn();
    const handle = scheduleFrameOrTimeout(scheduler, 32, callback);

    handle.cancel();
    expect(scheduler.liveTimerCount()).toBe(0);
    expect(scheduler.liveFrameCount()).toBe(0);
    scheduler.fireActiveFrame();
    scheduler.fireActiveTimer();
    expect(callback).not.toHaveBeenCalled();
  });

  it("cancel() after the run is a no-op (idempotent)", (): void => {
    const scheduler: FakeScheduler = new FakeScheduler();
    const callback = jest.fn();
    const handle = scheduleFrameOrTimeout(scheduler, 32, callback);

    scheduler.fireActiveFrame();
    handle.cancel();
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

describe("drag-recovery — M3 createDragWatchdog (monotonic idle, re-arm on progress)", (): void => {
  it("expires after maxIdleMs of inactivity and calls onExpire once", (): void => {
    const scheduler: FakeScheduler = new FakeScheduler();
    let nowMs: number = 0;
    const onExpire = jest.fn();
    const watchdog = createDragWatchdog({
      maxIdleMs: 100,
      now: (): number => nowMs,
      scheduler,
      onExpire,
    });

    watchdog.progress();
    nowMs = 100;
    scheduler.fireActiveTimer();
    expect(onExpire).toHaveBeenCalledTimes(1);
    // After expiry the watchdog disarms (no lingering timer).
    expect(scheduler.liveTimerCount()).toBe(0);
  });

  it("re-arms (does NOT expire) when the timer fires but progress was recent (throttle-robust)", (): void => {
    const scheduler: FakeScheduler = new FakeScheduler();
    let nowMs: number = 0;
    const onExpire = jest.fn();
    const watchdog = createDragWatchdog({
      maxIdleMs: 100,
      now: (): number => nowMs,
      scheduler,
      onExpire,
    });

    watchdog.progress();
    // A late/skewed timer fire that finds only 60ms of idle → re-arm, no expiry.
    nowMs = 60;
    scheduler.fireActiveTimer();
    expect(onExpire).not.toHaveBeenCalled();
    expect(scheduler.liveTimerCount()).toBe(1);

    // The re-armed timer covers the remaining 40ms; fire it at the deadline.
    nowMs = 100;
    scheduler.fireActiveTimer();
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("progress() resets the idle clock so a steadily-progressing drag never trips", (): void => {
    const scheduler: FakeScheduler = new FakeScheduler();
    let nowMs: number = 0;
    const onExpire = jest.fn();
    const watchdog = createDragWatchdog({
      maxIdleMs: 100,
      now: (): number => nowMs,
      scheduler,
      onExpire,
    });

    watchdog.progress();
    nowMs = 90;
    watchdog.progress();
    // The first timer was cleared on re-arm; fire the live one at t=100: only
    // 10ms idle since the last progress → re-arm, no expiry.
    nowMs = 100;
    scheduler.fireActiveTimer();
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("cancel() disarms the watchdog so a pending timer never expires", (): void => {
    const scheduler: FakeScheduler = new FakeScheduler();
    let nowMs: number = 0;
    const onExpire = jest.fn();
    const watchdog = createDragWatchdog({
      maxIdleMs: 100,
      now: (): number => nowMs,
      scheduler,
      onExpire,
    });

    watchdog.progress();
    watchdog.cancel();
    expect(scheduler.liveTimerCount()).toBe(0);
    nowMs = 1000;
    scheduler.fireActiveTimer();
    expect(onExpire).not.toHaveBeenCalled();
  });
});

describe("drag-recovery — M3 watchdog input-grounded keep-alive (Fix B: raw pointer move re-arms)", (): void => {
  // Fix B: the renderer's `handlePointerMove` calls `watchdog.progress()` from
  // RAW pointer input, not only from the `dragState`-keyed effect re-runs. Under
  // CPU throttling the rAF coalescer can fail to flush for longer than the idle
  // budget (so the effect never re-runs to re-arm) while `pointermove`s still
  // arrive — without input-grounding the watchdog would expire and cancel a LIVE
  // drag. With it, a moving-but-frame-starved drag stays alive and the watchdog
  // trips ONLY once input genuinely stops. The renderer wiring is one line
  // (`watchdogRef.current?.progress()`); this asserts the mechanism it relies on.

  it("(assertion 2) raw pointer-move progress() keeps a frame-starved drag alive; expires only after input stops", (): void => {
    const scheduler: FakeScheduler = new FakeScheduler();
    let nowMs: number = 0;
    const onExpire = jest.fn();
    const realWatchdog = createDragWatchdog({
      maxIdleMs: 100,
      now: (): number => nowMs,
      scheduler,
      onExpire,
    });
    // Spy mirror of the renderer's `watchdogRef.current?.progress()` call, so the
    // test asserts progress is invoked PER raw pointer move (input-grounded).
    const progress = jest.fn(realWatchdog.progress);
    const onRawPointerMove = (clientNowMs: number): void => {
      nowMs = clientNowMs;
      progress();
    };

    realWatchdog.progress(); // initial arm on entering `dragging`

    // rAF is starved (the coalescer never flushes → no effect-driven re-arm), but
    // raw pointermoves keep arriving every 80ms — each re-arms the watchdog. Wall
    // time (240ms) is well past the 100ms idle budget, yet the drag is alive.
    onRawPointerMove(80);
    onRawPointerMove(160);
    onRawPointerMove(240);
    expect(progress).toHaveBeenCalledTimes(3); // invoked on every raw move
    // A late/starved timer fire finds only 60ms idle since the last move → re-arm.
    nowMs = 300;
    scheduler.fireActiveTimer();
    expect(onExpire).not.toHaveBeenCalled();

    // Input STOPS. Now the idle clock runs out and the watchdog self-heals.
    nowMs = 340; // 100ms since the last progress at t=240
    scheduler.fireActiveTimer();
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("each progress() keeps exactly one armed timer (cheap single-arm, no double-arm)", (): void => {
    const scheduler: FakeScheduler = new FakeScheduler();
    let nowMs: number = 0;
    const watchdog = createDragWatchdog({
      maxIdleMs: 100,
      now: (): number => nowMs,
      scheduler,
      onExpire: jest.fn(),
    });

    watchdog.progress();
    expect(scheduler.liveTimerCount()).toBe(1);
    for (const t of [20, 40, 60, 80]) {
      nowMs = t;
      watchdog.progress();
      expect(scheduler.liveTimerCount()).toBe(1);
    }
  });
});

/** A fake `transitionend` source recording listeners so the test can fire it. */
class FakeTransitionEndSource implements TransitionEndSource {
  private listeners: Array<() => void> = [];

  addEventListener = (_type: "transitionend", listener: () => void): void => {
    this.listeners.push(listener);
  };

  removeEventListener = (_type: "transitionend", listener: () => void): void => {
    this.listeners = this.listeners.filter((l: () => void): boolean => l !== listener);
  };

  emit = (): void => {
    for (const listener of [...this.listeners]) {
      listener();
    }
  };

  listenerCount = (): number => this.listeners.length;
}

describe("drag-recovery — M2 onTransitionSettled (transitionend OR duration+slack, whichever first)", (): void => {
  it("settles on transitionend and detaches the timer + listener (idempotent)", (): void => {
    const scheduler: FakeScheduler = new FakeScheduler();
    const target: FakeTransitionEndSource = new FakeTransitionEndSource();
    const onSettled = jest.fn();
    onTransitionSettled({ target, durationMs: 170, transitionSlackMs: 60, scheduler, onSettled });

    target.emit();
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(target.listenerCount()).toBe(0);
    expect(scheduler.liveTimerCount()).toBe(0);
    // A late timeout cannot double-settle.
    scheduler.fireActiveTimer();
    target.emit();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("settles via the timeout fallback when transitionend never fires (starvation backstop)", (): void => {
    const scheduler: FakeScheduler = new FakeScheduler();
    const target: FakeTransitionEndSource = new FakeTransitionEndSource();
    const onSettled = jest.fn();
    onTransitionSettled({ target, durationMs: 170, transitionSlackMs: 60, scheduler, onSettled });

    scheduler.fireActiveTimer();
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(target.listenerCount()).toBe(0);
  });

  it("cancel() before completion never settles and detaches cleanly", (): void => {
    const scheduler: FakeScheduler = new FakeScheduler();
    const target: FakeTransitionEndSource = new FakeTransitionEndSource();
    const onSettled = jest.fn();
    const handle = onTransitionSettled({ target, durationMs: 170, transitionSlackMs: 60, scheduler, onSettled });

    handle.cancel();
    expect(target.listenerCount()).toBe(0);
    expect(scheduler.liveTimerCount()).toBe(0);
    target.emit();
    scheduler.fireActiveTimer();
    expect(onSettled).not.toHaveBeenCalled();
  });
});

describe("drag-recovery — isComputedTransformIdentity (computed-transform discriminator)", (): void => {
  it("treats both 'none' and the identity matrix as identity", (): void => {
    expect(IDENTITY_COMPUTED_TRANSFORMS).toEqual([
      "none",
      "matrix(1, 0, 0, 1, 0, 0)",
    ]);
    expect(isComputedTransformIdentity("none")).toBe(true);
    expect(isComputedTransformIdentity("matrix(1, 0, 0, 1, 0, 0)")).toBe(true);
  });

  it("treats any non-identity computed matrix as non-identity (the stuck case)", (): void => {
    // The exact false-negative the inline-only check missed: inline is "none"
    // but the COMPUTED transform is still a mid-flight translate.
    expect(isComputedTransformIdentity("matrix(1, 0, 0, 1, 40, 30)")).toBe(false);
    expect(isComputedTransformIdentity("matrix(0.5, 0, 0, 0.5, 0, 0)")).toBe(false);
    expect(
      isComputedTransformIdentity("matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 12, 8, 0, 1)"),
    ).toBe(false);
  });
});

describe("drag-recovery — M2b armTransformSettleGuard (seated mid-FLIP self-heal, no snap-back)", (): void => {
  it("force-settles when a COMPUTED transform is still non-identity past the slack window", (): void => {
    const scheduler: FakeScheduler = new FakeScheduler();
    const forceSettle = jest.fn();
    // Inline reads settled ("none") but computed is a stalled mid-flight matrix
    // — the exact seated mid-FLIP hang.
    armTransformSettleGuard({
      readComputedTransforms: (): ReadonlyArray<string> => [
        "matrix(1, 0, 0, 1, 40, 30)",
      ],
      durationMs: 170,
      transitionSlackMs: 60,
      scheduler,
      forceSettle,
    });

    // Fires at duration + slack (230ms).
    scheduler.fireActiveTimer();
    expect(forceSettle).toHaveBeenCalledTimes(1);
    // No lingering timer after it fires.
    expect(scheduler.liveTimerCount()).toBe(0);
  });

  it("does NOT force-settle a legitimately-settled transition (computed already identity)", (): void => {
    const scheduler: FakeScheduler = new FakeScheduler();
    const forceSettle = jest.fn();
    let computed: string = "matrix(1, 0, 0, 1, 40, 30)";
    armTransformSettleGuard({
      readComputedTransforms: (): ReadonlyArray<string> => [computed],
      durationMs: 170,
      transitionSlackMs: 60,
      scheduler,
      forceSettle,
    });

    // By the time the guard fires, the transition has legitimately reached
    // identity — it must not fight a healthy animation.
    computed = "matrix(1, 0, 0, 1, 0, 0)";
    scheduler.fireActiveTimer();
    expect(forceSettle).not.toHaveBeenCalled();
  });

  it("only acts on the stuck element when SOME of a batch is non-identity", (): void => {
    const scheduler: FakeScheduler = new FakeScheduler();
    const forceSettle = jest.fn();
    armTransformSettleGuard({
      readComputedTransforms: (): ReadonlyArray<string> => [
        "none",
        "matrix(1, 0, 0, 1, 0, 0)",
        "matrix(0.5, 0, 0, 0.5, 12, 0)",
      ],
      durationMs: 170,
      transitionSlackMs: 60,
      scheduler,
      forceSettle,
    });

    scheduler.fireActiveTimer();
    expect(forceSettle).toHaveBeenCalledTimes(1);
  });

  it("cancel() before the slack window disarms the guard (batch re-arm / supersede)", (): void => {
    const scheduler: FakeScheduler = new FakeScheduler();
    const forceSettle = jest.fn();
    const readComputedTransforms = jest.fn(
      (): ReadonlyArray<string> => ["matrix(1, 0, 0, 1, 40, 30)"],
    );
    const handle = armTransformSettleGuard({
      readComputedTransforms,
      durationMs: 170,
      transitionSlackMs: 60,
      scheduler,
      forceSettle,
    });

    // A superseding reflow batch cancels the stale guard before it fires.
    handle.cancel();
    expect(scheduler.liveTimerCount()).toBe(0);
    scheduler.fireActiveTimer();
    // The computed transform is never even consulted, and no force-settle runs.
    expect(readComputedTransforms).not.toHaveBeenCalled();
    expect(forceSettle).not.toHaveBeenCalled();
  });

  it("is idempotent — a second timer fire after force-settle does not re-run", (): void => {
    const scheduler: FakeScheduler = new FakeScheduler();
    const forceSettle = jest.fn();
    armTransformSettleGuard({
      readComputedTransforms: (): ReadonlyArray<string> => [
        "matrix(1, 0, 0, 1, 40, 30)",
      ],
      durationMs: 170,
      transitionSlackMs: 60,
      scheduler,
      forceSettle,
    });

    scheduler.fireActiveTimer();
    scheduler.fireActiveTimer();
    expect(forceSettle).toHaveBeenCalledTimes(1);
  });

  it("issues NO cancel/FSM signal — its ONLY effect is the force-settle (no snap-back)", (): void => {
    // Structural no-snap-back proof: the guard's surface is a single
    // `forceSettle` callback (the renderer wires it to the idempotent transform
    // strip). There is NO `onExpire` / cancel-dispatch channel, so it can never
    // drive a `POINTER_CANCEL` / FSM transition the way the M3 watchdog does.
    const scheduler: FakeScheduler = new FakeScheduler();
    const forceSettle = jest.fn();
    const handle = armTransformSettleGuard({
      readComputedTransforms: (): ReadonlyArray<string> => [
        "matrix(1, 0, 0, 1, 40, 30)",
      ],
      durationMs: 170,
      transitionSlackMs: 60,
      scheduler,
      forceSettle,
    });
    expect(Object.keys(handle)).toEqual(["cancel"]);
    scheduler.fireActiveTimer();
    expect(forceSettle).toHaveBeenCalledTimes(1);
  });
});

/** A mutable style target mirroring a `CSSStyleDeclaration` subset. */
function styleTarget(initial: Partial<TransientDragStyleTarget["style"]> = {}): TransientDragStyleTarget {
  return {
    style: {
      transform: initial.transform ?? "none",
      transition: initial.transition ?? "none",
      transformOrigin: initial.transformOrigin ?? "",
      willChange: initial.willChange ?? "auto",
      contain: initial.contain ?? "",
    },
  };
}

describe("drag-recovery — M4 stripTransientDragStyles (idempotent teardown, every exit path)", (): void => {
  it("clears transform/transition/transform-origin/will-change/contain on ghost + leaves", (): void => {
    const ghost: TransientDragStyleTarget = styleTarget({
      transform: "translate(40px, 10px) scale(0.9, 0.9)",
      transition: "transform 170ms ease",
      transformOrigin: "top left",
      willChange: "transform",
      contain: "paint",
    });
    const leaf: TransientDragStyleTarget = styleTarget({
      transform: "translate(-12px, 0px)",
      transition: "transform 170ms ease",
    });

    stripTransientDragStyles({ ghost, leaves: [leaf] });

    expect(ghost.style.transform).toBe("none");
    expect(ghost.style.transition).toBe("none");
    expect(ghost.style.transformOrigin).toBe("");
    expect(ghost.style.willChange).toBe("auto");
    expect(ghost.style.contain).toBe("");
    expect(leaf.style.transform).toBe("none");
    expect(leaf.style.transition).toBe("none");
  });

  it("is idempotent — a second strip leaves the identity styles unchanged", (): void => {
    const ghost: TransientDragStyleTarget = styleTarget({ transform: "scale(0.7, 0.7)" });
    stripTransientDragStyles({ ghost, leaves: [] });
    const afterFirst = { ...ghost.style };
    stripTransientDragStyles({ ghost, leaves: [] });
    expect(ghost.style).toEqual(afterFirst);
  });

  it("cancels tracked WAAPI animations + raced handles, skipping nulls", (): void => {
    const animation: CancelableHandle = { cancel: jest.fn() };
    const raced: CancelableHandle = { cancel: jest.fn() };
    const ghost: TransientDragStyleTarget = styleTarget({ transform: "scale(0.7, 0.7)" });

    stripTransientDragStyles({
      ghost,
      leaves: [null],
      animations: [animation, null],
      racedHandles: [raced, null],
    });

    expect(animation.cancel).toHaveBeenCalledTimes(1);
    expect(raced.cancel).toHaveBeenCalledTimes(1);
    expect(ghost.style.transform).toBe("none");
  });

  it("tolerates a null ghost (no in-flight ghost on this exit path)", (): void => {
    const leaf: TransientDragStyleTarget = styleTarget({ transform: "translate(5px, 5px)" });
    expect((): void => stripTransientDragStyles({ ghost: null, leaves: [leaf] })).not.toThrow();
    expect(leaf.style.transform).toBe("none");
  });
});
