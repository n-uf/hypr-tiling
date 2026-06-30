import { describe, expect, it } from "@jest/globals";
import { dragSourceReservationSelector } from "../drag-presentation";

/**
 * Regression guard for the `cc23956` seat-measurement selector bug.
 *
 * The live-drag seat measurement finds the ghost-seat leaf's reservation rect
 * via a SCOPED selector — `[data-leaf-id="<seat>"] [data-drag-source-reservation]`
 * (`dragSourceReservationSelector`). For it to resolve, a `data-leaf-id` ancestor
 * of the `[data-drag-source-reservation]` node must exist. A reserved slot renders
 * `DragSourceSlotReservation` (which carries `data-drag-source-reservation` but NO
 * `data-leaf-id`) INSTEAD of `DefaultTilingTile` (the sole `data-leaf-id`
 * emitter), so `cc23956` — which introduced the scoped selector without emitting
 * `data-leaf-id` on the reserved wrapper — could NEVER match. `setSeatFootprint`
 * stayed null → the ghost never hopped → the empty reservation lingered beside a
 * free-following ghost (the operator's symptom). The fix emits `data-leaf-id` on
 * the reserved wrapper so the scoped selector resolves (slotHopInEnabled === true).
 *
 * No DOM engine is configured for this package's jest env, so we model the exact
 * ancestor/descendant element tree the renderer emits and a minimal descendant
 * matcher that mirrors `querySelector`'s combinator semantics for this two-token
 * selector. The two fixtures are the REGRESSION tree (reserved wrapper has no
 * `data-leaf-id`) and the FIXED tree (reserved wrapper carries `data-leaf-id`).
 */

interface FixtureElement {
  attrs: Readonly<Record<string, string>>;
  children: ReadonlyArray<FixtureElement>;
}

function el(
  attrs: Readonly<Record<string, string>>,
  children: ReadonlyArray<FixtureElement> = [],
): FixtureElement {
  return { attrs, children };
}

/**
 * Resolve a two-token descendant selector `[data-leaf-id="<id>"] [<descAttr>]`
 * against a fixture tree: does any element carrying `descAttr` have an ancestor
 * whose `data-leaf-id` equals `ghostSeatLeafId`? Mirrors the only `querySelector`
 * behavior the real seat measurement relies on.
 */
function matchesScopedReservation(root: FixtureElement, ghostSeatLeafId: string): boolean {
  const selector: string = dragSourceReservationSelector(ghostSeatLeafId);
  // The production selector MUST be the scoped two-token descendant form; this
  // pins the shape the matcher below assumes.
  expect(selector).toBe(`[data-leaf-id="${ghostSeatLeafId}"] [data-drag-source-reservation]`);

  function walk(node: FixtureElement, hasMatchingLeafAncestor: boolean): boolean {
    const isSeatAncestor: boolean =
      hasMatchingLeafAncestor || node.attrs["data-leaf-id"] === ghostSeatLeafId;
    if (isSeatAncestor && "data-drag-source-reservation" in node.attrs) {
      return true;
    }
    return node.children.some((child: FixtureElement): boolean => walk(child, isSeatAncestor));
  }

  return walk(root, false);
}

/** The renderer's drag DOM: non-reserved leaves emit an article `data-leaf-id`;
 *  the ghost-seat leaf renders a reserved wrapper + a `DragSourceSlotReservation`
 *  child. `reservedWrapperCarriesLeafId` toggles the fix vs the `cc23956` state. */
function dragTree(seatLeafId: string, reservedWrapperCarriesLeafId: boolean): FixtureElement {
  const reservedWrapperAttrs: Record<string, string> = reservedWrapperCarriesLeafId
    ? { "data-leaf-id": seatLeafId }
    : {};
  return el({}, [
    // A normal, non-reserved leaf: DefaultTilingTile emits data-leaf-id on its
    // own article (NOT an ancestor of the reserved slot).
    el({}, [el({ "data-leaf-id": "other-leaf" })]),
    // The ghost-seat leaf: reserved wrapper holding the content-less reservation.
    el(reservedWrapperAttrs, [el({ "data-drag-source-reservation": "" })]),
  ]);
}

describe("dragSourceReservationSelector — cc23956 seat-measurement regression", (): void => {
  const SEAT = "seat-leaf";

  it("emits the scoped, per-leaf descendant selector (cc23956 scoping intent)", (): void => {
    expect(dragSourceReservationSelector(SEAT)).toBe(
      `[data-leaf-id="${SEAT}"] [data-drag-source-reservation]`,
    );
  });

  it("REGRESSION: reserved wrapper without data-leaf-id → selector never matches (ghost cannot hop)", (): void => {
    expect(matchesScopedReservation(dragTree(SEAT, false), SEAT)).toBe(false);
  });

  it("FIX (slotHopInEnabled on): reserved wrapper carries data-leaf-id → selector resolves (ghost hops into seat)", (): void => {
    expect(matchesScopedReservation(dragTree(SEAT, true), SEAT)).toBe(true);
  });

  it("does not match a sibling leaf's article data-leaf-id (the scoping is correct)", (): void => {
    // The non-reserved sibling's data-leaf-id is for a different leaf id, so a
    // seat-scoped lookup must not be satisfied by it.
    expect(matchesScopedReservation(dragTree(SEAT, true), "other-leaf")).toBe(false);
  });
});
