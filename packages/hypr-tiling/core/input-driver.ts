import {
  type CommittableSeatFallback,
  type DragMachineEvent,
  type DragMachinePoint,
  type DragMachineState,
  type DragResolvedTarget,
  type DragSlotCommitmentMode,
  type TouchArmedMoveResolution,
  EMPTY_COMMITTABLE_SEAT_FALLBACK,
  deriveCommittableSeat,
  foldCommittableSeatFallback,
  hasCrossedPickupThreshold,
  isCommittableTarget,
  resolveReleaseCommitSeat,
  resolveTouchArmedMove,
  shouldReresolveSeatedTarget,
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
 * The slot-commitment knobs the driver consults while a slot is seated — the
 * subset of `ResolvedTilingSlotCommitmentCapability` the re-aim damper reads.
 * The host re-reads these LIVE each sample (so a runtime mode/delta change —
 * e.g. the showcase toggle — takes effect without re-subscribing the driver).
 */
export interface DragInputDriverSlotCommitment {
  mode: DragSlotCommitmentMode;
  reresolveDeltaPx: number;
}

/**
 * The runtime capabilities the framework-free {@link DragInputDriver} needs from
 * its host. Every method is a thin, side-effect-localized seam:
 *
 *   - `getState` reads the live FSM phase (the renderer mirrors its `useReducer`
 *     state into a ref so a window pointer listener reads it synchronously).
 *   - `dispatch` forwards an FSM event to the reducer.
 *   - `resolveTarget` runs the host's pointer-target resolution (DOM hit-test +
 *     `resolveDropIntent`) for a client point; `null` when off all targets.
 *   - `capturePointer` takes pointer capture on the host's stable root (the
 *     renderer's `setPointerCapture` + captured-id bookkeeping); best-effort.
 *   - `getSlotCommitment` reads the live slot-commitment policy.
 *
 * The driver itself touches no DOM, no `react`, and no `window` — it is the
 * lifted `processPointerSample` + release-latch orchestration, pure save for the
 * injected host calls, so it is unit-testable with a scripted stub host.
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
  capturePointer(pointerId: number): void;
  getSlotCommitment(): DragInputDriverSlotCommitment;
}

/**
 * The lifted drag input driver: it owns the seat/latch cluster
 * (`seatAnchor` / `committableSeat` / `committableSeatFallback` /
 * `releaseCommitLatched`) and runs the per-sample pipeline + the release latch
 * that were formerly inline in `react/dynamic-tiling-renderer.tsx`'s pointer
 * effect.
 *
 * - `processPointerSample` — promote `armed → dragging` past the pickup
 *   threshold (mouse/pen geometric, touch disambiguated), resolve the drop
 *   target for the sample, apply the slot-commitment re-aim damper while seated,
 *   re-anchor the seat on a (re)seat, and mirror the committable seat + decaying
 *   fallback synchronously. With `isReleaseSample`, the `dragging` branch does
 *   NOT re-resolve from the release coords — it dispatches the already-latched
 *   `committableSeat` verbatim (the snap-back fix).
 * - `captureInitialTarget` — the first-target resolution + seat capture tail the
 *   `armed → dragging` promotion and the touch long-press promotion share.
 * - `latchRelease` — at `pointerup`, latch the seat the release commits
 *   (`resolveReleaseCommitSeat`: the final sample's seat, else the decayed
 *   fallback) into both `committableSeat` and `releaseCommitLatched`.
 * - `reset` — clear the cluster at settle.
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
   * genuinely-stuck case (no latch AND no seat). Centralizes the suppression
   * decision so no cancel source can special-case itself out of the policy.
   */
  shouldDispatchCompetingCancel(): boolean;
  readonly committableSeat: DragResolvedTarget | null;
  readonly releaseCommitLatched: DragResolvedTarget | null;
  readonly seatAnchor: DragMachinePoint | null;
}

export function createDragInputDriver(host: DragInputDriverHost): DragInputDriver {
  // The cursor position captured when the current slot became seated — the
  // anchor the `delta-responsive` commitment policy measures re-aim travel from.
  let seatAnchor: DragMachinePoint | null = null;
  // The single authoritative committable seat — the slot the drop commits to,
  // written synchronously on every processed pointer sample via
  // `deriveCommittableSeat`. The RELEASE path commits THIS verbatim instead of
  // re-resolving the drop target from the `pointerup` coordinates.
  let committableSeat: DragResolvedTarget | null = null;
  // Decaying "last committable seat" fallback for the release latch.
  let committableSeatFallback: CommittableSeatFallback =
    EMPTY_COMMITTABLE_SEAT_FALLBACK;
  // The commit seat LATCHED synchronously at the very start of the release.
  let releaseCommitLatched: DragResolvedTarget | null = null;

  const captureInitialTarget = (
    sourceLeafId: string,
    client: DragMachinePoint,
    owningPointerId: number,
  ): void => {
    const firstTarget: DragResolvedTarget | null = host.resolveTarget(
      client.x,
      client.y,
      sourceLeafId,
      null,
    );
    seatAnchor =
      firstTarget != null && isCommittableTarget(firstTarget, sourceLeafId)
        ? { x: client.x, y: client.y }
        : null;
    committableSeat = deriveCommittableSeat(firstTarget, sourceLeafId);
    committableSeatFallback = foldCommittableSeatFallback(
      committableSeatFallback,
      committableSeat,
    );
    host.dispatch({
      type: "TARGET_RESOLVED",
      pointerId: owningPointerId,
      resolvedTarget: firstTarget,
    });
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
      // RELEASE: commit the single authoritative committable seat atomically.
      // Do NOT re-resolve the drop target from the release coordinates — the
      // seat ref is written synchronously on every move sample below, so it
      // always holds the slot the user was shown hopped into; `POINTER_UP` then
      // commits it (or cancels when it is `null`). This is the snap-back /
      // seated-release fix — see `drag-machine.ts:deriveCommittableSeat`.
      if (isReleaseSample) {
        host.dispatch({ type: "POINTER_MOVE", pointerId: owningPointerId, client });
        host.dispatch({
          type: "TARGET_RESOLVED",
          pointerId: owningPointerId,
          resolvedTarget: committableSeat,
        });
        return;
      }
      host.dispatch({ type: "POINTER_MOVE", pointerId: owningPointerId, client });
      const freshTarget: DragResolvedTarget | null = host.resolveTarget(
        client.x,
        client.y,
        current.sourceLeafId,
        current.resolvedTarget,
      );
      const seatedTarget: DragResolvedTarget | null = current.resolvedTarget;
      // Slot-commitment policy: once the ghost has hopped into a seated slot,
      // hold it (no retarget) until the policy says re-resolve. The delta gates
      // WHETHER to re-run resolution — it is NOT fed into `resolveDropIntent`'s
      // zone hysteresis, so the two dampers never double-count.
      let nextTarget: DragResolvedTarget | null = freshTarget;
      if (
        seatedTarget != null &&
        isCommittableTarget(seatedTarget, current.sourceLeafId)
      ) {
        const cursorWithinSeatedFootprint: boolean =
          freshTarget != null && freshTarget.leafId === seatedTarget.leafId;
        const slotCommitment: DragInputDriverSlotCommitment =
          host.getSlotCommitment();
        const reresolve: boolean = shouldReresolveSeatedTarget({
          mode: slotCommitment.mode,
          seatAnchor: seatAnchor ?? client,
          currentClient: client,
          reresolveDeltaPx: slotCommitment.reresolveDeltaPx,
          cursorWithinSeatedFootprint,
        });
        if (!reresolve) {
          nextTarget = seatedTarget;
        }
      }
      // Re-anchor the seat on a (re)seat onto a committable target; clear it
      // when no slot is seated so the next seat re-anchors fresh.
      if (
        nextTarget != null &&
        isCommittableTarget(nextTarget, current.sourceLeafId)
      ) {
        const isNewSeat: boolean =
          seatedTarget == null ||
          seatedTarget.leafId !== nextTarget.leafId ||
          seatedTarget.zone !== nextTarget.zone ||
          seatedTarget.action !== nextTarget.action;
        if (isNewSeat) {
          seatAnchor = { x: client.x, y: client.y };
        }
      } else {
        seatAnchor = null;
      }
      // Capture the committable seat synchronously so the RELEASE path commits
      // it verbatim without re-resolving the release coordinates.
      committableSeat = deriveCommittableSeat(nextTarget, current.sourceLeafId);
      // Track the decaying last-committable-seat fallback so the release latch
      // survives a transient final-move clear but cancels on a genuine leave.
      committableSeatFallback = foldCommittableSeatFallback(
        committableSeatFallback,
        committableSeat,
      );
      host.dispatch({
        type: "TARGET_RESOLVED",
        pointerId: owningPointerId,
        resolvedTarget: nextTarget,
      });
    }
  };

  const latchRelease = (): DragResolvedTarget | null => {
    // Latch the seat the release will commit: the seat captured on the final
    // processed sample, falling back to the most-recent-non-null committable
    // seat so a transient sub-pixel / gap-hit clear on the FINAL move does not
    // null the commit. The fallback has already DECAYED to null on a genuine
    // leave, so a release after leaving every target still cancels.
    const latchedSeat: DragResolvedTarget | null = resolveReleaseCommitSeat(
      committableSeat,
      committableSeatFallback,
    );
    releaseCommitLatched = latchedSeat;
    committableSeat = latchedSeat;
    return latchedSeat;
  };

  const reset = (): void => {
    seatAnchor = null;
    committableSeat = null;
    committableSeatFallback = EMPTY_COMMITTABLE_SEAT_FALLBACK;
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
    get seatAnchor(): DragMachinePoint | null {
      return seatAnchor;
    },
  };
}
