import type { CancelableHandle, TransitionEndSource } from "./drag-recovery";
import type { SurvivorRect } from "./survivor-reflow";

/**
 * `StyleApplierPort` — the WRITE half of the DOM seam (the read-only counterpart
 * is `MeasurementPort`). It is the capability the survivor-FLIP scheduler
 * (`core/flip-scheduler.ts`) needs to MEASURE + MUTATE the survivor
 * `[data-leaf-id]` elements without itself touching the DOM, so the FLIP arming
 * decisions (M1 play-race, M2 transition-settle, M2b transform-settle guard, the
 * settle-strip) are framework-free and unit-testable with stub handles.
 *
 * The mechanics each method wraps — `querySelectorAll('[data-leaf-id]')`,
 * `getBoundingClientRect`, `getComputedStyle(el).transform`,
 * `element.style.transform` / `.transition` / `.transformOrigin`,
 * `element.animate`, `viewport.getBoundingClientRect()` (forced reflow) — live
 * in the default host adapter `react/dom-style-applier-port.ts`
 * (`createDomStyleApplierPort`). The scheduler only sequences the calls.
 *
 * Method ↔ design-doc `StyleApplierPort` mapping:
 *   - `collectLeafHandles`  ← `collectLeafHandles`
 *   - `applyTransform`      ← `applyTransform` (FLIP invert write, the
 *                             play-to-identity write, AND the inline strip)
 *   - `animateDip`          ← `animateDip` (coherent-transit WAAPI dip)
 *   - `stripTransient`      ← `stripTransient` (batch teardown)
 *   - `measureRect` / `readComputedTransform` / `transitionEndSource` /
 *     `measureClampViewport` / `forceReflow` / `stripLeaf` are the read +
 *     element-resolution mechanics the FLIP loop needs alongside the four
 *     headline writes.
 */

/**
 * An opaque handle to one survivor `[data-leaf-id]` element, produced by
 * {@link StyleApplierPort.collectLeafHandles} and accepted by the other
 * element-scoped methods. Carries the `leafId` for the FLIP `First`-rect lookup;
 * the host adapter resolves it back to the live element internally.
 */
export interface StyleLeafHandle {
  readonly leafId: string;
}

/**
 * The transform mutation applied to a leaf. Only the fields PRESENT are written,
 * preserving the renderer's exact call shapes:
 *   - strip:  `{ transition: "none", transform: "none" }`
 *   - invert: `{ transformOrigin: "top left", transform: "translate(…) scale(…)" }`
 *     (transition deliberately left untouched — still `"none"` from the strip)
 *   - play:   `{ transition: "transform <ms>ms <easing>", transform: "none" }`
 */
export interface StyleTransformSpec {
  readonly transition?: string;
  readonly transform?: string;
  readonly transformOrigin?: string;
}

/** A single WAAPI keyframe the coherent-transit dip plays (DOM-free shape). */
export interface FlipKeyframe {
  readonly offset: number;
  readonly transform: string;
}

/** Timing for {@link StyleApplierPort.animateDip} (maps to `KeyframeAnimationOptions`). */
export interface FlipDipOptions {
  readonly durationMs: number;
  readonly easing: string;
  /** Always `"none"` — the dip reverts to the inline style on finish. */
  readonly fill: "none";
}

/**
 * A cancelable handle for one in-flight coherent-transit dip (wraps a WAAPI
 * `Animation`). Extends {@link CancelableHandle} so the strip can cancel it.
 */
export interface FlipDipHandle extends CancelableHandle {
  /** Wire the `onfinish` callback (pins the resting identity transform). */
  setOnFinish(onFinish: () => void): void;
}

export interface StyleApplierPort {
  /**
   * Every survivor `[data-leaf-id]` element under the viewport, in document
   * order, as opaque handles. Elements without a `leafId` are skipped (the
   * renderer's `if (leafId == null) continue;`).
   */
  collectLeafHandles(): ReadonlyArray<StyleLeafHandle>;
  /** The leaf's current client rect (`getBoundingClientRect`). */
  measureRect(handle: StyleLeafHandle): SurvivorRect;
  /** The leaf's COMPUTED `transform` string (`getComputedStyle(el).transform`). */
  readComputedTransform(handle: StyleLeafHandle): string;
  /** Write the present fields of `spec` to the leaf's inline style. */
  applyTransform(handle: StyleLeafHandle, spec: StyleTransformSpec): void;
  /** Play a coherent-transit dip on the leaf (`element.animate`). */
  animateDip(
    handle: StyleLeafHandle,
    keyframes: ReadonlyArray<FlipKeyframe>,
    options: FlipDipOptions,
  ): FlipDipHandle;
  /** The leaf as a `transitionend` event source (M2's settle target). */
  transitionEndSource(handle: StyleLeafHandle): TransitionEndSource;
  /**
   * The FLIP clamp viewport = the host container's visible region intersected
   * with the window, or `null` when the viewport is unmounted (the renderer's
   * `viewport == null` early return — recorded First rects are preserved).
   */
  measureClampViewport(): SurvivorRect | null;
  /** Force a synchronous layout flush so the inverted transforms paint. */
  forceReflow(): void;
  /**
   * Idempotent transient-style teardown across ALL current survivor leaves:
   * cancel the supplied dip + raced handles, then clear every leaf's inline
   * transform/transition to identity (mirrors `stripTransientDragStyles`).
   */
  stripTransient(params: {
    animations: ReadonlyArray<CancelableHandle | null>;
    racedHandles: ReadonlyArray<CancelableHandle | null>;
  }): void;
  /** Clear ONE leaf's inline transform/transition to identity (dip `onfinish`). */
  stripLeaf(handle: StyleLeafHandle): void;
}
