/**
 * `PointerCapturePort` — the pointer-capture capability the tiling core needs
 * from its host. It is the seam that formalizes the `setPointerCapture` /
 * `releasePointerCapture` / `hasPointerCapture` glue the renderer used to inline
 * against its drag-root element (`rootRef`).
 *
 * The drag FSM input driver (`engine/input-driver.ts`) and the renderer's
 * long-press promotion + settle teardown route every capture/release through
 * this port instead of touching the DOM directly, so the capture lifecycle is
 * host-agnostic (a vanilla adapter can implement it over a plain element).
 *
 * Every method is best-effort and null-safe: a missing host element or a thrown
 * `setPointerCapture` (no active pointer, detached node) is swallowed, exactly
 * matching the renderer's historical `try { … } catch { }` guards — window
 * listeners still receive events even when explicit capture fails.
 *
 * The default host adapter is `react/dom-pointer-capture-port.ts`
 * (`createDomPointerCapturePort`), bound to the renderer's `rootRef`.
 *
 * NOTE: the resize-separator capture (`event.currentTarget.setPointerCapture`
 * on the divider element, with implicit browser release on `pointerup`) is a
 * distinct per-element capture on a NON-root element and is intentionally NOT
 * routed through this root-bound port.
 */
export interface PointerCapturePort {
  /**
   * Capture `pointerId` on the host's drag-root element. Returns `true` iff the
   * capture call ran without throwing (so the caller mirrors its captured-id
   * bookkeeping only on success — matching the renderer's
   * `capturedPointerIdRef.current = pointerId` write inside the `try`).
   */
  capture(pointerId: number): boolean;
  /**
   * Release `pointerId` from the drag-root element, but ONLY when the root
   * currently holds capture for it (`hasPointerCapture`) — a no-op otherwise.
   */
  release(pointerId: number): void;
  /** Whether the drag-root element currently holds capture for `pointerId`. */
  has(pointerId: number): boolean;
}
