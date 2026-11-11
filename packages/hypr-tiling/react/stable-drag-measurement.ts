import type { DragLandingGroupStrip } from "../engine/drag-landing";
import type { MeasurementPort } from "../engine/measurement-port";
import { findGroupById, findGroupContainingLeaf } from "../engine/state";
import type {
  TilingGroupNode,
  TilingLayoutNode,
  TilingPaneFootprint,
} from "../engine/types";

/**
 * Drop targets that live in the DOM (a group's tab strip and its tabs, a
 * host's `groupDropTargetRef` elements) are measured where they are drawn. In
 * a drag whose preview makes room for the pane (snap to slot, or the drop
 * indicator with `dragPreviewMakesRoom`) the panes are drawn in the tree with
 * the pane in its slot, so those rects move with the preview and a pointer
 * resting on a strip meets it only if the pane has not already settled
 * elsewhere: the drop would depend on the path the pointer took.
 *
 * This port reads the same elements but maps each rect back to where it is
 * with no room made (the tree with the dragged subject taken out), from the
 * same stable footprints the pane-body zones are resolved against. Sizes and
 * offsets inside the pane come from the DOM, so a glide in progress and any
 * strip chrome are kept; only the place of the pane is replaced.
 *
 * @internal
 */

/** The merge the preview has made room for: its tabs are in the DOM strip. */
export interface StableDragInsertedTabs {
  /** The merge target's (active member) leaf id. */
  readonly targetLeafId: string;
  /** `memberInsertIndex` of the target; omitted: appended. */
  readonly insertIndex?: number;
  /** How many tabs the dragged subject adds (a group adds all its members). */
  readonly count: number;
}

export interface StableDragMeasurementInput {
  /** Footprints of the tree with the subject taken out (viewport layout px). */
  readonly footprints: ReadonlyMap<string, TilingPaneFootprint>;
  /** The layout the drag started from (groups are looked up here). */
  readonly layout: TilingLayoutNode;
  /** The viewport's layout size (px), to relate footprints to client px. */
  readonly viewportSize: { readonly width: number; readonly height: number };
  /** The group tab strip as drawn: placement and whether it shows. */
  readonly groupStrip: DragLandingGroupStrip;
  /** The merge the preview has made room for, if any. */
  readonly insertedTabs: StableDragInsertedTabs | null;
  /**
   * Host drop target rects by leaf id, in viewport layout px, kept for the
   * length of one drag. A pane the preview hides (the target of a merge is a
   * hidden tab behind the dragged one) draws no host target; its last rects
   * stand in, so the target does not vanish under the pointer that just
   * settled into it.
   */
  readonly hostTargetCache?: Map<string, ReadonlyArray<Bounds>>;
}

/** A rect as edges. */
export interface Bounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

function toDomRect(bounds: Bounds): DOMRect {
  const width: number = bounds.right - bounds.left;
  const height: number = bounds.bottom - bounds.top;
  return {
    x: bounds.left,
    y: bounds.top,
    left: bounds.left,
    top: bounds.top,
    right: bounds.right,
    bottom: bounds.bottom,
    width,
    height,
    toJSON: (): unknown => ({ ...bounds, width, height }),
  } as DOMRect;
}

/** The rect a footprint (viewport layout px) occupies in client px. */
function footprintBounds(
  footprint: TilingPaneFootprint,
  viewport: DOMRect,
  scale: number,
): Bounds {
  const left: number = viewport.left + footprint.left * scale;
  const top: number = viewport.top + footprint.top * scale;
  return {
    left,
    top,
    right: left + footprint.width * scale,
    bottom: top + footprint.height * scale,
  };
}

/** Whether the group shows its tab strip (two or more members, strip on). */
function showsStrip(group: TilingGroupNode | null, strip: DragLandingGroupStrip): boolean {
  return group != null && strip.visible && group.members.length >= 2;
}

export function createStableDragMeasurement(
  port: MeasurementPort,
  input: StableDragMeasurementInput,
): MeasurementPort {
  const scaleOf = (viewport: DOMRect): number =>
    input.viewportSize.width > 0 && viewport.width > 0
      ? viewport.width / input.viewportSize.width
      : 1;

  /** The group's slot (strip included) with no room made, in client px. */
  const stableSlot = (groupId: string): Bounds | null => {
    const group: TilingGroupNode | null = findGroupById(input.layout, groupId);
    const viewport: DOMRect | null = port.measureViewportRect();
    const footprint: TilingPaneFootprint | undefined =
      group == null ? undefined : input.footprints.get(group.activeMemberId);
    return group == null || viewport == null || footprint == null
      ? null
      : footprintBounds(footprint, viewport, scaleOf(viewport));
  };

  /** The strip's rect with no room made: on the slot's strip edge, as tall as drawn. */
  const stableStrip = (groupId: string): { readonly dom: DOMRect; readonly stable: Bounds } | null => {
    const dom: DOMRect | null = port.measureGroupTabStripRect(groupId);
    const slot: Bounds | null = stableSlot(groupId);
    if (dom == null || slot == null) {
      return null;
    }
    const height: number = dom.bottom - dom.top;
    return {
      dom,
      stable:
        input.groupStrip.placement === "top"
          ? { left: slot.left, right: slot.right, top: slot.top, bottom: slot.top + height }
          : { left: slot.left, right: slot.right, top: slot.bottom - height, bottom: slot.bottom },
    };
  };

  return {
    ...port,
    measureGroupTabStripRect: (groupId: string): DOMRect | null => {
      const strip = stableStrip(groupId);
      return strip == null ? port.measureGroupTabStripRect(groupId) : toDomRect(strip.stable);
    },
    measureGroupTabMemberRects: (groupId: string) => {
      const tabs = port.measureGroupTabMemberRects(groupId);
      const strip = stableStrip(groupId);
      if (strip == null) {
        return tabs;
      }
      const dx: number = strip.stable.left - strip.dom.left;
      const dy: number = strip.stable.top - strip.dom.top;
      let kept = tabs.map((tab) => ({
        index: tab.index,
        left: tab.left + dx,
        top: tab.top + dy,
        right: tab.right + dx,
        bottom: tab.bottom + dy,
      }));
      // The tabs the preview inserted are not in the strip with no room made:
      // take them out and close the gap they left.
      const inserted: StableDragInsertedTabs | null = input.insertedTabs;
      const group: TilingGroupNode | null =
        inserted == null ? null : findGroupContainingLeaf(input.layout, inserted.targetLeafId);
      if (inserted != null && group != null && group.id === groupId && inserted.count > 0) {
        const at: number =
          inserted.insertIndex == null || !Number.isFinite(inserted.insertIndex)
            ? group.members.length
            : Math.max(0, Math.min(Math.trunc(inserted.insertIndex), group.members.length));
        const block = kept.filter((tab) => tab.index >= at && tab.index < at + inserted.count);
        if (block.length > 0 && block.length === inserted.count) {
          const sorted = kept.slice().sort((a, b) => a.left - b.left);
          const first = block.reduce((min, tab) => (tab.left < min.left ? tab : min));
          const last = block.reduce((max, tab) => (tab.right > max.right ? tab : max));
          const after = sorted.find((tab) => tab.left >= last.right - 0.5 && !block.includes(tab));
          const before = sorted.filter((tab) => tab.right <= first.left + 0.5 && !block.includes(tab)).at(-1);
          const gap: number = after != null ? after.left - last.right : before != null ? first.left - before.right : 0;
          const span: number = last.right - first.left + gap;
          kept = kept
            .filter((tab) => !block.includes(tab))
            .map((tab) =>
              tab.index >= at + inserted.count
                ? { ...tab, index: tab.index - inserted.count, left: tab.left - span, right: tab.right - span }
                : tab,
            );
        }
      }
      return kept;
    },
    measureGroupDropTargetRects: (leafId: string): ReadonlyArray<DOMRect> => {
      const rects: ReadonlyArray<DOMRect> = port.measureGroupDropTargetRects(leafId);
      const footprint: TilingPaneFootprint | undefined = input.footprints.get(leafId);
      const pane: DOMRect | null = port.measureLeafRect(leafId);
      const viewport: DOMRect | null = port.measureViewportRect();
      if (footprint == null || viewport == null) {
        return rects;
      }
      const cache: Map<string, ReadonlyArray<Bounds>> | undefined = input.hostTargetCache;
      const scale: number = scaleOf(viewport);
      const width: number = pane == null ? 0 : pane.right - pane.left;
      if (pane == null || width <= 0 || rects.length === 0 || rects.every((rect) => rect.width <= 0 && rect.height <= 0)) {
        // Not drawn now (a hidden tab): the rects it had when it was.
        return (cache?.get(leafId) ?? []).map(
          (bounds: Bounds): DOMRect =>
            toDomRect({
              left: viewport.left + bounds.left * scale,
              top: viewport.top + bounds.top * scale,
              right: viewport.left + bounds.right * scale,
              bottom: viewport.top + bounds.bottom * scale,
            }),
        );
      }
      // The pane with no room made: its slot, less the strip a group shows.
      let slot: Bounds = footprintBounds(footprint, viewport, scaleOf(viewport));
      const group: TilingGroupNode | null = findGroupContainingLeaf(input.layout, leafId);
      if (showsStrip(group, input.groupStrip)) {
        const strip: number = input.groupStrip.heightPx * scaleOf(viewport);
        slot =
          input.groupStrip.placement === "top"
            ? { ...slot, top: Math.min(slot.bottom, slot.top + strip) }
            : { ...slot, bottom: Math.max(slot.top, slot.bottom - strip) };
      }
      const ratio: number = (slot.right - slot.left) / width;
      const nearBottom = (rect: DOMRect): boolean =>
        (rect.top + rect.bottom) / 2 > (pane.top + pane.bottom) / 2;
      const mapped: ReadonlyArray<Bounds> = rects.map((rect: DOMRect): Bounds => {
        // Across the pane the rect keeps its place in proportion; down it
        // keeps its size and its distance from the nearer of the top and bottom.
        const left: number = slot.left + (rect.left - pane.left) * ratio;
        const right: number = slot.left + (rect.right - pane.left) * ratio;
        const height: number = rect.bottom - rect.top;
        const top: number = nearBottom(rect)
          ? slot.bottom - (pane.bottom - rect.bottom) - height
          : slot.top + (rect.top - pane.top);
        return { left, right, top, bottom: top + height };
      });
      cache?.set(
        leafId,
        mapped.map(
          (bounds: Bounds): Bounds => ({
            left: (bounds.left - viewport.left) / scale,
            top: (bounds.top - viewport.top) / scale,
            right: (bounds.right - viewport.left) / scale,
            bottom: (bounds.bottom - viewport.top) / scale,
          }),
        ),
      );
      return mapped.map(toDomRect);
    },
  };
}
