import {
  type CancelableHandle,
  type RacedFrameHandle,
  type TransformSettleGuardHandle,
  type TransitionSettledHandle,
  armTransformSettleGuard,
  onTransitionSettled,
  scheduleFrameOrTimeout,
} from "./drag-recovery";
import type { SchedulerPort } from "./scheduler-port";
import {
  type GhostMorphTransform,
  buildBounceEasingCss,
  coherentDipScaleAt,
  magneticEaseProgress,
} from "./ghost-transit";
import {
  type FlipKeyframe,
  type StyleApplierPort,
  type StyleLeafHandle,
} from "./style-applier-port";
import {
  type SurvivorRect,
  deriveSurvivorFlipTransform,
  resolveSurvivorFlipFirst,
  shouldAnimateSurvivorReflow,
} from "./survivor-reflow";

/**
 * Survivor-FLIP scheduler — the framework-free owner of the survivor-reflow
 * animation ARMING decisions, lifted out of the renderer's survivor-reflow
 * layout effect (`dynamic-tiling-renderer.tsx`). It runs the FLIP First/Last
 * measurement + invert loop through the injected {@link StyleApplierPort} and
 * arms the four self-healing recovery primitives in the EXACT order the renderer
 * used to inline:
 *
 *   - M2  (`onTransitionSettled`)        — clip-mask close on the representative
 *                                          survivor's `transitionend` OR the
 *                                          `duration + slack` starvation backstop.
 *   - M2b (`armTransformSettleGuard`)    — stuck-transition transform-settle
 *                                          self-heal (force-strip a survivor whose
 *                                          COMPUTED transform stalls non-identity).
 *   - M1  (`scheduleFrameOrTimeout`)     — race the play-to-identity write against
 *                                          a timeout so a starved frame never
 *                                          freezes the survivors at their inverted
 *                                          First.
 *   - settle-strip (`stripTransient`)    — idempotent transient-style teardown
 *                                          every exit path calls.
 *
 * The DOM mechanics (`getBoundingClientRect`, `getComputedStyle`,
 * `element.style.*`, `element.animate`, forced reflow) live entirely in the
 * port adapter; this module decides only WHEN to arm / cancel / suppress each
 * primitive, so the arming policy is unit-testable with stub handles
 * (`__tests__/flip-arming-policy.test.ts`) independent of pixel output.
 *
 * It owns the FLIP scheduling-handle cluster the renderer used to scatter across
 * refs (`survivorFlipRafRef`, `survivorDipAnimationsRef`,
 * `survivorReflowEndHandleRef`, `survivorTransformSettleGuardRef`) plus the
 * `previousLeafRectsRef` recorded-First map.
 */

/** Sample count for the coherent-transit dip keyframes (curve resolution). */
const COHERENT_TRANSIT_KEYFRAME_SAMPLES: number = 12;

/**
 * Build the keyframes for a coherent-transit (swap) morph: the FLIP
 * invert→identity transform with the mid-transit dip composed on so the box
 * shrinks toward `~70%` about its own center as it travels, then grows back.
 * Motion progress is eased by `magneticEaseProgress`; the dip uses
 * `coherentDipScaleAt`. Both moving boxes (ghost + swap survivor) use this so
 * they shrink and grow in lockstep and never visually collide mid-cross.
 *
 * Pure (DOM-free): returns the renderer's `[data-leaf-id]` survivor dip frames
 * AND the ghost-hop's morph frames (same math, two call-sites).
 */
export function buildCoherentDipKeyframes(
  invert: GhostMorphTransform,
  lastWidth: number,
  lastHeight: number,
  sampleCount: number = COHERENT_TRANSIT_KEYFRAME_SAMPLES,
): FlipKeyframe[] {
  const frames: FlipKeyframe[] = [];
  for (let index: number = 0; index <= sampleCount; index += 1) {
    const progress: number = index / sampleCount;
    const eased: number = magneticEaseProgress(progress);
    const flipTx: number = invert.tx * (1 - eased);
    const flipTy: number = invert.ty * (1 - eased);
    const flipSx: number = invert.sx + (1 - invert.sx) * eased;
    const flipSy: number = invert.sy + (1 - invert.sy) * eased;
    const dip: number = coherentDipScaleAt(progress);
    const scaleX: number = flipSx * dip;
    const scaleY: number = flipSy * dip;
    // Re-center the dip about the (flip-interpolated) box center, expressed in
    // the node's top-left transform frame so it composes with the FLIP.
    const transX: number = flipTx + (lastWidth * flipSx * (1 - dip)) / 2;
    const transY: number = flipTy + (lastHeight * flipSy * (1 - dip)) / 2;
    frames.push({
      offset: progress,
      transform: `translate(${transX}px, ${transY}px) scale(${scaleX}, ${scaleY})`,
    });
  }
  return frames;
}

/** Per-batch inputs the renderer derives and hands the scheduler each layout effect. */
export interface SurvivorReflowInput {
  /** `liveDragModeEnabled && (phase === "dragging" || phase === "settling")`. */
  readonly playReflow: boolean;
  /** Fast-flick settle-commit snap gate (record rects + strip, no FLIP). */
  readonly snapSettleCommit: boolean;
  /**
   * The clamp viewport (host visible region ∩ window), or `null` when the
   * viewport is unmounted — the scheduler then preserves the recorded First
   * rects and does nothing (matches the renderer's `viewport == null` return).
   */
  readonly clampViewport: SurvivorRect | null;
  /** Coherent-transit (swap) dip mode — survivors use WAAPI, not a CSS transition. */
  readonly coherentDipActive: boolean;
  /** FLIP transition duration (ms). */
  readonly durationMs: number;
  /** M2 / M2b backstop slack (ms) added to `durationMs`. */
  readonly transitionSlackMs: number;
  /** M1 rAF-fallback slack (ms). */
  readonly frameDeadlineMs: number;
  /** Standard-settle bounce magnitude (0 keeps the historical reflow easing). */
  readonly swapBounceMagnitude: number;
  /** Standard-settle easing CSS when `swapBounceMagnitude === 0`. */
  readonly resolvedReflowEasing: string;
}

/** The survivor-FLIP scheduler imperative surface the renderer drives. */
export interface SurvivorFlipScheduler {
  /**
   * Run one survivor-reflow batch: measure First/Last, apply the invert, and arm
   * M2 / M2b / M1 (or, on the record-only / snap path, just record clean rects
   * and strip inline styles). Idempotent w.r.t. its own in-flight batch — cancels
   * the prior dips before re-measuring and re-arms each guard.
   */
  reflow(input: SurvivorReflowInput): void;
  /**
   * Idempotent transient-style teardown: cancel the tracked dips + raced play
   * handle and clear every survivor leaf's inline transform/transition to
   * identity. The stable callback every exit path (settle, watchdog, visibility)
   * calls.
   */
  stripTransient(): void;
  /** Cancel the M2b transform-settle guard (the settle effect disarms it). */
  cancelTransformSettleGuard(): void;
  /** Cancel a pending M1 play-frame (the layout effect's cleanup). */
  cancelPlayFrame(): void;
  /** Cancel M2 + M2b + the tracked dips (the unmount effect). */
  dispose(): void;
}

interface DipPlan {
  readonly handle: StyleLeafHandle;
  readonly invert: GhostMorphTransform;
  readonly lastWidth: number;
  readonly lastHeight: number;
}

export interface SurvivorFlipSchedulerConfig {
  /** The DOM write/measure seam over the survivor `[data-leaf-id]` elements. */
  readonly styleApplier: StyleApplierPort;
  /** Frame + timer + clock host capability (M1/M2/M2b scheduling). */
  readonly scheduler: SchedulerPort;
  /** Called with the clip-mask open/close flag (drives `isSurvivorReflowAnimating`). */
  readonly onReflowAnimatingChange: (animating: boolean) => void;
}

/**
 * Construct the survivor-FLIP scheduler. Created ONCE per renderer (held in a
 * ref) so the handle cluster + recorded First rects survive the layout effect's
 * per-commit re-runs, exactly like the refs it replaces.
 */
export function createSurvivorFlipScheduler(
  config: SurvivorFlipSchedulerConfig,
): SurvivorFlipScheduler {
  const { styleApplier, scheduler, onReflowAnimatingChange } = config;

  // The lifted FLIP scheduling-handle cluster.
  let previousLeafRects: Map<string, SurvivorRect> = new Map<string, SurvivorRect>();
  let playFrameHandle: RacedFrameHandle | null = null;
  let dipHandles: CancelableHandle[] = [];
  let reflowEndHandle: TransitionSettledHandle | null = null;
  let transformSettleGuard: TransformSettleGuardHandle | null = null;

  const stripTransient = (): void => {
    styleApplier.stripTransient({
      animations: dipHandles,
      racedHandles: playFrameHandle == null ? [] : [playFrameHandle],
    });
    dipHandles = [];
    playFrameHandle = null;
  };

  const cancelTransformSettleGuard = (): void => {
    transformSettleGuard?.cancel();
    transformSettleGuard = null;
  };

  const cancelPlayFrame = (): void => {
    playFrameHandle?.cancel();
    playFrameHandle = null;
  };

  const reflow = (input: SurvivorReflowInput): void => {
    // Viewport unmounted — preserve the recorded First rects (the renderer's
    // `if (viewport == null) return;` guard).
    if (input.clampViewport == null) {
      return;
    }
    const clampViewport: SurvivorRect = input.clampViewport;
    const leafHandles: ReadonlyArray<StyleLeafHandle> = styleApplier.collectLeafHandles();
    // Cancel any in-flight swap-dip animations before re-measuring so a
    // re-derived reflow batch never stacks two animations on a survivor.
    for (const handle of dipHandles) {
      handle.cancel();
    }
    dipHandles = [];

    const nextLeafRects: Map<string, SurvivorRect> = new Map<string, SurvivorRect>();
    const playableHandles: StyleLeafHandle[] = [];
    const playableDipPlans: DipPlan[] = [];

    for (const handle of leafHandles) {
      const leafId: string = handle.leafId;
      if (!input.playReflow || input.snapSettleCommit) {
        // Record-only snap path: force-strip leftover inline transform/transition
        // so a leaf is never left floating, and record the resting box as the
        // clean next-pickup First baseline.
        styleApplier.applyTransform(handle, { transition: "none", transform: "none" });
        nextLeafRects.set(leafId, styleApplier.measureRect(handle));
        continue;
      }
      // First (interruptible): the live transformed box if mid-flight, else the
      // recorded pre-reflow rect. Read BEFORE the transform is stripped.
      const hasInFlightTransform: boolean =
        styleApplier.readComputedTransform(handle) !== "none";
      const liveVisualRect: SurvivorRect = styleApplier.measureRect(handle);
      // Strip any prior transform so the committed (Last) box is read clean.
      styleApplier.applyTransform(handle, { transition: "none", transform: "none" });
      const last: SurvivorRect = styleApplier.measureRect(handle);
      nextLeafRects.set(leafId, last);
      const first: SurvivorRect | null = resolveSurvivorFlipFirst({
        recordedPreReflowRect: previousLeafRects.get(leafId) ?? null,
        liveVisualRect,
        hasInFlightTransform,
      });
      if (first == null) {
        continue;
      }
      if (!shouldAnimateSurvivorReflow(first, last, clampViewport)) {
        continue;
      }
      const transform = deriveSurvivorFlipTransform(first, last);
      if (transform == null) {
        continue;
      }
      styleApplier.applyTransform(handle, {
        transformOrigin: "top left",
        transform: `translate(${transform.dx}px, ${transform.dy}px) scale(${transform.sx}, ${transform.sy})`,
      });
      playableHandles.push(handle);
      playableDipPlans.push({
        handle,
        invert: {
          tx: transform.dx,
          ty: transform.dy,
          sx: transform.sx,
          sy: transform.sy,
        },
        lastWidth: last.width,
        lastHeight: last.height,
      });
    }
    previousLeafRects = nextLeafRects;
    if (playableHandles.length === 0) {
      return;
    }
    // Open the clip mask + (re)arm the M2 transition-completion guard on the
    // representative survivor's `transitionend` OR the `duration + slack`
    // starvation backstop, whichever first.
    onReflowAnimatingChange(true);
    reflowEndHandle?.cancel();
    reflowEndHandle = onTransitionSettled({
      target: styleApplier.transitionEndSource(
        playableHandles[playableHandles.length - 1],
      ),
      durationMs: input.durationMs,
      transitionSlackMs: input.transitionSlackMs,
      scheduler,
      onSettled: (): void => {
        reflowEndHandle = null;
        onReflowAnimatingChange(false);
        stripTransient();
      },
    });
    // M2b: arm the stuck-transition transform-settle self-heal for this batch.
    transformSettleGuard?.cancel();
    const guardedHandles: ReadonlyArray<StyleLeafHandle> = playableHandles;
    transformSettleGuard = armTransformSettleGuard({
      readComputedTransforms: (): ReadonlyArray<string> =>
        guardedHandles.map((handle: StyleLeafHandle): string =>
          styleApplier.readComputedTransform(handle),
        ),
      durationMs: input.durationMs,
      transitionSlackMs: input.transitionSlackMs,
      scheduler,
      forceSettle: (): void => {
        transformSettleGuard = null;
        stripTransient();
      },
    });
    // Force the inverted transforms to paint, then play to identity on the next
    // frame (M1 raced against a timeout so a starved frame cannot freeze them).
    styleApplier.forceReflow();
    playFrameHandle?.cancel();
    playFrameHandle = scheduleFrameOrTimeout(
      scheduler,
      input.frameDeadlineMs,
      (): void => {
        if (input.coherentDipActive) {
          // Coherent transit: keyframe each survivor with the mid-reflow dip so
          // it shrinks + grows in lockstep with the ghost. `fill: none` reverts
          // to the inline style on finish; onfinish pins the resting identity.
          const dips: CancelableHandle[] = [];
          for (const plan of playableDipPlans) {
            const keyframes: FlipKeyframe[] = buildCoherentDipKeyframes(
              plan.invert,
              plan.lastWidth,
              plan.lastHeight,
            );
            const dip = styleApplier.animateDip(plan.handle, keyframes, {
              durationMs: input.durationMs,
              easing: "linear",
              fill: "none",
            });
            dip.setOnFinish((): void => {
              styleApplier.stripLeaf(plan.handle);
            });
            dips.push(dip);
          }
          dipHandles = dips;
          return;
        }
        // Standard settle: a dialed-in bounce magnitude substitutes an
        // easeOutBack overshoot; magnitude 0 keeps the historical reflow easing.
        const reflowEasing: string =
          input.swapBounceMagnitude > 0
            ? buildBounceEasingCss(input.swapBounceMagnitude)
            : input.resolvedReflowEasing;
        for (const handle of playableHandles) {
          styleApplier.applyTransform(handle, {
            transition: `transform ${input.durationMs}ms ${reflowEasing}`,
            transform: "none",
          });
        }
      },
    );
  };

  const dispose = (): void => {
    reflowEndHandle?.cancel();
    reflowEndHandle = null;
    transformSettleGuard?.cancel();
    transformSettleGuard = null;
    for (const handle of dipHandles) {
      handle.cancel();
    }
    dipHandles = [];
  };

  return {
    reflow,
    stripTransient,
    cancelTransformSettleGuard,
    cancelPlayFrame,
    dispose,
  };
}
