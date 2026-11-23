import {
  crossAxisDimension,
  isStaticAlongSplitAxis,
  isStaticInDimension,
  splitAxisDimension,
} from "./pane-sizing";
import type { TilingLayoutNode, TilingSplitAxis, TilingDimension } from "./types";

/**
 * The per-subtree static drag gate.
 *
 * Which place a drag holds, and whether a release there is allowed (the room rule, the fit rule, a swap with
 * itself), is `@n-uf/placement/tiling`'s drag hit and its `after(place).refusal`; this module only names the panes
 * that take no drop at all, which the renderer hands the drag as its `still` panes.
 */

/**
 * The along-axis pixel pin for a node static ALONG `axis`, or `null` for no
 * usable (finite, strictly-positive) pin. Mirrors `leaf-geometry`'s
 * `alongAxisPinPx`: a split with a fitting along-axis pin is geometry-resolvable
 * (static-aware footprints handle it), so it does NOT gate its flexible sibling.
 */
function alongAxisPinPx(node: TilingLayoutNode, axis: TilingSplitAxis): number | null {
  const dimension: TilingDimension = splitAxisDimension(axis);
  const pinPx: number | undefined = dimension === "width" ? node.sizing?.widthPx : node.sizing?.heightPx;
  if (pinPx == null || !Number.isFinite(pinPx) || pinPx <= 0) {
    return null;
  }
  return pinPx;
}

/** True when a child static-along-axis lacks a usable pin → its split's space distribution is unknowable. */
function childMakesSplitUnresolvable(node: TilingLayoutNode, axis: TilingSplitAxis): boolean {
  return isStaticAlongSplitAxis(node, axis) && alongAxisPinPx(node, axis) == null;
}

/**
 * Per-subtree static drag gate — the set of leaf ids that are NOT drag
 * participants (neither a drag source nor a swap/insert target). Replaces the
 * former whole-tree `layoutContainsStaticPane` gate, which disabled rearrange
 * across the ENTIRE tree whenever any static pane existed anywhere.
 *
 * A leaf is gated iff:
 *   1. it is static in EITHER dimension (a content-sized pane is not a clean
 *      drag participant — it has no ratio footprint to relocate or split), OR
 *   2. it lies under a split that has a child static-along-its-axis WITHOUT a
 *      usable pin: that split's space distribution is content-determined and
 *      unknowable to pure geometry, so neither the static child nor its flexible
 *      sibling has a trustworthy footprint → the whole subtree is gated.
 *
 * A split whose static-along-axis child IS pinned is geometry-resolvable
 * (static-aware `collectLeafFootprints` handles it), so rule 2 does NOT fire
 * there: only the static leaf itself (rule 1) is gated, and its flexible sibling
 * subtree stays fully rearrangeable. This is the per-subtree refinement — a
 * pinned "fixed-size pane + flexible rest" dashboard keeps drag live in the
 * flexible regions instead of freezing the whole layout.
 * @internal
 */
export function collectStaticGatedLeafIds(layout: TilingLayoutNode): ReadonlySet<string> {
  const gated = new Set<string>();

  // `parentAxis` is the nearest ancestor split's axis, threaded down exactly
  // like `state.ts`'s `writeLeafCollapsed` — it is what a COLLAPSED leaf's pin
  // runs ALONG (HT-PANE-COLLAPSE, axis-aware: height under a vertical parent,
  // width under a horizontal parent). `undefined` only for a rootless leaf
  // (the sole node in the tree), which has no split to gate against anyway.
  function walk(
    node: TilingLayoutNode,
    inUnresolvableRegion: boolean,
    parentAxis: TilingSplitAxis | undefined,
  ): void {
    if (node.kind === "leaf") {
      // HT-PANE-COLLAPSE: collapse pins the dimension ALONG the leaf's
      // immediate parent split's axis static to the KNOWN, geometry-resolvable
      // `collapsedExtentPx` chrome extent — it is not the "content-sized,
      // unknowable footprint" this gate exists for (rule 1's doc comment
      // above). Left ungated, a collapsed leaf stayed a drag source/target
      // exactly like an expanded one; exempting ONLY the collapse-forced
      // along-axis dimension still gates a leaf the user separately pinned
      // static on the CROSS dimension (the title-bar W•/H• toggle) even while
      // collapsed.
      const selfStatic: boolean =
        node.collapsed === true && parentAxis != null
          ? isStaticInDimension(node, crossAxisDimension(parentAxis))
          : isStaticInDimension(node, "width") || isStaticInDimension(node, "height");
      if (inUnresolvableRegion || selfStatic) {
        gated.add(node.id);
      }
      return;
    }

    if (node.kind === "group") {
      // A group is one slot keyed by its active member — only the active member
      // is outer-visible / draggable. Gate it when the group itself is static
      // (or in an unresolvable region); inactive members have no footprint.
      // Groups are not independently collapsible (HT-PANE-COLLAPSE targets loose
      // leaves only), so no collapse exemption applies here.
      const groupStatic: boolean =
        isStaticInDimension(node, "width") || isStaticInDimension(node, "height");
      if (inUnresolvableRegion || groupStatic) {
        gated.add(node.activeMemberId);
      }
      return;
    }

    const splitUnresolvable: boolean =
      childMakesSplitUnresolvable(node.first, node.axis) ||
      childMakesSplitUnresolvable(node.second, node.axis);
    const childRegionGated: boolean = inUnresolvableRegion || splitUnresolvable;
    walk(node.first, childRegionGated, node.axis);
    walk(node.second, childRegionGated, node.axis);
  }

  walk(layout, false, undefined);
  return gated;
}
