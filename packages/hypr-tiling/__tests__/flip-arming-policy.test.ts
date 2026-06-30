import { describe, expect, it, jest } from "@jest/globals";
import type { CancelableHandle, TransitionEndSource } from "../core/drag-recovery";
import {
  createSurvivorFlipScheduler,
  type SurvivorFlipScheduler,
  type SurvivorReflowInput,
} from "../core/flip-scheduler";
import type { SchedulerPort } from "../core/scheduler-port";
import type {
  FlipDipHandle,
  FlipDipOptions,
  FlipKeyframe,
  StyleApplierPort,
  StyleLeafHandle,
  StyleTransformSpec,
} from "../core/style-applier-port";
import type { SurvivorRect } from "../core/survivor-reflow";

/**
 * Stage-6 characterization: the survivor-FLIP scheduler's ARMING POLICY —
 * WHEN it arms / cancels / suppresses M1 (play-race), M2 (transition-settle),
 * M2b (transform-settle guard) and the settle-strip — verified INDEPENDENT of
 * pixel output. Every assertion is on which recovery primitive is scheduled and
 * which port write/teardown fires, never on a transform string value. The
 * pure FLIP geometry math (`deriveSurvivorFlipTransform` etc.) is covered by
 * `survivor-reflow.test.ts`; here we drive `createSurvivorFlipScheduler` through
 * stub ports so the lifted orchestration is pinned without a DOM.
 */

/** A scheduled fake timer/frame with a liveness flag (indexable firing). */
interface FakeHandle {
  id: number;
  callback: () => void;
  live: boolean;
}

/**
 * Deterministic fake {@link SchedulerPort}: frames + timers fire explicitly by
 * index so each of the M2 / M2b / M1 handles can be triggered in isolation. The
 * per-batch arm order is timers `[M2, M2b, M1-timeout]` and frames `[M1-frame]`.
 */
class FakeScheduler implements SchedulerPort {
  private nextId: number = 1;
  readonly timers: FakeHandle[] = [];
  readonly frames: FakeHandle[] = [];

  requestFrame = (callback: () => void): number => {
    const id: number = this.nextId++;
    this.frames.push({ id, callback, live: true });
    return id;
  };
  cancelFrame = (handle: number): void => {
    const frame: FakeHandle | undefined = this.frames.find(
      (f: FakeHandle): boolean => f.id === handle,
    );
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
    const timer: FakeHandle | undefined = this.timers.find(
      (t: FakeHandle): boolean => t.id === handle,
    );
    if (timer != null) {
      timer.live = false;
    }
  };
  now = (): number => 0;

  fireTimer = (index: number): void => {
    const timer: FakeHandle | undefined = this.timers[index];
    if (timer != null && timer.live) {
      timer.live = false;
      timer.callback();
    }
  };
  fireFrame = (index: number): void => {
    const frame: FakeHandle | undefined = this.frames[index];
    if (frame != null && frame.live) {
      frame.live = false;
      frame.callback();
    }
  };
  liveTimerCount = (): number =>
    this.timers.filter((t: FakeHandle): boolean => t.live).length;
  liveFrameCount = (): number =>
    this.frames.filter((f: FakeHandle): boolean => f.live).length;
}

interface StubLeaf {
  readonly leafId: string;
  /** The rect `measureRect` returns this batch (the FLIP Last + live-visual). */
  rect: SurvivorRect;
  /** The COMPUTED transform `readComputedTransform` returns (drives M2b + First). */
  computedTransform: string;
}

interface RecordedDip {
  readonly leafId: string;
  onFinish: (() => void) | null;
  readonly handle: FlipDipHandle;
  cancelled: boolean;
}

/**
 * Controllable {@link StyleApplierPort} stub + call recorders. The leaf set,
 * each leaf's rect, and each leaf's computed transform are mutable between
 * batches so the test can drive an idle "record" pass then a "moved" play pass
 * exactly as the renderer does.
 */
class StyleApplierHarness {
  leaves: StubLeaf[] = [];
  clampViewport: SurvivorRect | null = {
    left: 0,
    top: 0,
    width: 1000,
    height: 1000,
  };
  readonly applyTransformCalls: Array<{ leafId: string; spec: StyleTransformSpec }> = [];
  readonly stripLeafCalls: string[] = [];
  forceReflowCount: number = 0;
  stripTransientCount: number = 0;
  lastStripTransientArgs: {
    animations: ReadonlyArray<CancelableHandle | null>;
    racedHandles: ReadonlyArray<CancelableHandle | null>;
  } | null = null;
  readonly dips: RecordedDip[] = [];
  readonly transitionListeners: Map<string, Array<() => void>> = new Map();

  setLeaf(leafId: string, rect: SurvivorRect, computedTransform: string = "none"): void {
    const existing: StubLeaf | undefined = this.leaves.find(
      (leaf: StubLeaf): boolean => leaf.leafId === leafId,
    );
    if (existing != null) {
      existing.rect = rect;
      existing.computedTransform = computedTransform;
      return;
    }
    this.leaves.push({ leafId, rect, computedTransform });
  }

  readonly port: StyleApplierPort = {
    collectLeafHandles: (): ReadonlyArray<StyleLeafHandle> =>
      this.leaves.map((leaf: StubLeaf): StyleLeafHandle => ({ leafId: leaf.leafId })),
    measureRect: (handle: StyleLeafHandle): SurvivorRect =>
      this.leafOf(handle).rect,
    readComputedTransform: (handle: StyleLeafHandle): string =>
      this.leafOf(handle).computedTransform,
    applyTransform: (handle: StyleLeafHandle, spec: StyleTransformSpec): void => {
      this.applyTransformCalls.push({ leafId: handle.leafId, spec });
    },
    animateDip: (
      handle: StyleLeafHandle,
      _keyframes: ReadonlyArray<FlipKeyframe>,
      _options: FlipDipOptions,
    ): FlipDipHandle => {
      const record: RecordedDip = {
        leafId: handle.leafId,
        onFinish: null,
        cancelled: false,
        handle: {
          cancel: (): void => {
            record.cancelled = true;
          },
          setOnFinish: (onFinish: () => void): void => {
            record.onFinish = onFinish;
          },
        },
      };
      this.dips.push(record);
      return record.handle;
    },
    transitionEndSource: (handle: StyleLeafHandle): TransitionEndSource => {
      const leafId: string = handle.leafId;
      const listeners: Array<() => void> = this.transitionListeners.get(leafId) ?? [];
      this.transitionListeners.set(leafId, listeners);
      return {
        addEventListener: (_type: "transitionend", listener: () => void): void => {
          listeners.push(listener);
        },
        removeEventListener: (_type: "transitionend", listener: () => void): void => {
          const index: number = listeners.indexOf(listener);
          if (index >= 0) {
            listeners.splice(index, 1);
          }
        },
      };
    },
    measureClampViewport: (): SurvivorRect | null => this.clampViewport,
    forceReflow: (): void => {
      this.forceReflowCount += 1;
    },
    stripTransient: (params: {
      animations: ReadonlyArray<CancelableHandle | null>;
      racedHandles: ReadonlyArray<CancelableHandle | null>;
    }): void => {
      this.stripTransientCount += 1;
      this.lastStripTransientArgs = params;
    },
    stripLeaf: (handle: StyleLeafHandle): void => {
      this.stripLeafCalls.push(handle.leafId);
    },
  };

  private leafOf(handle: StyleLeafHandle): StubLeaf {
    const leaf: StubLeaf | undefined = this.leaves.find(
      (candidate: StubLeaf): boolean => candidate.leafId === handle.leafId,
    );
    if (leaf == null) {
      throw new Error(`unknown leaf ${handle.leafId}`);
    }
    return leaf;
  }
}

const RECT_A: SurvivorRect = { left: 0, top: 0, width: 100, height: 100 };
const RECT_B: SurvivorRect = { left: 200, top: 0, width: 100, height: 100 };

const PLAY_INPUT: Omit<SurvivorReflowInput, "clampViewport"> = {
  playReflow: true,
  snapSettleCommit: false,
  coherentDipActive: false,
  durationMs: 170,
  transitionSlackMs: 60,
  frameDeadlineMs: 32,
  swapBounceMagnitude: 0,
  resolvedReflowEasing: "ease",
};

interface Harnessed {
  scheduler: SurvivorFlipScheduler;
  fakeScheduler: FakeScheduler;
  style: StyleApplierHarness;
  onReflowAnimatingChange: jest.Mock<(animating: boolean) => void>;
}

function makeScheduler(): Harnessed {
  const fakeScheduler: FakeScheduler = new FakeScheduler();
  const style: StyleApplierHarness = new StyleApplierHarness();
  const onReflowAnimatingChange =
    jest.fn<(animating: boolean) => void>();
  const scheduler: SurvivorFlipScheduler = createSurvivorFlipScheduler({
    styleApplier: style.port,
    scheduler: fakeScheduler,
    onReflowAnimatingChange,
  });
  return { scheduler, fakeScheduler, style, onReflowAnimatingChange };
}

/** Record an idle baseline rect for `leafId` (record-only pass), then return harness. */
function recordBaseline(h: Harnessed, leafId: string, rect: SurvivorRect): void {
  h.style.setLeaf(leafId, rect);
  h.scheduler.reflow({
    ...PLAY_INPUT,
    playReflow: false,
    clampViewport: h.style.clampViewport,
  });
}

describe("flip-scheduler arming-policy — record vs play gate", (): void => {
  it("record-only path (playReflow=false) arms NOTHING + strips inline, no animating(true)", (): void => {
    const h: Harnessed = makeScheduler();
    h.style.setLeaf("a", RECT_A);
    h.scheduler.reflow({
      ...PLAY_INPUT,
      playReflow: false,
      clampViewport: h.style.clampViewport,
    });
    // No recovery primitive armed.
    expect(h.fakeScheduler.liveTimerCount()).toBe(0);
    expect(h.fakeScheduler.liveFrameCount()).toBe(0);
    expect(h.onReflowAnimatingChange).not.toHaveBeenCalled();
    // Inline transform/transition force-stripped (record-only snap write).
    expect(h.style.applyTransformCalls).toEqual([
      { leafId: "a", spec: { transition: "none", transform: "none" } },
    ]);
  });

  it("snapSettleCommit path arms NOTHING even with playReflow=true", (): void => {
    const h: Harnessed = makeScheduler();
    h.style.setLeaf("a", RECT_A);
    h.scheduler.reflow({
      ...PLAY_INPUT,
      playReflow: true,
      snapSettleCommit: true,
      clampViewport: h.style.clampViewport,
    });
    expect(h.fakeScheduler.liveTimerCount()).toBe(0);
    expect(h.fakeScheduler.liveFrameCount()).toBe(0);
    expect(h.onReflowAnimatingChange).not.toHaveBeenCalled();
  });

  it("a moved survivor arms M2 + M2b + M1 and opens the clip mask", (): void => {
    const h: Harnessed = makeScheduler();
    recordBaseline(h, "a", RECT_A);
    // Play pass: the leaf has moved A → B, so it is playable.
    h.style.setLeaf("a", RECT_B);
    h.scheduler.reflow({ ...PLAY_INPUT, clampViewport: h.style.clampViewport });
    // M2 (timer) + M2b (timer) + M1 (frame + timer) = 3 timers, 1 frame.
    expect(h.fakeScheduler.liveTimerCount()).toBe(3);
    expect(h.fakeScheduler.liveFrameCount()).toBe(1);
    expect(h.onReflowAnimatingChange).toHaveBeenCalledWith(true);
    expect(h.style.forceReflowCount).toBe(1);
  });

  it("an UNMOVED survivor (First === Last) arms nothing — no no-op transition", (): void => {
    const h: Harnessed = makeScheduler();
    recordBaseline(h, "a", RECT_A);
    // Play pass with the SAME rect → deriveSurvivorFlipTransform is null.
    h.style.setLeaf("a", RECT_A);
    h.scheduler.reflow({ ...PLAY_INPUT, clampViewport: h.style.clampViewport });
    expect(h.fakeScheduler.liveTimerCount()).toBe(0);
    expect(h.fakeScheduler.liveFrameCount()).toBe(0);
    expect(h.onReflowAnimatingChange).not.toHaveBeenCalled();
  });

  it("viewport unmounted (clampViewport=null) arms nothing + does NOT strip (recorded First preserved)", (): void => {
    const h: Harnessed = makeScheduler();
    recordBaseline(h, "a", RECT_A);
    const stripsBefore: number = h.style.stripTransientCount;
    h.style.setLeaf("a", RECT_B);
    h.scheduler.reflow({ ...PLAY_INPUT, clampViewport: null });
    expect(h.fakeScheduler.liveTimerCount()).toBe(0);
    expect(h.fakeScheduler.liveFrameCount()).toBe(0);
    expect(h.style.stripTransientCount).toBe(stripsBefore);
    // The recorded First survived: a subsequent valid play pass still arms.
    h.scheduler.reflow({ ...PLAY_INPUT, clampViewport: h.style.clampViewport });
    expect(h.onReflowAnimatingChange).toHaveBeenCalledWith(true);
  });
});

describe("flip-scheduler arming-policy — M1 play frame", (): void => {
  it("standard branch writes the play-to-identity transition per playable on the raced frame", (): void => {
    const h: Harnessed = makeScheduler();
    recordBaseline(h, "a", RECT_A);
    h.style.setLeaf("a", RECT_B);
    h.scheduler.reflow({ ...PLAY_INPUT, clampViewport: h.style.clampViewport });
    h.style.applyTransformCalls.length = 0;
    // Fire the M1 frame (index 0 — the single play frame this batch).
    h.fakeScheduler.fireFrame(0);
    const playWrite = h.style.applyTransformCalls.find(
      (call): boolean => call.leafId === "a" && call.spec.transition != null,
    );
    expect(playWrite).toBeDefined();
    expect(playWrite?.spec.transform).toBe("none");
    expect(h.style.dips).toHaveLength(0);
  });

  it("coherent-dip branch animates a dip per playable + wires onFinish → stripLeaf", (): void => {
    const h: Harnessed = makeScheduler();
    recordBaseline(h, "a", RECT_A);
    h.style.setLeaf("a", RECT_B);
    h.scheduler.reflow({
      ...PLAY_INPUT,
      coherentDipActive: true,
      clampViewport: h.style.clampViewport,
    });
    h.fakeScheduler.fireFrame(0);
    expect(h.style.dips).toHaveLength(1);
    expect(h.style.dips[0].leafId).toBe("a");
    // onFinish pins the resting identity through the per-leaf strip.
    expect(h.style.stripLeafCalls).toHaveLength(0);
    h.style.dips[0].onFinish?.();
    expect(h.style.stripLeafCalls).toEqual(["a"]);
  });
});

describe("flip-scheduler arming-policy — M2 / M2b settle + suppression", (): void => {
  it("M2 transition-settle closes the mask + strips (timer backstop)", (): void => {
    const h: Harnessed = makeScheduler();
    recordBaseline(h, "a", RECT_A);
    h.style.setLeaf("a", RECT_B);
    h.scheduler.reflow({ ...PLAY_INPUT, clampViewport: h.style.clampViewport });
    expect(h.style.stripTransientCount).toBe(0);
    // Timer index 0 = M2 (armed first).
    h.fakeScheduler.fireTimer(0);
    expect(h.onReflowAnimatingChange).toHaveBeenLastCalledWith(false);
    expect(h.style.stripTransientCount).toBe(1);
  });

  it("M2 also settles on the representative survivor's transitionend", (): void => {
    const h: Harnessed = makeScheduler();
    recordBaseline(h, "a", RECT_A);
    h.style.setLeaf("a", RECT_B);
    h.scheduler.reflow({ ...PLAY_INPUT, clampViewport: h.style.clampViewport });
    const listeners: Array<() => void> = h.style.transitionListeners.get("a") ?? [];
    expect(listeners.length).toBeGreaterThan(0);
    listeners[0]();
    expect(h.onReflowAnimatingChange).toHaveBeenLastCalledWith(false);
    expect(h.style.stripTransientCount).toBe(1);
  });

  it("M2b force-strips when the computed transform is STRANDED non-identity past the slack", (): void => {
    const h: Harnessed = makeScheduler();
    recordBaseline(h, "a", RECT_A);
    // Playable move A → B with computed "none" (so it is NOT treated as an
    // in-flight retarget and the FLIP arms).
    h.style.setLeaf("a", RECT_B, "none");
    h.scheduler.reflow({ ...PLAY_INPUT, clampViewport: h.style.clampViewport });
    const stripsBefore: number = h.style.stripTransientCount;
    // The compositor transition STALLS: the computed transform is still
    // non-identity when the M2b slack timer fires.
    h.style.setLeaf("a", RECT_B, "matrix(1, 0, 0, 1, 50, 0)");
    // Timer index 1 = M2b.
    h.fakeScheduler.fireTimer(1);
    expect(h.style.stripTransientCount).toBe(stripsBefore + 1);
  });

  it("M2b SUPPRESSES the strip when the computed transform has settled to identity", (): void => {
    const h: Harnessed = makeScheduler();
    recordBaseline(h, "a", RECT_A);
    h.style.setLeaf("a", RECT_B, "none");
    h.scheduler.reflow({ ...PLAY_INPUT, clampViewport: h.style.clampViewport });
    const stripsBefore: number = h.style.stripTransientCount;
    h.fakeScheduler.fireTimer(1);
    expect(h.style.stripTransientCount).toBe(stripsBefore);
  });
});

describe("flip-scheduler arming-policy — cancel / re-arm / dispose", (): void => {
  it("a superseding reflow batch cancels the prior M2 / M2b before re-arming (no accumulation)", (): void => {
    const h: Harnessed = makeScheduler();
    recordBaseline(h, "a", RECT_A);
    h.style.setLeaf("a", RECT_B);
    h.scheduler.reflow({ ...PLAY_INPUT, clampViewport: h.style.clampViewport });
    h.scheduler.cancelPlayFrame(); // the layout effect cleanup before the next run
    // Second moved batch (B → A): cancels prior M2/M2b/dips, re-arms fresh.
    h.style.setLeaf("a", RECT_A);
    h.scheduler.reflow({ ...PLAY_INPUT, clampViewport: h.style.clampViewport });
    // Exactly one live M2 + M2b + M1-timer survive (the prior batch's are cancelled).
    expect(h.fakeScheduler.liveTimerCount()).toBe(3);
    expect(h.fakeScheduler.liveFrameCount()).toBe(1);
  });

  it("re-measure cancels the in-flight coherent dips before the new batch", (): void => {
    const h: Harnessed = makeScheduler();
    recordBaseline(h, "a", RECT_A);
    h.style.setLeaf("a", RECT_B);
    h.scheduler.reflow({
      ...PLAY_INPUT,
      coherentDipActive: true,
      clampViewport: h.style.clampViewport,
    });
    h.fakeScheduler.fireFrame(0);
    expect(h.style.dips).toHaveLength(1);
    h.scheduler.cancelPlayFrame();
    // A fresh batch re-measures → the tracked dip is cancelled.
    h.style.setLeaf("a", RECT_A);
    h.scheduler.reflow({ ...PLAY_INPUT, clampViewport: h.style.clampViewport });
    expect(h.style.dips[0].cancelled).toBe(true);
  });

  it("dispose cancels M2 + M2b + tracked dips", (): void => {
    const h: Harnessed = makeScheduler();
    recordBaseline(h, "a", RECT_A);
    h.style.setLeaf("a", RECT_B);
    h.scheduler.reflow({
      ...PLAY_INPUT,
      coherentDipActive: true,
      clampViewport: h.style.clampViewport,
    });
    h.fakeScheduler.fireFrame(0);
    const timersBefore: number = h.fakeScheduler.liveTimerCount();
    expect(timersBefore).toBeGreaterThanOrEqual(2); // M2 + M2b still live
    h.scheduler.dispose();
    expect(h.style.dips[0].cancelled).toBe(true);
    // M2 + M2b cancelled; firing them is now a no-op (mask not re-closed twice).
    const animatingCallsBefore: number = h.onReflowAnimatingChange.mock.calls.length;
    h.fakeScheduler.fireTimer(0);
    h.fakeScheduler.fireTimer(1);
    expect(h.onReflowAnimatingChange.mock.calls.length).toBe(animatingCallsBefore);
  });

  it("the strip passes the tracked dips + raced handle to the port for cancellation", (): void => {
    const h: Harnessed = makeScheduler();
    recordBaseline(h, "a", RECT_A);
    h.style.setLeaf("a", RECT_B);
    h.scheduler.reflow({ ...PLAY_INPUT, clampViewport: h.style.clampViewport });
    h.scheduler.stripTransient();
    expect(h.style.lastStripTransientArgs).not.toBeNull();
    // The M1 raced play handle is handed to the strip so it is cancelled.
    expect(h.style.lastStripTransientArgs?.racedHandles.length).toBe(1);
  });
});
