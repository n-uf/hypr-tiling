/**
 * @jest-environment jsdom
 *
 * Maximize + pane-strip interaction: `maximize.keepGroupTabStrip` keeps the
 * group chrome when a group member fills the viewport, and
 * `paneSwitching.showTabStrip` / `tabStrip` drive the top-level pane strip
 * (including `"maximized"`-only mode). Geometry-free: ResizeObserver /
 * requestAnimationFrame are stubbed so mount does not throw.
 */
import { afterEach, beforeAll, describe, expect, it } from "@jest/globals";
import * as React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { TilingRenderer } from "../react/tiling-renderer";
import type { TilingThemeId } from "../react/theme";
import { collectGroups } from "../engine/state";
import type {
  TilingCommandHandle,
  TilingGroupNode,
  TilingInteractionCapabilities,
  TilingLayoutNode,
  TilingLeafNode,
  TilingPaneTab,
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

function groupedTree(activeMemberId: string = "alpha"): TilingLayoutNode {
  const group: TilingGroupNode = {
    kind: "group",
    id: "g1",
    members: [leaf("alpha"), leaf("beta")],
    activeMemberId,
  };
  return split("root", "horizontal", group, leaf("loose"));
}

const TILES: ReadonlyArray<TilingTile> = ["alpha", "beta", "loose"].map(
  (id: string): TilingTile => ({ id, title: id, accent: "amber" }),
);

function renderPane(args: TilingRenderTileProps): React.ReactElement {
  return React.createElement(
    "article",
    { "data-leaf-id": args.leafId, "data-testid": `pane-${args.leafId}` },
    args.tile.title,
  );
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

function paneIds(container: HTMLElement): ReadonlyArray<string> {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-testid^='pane-']")).map(
    (element: HTMLElement): string => element.getAttribute("data-testid") ?? "",
  );
}

interface HarnessProps {
  interaction?: TilingInteractionCapabilities;
  initialLayout?: TilingLayoutNode;
  maximizedLeafId?: string | null;
  focusedLeafId?: string;
  onLayout?: (layout: TilingLayoutNode) => void;
  onMaximizedLeafChange?: (leafId: string | null) => void;
  onThemeChange?: (themeId: TilingThemeId) => void;
  handleRef?: React.Ref<TilingCommandHandle>;
}

function Harness(props: HarnessProps): React.ReactElement {
  const [layout, setLayout] = React.useState<TilingLayoutNode>(
    props.initialLayout ?? groupedTree(),
  );
  const [maximizedLeafId, setMaximizedLeafId] = React.useState<string | null>(
    props.maximizedLeafId === undefined ? null : props.maximizedLeafId,
  );
  return React.createElement(TilingRenderer, {
    ref: props.handleRef,
    layout,
    tiles: TILES,
    config: { gapPx: 8, minPaneSizePx: 100, handleSizePx: 6 },
    interaction: props.interaction,
    focusedLeafId: props.focusedLeafId ?? "alpha",
    maximizedLeafId,
    onMaximizedLeafChange: (leafId: string | null): void => {
      setMaximizedLeafId(leafId);
      props.onMaximizedLeafChange?.(leafId);
    },
    onLayoutChange: (next: TilingLayoutNode): void => {
      setLayout(next);
      props.onLayout?.(next);
    },
    onThemeChange: props.onThemeChange,
    renderTile: (args: TilingRenderTileProps): React.ReactNode => renderPane(args),
  });
}

function maximize(handleRef: React.RefObject<TilingCommandHandle | null>, leafId: string): void {
  act((): void => {
    handleRef.current?.dispatch({ kind: "maximize", leafId });
  });
}

describe("maximize.keepGroupTabStrip", (): void => {
  it("keeps the group strip and only the maximized member when a group member is maximized", (): void => {
    const handleRef: React.RefObject<TilingCommandHandle | null> =
      React.createRef<TilingCommandHandle>();
    const { container } = render(
      React.createElement(Harness, {
        handleRef,
        interaction: { paneSwitching: { showTabStrip: false } },
      }),
    );
    maximize(handleRef, "alpha");
    const strip: HTMLElement = requireEl(container, ".hpt-group-tab-strip");
    expect(strip.querySelectorAll('[role="tab"]').length).toBe(2);
    expect(paneIds(container)).toEqual(["pane-alpha"]);
    expect(query(container, "[data-testid='pane-beta']")).toBeNull();
    expect(query(container, "[data-testid='pane-loose']")).toBeNull();
  });

  it("clicking the other group tab updates the maximized leaf and writes one layout with the new active member", (): void => {
    const handleRef: React.RefObject<TilingCommandHandle | null> =
      React.createRef<TilingCommandHandle>();
    const layouts: TilingLayoutNode[] = [];
    const maximized: Array<string | null> = [];
    const { container } = render(
      React.createElement(Harness, {
        handleRef,
        interaction: { paneSwitching: { showTabStrip: false } },
        onLayout: (layout: TilingLayoutNode): void => {
          layouts.push(layout);
        },
        onMaximizedLeafChange: (leafId: string | null): void => {
          maximized.push(leafId);
        },
      }),
    );
    maximize(handleRef, "alpha");
    const beforeClick: number = layouts.length;
    act((): void => {
      fireEvent.click(requireEl(container, '.hpt-group-tab-strip [role="tab"][data-member-index="1"]'));
    });
    expect(maximized[maximized.length - 1]).toBe("beta");
    expect(layouts.length).toBe(beforeClick + 1);
    expect(collectGroups(layouts[layouts.length - 1])[0].activeMemberId).toBe("beta");
    expect(paneIds(container)).toEqual(["pane-beta"]);
  });

  it("eject and ungroup still dispatch and keep the maximized leaf", (): void => {
    const handleRef: React.RefObject<TilingCommandHandle | null> =
      React.createRef<TilingCommandHandle>();
    const maximized: Array<string | null> = [];
    const ejectLayouts: TilingLayoutNode[] = [];
    const eject = render(
      React.createElement(Harness, {
        handleRef,
        interaction: { paneSwitching: { showTabStrip: false } },
        onLayout: (layout: TilingLayoutNode): void => {
          ejectLayouts.push(layout);
        },
        onMaximizedLeafChange: (leafId: string | null): void => {
          maximized.push(leafId);
        },
      }),
    );
    maximize(handleRef, "alpha");
    act((): void => {
      fireEvent.click(requireEl(eject.container, "[data-hpt-group-eject]"));
    });
    expect(maximized[maximized.length - 1]).toBe("alpha");
    expect(collectGroups(ejectLayouts[ejectLayouts.length - 1]).length).toBe(0);
    expect(query(eject.container, "[data-testid='pane-alpha']")).not.toBeNull();
    eject.unmount();

    const ungroupHandle: React.RefObject<TilingCommandHandle | null> =
      React.createRef<TilingCommandHandle>();
    const ungroupMaximized: Array<string | null> = [];
    const ungroupLayouts: TilingLayoutNode[] = [];
    const ungrouped = render(
      React.createElement(Harness, {
        handleRef: ungroupHandle,
        interaction: { paneSwitching: { showTabStrip: false } },
        onLayout: (layout: TilingLayoutNode): void => {
          ungroupLayouts.push(layout);
        },
        onMaximizedLeafChange: (leafId: string | null): void => {
          ungroupMaximized.push(leafId);
        },
      }),
    );
    maximize(ungroupHandle, "alpha");
    act((): void => {
      fireEvent.click(requireEl(ungrouped.container, "[data-hpt-group-ungroup]"));
    });
    expect(collectGroups(ungroupLayouts[ungroupLayouts.length - 1]).length).toBe(0);
    expect(ungroupMaximized[ungroupMaximized.length - 1]).toBe("alpha");
    expect(query(ungrouped.container, "[data-testid='pane-alpha']")).not.toBeNull();
  });

  it("hides the group strip when keepGroupTabStrip is false", (): void => {
    const handleRef: React.RefObject<TilingCommandHandle | null> =
      React.createRef<TilingCommandHandle>();
    const { container } = render(
      React.createElement(Harness, {
        handleRef,
        interaction: {
          maximize: { keepGroupTabStrip: false },
          paneSwitching: { showTabStrip: false },
        },
      }),
    );
    maximize(handleRef, "alpha");
    expect(query(container, ".hpt-group-tab-strip")).toBeNull();
    expect(paneIds(container)).toEqual(["pane-alpha"]);
  });

  it("hides the group strip when grouping.showGroupTabStrip is false", (): void => {
    const handleRef: React.RefObject<TilingCommandHandle | null> =
      React.createRef<TilingCommandHandle>();
    const { container } = render(
      React.createElement(Harness, {
        handleRef,
        interaction: {
          grouping: { showGroupTabStrip: false },
          paneSwitching: { showTabStrip: false },
        },
      }),
    );
    maximize(handleRef, "alpha");
    expect(query(container, ".hpt-group-tab-strip")).toBeNull();
    expect(paneIds(container)).toEqual(["pane-alpha"]);
  });

  it("maximizing an inactive member paints that member and selects its group tab", (): void => {
    const handleRef: React.RefObject<TilingCommandHandle | null> =
      React.createRef<TilingCommandHandle>();
    const { container } = render(
      React.createElement(Harness, {
        handleRef,
        initialLayout: groupedTree("alpha"),
        interaction: { paneSwitching: { showTabStrip: true } },
      }),
    );
    maximize(handleRef, "beta");
    expect(paneIds(container)).toEqual(["pane-beta"]);
    const groupSelected: HTMLElement = requireEl(
      container,
      '.hpt-group-tab-strip [role="tab"][aria-selected="true"]',
    );
    expect(groupSelected.getAttribute("data-member-index")).toBe("1");
    expect(groupSelected.getAttribute("title")).toBe("beta");
    const paneStrip: HTMLElement = requireEl(container, ".hpt-pane-tab-strip");
    const paneSelected: HTMLElement = requireEl(
      paneStrip,
      '[role="tab"][aria-selected="true"]',
    );
    expect(paneSelected.getAttribute("title")).toBe("beta");
  });
});

describe("paneSwitching.showTabStrip and tabStrip", (): void => {
  it("hides the pane strip at rest and shows it while maximized under \"maximized\"", (): void => {
    const handleRef: React.RefObject<TilingCommandHandle | null> =
      React.createRef<TilingCommandHandle>();
    const { container } = render(
      React.createElement(Harness, {
        handleRef,
        interaction: { paneSwitching: { showTabStrip: "maximized" } },
      }),
    );
    expect(query(container, ".hpt-pane-tab-strip")).toBeNull();
    maximize(handleRef, "loose");
    const strip: HTMLElement = requireEl(container, ".hpt-pane-tab-strip");
    expect(strip.querySelectorAll('[role="tab"]').length).toBe(2);
  });

  it("renders a group as one pane tab and clicking it while maximized switches the maximized leaf", (): void => {
    const handleRef: React.RefObject<TilingCommandHandle | null> =
      React.createRef<TilingCommandHandle>();
    const maximized: Array<string | null> = [];
    const { container } = render(
      React.createElement(Harness, {
        handleRef,
        interaction: { paneSwitching: { showTabStrip: "maximized" } },
        onMaximizedLeafChange: (leafId: string | null): void => {
          maximized.push(leafId);
        },
      }),
    );
    maximize(handleRef, "loose");
    const strip: HTMLElement = requireEl(container, ".hpt-pane-tab-strip");
    const tabs: NodeListOf<HTMLElement> = strip.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(2);
    expect(Array.from(tabs).map((tab: HTMLElement): string => tab.getAttribute("title") ?? "")).toEqual(
      ["alpha", "loose"],
    );
    act((): void => {
      fireEvent.click(tabs[0]);
    });
    expect(maximized[maximized.length - 1]).toBe("alpha");
    expect(paneIds(container)).toEqual(["pane-alpha"]);
    expect(strip.querySelectorAll('[role="tab"]').length).toBe(2);
  });

  it("applies renderTabLabel and theme tokens as CSS custom properties", (): void => {
    const handleRef: React.RefObject<TilingCommandHandle | null> =
      React.createRef<TilingCommandHandle>();
    const { container } = render(
      React.createElement(Harness, {
        handleRef,
        interaction: {
          paneSwitching: {
            showTabStrip: "maximized",
            tabStrip: {
              theme: { accent: "rgb(1, 2, 3)", background: "rgb(9, 9, 9)" },
              renderTabLabel: (tab: TilingPaneTab): string => `lbl:${tab.title}`,
            },
          },
        },
      }),
    );
    maximize(handleRef, "loose");
    const strip: HTMLElement = requireEl(container, ".hpt-pane-tab-strip");
    expect(strip.classList.contains("hpt-tab-strip")).toBe(true);
    expect(strip.style.getPropertyValue("--hpt-group-tab-accent")).toBe("rgb(1, 2, 3)");
    expect(strip.style.getPropertyValue("--hpt-group-tab-strip-background")).toBe("rgb(9, 9, 9)");
    expect(strip.textContent).toContain("lbl:loose");
  });

  it("placement bottom orders the strip after the viewport", (): void => {
    const handleRef: React.RefObject<TilingCommandHandle | null> =
      React.createRef<TilingCommandHandle>();
    const { container } = render(
      React.createElement(Harness, {
        handleRef,
        interaction: {
          paneSwitching: {
            showTabStrip: "maximized",
            tabStrip: { placement: "bottom" },
          },
        },
      }),
    );
    maximize(handleRef, "loose");
    const strip: HTMLElement = requireEl(container, ".hpt-pane-tab-strip");
    const viewport: HTMLElement = requireEl(container, "[data-hpt-viewport]");
    expect(strip.getAttribute("data-hpt-pane-tab-placement")).toBe("bottom");
    expect(viewport.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it("showTabStrip false hides the pane strip at rest and while maximized", (): void => {
    const handleRef: React.RefObject<TilingCommandHandle | null> =
      React.createRef<TilingCommandHandle>();
    const { container } = render(
      React.createElement(Harness, {
        handleRef,
        interaction: { paneSwitching: { showTabStrip: false } },
      }),
    );
    expect(query(container, ".hpt-pane-tab-strip")).toBeNull();
    maximize(handleRef, "loose");
    expect(query(container, ".hpt-pane-tab-strip")).toBeNull();
  });

  it("showTabStrip true keeps the strip at rest and shows lab chrome when theme hooks are present", (): void => {
    const { container } = render(
      React.createElement(Harness, {
        interaction: { paneSwitching: { showTabStrip: true } },
        onThemeChange: (_themeId: TilingThemeId): void => {},
      }),
    );
    expect(query(container, ".hpt-pane-tab-strip")).not.toBeNull();
    expect(query(container, '[aria-label="hypr tiling title"]')?.textContent).toBe("HYPR TILING");
    expect(query(container, '[aria-label="renderer theme"]')).not.toBeNull();
  });
});
