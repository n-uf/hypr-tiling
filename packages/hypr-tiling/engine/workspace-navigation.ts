import {
  pagedSwipeReducer,
  type PagedSwipeConfig,
  type PagedSwipeContext,
  type PagedSwipeInput,
  type PagedSwipeState,
} from "@n-uf/motion/gestures";
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
 * `settling` lasts as long as the wrapper's switch transition (N2): with
 * `switch.transition` on, the set-mode renderer holds `SETTLE_DONE` until the
 * stage has animated to the incoming view (commit) or back to the outgoing one
 * (cancel); with `"none"` the wrapper dispatches `SETTLE_DONE` at once.
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
 * Keyboard modifier a wheel swipe must be held with on its arming samples.
 * `null` (default) requires none — today's behaviour. Touch swipes ignore this
 * (no keyboard). `ctrl` is never a swipe modifier: `ctrlKey` is always a
 * pinch-zoom reject.
 */
export type TilingWorkspaceSwipeModifier = "meta" | "alt" | "shift" | null;

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
  /**
   * Keyboard modifier that must be held on the arming samples of a wheel
   * run (`"meta"` / `"alt"` / `"shift"`). Default `null` — no modifier
   * required. Once `tracking`, releasing the modifier does not cancel or
   * convert the gesture to scroll. Touch ignores this. `ctrlKey` stays a
   * pinch-zoom reject regardless.
   */
  modifier: TilingWorkspaceSwipeModifier;
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
  modifier: null,
};

function resolveSwipeModifier(
  value: TilingWorkspaceSwipeModifier | undefined,
): TilingWorkspaceSwipeModifier {
  if (value === "meta" || value === "alt" || value === "shift" || value === null) {
    return value;
  }
  return TILING_WORKSPACE_SWIPE_DEFAULTS.modifier;
}

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
    modifier: resolveSwipeModifier(config?.modifier),
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
  | (SwipeStateBase & {
      phase: "idle";
      progress: 0;
      target: null;
      command: null;
      /**
       * Clock of the last `WHEEL` in the current run; `null` when no wheel
       * sample has been seen (or the run went idle past `wheelIdleMs`).
       */
      lastWheelTs: number | null;
      /**
       * This wheel run already failed arming (or committed). Later `WHEEL`
       * samples of the same run cannot arm until a gap of `wheelIdleMs`.
       */
      runClaimedByScroll: boolean;
    })
  | (SwipeStateBase & {
      phase: "armed";
      input: TilingWorkspaceSwipeInput;
      /** Finger origin (touch only; `0` for wheel). */
      originX: number;
      originY: number;
      /** Signed horizontal travel towards `next` accumulated so far (wheel only). */
      travelPx: number;
      /**
       * Signed vertical travel accumulated while armed (wheel only). The
       * whole-window lock rejects when `|travelDy| > |travelPx| / 2`.
       */
      travelDy: number;
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
      /** Last `WHEEL` ts in this run (the end sample, or later swallowed momentum). */
      lastWheelTs: number;
    })
  | (SwipeStateBase & {
      phase: "lockout";
      /** Clock reading at which `WHEEL` samples are accepted again. */
      until: number;
      /** Last `WHEEL` ts in this run (momentum during lockout updates it). */
      lastWheelTs: number;
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
      /** `WheelEvent.metaKey` at the sample (modifier gate). */
      metaKey: boolean;
      /** `WheelEvent.altKey` at the sample (modifier gate). */
      altKey: boolean;
      /** `WheelEvent.shiftKey` at the sample (modifier gate). */
      shiftKey: boolean;
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
  lastWheelTs: null,
  runClaimedByScroll: false,
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function swipeModifierHeld(
  modifier: TilingWorkspaceSwipeModifier,
  keys: { metaKey: boolean; altKey: boolean; shiftKey: boolean },
): boolean {
  if (modifier == null) {
    return true;
  }
  if (modifier === "meta") {
    return keys.metaKey;
  }
  if (modifier === "alt") {
    return keys.altKey;
  }
  return keys.shiftKey;
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
 * The arming rules, applied to the FIRST sample that could start a gesture
 * (and to every pre-threshold wheel sample while `armed`). Pure over the
 * facts the port stamped on the sample:
 *
 * 1. no pane drag in flight;
 * 2. horizontal-dominant: `|dx| > 2·|dy|`;
 * 3. `ctrlKey` false (pinch-zoom) — regardless of {@link TilingWorkspaceSwipeConfig.modifier};
 * 4. the configured `modifier` is held (`null` = no modifier required);
 * 5. nothing between the target and the viewport can still scroll on X in that
 *    direction (`canScrollFurther` false);
 * 6. a workspace exists on that side (or `wrap`).
 *
 * Returns the target the gesture heads to, or `null` when it must not arm.
 * Touch callers pass `modifier: null` (no keyboard).
 */
export function resolveSwipeArming(params: {
  context: TilingWorkspaceSwipeContext;
  dx: number;
  dy: number;
  ctrlKey: boolean;
  canScrollFurther: boolean;
  wrap: boolean;
  modifier?: TilingWorkspaceSwipeModifier;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}): TilingWorkspaceSwipeTarget | null {
  if (params.context.dragActive || params.ctrlKey || params.canScrollFurther) {
    return null;
  }
  if (
    !swipeModifierHeld(params.modifier ?? null, {
      metaKey: params.metaKey ?? false,
      altKey: params.altKey ?? false,
      shiftKey: params.shiftKey ?? false,
    })
  ) {
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

/**
 * Pure swipe-lifecycle reducer. No timers and no side effects: the host runs
 * the wheel-idle timer (`IDLE_TICK`), dispatches `state.command` when it sees
 * `settling` with `outcome: "commit"`, and sends `SETTLE_DONE` when its
 * transition (if any) has finished. Every `(state, event)` pair is defined;
 * unmatched pairs return the state unchanged. The transitions are
 * `@n-uf/motion`'s generic paged swipe; this function maps the state, config
 * and events to and from its shapes. `CANCEL` on a `settling` state is the one
 * pair kept here: it returns the state unchanged (only `SETTLE_DONE` ends a
 * settle).
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
  if (event.type === "CANCEL" && state.phase === "settling") {
    // This machine's CANCEL leaves a settling swipe alone: only SETTLE_DONE
    // ends it (a commit then enters its lockout). The generic machine would
    // go straight to idle here, so this one case is kept out of the mapping.
    return state;
  }
  const paged: PagedSwipeState = toPagedState(state);
  const next: PagedSwipeState = pagedSwipeReducer(
    paged,
    toPagedInput(event),
    toPagedConfig(config),
  );
  if (next === paged) {
    return state;
  }
  return fromPagedState(next, state);
}

function toPagedConfig(config: TilingWorkspaceSwipeConfig): PagedSwipeConfig {
  return {
    threshold: config.thresholdPx,
    commitFraction: config.commitFraction,
    commitVelocity: config.commitVelocityPxMs,
    idle: config.wheelIdleMs,
    lockout: config.lockoutMs,
    wrap: config.wrap,
    size: config.widthPx,
    modifier: config.modifier,
    along: "x",
  };
}

function toPagedContext(context: TilingWorkspaceSwipeContext): PagedSwipeContext {
  return {
    hasPrev: context.hasPrev,
    hasNext: context.hasNext,
    size: context.widthPx,
    blocked: context.dragActive,
  };
}

/** Back to the context shape; the previous object is kept when nothing in it changed. */
function fromPagedContext(
  context: PagedSwipeContext,
  previous: TilingWorkspaceSwipeContext,
): TilingWorkspaceSwipeContext {
  if (
    previous.hasPrev === context.hasPrev &&
    previous.hasNext === context.hasNext &&
    previous.widthPx === context.size &&
    previous.dragActive === context.blocked
  ) {
    return previous;
  }
  return {
    hasPrev: context.hasPrev,
    hasNext: context.hasNext,
    widthPx: context.size,
    dragActive: context.blocked,
  };
}

function toPagedState(state: TilingWorkspaceSwipeState): PagedSwipeState {
  const context: PagedSwipeContext = toPagedContext(state.context);
  switch (state.phase) {
    case "idle":
      return {
        phase: "idle",
        context,
        progress: 0,
        target: null,
        lastWheel: state.lastWheelTs,
        claimed: state.runClaimedByScroll,
      };
    case "armed":
      return {
        phase: "armed",
        context,
        progress: 0,
        target: null,
        input: state.input,
        origin: { x: state.originX, y: state.originY },
        travel: state.travelPx,
        cross: state.travelDy,
        last: state.lastTs,
      };
    case "tracking":
      return {
        phase: "tracking",
        context,
        progress: state.progress,
        target: state.target,
        input: state.input,
        origin: { x: state.originX, y: state.originY },
        travel: state.travelPx,
        last: state.lastTs,
        peak: state.peakVelocityPxMs,
      };
    case "settling":
      return {
        phase: "settling",
        context,
        progress: state.progress,
        target: state.target,
        input: state.input,
        outcome: state.outcome,
        ended: state.endedTs,
        lastWheel: state.lastWheelTs,
      };
    case "lockout":
      return {
        phase: "lockout",
        context,
        progress: 0,
        target: null,
        until: state.until,
        lastWheel: state.lastWheelTs,
      };
  }
}

function toPagedInput(event: TilingWorkspaceSwipeEvent): PagedSwipeInput {
  switch (event.type) {
    case "WHEEL":
      return {
        type: "wheel",
        dx: event.dx,
        dy: event.dy,
        t: event.ts,
        modifiers: {
          ctrl: event.ctrlKey,
          meta: event.metaKey,
          alt: event.altKey,
          shift: event.shiftKey,
        },
        canScrollFurther: event.canScrollFurther,
        size: event.widthPx ?? undefined,
      };
    case "TOUCH_START":
      return {
        type: "touch-start",
        x: event.x,
        y: event.y,
        t: event.ts,
        size: event.widthPx ?? undefined,
      };
    case "TOUCH_MOVE":
      return {
        type: "touch-move",
        x: event.x,
        y: event.y,
        t: event.ts,
        canScrollFurther: event.canScrollFurther,
        size: event.widthPx ?? undefined,
      };
    case "TOUCH_END":
      return { type: "touch-end", t: event.ts };
    case "IDLE_TICK":
      return { type: "tick", t: event.ts };
    case "SETTLE_DONE":
      return { type: "settled" };
    case "CANCEL":
      return { type: "cancel" };
    case "DRAG_ACTIVE":
      return { type: "block", on: event.active };
    case "SET_CONTEXT":
      return {
        type: "context",
        hasPrev: event.hasPrev,
        hasNext: event.hasNext,
        size: event.widthPx ?? undefined,
      };
  }
}

/**
 * Back to this state shape. `command` is derived: the commit command rides on
 * exactly the `settling` state with `outcome: "commit"` (the previous state's
 * command object is kept while that state is only updated).
 */
function fromPagedState(
  paged: PagedSwipeState,
  previous: TilingWorkspaceSwipeState,
): TilingWorkspaceSwipeState {
  const context: TilingWorkspaceSwipeContext = fromPagedContext(paged.context, previous.context);
  switch (paged.phase) {
    case "idle":
      return {
        phase: "idle",
        context,
        progress: 0,
        target: null,
        command: null,
        lastWheelTs: paged.lastWheel,
        runClaimedByScroll: paged.claimed,
      };
    case "armed":
      return {
        phase: "armed",
        context,
        input: paged.input,
        originX: paged.origin.x,
        originY: paged.origin.y,
        travelPx: paged.travel,
        travelDy: paged.cross,
        lastTs: paged.last,
        progress: 0,
        target: null,
        command: null,
      };
    case "tracking":
      return {
        phase: "tracking",
        context,
        input: paged.input,
        originX: paged.origin.x,
        originY: paged.origin.y,
        travelPx: paged.travel,
        lastTs: paged.last,
        peakVelocityPxMs: paged.peak,
        progress: paged.progress,
        target: paged.target,
        command: null,
      };
    case "settling": {
      let command: TilingCommand | null = null;
      if (paged.outcome === "commit" && paged.target != null) {
        command =
          previous.phase === "settling" &&
          previous.command != null &&
          previous.target === paged.target
            ? previous.command
            : swipeCommitCommand(paged.target);
      }
      return {
        phase: "settling",
        context,
        input: paged.input,
        outcome: paged.outcome,
        endedTs: paged.ended,
        lastWheelTs: paged.lastWheel,
        progress: paged.progress,
        target: paged.target,
        command,
      };
    }
    case "lockout":
      return {
        phase: "lockout",
        context,
        until: paged.until,
        lastWheelTs: paged.lastWheel,
        progress: 0,
        target: null,
        command: null,
      };
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
