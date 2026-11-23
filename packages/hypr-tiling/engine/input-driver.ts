import {
  type DragMachineEvent,
  type DragMachinePoint,
  type DragMachineState,
  type DragResolvedTarget,
  type TouchArmedMoveResolution,
  deriveCommittableSeat,
  hasCrossedPickupThreshold,
  resolveTouchArmedMove,
  shouldSuppressCompetingCancel,
} from "./drag-machine";

/**
 * Watchdog-arming policy (lifted from the renderer's M3 watchdog effect): the
 * idle watchdog is armed iff drag-recovery is enabled AND the FSM is in a phase
 * a stall could strand (`armed` / `dragging`). `idle` / `settling` never arm it
 * (there is no in-flight interaction to self-heal). Pure so the host effect's
 * arming gate is unit-testable without a timer.
 */
export function shouldArmIdleWatchdog(
  phase: DragMachineState["phase"],
  dragRecoveryEnabled: boolean,
): boolean {
  return dragRecoveryEnabled && (phase === "armed" || phase === "dragging");
}

/**
 * The runtime capabilities the framework-free {@link DragInputDriver} needs from
 * its host. Every method is a thin, side-effect-localized seam:
 *
 *   - `getState` reads the live FSM phase (the renderer mirrors its `useReducer`
 *     state into a ref so a window pointer listener reads it synchronously).
 *   - `dispatch` forwards an FSM event to the reducer.
 *   - `resolveTarget` asks the drag's hit (`@n-uf/placement/tiling`'s
 *     `tilingDrag(...).hit`, built once at the lift) what the pointer at a
 *     client point holds; `null` when it holds nothing or home.
 *   - `heldHome` (optional) says whether that same sample held home; a host
 *     without it never holds home.
 *   - `capturePointer` takes pointer capture on the host's stable root (the
 *     renderer's `setPointerCapture` + captured-id bookkeeping); best-effort.
 *
 * The driver itself touches no DOM, no `react`, and no `window` — it is the
 * lifted `processPointerSample` + release-latch orchestration, pure save for the
 * injected host calls, so it is unit-testable with a scripted stub host. The
 * hold rules (where a held place keeps the pointer, home included) are the hit's;
 * the driver keeps none of its own.
 */
export interface DragInputDriverHost {
  getState(): DragMachineState;
  dispatch(event: DragMachineEvent): void;
  resolveTarget(
    clientX: number,
    clientY: number,
    sourceLeafId: string,
    previousTarget: DragResolvedTarget | null,
  ): DragResolvedTarget | null;
  heldHome?(): boolean;
  capturePointer(pointerId: number): void;
}

/**
 * The lifted drag input driver: it owns the seat/latch pair
 * (`committableSeat` / `releaseCommitLatched`) and runs the per-sample pipeline
 * and the release latch.
 *
 * - `processPointerSample` — promote `armed → dragging` past the pickup
 *   threshold (mouse/pen geometric, touch disambiguated), resolve the drop
 *   target for the sample through the hit, and mirror the committable seat
 *   synchronously. With `isReleaseSample`, the `dragging` branch does NOT
 *   re-resolve from the release coords — it dispatches the seat the last frame
 *   showed verbatim.
 * - `captureInitialTarget` — the first-target resolution + seat capture tail the
 *   `armed → dragging` promotion and the touch long-press promotion share.
 * - `latchRelease` — at `pointerup`, latch the seat the release commits: the
 *   last sample's, what the last frame showed (none: the layout goes back).
 * - `reset` — clear the pair at settle.
 *
 * `committableSeat` / `releaseCommitLatched` are exposed (read-only) so the host
 * competing-cancel sources (`lostpointercapture` / `blur` / `visibilitychange`
 * and the watchdog `onExpire`) can consult `shouldSuppressCompetingCancel`.
 */
export interface DragInputDriver {
  processPointerSample(client: DragMachinePoint, isReleaseSample?: boolean): void;
  captureInitialTarget(
    sourceLeafId: string,
    client: DragMachinePoint,
    owningPointerId: number,
  ): void;
  latchRelease(): DragResolvedTarget | null;
  reset(): void;
  /**
   * Whether a COMPETING cancel source (the M3 watchdog `onExpire`,
   * `lostpointercapture`, `blur`, `visibilitychange`) should be allowed to
   * dispatch its cancel — the single arbiter the host wires ALL four sources
   * through. `false` (suppress) iff a release commit is latched OR a committable
   * seat currently exists; `true` (dispatch the cancel) only in the
   * genuinely-stuck case (no latch AND no seat).
   */
  shouldDispatchCompetingCancel(): boolean;
  readonly committableSeat: DragResolvedTarget | null;
  readonly releaseCommitLatched: DragResolvedTarget | null;
}

export function createDragInputDriver(host: DragInputDriverHost): DragInputDriver {
  // The single authoritative committable seat — the drop the hit held on the
  // last processed sample, what the frame shows. The RELEASE path commits THIS
  // verbatim instead of re-resolving the drop target from the `pointerup`
  // coordinates.
  let committableSeat: DragResolvedTarget | null = null;
  // The commit seat LATCHED synchronously at the very start of the release.
  let releaseCommitLatched: DragResolvedTarget | null = null;

  /** One sample through the hit: the drop it holds, mirrored into the seat and the FSM. */
  const resolveSample = (
    sourceLeafId: string,
    client: DragMachinePoint,
    owningPointerId: number,
    previousTarget: DragResolvedTarget | null,
  ): void => {
    const target: DragResolvedTarget | null = host.resolveTarget(client.x, client.y, sourceLeafId, previousTarget);
    const atHome: boolean = host.heldHome?.() ?? false;
    committableSeat = atHome ? null : deriveCommittableSeat(target, sourceLeafId);
    host.dispatch({
      type: "TARGET_RESOLVED",
      pointerId: owningPointerId,
      resolvedTarget: atHome ? null : target,
      atHome,
    });
  };

  const captureInitialTarget = (
    sourceLeafId: string,
    client: DragMachinePoint,
    owningPointerId: number,
  ): void => {
    resolveSample(sourceLeafId, client, owningPointerId, null);
  };

  const processPointerSample = (
    client: DragMachinePoint,
    isReleaseSample: boolean = false,
  ): void => {
    const current: DragMachineState = host.getState();
    if (current.phase === "armed") {
      const owningPointerId: number = current.pointerId;
      if (current.touchDrag) {
        // Touch must disambiguate before capture. A pre-long-press scroll-axis
        // flick is released to the page: forward the move so the reducer drops
        // to idle, and take NO capture. A sub-threshold hold keeps armed. A
        // non-scroll threshold crossing is a deliberate pickup → fall through.
        const resolution: TouchArmedMoveResolution = resolveTouchArmedMove({
          origin: current.originClient,
          client,
          longPressSatisfied: false,
        });
        if (resolution === "scroll-escape") {
          host.dispatch({ type: "POINTER_MOVE", pointerId: owningPointerId, client });
          return;
        }
        if (resolution === "hold") {
          return;
        }
      } else if (!hasCrossedPickupThreshold(current.originClient, client)) {
        return;
      }
      // Threshold crossed (mouse/pen) or a deliberate touch pickup → take
      // capture on the stable root, then promote to dragging and resolve the
      // first target.
      host.capturePointer(owningPointerId);
      host.dispatch({ type: "POINTER_MOVE", pointerId: owningPointerId, client });
      captureInitialTarget(current.sourceLeafId, client, owningPointerId);
      return;
    }
    if (current.phase === "dragging") {
      const owningPointerId: number = current.pointerId;
      host.dispatch({ type: "POINTER_MOVE", pointerId: owningPointerId, client });
      // RELEASE: commit what the last frame showed. Do NOT re-resolve the drop
      // target from the release coordinates; `POINTER_UP` then commits the seat
      // (or cancels when it is `null`).
      if (isReleaseSample) {
        host.dispatch({
          type: "TARGET_RESOLVED",
          pointerId: owningPointerId,
          resolvedTarget: committableSeat,
        });
        return;
      }
      resolveSample(current.sourceLeafId, client, owningPointerId, current.resolvedTarget);
    }
  };

  const latchRelease = (): DragResolvedTarget | null => {
    releaseCommitLatched = committableSeat;
    return committableSeat;
  };

  const reset = (): void => {
    committableSeat = null;
    releaseCommitLatched = null;
  };

  const shouldDispatchCompetingCancel = (): boolean =>
    !shouldSuppressCompetingCancel(releaseCommitLatched, committableSeat);

  return {
    processPointerSample,
    captureInitialTarget,
    latchRelease,
    reset,
    shouldDispatchCompetingCancel,
    get committableSeat(): DragResolvedTarget | null {
      return committableSeat;
    },
    get releaseCommitLatched(): DragResolvedTarget | null {
      return releaseCommitLatched;
    },
  };
}
