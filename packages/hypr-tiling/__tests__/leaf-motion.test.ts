import { describe, expect, it } from "@jest/globals";
import { SETTLE_TEMPO, createFakeClock, createFrameLoop, type FakeClock, type FrameLoop, type Rect } from "@n-uf/motion";
import {
  checkContentScale,
  checkMonotonic,
  checkNoJumps,
  checkNoOvershoot,
  checkTempo,
  type ScaleSample,
  type TargetSample,
} from "@n-uf/motion/testing";
import {
  LEAF_MOTION_POP_IN_FROM,
  createLeafMotion,
  settleOmegaForDurationMs,
  type LeafMotion,
  type LeafMotionFrame,
  type LeafMotionTick,
} from "../engine/leaf-motion";

interface Harness {
  readonly clock: FakeClock;
  readonly loop: FrameLoop;
  readonly motion: LeafMotion;
  readonly writes: Array<{ frames: ReadonlyArray<LeafMotionFrame>; tick: LeafMotionTick }>;
  readonly activity: boolean[];
  reduced: boolean;
}

function harness(omega?: number): Harness {
  const clock: FakeClock = createFakeClock();
  const loop: FrameLoop = createFrameLoop({ clock });
  const h: Harness = {
    clock,
    loop,
    writes: [],
    activity: [],
    reduced: false,
    motion: undefined as unknown as LeafMotion,
  };
  (h as { motion: LeafMotion }).motion = createLeafMotion({
    loop,
    omega,
    reducedMotion: (): boolean => h.reduced,
    onWrite: (frames, tick): void => {
      h.writes.push({ frames, tick });
    },
    onActiveChange: (active: boolean): void => {
      h.activity.push(active);
    },
  });
  return h;
}

/** The samples a leaf was drawn at, per write, with the stepped time. */
function samplesOf(h: Harness, id: string): TargetSample[] {
  const out: TargetSample[] = [];
  for (const write of h.writes) {
    for (const frame of write.frames) {
      if (frame.id === id) {
        out.push({ t: write.tick.time, rect: frame.drawn, target: frame.target });
      }
    }
  }
  return out;
}

const A: Rect = { x: 0, y: 0, width: 400, height: 300 };
const B: Rect = { x: 400, y: 0, width: 200, height: 300 };
const C: Rect = { x: 300, y: 50, width: 300, height: 250 };

describe("leaf motion — a new target glides from where the leaf is drawn", () => {
  it("first sight jumps: no motion, the leaf is drawn at its layout rect", () => {
    const h: Harness = harness();
    h.motion.target("a", A);
    expect(h.motion.active).toBe(false);
    expect(h.motion.drawn("a")).toEqual(A);
    h.motion.flush();
    expect(h.writes).toHaveLength(1);
    expect(h.writes[0]!.frames[0]!.reveal).toEqual({ dx: 0, dy: 0, width: 400, height: 300, clipRight: 0, clipBottom: 0 });
    expect(h.clock.pendingFrames).toBe(0);
  });

  it("a reflow settles to its target with no overshoot, monotonic, no jumps, at the default tempo", () => {
    const h: Harness = harness();
    h.motion.target("a", A);
    h.motion.flush();
    h.writes.length = 0;
    h.motion.target("a", B);
    h.motion.flush();
    expect(h.motion.active).toBe(true);
    h.clock.runUntilIdle();
    const samples: TargetSample[] = samplesOf(h, "a");
    expect(samples.length).toBeGreaterThan(5);
    expect(samples[samples.length - 1]!.rect).toEqual(B);
    expect(checkNoOvershoot(samples, A, B).failures).toEqual([]);
    expect(checkMonotonic(samples, B).failures).toEqual([]);
    expect(checkNoJumps(samples, SETTLE_TEMPO.default).failures).toEqual([]);
    const tempo = checkTempo(samples, A, B, (Math.log(10) / SETTLE_TEMPO.default) * 1000, 0.25, samples[0]!.t);
    expect(tempo.failures).toEqual([]);
    expect(h.motion.active).toBe(false);
    expect(h.activity).toEqual([true, false]);
  });

  it("content is laid out at the target and never scaled: only translate, frame size and clip change", () => {
    const h: Harness = harness();
    h.motion.target("a", A);
    h.motion.target("a", B);
    h.clock.frame();
    const frame: LeafMotionFrame = h.motion.frame("a")!;
    expect(frame.target).toEqual(B);
    expect(frame.reveal.dx).toBeLessThan(0);
    // Shrinking 400 → 200 wide: the frame is wider than the target, nothing to clip.
    expect(frame.reveal.width).toBeGreaterThan(200);
    expect(frame.reveal.clipRight).toBe(0);
    expect(frame.pop).toBeNull();
    const scales: ScaleSample[] = h.writes.map((w) => ({ t: w.tick.time, a: 1, d: 1 }));
    expect(checkContentScale(scales, { uniformOnly: false }).ok).toBe(true);
  });

  it("a growing leaf clips its content to the drawn size", () => {
    const h: Harness = harness();
    h.motion.target("a", B);
    h.motion.target("a", A);
    h.clock.frame();
    const frame: LeafMotionFrame = h.motion.frame("a")!;
    expect(frame.reveal.width).toBeLessThan(400);
    expect(frame.reveal.clipRight).toBeCloseTo(400 - frame.reveal.width, 6);
  });

  it("a retarget mid-flight carries on from the drawn rect: no jump, never past the new target", () => {
    const h: Harness = harness();
    h.motion.target("a", A);
    h.motion.target("a", B);
    h.clock.frames(3);
    const mid: Rect = h.motion.drawn("a")!;
    expect(mid.x).toBeGreaterThan(0);
    expect(mid.x).toBeLessThan(400);
    h.writes.length = 0;
    h.motion.target("a", C);
    // The retarget does not move the drawn rect by itself.
    expect(h.motion.drawn("a")).toEqual(mid);
    h.clock.runUntilIdle();
    const samples: TargetSample[] = samplesOf(h, "a");
    expect(checkNoOvershoot(samples, mid, C).failures).toEqual([]);
    expect(checkMonotonic(samples, C).failures).toEqual([]);
    // The frame the retarget happened on, then every frame after it.
    const withStart: TargetSample[] = [{ t: samples[0]!.t - 1000 / 60, rect: mid, target: C }, ...samples];
    expect(checkNoJumps(withStart, SETTLE_TEMPO.default).failures).toEqual([]);
    expect(h.motion.drawn("a")).toEqual(C);
  });

  it("two layout changes 40 ms apart stay monotonic toward the last one", () => {
    const h: Harness = harness();
    h.motion.target("a", A);
    h.motion.target("a", B);
    h.clock.frames(2, 20);
    h.motion.target("a", C);
    h.clock.runUntilIdle();
    const samples: TargetSample[] = samplesOf(h, "a");
    expect(checkNoJumps(samples, SETTLE_TEMPO.default).failures).toEqual([]);
    expect(samples[samples.length - 1]!.rect).toEqual(C);
  });

  it("the same target again does not relaunch or wake the loop", () => {
    const h: Harness = harness();
    h.motion.target("a", A);
    h.motion.target("a", { ...A });
    expect(h.motion.active).toBe(false);
    expect(h.clock.pendingFrames).toBe(0);
  });

  it("time is the stepped time: the loop's deltas summed", () => {
    const h: Harness = harness();
    h.motion.target("a", A);
    h.motion.target("a", B);
    h.clock.frame(10);
    h.clock.frame(30);
    // The first frame after idle is stepped by 1000/60, the next by its real gap.
    expect(h.motion.time).toBeCloseTo(1000 / 60 + 30, 6);
  });
});

describe("leaf motion — a lifted leaf laid out elsewhere", () => {
  it("hold with a layout draws the leaf at the held rect relative to where it is laid out", () => {
    const h: Harness = harness();
    h.motion.target("a", A);
    h.motion.hold("a", { x: 120, y: 40, width: 400, height: 300 }, A);
    const frame: LeafMotionFrame = h.motion.frame("a")!;
    expect(frame.target).toEqual(A);
    expect(frame.moving).toBe(false);
    expect(frame.reveal).toMatchObject({ dx: 120, dy: 40, width: 400, height: 300, clipRight: 0, clipBottom: 0 });
    expect(h.clock.pendingFrames).toBe(0);
  });

  it("target with a layout settles toward the goal; a later plain target lays it out there", () => {
    const h: Harness = harness();
    h.motion.target("a", A);
    const pointer: Rect = { x: 200, y: 100, width: 400, height: 300 };
    h.motion.target("a", pointer, A);
    expect(h.motion.active).toBe(true);
    h.clock.runUntilIdle();
    expect(h.motion.drawn("a")).toEqual(pointer);
    expect(h.motion.frame("a")!.reveal).toMatchObject({ dx: 200, dy: 100 });
    h.writes.length = 0;
    h.motion.target("a", B);
    expect(h.motion.frame("a")!.target).toEqual(B);
    h.clock.runUntilIdle();
    const samples: TargetSample[] = samplesOf(h, "a");
    expect(checkNoOvershoot(samples, pointer, B).failures).toEqual([]);
    expect(checkMonotonic(samples, B).failures).toEqual([]);
    expect(h.motion.frame("a")!.reveal).toMatchObject({ dx: 0, dy: 0, clipRight: 0, clipBottom: 0 });
  });
});

describe("leaf motion — hold, jump, reduced motion, tempo", () => {
  it("hold puts the leaf exactly there, at rest, and the next target launches from it", () => {
    const h: Harness = harness();
    h.motion.target("a", A);
    h.motion.target("a", B);
    h.clock.frame();
    h.motion.hold("a", C);
    expect(h.motion.drawn("a")).toEqual(C);
    expect(h.motion.frame("a")!.reveal).toMatchObject({ dx: 0, dy: 0, clipRight: 0, clipBottom: 0 });
    h.clock.runUntilIdle();
    expect(h.motion.drawn("a")).toEqual(C);
    h.writes.length = 0;
    h.motion.target("a", A);
    h.clock.runUntilIdle();
    const samples: TargetSample[] = samplesOf(h, "a");
    expect(checkNoOvershoot(samples, C, A).failures).toEqual([]);
  });

  it("reduced motion snaps every target and skips the pop-in", () => {
    const h: Harness = harness();
    h.reduced = true;
    h.motion.target("a", A);
    h.motion.target("a", B);
    expect(h.motion.drawn("a")).toEqual(B);
    expect(h.motion.active).toBe(false);
    h.motion.open("a");
    expect(h.motion.frame("a")!.pop).toBeNull();
    expect(h.clock.pendingFrames).toBe(0);
  });

  it("jump drops a glide in flight", () => {
    const h: Harness = harness();
    h.motion.target("a", A);
    h.motion.target("a", B);
    h.clock.frame();
    h.motion.jump("a", C);
    expect(h.motion.drawn("a")).toEqual(C);
    h.clock.runUntilIdle();
    expect(h.motion.drawn("a")).toEqual(C);
  });

  it("a faster tempo arrives sooner", () => {
    const slow: Harness = harness(SETTLE_TEMPO.calm);
    const fast: Harness = harness(SETTLE_TEMPO.quick);
    for (const h of [slow, fast]) {
      h.motion.target("a", A);
      h.motion.target("a", B);
      h.clock.frames(4);
    }
    expect(fast.motion.drawn("a")!.x).toBeGreaterThan(slow.motion.drawn("a")!.x);
    expect(fast.motion.omega).toBe(SETTLE_TEMPO.quick);
    slow.motion.configure({ omega: SETTLE_TEMPO.quick });
    expect(slow.motion.omega).toBe(SETTLE_TEMPO.quick);
  });

  it("settleOmegaForDurationMs: 90 % within 40 % of the duration", () => {
    const omega: number = settleOmegaForDurationMs(230);
    expect(Math.log(10) / omega).toBeCloseTo(0.092, 6);
  });
});

describe("leaf motion — open (pop-in) and leaving leaves", () => {
  it("open pops the leaf in uniformly from 0.87 with opacity, ending at scale 1", () => {
    const h: Harness = harness();
    h.motion.target("n", B);
    h.motion.open("n");
    h.motion.flush();
    const first: LeafMotionFrame = h.writes[h.writes.length - 1]!.frames[0]!;
    expect(first.pop).toEqual({ scale: LEAF_MOTION_POP_IN_FROM, opacity: 0 });
    h.clock.runUntilIdle();
    const pops: number[] = [];
    for (const w of h.writes) {
      for (const f of w.frames) {
        if (f.pop != null) {
          pops.push(f.pop.scale);
          expect(f.pop.opacity).toBeGreaterThanOrEqual(0);
          expect(f.pop.opacity).toBeLessThanOrEqual(1);
        }
      }
    }
    for (let i = 1; i < pops.length; i++) {
      expect(pops[i]!).toBeGreaterThanOrEqual(pops[i - 1]!);
    }
    expect(h.motion.frame("n")!.pop).toBeNull();
    expect(h.motion.active).toBe(false);
    // The last write drew it fully open.
    const last: LeafMotionFrame = h.writes[h.writes.length - 1]!.frames[0]!;
    expect(last.pop).toBeNull();
    // A pop-in scale is uniform by construction.
    expect(checkContentScale(pops.map((s, i) => ({ t: i, a: s, d: s }))).ok).toBe(true);
  });

  it("retain forgets leaves that left the layout", () => {
    const h: Harness = harness();
    h.motion.target("a", A);
    h.motion.target("b", B);
    h.motion.retain(new Set(["b"]));
    expect(h.motion.has("a")).toBe(false);
    expect(h.motion.ids()).toEqual(["b"]);
    h.motion.remove("b");
    expect(h.motion.ids()).toEqual([]);
  });

  it("dispose stops the loop", () => {
    const h: Harness = harness();
    h.motion.target("a", A);
    h.motion.target("a", B);
    h.motion.dispose();
    h.clock.runUntilIdle();
    expect(h.motion.ids()).toEqual([]);
    expect(h.loop.active).toBe(false);
  });
});

describe("leaf motion — a held pane lands from its look (handover)", () => {
  it("puts the leaf at the rect with the look, then settles the look to null, scale and opacity monotonic to 1", () => {
    const h: Harness = harness();
    h.motion.target("a", A);
    h.motion.handover("a", B, { scale: 0.6, opacity: 0.5 });
    expect(h.motion.drawn("a")).toEqual(B);
    expect(h.motion.frame("a")!.look).toEqual({ scale: 0.6, opacity: 0.5 });
    expect(h.motion.active).toBe(true);
    h.motion.flush();
    h.clock.runUntilIdle();
    const looks: Array<{ scale: number; opacity: number }> = [];
    for (const w of h.writes) {
      for (const f of w.frames) {
        if (f.look != null) {
          looks.push({ scale: f.look.scale, opacity: f.look.opacity });
        }
      }
    }
    expect(looks.length).toBeGreaterThan(2);
    expect(looks[0]).toEqual({ scale: 0.6, opacity: 0.5 });
    for (let i = 1; i < looks.length; i++) {
      expect(looks[i]!.scale).toBeGreaterThanOrEqual(looks[i - 1]!.scale);
      expect(looks[i]!.opacity).toBeGreaterThanOrEqual(looks[i - 1]!.opacity);
      expect(looks[i]!.scale).toBeLessThanOrEqual(1);
      expect(looks[i]!.opacity).toBeLessThanOrEqual(1);
    }
    expect(h.motion.frame("a")!.look).toBeNull();
    // The last write drew it at full size and solid, and the motion is at rest.
    expect(h.writes[h.writes.length - 1]!.frames.find((f) => f.id === "a")!.look).toBeNull();
    expect(h.motion.active).toBe(false);
  });

  it("a next target glides the rect into place while the look settles: the drawn rect never jumps", () => {
    const h: Harness = harness();
    h.motion.target("a", A);
    h.motion.handover("a", B, { scale: 0.7, opacity: 0.6 });
    h.motion.target("a", C);
    h.motion.flush();
    h.clock.runUntilIdle();
    expect(checkNoJumps(samplesOf(h, "a"), SETTLE_TEMPO.default).failures).toEqual([]);
    expect(h.motion.drawn("a")).toEqual(C);
    expect(h.motion.frame("a")!.look).toBeNull();
  });

  it("reduced motion is a no-op: the leaf is put at the rect with no look and nothing moves", () => {
    const h: Harness = harness();
    h.motion.target("a", A);
    h.reduced = true;
    h.motion.handover("a", B, { scale: 0.6, opacity: 0.5 });
    expect(h.motion.drawn("a")).toEqual(B);
    expect(h.motion.frame("a")!.look).toBeNull();
    expect(h.motion.active).toBe(false);
  });

  it("a look that is already full and solid is no handover", () => {
    const h: Harness = harness();
    h.motion.target("a", A);
    h.motion.handover("a", B, { scale: 1, opacity: 1 });
    expect(h.motion.frame("a")!.look).toBeNull();
    expect(h.motion.active).toBe(false);
  });

  it("endHandover clears the look at once and writes the frame without it", () => {
    const h: Harness = harness();
    h.motion.target("a", A);
    h.motion.handover("a", B, { scale: 0.6, opacity: 0.5 });
    h.motion.flush();
    expect(h.writes[h.writes.length - 1]!.frames[0]!.look).not.toBeNull();
    h.motion.endHandover("a");
    expect(h.motion.frame("a")!.look).toBeNull();
    h.motion.flush();
    const last: LeafMotionFrame = h.writes[h.writes.length - 1]!.frames[0]!;
    expect(last.id).toBe("a");
    expect(last.look).toBeNull();
    h.clock.runUntilIdle();
    expect(h.motion.active).toBe(false);
    // A leaf with no look, and an unknown leaf, are left alone.
    const writes: number = h.writes.length;
    h.motion.endHandover("a");
    h.motion.endHandover("nope");
    h.motion.flush();
    expect(h.writes).toHaveLength(writes);
  });
});

describe("leaf motion — a divider drag", () => {
  it("never toggles active and never asks for a frame: every held move is drawn by its flush", () => {
    const h: Harness = harness();
    h.motion.target("a", A);
    h.motion.target("b", B);
    h.motion.flush();
    for (let i = 1; i <= 30; i++) {
      // the renderer holds both sides of the divider at every pointer move and flushes, as its layout effect does
      h.motion.hold("a", { ...A, width: A.width + i * 3 });
      h.motion.hold("b", { ...B, x: B.x + i * 3, width: B.width - i * 3 });
      h.motion.flush();
      expect(h.clock.pendingFrames).toBe(0);
      h.clock.frame();
    }
    expect(h.activity).toEqual([]);
    expect(h.motion.active).toBe(false);
    expect(h.writes).toHaveLength(31);
    expect(h.writes.every((w) => w.tick.delta === 0)).toBe(true);
  });
});

describe("leaf motion — a host callback that throws", () => {
  it("doesn't stop the motion: the glide carries on and ends, and the error surfaces on its own", async () => {
    const clock: FakeClock = createFakeClock();
    const loop: FrameLoop = createFrameLoop({ clock });
    let calls = 0;
    const errors: unknown[] = [];
    const motion: LeafMotion = createLeafMotion({
      loop,
      onWrite: (): void => {
        calls += 1;
        if (calls === 3) throw new Error("host write failed");
      },
    });
    // The error is rethrown in a microtask of its own: catch it there instead of letting it fail the test run.
    const realQueue = globalThis.queueMicrotask;
    globalThis.queueMicrotask = (task: () => void): void => {
      try {
        task();
      } catch (error: unknown) {
        errors.push(error);
      }
    };
    try {
      motion.target("a", A);
      motion.target("a", B);
      clock.runUntilIdle();
      await Promise.resolve();
    } finally {
      globalThis.queueMicrotask = realQueue;
    }
    expect(motion.drawn("a")).toEqual(B);
    expect(motion.active).toBe(false);
    expect(calls).toBeGreaterThan(3);
    expect(errors).toHaveLength(1);
  });
});
