import type { TilingCommand } from "./types";

/**
 * Workspace swipe navigation — the pure gesture FSM behind trackpad / touch
 * swiping between workspaces in set mode (`_agent/workspace-navigation-plan.md`
 * N1). Modelled on `engine/drag-machine.ts`: a reducer over a discriminated
 * state union, no timers, no DOM, no side effects. The host (the set-mode
 * wrapper through `react/use-workspace-swipe.ts`) feeds it wheel / touch
 * samples that the input ports have already annotated with the facts only the
 * DOM knows (`canScrollFurther`, the viewport width), runs the wheel-idle timer,
 * and dispatches the single `cycle-workspace` command the machine emits at
 * commit through the ordinary command path.
 *
 * Phases:
 *
 * ```text
 * idle ──WHEEL / TOUCH_MOVE (arming rules pass)──► armed ──travel ≥ thresholdPx──► tracking
 *   ▲                                                │                               │
 *   │                                    rule breach / idle / end                gesture end
 *   │                                                ▼                               ▼
 *   └──────── lockoutMs elapsed ◄── lockout ◄── SETTLE_DONE (commit) ◄──────── settling
 *   └──────────────────────────────────────── SETTLE_DONE (cancel) ◄──────────────┘
 * ```
 *
 * `settling` is zero-length in this release (the wrapper dispatches
 * `SETTLE_DONE` at once); it exists so the N2 transition stage can hold the
 * phase while it animates `progress` to ±1 (commit) or back to 0 (cancel).
 */

/** Which side of the active workspace a swipe is heading to. */
export type TilingWorkspaceSwipeTarget = "prev" | "next";

/** The input class that owns the current gesture. */
export type TilingWorkspaceSwipeInput = "wheel" | "touch";

/** The lifecycle phase of the swipe FSM state (`TilingWorkspaceSwipeState`). */
export type TilingWorkspaceSwipePhase =
  | "idle"
  | "armed"
  | "tracking"
  | "settling"
  | "lockout";

/** How a `settling` swipe resolved. */
export type TilingWorkspaceSwipeOutcome = "commit" | "cancel";

/**
 * Tunables of the swipe FSM. Every field has a default in
 * {@link TILING_WORKSPACE_SWIPE_DEFAULTS}; `interaction.workspaces.switch.wheelSwipe`
 * accepts a partial override.
 */
export interface TilingWorkspaceSwipeConfig {
  /**
   * Horizontal travel (CSS px, summed wheel `dx` or finger displacement) an
   * `armed` gesture must reach before it becomes `tracking`. Below it a
   * gesture is jitter and never owns the input. Default `24`.
   */
  thresholdPx: number;
  /**
   * `|progress|` (travel / viewport width) at gesture end at or above which the
   * swipe commits. Default `0.35`.
   */
  commitFraction: number;
  /**
   * Peak sample velocity (CSS px per ms, measured towards the target) at or
   * above which the swipe commits regardless of distance — the flick. Default
   * `0.6`.
   */
  commitVelocityPxMs: number;
  /**
   * A wheel gesture ends when no `WHEEL` sample arrived for this long; the
   * host's `IDLE_TICK` carries the clock reading the reducer compares against
   * the last sample. Default `120`.
   */
  wheelIdleMs: number;
  /**
   * After a commit every `WHEEL` sample is swallowed for this long so trackpad
   * momentum cannot start a second gesture. Default `350`.
   */
  lockoutMs: number;
  /**
   * Whether a swipe past the first / last workspace wraps around. `false`
   * (default) keeps the machine `idle` for a direction with no neighbour — no
   * rubber-band in this release.
   */
  wrap: boolean;
  /**
   * Fallback viewport width (CSS px) used to normalise travel into `progress`
   * when neither `SET_CONTEXT` nor the sample supplied one. The wrapper always
   * supplies the measured width; the default only keeps the machine total.
   * Default `800`.
   */
  widthPx: number;
}

/** Defaults of {@link TilingWorkspaceSwipeConfig}. */
export const TILING_WORKSPACE_SWIPE_DEFAULTS: TilingWorkspaceSwipeConfig = {
  thresholdPx: 24,
  commitFraction: 0.35,
  commitVelocityPxMs: 0.6,
  wheelIdleMs: 120,
  lockoutMs: 350,
  wrap: false,
  widthPx: 800,
};

/** Merge a partial override over {@link TILING_WORKSPACE_SWIPE_DEFAULTS} (nullish fields keep the default). */
export function resolveWorkspaceSwipeConfig(
  config?: Partial<TilingWorkspaceSwipeConfig> | null,
): TilingWorkspaceSwipeConfig {
  return {
    thresholdPx: Math.max(0, config?.thresholdPx ?? TILING_WORKSPACE_SWIPE_DEFAULTS.thresholdPx),
    commitFraction: clamp01(config?.commitFraction ?? TILING_WORKSPACE_SWIPE_DEFAULTS.commitFraction),
    commitVelocityPxMs: Math.max(
      0,
      config?.commitVelocityPxMs ?? TILING_WORKSPACE_SWIPE_DEFAULTS.commitVelocityPxMs,
    ),
    wheelIdleMs: Math.max(0, config?.wheelIdleMs ?? TILING_WORKSPACE_SWIPE_DEFAULTS.wheelIdleMs),
    lockoutMs: Math.max(0, config?.lockoutMs ?? TILING_WORKSPACE_SWIPE_DEFAULTS.lockoutMs),
    wrap: config?.wrap ?? TILING_WORKSPACE_SWIPE_DEFAULTS.wrap,
    widthPx: Math.max(1, config?.widthPx ?? TILING_WORKSPACE_SWIPE_DEFAULTS.widthPx),
  };
}

/**
 * The facts the reducer needs from outside the gesture stream, carried on
 * every state so a sample can be judged without a second lookup.
 */
export interface TilingWorkspaceSwipeContext {
  /** A workspace exists before the active one in tab order. */
  hasPrev: boolean;
  /** A workspace exists after the active one in tab order. */
  hasNext: boolean;
  /**
   * The viewport width (CSS px) `progress` is normalised against; `null`
   * until `SET_CONTEXT` or a sample supplies it (then the config fallback).
   */
  widthPx: number | null;
  /** A pane drag is in flight (`DRAG_ACTIVE`); no swipe arms while `true`. */
  dragActive: boolean;
}

/** The pristine context: no neighbours known, no width, no drag. */
export const TILING_WORKSPACE_SWIPE_EMPTY_CONTEXT: TilingWorkspaceSwipeContext = {
  hasPrev: false,
  hasNext: false,
  widthPx: null,
  dragActive: false,
};

interface SwipeStateBase {
  /** Environmental facts carried across phases. */
  context: TilingWorkspaceSwipeContext;
  /**
   * Signed swipe progress in `-1..1`: negative = towards `prev`, positive =
   * towards `next`. `0` outside `tracking` / `settling`.
   */
  progress: number;
  /** The side the gesture is heading to; `null` when not tracking or cancelled. */
  target: TilingWorkspaceSwipeTarget | null;
  /**
   * The `cycle-workspace` command to dispatch — present on exactly one state
   * per gesture: `settling` with `outcome: "commit"`. `null` everywhere else.
   */
  command: TilingCommand | null;
}

/**
 * The swipe lifecycle state. Every non-idle phase has an enumerated edge back
 * to `idle`, so the machine cannot wedge: `armed` drops on any breach or
 * gesture end, `tracking` always ends in `settling`, `settling` leaves on
 * `SETTLE_DONE`, `lockout` expires on the clock.
 */
export type TilingWorkspaceSwipeState =
  | (SwipeStateBase & { phase: "idle"; progress: 0; target: null; command: null })
  | (SwipeStateBase & {
      phase: "armed";
      input: TilingWorkspaceSwipeInput;
      /** Finger origin (touch only; `0` for wheel). */
      originX: number;
      originY: number;
      /** Signed horizontal travel towards `next` accumulated so far (wheel only). */
      travelPx: number;
      /** Clock reading of the sample that armed / last advanced the gesture. */
      lastTs: number;
      progress: 0;
      target: null;
      command: null;
    })
  | (SwipeStateBase & {
      phase: "tracking";
      input: TilingWorkspaceSwipeInput;
      originX: number;
      originY: number;
      /** Signed horizontal travel towards `next` (CSS px), before clamping. */
      travelPx: number;
      lastTs: number;
      /** Highest per-sample velocity (px/ms) measured towards the current target. */
      peakVelocityPxMs: number;
      command: null;
    })
  | (SwipeStateBase & {
      phase: "settling";
      input: TilingWorkspaceSwipeInput;
      outcome: TilingWorkspaceSwipeOutcome;
      /** Clock reading of the sample that ended the gesture. */
      endedTs: number;
    })
  | (SwipeStateBase & {
      phase: "lockout";
      /** Clock reading at which `WHEEL` samples are accepted again. */
      until: number;
      progress: 0;
      target: null;
      command: null;
    });

/** Events the host feeds the reducer. Clock readings (`ts`) are monotonic ms. */
export type TilingWorkspaceSwipeEvent =
  | {
      type: "WHEEL";
      /** Horizontal scroll delta (CSS px); positive scrolls right = towards `next`. */
      dx: number;
      /** Vertical scroll delta (CSS px). */
      dy: number;
      /** Pinch-zoom / ctrl-wheel; never arms. */
      ctrlKey: boolean;
      ts: number;
      /**
       * An element between the event target and the viewport can still scroll
       * horizontally in the sample's direction (`ScrollChainPort`). Arming is
       * refused while `true`; ignored once `tracking`. Default `false`.
       */
      canScrollFurther?: boolean;
      /** Viewport width (CSS px) at the sample; overrides the context width. */
      widthPx?: number;
    }
  | { type: "TOUCH_START"; x: number; y: number; ts: number; widthPx?: number }
  | {
      type: "TOUCH_MOVE";
      x: number;
      y: number;
      ts: number;
      /** As on `WHEEL`, judged for the finger's direction on the arming sample. */
      canScrollFurther?: boolean;
      widthPx?: number;
    }
  | { type: "TOUCH_END"; ts: number }
  | { type: "DRAG_ACTIVE"; active: boolean }
  | { type: "IDLE_TICK"; ts: number }
  | { type: "SETTLE_DONE" }
  | { type: "CANCEL" }
  | {
      type: "SET_CONTEXT";
      hasPrev: boolean;
      hasNext: boolean;
      widthPx?: number;
    };

/** The initial (idle, empty-context) state. */
export const TILING_WORKSPACE_SWIPE_INITIAL_STATE: TilingWorkspaceSwipeState = {
  phase: "idle",
  context: TILING_WORKSPACE_SWIPE_EMPTY_CONTEXT,
  progress: 0,
  target: null,
  command: null,
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function idleWith(context: TilingWorkspaceSwipeContext): TilingWorkspaceSwipeState {
  return { phase: "idle", context, progress: 0, target: null, command: null };
}

/** The side `travelPx` heads to (`null` at exactly zero). */
export function swipeTargetOfTravel(travelPx: number): TilingWorkspaceSwipeTarget | null {
  if (travelPx > 0) {
    return "next";
  }
  if (travelPx < 0) {
    return "prev";
  }
  return null;
}

/** Whether the set has a workspace on `target`'s side (always `true` with `wrap`). */
export function hasSwipeNeighbour(
  context: TilingWorkspaceSwipeContext,
  target: TilingWorkspaceSwipeTarget,
  wrap: boolean,
): boolean {
  if (wrap) {
    return context.hasPrev || context.hasNext;
  }
  return target === "next" ? context.hasNext : context.hasPrev;
}

/**
 * The arming rules, applied to the FIRST sample that could start a gesture.
 * Pure over the facts the port stamped on the sample:
 *
 * 1. no pane drag in flight;
 * 2. horizontal-dominant: `|dx| > 2·|dy|`;
 * 3. `ctrlKey` false (pinch-zoom);
 * 4. nothing between the target and the viewport can still scroll on X in that
 *    direction (`canScrollFurther` false);
 * 5. a workspace exists on that side (or `wrap`).
 *
 * Returns the target the gesture heads to, or `null` when it must not arm.
 */
export function resolveSwipeArming(params: {
  context: TilingWorkspaceSwipeContext;
  dx: number;
  dy: number;
  ctrlKey: boolean;
  canScrollFurther: boolean;
  wrap: boolean;
}): TilingWorkspaceSwipeTarget | null {
  if (params.context.dragActive || params.ctrlKey || params.canScrollFurther) {
    return null;
  }
  if (Math.abs(params.dx) <= 2 * Math.abs(params.dy)) {
    return null;
  }
  const target: TilingWorkspaceSwipeTarget | null = swipeTargetOfTravel(params.dx);
  if (target == null || !hasSwipeNeighbour(params.context, target, params.wrap)) {
    return null;
  }
  return target;
}

/**
 * Normalise travel into signed progress: `travelPx / widthPx`, clamped to
 * `-1..1`, and clamped at `0` on a side with no neighbour (no rubber-band)
 * unless `wrap`.
 */
export function swipeProgressOfTravel(
  travelPx: number,
  widthPx: number,
  context: TilingWorkspaceSwipeContext,
  wrap: boolean,
): number {
  let progress: number = Math.max(-1, Math.min(1, travelPx / Math.max(1, widthPx)));
  if (!wrap) {
    if (!context.hasPrev && progress < 0) {
      progress = 0;
    }
    if (!context.hasNext && progress > 0) {
      progress = 0;
    }
  }
  return progress;
}

/**
 * The commit predicate at gesture end: a target exists AND (`|progress| ≥
 * commitFraction` OR the peak velocity towards it `≥ commitVelocityPxMs`).
 */
export function shouldCommitSwipe(params: {
  progress: number;
  target: TilingWorkspaceSwipeTarget | null;
  peakVelocityPxMs: number;
  config: TilingWorkspaceSwipeConfig;
}): boolean {
  if (params.target == null) {
    return false;
  }
  return (
    Math.abs(params.progress) >= params.config.commitFraction ||
    params.peakVelocityPxMs >= params.config.commitVelocityPxMs
  );
}

/** The command a committed swipe dispatches (`cycleWorkspace` semantics). */
export function swipeCommitCommand(target: TilingWorkspaceSwipeTarget): TilingCommand {
  return { kind: "cycle-workspace", direction: target === "next" ? "next" : "previous" };
}

function effectiveWidth(
  context: TilingWorkspaceSwipeContext,
  sampleWidth: number | undefined,
  config: TilingWorkspaceSwipeConfig,
): number {
  return sampleWidth ?? context.widthPx ?? config.widthPx;
}

function withSampleWidth(
  context: TilingWorkspaceSwipeContext,
  sampleWidth: number | undefined,
): TilingWorkspaceSwipeContext {
  if (sampleWidth == null || sampleWidth === context.widthPx) {
    return context;
  }
  return { ...context, widthPx: sampleWidth };
}

function trackingFrom(params: {
  context: TilingWorkspaceSwipeContext;
  input: TilingWorkspaceSwipeInput;
  originX: number;
  originY: number;
  travelPx: number;
  ts: number;
  peakVelocityPxMs: number;
  widthPx: number;
  config: TilingWorkspaceSwipeConfig;
}): TilingWorkspaceSwipeState {
  const progress: number = swipeProgressOfTravel(
    params.travelPx,
    params.widthPx,
    params.context,
    params.config.wrap,
  );
  return {
    phase: "tracking",
    context: params.context,
    input: params.input,
    originX: params.originX,
    originY: params.originY,
    travelPx: params.travelPx,
    lastTs: params.ts,
    peakVelocityPxMs: params.peakVelocityPxMs,
    progress,
    target: swipeTargetOfTravel(progress),
    command: null,
  };
}

function settleFrom(
  state: Extract<TilingWorkspaceSwipeState, { phase: "tracking" }>,
  ts: number,
  config: TilingWorkspaceSwipeConfig,
): TilingWorkspaceSwipeState {
  const commit: boolean = shouldCommitSwipe({
    progress: state.progress,
    target: state.target,
    peakVelocityPxMs: state.peakVelocityPxMs,
    config,
  });
  if (commit && state.target != null) {
    return {
      phase: "settling",
      context: state.context,
      input: state.input,
      outcome: "commit",
      endedTs: ts,
      progress: state.progress,
      target: state.target,
      command: swipeCommitCommand(state.target),
    };
  }
  return {
    phase: "settling",
    context: state.context,
    input: state.input,
    outcome: "cancel",
    endedTs: ts,
    progress: state.progress,
    target: null,
    command: null,
  };
}

/** Per-sample velocity towards the target, `0` when the sample moves away or `dt ≤ 0`. */
function velocityTowards(
  travelDeltaPx: number,
  dtMs: number,
  target: TilingWorkspaceSwipeTarget | null,
): number {
  if (dtMs <= 0 || target == null) {
    return 0;
  }
  const signed: number = target === "next" ? travelDeltaPx : -travelDeltaPx;
  return signed > 0 ? signed / dtMs : 0;
}

/**
 * The peak velocity after a tracking sample: the running maximum while the
 * travel keeps heading to the same side, RESET when the travel crosses zero
 * (a fast swipe out followed by a pull-back must not commit the way back on
 * the outbound flick's speed).
 */
function nextPeakVelocity(
  state: Extract<TilingWorkspaceSwipeState, { phase: "tracking" }>,
  travelPx: number,
  travelDeltaPx: number,
  dtMs: number,
): number {
  const target: TilingWorkspaceSwipeTarget | null = swipeTargetOfTravel(travelPx);
  const velocity: number = velocityTowards(travelDeltaPx, dtMs, target);
  return target === swipeTargetOfTravel(state.travelPx)
    ? Math.max(state.peakVelocityPxMs, velocity)
    : velocity;
}

/**
 * Pure swipe-lifecycle reducer. No timers and no side effects: the host runs
 * the wheel-idle timer (`IDLE_TICK`), dispatches `state.command` when it sees
 * `settling` with `outcome: "commit"`, and sends `SETTLE_DONE` when its
 * transition (if any) has finished. Every `(state, event)` pair is defined;
 * unmatched pairs return the state unchanged.
 *
 * Sign convention: `WHEEL.dx > 0` (content scrolls right) heads to `next`;
 * a finger moving LEFT (`TOUCH_MOVE.x < origin`) heads to `next`, so touch
 * travel is `origin.x − x`.
 */
export function workspaceSwipeReducer(
  state: TilingWorkspaceSwipeState,
  event: TilingWorkspaceSwipeEvent,
  config: TilingWorkspaceSwipeConfig = TILING_WORKSPACE_SWIPE_DEFAULTS,
): TilingWorkspaceSwipeState {
  // Context updates apply in every phase and never move the phase by
  // themselves (a tracking gesture keeps tracking; the next sample re-clamps).
  if (event.type === "SET_CONTEXT") {
    const context: TilingWorkspaceSwipeContext = {
      ...state.context,
      hasPrev: event.hasPrev,
      hasNext: event.hasNext,
      widthPx: event.widthPx ?? state.context.widthPx,
    };
    return { ...state, context };
  }
  if (event.type === "DRAG_ACTIVE") {
    const context: TilingWorkspaceSwipeContext =
      state.context.dragActive === event.active
        ? state.context
        : { ...state.context, dragActive: event.active };
    if (!event.active) {
      return context === state.context ? state : { ...state, context };
    }
    // A drag picked up: an armed or tracking swipe yields to it.
    if (state.phase === "armed") {
      return idleWith(context);
    }
    if (state.phase === "tracking") {
      return {
        phase: "settling",
        context,
        input: state.input,
        outcome: "cancel",
        endedTs: state.lastTs,
        progress: state.progress,
        target: null,
        command: null,
      };
    }
    return context === state.context ? state : { ...state, context };
  }
  if (event.type === "CANCEL") {
    if (state.phase === "armed" || state.phase === "lockout") {
      return idleWith(state.context);
    }
    if (state.phase === "tracking") {
      return {
        phase: "settling",
        context: state.context,
        input: state.input,
        outcome: "cancel",
        endedTs: state.lastTs,
        progress: state.progress,
        target: null,
        command: null,
      };
    }
    return state;
  }

  switch (state.phase) {
    case "idle": {
      switch (event.type) {
        case "WHEEL": {
          const target: TilingWorkspaceSwipeTarget | null = resolveSwipeArming({
            context: state.context,
            dx: event.dx,
            dy: event.dy,
            ctrlKey: event.ctrlKey,
            canScrollFurther: event.canScrollFurther ?? false,
            wrap: config.wrap,
          });
          if (target == null) {
            return state;
          }
          const context: TilingWorkspaceSwipeContext = withSampleWidth(state.context, event.widthPx);
          if (Math.abs(event.dx) >= config.thresholdPx) {
            // One large sample crosses the threshold outright: arm and track.
            return trackingFrom({
              context,
              input: "wheel",
              originX: 0,
              originY: 0,
              travelPx: event.dx,
              ts: event.ts,
              peakVelocityPxMs: 0,
              widthPx: effectiveWidth(context, event.widthPx, config),
              config,
            });
          }
          return {
            phase: "armed",
            context,
            input: "wheel",
            originX: 0,
            originY: 0,
            travelPx: event.dx,
            lastTs: event.ts,
            progress: 0,
            target: null,
            command: null,
          };
        }
        case "TOUCH_START": {
          if (state.context.dragActive) {
            return state;
          }
          return {
            phase: "armed",
            context: withSampleWidth(state.context, event.widthPx),
            input: "touch",
            originX: event.x,
            originY: event.y,
            travelPx: 0,
            lastTs: event.ts,
            progress: 0,
            target: null,
            command: null,
          };
        }
        default:
          return state;
      }
    }

    case "armed": {
      switch (event.type) {
        case "WHEEL": {
          if (state.input !== "wheel") {
            return state;
          }
          // Every pre-threshold sample must keep passing the arming rules; a
          // breach (vertical-dominant, ctrl, scrollable chain, reversed into a
          // side with no neighbour) hands the stream back to the browser.
          const target: TilingWorkspaceSwipeTarget | null = resolveSwipeArming({
            context: state.context,
            dx: event.dx,
            dy: event.dy,
            ctrlKey: event.ctrlKey,
            canScrollFurther: event.canScrollFurther ?? false,
            wrap: config.wrap,
          });
          if (target == null) {
            return idleWith(state.context);
          }
          const context: TilingWorkspaceSwipeContext = withSampleWidth(state.context, event.widthPx);
          const travelPx: number = state.travelPx + event.dx;
          if (Math.abs(travelPx) < config.thresholdPx) {
            return { ...state, context, travelPx, lastTs: event.ts };
          }
          return trackingFrom({
            context,
            input: "wheel",
            originX: 0,
            originY: 0,
            travelPx,
            ts: event.ts,
            peakVelocityPxMs: velocityTowards(
              event.dx,
              event.ts - state.lastTs,
              swipeTargetOfTravel(travelPx),
            ),
            widthPx: effectiveWidth(context, event.widthPx, config),
            config,
          });
        }
        case "TOUCH_MOVE": {
          if (state.input !== "touch") {
            return state;
          }
          const dx: number = state.originX - event.x;
          const dy: number = event.y - state.originY;
          if (Math.hypot(dx, dy) < config.thresholdPx) {
            // Finger jitter: hold.
            return { ...state, lastTs: event.ts };
          }
          const target: TilingWorkspaceSwipeTarget | null = resolveSwipeArming({
            context: state.context,
            dx,
            dy,
            ctrlKey: false,
            canScrollFurther: event.canScrollFurther ?? false,
            wrap: config.wrap,
          });
          if (target == null) {
            // A vertical pan / scrollable chain / no neighbour: the browser
            // owns this touch; later moves are ignored until TOUCH_END.
            return idleWith(state.context);
          }
          const context: TilingWorkspaceSwipeContext = withSampleWidth(state.context, event.widthPx);
          return trackingFrom({
            context,
            input: "touch",
            originX: state.originX,
            originY: state.originY,
            travelPx: dx,
            ts: event.ts,
            peakVelocityPxMs: velocityTowards(dx, event.ts - state.lastTs, target),
            widthPx: effectiveWidth(context, event.widthPx, config),
            config,
          });
        }
        case "IDLE_TICK": {
          if (state.input === "wheel" && event.ts - state.lastTs >= config.wheelIdleMs) {
            return idleWith(state.context);
          }
          return state;
        }
        case "TOUCH_END":
          return state.input === "touch" ? idleWith(state.context) : state;
        case "TOUCH_START":
          // A second finger / re-press restarts the touch gesture.
          return {
            phase: "armed",
            context: withSampleWidth(state.context, event.widthPx),
            input: "touch",
            originX: event.x,
            originY: event.y,
            travelPx: 0,
            lastTs: event.ts,
            progress: 0,
            target: null,
            command: null,
          };
        default:
          return state;
      }
    }

    case "tracking": {
      switch (event.type) {
        case "WHEEL": {
          if (state.input !== "wheel") {
            return state;
          }
          const context: TilingWorkspaceSwipeContext = withSampleWidth(state.context, event.widthPx);
          const travelPx: number = state.travelPx + event.dx;
          return trackingFrom({
            context,
            input: "wheel",
            originX: 0,
            originY: 0,
            travelPx,
            ts: event.ts,
            peakVelocityPxMs: nextPeakVelocity(state, travelPx, event.dx, event.ts - state.lastTs),
            widthPx: effectiveWidth(context, event.widthPx, config),
            config,
          });
        }
        case "TOUCH_MOVE": {
          if (state.input !== "touch") {
            return state;
          }
          const context: TilingWorkspaceSwipeContext = withSampleWidth(state.context, event.widthPx);
          const travelPx: number = state.originX - event.x;
          return trackingFrom({
            context,
            input: "touch",
            originX: state.originX,
            originY: state.originY,
            travelPx,
            ts: event.ts,
            peakVelocityPxMs: nextPeakVelocity(
              state,
              travelPx,
              travelPx - state.travelPx,
              event.ts - state.lastTs,
            ),
            widthPx: effectiveWidth(context, event.widthPx, config),
            config,
          });
        }
        case "IDLE_TICK": {
          if (state.input === "wheel" && event.ts - state.lastTs >= config.wheelIdleMs) {
            return settleFrom(state, event.ts, config);
          }
          return state;
        }
        case "TOUCH_END":
          return state.input === "touch" ? settleFrom(state, event.ts, config) : state;
        default:
          return state;
      }
    }

    case "settling": {
      switch (event.type) {
        case "SETTLE_DONE":
          if (state.outcome === "commit") {
            return {
              phase: "lockout",
              context: state.context,
              until: state.endedTs + config.lockoutMs,
              progress: 0,
              target: null,
              command: null,
            };
          }
          return idleWith(state.context);
        default:
          // Wheel momentum / stray touch samples during the settle are swallowed.
          return state;
      }
    }

    case "lockout": {
      switch (event.type) {
        case "WHEEL":
          // Trackpad momentum after a commit: swallowed until the lockout
          // expires. The expiring sample itself is swallowed too — a fresh
          // gesture starts on the next one.
          return event.ts >= state.until ? idleWith(state.context) : state;
        case "IDLE_TICK":
          return event.ts >= state.until ? idleWith(state.context) : state;
        case "TOUCH_START":
          // A deliberate touch is not momentum: it may start a gesture at once.
          return workspaceSwipeReducer(idleWith(state.context), event, config);
        default:
          return state;
      }
    }

    default:
      return state;
  }
}

/** The host-facing projection of the FSM state a tab strip indicator reads. */
export interface TilingWorkspaceSwipeSnapshot {
  /** Signed progress `-1..1`; negative = towards `prev`. */
  progress: number;
  /** The side the swipe heads to; `null` when idle or cancelled. */
  target: TilingWorkspaceSwipeTarget | null;
  /** The lifecycle phase. */
  phase: TilingWorkspaceSwipePhase;
}

/** The snapshot of the idle machine (what `useWorkspaceSwipe` returns outside a scope). */
export const TILING_WORKSPACE_SWIPE_IDLE_SNAPSHOT: TilingWorkspaceSwipeSnapshot = {
  progress: 0,
  target: null,
  phase: "idle",
};

/** Project a state to its host-facing snapshot (same reference for the initial idle state). */
export function workspaceSwipeSnapshot(state: TilingWorkspaceSwipeState): TilingWorkspaceSwipeSnapshot {
  if (state.phase === "idle" && state.progress === 0) {
    return TILING_WORKSPACE_SWIPE_IDLE_SNAPSHOT;
  }
  return { progress: state.progress, target: state.target, phase: state.phase };
}
