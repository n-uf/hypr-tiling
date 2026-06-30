import type { RefObject } from "react";
import type { MeasurementPort } from "../core/measurement-port";
import { dragSourceReservationSelector } from "../core/drag-presentation";

/**
 * Refs the {@link createDomMeasurementPort} adapter reads through — the same
 * `rootRef` / `viewportRef` / `groupTabStripRefs` the renderer already owns.
 */
export interface DomMeasurementRefs {
  rootRef: RefObject<HTMLDivElement | null>;
  viewportRef: RefObject<HTMLDivElement | null>;
  groupTabStripRefs: RefObject<Map<string, HTMLDivElement>>;
}

/**
 * Default DOM-backed {@link MeasurementPort} host adapter. Each method reproduces
 * — byte-for-byte — the inline read it replaces in the renderer:
 *
 *   - `measureViewportRect` ← `viewportRef.current?.getBoundingClientRect()`
 *   - `measureLeafRect` ← `rootRef.current?.querySelector('[data-leaf-id="…"]')`
 *     (root-scoped, matching `setLeafSizingFromBbox`'s out-of-viewport-safe path)
 *   - `measureReservationRect` ← `rootRef.current?.querySelector(
 *     dragSourceReservationSelector(leafId))` (the `cc23956`-scoped seat selector)
 *   - `measureGroupTabStripRect` ← `groupTabStripRefs.current.get(groupId)`
 *   - `readComputedTransform` ← `getComputedStyle(leafEl).transform`
 *
 * Returns `null` wherever the backing element is absent so callers retain their
 * existing null-handling.
 */
export function createDomMeasurementPort(refs: DomMeasurementRefs): MeasurementPort {
  const { rootRef, viewportRef, groupTabStripRefs } = refs;
  return {
    measureViewportRect: (): DOMRect | null =>
      viewportRef.current?.getBoundingClientRect() ?? null,
    measureLeafRect: (leafId: string): DOMRect | null =>
      rootRef.current
        ?.querySelector<HTMLElement>(`[data-leaf-id="${leafId}"]`)
        ?.getBoundingClientRect() ?? null,
    measureReservationRect: (leafId: string): DOMRect | null =>
      rootRef.current
        ?.querySelector<HTMLElement>(dragSourceReservationSelector(leafId))
        ?.getBoundingClientRect() ?? null,
    measureGroupTabStripRect: (groupId: string): DOMRect | null =>
      groupTabStripRefs.current.get(groupId)?.getBoundingClientRect() ?? null,
    readComputedTransform: (leafId: string): string | null => {
      const element: HTMLElement | null =
        rootRef.current?.querySelector<HTMLElement>(
          `[data-leaf-id="${leafId}"]`,
        ) ?? null;
      return element == null ? null : window.getComputedStyle(element).transform;
    },
  };
}
