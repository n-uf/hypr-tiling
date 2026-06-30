/**
 * Pure multi-selection model for the Cmd/Ctrl+click header → group flow
 * (`paneSwitching.multiSelectGrouping`).
 *
 * The renderer is a `"use client"` DOM component that cannot be exercised under
 * the node-only jest harness (see `_agent/tiling-architecture.md`, "Test
 * coverage status"), so the interaction's decision logic lives here as pure
 * functions the renderer merely wires:
 *
 * - `isMultiSelectModifierActive` — discriminate a plain header click from a
 *   Cmd/Ctrl (multi-select) click.
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
import type { DynamicLayoutNode, TilingCommand } from "./types";

/** Minimum selection size that the existing `groupLeaves` op will act on. */
export const MULTI_SELECT_GROUP_MIN_MEMBERS: number = 2;

/**
 * The modifier-key subset of a pointer/mouse event that discriminates a
 * multi-select click from a plain click. `metaKey` = Cmd on macOS, `ctrlKey` =
 * Ctrl on Windows/Linux.
 */
export interface MultiSelectModifierState {
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
}

/**
 * `true` when the event carries the platform multi-select modifier (Cmd on
 * macOS via `metaKey`, Ctrl on Windows/Linux via `ctrlKey`). Both are accepted
 * so one handler covers every platform. This is a boolean predicate (logical
 * OR over two booleans), not a nullish fallback.
 */
export function isMultiSelectModifierActive(event: MultiSelectModifierState): boolean {
  return event.metaKey || event.ctrlKey;
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
  layout: DynamicLayoutNode,
  selection: ReadonlySet<string>,
): boolean {
  if (selection.size < MULTI_SELECT_GROUP_MIN_MEMBERS) {
    return false;
  }
  const leafIds: ReadonlyArray<string> = Array.from(selection);
  return groupLeaves(layout, leafIds) !== layout;
}

/**
 * The `group-leaves` command that folds the current `selection` (insertion
 * order = member order, first id = anchor) into one tabbed group, or `null`
 * when fewer than `MULTI_SELECT_GROUP_MIN_MEMBERS` are selected. Dispatching the
 * returned command is still gated by the `grouping` capability at the renderer's
 * command router (a safe no-op when grouping is disabled).
 */
export function resolveMultiSelectGroupCommand(
  selection: ReadonlySet<string>,
): TilingCommand | null {
  if (selection.size < MULTI_SELECT_GROUP_MIN_MEMBERS) {
    return null;
  }
  return { kind: "group-leaves", leafIds: Array.from(selection) };
}
