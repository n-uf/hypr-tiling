import { describe, expect, it, jest } from "@jest/globals";
import {
  DRAG_RECOVERY_DEFAULT_MAX_DRAGGING_IDLE_MS,
  type TimerScheduler,
  createDragWatchdog,
} from "../engine/drag-recovery";

/**
 * Deterministic fake timer scheduler + monotonic clock. The recovery
 * primitives take an INJECTED scheduler (mirrors `createFrameCoalescer` +
 * `FrameScheduler`), so the tests drive timers explicitly rather than leaning
 * on jest's global fake timers — every race is exercised by hand.
 *
 * The watchdog keeps exactly one armed timer at a time; `fireActiveTimer`
 * fires the most-recently-scheduled live handle, which is the one a real
 * environment would deliver.
 */
interface FakeHandle {
  id: number;
  callback: () => void;
  live: boolean;
}

class FakeScheduler implements TimerScheduler {
  private nextId: number = 1;
  readonly timers: FakeHandle[] = [];

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

  fireActiveTimer = (): void => {
    const timer: FakeHandle | undefined = [...this.timers].reverse().find((t: FakeHandle): boolean => t.live);
    if (timer != null) {
      timer.live = false;
      timer.callback();
    }
  };

  liveTimerCount = (): number => this.timers.filter((t: FakeHandle): boolean => t.live).length;
}

describe("drag-recovery — defaults", (): void => {
  it("maxDraggingIdleMs default is 5100 ms", (): void => {
    expect(DRAG_RECOVERY_DEFAULT_MAX_DRAGGING_IDLE_MS).toBe(5100);
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
