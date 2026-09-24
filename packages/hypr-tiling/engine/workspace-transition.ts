/**
 * Pure workspace-switch transition helpers (N2).
 *
 * No DOM, no React — the node Jest environment runs this module. The React
 * stage (`react/workspace-transition.tsx`) consumes these to drive a frozen
 * outgoing clone against the live incoming tree. Only the active workspace
 * TREE is mounted (`inactiveWorkspaces: "keep-mounted"` parks panes in the
 * hidden pool, not a second laid-out tree), so the outgoing view is a
 * snapshot, never a live tree.
 */

import { DEFAULT_DRAG_HOP_EASING } from "./drag-easing";

/**
 * How a workspace switch is painted.
 *
 * - `"none"` — instant; no clone, no motion (default, and the reduced-motion
 *   resolution).
 * - `"slide"` — outgoing clone and live incoming tree `translateX` in opposite
 *   directions.
 * - `"fade"` — outgoing clone opacity `1 → 0` over the live incoming tree.
 */
export type TilingWorkspaceTransitionMode = "none" | "slide" | "fade";

/**
 * Tab-order direction of a workspace switch.
 *
 * `"next"` slides the clone toward −100 % (incoming from +100 %);
 * `"prev"` slides the clone toward +100 % (incoming from −100 %).
 */
export type TilingWorkspaceTransitionDirection = "prev" | "next";

/**
 * Duration / easing / default mode for a workspace switch. Matches the
 * planned `interaction.workspaces.switch.transition` capability plus the
 * theme `workspaceTransition` tokens.
 */
export interface TilingWorkspaceTransitionConfig {
  /**
   * Paint mode. Default `"none"` until a host (or the set-mode wrapper
   * follow-up) opts into `"slide"` / `"fade"`.
   */
  readonly mode: TilingWorkspaceTransitionMode;
  /** Timed commit / cancel duration in milliseconds. Default 200. */
  readonly durationMs: number;
  /** CSS `<easing-function>` for the timed curve (theme / host). */
  readonly easing: string;
}

/** Default duration for a timed workspace-switch settle. */
export const DEFAULT_WORKSPACE_TRANSITION_DURATION_MS: number = 200;

/**
 * Default easing — the same snappy decel as {@link DEFAULT_DRAG_HOP_EASING}
 * so workspace switches share the drag-chrome motion language.
 */
export const DEFAULT_WORKSPACE_TRANSITION_EASING: string = DEFAULT_DRAG_HOP_EASING;

/**
 * Default config: no motion until a host opts in
 * (`interaction.workspaces.switch.transition`, follow-up wiring).
 */
export const DEFAULT_WORKSPACE_TRANSITION_CONFIG: TilingWorkspaceTransitionConfig =
  {
    mode: "none",
    durationMs: DEFAULT_WORKSPACE_TRANSITION_DURATION_MS,
    easing: DEFAULT_WORKSPACE_TRANSITION_EASING,
  };

/** Inputs that can override a requested paint mode. */
export interface ResolveTransitionModeFlags {
  /** `prefers-reduced-motion: reduce` is active. */
  readonly reducedMotion: boolean;
  /**
   * Capture marked the clone degraded (tainted canvas `drawImage`, or a
   * canvas over the pixel budget). `"slide"` cannot paint a missing bitmap.
   */
  readonly degraded: boolean;
}

/**
 * Resolve the paint mode a stage should actually run.
 *
 * Reduced motion always wins (`"none"`, instant, no clone). A degraded
 * capture cannot slide, so a requested `"slide"` falls back to `"fade"`.
 * `"none"` and `"fade"` stay as requested when only `degraded` is set.
 */
export function resolveTransitionMode(
  requested: TilingWorkspaceTransitionMode,
  flags: ResolveTransitionModeFlags,
): TilingWorkspaceTransitionMode {
  if (flags.reducedMotion) {
    return "none";
  }
  if (flags.degraded && requested === "slide") {
    return "fade";
  }
  return requested;
}

/** Compositor-friendly transform + opacity pair for one side of the stage. */
export interface TilingWorkspaceTransitionLayerStyle {
  /** `transform` value (`translateX(...)` or `none`). */
  readonly transform: string;
  /** Opacity in `[0, 1]`. */
  readonly opacity: number;
}

/** Outgoing clone + incoming live-tree styles at one progress sample. */
export interface TilingWorkspaceTransitionTransform {
  /** Frozen outgoing clone. */
  readonly outgoing: TilingWorkspaceTransitionLayerStyle;
  /** Live incoming tree. */
  readonly incoming: TilingWorkspaceTransitionLayerStyle;
}

const IDENTITY_LAYER: TilingWorkspaceTransitionLayerStyle = {
  transform: "none",
  opacity: 1,
};

const IDENTITY_TRANSFORM: TilingWorkspaceTransitionTransform = {
  outgoing: IDENTITY_LAYER,
  incoming: IDENTITY_LAYER,
};

/**
 * Clamp a progress sample into unit `[0, 1]`. `NaN` collapses to `0`.
 */
export function clampUnitProgress(progress: number): number {
  if (Number.isNaN(progress)) {
    return 0;
  }
  if (progress < 0) {
    return 0;
  }
  if (progress > 1) {
    return 1;
  }
  return progress;
}

/**
 * Convert N1 swipe progress (`−1..1`) into unit progress (`0..1`) for
 * `direction`. Positive signed progress is `"next"`; negative is `"prev"`.
 * The opposite sign clamps to `0`.
 */
export function unitProgressFromSigned(
  signed: number,
  direction: TilingWorkspaceTransitionDirection,
): number {
  const aligned: number = direction === "next" ? signed : -signed;
  return clampUnitProgress(aligned);
}

/**
 * Sample the timed settle curve at `t` in `[0, 1]`. Ease-out cubic so the
 * JS `requestAnimationFrame` path reads as a snappy decel without parsing
 * a CSS `<easing-function>` string.
 */
export function sampleTransitionEase(t: number): number {
  const unit: number = clampUnitProgress(t);
  const rest: number = 1 - unit;
  return 1 - rest * rest * rest;
}

function translateX(percent: number): string {
  return `translateX(${percent}%)`;
}

/**
 * Transform / opacity for the outgoing clone and the live incoming tree.
 *
 * `progress` is unit (`0` = outgoing fully covering, `1` = incoming fully
 * covering). Slide uses `translateX` only (compositor-friendly). Fade keeps
 * both transforms at `none` and drops outgoing opacity `1 → 0` (incoming
 * stays `1` — the live tree sits underneath). `"none"` is identity on both
 * sides.
 */
export function transitionTransform(
  progress: number,
  direction: TilingWorkspaceTransitionDirection,
  mode: TilingWorkspaceTransitionMode,
): TilingWorkspaceTransitionTransform {
  const unit: number = clampUnitProgress(progress);
  if (mode === "none") {
    return IDENTITY_TRANSFORM;
  }
  if (mode === "fade") {
    return {
      outgoing: { transform: "none", opacity: 1 - unit },
      incoming: { transform: "none", opacity: 1 },
    };
  }
  const outgoingPct: number = direction === "next" ? -unit * 100 : unit * 100;
  const incomingPct: number =
    direction === "next" ? (1 - unit) * 100 : -(1 - unit) * 100;
  return {
    outgoing: { transform: translateX(outgoingPct), opacity: 1 },
    incoming: { transform: translateX(incomingPct), opacity: 1 },
  };
}
