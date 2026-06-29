/**
 * @jest-environment jsdom
 *
 * Drag-recovery DOM/renderer-layer integration (INV-R1..INV-R4 under frame
 * starvation). The PURE recovery primitives (`scheduleFrameOrTimeout` M1,
 * `createDragWatchdog` M3, `stripTransientDragStyles` M4) are already exhaustively
 * unit-tested against fake style targets in the `node` env (`drag-recovery.test.ts`);
 * what that coverage cannot exercise is the primitives running THROUGH REAL REACT
 * EFFECTS that mutate REAL DOM element `style` — the layer the renderer actually
 * wires. This suite closes that gap in a jsdom env with `requestAnimationFrame`
 * stubbed to NEVER fire (the worst-case starvation) and an injected manual clock /
 * scheduler, mirroring how the renderer arms each primitive.
 *
 * SCOPING (deliberate): a full `DynamicTilingRenderer` mount is impractical under
 * jsdom — the renderer derives `viewportSize` from `ResizeObserver` (absent in
 * jsdom) and ALL drag geometry from `getBoundingClientRect` (returns zeros in
 * jsdom), so a pointer-driven drag can never cross the pickup threshold into
 * `dragging`, and the survivor-reflow / ghost-hop effects never arm. This suite
 * therefore mounts the SMALLEST mountable surface that exercises M1 timeout-
 * fallback + M3 watchdog + M4 strip through real effects: a harness component that
 * arms the SAME exported primitives the renderer does, against real
 * `[data-leaf-id]` DOM nodes. The renderer's own wiring of these primitives is
 * verified by typecheck + the existing renderer effects; this asserts the
 * primitive→DOM contract end-to-end.
 */
import { afterEach, describe, expect, it } from "@jest/globals";
import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";
import {
  createDragWatchdog,
  scheduleFrameOrTimeout,
  stripTransientDragStyles,
  type DragWatchdog,
  type FrameOrTimeoutScheduler,
} from "../drag-recovery";

/**
 * Manual frame/timer scheduler — the renderer injects the real
 * `window.requestAnimationFrame`/`setTimeout` family; here every frame/timer is
 * fired by hand so the rAF-starved race is exercised deterministically. Mirrors
 * the `FakeScheduler` in `drag-recovery.test.ts` (node env) but is driven from
 * inside React `act()` so the resulting style mutations + state updates flush.
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

  /** Fire the most-recently-armed live timer (what a real clock would deliver). */
  fireActiveTimer = (): void => {
    for (let i: number = this.timers.length - 1; i >= 0; i--) {
      const timer: FakeHandle = this.timers[i];
      if (timer.live) {
        timer.live = false;
        timer.callback();
        return;
      }
    }
  };

  /** Fire the most-recently-armed live frame. */
  fireActiveFrame = (): void => {
    for (let i: number = this.frames.length - 1; i >= 0; i--) {
      const frame: FakeHandle = this.frames[i];
      if (frame.live) {
        frame.live = false;
        frame.callback();
        return;
      }
    }
  };

  liveTimerCount = (): number =>
    this.timers.filter((t: FakeHandle): boolean => t.live).length;

  liveFrameCount = (): number =>
    this.frames.filter((f: FakeHandle): boolean => f.live).length;
}

const INVERTED_FIRST_TRANSFORM: string =
  "translate(40px, 30px) scale(0.5, 0.5)";

/**
 * M1 harness — mirrors the renderer's survivor-reflow layout effect: paint the
 * inverted `First` transform on a real `[data-leaf-id]` element, then arm
 * `scheduleFrameOrTimeout` whose callback writes the play-to-identity transform.
 * `requestFrame` is NEVER fired by the test (rAF starvation), so only the timeout
 * backstop can resolve the element to identity.
 */
function M1SurvivorHarness(props: {
  scheduler: FrameOrTimeoutScheduler;
  frameDeadlineMs: number;
}): React.ReactElement {
  const leafRef = React.useRef<HTMLDivElement | null>(null);

  React.useLayoutEffect((): (() => void) => {
    const element: HTMLDivElement | null = leafRef.current;
    if (element == null) {
      return (): void => undefined;
    }
    // First (inverted): the survivor is displaced/scaled, mid-FLIP.
    element.style.transformOrigin = "top left";
    element.style.transform = INVERTED_FIRST_TRANSFORM;
    const handle = scheduleFrameOrTimeout(
      props.scheduler,
      props.frameDeadlineMs,
      (): void => {
        // Play-to-identity: the renderer arms the transition then writes the
        // committed (Last) identity transform here.
        element.style.transition = "transform 170ms linear";
        element.style.transform = "none";
      },
    );
    return (): void => {
      handle.cancel();
    };
  }, [props.scheduler, props.frameDeadlineMs]);

  return React.createElement("div", { "data-leaf-id": "A", ref: leafRef });
}

/**
 * M3 + M4 harness — mirrors the renderer's drag-phase watchdog wiring: a leaf is
 * carrying a transient (non-identity) drag transform while the FSM is `dragging`;
 * a watchdog is armed on entry and the simulated `pointerup` NEVER arrives. On
 * idle expiry the watchdog's `onExpire` runs the same recovery the renderer wires
 * to `POINTER_CANCEL` → settle teardown: `stripTransientDragStyles` on the leaf
 * (M4) and a transition to `idle` (M3 driving the cancel edge).
 */
function M3WatchdogHarness(props: {
  scheduler: FrameOrTimeoutScheduler;
  now: () => number;
  maxIdleMs: number;
}): React.ReactElement {
  const leafRef = React.useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = React.useState<"dragging" | "idle">("dragging");

  React.useEffect((): (() => void) => {
    const element: HTMLDivElement | null = leafRef.current;
    if (element == null) {
      return (): void => undefined;
    }
    // Transient drag styles present while `dragging`.
    element.style.transform = INVERTED_FIRST_TRANSFORM;
    element.style.transition = "transform 170ms linear";
    const watchdog: DragWatchdog = createDragWatchdog({
      maxIdleMs: props.maxIdleMs,
      now: props.now,
      scheduler: props.scheduler,
      onExpire: (): void => {
        // The renderer wires this to dispatchDrag({ type: "POINTER_CANCEL" });
        // the settle teardown then strips transient styles. Collapsed here to the
        // observable INV-R3 (→ idle) + INV-R4 (styles stripped) at the DOM layer.
        stripTransientDragStyles({ ghost: null, leaves: [element] });
        setPhase("idle");
      },
    });
    // Initial arm on entering `dragging`. No further progress events: the
    // simulated `pointerup` (and every other terminal event) never arrives.
    watchdog.progress();
    return (): void => {
      watchdog.cancel();
    };
  }, [props.scheduler, props.now, props.maxIdleMs]);

  return React.createElement("div", {
    "data-leaf-id": "A",
    "data-phase": phase,
    ref: leafRef,
  });
}

function leafElement(container: HTMLElement): HTMLElement {
  const element: HTMLElement | null =
    container.querySelector<HTMLElement>('[data-leaf-id="A"]');
  if (element == null) {
    throw new Error("harness leaf element [data-leaf-id=A] not found");
  }
  return element;
}

afterEach((): void => {
  cleanup();
});

describe("drag-recovery DOM layer — M1 rAF-starvation timeout fallback (INV-R1/INV-R2)", (): void => {
  it("resolves a survivor's inverted transform to identity via the timeout when rAF never fires", (): void => {
    const scheduler: FakeScheduler = new FakeScheduler();
    const frameDeadlineMs: number = 32;
    const { container } = render(
      React.createElement(M1SurvivorHarness, { scheduler, frameDeadlineMs }),
    );
    const leaf: HTMLElement = leafElement(container);

    // The layout effect painted the inverted First and armed BOTH a frame and a
    // timeout (the M1 race).
    expect(leaf.style.transform).toBe(INVERTED_FIRST_TRANSFORM);
    expect(scheduler.liveFrameCount()).toBe(1);
    expect(scheduler.liveTimerCount()).toBe(1);

    // rAF is STARVED: never fire the frame; only the timeout backstop fires.
    act((): void => {
      scheduler.fireActiveTimer();
    });

    // INV-R1: no [data-leaf-id] element retains a non-identity inline transform.
    expect(leaf.style.transform).toBe("none");
  });

  it("is idempotent: a late frame after the timeout already played does not re-run (no transform thrash)", (): void => {
    const scheduler: FakeScheduler = new FakeScheduler();
    const { container } = render(
      React.createElement(M1SurvivorHarness, {
        scheduler,
        frameDeadlineMs: 32,
      }),
    );
    const leaf: HTMLElement = leafElement(container);

    act((): void => {
      scheduler.fireActiveTimer();
    });
    expect(leaf.style.transform).toBe("none");

    // The timer-won `runOnce` already cancelled the pending frame (clearPending),
    // and the M1 `hasRun` guard would no-op it anyway — firing it cannot re-run
    // the play-to-identity, so the element stays clean at identity (no thrash).
    expect(scheduler.liveFrameCount()).toBe(0);
    act((): void => {
      scheduler.fireActiveFrame();
    });
    expect(leaf.style.transform).toBe("none");
  });
});

describe("drag-recovery DOM layer — M3 idle watchdog recovers a never-arriving pointerup (INV-R3/INV-R4)", (): void => {
  it("a never-released drag self-heals to idle with transient styles stripped", (): void => {
    const scheduler: FakeScheduler = new FakeScheduler();
    let clock: number = 0;
    const now = (): number => clock;
    const maxIdleMs: number = 5100;
    const { container } = render(
      React.createElement(M3WatchdogHarness, { scheduler, now, maxIdleMs }),
    );
    const leaf: HTMLElement = leafElement(container);

    // Mid-drag: transient styles present, watchdog armed, no pointerup.
    expect(leaf.getAttribute("data-phase")).toBe("dragging");
    expect(leaf.style.transform).toBe(INVERTED_FIRST_TRANSFORM);
    expect(scheduler.liveTimerCount()).toBe(1);

    // The pointer goes idle past the deadline (monotonic clock advances) and the
    // watchdog timer fires.
    clock = maxIdleMs + 1;
    act((): void => {
      scheduler.fireActiveTimer();
    });

    // INV-R3: the FSM is driven back to idle via the cancel edge.
    expect(leaf.getAttribute("data-phase")).toBe("idle");
    // INV-R4: no residual transient transform/transition remains.
    expect(leaf.style.transform).toBe("none");
    expect(leaf.style.transition).toBe("none");
  });

  it("a late watchdog fire after real progress re-arms instead of cancelling a live drag", (): void => {
    const scheduler: FakeScheduler = new FakeScheduler();
    let clock: number = 0;
    const now = (): number => clock;
    const maxIdleMs: number = 5100;
    const { container } = render(
      React.createElement(M3WatchdogHarness, { scheduler, now, maxIdleMs }),
    );
    const leaf: HTMLElement = leafElement(container);

    // A timer fires LATE but only a little time has actually elapsed (real
    // progress kept the drag alive): the monotonic re-check re-arms rather than
    // tripping, so the drag stays live and styles are untouched.
    clock = maxIdleMs - 1000;
    act((): void => {
      scheduler.fireActiveTimer();
    });
    expect(leaf.getAttribute("data-phase")).toBe("dragging");
    expect(leaf.style.transform).toBe(INVERTED_FIRST_TRANSFORM);
    // The watchdog re-armed for the remaining idle budget.
    expect(scheduler.liveTimerCount()).toBe(1);
  });
});
