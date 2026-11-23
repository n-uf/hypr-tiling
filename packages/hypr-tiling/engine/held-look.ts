import { createSettle, type FrameInfo, type FrameLoop, type Settle } from "@n-uf/motion";
import type { TilingHeldOverTarget } from "./types";

/**
 * The held pane's look over a drop target, DOM-free: which look a pane gets
 * (`"auto"` and the per-tile override resolved), what the look draws at a
 * given amount of change, and the motion of that amount.
 *
 * The look is one number, `amount`: 0 is the full pane (home, a refused place,
 * free space), 1 is the look over a target. Every look is a straight
 * interpolation in it, and each keeps the grab point on the pointer at every
 * amount: the title bar folds the pane's height under a fixed top edge with
 * the grab point's height moving only when it sat below what is kept, a
 * thumbnail scales about the grab point itself, a fade changes nothing in
 * geometry. The amount moves on `@n-uf/motion`'s settle (the curve every pane
 * motion uses), on the leaf motion's frame loop, and snaps under reduced
 * motion.
 */

/** A resolved look: `"auto"` is gone. */
export type HeldLook = Exclude<TilingHeldOverTarget, "auto">;

/** The thumbnail look's scale (of the lift size). */
export const HELD_THUMBNAIL_SCALE: number = 0.4;

/** The fade look's opacity. */
export const HELD_FADE_OPACITY: number = 0.45;

/**
 * The look a held pane gets over a target. The tile's own choice beats the
 * renderer's when it is set (`"auto"` included); with neither set it is
 * `"auto"`. `"auto"` is `"title-bar"` for a pane that draws a title bar, else
 * `"thumbnail"`; `"title-bar"` on a pane with no title bar is a thumbnail too
 * (it has nothing to fold to).
 */
export function resolveHeldLook(params: {
  readonly renderer: TilingHeldOverTarget | undefined;
  readonly tile: TilingHeldOverTarget | undefined;
  readonly hasTitleBar: boolean;
}): HeldLook {
  const choice: TilingHeldOverTarget = params.tile ?? params.renderer ?? "auto";
  if (choice === "auto" || choice === "title-bar") {
    return params.hasTitleBar ? "title-bar" : "thumbnail";
  }
  return choice;
}

/** A rect (any px space, both rects in the same one). */
export interface HeldLookRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The one source of "this pane draws a title bar": the element the drag was
 * picked up by (the drag handle), measured at the press against what is held
 * (the pane, or a group's frame). It is the title bar when it is a strip along
 * the top of what is held: it starts at or below its top edge, ends above its
 * middle and is less than half its height. Returns where the title bar ends,
 * px from the held frame's top, or `null` (no title bar: the handle is the
 * whole pane, sits lower, or is outside it, like a tab torn off a group).
 */
export function measureHeldTitleBar(frame: HeldLookRect, handle: HeldLookRect): number | null {
  if (frame.height <= 0 || handle.height <= 0 || handle.width <= 0) {
    return null;
  }
  const top: number = handle.y - frame.y;
  const bottom: number = top + handle.height;
  // Half a pixel of slack for sub-pixel layout at the frame's top edge.
  if (top < -0.5 || bottom <= 0) {
    return null;
  }
  if (handle.height >= frame.height / 2 || bottom > frame.height / 2) {
    return null;
  }
  return bottom;
}

/** What is held, in the held frame's own px: its size, where the pane sits in it, the grab point, the title bar. */
export interface HeldLookGeometry {
  /** The held frame at its lift size: the pane, or a group's frame (strip and pane). */
  readonly frame: { readonly width: number; readonly height: number };
  /** The pane's top inside the frame (a group's strip above it), px. */
  readonly leafTop: number;
  /** The pane's height at its lift size, px. */
  readonly leafHeight: number;
  /** The grab point: the pointer's offset from the frame's top-left corner, px. */
  readonly grab: { readonly x: number; readonly y: number };
  /** Where the title bar ends, px from the frame's top ({@link measureHeldTitleBar}), or `null`. */
  readonly titleBottom: number | null;
}

/** What a look draws at an amount: the held frame's height and grab height, the pane's height, a scale and an opacity. */
export interface HeldLookFrame {
  /** The held frame's drawn height (its width never changes), px. */
  readonly height: number;
  /** The grab point's height in the drawn frame: the frame is drawn at `pointer.y - anchorY`. */
  readonly anchorY: number;
  /** The pane's drawn height in it, px. */
  readonly leafHeight: number;
  /** Uniform scale about the grab point (1: none). */
  readonly scale: number;
  /** Opacity (1: solid). */
  readonly opacity: number;
}

/** From `from` to `to` by `amount`, exactly `to` at 1. */
const lerp = (from: number, to: number, amount: number): number =>
  amount >= 1 ? to : from + (to - from) * amount;

/** The full pane: what every look draws at amount 0. */
export function fullHeldLookFrame(geometry: HeldLookGeometry): HeldLookFrame {
  return {
    height: geometry.frame.height,
    anchorY: geometry.grab.y,
    leafHeight: geometry.leafHeight,
    scale: 1,
    opacity: 1,
  };
}

/**
 * What `look` draws at `amount` (0 the full pane, 1 the look over a target;
 * clamped into 0..1).
 *
 * - `"title-bar"`: the frame keeps its top edge and its width and loses the
 *   pane's height below the title bar (a group's strip below the pane is
 *   kept); the grab point keeps its height when it is on what is kept (a
 *   press on the title bar always is), rides up with a strip below the pane,
 *   and otherwise ends on the title bar's bottom edge.
 * - `"thumbnail"`: scale from 1 to {@link HELD_THUMBNAIL_SCALE} about the grab point.
 * - `"fade"`: opacity from 1 to {@link HELD_FADE_OPACITY}.
 * - `"none"`: the full pane.
 */
export function heldLookFrame(look: HeldLook, amount: number, geometry: HeldLookGeometry): HeldLookFrame {
  const full: HeldLookFrame = fullHeldLookFrame(geometry);
  const k: number = Math.min(1, Math.max(0, amount));
  if (k === 0 || look === "none") {
    return full;
  }
  if (look === "thumbnail") {
    return { ...full, scale: lerp(1, HELD_THUMBNAIL_SCALE, k) };
  }
  if (look === "fade") {
    return { ...full, opacity: lerp(1, HELD_FADE_OPACITY, k) };
  }
  const titleBottom: number | null = geometry.titleBottom;
  if (titleBottom == null) {
    return full;
  }
  const kept: number = Math.min(geometry.leafHeight, Math.max(0, titleBottom - geometry.leafTop));
  const loss: number = geometry.leafHeight - kept;
  const leafBottom: number = geometry.leafTop + geometry.leafHeight;
  const grabY: number = geometry.grab.y;
  const foldedAnchorY: number =
    grabY <= titleBottom ? grabY : grabY >= leafBottom ? grabY - loss : titleBottom;
  return {
    ...full,
    height: geometry.frame.height - loss * k,
    anchorY: lerp(grabY, foldedAnchorY, k),
    leafHeight: geometry.leafHeight - loss * k,
  };
}

/** Options of {@link createHeldLookMotion}. */
export interface HeldLookMotionOptions {
  /** The frame loop it steps on (the leaf motion's). */
  readonly loop: FrameLoop;
  /** The tempo in 1/s (the leaf motion's). */
  readonly omega: number;
  /** Read on every change: when true, the amount snaps. */
  readonly reducedMotion: () => boolean;
  /** Called with the new amount after every change of it (a step, a snap). */
  readonly onChange: (amount: number) => void;
}

/** The amount of a held pane's look, moving between 0 (full) and 1 (over a target). */
export interface HeldLookMotion {
  /** The amount now, 0..1. */
  readonly amount: number;
  /** Whether it is moving. */
  readonly moving: boolean;
  /** Head for the look over a target (`true`) or the full pane (`false`), from where it is now. */
  to(overTarget: boolean): void;
  /** Be at the full pane (`false`) or the look (`true`) now, at rest (a new lift). */
  jumpTo(overTarget: boolean): void;
  /** Change the tempo; a move in flight carries on at the new tempo. */
  configure(options: { readonly omega: number }): void;
  /** Stop stepping. */
  dispose(): void;
}

/** Arrived within this much of the amount (about half a pixel of a 1000 px pane). */
const HELD_LOOK_REST_DELTA: number = 0.0005;

/** The amount of the held look on `options.loop`, settling toward 0 or 1. */
export function createHeldLookMotion(options: HeldLookMotionOptions): HeldLookMotion {
  const settle: Settle<number> = createSettle<number>(0, {
    omega: options.omega,
    restDelta: HELD_LOOK_REST_DELTA,
  });
  let stop: (() => void) | null = null;
  let disposed: boolean = false;

  const halt = (): void => {
    stop?.();
    stop = null;
  };

  const notify = (): void => {
    options.onChange(settle.value);
  };

  return {
    get amount(): number {
      return settle.value;
    },
    get moving(): boolean {
      return stop != null;
    },
    to(overTarget: boolean): void {
      if (disposed) {
        return;
      }
      const goal: number = overTarget ? 1 : 0;
      if (options.reducedMotion()) {
        halt();
        if (settle.value !== goal || settle.target !== goal) {
          settle.jumpTo(goal);
          notify();
        }
        return;
      }
      if (settle.target === goal && (stop != null || settle.value === goal)) {
        return;
      }
      settle.setTarget(goal);
      if (stop == null) {
        // Before the leaf motion steps and draws (`layout`), so the pane is
        // drawn at the new amount in the same frame.
        stop = options.loop.repeat("update", (frame: FrameInfo): boolean => {
          const moving: boolean = settle.step(frame.delta);
          if (!moving) {
            settle.snap();
            stop = null;
          }
          notify();
          return moving;
        });
      }
    },
    jumpTo(overTarget: boolean): void {
      if (disposed) {
        return;
      }
      halt();
      settle.jumpTo(overTarget ? 1 : 0);
    },
    configure(next: { readonly omega: number }): void {
      settle.configure({ omega: next.omega, restDelta: HELD_LOOK_REST_DELTA });
    },
    dispose(): void {
      disposed = true;
      halt();
    },
  };
}
