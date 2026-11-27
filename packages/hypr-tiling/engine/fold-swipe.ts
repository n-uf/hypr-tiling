import type { TilingFoldEdge } from "./fold-plan";
import type { ScrollChainAxis, ScrollChainDirection } from "./wheel-touch-port";

/**
 * Swipe to flip a fold: the pure rules (DOM-free). The renderer marks each
 * fold's open side with the way it can turn ({@link foldFlipToken}); a
 * horizontal swipe over it follows the finger and, released far or fast
 * enough ({@link resolveFoldSwipeRelease}), opens the fold's spine. The DOM
 * scroll chain reads the same mark as "can still scroll that way", so the
 * workspace swipe only takes a swipe past the last fold.
 */

/** The data attribute on a fold's open side naming the way it can turn (see {@link foldFlipToken}). */
export const FOLD_FLIP_ATTRIBUTE: string = "data-hpt-fold-flip";
/** The data attribute on a fold's open side naming its split (read back when a swipe turns it). */
export const FOLD_SPLIT_ATTRIBUTE: string = "data-hpt-fold-split";

/**
 * The way a fold with its spine on `edge` turns, in scroll-chain terms: the axis and the scroll direction a swipe
 * toward the spine's content has (a finger moving left reveals what is on the right: `x+`).
 */
export function foldFlipToken(edge: TilingFoldEdge): string {
  switch (edge) {
    case "right":
      return "x+";
    case "left":
      return "x-";
    case "bottom":
      return "y+";
    default:
      return "y-";
  }
}

/** The token a swipe along `axis` in scroll `direction` turns. */
export function scrollChainFlipToken(axis: ScrollChainAxis, direction: ScrollChainDirection): string {
  return `${axis}${direction === 1 ? "+" : "-"}`;
}

/** How far (px) the finger moves before a swipe picks its axis. */
export const FOLD_SWIPE_SLOP_PX: number = 10;
/** A swipe turns the fold when released past this share of the open side's extent… */
export const FOLD_SWIPE_FLIP_FRACTION: number = 0.25;
/** …or faster than this (px/ms) toward the spine, past {@link FOLD_SWIPE_MIN_FLING_PX}. */
export const FOLD_SWIPE_FLING_PX_PER_MS: number = 0.35;
export const FOLD_SWIPE_MIN_FLING_PX: number = 24;
/** The open side follows the finger at this share of its travel, up to {@link FOLD_SWIPE_MAX_FOLLOW_FRACTION} of its extent. */
export const FOLD_SWIPE_FOLLOW: number = 0.6;
export const FOLD_SWIPE_MAX_FOLLOW_FRACTION: number = 0.4;

/**
 * The axis a touch picks once it has moved past the slop: `"x"` when mostly sideways (`|dx| > 2·|dy|`, as the
 * workspace swipe arms), `"y"` when mostly vertical, `null` while still inside the slop.
 */
export function resolveFoldSwipeAxis(dx: number, dy: number, slopPx: number = FOLD_SWIPE_SLOP_PX): ScrollChainAxis | null {
  if (Math.hypot(dx, dy) < slopPx) return null;
  return Math.abs(dx) > 2 * Math.abs(dy) ? "x" : "y";
}

/**
 * Where the open side is drawn while the finger has moved `travelPx` along the swipe's axis, for a fold that turns
 * in scroll `direction`: it follows toward the spine only (a finger moving back past where it started leaves it in
 * place), at {@link FOLD_SWIPE_FOLLOW} of the travel, up to {@link FOLD_SWIPE_MAX_FOLLOW_FRACTION} of its extent.
 */
export function foldSwipeFollowPx(travelPx: number, extentPx: number, direction: ScrollChainDirection): number {
  const limit: number = Math.max(0, extentPx) * FOLD_SWIPE_MAX_FOLLOW_FRACTION;
  const toward: number = Math.max(0, Math.min(limit, -direction * travelPx * FOLD_SWIPE_FOLLOW));
  return toward === 0 ? 0 : -direction * toward;
}

/** A finger resting longer than this (ms) before it lifts is not a fling. */
export const FOLD_SWIPE_FLING_IDLE_MS: number = 100;

/**
 * Whether a released swipe turns the fold: it moved toward the spine (`travelPx` with the sign of the flip's
 * direction: negative for `x+`, a finger moving left) by more than {@link FOLD_SWIPE_FLIP_FRACTION} of the open
 * side's extent, or flung that way faster than {@link FOLD_SWIPE_FLING_PX_PER_MS} past
 * {@link FOLD_SWIPE_MIN_FLING_PX}. A swipe back the other way never turns it.
 */
export function resolveFoldSwipeRelease(params: {
  /** The finger's travel along the axis since the touch began (px; negative = left / up) */
  travelPx: number;
  /** The finger's speed along the axis at release (px/ms; negative = left / up) */
  velocityPxPerMs: number;
  /** The scroll direction the fold turns: 1 when its spine is right / below (a finger moving left / up) */
  direction: ScrollChainDirection;
  /** The open side's extent along the axis (px) */
  extentPx: number;
}): boolean {
  const toward: number = -params.direction * params.travelPx;
  if (!(toward > 0)) return false;
  if (toward > Math.max(0, params.extentPx) * FOLD_SWIPE_FLIP_FRACTION) return true;
  const speedToward: number = -params.direction * params.velocityPxPerMs;
  return toward > FOLD_SWIPE_MIN_FLING_PX && speedToward > FOLD_SWIPE_FLING_PX_PER_MS;
}
