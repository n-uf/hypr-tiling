/**
 * @jest-environment jsdom
 *
 * Stable pane identity (`paneIdentity: "stable"`, the default on a client-only
 * mount): a pane's React instance survives the layout edits a drag → drop →
 * settle produces — an INSERT drop (the leaf moves to another branch; React's
 * positional reconciliation of the recursive split tree would otherwise
 * unmount + remount it) and a SWAP drop (`swapLeafTiles` hands each leaf the
 * other tile; each slot-bound instance would otherwise receive the other
 * tile's props) — with NO remount of host content. The contrast case pins the
 * legacy `"slot"` mode's remount so the assertion is known to be load-bearing.
 *
 * jsdom note: geometry is inert here so the pointer drag itself cannot run; the
 * settle result (the host applying the layout the drop reported through
 * `onLayoutChange`) is the exact re-render this exercises. The per-tile
 * instance identity is observed three ways: a mount counter (`useEffect([])`),
 * a `useRef` instance token, and a `useState` value set before the edit.
 */
import { afterEach, beforeAll, describe, expect, it } from "@jest/globals";
import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { TilingRenderer } from "../react/tiling-renderer";
import {
  resolvePaneIdentityMode,
  resolveStablePanePoolOrder,
} from "../react/tiling-renderer";
import { insertLeafAdjacent, swapLeafTiles } from "../engine/state";
import type {
  TilingLayoutNode,
  TilingLeafNode,
  TilingPaneIdentityMode,
  TilingRenderTileProps,
  TilingSplitNode,
  TilingTile,
} from "../engine/types";

beforeAll((): void => {
  const globalScope = globalThis as unknown as {
    ResizeObserver?: unknown;
  };
  if (typeof globalScope.ResizeObserver === "undefined") {
    class StubResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    globalScope.ResizeObserver = StubResizeObserver;
  }
  if (typeof window.requestAnimationFrame !== "function") {
    window.requestAnimationFrame = (callback: FrameRequestCallback): number =>
      window.setTimeout((): void => callback(Date.now()), 0) as unknown as number;
    window.cancelAnimationFrame = (handle: number): void =>
      window.clearTimeout(handle);
  }
});

afterEach((): void => {
  cleanup();
});

function leaf(id: string, tileId: string = id): TilingLeafNode {
  return { kind: "leaf", id, tileId };
}

function split(
  id: string,
  axis: "horizontal" | "vertical",
  first: TilingLayoutNode,
  second: TilingLayoutNode,
): TilingSplitNode {
  return { kind: "split", id, axis, ratio: 0.5, first, second };
}

const TILES: ReadonlyArray<TilingTile> = ["a", "b", "c"].map(
  (id: string): TilingTile => ({ id, title: id, accent: "amber" }),
);

// a | (b / c)
function initialLayout(): TilingSplitNode {
  return split(
    "root",
    "horizontal",
    leaf("a"),
    split("right", "vertical", leaf("b"), leaf("c")),
  );
}

/** Per-tile instance observations, keyed by tile id. */
interface PaneObservation {
  mounts: number;
  instanceToken: object | null;
  counter: number;
  setCounter: ((next: number) => void) | null;
  leafId: string | null;
}

function createObservations(): Map<string, PaneObservation> {
  const observations: Map<string, PaneObservation> = new Map<
    string,
    PaneObservation
  >();
  for (const tile of TILES) {
    observations.set(tile.id, {
      mounts: 0,
      instanceToken: null,
      counter: 0,
      setCounter: null,
      leafId: null,
    });
  }
  return observations;
}

/**
 * A host pane whose instance identity is observable: mount counter, a
 * `useRef` token that is unique per instance, and `useState` the test bumps
 * before the layout edit.
 */
function ObservedPane({
  args,
  observations,
}: {
  args: TilingRenderTileProps;
  observations: Map<string, PaneObservation>;
}): React.ReactElement {
  const tokenRef = React.useRef<object>({});
  const [counter, setCounter] = React.useState<number>(0);
  const observation: PaneObservation | undefined = observations.get(
    args.tile.id,
  );
  React.useEffect((): void => {
    if (observation != null) {
      observation.mounts += 1;
    }
  }, [observation]);
  if (observation != null) {
    observation.instanceToken = tokenRef.current;
    observation.counter = counter;
    observation.setCounter = setCounter;
    observation.leafId = args.leafId;
  }
  return React.createElement(
    "article",
    {
      "data-leaf-id": args.leafId,
      "data-tile-id": args.tile.id,
      "data-surface": args.surface,
      tabIndex: 0,
      onFocus: args.onFocus,
    },
    React.createElement("header", null, args.tile.title),
    React.createElement("div", { "data-counter": counter }, String(counter)),
  );
}

function Harness({
  layout,
  paneIdentity,
  observations,
}: {
  layout: TilingLayoutNode;
  paneIdentity: TilingPaneIdentityMode;
  observations: Map<string, PaneObservation>;
}): React.ReactElement {
  return React.createElement(TilingRenderer, {
    layout,
    tiles: TILES,
    config: { gapPx: 8, minPaneSizePx: 100, handleSizePx: 6 },
    onLayoutChange: (): void => {},
    paneIdentity,
    renderTile: (args: TilingRenderTileProps): React.ReactNode =>
      React.createElement(ObservedPane, {
        key: args.tile.id,
        args,
        observations,
      }),
  });
}

function paneArticle(container: HTMLElement, tileId: string): HTMLElement {
  const article: HTMLElement | null = container.querySelector<HTMLElement>(
    `article[data-tile-id="${tileId}"][data-surface="pane"]`,
  );
  if (article == null) {
    throw new Error(`pane article for tile ${tileId} not rendered`);
  }
  return article;
}

describe("stable pane identity across drag → drop → settle layout edits", (): void => {
  it("an INSERT drop (leaf moves to another branch) keeps every pane instance, state, and DOM node", (): void => {
    const observations: Map<string, PaneObservation> = createObservations();
    const { container, rerender } = render(
      React.createElement(Harness, {
        layout: initialLayout(),
        paneIdentity: "stable",
        observations,
      }),
    );
    // Every pane mounted exactly once and was PLACED into its slot in the tree
    // (the article sits inside the registered slot wrapper, not in the pool).
    for (const tile of TILES) {
      expect(observations.get(tile.id)?.mounts).toBe(1);
      const article: HTMLElement = paneArticle(container, tile.id);
      expect(
        article.closest(`[data-hpt-pane-slot="${tile.id}"]`),
      ).not.toBeNull();
      expect(article.closest("[data-hpt-pane-pool]")).toBeNull();
    }
    const tokensBefore: Map<string, object | null> = new Map<string, object | null>(
      TILES.map((tile: TilingTile): [string, object | null] => [
        tile.id,
        observations.get(tile.id)?.instanceToken ?? null,
      ]),
    );
    const nodesBefore: Map<string, HTMLElement> = new Map<string, HTMLElement>(
      TILES.map((tile: TilingTile): [string, HTMLElement] => [
        tile.id,
        paneArticle(container, tile.id),
      ]),
    );
    // Host-side state set BEFORE the drop must survive the settle.
    act((): void => {
      observations.get("a")?.setCounter?.(7);
    });
    expect(paneArticle(container, "a").querySelector("[data-counter]")?.textContent).toBe("7");

    // The settle: `a` dropped BELOW `c` — `a` leaves the root's first arm and
    // lands in a brand-new split under the right branch (a different tree
    // position at a different depth; the classic positional-remount case).
    const afterInsert: TilingLayoutNode = insertLeafAdjacent(
      initialLayout(),
      "a",
      "c",
      "bottom",
    );
    expect(afterInsert).not.toEqual(initialLayout());
    rerender(
      React.createElement(Harness, {
        layout: afterInsert,
        paneIdentity: "stable",
        observations,
      }),
    );

    for (const tile of TILES) {
      const observation: PaneObservation | undefined = observations.get(tile.id);
      expect(observation?.mounts).toBe(1);
      expect(observation?.instanceToken).toBe(tokensBefore.get(tile.id));
      // Same DOM node, now living in its (possibly new) slot in the tree.
      const article: HTMLElement = paneArticle(container, tile.id);
      expect(article).toBe(nodesBefore.get(tile.id));
      expect(
        article.closest(`[data-hpt-pane-slot="${tile.id}"]`),
      ).not.toBeNull();
      expect(article.closest("[data-hpt-pane-pool]")).toBeNull();
    }
    expect(observations.get("a")?.counter).toBe(7);
    expect(paneArticle(container, "a").querySelector("[data-counter]")?.textContent).toBe("7");
    // The moved pane's article is under the renderer viewport (measurement +
    // survivor-reflow selectors are viewport/root scoped).
    expect(
      paneArticle(container, "a").closest("[data-hpt-pane-slot]")?.parentElement,
    ).not.toBeNull();
  });

  it("a SWAP drop (leaves exchange tile ids) keeps each TILE's instance and moves it to the other slot", (): void => {
    const observations: Map<string, PaneObservation> = createObservations();
    const { container, rerender } = render(
      React.createElement(Harness, {
        layout: initialLayout(),
        paneIdentity: "stable",
        observations,
      }),
    );
    const tokenA: object | null = observations.get("a")?.instanceToken ?? null;
    const tokenB: object | null = observations.get("b")?.instanceToken ?? null;
    const nodeA: HTMLElement = paneArticle(container, "a");
    const nodeB: HTMLElement = paneArticle(container, "b");
    expect(observations.get("a")?.leafId).toBe("a");
    expect(observations.get("b")?.leafId).toBe("b");

    const swapped: TilingLayoutNode = swapLeafTiles(initialLayout(), "a", "b");
    rerender(
      React.createElement(Harness, {
        layout: swapped,
        paneIdentity: "stable",
        observations,
      }),
    );

    // Same instances + DOM nodes, each now seated in the OTHER leaf's slot.
    expect(observations.get("a")?.mounts).toBe(1);
    expect(observations.get("b")?.mounts).toBe(1);
    expect(observations.get("a")?.instanceToken).toBe(tokenA);
    expect(observations.get("b")?.instanceToken).toBe(tokenB);
    expect(paneArticle(container, "a")).toBe(nodeA);
    expect(paneArticle(container, "b")).toBe(nodeB);
    expect(observations.get("a")?.leafId).toBe("b");
    expect(observations.get("b")?.leafId).toBe("a");
    expect(nodeA.getAttribute("data-leaf-id")).toBe("b");
    expect(nodeB.getAttribute("data-leaf-id")).toBe("a");
    // Slot wrappers now register the swapped tiles.
    expect(nodeA.closest('[data-hpt-pane-slot="a"]')).not.toBeNull();
    expect(nodeB.closest('[data-hpt-pane-slot="b"]')).not.toBeNull();
  });

  it("removing a tile unmounts only that pane; the survivors keep their instances", (): void => {
    const observations: Map<string, PaneObservation> = createObservations();
    const { container, rerender } = render(
      React.createElement(Harness, {
        layout: initialLayout(),
        paneIdentity: "stable",
        observations,
      }),
    );
    const tokenB: object | null = observations.get("b")?.instanceToken ?? null;
    rerender(
      React.createElement(Harness, {
        // `a` gone: the remaining right branch becomes the root.
        layout: split("right", "vertical", leaf("b"), leaf("c")),
        paneIdentity: "stable",
        observations,
      }),
    );
    expect(
      container.querySelector('article[data-tile-id="a"]'),
    ).toBeNull();
    expect(observations.get("b")?.mounts).toBe(1);
    expect(observations.get("b")?.instanceToken).toBe(tokenB);
    // The pool holds no orphaned node.
    const pool: HTMLElement | null = container.querySelector<HTMLElement>(
      "[data-hpt-pane-pool]",
    );
    expect(pool).not.toBeNull();
    expect(pool?.childElementCount).toBe(0);
  });

  it("CONTRAST — legacy `paneIdentity: \"slot\"` remounts the moved pane on the same insert (the defect stable mode removes)", (): void => {
    const observations: Map<string, PaneObservation> = createObservations();
    const { container, rerender } = render(
      React.createElement(Harness, {
        layout: initialLayout(),
        paneIdentity: "slot",
        observations,
      }),
    );
    expect(container.querySelector("[data-hpt-pane-pool]")).toBeNull();
    const tokenA: object | null = observations.get("a")?.instanceToken ?? null;
    rerender(
      React.createElement(Harness, {
        layout: insertLeafAdjacent(initialLayout(), "a", "c", "bottom"),
        paneIdentity: "slot",
        observations,
      }),
    );
    expect(observations.get("a")?.mounts).toBe(2);
    expect(observations.get("a")?.instanceToken).not.toBe(tokenA);
  });

  it("`auto` resolves to stable on a client-only mount (jsdom render) and to slot when hydrating", (): void => {
    expect(resolvePaneIdentityMode("auto", true)).toBe("stable");
    expect(resolvePaneIdentityMode("auto", false)).toBe("slot");
    expect(resolvePaneIdentityMode("stable", false)).toBe("stable");
    expect(resolvePaneIdentityMode("slot", true)).toBe("slot");

    const observations: Map<string, PaneObservation> = createObservations();
    const { container } = render(
      React.createElement(Harness, {
        layout: initialLayout(),
        paneIdentity: "auto",
        observations,
      }),
    );
    expect(container.querySelector("[data-hpt-pane-pool]")).not.toBeNull();
    expect(
      paneArticle(container, "a").closest('[data-hpt-pane-slot="a"]'),
    ).not.toBeNull();
  });

  it("survives React.StrictMode's double-invoked effects (relocate → park → relocate) without orphaning a node", (): void => {
    const observations: Map<string, PaneObservation> = createObservations();
    const { container, rerender } = render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(Harness, {
          layout: initialLayout(),
          paneIdentity: "stable",
          observations,
        }),
      ),
    );
    const mountsAfterInitial: number = observations.get("a")?.mounts ?? 0;
    const tokenA: object | null = observations.get("a")?.instanceToken ?? null;
    const nodeA: HTMLElement = paneArticle(container, "a");
    rerender(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(Harness, {
          layout: insertLeafAdjacent(initialLayout(), "a", "c", "bottom"),
          paneIdentity: "stable",
          observations,
        }),
      ),
    );
    expect(observations.get("a")?.mounts).toBe(mountsAfterInitial);
    expect(observations.get("a")?.instanceToken).toBe(tokenA);
    expect(paneArticle(container, "a")).toBe(nodeA);
    expect(nodeA.closest('[data-hpt-pane-slot="a"]')).not.toBeNull();
    expect(
      container.querySelector("[data-hpt-pane-pool]")?.childElementCount,
    ).toBe(0);
    expect(container.querySelectorAll('article[data-tile-id="a"]').length).toBe(1);
  });

  it("pool order is append-only: survivors keep their relative order, newcomers append, departed tiles drop", (): void => {
    expect(
      resolveStablePanePoolOrder([], new Set<string>(["a", "b", "c"])),
    ).toEqual(["a", "b", "c"]);
    // A reorder in the TREE never reorders the pool (React must never
    // `insertBefore` against a relocated sibling).
    expect(
      resolveStablePanePoolOrder(["a", "b", "c"], new Set<string>(["c", "a", "b"])),
    ).toEqual(["a", "b", "c"]);
    expect(
      resolveStablePanePoolOrder(["a", "b", "c"], new Set<string>(["c", "d", "a"])),
    ).toEqual(["a", "c", "d"]);
  });
});
