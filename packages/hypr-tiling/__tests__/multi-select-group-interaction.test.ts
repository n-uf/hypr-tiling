/**
 * @jest-environment jsdom
 *
 * Multi-select → group INTERACTION coverage (the renderer DOM layer), closing
 * the gap the pure `multi-selection.test.ts` cannot reach: that the two grouping
 * ENTRY POINTS — the header Group button and the Alt+G keybinding — both fold a
 * multi-selection into ONE usable tabbed group, and that the library renders the
 * group's tab strip EVEN under a custom `renderTile`.
 *
 * Root cause this guards against: a header control button takes DOM focus on
 * pointer-down, and that `focusin` bubbles to the pane article's `onFocus`
 * BEFORE the button's own `click`. If `onFocus` cleared the multi-selection it
 * would re-render and UNMOUNT the Group button (its `isMultiSelected` guard
 * flips false) so the pending click never lands `onGroupMultiSelection` — the
 * "Group button seems to have no trigger" defect. The renderer now ignores
 * header-button focus while a selection is active.
 *
 * jsdom note: the renderer derives geometry from `ResizeObserver` /
 * `getBoundingClientRect` (both inert in jsdom) — so DRAG can't be exercised
 * here — but selection, focus, click, keydown, and the group tab-strip render
 * are all geometry-free and run faithfully. `ResizeObserver` /
 * `requestAnimationFrame` are stubbed so the mount does not throw.
 */
import { afterEach, beforeAll, describe, expect, it } from "@jest/globals";
import * as React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { TilingRenderer } from "../dynamic-tiling-renderer";
import { isMultiSelectModifierActive } from "../multi-selection";
import { collectGroups } from "../state";
import type {
  TilingGroupNode,
  TilingLayoutNode,
  TilingLeafNode,
  TilingRenderTileProps,
  TilingSplitNode,
  TilingTile,
  TilingInteractionCapabilities,
} from "../types";

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

function leaf(id: string): TilingLeafNode {
  return { kind: "leaf", id, tileId: id };
}

function split(
  id: string,
  axis: "horizontal" | "vertical",
  first: TilingLayoutNode,
  second: TilingLayoutNode,
): TilingSplitNode {
  return { kind: "split", id, axis, ratio: 0.5, first, second };
}

// Mirrors the homepage `INITIAL_LAYOUT` shape: `features` (under `mid`) and
// `install` (under `far`) live in DIFFERENT branches — the cross-branch case
// from the reproduction screenshot (03 FEATURES + 05 INSTALL).
function homepageTree(): TilingSplitNode {
  return split(
    "root",
    "horizontal",
    split("intro-col", "vertical", leaf("intro"), leaf("usecases")),
    split(
      "right",
      "horizontal",
      split("mid", "vertical", leaf("features"), leaf("model")),
      split(
        "far",
        "vertical",
        leaf("install"),
        split("far-bottom", "horizontal", leaf("discoverability"), leaf("controls")),
      ),
    ),
  );
}

const TILES: ReadonlyArray<TilingTile> = [
  "intro",
  "usecases",
  "features",
  "model",
  "install",
  "discoverability",
  "controls",
].map((id: string): TilingTile => ({ id, title: id, accent: "amber" }));

// A custom `renderTile` mirroring the homepage `DocTile`'s relevant wiring: an
// `<article>` whose `onFocus` is the renderer-provided handler, a header that
// Alt/Opt-click-toggles multi-selection, and a Group control that dispatches
// `onGroupMultiSelection(leafId)` (this pane is the host slot). This is the path
// the bug report exercised — a custom renderer, not `DefaultTilingTile`.
function renderDocTile(args: TilingRenderTileProps): React.ReactElement {
  const controls: React.ReactNode[] = [];
  if (args.isMultiSelected) {
    controls.push(
      React.createElement(
        "span",
        { key: "check", "data-testid": `check-${args.leafId}` },
        "\u2713",
      ),
    );
  }
  if (args.isMultiSelected && args.canGroupMultiSelection) {
    controls.push(
      React.createElement(
        "button",
        {
          key: "group",
          type: "button",
          "data-testid": `group-${args.leafId}`,
          onPointerDown: (event: React.PointerEvent<HTMLButtonElement>): void => {
            event.stopPropagation();
          },
          onClick: (event: React.MouseEvent<HTMLButtonElement>): void => {
            event.stopPropagation();
            args.onGroupMultiSelection(args.leafId);
          },
        },
        "Group",
      ),
    );
  }
  const header: React.ReactElement = React.createElement(
    "header",
    {
      "data-testid": `header-${args.leafId}`,
      onPointerDown: args.onHandlePointerDown,
      onClick: (event: React.MouseEvent<HTMLElement>): void => {
        if (
          args.isMultiSelectGroupingEnabled &&
          isMultiSelectModifierActive(event)
        ) {
          event.stopPropagation();
          event.preventDefault();
          args.onToggleMultiSelect();
        }
      },
    },
    args.tile.title,
    ...controls,
  );
  return React.createElement(
    "article",
    {
      "data-leaf-id": args.leafId,
      tabIndex: -1,
      onFocus: args.onFocus,
    },
    header,
  );
}

interface HarnessProps {
  onLayout: (layout: TilingLayoutNode) => void;
}

function Harness(props: HarnessProps): React.ReactElement {
  const [layout, setLayout] = React.useState<TilingLayoutNode>(homepageTree());
  const interaction: TilingInteractionCapabilities = {
    paneSwitching: { showContentToggle: false },
  };
  return React.createElement(TilingRenderer, {
    layout,
    tiles: TILES,
    config: { gapPx: 8, minPaneSizePx: 100, handleSizePx: 6 },
    interaction,
    onLayoutChange: (next: TilingLayoutNode): void => {
      setLayout(next);
      props.onLayout(next);
    },
    renderTile: (args: TilingRenderTileProps): React.ReactNode =>
      renderDocTile(args),
  });
}

function query(container: HTMLElement, selector: string): HTMLElement | null {
  return container.querySelector(selector);
}

function requireEl(container: HTMLElement, selector: string): HTMLElement {
  const element: HTMLElement | null = query(container, selector);
  if (element == null) {
    throw new Error(`expected element ${selector} to be present`);
  }
  return element;
}

function selectHeader(container: HTMLElement, leafId: string): void {
  // The multi-select chord is unified on Alt/Opt — an Alt-modified header click
  // toggles selection without changing focus.
  act((): void => {
    fireEvent.click(requireEl(container, `[data-testid="header-${leafId}"]`), {
      altKey: true,
    });
  });
}

describe("header Group button (custom renderTile) folds the multi-selection", (): void => {
  it("survives the focus that the button takes on click, then groups into a tabbed stack", (): void => {
    const layouts: TilingLayoutNode[] = [];
    const { container } = render(
      React.createElement(Harness, {
        onLayout: (layout: TilingLayoutNode): void => {
          layouts.push(layout);
        },
      }),
    );

    selectHeader(container, "features");
    selectHeader(container, "install");

    // Both selected → each shows the ✓ + a Group control.
    expect(query(container, '[data-testid="check-features"]')).not.toBeNull();
    expect(query(container, '[data-testid="check-install"]')).not.toBeNull();
    const groupButton: HTMLElement = requireEl(
      container,
      '[data-testid="group-features"]',
    );

    // Simulate the browser focusing the Group button on pointer-down: `focusin`
    // bubbles to the article `onFocus`. The FIX keeps the selection (and thus
    // the button) intact instead of clearing it out from under the click.
    act((): void => {
      fireEvent.focusIn(groupButton);
    });
    expect(query(container, '[data-testid="group-features"]')).not.toBeNull();

    // Now the click lands the group action.
    act((): void => {
      fireEvent.click(groupButton);
    });

    // The library renders the group tab strip with BOTH members as tabs, even
    // though every pane BODY is painted by the custom `renderTile`.
    const tabStrip: HTMLElement = requireEl(container, ".hpt-group-tab-strip");
    const tabs: NodeListOf<Element> = tabStrip.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(2);

    // And the resulting layout has exactly ONE group of exactly those members.
    const last: TilingLayoutNode = layouts[layouts.length - 1];
    const groups: ReadonlyArray<TilingGroupNode> = collectGroups(last);
    expect(groups.length).toBe(1);
    expect(groups[0].members.map((m: TilingLeafNode): string => m.id)).toEqual([
      "features",
      "install",
    ]);

    // Selection cleared on success → no lingering ✓ badges.
    expect(query(container, '[data-testid="check-features"]')).toBeNull();
  });

  it("hosts the merged group at the CLICKED pane's slot (host first + active)", (): void => {
    const layouts: TilingLayoutNode[] = [];
    const { container } = render(
      React.createElement(Harness, {
        onLayout: (layout: TilingLayoutNode): void => {
          layouts.push(layout);
        },
      }),
    );

    selectHeader(container, "features");
    selectHeader(container, "install");

    // Press the Group button on `install` (NOT `features`): `install` becomes the
    // host — first tab + active member — even though `features` was selected first.
    act((): void => {
      fireEvent.click(requireEl(container, '[data-testid="group-install"]'));
    });

    const last: TilingLayoutNode = layouts[layouts.length - 1];
    const groups: ReadonlyArray<TilingGroupNode> = collectGroups(last);
    expect(groups.length).toBe(1);
    expect(groups[0].members.map((m: TilingLeafNode): string => m.id)).toEqual([
      "install",
      "features",
    ]);
    expect(groups[0].activeMemberId).toBe("install");
  });
});

describe("Alt+G is the keyboard twin of the Group button", (): void => {
  function engage(container: HTMLElement): void {
    // The document-level keydown listener only fires while the instance is
    // "engaged"; a pointer-enter on the root sets that flag without focusing a
    // pane (which would clear the selection).
    const root: HTMLElement = container.firstElementChild as HTMLElement;
    act((): void => {
      fireEvent.pointerEnter(root);
    });
  }

  function pressAltG(): void {
    act((): void => {
      fireEvent.keyDown(document, { code: "KeyG", key: "g", altKey: true });
    });
  }

  it("groups the multi-selection (same group-leaves result) and clears it", (): void => {
    const layouts: TilingLayoutNode[] = [];
    const { container } = render(
      React.createElement(Harness, {
        onLayout: (layout: TilingLayoutNode): void => {
          layouts.push(layout);
        },
      }),
    );
    engage(container);
    selectHeader(container, "features");
    selectHeader(container, "install");

    pressAltG();

    const last: TilingLayoutNode = layouts[layouts.length - 1];
    const groups: ReadonlyArray<TilingGroupNode> = collectGroups(last);
    expect(groups.length).toBe(1);
    expect(groups[0].members.map((m: TilingLeafNode): string => m.id)).toEqual([
      "features",
      "install",
    ]);
    // Selection cleared → no ✓ badges remain.
    expect(query(container, '[data-testid^="check-"]')).toBeNull();
    // The grouped tab strip is rendered (the same visible result as the button).
    expect(query(container, ".hpt-group-tab-strip")).not.toBeNull();
  });

  it("does NOTHING when there is no selection (no fallback to focused+neighbor)", (): void => {
    const layouts: TilingLayoutNode[] = [];
    const { container } = render(
      React.createElement(Harness, {
        onLayout: (layout: TilingLayoutNode): void => {
          layouts.push(layout);
        },
      }),
    );
    engage(container);

    pressAltG();

    // No grouping happened: no layout write, no group node in the DOM.
    expect(layouts.length).toBe(0);
    expect(query(container, ".hpt-group-tab-strip")).toBeNull();
  });
});
