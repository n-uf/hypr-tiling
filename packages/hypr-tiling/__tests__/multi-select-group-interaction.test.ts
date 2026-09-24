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
import { TilingRenderer } from "../react/tiling-renderer";
import { isMultiSelectModifierActive } from "../engine/multi-selection";
import { collectGroups } from "../engine/state";
import type {
  TilingGroupNode,
  TilingLayoutNode,
  TilingLeafNode,
  TilingRenderTileProps,
  TilingSplitNode,
  TilingTile,
  TilingInteractionCapabilities,
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

describe("per-group tab strip governance (grouping.showGroupTabStrip)", (): void => {
  function groupedTree(): TilingLayoutNode {
    const group: TilingGroupNode = {
      kind: "group",
      id: "g1",
      members: [leaf("alpha"), leaf("beta")],
      activeMemberId: "alpha",
    };
    return split("root", "horizontal", group, leaf("loose"));
  }

  const GROUP_TILES: ReadonlyArray<TilingTile> = ["alpha", "beta", "loose"].map(
    (id: string): TilingTile => ({ id, title: id, accent: "amber" }),
  );

  interface GroupHarnessProps {
    interaction?: TilingInteractionCapabilities;
    onLayout?: (layout: TilingLayoutNode) => void;
  }

  function GroupHarness(props: GroupHarnessProps): React.ReactElement {
    const [layout, setLayout] = React.useState<TilingLayoutNode>(groupedTree());
    return React.createElement(TilingRenderer, {
      layout,
      tiles: GROUP_TILES,
      config: { gapPx: 8, minPaneSizePx: 100, handleSizePx: 6 },
      interaction: props.interaction,
      focusedLeafId: "alpha",
      onLayoutChange: (next: TilingLayoutNode): void => {
        setLayout(next);
        props.onLayout?.(next);
      },
      renderTile: (args: TilingRenderTileProps): React.ReactNode =>
        renderDocTile(args),
    });
  }

  it("renders the strip by default (undefined / bare-boolean / object grouping forms)", (): void => {
    for (const interaction of [
      undefined,
      { grouping: true },
      { grouping: {} },
      { grouping: { showGroupTabStrip: true } },
    ] as ReadonlyArray<TilingInteractionCapabilities | undefined>) {
      const { container, unmount } = render(
        React.createElement(GroupHarness, { interaction }),
      );
      const tabStrip: HTMLElement = requireEl(container, ".hpt-group-tab-strip");
      expect(tabStrip.querySelectorAll('[role="tab"]').length).toBe(2);
      unmount();
    }
  });

  it("suppresses the strip under grouping.showGroupTabStrip: false, still rendering the active member only", (): void => {
    const { container } = render(
      React.createElement(GroupHarness, {
        interaction: { grouping: { showGroupTabStrip: false } },
      }),
    );
    expect(query(container, ".hpt-group-tab-strip")).toBeNull();
    // The stacking contract is unchanged: the active member renders, the
    // inactive member does not.
    expect(query(container, '[data-leaf-id="alpha"]')).not.toBeNull();
    expect(query(container, '[data-leaf-id="beta"]')).toBeNull();
  });

  it("keeps the keyboard group commands live with the strip hidden (Alt+K cycles the active member)", (): void => {
    const layouts: TilingLayoutNode[] = [];
    const { container } = render(
      React.createElement(GroupHarness, {
        interaction: { grouping: { showGroupTabStrip: false } },
        onLayout: (layout: TilingLayoutNode): void => {
          layouts.push(layout);
        },
      }),
    );
    // Engage the instance (document-level keydown listener) without focusing.
    act((): void => {
      fireEvent.pointerEnter(container.firstElementChild as HTMLElement);
    });
    // Default `groupTabNext` chord: Alt+K → `group-tab-cycle` next, resolved
    // against the focused member's containing group.
    act((): void => {
      fireEvent.keyDown(document, { code: "KeyK", key: "k", altKey: true });
    });
    const last: TilingLayoutNode = layouts[layouts.length - 1];
    const groups: ReadonlyArray<TilingGroupNode> = collectGroups(last);
    expect(groups.length).toBe(1);
    expect(groups[0].activeMemberId).toBe("beta");
    // The render followed: beta is now the (only) rendered member; still no strip.
    expect(query(container, '[data-leaf-id="beta"]')).not.toBeNull();
    expect(query(container, '[data-leaf-id="alpha"]')).toBeNull();
    expect(query(container, ".hpt-group-tab-strip")).toBeNull();
  });
});

describe("group context on renderTile args (args.group)", (): void => {
  // A 3-member group (so remove-from-group leaves a still-valid 2-member
  // group) + a loose leaf. `gamma` is deliberately ABSENT from the tile map to
  // exercise the `tile: null` arm of the membership view.
  function groupedTree(): TilingLayoutNode {
    const group: TilingGroupNode = {
      kind: "group",
      id: "g1",
      members: [leaf("alpha"), leaf("beta"), leaf("gamma")],
      activeMemberId: "alpha",
    };
    return split("root", "horizontal", group, leaf("loose"));
  }

  const GROUP_TILES: ReadonlyArray<TilingTile> = ["alpha", "beta", "loose"].map(
    (id: string): TilingTile => ({ id, title: `${id} title`, accent: "amber" }),
  );

  interface CaptureHarnessProps {
    argsByLeafId: Map<string, TilingRenderTileProps>;
    onLayout?: (layout: TilingLayoutNode) => void;
  }

  function CaptureHarness(props: CaptureHarnessProps): React.ReactElement {
    const [layout, setLayout] = React.useState<TilingLayoutNode>(groupedTree());
    return React.createElement(TilingRenderer, {
      layout,
      tiles: GROUP_TILES,
      config: { gapPx: 8, minPaneSizePx: 100, handleSizePx: 6 },
      focusedLeafId: "alpha",
      onLayoutChange: (next: TilingLayoutNode): void => {
        setLayout(next);
        props.onLayout?.(next);
      },
      renderTile: (args: TilingRenderTileProps): React.ReactNode => {
        props.argsByLeafId.set(args.leafId, args);
        return renderDocTile(args);
      },
    });
  }

  it("resolves the membership view for the group's active member; loose leaves get null", (): void => {
    const argsByLeafId = new Map<string, TilingRenderTileProps>();
    render(React.createElement(CaptureHarness, { argsByLeafId }));

    const activeArgs: TilingRenderTileProps | undefined =
      argsByLeafId.get("alpha");
    expect(activeArgs?.group).not.toBeNull();
    expect(activeArgs?.group?.groupId).toBe("g1");
    expect(
      activeArgs?.group?.members.map(
        (member): [string, string, number, boolean, string | null] => [
          member.leafId,
          member.tileId,
          member.memberNumber,
          member.isActive,
          member.tile?.title ?? null,
        ],
      ),
    ).toEqual([
      ["alpha", "alpha", 1, true, "alpha title"],
      ["beta", "beta", 2, false, "beta title"],
      // No tile map entry → `tile: null`, membership itself intact.
      ["gamma", "gamma", 3, false, null],
    ]);
    // The loose leaf renders with no group context.
    expect(argsByLeafId.get("loose")?.group).toBeNull();
    // Inactive members never render at all (the stacking contract).
    expect(argsByLeafId.has("beta")).toBe(false);
  });

  it("activateMember dispatches group-tab-jump (active member switches, context follows)", (): void => {
    const argsByLeafId = new Map<string, TilingRenderTileProps>();
    const layouts: TilingLayoutNode[] = [];
    render(
      React.createElement(CaptureHarness, {
        argsByLeafId,
        onLayout: (layout: TilingLayoutNode): void => {
          layouts.push(layout);
        },
      }),
    );
    act((): void => {
      argsByLeafId.get("alpha")?.group?.activateMember(2);
    });
    const groups: ReadonlyArray<TilingGroupNode> = collectGroups(
      layouts[layouts.length - 1],
    );
    expect(groups[0].activeMemberId).toBe("beta");
    // The context re-keys onto the NEW active member with fresh isActive flags.
    const betaArgs: TilingRenderTileProps | undefined = argsByLeafId.get("beta");
    expect(betaArgs?.group?.members[0].isActive).toBe(false);
    expect(betaArgs?.group?.members[1].isActive).toBe(true);
  });

  it("removeMember dispatches remove-from-group (the member re-seats as a loose pane)", (): void => {
    const argsByLeafId = new Map<string, TilingRenderTileProps>();
    const layouts: TilingLayoutNode[] = [];
    render(
      React.createElement(CaptureHarness, {
        argsByLeafId,
        onLayout: (layout: TilingLayoutNode): void => {
          layouts.push(layout);
        },
      }),
    );
    act((): void => {
      argsByLeafId.get("alpha")?.group?.removeMember("beta");
    });
    const groups: ReadonlyArray<TilingGroupNode> = collectGroups(
      layouts[layouts.length - 1],
    );
    expect(groups.length).toBe(1);
    expect(
      groups[0].members.map((member: TilingLeafNode): string => member.id),
    ).toEqual(["alpha", "gamma"]);
    // Beta re-seated as a loose pane → renders with `group: null`.
    expect(argsByLeafId.get("beta")?.group).toBeNull();
  });

  it("ungroup dispatches ungroup (the whole group dissolves into loose panes)", (): void => {
    const argsByLeafId = new Map<string, TilingRenderTileProps>();
    const layouts: TilingLayoutNode[] = [];
    render(
      React.createElement(CaptureHarness, {
        argsByLeafId,
        onLayout: (layout: TilingLayoutNode): void => {
          layouts.push(layout);
        },
      }),
    );
    act((): void => {
      argsByLeafId.get("alpha")?.group?.ungroup();
    });
    const last: TilingLayoutNode = layouts[layouts.length - 1];
    expect(collectGroups(last).length).toBe(0);
    // All former members render as loose panes with no group context.
    expect(argsByLeafId.get("alpha")?.group).toBeNull();
    expect(argsByLeafId.get("beta")?.group).toBeNull();
    expect(argsByLeafId.get("gamma")?.group).toBeNull();
  });
});

describe("onClearMultiSelection clears the whole selection from host chrome", (): void => {
  function engage(container: HTMLElement): void {
    const root: HTMLElement = container.firstElementChild as HTMLElement;
    act((): void => {
      fireEvent.pointerEnter(root);
    });
  }

  function pressEscape(): void {
    act((): void => {
      fireEvent.keyDown(document, { code: "Escape", key: "Escape" });
    });
  }

  interface CaptureHarnessProps {
    argsByLeafId: Map<string, TilingRenderTileProps>;
    onRenderTile?: () => void;
  }

  function CaptureHarness(props: CaptureHarnessProps): React.ReactElement {
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
      },
      renderTile: (args: TilingRenderTileProps): React.ReactNode => {
        props.onRenderTile?.();
        props.argsByLeafId.set(args.leafId, args);
        return renderDocTile(args);
      },
    });
  }

  function allPaneArgs(
    argsByLeafId: Map<string, TilingRenderTileProps>,
  ): TilingRenderTileProps[] {
    return [
      "intro",
      "usecases",
      "features",
      "model",
      "install",
      "discoverability",
      "controls",
    ]
      .map((leafId: string): TilingRenderTileProps | undefined =>
        argsByLeafId.get(leafId),
      )
      .filter(
        (args: TilingRenderTileProps | undefined): args is TilingRenderTileProps =>
          args != null,
      );
  }

  it("clears every isMultiSelected and canGroupMultiSelection after two panes are toggled", (): void => {
    const argsByLeafId = new Map<string, TilingRenderTileProps>();
    const { container } = render(
      React.createElement(CaptureHarness, { argsByLeafId }),
    );

    selectHeader(container, "features");
    selectHeader(container, "install");

    expect(query(container, '[data-testid="check-features"]')).not.toBeNull();
    expect(query(container, '[data-testid="check-install"]')).not.toBeNull();
    expect(argsByLeafId.get("features")?.canGroupMultiSelection).toBe(true);

    act((): void => {
      argsByLeafId.get("model")?.onClearMultiSelection();
    });

    for (const args of allPaneArgs(argsByLeafId)) {
      expect(args.isMultiSelected).toBe(false);
      expect(args.canGroupMultiSelection).toBe(false);
    }
    expect(query(container, '[data-testid^="check-"]')).toBeNull();
  });

  it("exposes the same stable callback on every pane (shared clearMultiSelection)", (): void => {
    const argsByLeafId = new Map<string, TilingRenderTileProps>();
    render(React.createElement(CaptureHarness, { argsByLeafId }));

    const featuresClear = argsByLeafId.get("features")?.onClearMultiSelection;
    const modelClear = argsByLeafId.get("model")?.onClearMultiSelection;
    expect(featuresClear).toBe(modelClear);
    expect(typeof featuresClear).toBe("function");
  });

  it("is a no-op when nothing is selected (no extra renderTile pass)", (): void => {
    const argsByLeafId = new Map<string, TilingRenderTileProps>();
    let renderTileCalls = 0;
    render(
      React.createElement(CaptureHarness, {
        argsByLeafId,
        onRenderTile: (): void => {
          renderTileCalls += 1;
        },
      }),
    );
    const callsAfterMount: number = renderTileCalls;

    act((): void => {
      argsByLeafId.get("model")?.onClearMultiSelection();
    });

    expect(renderTileCalls).toBe(callsAfterMount);
  });

  it("Escape still clears an active multi-selection (regression)", (): void => {
    const argsByLeafId = new Map<string, TilingRenderTileProps>();
    const { container } = render(
      React.createElement(CaptureHarness, { argsByLeafId }),
    );
    engage(container);
    selectHeader(container, "features");
    selectHeader(container, "install");
    expect(query(container, '[data-testid="check-features"]')).not.toBeNull();

    pressEscape();

    for (const args of allPaneArgs(argsByLeafId)) {
      expect(args.isMultiSelected).toBe(false);
    }
    expect(query(container, '[data-testid^="check-"]')).toBeNull();
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

describe("built-in group tab strip", (): void => {
  function groupedTree(): TilingLayoutNode {
    const group: TilingGroupNode = {
      kind: "group",
      id: "g1",
      members: [leaf("alpha"), leaf("beta")],
      activeMemberId: "alpha",
    };
    return split("root", "horizontal", group, leaf("loose"));
  }

  const GROUP_TILES: ReadonlyArray<TilingTile> = ["alpha", "beta", "loose"].map(
    (id: string): TilingTile => ({ id, title: id, accent: "amber" }),
  );

  function StripHarness(props: {
    interaction?: TilingInteractionCapabilities;
    onLayout?: (layout: TilingLayoutNode) => void;
  }): React.ReactElement {
    const [layout, setLayout] = React.useState<TilingLayoutNode>(groupedTree());
    return React.createElement(TilingRenderer, {
      layout,
      tiles: GROUP_TILES,
      config: { gapPx: 8, minPaneSizePx: 100, handleSizePx: 6 },
      interaction: props.interaction,
      focusedLeafId: "alpha",
      onLayoutChange: (next: TilingLayoutNode): void => {
        setLayout(next);
        props.onLayout?.(next);
      },
      renderTile: (args: TilingRenderTileProps): React.ReactNode => renderDocTile(args),
    });
  }

  it("renders a tablist for a group of two or more and truncates labels", (): void => {
    const { container } = render(React.createElement(StripHarness, {}));
    const strip: HTMLElement = requireEl(container, ".hpt-group-tab-strip");
    expect(strip.getAttribute("role")).toBe("tablist");
    expect(strip.getAttribute("data-hpt-group-tab-placement")).toBe("top");
    const tabs: NodeListOf<HTMLElement> = strip.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(2);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].getAttribute("aria-selected")).toBe("false");
    expect(tabs[0].getAttribute("title")).toBe("alpha");
    expect(tabs[0].getAttribute("data-member-index")).toBe("0");
    expect(tabs[1].getAttribute("data-member-index")).toBe("1");
    const label: HTMLElement | null = tabs[0].querySelector("span");
    expect(label?.style.textOverflow).toBe("ellipsis");
    expect(tabs[0].style.transition).toContain("box-shadow");
    expect(query(container, "[data-hpt-group-eject]")).not.toBeNull();
    expect(query(container, "[data-hpt-group-ungroup]")).not.toBeNull();
    const box: HTMLElement = requireEl(container, "[data-hpt-group-content-box]");
    expect(box.style.height).toBe("calc(100% - 28px)");
    expect(strip.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it("moves activation with arrow keys", (): void => {
    const layouts: TilingLayoutNode[] = [];
    const { container } = render(
      React.createElement(StripHarness, {
        onLayout: (layout: TilingLayoutNode): void => {
          layouts.push(layout);
        },
      }),
    );
    const first: HTMLElement = requireEl(container, '[role="tab"][data-member-index="0"]');
    act((): void => {
      fireEvent.keyDown(first, { key: "ArrowRight" });
    });
    const last: TilingLayoutNode = layouts[layouts.length - 1];
    expect(collectGroups(last)[0].activeMemberId).toBe("beta");
    const selected: HTMLElement = requireEl(container, '[role="tab"][aria-selected="true"]');
    expect(selected.getAttribute("data-member-index")).toBe("1");
  });

  it("ejects the active member and ungroups, and hides both controls when flagged off", (): void => {
    const ejectLayouts: TilingLayoutNode[] = [];
    const ejected = render(
      React.createElement(StripHarness, {
        onLayout: (layout: TilingLayoutNode): void => {
          ejectLayouts.push(layout);
        },
      }),
    );
    act((): void => {
      fireEvent.click(requireEl(ejected.container, "[data-hpt-group-eject]"));
    });
    expect(collectGroups(ejectLayouts[ejectLayouts.length - 1]).length).toBe(0);
    ejected.unmount();

    const ungroupLayouts: TilingLayoutNode[] = [];
    const ungrouped = render(
      React.createElement(StripHarness, {
        onLayout: (layout: TilingLayoutNode): void => {
          ungroupLayouts.push(layout);
        },
      }),
    );
    act((): void => {
      fireEvent.click(requireEl(ungrouped.container, "[data-hpt-group-ungroup]"));
    });
    expect(collectGroups(ungroupLayouts[ungroupLayouts.length - 1]).length).toBe(0);
    ungrouped.unmount();

    const hidden = render(
      React.createElement(StripHarness, {
        interaction: {
          grouping: {
            groupTabStrip: { showEject: false, showUngroup: false },
          },
        },
      }),
    );
    expect(query(hidden.container, "[data-hpt-group-eject]")).toBeNull();
    expect(query(hidden.container, "[data-hpt-group-ungroup]")).toBeNull();
    expect(query(hidden.container, ".hpt-group-tab-strip")).not.toBeNull();
    hidden.unmount();
  });

  it("places the strip under the body and shrinks the content box by the strip height", (): void => {
    const { container } = render(
      React.createElement(StripHarness, {
        interaction: {
          grouping: { groupTabStrip: { placement: "bottom", height: 40 } },
        },
      }),
    );
    const strip: HTMLElement = requireEl(container, ".hpt-group-tab-strip");
    const box: HTMLElement = requireEl(container, "[data-hpt-group-content-box]");
    expect(strip.getAttribute("data-hpt-group-tab-placement")).toBe("bottom");
    expect(box.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(box.style.height).toBe("calc(100% - 40px)");
    expect(strip.style.height).toBe("40px");
  });

  it("writes theme tokens onto the strip element", (): void => {
    const { container } = render(
      React.createElement(StripHarness, {
        interaction: {
          grouping: {
            groupTabStrip: {
              theme: { accent: "rgb(1, 2, 3)", background: "rgb(9, 9, 9)" },
            },
          },
        },
      }),
    );
    const strip: HTMLElement = requireEl(container, ".hpt-group-tab-strip");
    expect(strip.style.getPropertyValue("--hpt-group-tab-accent")).toBe("rgb(1, 2, 3)");
    expect(strip.style.getPropertyValue("--hpt-group-tab-strip-background")).toBe("rgb(9, 9, 9)");
    expect(strip.style.background).toBe("rgb(9, 9, 9)");
  });

  it("drops the active-indicator transition under prefers-reduced-motion", (): void => {
    const original: typeof window.matchMedia | undefined = window.matchMedia;
    window.matchMedia = ((query: string): MediaQueryList =>
      ({
        matches: query.includes("reduce"),
        media: query,
        onchange: null,
        addEventListener: (): void => {},
        removeEventListener: (): void => {},
        addListener: (): void => {},
        removeListener: (): void => {},
        dispatchEvent: (): boolean => false,
      }) as MediaQueryList);
    const { container, unmount } = render(React.createElement(StripHarness, {}));
    const strip: HTMLElement = requireEl(container, ".hpt-group-tab-strip");
    expect(strip.getAttribute("data-hpt-reduced-motion")).toBe("true");
    const active: HTMLElement = requireEl(container, '[role="tab"][aria-selected="true"]');
    // jsdom drops an inline `transition: none` back to an empty string, which
    // is the same as no transition. Either reading means the indicator is still.
    expect(active.style.transition === "none" || active.style.transition === "").toBe(true);
    unmount();
    window.matchMedia = original;
  });
});
