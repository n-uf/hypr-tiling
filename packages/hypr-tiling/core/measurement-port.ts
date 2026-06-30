/**
 * `MeasurementPort` — the read-only DOM-geometry capability the tiling core needs
 * from its host. It is the seam that lets the pointer-target resolution and the
 * ghost-seat clamp run against INJECTED rects (so they are unit-testable with
 * synthetic geometry) instead of reaching into live React refs / the DOM.
 *
 * Every method returns `null` when the backing element is absent, so callers keep
 * their existing "missing measurement → no-op / null target / null seat"
 * semantics unchanged. The write half of the DOM seam is the (deferred)
 * `StyleApplierPort`; this port never mutates the DOM.
 *
 * The default host adapter is `react/dom-measurement-port.ts`
 * (`createDomMeasurementPort`), which reads through the renderer's
 * `rootRef` / `viewportRef` / `groupTabStripRefs` and the
 * `[data-leaf-id]` / reservation / tab-strip selectors.
 */
export interface MeasurementPort {
  /** The drag viewport's client rect, or `null` if the viewport is unmounted. */
  measureViewportRect(): DOMRect | null;
  /** A leaf pane's client rect (`[data-leaf-id="<leafId>"]`), or `null` if absent. */
  measureLeafRect(leafId: string): DOMRect | null;
  /**
   * The in-tree drag-source reservation slot's client rect for `leafId`
   * (`dragSourceReservationSelector`), or `null` if absent. Used to measure the
   * ghost seat the single ghost hops into.
   */
  measureReservationRect(leafId: string): DOMRect | null;
  /** A group's tab-strip client rect, or `null` if the strip is unmounted. */
  measureGroupTabStripRect(groupId: string): DOMRect | null;
  /**
   * A leaf pane's COMPUTED `transform` string (for the stuck-transition / residual
   * transform recovery checks), or `null` if the element is absent.
   */
  readComputedTransform(leafId: string): string | null;
}
