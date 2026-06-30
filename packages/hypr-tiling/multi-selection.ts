/**
 * Pure multi-selection model for the Alt/Opt+click header → group flow
 * (`paneSwitching.multiSelectGrouping`).
 *
 * The renderer is a `"use client"` DOM component that cannot be exercised under
 * the node-only jest harness (see `_agent/tiling-architecture.md`, "Test
 * coverage status"), so the interaction's decision logic lives here as pure
 * functions the renderer merely wires:
 *
 * - `isMultiSelectModifierActive` — discriminate a plain header click from an
 *   Alt/Opt (multi-select) click.
 * - `toggleLeafMultiSelection` — add/remove a leaf from the selection set
 *   (immutable; insertion order is preserved, so the first-selected leaf is the
 *   `group-leaves` anchor).
 * - `pruneMultiSelection` — drop ids no longer present in the layout's
 *   outer-slot leaf set, so a removed pane never lingers selected.
 * - `canGroupMultiSelection` — whether the current selection can be folded into
 *   one group RIGHT NOW under the existing `groupLeaves` constraint.
 * - `resolveMultiSelectGroupCommand` — the `group-leaves` command for the
 *   current selection (or `null` when there is nothing groupable).
 *
 * Cross-ref: `state.ts` (`groupLeaves` — the SOLE grouping operation reused
 * here, not reimplemented); `commands.ts` (`group-leaves` capability gate).
 */

import { groupLeaves } from "./state";
import type { TilingLayoutNode, TilingCommand } from "./types";

/** Minimum selection size that the existing `groupLeaves` op will act on. */
export const MULTI_SELECT_GROUP_MIN_MEMBERS: number = 2;

/**
 * The modifier-key subset of a pointer/mouse event that discriminates a
 * multi-select click from a plain click. The multi-select / grouping modifier is
 * unified on Alt/Opt across every surface (header click + the Alt+G key), chosen
 * for minimal cross-browser interference: `altKey` = Opt on macOS, Alt on
 * Windows/Linux.
 */
export interface MultiSelectModifierState {
  readonly altKey: boolean;
}

/**
 * `true` when the event carries the multi-select modifier — Alt/Opt (`altKey`),
 * the single chord both the header toggle and the Alt+G group key key off.
 */
export function isMultiSelectModifierActive(event: MultiSelectModifierState): boolean {
  return event.altKey;
}

/**
 * Immutably toggle `leafId` in `selection`: present → removed, absent → added.
 * Returns a NEW `Set` (the input is never mutated). Insertion order is
 * preserved for added ids, so the first-selected leaf remains the
 * `group-leaves` anchor.
 */
export function toggleLeafMultiSelection(
  selection: ReadonlySet<string>,
  leafId: string,
): Set<string> {
  const next: Set<string> = new Set<string>(selection);
  if (next.has(leafId)) {
    next.delete(leafId);
  } else {
    next.add(leafId);
  }
  return next;
}

/**
 * Drop any selected id not present in `presentLeafIds` (the layout's current
 * outer-slot leaf ids). Returns the SAME reference when nothing is pruned, so
 * the caller can skip a state update; otherwise a new `Set` preserving the
 * surviving ids in their original order.
 */
export function pruneMultiSelection(
  selection: ReadonlySet<string>,
  presentLeafIds: ReadonlyArray<string>,
): Set<string> {
  const present: Set<string> = new Set<string>(presentLeafIds);
  let changed: boolean = false;
  const next: Set<string> = new Set<string>();
  for (const id of selection) {
    if (present.has(id)) {
      next.add(id);
    } else {
      changed = true;
    }
  }
  return changed ? next : (selection as Set<string>);
}

/**
 * Whether the current `selection` (in insertion order) can be folded into one
 * group right now. Requires at least `MULTI_SELECT_GROUP_MIN_MEMBERS` ids AND
 * that the existing `groupLeaves` op would actually change `layout` — which
 * encodes the op's own constraint: the anchor (first id) must be a placeable
 * slot (not already a group member) and at least two ids must resolve to leaves.
 * A no-op `groupLeaves` (same reference back) means the selection is not
 * groupable, so the Group control is suppressed rather than offered inert.
 */
export function canGroupMultiSelection(
  layout: TilingLayoutNode,
  selection: ReadonlySet<string>,
): boolean {
  if (selection.size < MULTI_SELECT_GROUP_MIN_MEMBERS) {
    return false;
  }
  const leafIds: ReadonlyArray<string> = Array.from(selection);
  return groupLeaves(layout, leafIds) !== layout;
}

/**
 * Resolve the HOST pane (the slot the merged group occupies + its active tab):
 *
 * - the explicit `clickedLeafId` (the pane whose Group button was pressed) when
 *   it is part of the selection — the header-button path;
 * - else (Alt+G, no click target) the `focusedLeafId` IF it is in the selection,
 *   else the FIRST-selected pane (insertion order).
 *
 * Returns `null` when the selection is empty (nothing to host).
 */
export function resolveMultiSelectGroupHost(
  selection: ReadonlySet<string>,
  clickedLeafId: string | null,
  focusedLeafId: string | null,
): string | null {
  if (selection.size === 0) {
    return null;
  }
  if (clickedLeafId != null && selection.has(clickedLeafId)) {
    return clickedLeafId;
  }
  if (focusedLeafId != null && selection.has(focusedLeafId)) {
    return focusedLeafId;
  }
  for (const id of selection) {
    return id;
  }
  return null;
}

/**
 * The `group-leaves` command that folds the current `selection` (insertion
 * order, expanded over any touched groups) into ONE flat tabbed group at the
 * `hostLeafId` slot (host = active tab, listed first), or `null` when fewer than
 * `MULTI_SELECT_GROUP_MIN_MEMBERS` are selected. When `hostLeafId` is omitted the
 * op defaults the host to the first resolvable id. Dispatching the returned
 * command is still gated by the `grouping` capability at the renderer's command
 * router (a safe no-op when grouping is disabled).
 */
export function resolveMultiSelectGroupCommand(
  selection: ReadonlySet<string>,
  hostLeafId?: string | null,
): TilingCommand | null {
  if (selection.size < MULTI_SELECT_GROUP_MIN_MEMBERS) {
    return null;
  }
  return {
    kind: "group-leaves",
    leafIds: Array.from(selection),
    hostLeafId: hostLeafId ?? undefined,
  };
}
