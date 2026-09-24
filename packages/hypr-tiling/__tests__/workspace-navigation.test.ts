/**
 * `engine/workspace-navigation.ts` — the pure workspace swipe FSM (N1). Every
 * arming rule, the threshold / velocity commit rules, cancel, the wheel-idle
 * close, lockout swallowing trackpad momentum, the no-wrap edge, `DRAG_ACTIVE`
 * blocking, progress sign / clamp, and the single command emission.
 */
import { describe, expect, it } from "@jest/globals";
import {
  TILING_WORKSPACE_SWIPE_DEFAULTS,
  TILING_WORKSPACE_SWIPE_IDLE_SNAPSHOT,
  TILING_WORKSPACE_SWIPE_INITIAL_STATE,
  hasSwipeNeighbour,
  resolveSwipeArming,
  resolveWorkspaceSwipeConfig,
  shouldCommitSwipe,
  swipeCommitCommand,
  swipeProgressOfTravel,
  swipeTargetOfTravel,
  workspaceSwipeReducer,
  workspaceSwipeSnapshot,
  type TilingWorkspaceSwipeConfig,
  type TilingWorkspaceSwipeContext,
  type TilingWorkspaceSwipeEvent,
  type TilingWorkspaceSwipeState,
} from "../engine/workspace-navigation";

const WIDTH: number = 1000;

const CONTEXT: TilingWorkspaceSwipeContext = {
  hasPrev: true,
  hasNext: true,
  widthPx: WIDTH,
  dragActive: false,
};

function ready(context: Partial<TilingWorkspaceSwipeContext> = {}): TilingWorkspaceSwipeState {
  const merged: TilingWorkspaceSwipeContext = { ...CONTEXT, ...context };
  const withContext: TilingWorkspaceSwipeState = workspaceSwipeReducer(TILING_WORKSPACE_SWIPE_INITIAL_STATE, {
    type: "SET_CONTEXT",
    hasPrev: merged.hasPrev,
    hasNext: merged.hasNext,
    widthPx: merged.widthPx ?? undefined,
  });
  return workspaceSwipeReducer(withContext, { type: "DRAG_ACTIVE", active: merged.dragActive });
}

function run(
  start: TilingWorkspaceSwipeState,
  events: ReadonlyArray<TilingWorkspaceSwipeEvent>,
  config: TilingWorkspaceSwipeConfig = TILING_WORKSPACE_SWIPE_DEFAULTS,
): TilingWorkspaceSwipeState {
  return events.reduce(
    (state: TilingWorkspaceSwipeState, event: TilingWorkspaceSwipeEvent): TilingWorkspaceSwipeState =>
      workspaceSwipeReducer(state, event, config),
    start,
  );
}

function wheel(
  dx: number,
  ts: number,
  extra: Partial<Extract<TilingWorkspaceSwipeEvent, { type: "WHEEL" }>> = {},
): TilingWorkspaceSwipeEvent {
  return { type: "WHEEL", dx, dy: 0, ctrlKey: false, ts, ...extra };
}

/** A slow burst that reaches `travel` px in `steps` samples (sub-flick velocity). */
function slowBurst(travel: number, steps: number, t0: number = 0): ReadonlyArray<TilingWorkspaceSwipeEvent> {
  const events: TilingWorkspaceSwipeEvent[] = [];
  for (let index = 1; index <= steps; index += 1) {
    events.push(wheel(travel / steps, t0 + index * 100));
  }
  return events;
}

describe("workspace swipe FSM — config", (): void => {
  it("exposes the documented defaults and merges partial overrides", (): void => {
    expect(TILING_WORKSPACE_SWIPE_DEFAULTS).toEqual({
      thresholdPx: 24,
      commitFraction: 0.35,
      commitVelocityPxMs: 0.6,
      wheelIdleMs: 120,
      lockoutMs: 350,
      wrap: false,
      widthPx: 800,
    });
    expect(resolveWorkspaceSwipeConfig({ commitFraction: 0.5, wrap: true })).toEqual({
      ...TILING_WORKSPACE_SWIPE_DEFAULTS,
      commitFraction: 0.5,
      wrap: true,
    });
    expect(resolveWorkspaceSwipeConfig(null)).toEqual(TILING_WORKSPACE_SWIPE_DEFAULTS);
    // Nonsensical values are clamped, never propagated.
    expect(resolveWorkspaceSwipeConfig({ thresholdPx: -5, commitFraction: 2, widthPx: 0 })).toMatchObject({
      thresholdPx: 0,
      commitFraction: 1,
      widthPx: 1,
    });
  });
});

describe("workspace swipe FSM — arming rules", (): void => {
  const base = { context: CONTEXT, dy: 0, ctrlKey: false, canScrollFurther: false, wrap: false };

  it("arms towards next on a horizontal-dominant rightward sample and prev on leftward", (): void => {
    expect(resolveSwipeArming({ ...base, dx: 30 })).toBe("next");
    expect(resolveSwipeArming({ ...base, dx: -30 })).toBe("prev");
  });

  it("refuses to arm while a drag is active", (): void => {
    expect(resolveSwipeArming({ ...base, context: { ...CONTEXT, dragActive: true }, dx: 30 })).toBeNull();
    const state: TilingWorkspaceSwipeState = run(ready(), [
      { type: "DRAG_ACTIVE", active: true },
      wheel(40, 0),
      wheel(40, 10),
    ]);
    expect(state.phase).toBe("idle");
    // Releasing the drag restores arming.
    const after: TilingWorkspaceSwipeState = run(state, [{ type: "DRAG_ACTIVE", active: false }, wheel(40, 20)]);
    expect(after.phase).toBe("tracking");
  });

  it("refuses to arm unless |dx| > 2·|dy|", (): void => {
    expect(resolveSwipeArming({ ...base, dx: 30, dy: 15 })).toBeNull();
    expect(resolveSwipeArming({ ...base, dx: 30, dy: 14 })).toBe("next");
    expect(resolveSwipeArming({ ...base, dx: 0, dy: 0 })).toBeNull();
    const vertical: TilingWorkspaceSwipeState = run(ready(), [wheel(10, 0, { dy: 40 })]);
    expect(vertical.phase).toBe("idle");
  });

  it("refuses to arm on a ctrl-wheel (pinch-zoom)", (): void => {
    expect(resolveSwipeArming({ ...base, dx: 30, ctrlKey: true })).toBeNull();
    expect(run(ready(), [wheel(40, 0, { ctrlKey: true })]).phase).toBe("idle");
  });

  it("refuses to arm while the scroll chain can still scroll on X", (): void => {
    expect(resolveSwipeArming({ ...base, dx: 30, canScrollFurther: true })).toBeNull();
    expect(run(ready(), [wheel(40, 0, { canScrollFurther: true })]).phase).toBe("idle");
    // …and an armed gesture drops when a later pre-threshold sample reports it.
    const dropped: TilingWorkspaceSwipeState = run(ready(), [
      wheel(10, 0),
      wheel(10, 10, { canScrollFurther: true }),
    ]);
    expect(dropped.phase).toBe("idle");
  });

  it("stays idle with no neighbour in that direction when wrap is false", (): void => {
    expect(hasSwipeNeighbour({ ...CONTEXT, hasNext: false }, "next", false)).toBe(false);
    expect(hasSwipeNeighbour({ ...CONTEXT, hasNext: false }, "next", true)).toBe(true);
    expect(hasSwipeNeighbour({ ...CONTEXT, hasPrev: false, hasNext: false }, "next", true)).toBe(false);
    const atLast: TilingWorkspaceSwipeState = run(ready({ hasNext: false }), [wheel(60, 0), wheel(60, 10)]);
    expect(atLast.phase).toBe("idle");
    const atFirst: TilingWorkspaceSwipeState = run(ready({ hasPrev: false }), [wheel(-60, 0)]);
    expect(atFirst.phase).toBe("idle");
    // The other direction still arms.
    expect(run(ready({ hasNext: false }), [wheel(-60, 0)]).phase).toBe("tracking");
  });

  it("arms past the edge when wrap is true", (): void => {
    const wrapConfig: TilingWorkspaceSwipeConfig = { ...TILING_WORKSPACE_SWIPE_DEFAULTS, wrap: true };
    const state: TilingWorkspaceSwipeState = run(ready({ hasNext: false }), [wheel(60, 0)], wrapConfig);
    expect(state.phase).toBe("tracking");
    expect(state.target).toBe("next");
  });

  it("holds armed below the threshold and tracks once cumulative travel reaches it", (): void => {
    const armed: TilingWorkspaceSwipeState = run(ready(), [wheel(10, 0)]);
    expect(armed.phase).toBe("armed");
    expect(armed.progress).toBe(0);
    expect(armed.target).toBeNull();
    const stillArmed: TilingWorkspaceSwipeState = run(armed, [wheel(10, 10)]);
    expect(stillArmed.phase).toBe("armed");
    const tracking: TilingWorkspaceSwipeState = run(stillArmed, [wheel(10, 20)]);
    expect(tracking.phase).toBe("tracking");
    expect(tracking.target).toBe("next");
    expect(tracking.progress).toBeCloseTo(30 / WIDTH);
  });

  it("an armed wheel gesture that goes idle before the threshold returns to idle", (): void => {
    const state: TilingWorkspaceSwipeState = run(ready(), [wheel(10, 0), { type: "IDLE_TICK", ts: 200 }]);
    expect(state.phase).toBe("idle");
    // A tick inside the idle window keeps it armed.
    expect(run(ready(), [wheel(10, 0), { type: "IDLE_TICK", ts: 100 }]).phase).toBe("armed");
  });
});

describe("workspace swipe FSM — progress sign and clamp", (): void => {
  it("negative progress heads to prev, positive to next, clamped to ±1", (): void => {
    expect(swipeTargetOfTravel(-1)).toBe("prev");
    expect(swipeTargetOfTravel(1)).toBe("next");
    expect(swipeTargetOfTravel(0)).toBeNull();
    expect(swipeProgressOfTravel(-250, WIDTH, CONTEXT, false)).toBeCloseTo(-0.25);
    expect(swipeProgressOfTravel(5000, WIDTH, CONTEXT, false)).toBe(1);
    expect(swipeProgressOfTravel(-5000, WIDTH, CONTEXT, false)).toBe(-1);
    const left: TilingWorkspaceSwipeState = run(ready(), [wheel(-300, 0)]);
    expect(left.progress).toBeCloseTo(-0.3);
    expect(left.target).toBe("prev");
  });

  it("clamps progress at 0 on a side without a neighbour once tracking (no rubber-band)", (): void => {
    // Arm towards prev, then over-travel towards next where there is nothing.
    const state: TilingWorkspaceSwipeState = run(ready({ hasNext: false }), [wheel(-40, 0), wheel(200, 10)]);
    expect(state.phase).toBe("tracking");
    expect(state.progress).toBe(0);
    expect(state.target).toBeNull();
    // Ending there cancels.
    const ended: TilingWorkspaceSwipeState = run(state, [{ type: "IDLE_TICK", ts: 200 }]);
    expect(ended.phase).toBe("settling");
    expect(ended.phase === "settling" ? ended.outcome : null).toBe("cancel");
  });

  it("uses the sample width over the context width and the config fallback last", (): void => {
    const fromSample: TilingWorkspaceSwipeState = run(ready(), [wheel(100, 0, { widthPx: 200 })]);
    expect(fromSample.progress).toBeCloseTo(0.5);
    const fallback: TilingWorkspaceSwipeState = run(
      workspaceSwipeReducer(TILING_WORKSPACE_SWIPE_INITIAL_STATE, {
        type: "SET_CONTEXT",
        hasPrev: true,
        hasNext: true,
      }),
      [wheel(400, 0)],
    );
    expect(fallback.progress).toBeCloseTo(400 / TILING_WORKSPACE_SWIPE_DEFAULTS.widthPx);
  });
});

describe("workspace swipe FSM — commit and cancel", (): void => {
  it("commits by distance at wheel idle and emits cycle-workspace exactly once", (): void => {
    const tracking: TilingWorkspaceSwipeState = run(ready(), slowBurst(400, 4));
    expect(tracking.phase).toBe("tracking");
    expect(tracking.progress).toBeCloseTo(0.4);
    const settling: TilingWorkspaceSwipeState = run(tracking, [{ type: "IDLE_TICK", ts: 400 + 120 }]);
    expect(settling.phase).toBe("settling");
    expect(settling.phase === "settling" ? settling.outcome : null).toBe("commit");
    expect(settling.target).toBe("next");
    expect(settling.command).toEqual({ kind: "cycle-workspace", direction: "next" });
    // The command lives on exactly one state: after SETTLE_DONE it is gone.
    const lockout: TilingWorkspaceSwipeState = run(settling, [{ type: "SETTLE_DONE" }]);
    expect(lockout.phase).toBe("lockout");
    expect(lockout.command).toBeNull();
    expect(lockout.progress).toBe(0);
  });

  it("commits towards prev with the previous direction", (): void => {
    const settling: TilingWorkspaceSwipeState = run(ready(), [
      ...slowBurst(-400, 4),
      { type: "IDLE_TICK", ts: 1000 },
    ]);
    expect(settling.command).toEqual({ kind: "cycle-workspace", direction: "previous" });
    expect(swipeCommitCommand("prev")).toEqual({ kind: "cycle-workspace", direction: "previous" });
  });

  it("commits by peak velocity even below the distance fraction (the flick)", (): void => {
    // 60px in 10ms twice = 6 px/ms ≫ 0.6; total 120px = 0.12 of the width.
    const settling: TilingWorkspaceSwipeState = run(ready(), [
      wheel(60, 0),
      wheel(60, 10),
      { type: "IDLE_TICK", ts: 200 },
    ]);
    expect(settling.progress).toBeCloseTo(0.12);
    expect(settling.phase === "settling" ? settling.outcome : null).toBe("commit");
    expect(shouldCommitSwipe({
      progress: 0.1,
      target: "next",
      peakVelocityPxMs: 0.6,
      config: TILING_WORKSPACE_SWIPE_DEFAULTS,
    })).toBe(true);
  });

  it("does not count velocity away from the target", (): void => {
    // A fast swipe right then a fast pull back left: the net travel is small
    // and the peak towards the FINAL target (prev) never reached the flick.
    const state: TilingWorkspaceSwipeState = run(ready(), [
      wheel(30, 0),
      wheel(30, 10), // 3 px/ms towards next
      wheel(-70, 1000), // slow return past zero → target prev at 0.07 px/ms
      { type: "IDLE_TICK", ts: 1200 },
    ]);
    expect(state.target === null).toBe(true);
    expect(state.phase === "settling" ? state.outcome : null).toBe("cancel");
  });

  it("cancels at gesture end below both thresholds and reports settling with target null", (): void => {
    const settling: TilingWorkspaceSwipeState = run(ready(), [
      ...slowBurst(100, 4),
      { type: "IDLE_TICK", ts: 1000 },
    ]);
    expect(settling.phase).toBe("settling");
    expect(settling.phase === "settling" ? settling.outcome : null).toBe("cancel");
    expect(settling.target).toBeNull();
    expect(settling.command).toBeNull();
    // Progress is preserved so a transition can animate it back to 0.
    expect(settling.progress).toBeCloseTo(0.1);
    // A cancelled settle returns straight to idle (no lockout).
    expect(run(settling, [{ type: "SETTLE_DONE" }]).phase).toBe("idle");
  });

  it("does not close the wheel gesture before wheelIdleMs since the last sample", (): void => {
    const tracking: TilingWorkspaceSwipeState = run(ready(), [wheel(100, 0)]);
    expect(run(tracking, [{ type: "IDLE_TICK", ts: 119 }]).phase).toBe("tracking");
    expect(run(tracking, [{ type: "IDLE_TICK", ts: 120 }]).phase).toBe("settling");
  });

  it("CANCEL settles a tracking gesture as cancel and drops an armed one", (): void => {
    const cancelled: TilingWorkspaceSwipeState = run(ready(), [wheel(300, 0), { type: "CANCEL" }]);
    expect(cancelled.phase).toBe("settling");
    expect(cancelled.phase === "settling" ? cancelled.outcome : null).toBe("cancel");
    expect(cancelled.command).toBeNull();
    expect(run(ready(), [wheel(10, 0), { type: "CANCEL" }]).phase).toBe("idle");
    expect(run(TILING_WORKSPACE_SWIPE_INITIAL_STATE, [{ type: "CANCEL" }])).toBe(
      TILING_WORKSPACE_SWIPE_INITIAL_STATE,
    );
  });

  it("DRAG_ACTIVE mid-gesture yields: tracking settles as cancel, armed drops", (): void => {
    const cancelled: TilingWorkspaceSwipeState = run(ready(), [
      wheel(300, 0),
      { type: "DRAG_ACTIVE", active: true },
    ]);
    expect(cancelled.phase).toBe("settling");
    expect(cancelled.command).toBeNull();
    expect(cancelled.context.dragActive).toBe(true);
    expect(run(ready(), [wheel(10, 0), { type: "DRAG_ACTIVE", active: true }]).phase).toBe("idle");
  });

  it("swallows wheel samples while settling", (): void => {
    const settling: TilingWorkspaceSwipeState = run(ready(), [wheel(400, 0), { type: "IDLE_TICK", ts: 200 }]);
    const after: TilingWorkspaceSwipeState = run(settling, [wheel(200, 210), wheel(200, 220)]);
    expect(after).toBe(settling);
  });
});

describe("workspace swipe FSM — lockout", (): void => {
  const committed: TilingWorkspaceSwipeState = run(ready(), [
    wheel(400, 0),
    { type: "IDLE_TICK", ts: 200 },
    { type: "SETTLE_DONE" },
  ]);

  it("swallows every wheel sample until lockoutMs after the commit", (): void => {
    expect(committed.phase).toBe("lockout");
    expect(committed.phase === "lockout" ? committed.until : null).toBe(200 + 350);
    // Momentum samples: big, would otherwise arm + commit again.
    const momentum: TilingWorkspaceSwipeState = run(committed, [
      wheel(120, 220),
      wheel(90, 240),
      wheel(60, 300),
      wheel(30, 500),
    ]);
    expect(momentum.phase).toBe("lockout");
    expect(momentum.command).toBeNull();
  });

  it("expires on the clock and the next sample starts a fresh gesture", (): void => {
    // The expiring sample itself is swallowed (it is still momentum).
    const expired: TilingWorkspaceSwipeState = run(committed, [wheel(80, 550)]);
    expect(expired.phase).toBe("idle");
    expect(run(expired, [wheel(80, 560)]).phase).toBe("tracking");
    // An idle tick past the lockout also releases it (no wheel needed).
    expect(run(committed, [{ type: "IDLE_TICK", ts: 549 }]).phase).toBe("lockout");
    expect(run(committed, [{ type: "IDLE_TICK", ts: 550 }]).phase).toBe("idle");
  });

  it("a deliberate touch is not momentum and arms through the lockout", (): void => {
    const touched: TilingWorkspaceSwipeState = run(committed, [{ type: "TOUCH_START", x: 500, y: 100, ts: 300 }]);
    expect(touched.phase).toBe("armed");
  });

  it("CANCEL releases the lockout", (): void => {
    expect(run(committed, [{ type: "CANCEL" }]).phase).toBe("idle");
  });
});

describe("workspace swipe FSM — touch", (): void => {
  it("arms on touch start, holds jitter, tracks a horizontal pan with finger-left = next", (): void => {
    const armed: TilingWorkspaceSwipeState = run(ready(), [{ type: "TOUCH_START", x: 500, y: 300, ts: 0 }]);
    expect(armed.phase).toBe("armed");
    const held: TilingWorkspaceSwipeState = run(armed, [{ type: "TOUCH_MOVE", x: 490, y: 302, ts: 16 }]);
    expect(held.phase).toBe("armed");
    const tracking: TilingWorkspaceSwipeState = run(held, [{ type: "TOUCH_MOVE", x: 400, y: 305, ts: 32 }]);
    expect(tracking.phase).toBe("tracking");
    expect(tracking.target).toBe("next");
    expect(tracking.progress).toBeCloseTo(0.1);
    const further: TilingWorkspaceSwipeState = run(tracking, [{ type: "TOUCH_MOVE", x: 100, y: 305, ts: 400 }]);
    expect(further.progress).toBeCloseTo(0.4);
    const settled: TilingWorkspaceSwipeState = run(further, [{ type: "TOUCH_END", ts: 420 }]);
    expect(settled.phase).toBe("settling");
    expect(settled.command).toEqual({ kind: "cycle-workspace", direction: "next" });
  });

  it("a vertical-dominant pan releases the touch to the page and later moves are ignored", (): void => {
    const released: TilingWorkspaceSwipeState = run(ready(), [
      { type: "TOUCH_START", x: 500, y: 300, ts: 0 },
      { type: "TOUCH_MOVE", x: 495, y: 360, ts: 16 },
    ]);
    expect(released.phase).toBe("idle");
    expect(run(released, [{ type: "TOUCH_MOVE", x: 300, y: 360, ts: 32 }]).phase).toBe("idle");
    expect(run(released, [{ type: "TOUCH_END", ts: 40 }]).phase).toBe("idle");
  });

  it("does not arm a touch while a drag is active or when the chain can scroll", (): void => {
    expect(run(ready({ dragActive: true }), [{ type: "TOUCH_START", x: 500, y: 300, ts: 0 }]).phase).toBe(
      "idle",
    );
    const blocked: TilingWorkspaceSwipeState = run(ready(), [
      { type: "TOUCH_START", x: 500, y: 300, ts: 0 },
      { type: "TOUCH_MOVE", x: 400, y: 300, ts: 16, canScrollFurther: true },
    ]);
    expect(blocked.phase).toBe("idle");
  });

  it("touch end below both thresholds cancels; a fast flick commits", (): void => {
    const cancelled: TilingWorkspaceSwipeState = run(ready(), [
      { type: "TOUCH_START", x: 500, y: 300, ts: 0 },
      { type: "TOUCH_MOVE", x: 440, y: 300, ts: 500 },
      { type: "TOUCH_END", ts: 600 },
    ]);
    expect(cancelled.phase === "settling" ? cancelled.outcome : null).toBe("cancel");
    const flicked: TilingWorkspaceSwipeState = run(ready(), [
      { type: "TOUCH_START", x: 500, y: 300, ts: 0 },
      { type: "TOUCH_MOVE", x: 440, y: 300, ts: 20 },
      { type: "TOUCH_END", ts: 30 },
    ]);
    expect(flicked.phase === "settling" ? flicked.outcome : null).toBe("commit");
  });

  it("wheel samples do not disturb a touch gesture and vice versa", (): void => {
    const touchTracking: TilingWorkspaceSwipeState = run(ready(), [
      { type: "TOUCH_START", x: 500, y: 300, ts: 0 },
      { type: "TOUCH_MOVE", x: 400, y: 300, ts: 16 },
    ]);
    expect(run(touchTracking, [wheel(500, 20)])).toBe(touchTracking);
    const wheelTracking: TilingWorkspaceSwipeState = run(ready(), [wheel(100, 0)]);
    expect(run(wheelTracking, [{ type: "TOUCH_MOVE", x: 0, y: 0, ts: 5 }])).toBe(wheelTracking);
    expect(run(wheelTracking, [{ type: "TOUCH_END", ts: 5 }])).toBe(wheelTracking);
  });
});

describe("workspace swipe FSM — context and snapshot", (): void => {
  it("SET_CONTEXT never changes the phase and re-clamps on the next sample", (): void => {
    const tracking: TilingWorkspaceSwipeState = run(ready(), [wheel(300, 0)]);
    const updated: TilingWorkspaceSwipeState = workspaceSwipeReducer(tracking, {
      type: "SET_CONTEXT",
      hasPrev: true,
      hasNext: false,
    });
    expect(updated.phase).toBe("tracking");
    expect(updated.progress).toBeCloseTo(0.3);
    const next: TilingWorkspaceSwipeState = run(updated, [wheel(10, 10)]);
    expect(next.progress).toBe(0);
  });

  it("projects the idle state to the shared idle snapshot and others by value", (): void => {
    expect(workspaceSwipeSnapshot(TILING_WORKSPACE_SWIPE_INITIAL_STATE)).toBe(
      TILING_WORKSPACE_SWIPE_IDLE_SNAPSHOT,
    );
    const tracking: TilingWorkspaceSwipeState = run(ready(), [wheel(-300, 0)]);
    expect(workspaceSwipeSnapshot(tracking)).toEqual({ progress: -0.3, target: "prev", phase: "tracking" });
  });

  it("unmatched events leave the state by reference", (): void => {
    const idle: TilingWorkspaceSwipeState = ready();
    expect(run(idle, [{ type: "SETTLE_DONE" }])).toBe(idle);
    expect(run(idle, [{ type: "IDLE_TICK", ts: 5 }])).toBe(idle);
    expect(run(idle, [{ type: "TOUCH_END", ts: 5 }])).toBe(idle);
    expect(run(idle, [{ type: "DRAG_ACTIVE", active: false }])).toBe(idle);
  });
});
