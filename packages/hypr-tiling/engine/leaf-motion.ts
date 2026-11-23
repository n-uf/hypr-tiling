import {
  SETTLE_TEMPO,
  createLayoutMotion,
  createSettle,
  type Settle,
  popIn,
  reveal,
  type DrawFrame,
  type Drawable,
  type FrameInfo,
  type FrameLoop,
  type LayoutItem,
  type LayoutMotion,
  type PopIn,
  type Rect,
  type RevealFrame,
} from "@n-uf/motion";

/**
 * Leaf motion: how every pane moves between layouts, DOM-free.
 *
 * Built on `@n-uf/motion`'s layout motion (`createLayoutMotion`): one item per
 * leaf (keyed by leaf id) on the host's frame loop. The renderer reads each
 * leaf's LAYOUT rect after a commit and hands it over as the leaf's target; the
 * leaf launches toward it from where it is DRAWN (never from a re-measured DOM
 * rect), follows `distance · e^(−ω·t)` and never passes it, so a retarget
 * mid-flight carries on from the drawn rect without a jump, an overshoot or a
 * size wobble.
 *
 * What is written per frame is a {@link LeafMotionFrame}: the drawn rect, the
 * layout rect, and the `reveal` of one into the other (the leaf is moved by
 * `dx, dy`, its frame drawn at the drawn size, its content clipped; content is
 * laid out once at the target size and never scaled). A newly opened leaf also
 * gets a uniform pop-in (scale 0.87 → 1 with opacity). Held leaves (a divider
 * drag, a pointer) sit exactly where they are put.
 *
 * This module keeps what the layout motion leaves to its host: the leaf frame
 * the renderer draws, `active` (true only while a leaf moves or pops in, so a
 * frame that only draws a change never toggles it), and the stepped `time` (the
 * deltas of the frames that moved something). A change made between frames is
 * drawn by {@link LeafMotion.flush}, or on the next frame when the host doesn't
 * flush.
 *
 * Nothing here touches the DOM: the host passes a frame loop (a browser clock in
 * the app, `createFakeClock()` in tests) and an `onWrite` that draws the frames.
 */

/** Hyprland's `popin 87%`: where an opening leaf's uniform scale starts. */
export const LEAF_MOTION_POP_IN_FROM: number = 0.87;

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
  /**
   * A held pane's look it lands from ({@link LeafMotion.handover}), settling
   * to full and solid: a uniform scale about the drawn rect's top-left and an
   * opacity; `null` once it has settled.
   */
  readonly look: LeafMotionLook | null;
  /** Whether the leaf is still moving (or popping in). */
  readonly moving: boolean;
}

/** A look a leaf is drawn with on top of its rect: a uniform scale (about the drawn rect's top-left) and an opacity. */
export interface LeafMotionLook {
  readonly scale: number;
  readonly opacity: number;
}

/** What a write sees of the frame it draws. */
export interface LeafMotionTick {
  /** The stepped time in ms: the deltas of the frames that moved a leaf, summed since the motion was created. */
  readonly time: number;
  /** The delta this frame was stepped by (0 for a write outside the loop). */
  readonly delta: number;
}

/** Options of {@link createLeafMotion}. */
export interface LeafMotionOptions {
  /** The frame loop the leaves step and are drawn on (`layout` phase). */
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
  /** The stepped time in ms (the deltas of the frames that moved a leaf, summed). */
  readonly time: number;
  /**
   * The leaf's new layout rect. A known leaf glides there from where it is
   * drawn; an unknown leaf appears there at once. Under reduced motion it snaps.
   *
   * `layout` is where the leaf's element is laid out when that is not `rect`
   * (a lifted pane, laid out once where it was picked up, settling toward the
   * pointer); default `rect`. The frame is drawn relative to it.
   */
  target(id: string, rect: Rect, layout?: Rect): void;
  /** Put the leaf exactly at `rect`, at rest (first mount, a snap). */
  jump(id: string, rect: Rect): void;
  /**
   * Hold the leaf 1:1 at `rect` (a divider or a pointer owns it); the next
   * `target` launches from there. `layout` as in {@link LeafMotion.target}.
   */
  hold(id: string, rect: Rect, layout?: Rect): void;
  /** Pop the leaf in (uniform scale + opacity from {@link LEAF_MOTION_POP_IN_FROM}); a no-op under reduced motion. */
  open(id: string): void;
  /**
   * A held pane lands from its look: it is put at `rect` (where it was drawn,
   * before the scale) with `look`, and the look settles to full and solid on
   * the leaf's tempo while the next {@link LeafMotion.target} glides the rect
   * into place, so the box it is seen as never jumps. Under reduced motion it
   * is put at `rect` with no look.
   */
  handover(id: string, rect: Rect, look: LeafMotionLook): void;
  /** Drop the leaf's look at once (it is held again: the holder draws the look). */
  endHandover(id: string): void;
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

/** What the layout motion doesn't keep of a leaf: where it is headed or held, and where it is laid out. */
interface LeafState {
  /** Where the leaf is headed (or held). */
  goal: Rect;
  /** Where the element is laid out (the frame's `target`); usually `goal`. */
  layout: Rect;
  /** It was opened and its pop-in hasn't finished. */
  opening: boolean;
  /** The look it lands from, settling to full and solid, or `null`. */
  look: { readonly scale: Settle<number>; readonly opacity: Settle<number> } | null;
}

/** A look's scale and opacity have arrived within this much of full and solid. */
const LOOK_REST_DELTA: number = 0.0005;

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function copyRect(rect: Rect): Rect {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

/** The leaves draw through `onWrite`, in one batch per write: an item's own drawable has nothing to do. */
const WRITTEN_IN_BATCHES: Drawable = { layOut: (): void => {}, draw: (_frame: DrawFrame): void => {} };

/**
 * Run a host callback (`onWrite`, `onActiveChange`) so that a throw never reaches the frame loop: the loop stops a
 * repeating task that throws, which would freeze every leaf. The error is rethrown on its own, outside the frame.
 */
function hostCallback(fn: () => void): void {
  try {
    fn();
  } catch (error: unknown) {
    queueMicrotask((): never => {
      throw error;
    });
  }
}

/** Create the leaf motion on `options.loop`. */
export function createLeafMotion(options: LeafMotionOptions): LeafMotion {
  const { loop, onWrite, onActiveChange } = options;
  const reducedMotion: () => boolean = options.reducedMotion ?? ((): boolean => false);
  let omega: number = options.omega ?? SETTLE_TEMPO.default;
  const leaves: Map<string, LeafState> = new Map<string, LeafState>();
  let time: number = 0;
  /** The delta of the frame being drawn; 0 outside the loop (a flush). */
  let delta: number = 0;
  let active: boolean = false;
  let stopClock: (() => void) | null = null;
  let disposed: boolean = false;

  const popping = (item: LayoutItem, state: LeafState): boolean => state.opening && !item.shownSettled;
  const isMoving = (item: LayoutItem, state: LeafState): boolean =>
    !item.settled || popping(item, state) || state.look != null;
  const anyMoving = (): boolean => {
    for (const [id, state] of leaves) {
      const item: LayoutItem | undefined = layout.get(id);
      if (item != null && isMoving(item, state)) {
        return true;
      }
    }
    return false;
  };

  const setActive = (next: boolean): void => {
    if (next === active) {
      return;
    }
    active = next;
    hostCallback(() => onActiveChange?.(next));
  };

  const frameOf = (id: string, item: LayoutItem, state: LeafState, frame?: DrawFrame): LeafMotionFrame => {
    const drawn: Rect = copyRect(frame?.drawn ?? item.drawn);
    const pop: PopIn | null = popping(item, state) ? popIn(frame?.shown ?? item.shown, LEAF_MOTION_POP_IN_FROM) : null;
    if (state.opening && item.shownSettled) {
      state.opening = false;
    }
    const look: LeafMotionLook | null =
      state.look == null ? null : { scale: state.look.scale.value, opacity: state.look.opacity.value };
    return { id, drawn, target: state.layout, reveal: reveal(drawn, state.layout), pop, look, moving: isMoving(item, state) };
  };

  /** Nothing moves any more: the leaves are at rest before the frame that brought them there is written. */
  const settleIfIdle = (): void => {
    if (active && !anyMoving()) {
      setActive(false);
      stopClock?.();
      stopClock = null;
    }
  };

  /**
   * The leaves to write: changed since the last write (in change order), then, on a frame, every leaf that moved on
   * it. The layout motion draws unbatched (each item's own drawable, which does nothing here), so a change between
   * frames never asks for a frame of its own: it is written by `flush`, or with the next frame that moves a leaf.
   */
  const dirty: Set<string> = new Set<string>();

  const writeDirty = (): void => {
    if (dirty.size === 0) {
      return;
    }
    const frames: LeafMotionFrame[] = [];
    for (const id of dirty) {
      const item: LayoutItem | undefined = layout.get(id);
      const state: LeafState | undefined = leaves.get(id);
      if (item != null && state != null) {
        frames.push(frameOf(id, item, state));
      }
    }
    dirty.clear();
    if (frames.length > 0) {
      hostCallback(() => onWrite(frames, { time, delta }));
    }
  };

  const layout: LayoutMotion = createLayoutMotion({ loop, omega, reducedMotion, popFrom: LEAF_MOTION_POP_IN_FROM });
  // After a frame's leaves have stepped: rest first (nothing moves any more), then write what changed and moved.
  layout.onFrame((): void => {
    if (stopClock == null) {
      return;
    }
    settleIfIdle();
    writeDirty();
    delta = 0;
  });

  /** Start counting time and mark the motion active once a leaf moves. */
  const ensureRunning = (): void => {
    if (disposed || !anyMoving()) {
      return;
    }
    setActive(true);
    if (stopClock == null) {
      // Runs before the leaves step: the frame's delta, and every leaf moving into it is written after it.
      stopClock = layout.task((frame: FrameInfo): boolean => {
        time += frame.delta;
        delta = frame.delta;
        // A look still settling keeps the frames coming once the rects rest.
        let looking: boolean = false;
        for (const [id, state] of leaves) {
          const item: LayoutItem | undefined = layout.get(id);
          if (item != null && isMoving(item, state)) {
            dirty.add(id);
          }
          // A look a pane lands from settles on the same frames.
          if (state.look != null) {
            const scaling: boolean = state.look.scale.step(frame.delta);
            const fading: boolean = state.look.opacity.step(frame.delta);
            if (!scaling && !fading) {
              state.look = null;
            } else {
              looking = true;
            }
          }
        }
        return looking;
      });
    }
  };

  const itemFor = (id: string, rect: Rect): { item: LayoutItem; state: LeafState } => {
    const known: LayoutItem | undefined = layout.get(id);
    const state: LeafState | undefined = leaves.get(id);
    if (known != null && state != null) {
      return { item: known, state };
    }
    const goal: Rect = copyRect(rect);
    const fresh: LeafState = { goal, layout: goal, opening: false, look: null };
    leaves.set(id, fresh);
    return { item: layout.add(id, WRITTEN_IN_BATCHES, rect), state: fresh };
  };

  /** Put the leaf at `rect` at rest, laid out at `at` (default `rect`). */
  const place = (id: string, rect: Rect, at?: Rect): LeafState => {
    const { item, state } = itemFor(id, rect);
    state.goal = copyRect(rect);
    state.layout = at != null ? copyRect(at) : state.goal;
    state.look = null;
    item.jumpTo(state.layout);
    if (at != null) {
      item.hold(rect);
    }
    dirty.add(id);
    return state;
  };

  /** Head for `rect`, laid out at `at`: from where it is drawn, keeping its speed. */
  const aim = (item: LayoutItem, rect: Rect, at: Rect): void => {
    item.moveTo(at);
    // `createLayoutMotion`'s items always have `retarget` (optional only in the item type).
    if (!sameRect(at, rect) && item.retarget != null) {
      item.retarget(rect);
    }
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
    target(id: string, rect: Rect, at?: Rect): void {
      if (disposed) {
        return;
      }
      const state: LeafState | undefined = leaves.get(id);
      const item: LayoutItem | undefined = layout.get(id);
      if (state == null || item == null) {
        place(id, rect, at);
        return;
      }
      const nextLayout: Rect = at ?? rect;
      const layoutChanged: boolean = !sameRect(state.layout, nextLayout);
      if (sameRect(state.goal, rect)) {
        if (layoutChanged) {
          state.layout = copyRect(nextLayout);
          aim(item, rect, state.layout);
          dirty.add(id);
        }
        return;
      }
      state.goal = copyRect(rect);
      state.layout = at != null ? copyRect(at) : state.goal;
      if (reducedMotion()) {
        state.opening = false;
        item.show(true, { now: true });
      }
      aim(item, state.goal, state.layout);
      dirty.add(id);
      ensureRunning();
    },
    jump(id: string, rect: Rect): void {
      if (disposed) {
        return;
      }
      const state: LeafState = place(id, rect);
      if (state.opening) {
        state.opening = false;
        layout.get(id)?.show(true, { now: true });
      }
    },
    hold(id: string, rect: Rect, at?: Rect): void {
      if (disposed) {
        return;
      }
      const state: LeafState | undefined = leaves.get(id);
      const item: LayoutItem | undefined = layout.get(id);
      const nextLayout: Rect = at ?? rect;
      if (state != null && item != null && item.settled && sameRect(state.goal, rect) && sameRect(state.layout, nextLayout)) {
        return;
      }
      place(id, rect, at);
    },
    open(id: string): void {
      if (disposed) {
        return;
      }
      const item: LayoutItem | undefined = layout.get(id);
      const state: LeafState | undefined = leaves.get(id);
      if (item == null || state == null || reducedMotion()) {
        return;
      }
      state.opening = true;
      item.show(false, { now: true });
      item.show(true);
      dirty.add(id);
      ensureRunning();
    },
    handover(id: string, rect: Rect, look: LeafMotionLook): void {
      if (disposed) {
        return;
      }
      const state: LeafState = place(id, rect);
      if (reducedMotion() || (look.scale === 1 && look.opacity === 1)) {
        return;
      }
      const scale: Settle<number> = createSettle<number>(look.scale, { omega, restDelta: LOOK_REST_DELTA });
      const opacity: Settle<number> = createSettle<number>(look.opacity, { omega, restDelta: LOOK_REST_DELTA });
      scale.setTarget(1);
      opacity.setTarget(1);
      state.look = { scale, opacity };
      ensureRunning();
      layout.wake();
    },
    endHandover(id: string): void {
      const state: LeafState | undefined = leaves.get(id);
      if (state != null && state.look != null) {
        state.look = null;
        dirty.add(id);
      }
    },
    remove(id: string): void {
      leaves.delete(id);
      dirty.delete(id);
      layout.remove(id);
    },
    retain(ids: ReadonlySet<string>): void {
      for (const id of [...leaves.keys()]) {
        if (!ids.has(id)) {
          leaves.delete(id);
          dirty.delete(id);
        }
      }
      layout.retain(ids);
    },
    has(id: string): boolean {
      return leaves.has(id);
    },
    drawn(id: string): Rect | null {
      const item: LayoutItem | undefined = layout.get(id);
      return item == null ? null : copyRect(item.drawn);
    },
    frame(id: string): LeafMotionFrame | null {
      const item: LayoutItem | undefined = layout.get(id);
      const state: LeafState | undefined = leaves.get(id);
      return item == null || state == null ? null : frameOf(id, item, state);
    },
    ids(): ReadonlyArray<string> {
      return [...leaves.keys()];
    },
    configure(next: { readonly omega?: number }): void {
      if (next.omega === undefined || next.omega === omega) {
        return;
      }
      omega = next.omega;
      layout.configure({ omega });
    },
    flush(): void {
      writeDirty();
    },
    dispose(): void {
      disposed = true;
      stopClock?.();
      stopClock = null;
      layout.dispose();
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
