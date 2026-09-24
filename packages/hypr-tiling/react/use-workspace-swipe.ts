/**
 * `useWorkspaceSwipe` + the swipe scope (N1). The set-mode renderer runs the
 * pure swipe FSM (`engine/workspace-navigation.ts`) over the wheel / touch
 * ports and publishes its state through a small external store. A host tab
 * strip mounted OUTSIDE the renderer reads that store through
 * {@link useWorkspaceSwipe} when both sit under one
 * {@link TilingWorkspaceSwipeScope}; without a scope the renderer owns a
 * private store and the hook reports the idle snapshot.
 *
 * ```tsx
 * <TilingWorkspaceSwipeScope>
 *   <HostTabStrip />      // const { progress, target, phase } = useWorkspaceSwipe();
 *   <TilingRenderer workspaces={set} onWorkspacesChange={setSet}
 *                   interaction={{ workspaces: { switch: { wheelSwipe: true } } }} />
 * </TilingWorkspaceSwipeScope>
 * ```
 */
import * as React from "react";
import type { SchedulerPort } from "../engine/scheduler-port";
import type { TilingCommand } from "../engine/types";
import type {
  TouchInputSample,
  WheelInputSample,
  WheelTouchInputListener,
  WheelTouchInputPort,
} from "../engine/wheel-touch-port";
import {
  TILING_WORKSPACE_SWIPE_IDLE_SNAPSHOT,
  TILING_WORKSPACE_SWIPE_INITIAL_STATE,
  workspaceSwipeReducer,
  workspaceSwipeSnapshot,
  type TilingWorkspaceSwipeConfig,
  type TilingWorkspaceSwipeEvent,
  type TilingWorkspaceSwipeSnapshot,
  type TilingWorkspaceSwipeState,
} from "../engine/workspace-navigation";
import { createDomScrollChainPort } from "./dom-scroll-chain-port";
import { createDomWheelTouchPort } from "./dom-wheel-touch-port";
import { createWindowSchedulerPort } from "./window-scheduler-port";

/**
 * The external store one swipe FSM publishes through. Created by
 * {@link TilingWorkspaceSwipeScope} (shared) or privately by the set-mode
 * renderer. `send` runs the reducer and notifies subscribers when the state
 * changed; the renderer's driver hook owns timers and command dispatch.
 */
export interface TilingWorkspaceSwipeStore {
  /** Current FSM state. */
  getState(): TilingWorkspaceSwipeState;
  /** Host-facing projection (`useSyncExternalStore` snapshot; the idle state is a stable constant). */
  getSnapshot(): TilingWorkspaceSwipeSnapshot;
  /** Reduce one event with `config`; returns the next state. */
  send(event: TilingWorkspaceSwipeEvent, config: TilingWorkspaceSwipeConfig): TilingWorkspaceSwipeState;
  /** Subscribe to state changes; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

/** Create a {@link TilingWorkspaceSwipeStore} holding the initial idle state. */
export function createWorkspaceSwipeStore(): TilingWorkspaceSwipeStore {
  let state: TilingWorkspaceSwipeState = TILING_WORKSPACE_SWIPE_INITIAL_STATE;
  let snapshot: TilingWorkspaceSwipeSnapshot = TILING_WORKSPACE_SWIPE_IDLE_SNAPSHOT;
  const listeners: Set<() => void> = new Set<() => void>();
  return {
    getState: (): TilingWorkspaceSwipeState => state,
    getSnapshot: (): TilingWorkspaceSwipeSnapshot => snapshot,
    send: (
      event: TilingWorkspaceSwipeEvent,
      config: TilingWorkspaceSwipeConfig,
    ): TilingWorkspaceSwipeState => {
      const next: TilingWorkspaceSwipeState = workspaceSwipeReducer(state, event, config);
      if (next === state) {
        return state;
      }
      state = next;
      const nextSnapshot: TilingWorkspaceSwipeSnapshot = workspaceSwipeSnapshot(next);
      if (
        nextSnapshot.phase !== snapshot.phase ||
        nextSnapshot.progress !== snapshot.progress ||
        nextSnapshot.target !== snapshot.target
      ) {
        snapshot = nextSnapshot;
        for (const listener of listeners) {
          listener();
        }
      }
      return next;
    },
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
  };
}

const WorkspaceSwipeStoreContext: React.Context<TilingWorkspaceSwipeStore | null> =
  React.createContext<TilingWorkspaceSwipeStore | null>(null);

/**
 * Shares one swipe store between a set-mode `TilingRenderer` and host chrome
 * (a tab strip) so {@link useWorkspaceSwipe} outside the renderer follows the
 * gesture. Optional: without it the renderer keeps a private store.
 */
export function TilingWorkspaceSwipeScope({
  children,
}: {
  children?: React.ReactNode;
}): React.ReactElement {
  const store: TilingWorkspaceSwipeStore = React.useMemo(createWorkspaceSwipeStore, []);
  return React.createElement(WorkspaceSwipeStoreContext.Provider, { value: store }, children);
}

/**
 * The store the set-mode renderer publishes on: the enclosing
 * {@link TilingWorkspaceSwipeScope}'s when present, else a private one that
 * lives as long as the renderer.
 */
export function useWorkspaceSwipeStore(): TilingWorkspaceSwipeStore {
  const scoped: TilingWorkspaceSwipeStore | null = React.useContext(WorkspaceSwipeStoreContext);
  const privateStore: TilingWorkspaceSwipeStore = React.useMemo(createWorkspaceSwipeStore, []);
  return scoped ?? privateStore;
}

function subscribeToNothing(): () => void {
  return (): void => {};
}

function readIdleSnapshot(): TilingWorkspaceSwipeSnapshot {
  return TILING_WORKSPACE_SWIPE_IDLE_SNAPSHOT;
}

/**
 * Headless read of the workspace swipe in progress: `{ progress, target,
 * phase }`. `progress` is `-1..1` (negative = towards the previous workspace),
 * `target` the side the swipe heads to, `phase` the FSM phase. Live only under
 * a {@link TilingWorkspaceSwipeScope} that also contains the set-mode
 * `TilingRenderer`; elsewhere it is the idle snapshot. Use it to move a tab
 * indicator in step with the gesture.
 */
export function useWorkspaceSwipe(): TilingWorkspaceSwipeSnapshot {
  const store: TilingWorkspaceSwipeStore | null = React.useContext(WorkspaceSwipeStoreContext);
  return React.useSyncExternalStore(
    store == null ? subscribeToNothing : store.subscribe,
    store == null ? readIdleSnapshot : store.getSnapshot,
    readIdleSnapshot,
  );
}

/** Parameters of {@link useWorkspaceSwipeDriver} (internal to the set-mode renderer). */
export interface UseWorkspaceSwipeDriverParams {
  /** The store to publish on. */
  store: TilingWorkspaceSwipeStore;
  /** The renderer root the ports attach to (`null` while unmounted). */
  element: HTMLElement | null;
  /** Wheel swipe enabled. */
  wheel: boolean;
  /** Touch swipe enabled. */
  touch: boolean;
  /** The FSM config (resolved capability). */
  config: TilingWorkspaceSwipeConfig;
  /** A workspace exists before the active one. */
  hasPrev: boolean;
  /** A workspace exists after the active one. */
  hasNext: boolean;
  /** A pane drag is in flight (arming is refused; a tracking swipe yields). */
  dragActive: boolean;
  /**
   * Dispatch the committed `cycle-workspace` command through the renderer's
   * command path (the wrapper's `applyWorkspaceCommand(…, "swipe")`).
   */
  dispatch: (command: TilingCommand) => void;
  /** Timer / clock port; default the `window` scheduler. */
  scheduler?: SchedulerPort;
}

/**
 * Runs the swipe FSM for the set-mode renderer: subscribes the DOM wheel /
 * touch port on `element`, feeds samples to the store, arms the wheel-idle
 * timer (`IDLE_TICK`), dispatches the emitted command on `settling(commit)`,
 * sends `SETTLE_DONE` at once (the N2 transition stage will hold the settle
 * while it animates), expires `lockout` on the clock, and mirrors
 * `hasPrev` / `hasNext` / `dragActive` into the FSM context. Effects only —
 * returns nothing; read the state through the store.
 */
export function useWorkspaceSwipeDriver(params: UseWorkspaceSwipeDriverParams): void {
  const { store, element, wheel, touch, config, hasPrev, hasNext, dragActive, dispatch } = params;
  const scheduler: SchedulerPort = React.useMemo(
    (): SchedulerPort => params.scheduler ?? createWindowSchedulerPort(),
    [params.scheduler],
  );
  const configRef = React.useRef<TilingWorkspaceSwipeConfig>(config);
  configRef.current = config;
  const dispatchRef = React.useRef<(command: TilingCommand) => void>(dispatch);
  dispatchRef.current = dispatch;
  const enabled: boolean = element != null && (wheel || touch);

  React.useEffect((): void => {
    store.send({ type: "SET_CONTEXT", hasPrev, hasNext }, configRef.current);
  }, [store, hasPrev, hasNext]);

  React.useEffect((): void => {
    store.send({ type: "DRAG_ACTIVE", active: dragActive }, configRef.current);
  }, [store, dragActive]);

  React.useEffect((): (() => void) | void => {
    if (!enabled || element == null) {
      // Disabled mid-gesture: drop whatever was in flight.
      if (store.getState().phase !== "idle") {
        store.send({ type: "CANCEL" }, configRef.current);
        store.send({ type: "SETTLE_DONE" }, configRef.current);
      }
      return;
    }
    const port: WheelTouchInputPort = createDomWheelTouchPort(element, {
      wheel,
      touch,
      scrollChain: createDomScrollChainPort({ current: element }),
      now: (): number => scheduler.now(),
    });
    let idleTimer: number | null = null;
    let lockoutTimer: number | null = null;
    let disposed: boolean = false;

    const clearIdleTimer = (): void => {
      if (idleTimer != null) {
        scheduler.clearTimer(idleTimer);
        idleTimer = null;
      }
    };
    const clearLockoutTimer = (): void => {
      if (lockoutTimer != null) {
        scheduler.clearTimer(lockoutTimer);
        lockoutTimer = null;
      }
    };

    // Run one event, then the phase-driven side effects: command dispatch on
    // a commit settle, the zero-length SETTLE_DONE, the lockout expiry timer,
    // the wheel-idle timer, and the port's passive/non-passive wheel policy.
    const send = (event: TilingWorkspaceSwipeEvent): void => {
      if (disposed) {
        return;
      }
      const before: TilingWorkspaceSwipeState = store.getState();
      let state: TilingWorkspaceSwipeState = store.send(event, configRef.current);
      if (state.phase === "settling" && before.phase !== "settling") {
        clearIdleTimer();
        if (state.command != null) {
          dispatchRef.current(state.command);
        }
        state = store.send({ type: "SETTLE_DONE" }, configRef.current);
      }
      if (state.phase === "lockout" && before.phase !== "lockout") {
        clearLockoutTimer();
        const delay: number = Math.max(0, state.until - scheduler.now());
        lockoutTimer = scheduler.setTimer((): void => {
          lockoutTimer = null;
          send({ type: "IDLE_TICK", ts: scheduler.now() });
        }, delay + 1);
      }
      if ((state.phase === "armed" || state.phase === "tracking") && state.input === "wheel") {
        if (event.type === "WHEEL") {
          clearIdleTimer();
          idleTimer = scheduler.setTimer((): void => {
            idleTimer = null;
            send({ type: "IDLE_TICK", ts: scheduler.now() });
          }, configRef.current.wheelIdleMs + 1);
        }
      } else {
        clearIdleTimer();
      }
      port.setTracking(state.phase === "tracking");
    };

    const listener: WheelTouchInputListener = {
      onWheel: (sample: WheelInputSample): void => {
        send({
          type: "WHEEL",
          dx: sample.dx,
          dy: sample.dy,
          ctrlKey: sample.ctrlKey,
          ts: sample.ts,
          canScrollFurther: sample.canScrollFurther,
          widthPx: sample.widthPx ?? undefined,
        });
      },
      onTouchStart: (sample: TouchInputSample): void => {
        send({
          type: "TOUCH_START",
          x: sample.x,
          y: sample.y,
          ts: sample.ts,
          widthPx: sample.widthPx ?? undefined,
        });
      },
      onTouchMove: (sample: TouchInputSample): void => {
        send({
          type: "TOUCH_MOVE",
          x: sample.x,
          y: sample.y,
          ts: sample.ts,
          canScrollFurther: sample.canScrollFurther,
          widthPx: sample.widthPx ?? undefined,
        });
      },
      onTouchEnd: (ts: number): void => {
        send({ type: "TOUCH_END", ts });
      },
    };
    const unsubscribe: () => void = port.subscribe(listener);

    return (): void => {
      disposed = true;
      clearIdleTimer();
      clearLockoutTimer();
      unsubscribe();
      port.setTracking(false);
      if (store.getState().phase !== "idle") {
        store.send({ type: "CANCEL" }, configRef.current);
        store.send({ type: "SETTLE_DONE" }, configRef.current);
      }
    };
  }, [store, element, enabled, wheel, touch, scheduler]);
}
