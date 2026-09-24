import type {
  TilingExternalDragHover,
  TilingWorkspacePlacement,
  TilingWorkspaceTabDragHover,
} from "./types";

/**
 * Spring-loaded workspace-tab drop — the pure DWELL FSM behind "hold a dragged
 * pane over a workspace tab and the drag continues inside that workspace"
 * (`_agent/workspace-navigation-plan.md` N3; deferred in
 * `_agent/workspace-set-concept.md` §9 Q7 because the layout tree must never
 * change under a live drag). Modelled on `engine/workspace-navigation.ts` and
 * `engine/drag-machine.ts`: a reducer over a discriminated state union, no
 * timers, no DOM, no side effects.
 *
 * The rule that keeps INV-R1..R4 intact: the tree never changes under a live
 * drag. Spring-load therefore does NOT switch workspaces mid-drag. When the
 * dwell elapses it asks the host to END the running drag as the existing
 * `claimed` external commit (`moveLeafToWorkspace`, the same path a release
 * over the tab takes), switch the set, and START a fresh drag (`REARM`,
 * `engine/drag-machine.ts`) on the leaf's new seat under the still-held
 * pointer. Two drags, one gesture — no footprint of the old tree survives.
 *
 * ```text
 * idle ──HOVER(workspace-tab ≠ active)──► dwelling ──TICK(ts − since ≥ dwellMs)──► fired
 *   ▲          │ HOVER(other tab) restarts `since`          │
 *   │          │ HOVER(null / non-tab / active tab) ───────►│ idle
 *   └──────────┴──────────── DRAG_END / RESET ◄─────────────┘
 * ```
 *
 * `fired` is absorbing until `RESET` / `DRAG_END`: a fire happens exactly once
 * per dwell, and neither a late `TICK` nor a hover change while the host is
 * mid-commit can re-fire or clear the intent.
 *
 * ## Wiring contract — the set-mode wrapper (`react/tiling-renderer.tsx`,
 * `TilingWorkspaceSetRenderer`; the inner renderer owns steps 3c–4)
 *
 * Enabled by `interaction.workspaces.springLoad?: { dwellMs } | false`
 * (default `false`; type {@link TilingSpringLoadCapability}, resolved by
 * {@link resolveSpringLoadCapability} → `null` when disabled). While the
 * capability is on and the inner renderer is `dragging`:
 *
 * 1. **HOVER** — on every external-hover change the wrapper already observes
 *    (`onExternalDragHoverChange`, fed by `resolveExternalDragHover`'s tab
 *    hit-test once per processed drag frame), dispatch
 *    `{ type: "HOVER", hover, leafId: dragState.sourceLeafId,
 *    activeWorkspaceId: set.activeId, ts: scheduler.now() }`. A
 *    `kind: "workspace-tab"` hover over a non-active workspace starts /
 *    continues the dwell; anything else returns to `idle`.
 * 2. **TICK** — when the state enters `dwelling`, arm ONE timer through the
 *    scheduler port for `springLoadFireAt(state, config) − scheduler.now()`
 *    ms (`SchedulerPort.setTimer`); on fire dispatch
 *    `{ type: "TICK", ts: scheduler.now() }`. Re-arm when `since` changes
 *    (a different tab restarted the dwell); clear the timer when the state
 *    leaves `dwelling`. A per-frame `TICK` from the rAF coalescer is an
 *    acceptable alternative — the reducer is total and idempotent on `TICK`.
 * 3. **commit-and-rearm** — when the state is `fired`, read `state.intent`
 *    ({@link TilingSpringLoadIntent}) and, in this order:
 *    (a) capture the pointer identity + last point from the live
 *        `dragState` (`pointerId`, `pointerType`; the last `client` the input
 *        driver processed) into a pending-rearm ref;
 *    (b) apply `moveLeafToWorkspace(set, intent.leafId, intent.workspaceId,
 *        intent.placement)` then `switchWorkspace(next, intent.workspaceId)`;
 *        emit `onWorkspacesChange(next)`, `onMoveLeaf(leafId, from, to)`, and
 *        `onWorkspaceSwitch({ from, to, via: "spring-load" })`; remember the
 *        leaf as the destination workspace's focused leaf;
 *    (c) end the running drag as the existing claimed external commit:
 *        dispatch `POINTER_UP { pointerId, claimed: true }` to the inner drag
 *        machine (the same edge `handleExternalDrop` takes on release). The
 *        inner settle effect runs its ordinary teardown — strips the OLD
 *        tree's transient styles (INV-R1), resets the seat / latch cluster,
 *        clears the external hover, dispatches `SETTLE_DONE` → `idle`. It
 *        MUST NOT release pointer capture for a pending rearm (the pointer is
 *        still held) — gate `pointerCapturePort.release` on "no rearm pending";
 *    (d) dispatch `RESET` to the dwell FSM (steps 1–2 stop until the re-armed
 *        drag hovers a tab again).
 * 4. **REARM** — after the NEXT commit of the inner renderer that (i) renders
 *    the destination workspace's tree containing `intent.leafId` and (ii) has
 *    the drag machine `idle` (`canRearmDrag(dragState)`; the settle effect of
 *    step 3c has run), measure the leaf's seat
 *    (`[data-leaf-id="<leafId>"]` → `getBoundingClientRect`), rebuild the
 *    ghost snapshot from the leaf's tile, and dispatch to the inner drag
 *    machine `{ type: "REARM", pointerId, pointerType, sourceLeafId: leafId,
 *    tileId, anchorFootprint, client: lastPoint }` (offset defaults to
 *    `rearmPointerAnchorOffset`). Then run the pickup tail a threshold /
 *    long-press promotion runs: ensure root pointer capture for `pointerId`
 *    and `inputDriver.captureInitialTarget(leafId, lastPoint, pointerId)` so
 *    the first target of the NEW tree is resolved and the external hover is
 *    re-resolved at the held point. Clear the pending-rearm ref. If the leaf
 *    is absent from the rendered tree (the host rewrote the set), drop the
 *    rearm — the pointer's release then does nothing (idle), which is the
 *    safe outcome.
 *    The re-armed drag is an ordinary `dragging` state: the input layer
 *    re-subscribes on the new `pointerId`, the M3 watchdog re-arms, the
 *    visibility / blur / capture-loss arbiters and the source-vanished cancel
 *    all apply unchanged (INV-R2..R4).
 * 5. **DRAG_END** — whenever the inner drag machine leaves `dragging` for any
 *    reason other than step 3c (release, cancel, watchdog, visibility), dispatch
 *    `DRAG_END` and clear the timer, so a dwell can never outlive its drag.
 *
 * The wrapper never touches a `TilingLayoutNode`: the move is
 * `moveLeafToWorkspace`, the switch is `switchWorkspace`, and the drag machine
 * owns every footprint.
 */

/** Tunables of the dwell FSM. Defaults in {@link TILING_SPRING_LOAD_DEFAULTS}. */
export interface TilingSpringLoadConfig {
  /**
   * How long (ms) the pointer must stay over the SAME non-active workspace tab,
   * without releasing, before the drag commits into that workspace and
   * re-arms there. Default `500`.
   */
  dwellMs: number;
}

/** Defaults of {@link TilingSpringLoadConfig}. */
export const TILING_SPRING_LOAD_DEFAULTS: TilingSpringLoadConfig = {
  dwellMs: 500,
};

/**
 * The capability value `interaction.workspaces.springLoad` will accept once
 * the renderer wiring lands: `false` (default — spring-load off) or a partial
 * {@link TilingSpringLoadConfig}. Resolved by `resolveSpringLoadCapability`
 * (`./engine`) to a config, or `null` when disabled.
 */
export type TilingSpringLoadCapability = Partial<TilingSpringLoadConfig> | false;

/** Merge a partial override over {@link TILING_SPRING_LOAD_DEFAULTS} (nullish fields keep the default; `dwellMs` clamped at `0`). */
export function resolveSpringLoadConfig(
  config?: Partial<TilingSpringLoadConfig> | null,
): TilingSpringLoadConfig {
  return {
    dwellMs: Math.max(0, config?.dwellMs ?? TILING_SPRING_LOAD_DEFAULTS.dwellMs),
  };
}

/**
 * Resolve the capability value: `false` / `undefined` / `null` → `null`
 * (spring-load disabled); an object → the merged {@link TilingSpringLoadConfig}.
 */
export function resolveSpringLoadCapability(
  capability: TilingSpringLoadCapability | null | undefined,
): TilingSpringLoadConfig | null {
  if (capability == null || capability === false) {
    return null;
  }
  return resolveSpringLoadConfig(capability);
}

/** The lifecycle phase of {@link TilingSpringLoadState}. */
export type TilingSpringLoadPhase = "idle" | "dwelling" | "fired";

/**
 * What the host must do when the dwell fires: end the running drag as the
 * claimed external commit of `leafId` into `workspaceId` (`moveLeafToWorkspace`
 * with `placement`), switch the set there, and `REARM` the drag on the leaf's
 * new seat. See the module doc's wiring contract, step 3.
 */
export interface TilingSpringLoadIntent {
  /** Discriminant (the only intent kind in this release). */
  readonly kind: "commit-and-rearm";
  /** The dragged leaf (from `HOVER.leafId`). */
  readonly leafId: string;
  /** The destination workspace (the dwelled tab). */
  readonly workspaceId: string;
  /** Where in the destination tree the leaf lands; `undefined` → engine default (root, second side). */
  readonly placement: TilingWorkspacePlacement | undefined;
}

/**
 * The dwell FSM state. `workspaceId` / `since` are `null` exactly in `idle`;
 * `intent` is non-null exactly in `fired`.
 */
export type TilingSpringLoadState =
  | { phase: "idle"; workspaceId: null; since: null; leafId: null; intent: null }
  | {
      phase: "dwelling";
      /** The tab being dwelled on. */
      workspaceId: string;
      /** Clock reading (ms) at which the dwell over `workspaceId` began. */
      since: number;
      /** The dragged leaf. */
      leafId: string;
      /** The hover's placement, carried into the intent. */
      placement: TilingWorkspacePlacement | undefined;
      intent: null;
    }
  | {
      phase: "fired";
      workspaceId: string;
      since: number;
      leafId: string;
      placement: TilingWorkspacePlacement | undefined;
      intent: TilingSpringLoadIntent;
    };

/** Events the host feeds the reducer. Clock readings (`ts`) are monotonic ms. */
export type TilingSpringLoadEvent =
  | {
      type: "HOVER";
      /**
       * The external hover the renderer resolved this frame (`onExternalDragHoverChange`);
       * only `kind: "workspace-tab"` dwells, anything else (including `null`) → `idle`.
       */
      hover: TilingExternalDragHover | null;
      /** The dragged leaf (`dragState.sourceLeafId`); `null` when no drag is live → `idle`. */
      leafId: string | null;
      /**
       * The set's active workspace. Its own tab never dwells (the host already
       * filters it from the hit-test; this is the reducer-side guard).
       */
      activeWorkspaceId: string | null;
      ts: number;
    }
  | { type: "TICK"; ts: number }
  | { type: "DRAG_END" }
  | { type: "RESET" };

/** The idle state (same reference every time the machine returns to idle). */
export const TILING_SPRING_LOAD_INITIAL_STATE: TilingSpringLoadState = {
  phase: "idle",
  workspaceId: null,
  since: null,
  leafId: null,
  intent: null,
};

/** Narrow a hover to the workspace-tab variant. */
export function isWorkspaceTabDragHover(
  hover: TilingExternalDragHover | null | undefined,
): hover is TilingWorkspaceTabDragHover {
  return hover != null && hover.kind === "workspace-tab";
}

/**
 * The clock reading (ms) at which a `dwelling` state fires; `null` outside
 * `dwelling`. The host arms `SchedulerPort.setTimer(tick, fireAt − now)`.
 */
export function springLoadFireAt(
  state: TilingSpringLoadState,
  config: TilingSpringLoadConfig = TILING_SPRING_LOAD_DEFAULTS,
): number | null {
  return state.phase === "dwelling" ? state.since + config.dwellMs : null;
}

/**
 * Pure dwell reducer. Every `(state, event)` pair is defined; unmatched pairs
 * return the state unchanged (same reference), so the host can key effects on
 * identity.
 */
export function springLoadReducer(
  state: TilingSpringLoadState,
  event: TilingSpringLoadEvent,
  config: TilingSpringLoadConfig = TILING_SPRING_LOAD_DEFAULTS,
): TilingSpringLoadState {
  switch (event.type) {
    case "DRAG_END":
    case "RESET":
      return state.phase === "idle" ? state : TILING_SPRING_LOAD_INITIAL_STATE;

    case "HOVER": {
      if (state.phase === "fired") {
        // Absorbing: the host is mid commit-and-rearm; it RESETs when done.
        return state;
      }
      const hover: TilingExternalDragHover | null = event.hover;
      if (
        !isWorkspaceTabDragHover(hover) ||
        event.leafId == null ||
        hover.workspaceId === event.activeWorkspaceId
      ) {
        return state.phase === "idle" ? state : TILING_SPRING_LOAD_INITIAL_STATE;
      }
      if (
        state.phase === "dwelling" &&
        state.workspaceId === hover.workspaceId &&
        state.leafId === event.leafId
      ) {
        // Same tab, same leaf: the dwell continues; `since` is kept.
        return state;
      }
      // Idle, or a different tab / leaf: (re)start the dwell now.
      return {
        phase: "dwelling",
        workspaceId: hover.workspaceId,
        since: event.ts,
        leafId: event.leafId,
        placement: hover.placement,
        intent: null,
      };
    }

    case "TICK": {
      if (state.phase !== "dwelling") {
        return state;
      }
      if (event.ts - state.since < config.dwellMs) {
        return state;
      }
      return {
        phase: "fired",
        workspaceId: state.workspaceId,
        since: state.since,
        leafId: state.leafId,
        placement: state.placement,
        intent: {
          kind: "commit-and-rearm",
          leafId: state.leafId,
          workspaceId: state.workspaceId,
          placement: state.placement,
        },
      };
    }

    default:
      return state;
  }
}
