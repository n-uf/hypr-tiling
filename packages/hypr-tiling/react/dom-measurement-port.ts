import type { ElementRef } from "../engine/element-ref";
import type { MeasurementPort } from "../engine/measurement-port";
import { dragSourceReservationSelector } from "../engine/drag-presentation";

/**
 * Refs the {@link createDomMeasurementPort} adapter reads through — the same
 * `rootRef` / `viewportRef` / `groupTabStripRefs` / `groupDropTargetRefs` the
 * renderer already owns.
 */
export interface DomMeasurementRefs {
  rootRef: ElementRef<HTMLDivElement | null>;
  viewportRef: ElementRef<HTMLDivElement | null>;
  groupTabStripRefs: ElementRef<Map<string, HTMLDivElement>>;
  groupDropTargetRefs: ElementRef<Map<string, Set<HTMLElement>>>;
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
 *   - `measureGroupDropTargetRects` ← `groupDropTargetRefs.current.get(leafId)`
 *   - `readComputedTransform` ← `getComputedStyle(leafEl).transform`
 *
 * Returns `null` wherever the backing element is absent so callers retain their
 * existing null-handling.
 */
export function createDomMeasurementPort(refs: DomMeasurementRefs): MeasurementPort {
  const { rootRef, viewportRef, groupTabStripRefs, groupDropTargetRefs } = refs;
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
    measureGroupTabMemberRects: (
      groupId: string,
    ): ReadonlyArray<{
      index: number;
      left: number;
      top: number;
      right: number;
      bottom: number;
    }> => {
      const strip: HTMLDivElement | undefined = groupTabStripRefs.current.get(groupId);
      if (strip == null) {
        return [];
      }
      const tabs: NodeListOf<HTMLElement> = strip.querySelectorAll<HTMLElement>('[role="tab"]');
      const rects: Array<{
        index: number;
        left: number;
        top: number;
        right: number;
        bottom: number;
      }> = [];
      tabs.forEach((tab: HTMLElement, position: number): void => {
        const raw: string | null = tab.getAttribute("data-member-index");
        const parsed: number = raw == null ? position : Number.parseInt(raw, 10);
        const index: number = Number.isFinite(parsed) ? parsed : position;
        const rect: DOMRect = tab.getBoundingClientRect();
        rects.push({
          index,
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
        });
      });
      return rects;
    },
    measureGroupDropTargetRects: (leafId: string): ReadonlyArray<DOMRect> => {
      const elements: Set<HTMLElement> | undefined =
        groupDropTargetRefs.current.get(leafId);
      if (elements == null || elements.size === 0) {
        return [];
      }
      const rects: DOMRect[] = [];
      for (const element of elements) {
        rects.push(element.getBoundingClientRect());
      }
      return rects;
    },
    readComputedTransform: (leafId: string): string | null => {
      const element: HTMLElement | null =
        rootRef.current?.querySelector<HTMLElement>(
          `[data-leaf-id="${leafId}"]`,
        ) ?? null;
      return element == null ? null : window.getComputedStyle(element).transform;
    },
  };
}
