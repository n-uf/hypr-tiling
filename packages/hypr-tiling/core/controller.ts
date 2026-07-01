import {
  DRAG_MACHINE_INITIAL_STATE,
  type DragMachineEvent,
  type DragMachineState,
  type DragResolvedTarget,
  dragMachineReducer,
} from "./drag-machine";
import {
  type DragInputDriver,
  type DragInputDriverSlotCommitment,
  createDragInputDriver,
} from "./input-driver";

/**
 * The runtime seam the controller's {@link DragInputDriver} resolves through —
 * the host-supplied subset of capabilities the framework-free interaction core
 * cannot provide itself (DOM hit-testing, pointer capture, the live
 * slot-commitment policy). Mirrors {@link DragInputDriverHost} minus the
 * FSM-state accessors (`getState`/`dispatch`), which the controller owns and
 * wires internally. The renderer supplies a DOM-backed host; a headless adapter
 * supplies a scripted stub — neither is touched by `core/`.
 */
export interface TilingControllerHost {
  resolveTarget(
    clientX: number,
    clientY: number,
    sourceLeafId: string,
    previousTarget: DragResolvedTarget | null,
  ): DragResolvedTarget | null;
  capturePointer(pointerId: number): void;
  getSlotCommitment(): DragInputDriverSlotCommitment;
}

/**
 * The controller-owned interaction state, exposed as a single immutable
 * snapshot the host subscribes to. The reference is STABLE across no-op
 * dispatches (the reducer returns its input verbatim on a no-op, so the
 * snapshot is only rebuilt on an actual transition) — this is the contract
 * `useSyncExternalStore` requires to avoid an infinite render loop.
 *
 * Currently the drag FSM (`drag`). Layout stays controlled by the host (read
 * via the host's `getLayout`, intents emitted via `onLayoutChange`) and is NOT
 * mirrored here.
 */
export interface TilingControllerState {
  readonly drag: DragMachineState;
}

/**
 * The framework-free interaction controller. Owns the drag FSM store (the
 * `dragMachineReducer` behind a subscribe/getState store) and the seat/latch
 * input driver (`core/input-driver.ts`), exposing them through a
 * host-agnostic surface:
 *
 *   - `getState` / `subscribe` — the `useSyncExternalStore` contract; the host
 *     reads the live interaction snapshot and re-renders on transitions.
 *   - `dispatch` — forward an FSM event (the host's DOM-event handlers translate
 *     `pointerup` / `blur` / `visibilitychange` / keyboard into FSM events).
 *   - `input` — the seat/latch driver; the host forwards raw pointer samples
 *     into `input.processPointerSample` and consults
 *     `input.shouldDispatchCompetingCancel` to arbitrate cancels.
 *   - `onViewportResize` — notify subscribers a viewport resize occurred (the
 *     React host drives its own resize state, so this is a no-op re-read for it;
 *     a vanilla adapter uses it to re-pull layout).
 *   - `dispose` — drop all subscribers and reset the in-flight seat/latch.
 *
 * Touches no `react`, no DOM, no `window` — the entire pickup → seat → commit
 * pipeline runs against the injected host, so it is drivable headlessly.
 */
export interface TilingController {
  getState(): TilingControllerState;
  subscribe(listener: () => void): () => void;
  dispatch(event: DragMachineEvent): void;
  readonly input: DragInputDriver;
  onViewportResize(): void;
  dispose(): void;
}

export interface TilingControllerConfig {
  readonly host: TilingControllerHost;
}

export function createTilingController(
  config: TilingControllerConfig,
): TilingController {
  let dragState: DragMachineState = DRAG_MACHINE_INITIAL_STATE;
  // Cached immutable snapshot. Rebuilt ONLY on an actual FSM transition so its
  // reference stays stable across no-op dispatches — the `useSyncExternalStore`
  // stability contract.
  let snapshot: TilingControllerState = { drag: dragState };
  const listeners: Set<() => void> = new Set<() => void>();

  const notify = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };

  const dispatch = (event: DragMachineEvent): void => {
    const next: DragMachineState = dragMachineReducer(dragState, event);
    // The reducer returns its input verbatim on a no-op transition; matching
    // `useReducer`'s Object.is bail-out, suppress the notify so consumers do not
    // re-render on a dropped event.
    if (next === dragState) {
      return;
    }
    dragState = next;
    snapshot = { drag: dragState };
    notify();
  };

  const input: DragInputDriver = createDragInputDriver({
    getState: (): DragMachineState => dragState,
    dispatch,
    resolveTarget: (
      clientX: number,
      clientY: number,
      sourceLeafId: string,
      previousTarget: DragResolvedTarget | null,
    ): DragResolvedTarget | null =>
      config.host.resolveTarget(clientX, clientY, sourceLeafId, previousTarget),
    capturePointer: (pointerId: number): void => {
      config.host.capturePointer(pointerId);
    },
    getSlotCommitment: (): DragInputDriverSlotCommitment =>
      config.host.getSlotCommitment(),
  });

  const getState = (): TilingControllerState => snapshot;

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return (): void => {
      listeners.delete(listener);
    };
  };

  const onViewportResize = (): void => {
    notify();
  };

  const dispose = (): void => {
    listeners.clear();
    input.reset();
  };

  return {
    getState,
    subscribe,
    dispatch,
    input,
    onViewportResize,
    dispose,
  };
}
