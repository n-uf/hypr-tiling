/**
 * @jest-environment jsdom
 *
 * Headless workspace tab strip (`useTilingWorkspaceTabs` /
 * `TilingWorkspaceTabs`, `_agent/workspace-set-concept.md` §5.4): WAI-ARIA
 * `tablist` / `tab` semantics, roving focus, the keyboard model (arrows /
 * Home / End / Enter / F2 / Delete), rename + close affordances, theme
 * `workspaceTab*` tokens, and the drop-target wiring — the renderer's
 * `resolveExternalDragHover` hit-tests the registered tab rects so a leaf
 * dragged over a tab lands in that workspace with no host hit-test.
 */
import { afterEach, beforeAll, describe, expect, it, jest } from "@jest/globals";
import * as React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { TilingRenderer } from "../react/tiling-renderer";
import { resolveTilingTheme, type TilingTheme } from "../react/theme";
import {
  TilingWorkspaceTabs,
  useTilingWorkspaceTabs,
  type TilingWorkspaceTab,
  type UseTilingWorkspaceTabsOptions,
  type UseTilingWorkspaceTabsResult,
} from "../react/workspace-tabs";
import { resolveWorkspaceTabKey } from "../engine/workspace-tabs";
import { queryWorkspaceSet, type TilingWorkspace, type TilingWorkspaceSet } from "../engine/workspace-set";
import type {
  TilingLayoutNode,
  TilingLeafNode,
  TilingRenderTileProps,
  TilingTile,
  TilingWorkspaceSwitchEvent,
} from "../engine/types";

const PANE_RECT: DOMRect = {
  x: 10,
  y: 100,
  left: 10,
  top: 100,
  right: 210,
  bottom: 250,
  width: 200,
  height: 150,
  toJSON: (): Record<string, number> => ({}),
};

function tabRect(index: number): DOMRect {
  const left: number = index * 100;
  return {
    x: left,
    y: 0,
    left,
    top: 0,
    right: left + 100,
    bottom: 30,
    width: 100,
    height: 30,
    toJSON: (): Record<string, number> => ({}),
  };
}

beforeAll((): void => {
  const globalScope = globalThis as unknown as {
    ResizeObserver?: unknown;
    PointerEvent?: typeof PointerEvent;
  };
  if (typeof globalScope.ResizeObserver === "undefined") {
    class StubResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    globalScope.ResizeObserver = StubResizeObserver;
  }
  if (typeof globalScope.PointerEvent === "undefined") {
    class StubPointerEvent extends MouseEvent {
      readonly pointerId: number;
      readonly pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
        this.pointerType = init.pointerType ?? "mouse";
      }
    }
    globalScope.PointerEvent = StubPointerEvent as unknown as typeof PointerEvent;
  }
  if (typeof window.requestAnimationFrame !== "function") {
    window.requestAnimationFrame = (callback: FrameRequestCallback): number =>
      window.setTimeout((): void => callback(Date.now()), 0) as unknown as number;
    window.cancelAnimationFrame = (handle: number): void =>
      window.clearTimeout(handle);
  }
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect(): DOMRect {
    return PANE_RECT;
  };
});

afterEach((): void => {
  cleanup();
});

function leaf(id: string): TilingLeafNode {
  return { kind: "leaf", id: `leaf:${id}`, tileId: id };
}

const TILES: ReadonlyArray<TilingTile> = ["a", "b", "c"].map(
  (id: string): TilingTile => ({ id, title: id, accent: "amber" }),
);

const MAIN_LAYOUT: TilingLayoutNode = {
  kind: "split",
  id: "main-root",
  axis: "horizontal",
  ratio: 0.5,
  first: leaf("a"),
  second: leaf("b"),
};

function threeWorkspaces(activeId: string = "main"): TilingWorkspaceSet {
  return {
    workspaces: [
      { id: "main", name: "Main", layout: MAIN_LAYOUT },
      { id: "ops", name: "Ops", layout: leaf("c") },
      { id: "spare", name: "Spare", layout: null },
    ],
    activeId,
  };
}

/** Renders a bare strip through the render-prop form; captures the latest hook result. */
function Strip(
  props: Omit<UseTilingWorkspaceTabsOptions, "workspaces" | "onWorkspacesChange"> & {
    workspaces: TilingWorkspaceSet;
    onWorkspacesChange: (next: TilingWorkspaceSet) => void;
    capture?: (result: UseTilingWorkspaceTabsResult) => void;
  },
): React.ReactElement {
  const { capture, ...options } = props;
  return React.createElement(TilingWorkspaceTabs, {
    ...options,
    children: (result: UseTilingWorkspaceTabsResult): React.ReactNode => {
      capture?.(result);
      return React.createElement(
        "div",
        result.tablistProps,
        result.tabs.map((tab: TilingWorkspaceTab): React.ReactElement =>
          React.createElement("button", { key: tab.workspace.id, ...tab.tabProps }, tab.workspace.name),
        ),
      );
    },
  });
}

function tabElements(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
}

function tabByWorkspace(container: HTMLElement, workspaceId: string): HTMLButtonElement {
  const element: HTMLButtonElement | null = container.querySelector<HTMLButtonElement>(
    `[role="tab"][data-workspace-id="${workspaceId}"]`,
  );
  if (element == null) {
    throw new Error(`no tab for ${workspaceId}`);
  }
  return element;
}

describe("resolveWorkspaceTabKey — pure keyboard model", (): void => {
  it("arrows wrap along the orientation axis; Home / End jump", (): void => {
    expect(resolveWorkspaceTabKey("ArrowRight", 0, 3)).toEqual({ kind: "focus", index: 1 });
    expect(resolveWorkspaceTabKey("ArrowRight", 2, 3)).toEqual({ kind: "focus", index: 0 });
    expect(resolveWorkspaceTabKey("ArrowLeft", 0, 3)).toEqual({ kind: "focus", index: 2 });
    expect(resolveWorkspaceTabKey("Home", 2, 3)).toEqual({ kind: "focus", index: 0 });
    expect(resolveWorkspaceTabKey("End", 0, 3)).toEqual({ kind: "focus", index: 2 });
    // Vertical strips ignore the horizontal arrows and vice versa.
    expect(resolveWorkspaceTabKey("ArrowRight", 0, 3, "vertical")).toBeNull();
    expect(resolveWorkspaceTabKey("ArrowDown", 0, 3, "vertical")).toEqual({ kind: "focus", index: 1 });
    expect(resolveWorkspaceTabKey("ArrowUp", 0, 3, "vertical")).toEqual({ kind: "focus", index: 2 });
  });

  it("Enter / Space activate; F2 renames; Delete closes; other keys and empty strips are null", (): void => {
    expect(resolveWorkspaceTabKey("Enter", 1, 3)).toEqual({ kind: "activate" });
    expect(resolveWorkspaceTabKey(" ", 1, 3)).toEqual({ kind: "activate" });
    expect(resolveWorkspaceTabKey("F2", 1, 3)).toEqual({ kind: "rename" });
    expect(resolveWorkspaceTabKey("Delete", 1, 3)).toEqual({ kind: "close" });
    expect(resolveWorkspaceTabKey("a", 1, 3)).toBeNull();
    expect(resolveWorkspaceTabKey("Tab", 1, 3)).toBeNull();
    expect(resolveWorkspaceTabKey("ArrowRight", 0, 0)).toBeNull();
    // An out-of-range focused index is clamped before stepping.
    expect(resolveWorkspaceTabKey("ArrowRight", 9, 3)).toEqual({ kind: "focus", index: 0 });
  });
});

describe("useTilingWorkspaceTabs — semantics and roving focus", (): void => {
  it("emits tablist / tab roles, aria wiring, and a single tabIndex 0 on the active tab", (): void => {
    const holder: { result: UseTilingWorkspaceTabsResult | null } = { result: null };
    const { container } = render(
      React.createElement(Strip, {
        workspaces: threeWorkspaces("ops"),
        onWorkspacesChange: (): void => {},
        capture: (result: UseTilingWorkspaceTabsResult): void => {
          holder.result = result;
        },
      }),
    );
    const tablist: HTMLElement | null = container.querySelector('[role="tablist"]');
    expect(tablist?.getAttribute("aria-orientation")).toBe("horizontal");
    expect(tablist?.className).toBe("");
    const tabs: HTMLButtonElement[] = tabElements(container);
    expect(tabs.map((tab: HTMLButtonElement): string => tab.id)).toEqual([
      "hpt-workspace-tab-main",
      "hpt-workspace-tab-ops",
      "hpt-workspace-tab-spare",
    ]);
    expect(tabs.map((tab: HTMLButtonElement): string | null => tab.getAttribute("aria-selected"))).toEqual([
      "false",
      "true",
      "false",
    ]);
    expect(tabs.map((tab: HTMLButtonElement): number => tab.tabIndex)).toEqual([-1, 0, -1]);
    expect(tabs[1].getAttribute("aria-controls")).toBe("hpt-workspace-panel-ops");
    expect(tabs[1].hasAttribute("data-active")).toBe(true);
    expect(tabs[0].hasAttribute("data-active")).toBe(false);
    // Headless: no classes unless the theme supplies tokens.
    expect(tabs[1].getAttribute("class")).toBeNull();
    const result: UseTilingWorkspaceTabsResult | null = holder.result;
    expect(result?.activeTab?.workspace.id).toBe("ops");
    expect(result?.panelProps("ops")).toEqual({
      role: "tabpanel",
      id: "hpt-workspace-panel-ops",
      "aria-labelledby": "hpt-workspace-tab-ops",
      hidden: false,
    });
    expect(result?.panelProps("main").hidden).toBe(true);
  });

  it("click activates; arrows move focus without activating (manual); Enter activates the focused tab", (): void => {
    const onWorkspacesChange = jest.fn((_next: TilingWorkspaceSet): void => {});
    const { container } = render(
      React.createElement(Strip, { workspaces: threeWorkspaces("main"), onWorkspacesChange }),
    );
    fireEvent.click(tabByWorkspace(container, "ops"));
    expect(onWorkspacesChange).toHaveBeenCalledTimes(1);
    expect(onWorkspacesChange.mock.calls[0][0].activeId).toBe("ops");
    // Clicking the already-active tab is a no-op (same set reference → no emit).
    fireEvent.click(tabByWorkspace(container, "main"));
    expect(onWorkspacesChange).toHaveBeenCalledTimes(1);

    const main: HTMLButtonElement = tabByWorkspace(container, "main");
    act((): void => {
      main.focus();
    });
    fireEvent.keyDown(main, { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabByWorkspace(container, "ops"));
    expect(tabElements(container).map((tab: HTMLButtonElement): number => tab.tabIndex)).toEqual([-1, 0, -1]);
    expect(onWorkspacesChange).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(tabByWorkspace(container, "ops"), { key: "End" });
    expect(document.activeElement).toBe(tabByWorkspace(container, "spare"));
    fireEvent.keyDown(tabByWorkspace(container, "spare"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabByWorkspace(container, "main"));
    fireEvent.keyDown(tabByWorkspace(container, "main"), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tabByWorkspace(container, "spare"));
    fireEvent.keyDown(tabByWorkspace(container, "spare"), { key: "Home" });
    expect(document.activeElement).toBe(tabByWorkspace(container, "main"));
    fireEvent.keyDown(tabByWorkspace(container, "main"), { key: "ArrowRight" });
    fireEvent.keyDown(tabByWorkspace(container, "ops"), { key: "Enter" });
    expect(onWorkspacesChange).toHaveBeenCalledTimes(2);
    expect(onWorkspacesChange.mock.calls[1][0].activeId).toBe("ops");
  });

  it("automatic activation switches as focus moves", (): void => {
    const onWorkspacesChange = jest.fn((_next: TilingWorkspaceSet): void => {});
    const { container } = render(
      React.createElement(Strip, {
        workspaces: threeWorkspaces("main"),
        onWorkspacesChange,
        activation: "automatic",
      }),
    );
    fireEvent.keyDown(tabByWorkspace(container, "main"), { key: "ArrowRight" });
    expect(onWorkspacesChange).toHaveBeenCalledTimes(1);
    expect(onWorkspacesChange.mock.calls[0][0].activeId).toBe("ops");
  });

  it("rename / close affordances fire on F2 / Delete only when wired; tab.rename / tab.close commit", (): void => {
    const onWorkspacesChange = jest.fn((_next: TilingWorkspaceSet): void => {});
    const onRenameRequest = jest.fn((_workspace: TilingWorkspace): void => {});
    const onCloseRequest = jest.fn((_workspace: TilingWorkspace): void => {});
    const holder: { result: UseTilingWorkspaceTabsResult | null } = { result: null };
    const view = render(
      React.createElement(Strip, {
        workspaces: threeWorkspaces("main"),
        onWorkspacesChange,
        capture: (result: UseTilingWorkspaceTabsResult): void => {
          holder.result = result;
        },
      }),
    );
    // Not wired: the keys are not handled (no preventDefault, no callback).
    const unhandledRename: boolean = fireEvent.keyDown(tabByWorkspace(view.container, "ops"), { key: "F2" });
    expect(unhandledRename).toBe(true);
    view.rerender(
      React.createElement(Strip, {
        workspaces: threeWorkspaces("main"),
        onWorkspacesChange,
        onRenameRequest,
        onCloseRequest,
        capture: (result: UseTilingWorkspaceTabsResult): void => {
          holder.result = result;
        },
      }),
    );
    const handledRename: boolean = fireEvent.keyDown(tabByWorkspace(view.container, "ops"), { key: "F2" });
    expect(handledRename).toBe(false);
    expect(onRenameRequest).toHaveBeenCalledWith(threeWorkspaces().workspaces[1]);
    fireEvent.keyDown(tabByWorkspace(view.container, "ops"), { key: "Delete" });
    expect(onCloseRequest).toHaveBeenCalledWith(threeWorkspaces().workspaces[1]);

    const result: UseTilingWorkspaceTabsResult | null = holder.result;
    const ops: TilingWorkspaceTab | undefined = result?.tabs[1];
    expect(ops?.rename("  Operations ")).toBe(true);
    expect(onWorkspacesChange.mock.calls.at(-1)?.[0].workspaces[1].name).toBe("Operations");
    expect(ops?.rename("")).toBe(false);
    ops?.requestRename();
    expect(onRenameRequest).toHaveBeenCalledTimes(2);
    const closed = ops?.close();
    expect(closed?.removedTileIds).toEqual(["c"]);
    expect(
      onWorkspacesChange.mock.calls.at(-1)?.[0].workspaces.map((workspace: TilingWorkspace): string => workspace.id),
    ).toEqual(["main", "spare"]);
    expect(result?.create({ id: "ops", name: "Ops" })).toBe(false);
    expect(result?.create({ id: "qa", name: "QA" })).toBe(true);
    expect(onWorkspacesChange.mock.calls.at(-1)?.[0].workspaces.at(-1)?.id).toBe("qa");
  });

  it("composes the theme workspaceTab* tokens; the strip stays unstyled without them", (): void => {
    const theme: TilingTheme = {
      ...resolveTilingTheme(undefined),
      workspaceTabs: "flex gap-1",
      workspaceTab: "px-2",
      workspaceTabActive: "font-bold",
      workspaceTabDropTarget: "ring-2",
    };
    const { container } = render(
      React.createElement(Strip, {
        workspaces: threeWorkspaces("ops"),
        onWorkspacesChange: (): void => {},
        theme,
      }),
    );
    expect(container.querySelector('[role="tablist"]')?.className).toBe("flex gap-1");
    expect(tabByWorkspace(container, "main").className).toBe("px-2");
    expect(tabByWorkspace(container, "ops").className).toBe("px-2 font-bold");
  });
});

describe("useTilingWorkspaceTabs — native drop target through the renderer", (): void => {
  interface HostProps {
    initial: TilingWorkspaceSet;
    onSet: (next: TilingWorkspaceSet) => void;
    followMovedLeaf?: boolean;
    onMoveLeaf?: (leafId: string, fromWorkspaceId: string, toWorkspaceId: string) => void;
    onWorkspaceSwitch?: (event: TilingWorkspaceSwitchEvent) => void;
    mounts?: Map<string, number>;
  }

  /** Counts `pane`-surface mounts per tile; the header is the drag handle like the default tile. */
  function CountedPane({ args, mounts }: { args: TilingRenderTileProps; mounts: Map<string, number> }): React.ReactElement {
    const isPane: boolean = args.surface === "pane";
    React.useEffect((): void => {
      // Ghost / overlay surfaces mount their own copies during a drag; only the placed pane counts.
      if (isPane) mounts.set(args.tile.id, (mounts.get(args.tile.id) ?? 0) + 1);
    }, [args.tile.id, isPane, mounts]);
    return React.createElement(
      "article",
      {
        "data-leaf-id": args.leafId,
        "data-tile-id": args.tile.id,
        "data-surface": args.surface,
        onFocus: args.onFocus,
        onPointerMove: args.onPointerMove,
        onPointerLeave: args.onPointerLeave,
      },
      React.createElement("header", { onPointerDown: args.onHandlePointerDown }, args.tile.title),
    );
  }

  function Host({
    initial,
    onSet,
    followMovedLeaf = false,
    onMoveLeaf,
    onWorkspaceSwitch,
    mounts,
  }: HostProps): React.ReactElement {
    const [set, setSet] = React.useState<TilingWorkspaceSet>(initial);
    const tabs: UseTilingWorkspaceTabsResult = useTilingWorkspaceTabs({
      workspaces: set,
      onWorkspacesChange: (next: TilingWorkspaceSet): void => {
        setSet(next);
        onSet(next);
      },
    });
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        "div",
        tabs.tablistProps,
        tabs.tabs.map((tab: TilingWorkspaceTab): React.ReactElement =>
          React.createElement("button", { key: tab.workspace.id, ...tab.tabProps }, tab.workspace.name),
        ),
      ),
      React.createElement(TilingRenderer, {
        workspaces: set,
        onWorkspacesChange: (next: TilingWorkspaceSet): void => {
          setSet(next);
          onSet(next);
        },
        tiles: TILES,
        config: { gapPx: 8, minPaneSizePx: 100, handleSizePx: 6 },
        dragGhostMode: "auto",
        paneIdentity: "stable",
        interaction: {
          dragRecovery: { enable: false },
          paneSwitching: { showTabStrip: false, showSwitcherOverlay: false },
          workspaces: { enable: true, followMovedLeaf },
        },
        onMoveLeaf,
        onWorkspaceSwitch,
        renderTile:
          mounts == null
            ? undefined
            : (args: TilingRenderTileProps): React.ReactNode =>
                React.createElement(CountedPane, { key: args.tile.id, args, mounts }),
        ...tabs.rendererProps,
      }),
    );
  }

  async function flushFrames(): Promise<void> {
    await act(async (): Promise<void> => {
      await new Promise<void>((resolve: (value: void) => void): void => {
        window.requestAnimationFrame((): void => {
          window.requestAnimationFrame((): void => {
            resolve();
          });
        });
      });
    });
  }

  function dispatchPointer(target: EventTarget, type: string, init: PointerEventInit): void {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: "mouse",
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
        ...init,
      }),
    );
  }

  it("dragging a pane over a tab marks it as drop target; release moves the leaf into that workspace", async (): Promise<void> => {
    const onSet = jest.fn((_next: TilingWorkspaceSet): void => {});
    const { container } = render(React.createElement(Host, { initial: threeWorkspaces("main"), onSet }));
    // Tabs sit in a 0..300 × 0..30 strip; panes are the global stub rect below it.
    tabElements(container).forEach((tab: HTMLButtonElement, index: number): void => {
      tab.getBoundingClientRect = (): DOMRect => tabRect(index);
    });
    const header: HTMLElement | null = container.querySelector('article[data-leaf-id="leaf:a"] header');
    if (header == null) {
      throw new Error("expected default-tile header for leaf:a");
    }
    await act(async (): Promise<void> => {
      dispatchPointer(header, "pointerdown", { clientX: 20, clientY: 120 });
    });
    await flushFrames();
    await act(async (): Promise<void> => {
      dispatchPointer(window, "pointermove", { clientX: 40, clientY: 140 });
    });
    await flushFrames();
    expect(document.querySelector("[data-drag-ghost][data-drag-ghost-mode='footprint']")).not.toBeNull();
    expect(tabByWorkspace(container, "ops").hasAttribute("data-drop-target")).toBe(false);

    // Over the `ops` tab: the strip reports the target, the ghost collapses to the chip.
    await act(async (): Promise<void> => {
      dispatchPointer(window, "pointermove", { clientX: 150, clientY: 15 });
    });
    await flushFrames();
    expect(tabByWorkspace(container, "ops").hasAttribute("data-drop-target")).toBe(true);
    expect(tabByWorkspace(container, "main").hasAttribute("data-drop-target")).toBe(false);
    const chip: HTMLElement | null = document.querySelector("[data-drag-ghost-chip][data-drag-ghost-mode='compact']");
    expect(chip?.getAttribute("data-drag-ghost-target")).toBe("hpt-workspace-tab-ops");
    expect(chip?.getAttribute("data-drag-ghost-workspace")).toBe("ops");

    // Back off the strip: the target clears and the footprint ghost returns.
    await act(async (): Promise<void> => {
      dispatchPointer(window, "pointermove", { clientX: 150, clientY: 200 });
    });
    await flushFrames();
    expect(tabByWorkspace(container, "ops").hasAttribute("data-drop-target")).toBe(false);
    expect(document.querySelector("[data-drag-ghost][data-drag-ghost-mode='footprint']")).not.toBeNull();

    // Release over `spare` (an EMPTY workspace): the leaf becomes its root.
    await act(async (): Promise<void> => {
      dispatchPointer(window, "pointerup", { clientX: 250, clientY: 15 });
    });
    await flushFrames();
    expect(onSet).toHaveBeenCalled();
    const next: TilingWorkspaceSet = onSet.mock.calls.at(-1)?.[0] as TilingWorkspaceSet;
    expect(next.activeId).toBe("main");
    expect(queryWorkspaceSet(next).workspacesOfLeaf("leaf:a")).toEqual(["spare"]);
    expect(next.workspaces[2].layout).toEqual(leaf("a"));
    expect(next.workspaces[0].layout).toEqual(leaf("b"));
    expect(document.querySelector("[data-drag-cancel]")).toBeNull();
    // Settle clears the resolved hover.
    expect(tabByWorkspace(container, "spare").hasAttribute("data-drop-target")).toBe(false);
  });

  it("followMovedLeaf: release on a tab moves AND switches in one commit; the moved pane keeps its mount", async (): Promise<void> => {
    const onSet = jest.fn((_next: TilingWorkspaceSet): void => {});
    const onMoveLeaf = jest.fn((_leafId: string, _from: string, _to: string): void => {});
    const onWorkspaceSwitch = jest.fn((_event: TilingWorkspaceSwitchEvent): void => {});
    const mounts: Map<string, number> = new Map<string, number>();
    const { container } = render(
      React.createElement(Host, {
        initial: threeWorkspaces("main"),
        onSet,
        followMovedLeaf: true,
        onMoveLeaf,
        onWorkspaceSwitch,
        mounts,
      }),
    );
    tabElements(container).forEach((tab: HTMLButtonElement, index: number): void => {
      tab.getBoundingClientRect = (): DOMRect => tabRect(index);
    });
    expect(mounts.get("a")).toBe(1);
    const header: HTMLElement | null = container.querySelector('article[data-leaf-id="leaf:a"] header');
    if (header == null) {
      throw new Error("expected counted-pane header for leaf:a");
    }
    await act(async (): Promise<void> => {
      dispatchPointer(header, "pointerdown", { clientX: 20, clientY: 120 });
    });
    await flushFrames();
    await act(async (): Promise<void> => {
      dispatchPointer(window, "pointermove", { clientX: 40, clientY: 140 });
    });
    await flushFrames();
    await act(async (): Promise<void> => {
      dispatchPointer(window, "pointermove", { clientX: 250, clientY: 15 });
    });
    await flushFrames();
    await act(async (): Promise<void> => {
      dispatchPointer(window, "pointerup", { clientX: 250, clientY: 15 });
    });
    await flushFrames();

    // One commit carries both the move and the switch.
    expect(onSet).toHaveBeenCalledTimes(1);
    const next: TilingWorkspaceSet = onSet.mock.calls.at(-1)?.[0] as TilingWorkspaceSet;
    expect(next.activeId).toBe("spare");
    expect(queryWorkspaceSet(next).workspacesOfLeaf("leaf:a")).toEqual(["spare"]);
    expect(onMoveLeaf).toHaveBeenCalledWith("leaf:a", "main", "spare");
    expect(onWorkspaceSwitch).toHaveBeenCalledWith({ from: "main", to: "spare", via: "tab-drop" });
    // The pane travelled with the switch: same mount, now painted in `spare`.
    expect(mounts.get("a")).toBe(1);
    expect(container.querySelector('article[data-leaf-id="leaf:a"]')).not.toBeNull();
    expect(container.querySelector('article[data-leaf-id="leaf:b"]')).toBeNull();
  });
});
