/**
 * @jest-environment jsdom
 *
 * The one move rule at the renderer: a move command (`swap-panes`, `insert-adjacent`) and keyboard move mode commit
 * the drag's `after(place).tree` (reconciled as a drop's commit is), and are refused, with no layout change, where a
 * pointer drag to the same place is. jsdom has no layout: the viewport reports 1000×800.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from "@jest/globals";
import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { TilingRenderer } from "../react/tiling-renderer";
import { normalizeLayout } from "../engine/layout-normalize";
import { findLeafById } from "../engine/state";
import { resolveTilingMove, type TilingKeyboardMove } from "../engine/tiling-drag-tree";
import type { TilingCommand, TilingCommandHandle, TilingLayoutConfig, TilingLayoutNode, TilingTile } from "../engine/types";

const CONTAINER = { width: 1000, height: 800 };
const originals: Array<[string, PropertyDescriptor | undefined]> = [];

beforeAll((): void => {
  for (const [name, value] of [["clientWidth", CONTAINER.width], ["clientHeight", CONTAINER.height]] as const) {
    originals.push([name, Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)]);
    Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get: (): number => value });
  }
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: (): void => undefined,
    removeEventListener: (): void => undefined,
  })) as unknown as typeof window.matchMedia;
  const globalScope = globalThis as unknown as { ResizeObserver?: unknown };
  if (typeof globalScope.ResizeObserver === "undefined") {
    globalScope.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
  }
  if (typeof window.requestAnimationFrame !== "function") {
    window.requestAnimationFrame = (callback: FrameRequestCallback): number =>
      window.setTimeout((): void => callback(Date.now()), 0) as unknown as number;
    window.cancelAnimationFrame = (handle: number): void => window.clearTimeout(handle);
  }
});

afterAll((): void => {
  for (const [name, descriptor] of originals) {
    if (descriptor != null) {
      Object.defineProperty(HTMLElement.prototype, name, descriptor);
    }
  }
});

afterEach((): void => {
  cleanup();
});

const leaf = (id: string, tileId: string) => ({ kind: "leaf" as const, id, tileId });
const TILES: ReadonlyArray<TilingTile> = [
  { id: "ta", title: "A" },
  { id: "tb", title: "B" },
  { id: "tc", title: "C" },
];
/** A | (B / C) */
const LAYOUT: TilingLayoutNode = {
  kind: "split",
  id: "root",
  axis: "horizontal",
  ratio: 0.5,
  first: leaf("A", "ta"),
  second: { kind: "split", id: "col", axis: "vertical", ratio: 0.5, first: leaf("B", "tb"), second: leaf("C", "tc") },
};

function mount(config: TilingLayoutConfig): { handle: () => TilingCommandHandle; changes: TilingLayoutNode[] } {
  const ref = React.createRef<TilingCommandHandle>();
  const changes: TilingLayoutNode[] = [];
  const onLayoutChange = jest.fn((next: TilingLayoutNode): void => {
    changes.push(next);
  });
  render(
    <TilingRenderer
      ref={ref}
      layout={LAYOUT}
      tiles={TILES}
      config={config}
      interaction={{ dragRecovery: { enable: false }, customCursor: false, paneSwitching: { showTabStrip: false, showSwitcherOverlay: false } }}
      onLayoutChange={onLayoutChange}
    />,
  );
  // Only what the moves change counts, not a reconcile on mount.
  changes.length = 0;
  return { handle: (): TilingCommandHandle => ref.current!, changes };
}

function dispatch(handle: TilingCommandHandle, command: TilingCommand): void {
  act((): void => {
    handle.dispatch(command);
  });
}

/** What the renderer commits for a move: the move rule's tree, reconciled as a drop's commit is. */
function expected(move: TilingKeyboardMove, config: TilingLayoutConfig): TilingLayoutNode {
  const moved = resolveTilingMove({ layout: LAYOUT, move, container: CONTAINER, config }).layout!;
  return normalizeLayout(moved, {
    containerWidthPx: CONTAINER.width,
    containerHeightPx: CONTAINER.height,
    config,
    expectedTileIds: TILES.map((tile: TilingTile): string => tile.id),
  });
}

describe("one move rule at the renderer", (): void => {
  const roomy: TilingLayoutConfig = { gapPx: 0, handleSizePx: 0, minPaneSizePx: 100 };
  const tight: TilingLayoutConfig = { gapPx: 0, handleSizePx: 0, minPaneSizePx: 450 };

  it("swap-panes commits the drag's after(swap).tree", (): void => {
    const { handle, changes } = mount(roomy);
    dispatch(handle(), { kind: "swap-panes", sourceLeafId: "A", targetLeafId: "C" });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual(expected({ kind: "swap-panes", sourceLeafId: "A", targetLeafId: "C" }, roomy));
    expect(findLeafById(changes[0]!, "C")?.tileId).toBe("ta");
  });

  it("insert-adjacent commits the drag's after(beside).tree, and is refused under the minimum", (): void => {
    const move = { kind: "insert-adjacent", sourceLeafId: "A", targetLeafId: "B", placement: "top" } as const;
    const open = mount(roomy);
    dispatch(open.handle(), move);
    expect(open.changes).toEqual([expected(move, roomy)]);
    cleanup();
    // With A released, B is 400 px tall: no room for two panes of 450 above each other.
    expect(resolveTilingMove({ layout: LAYOUT, move, container: CONTAINER, config: tight }).refusal).not.toBeNull();
    const refused = mount(tight);
    dispatch(refused.handle(), move);
    expect(refused.changes).toEqual([]);
  });

  it("keyboard move mode commits the move rule's tree, and never aims a refused place", (): void => {
    const open = mount(roomy);
    dispatch(open.handle(), { kind: "enter-move-mode", leafId: "A" });
    dispatch(open.handle(), { kind: "move-aim", direction: "right" });
    dispatch(open.handle(), { kind: "commit-move-mode" });
    expect(open.changes).toHaveLength(1);
    // The arrow aims the neighbour to the right, B or C.
    const candidates = ["B", "C"].map((target: string): TilingLayoutNode =>
      expected({ kind: "move-mode", sourceLeafId: "A", targetLeafId: target, placement: "right" }, roomy),
    );
    expect(candidates).toContainEqual(open.changes[0]);
    cleanup();
    // Under a 450 px minimum every place to the right is refused: the aim stays unset, and the commit changes nothing.
    for (const target of ["B", "C"]) {
      expect(
        resolveTilingMove({ layout: LAYOUT, move: { kind: "move-mode", sourceLeafId: "A", targetLeafId: target, placement: "right" }, container: CONTAINER, config: tight })
          .refusal,
      ).not.toBeNull();
    }
    const refused = mount(tight);
    dispatch(refused.handle(), { kind: "enter-move-mode", leafId: "A" });
    dispatch(refused.handle(), { kind: "move-aim", direction: "right" });
    dispatch(refused.handle(), { kind: "commit-move-mode" });
    expect(refused.changes).toEqual([]);
  });
});
