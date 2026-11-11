import {
  SETTLE_TEMPO,
  createSettle,
  popIn,
  reveal,
  type FrameInfo,
  type FrameLoop,
  type PopIn,
  type Rect,
  type RevealFrame,
  type Settle,
} from "@n-uf/motion";

/**
 * Leaf motion: how every pane moves between layouts, DOM-free.
 *
 * One settle per leaf (keyed by leaf id) from `@n-uf/motion`, on the host's
 * frame loop. The renderer reads each leaf's LAYOUT rect after a commit and
 * hands it over as the leaf's target; the leaf launches toward it from where it
 * is DRAWN (never from a re-measured DOM rect), follows `distance · e^(−ω·t)`
 * and never passes it, so a retarget mid-flight carries on from the drawn rect
 * without a jump, an overshoot or a size wobble.
 *
 * What is written per frame is a {@link LeafMotionFrame}: the drawn rect, the
 * layout rect, and the `reveal` of one into the other (the leaf is moved by
 * `dx, dy`, its frame drawn at the drawn size, its content clipped; content is
 * laid out once at the target size and never scaled). A newly opened leaf also
 * gets a uniform pop-in (scale 0.87 → 1 with opacity). Held leaves (a divider
 * drag, a pointer) sit exactly where they are put.
 *
 * Nothing here touches the DOM: the host passes a frame loop (a browser clock in
 * the app, `createFakeClock()` in tests) and an `onWrite` that draws the frames.
 */

/** Hyprland's `popin 87%`: where an opening leaf's uniform scale starts. */
export const LEAF_MOTION_POP_IN_FROM: number = 0.87;

/** Rest distance of the pop-in progress settle (a 0..1 number, not pixels). */
const POP_IN_REST_DELTA: number = 0.001;

/** One leaf's state for a frame, as the host draws it. */
export interface LeafMotionFrame {
  readonly id: string;
  /** Where the leaf is drawn this frame (container px). */
  readonly drawn: Rect;
  /** Where the leaf is laid out: its target. */
  readonly target: Rect;
  /** How to draw `drawn` with content laid out at `target`. */
  readonly reveal: RevealFrame;
  /** The pop-in of an opening leaf, or `null` once it has fully opened. */
  readonly pop: PopIn | null;
  /** Whether the leaf is still moving (or popping in). */
  readonly moving: boolean;
}

/** What a write sees of the frame it draws. */
export interface LeafMotionTick {
  /** The stepped time in ms: the frame loop's deltas summed since the motion was created. */
  readonly time: number;
  /** The delta this frame was stepped by (0 for a write outside the loop). */
  readonly delta: number;
}

/** Options of {@link createLeafMotion}. */
export interface LeafMotionOptions {
  /** The frame loop the leaves step on (`layout` phase) and are drawn on (`write` phase). */
  readonly loop: FrameLoop;
  /** The tempo in 1/s (default `SETTLE_TEMPO.default`, 90 % in 92 ms). */
  readonly omega?: number;
  /** Read on every new target: when true, leaves snap instead of gliding and open without a pop-in. */
  readonly reducedMotion?: () => boolean;
  /** Draw these leaves (only the ones whose drawn state changed). */
  readonly onWrite: (frames: ReadonlyArray<LeafMotionFrame>, tick: LeafMotionTick) => void;
  /** Called when the motion starts (a leaf begins to move) and when every leaf has come to rest. */
  readonly onActiveChange?: (active: boolean) => void;
}

/** The leaf motion surface the renderer drives. */
export interface LeafMotion {
  /** The tempo in 1/s. */
  readonly omega: number;
  /** Whether any leaf is moving or popping in. */
  readonly active: boolean;
  /** The stepped time in ms (the loop's deltas summed). */
  readonly time: number;
  /**
   * The leaf's new layout rect. A known leaf glides there from where it is
   * drawn; an unknown leaf appears there at once. Under reduced motion it snaps.
   */
  target(id: string, rect: Rect): void;
  /** Put the leaf exactly at `rect`, at rest (first mount, a snap). */
  jump(id: string, rect: Rect): void;
  /** Hold the leaf 1:1 at `rect` (a divider or a pointer owns it); the next `target` launches from there. */
  hold(id: string, rect: Rect): void;
  /** Pop the leaf in (uniform scale + opacity from {@link LEAF_MOTION_POP_IN_FROM}); a no-op under reduced motion. */
  open(id: string): void;
  /** Forget a leaf (it left the layout). */
  remove(id: string): void;
  /** Forget every leaf not in `ids`. */
  retain(ids: ReadonlySet<string>): void;
  /** Whether the leaf is known. */
  has(id: string): boolean;
  /** Where the leaf is drawn now, or `null` for an unknown leaf. */
  drawn(id: string): Rect | null;
  /** The leaf's current frame, or `null` for an unknown leaf. */
  frame(id: string): LeafMotionFrame | null;
  /** Every known leaf id. */
  ids(): ReadonlyArray<string>;
  /** Change the tempo; leaves in flight carry on at the new tempo. */
  configure(options: { readonly omega?: number }): void;
  /**
   * Draw every leaf whose target or hold changed since the last write, now
   * (outside the loop). The renderer calls it at the end of its layout effect so
   * the frame painted right after a commit already shows the leaves where they
   * are drawn, not at their new layout (no one-frame snap).
   */
  flush(): void;
  /** Stop stepping and forget every leaf. */
  dispose(): void;
}

interface LeafEntry {
  readonly settle: Settle<Rect>;
  goal: Rect;
  pop: Settle<number> | null;
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function copyRect(rect: Rect): Rect {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

/** Create the leaf motion on `options.loop`. */
export function createLeafMotion(options: LeafMotionOptions): LeafMotion {
  const { loop, onWrite, onActiveChange } = options;
  const reducedMotion: () => boolean = options.reducedMotion ?? ((): boolean => false);
  let omega: number = options.omega ?? SETTLE_TEMPO.default;
  const leaves: Map<string, LeafEntry> = new Map<string, LeafEntry>();
  const dirty: Set<string> = new Set<string>();
  let time: number = 0;
  let stopRepeat: (() => void) | null = null;
  let active: boolean = false;
  let disposed: boolean = false;

  const isMoving = (entry: LeafEntry): boolean => !entry.settle.settled || (entry.pop != null && !entry.pop.settled);

  const frameOf = (id: string, entry: LeafEntry): LeafMotionFrame => {
    const drawn: Rect = copyRect(entry.settle.value as Rect);
    const target: Rect = entry.goal;
    return {
      id,
      drawn,
      target,
      reveal: reveal(drawn, target),
      pop: entry.pop == null ? null : popIn(entry.pop.value as number, LEAF_MOTION_POP_IN_FROM),
      moving: isMoving(entry),
    };
  };

  const setActive = (next: boolean): void => {
    if (next === active) {
      return;
    }
    active = next;
    onActiveChange?.(next);
  };

  const writeDirty = (delta: number): void => {
    if (dirty.size === 0) {
      return;
    }
    const frames: LeafMotionFrame[] = [];
    for (const id of dirty) {
      const entry: LeafEntry | undefined = leaves.get(id);
      if (entry != null) {
        frames.push(frameOf(id, entry));
      }
    }
    dirty.clear();
    if (frames.length > 0) {
      onWrite(frames, { time, delta });
    }
  };

  const writeTask = (frame: FrameInfo): void => {
    writeDirty(frame.delta);
  };

  const stepTask = (frame: FrameInfo): boolean => {
    time += frame.delta;
    let anyMoving: boolean = false;
    for (const [id, entry] of leaves) {
      if (!isMoving(entry)) {
        continue;
      }
      entry.settle.step(frame.delta);
      if (entry.pop != null) {
        entry.pop.step(frame.delta);
        if (entry.pop.settled) {
          entry.pop = null;
        }
      }
      dirty.add(id);
      if (isMoving(entry)) {
        anyMoving = true;
      }
    }
    loop.schedule("write", writeTask);
    if (!anyMoving) {
      stopRepeat = null;
      setActive(false);
      return false;
    }
    return true;
  };

  const ensureRunning = (): void => {
    if (disposed) {
      return;
    }
    let anyMoving: boolean = false;
    for (const entry of leaves.values()) {
      if (isMoving(entry)) {
        anyMoving = true;
        break;
      }
    }
    if (!anyMoving) {
      return;
    }
    setActive(true);
    if (stopRepeat == null) {
      stopRepeat = loop.repeat("layout", stepTask);
    }
  };

  const place = (id: string, rect: Rect): LeafEntry => {
    const existing: LeafEntry | undefined = leaves.get(id);
    if (existing != null) {
      existing.settle.jumpTo(rect);
      existing.goal = copyRect(rect);
      return existing;
    }
    const entry: LeafEntry = {
      settle: createSettle<Rect>(copyRect(rect), { omega }),
      goal: copyRect(rect),
      pop: null,
    };
    leaves.set(id, entry);
    return entry;
  };

  return {
    get omega(): number {
      return omega;
    },
    get active(): boolean {
      return active;
    },
    get time(): number {
      return time;
    },
    target(id: string, rect: Rect): void {
      const entry: LeafEntry | undefined = leaves.get(id);
      if (entry == null) {
        place(id, rect);
        dirty.add(id);
        return;
      }
      if (sameRect(entry.goal, rect)) {
        return;
      }
      entry.goal = copyRect(rect);
      if (reducedMotion()) {
        entry.settle.jumpTo(entry.goal);
        entry.pop = null;
      } else {
        entry.settle.setTarget(entry.goal);
      }
      dirty.add(id);
      ensureRunning();
    },
    jump(id: string, rect: Rect): void {
      const entry: LeafEntry = place(id, rect);
      entry.pop = null;
      dirty.add(id);
    },
    hold(id: string, rect: Rect): void {
      const entry: LeafEntry | undefined = leaves.get(id);
      if (entry != null && entry.settle.settled && sameRect(entry.goal, rect)) {
        return;
      }
      place(id, rect).settle.hold(rect);
      dirty.add(id);
    },
    open(id: string): void {
      const entry: LeafEntry | undefined = leaves.get(id);
      if (entry == null || reducedMotion()) {
        return;
      }
      const pop: Settle<number> = createSettle(0, { omega, restDelta: POP_IN_REST_DELTA });
      pop.setTarget(1);
      entry.pop = pop;
      dirty.add(id);
      ensureRunning();
    },
    remove(id: string): void {
      leaves.delete(id);
      dirty.delete(id);
    },
    retain(ids: ReadonlySet<string>): void {
      for (const id of [...leaves.keys()]) {
        if (!ids.has(id)) {
          leaves.delete(id);
          dirty.delete(id);
        }
      }
    },
    has(id: string): boolean {
      return leaves.has(id);
    },
    drawn(id: string): Rect | null {
      const entry: LeafEntry | undefined = leaves.get(id);
      return entry == null ? null : copyRect(entry.settle.value as Rect);
    },
    frame(id: string): LeafMotionFrame | null {
      const entry: LeafEntry | undefined = leaves.get(id);
      return entry == null ? null : frameOf(id, entry);
    },
    ids(): ReadonlyArray<string> {
      return [...leaves.keys()];
    },
    configure(next: { readonly omega?: number }): void {
      if (next.omega === undefined || next.omega === omega) {
        return;
      }
      omega = next.omega;
      for (const entry of leaves.values()) {
        entry.settle.configure({ omega });
        entry.pop?.configure({ omega });
      }
    },
    flush(): void {
      writeDirty(0);
    },
    dispose(): void {
      disposed = true;
      stopRepeat?.();
      stopRepeat = null;
      leaves.clear();
      dirty.clear();
      active = false;
    },
  };
}

/**
 * The tempo for a reflow duration in ms: the ω whose settle is 90 % of the way
 * in 40 % of `durationMs` (`ln(10) / (0.4 · duration)`), so the move reads as
 * done by the end of the duration. For hosts that think in durations.
 */
export function settleOmegaForDurationMs(durationMs: number): number {
  return Math.log(10) / (0.4 * Math.max(1, durationMs) / 1000);
}
