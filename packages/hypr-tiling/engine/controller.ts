import {
  DRAG_MACHINE_INITIAL_STATE,
  type DragMachineEvent,
  type DragMachineState,
  type DragResolvedTarget,
  dragMachineReducer,
} from "./drag-machine";
import { EMPTY_FOCUS_HISTORY, type FocusHistory } from "./focus-history";
import {
  type DragInputDriver,
  type DragInputDriverSlotCommitment,
  createDragInputDriver,
} from "./input-driver";
import type { TilingMoveModeState, TilingPaneSwitcherState } from "./types";

/**
 * A store-slice update: either the next value outright, or a functional updater
 * `(prev) => next`. Mirrors React's `useState` setter contract exactly — the
 * renderer's existing functional-updater calls (e.g.
 * `setMultiSelect((current) => toggleLeafMultiSelection(current, id))`) transfer
 * verbatim, and the `Object.is(next, prev)` bail-out below reproduces
 * `useState`'s no-op re-render suppression (e.g. `clearMultiSelection`'s
 * return-`current`-when-already-empty).
 */
export type TilingControllerSliceUpdate<T> = T | ((previous: T) => T);

function resolveSliceUpdate<T>(
  update: TilingControllerSliceUpdate<T>,
  previous: T,
): T {
  return typeof update === "function"
    ? (update as (previous: T) => T)(previous)
    : update;
}

/**
 * The runtime seam the controller's {@link DragInputDriver} resolves through —
 * the host-supplied subset of capabilities the framework-free interaction core
 * cannot provide itself (DOM hit-testing, pointer capture, the live
 * slot-commitment policy). Mirrors {@link DragInputDriverHost} minus the
 * FSM-state accessors (`getState`/`dispatch`), which the controller owns and
 * wires internally. The renderer supplies a DOM-backed host; a headless adapter
 * supplies a scripted stub — neither is touched by `engine/`.
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
 * updates (each mutator rebuilds the snapshot ONLY when its slice actually
 * changes under `Object.is`, so a dropped event / no-op set leaves the
 * reference untouched) — this is the contract `useSyncExternalStore` requires
 * to avoid an infinite render loop.
 *
 * Slices:
 * - `drag` — the drag FSM (pickup → seat → commit).
 * - `focus` — the UNCONTROLLED focused-leaf id. The host resolves the
 *   controlled/uncontrolled merge itself (`focusedLeafId ?? state.focus`); the
 *   controller owns only the internal fallback, so the prop-merge semantics
 *   stay host-side and unchanged.
 * - `maximize` — the UNCONTROLLED maximized-leaf id (host merge:
 *   `maximizedLeafId !== undefined ? maximizedLeafId : state.maximize`, i.e. a
 *   controlled `null` is honoured as "explicitly restored"; only `undefined`
 *   falls back to this internal slice).
 * - `switcher` — the in-flight macOS-style pane-switcher overlay (`null` when
 *   closed).
 * - `moveMode` — the in-flight keyboard move-mode pickup (`null` when idle).
 * - `multiSelect` — the Alt/Opt+click multi-selection set (empty when none).
 *
 * The MRU focus history is owned by the controller too but kept OUT of this
 * snapshot (see `getFocusHistory` / `updateFocusHistory`): pushing on every
 * focus change must NOT notify subscribers, matching the ref semantics the
 * renderer relied on.
 *
 * Layout stays controlled by the host (read via the host's `getLayout`, intents
 * emitted via `onLayoutChange`) and is NOT mirrored here.
 */
export interface TilingControllerState {
  readonly drag: DragMachineState;
  readonly focus: string | null;
  readonly maximize: string | null;
  readonly switcher: TilingPaneSwitcherState | null;
  readonly moveMode: TilingMoveModeState | null;
  readonly multiSelect: ReadonlySet<string>;
}

/**
 * The framework-free interaction controller. Owns the drag FSM store (the
 * `dragMachineReducer` behind a subscribe/getState store) and the seat/latch
 * input driver (`engine/input-driver.ts`), exposing them through a
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
  /**
   * Set the UNCONTROLLED focused-leaf id. Value or functional updater; a no-op
   * (result `Object.is`-equal to the current value) does not notify.
   */
  setFocus(update: TilingControllerSliceUpdate<string | null>): void;
  /** Set the UNCONTROLLED maximized-leaf id. Value or updater; no-op-safe. */
  setMaximize(update: TilingControllerSliceUpdate<string | null>): void;
  /** Set the pane-switcher overlay slice (`null` closes). Value or updater; no-op-safe. */
  setSwitcher(
    update: TilingControllerSliceUpdate<TilingPaneSwitcherState | null>,
  ): void;
  /** Set the keyboard move-mode slice (`null` exits). Value or updater; no-op-safe. */
  setMoveMode(
    update: TilingControllerSliceUpdate<TilingMoveModeState | null>,
  ): void;
  /** Set the multi-selection set. Value or updater; no-op-safe (reference-equal result does not notify). */
  setMultiSelect(
    update: TilingControllerSliceUpdate<ReadonlySet<string>>,
  ): void;
  /**
   * Read the current MRU focus history synchronously. NOT part of the notified
   * snapshot — reading it never subscribes the caller to re-renders.
   */
  getFocusHistory(): FocusHistory;
  /**
   * Update the MRU focus history in place WITHOUT notifying subscribers
   * (pushing on every focus change must not re-render — the renderer previously
   * held this in a ref for exactly this reason).
   */
  updateFocusHistory(updater: (previous: FocusHistory) => FocusHistory): void;
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
  let focus: string | null = null;
  let maximize: string | null = null;
  let switcher: TilingPaneSwitcherState | null = null;
  let moveMode: TilingMoveModeState | null = null;
  let multiSelect: ReadonlySet<string> = new Set<string>();
  // MRU focus history — controller-owned but deliberately OUTSIDE the notified
  // snapshot so a push does NOT trigger a re-render (the ref semantics the
  // renderer relied on). Read synchronously via `getFocusHistory`.
  let focusHistory: FocusHistory = EMPTY_FOCUS_HISTORY;
  // Cached immutable snapshot. Rebuilt ONLY when a slice actually changes (each
  // mutator bails out under `Object.is` before rebuilding) so its reference
  // stays stable across no-op dispatches / sets — the `useSyncExternalStore`
  // stability contract.
  let snapshot: TilingControllerState = {
    drag: dragState,
    focus,
    maximize,
    switcher,
    moveMode,
    multiSelect,
  };
  const listeners: Set<() => void> = new Set<() => void>();

  const notify = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };

  const rebuildSnapshot = (): void => {
    snapshot = {
      drag: dragState,
      focus,
      maximize,
      switcher,
      moveMode,
      multiSelect,
    };
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
    rebuildSnapshot();
    notify();
  };

  const setFocus = (
    update: TilingControllerSliceUpdate<string | null>,
  ): void => {
    const next: string | null = resolveSliceUpdate(update, focus);
    if (Object.is(next, focus)) {
      return;
    }
    focus = next;
    rebuildSnapshot();
    notify();
  };

  const setMaximize = (
    update: TilingControllerSliceUpdate<string | null>,
  ): void => {
    const next: string | null = resolveSliceUpdate(update, maximize);
    if (Object.is(next, maximize)) {
      return;
    }
    maximize = next;
    rebuildSnapshot();
    notify();
  };

  const setSwitcher = (
    update: TilingControllerSliceUpdate<TilingPaneSwitcherState | null>,
  ): void => {
    const next: TilingPaneSwitcherState | null = resolveSliceUpdate(
      update,
      switcher,
    );
    if (Object.is(next, switcher)) {
      return;
    }
    switcher = next;
    rebuildSnapshot();
    notify();
  };

  const setMoveMode = (
    update: TilingControllerSliceUpdate<TilingMoveModeState | null>,
  ): void => {
    const next: TilingMoveModeState | null = resolveSliceUpdate(
      update,
      moveMode,
    );
    if (Object.is(next, moveMode)) {
      return;
    }
    moveMode = next;
    rebuildSnapshot();
    notify();
  };

  const setMultiSelect = (
    update: TilingControllerSliceUpdate<ReadonlySet<string>>,
  ): void => {
    const next: ReadonlySet<string> = resolveSliceUpdate(update, multiSelect);
    if (Object.is(next, multiSelect)) {
      return;
    }
    multiSelect = next;
    rebuildSnapshot();
    notify();
  };

  const getFocusHistory = (): FocusHistory => focusHistory;

  const updateFocusHistory = (
    updater: (previous: FocusHistory) => FocusHistory,
  ): void => {
    focusHistory = updater(focusHistory);
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
    setFocus,
    setMaximize,
    setSwitcher,
    setMoveMode,
    setMultiSelect,
    getFocusHistory,
    updateFocusHistory,
    onViewportResize,
    dispose,
  };
}
