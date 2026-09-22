/**
 * @jest-environment jsdom
 *
 * Native workspace-tab drop target (`_agent/workspace-set-concept.md` §5.5,
 * H3): a `kind: "workspace-tab"` `externalDragHover` settles the drag through
 * the 26.9.2 claim-before-settle path with the ENGINE applying
 * `moveLeafToWorkspace` — the host neither hit-tests nor claims. jsdom
 * geometry is stubbed the same way as `compact-drag-ghost.test.ts` so a
 * pointer-driven pickup crosses the 6px threshold and mounts the overlays.
 */
import { afterEach, beforeAll, describe, expect, it, jest } from "@jest/globals";
import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { TilingRenderer } from "../react/tiling-renderer";
import { resolveTilingTheme, type TilingTheme } from "../react/theme";
import {
  queryWorkspaceSet,
  type TilingWorkspace,
  type TilingWorkspaceSet,
  type TilingWorkspaceSetQuery,
} from "../engine/workspace-set";
import {
  clientRectContains,
  resolveWorkspaceTabHover,
  type TilingWorkspaceTabTarget,
} from "../engine/workspace-tabs";
import type {
  TilingExternalDragHover,
  TilingGhostChipContext,
  TilingLayoutNode,
  TilingLeafNode,
  TilingOnExternalDrop,
  TilingRendererWorkspaceSetProps,
  TilingTile,
  TilingWorkspaceTabDragHover,
} from "../engine/types";

const TILES: ReadonlyArray<TilingTile> = [
  { id: "a", title: "alpha", accent: "amber" },
  { id: "b", title: "beta", accent: "cyan" },
  { id: "c", title: "gamma", accent: "amber" },
];

function leaf(id: string): TilingLeafNode {
  return { kind: "leaf", id: `leaf:${id}`, tileId: id };
}

const MAIN_LAYOUT: TilingLayoutNode = {
  kind: "split",
  id: "main-root",
  axis: "horizontal",
  ratio: 0.5,
  first: leaf("a"),
  second: leaf("b"),
};

function twoWorkspaces(): TilingWorkspaceSet {
  return {
    workspaces: [
      { id: "main", name: "Main", layout: MAIN_LAYOUT },
      { id: "ops", name: "Ops", layout: leaf("c") },
    ],
    activeId: "main",
  };
}

const TAB_HOVER: TilingWorkspaceTabDragHover = {
  kind: "workspace-tab",
  targetId: "tab:ops",
  workspaceId: "ops",
  point: { x: 320, y: 24 },
};

const PANE_RECT: DOMRect = {
  x: 10,
  y: 10,
  left: 10,
  top: 10,
  right: 210,
  bottom: 160,
  width: 200,
  height: 150,
  toJSON: (): Record<string, number> => ({}),
};

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

type SetHarnessProps = Partial<
  Omit<TilingRendererWorkspaceSetProps, "tiles" | "config" | "workspaces" | "onWorkspacesChange">
> & {
  workspaces?: TilingWorkspaceSet;
  onWorkspacesChange?: (next: TilingWorkspaceSet) => void;
};

function SetHarness(props: SetHarnessProps): React.ReactElement {
  return React.createElement(TilingRenderer, {
    workspaces: twoWorkspaces(),
    onWorkspacesChange: (): void => {},
    tiles: TILES,
    config: { gapPx: 8, minPaneSizePx: 100, handleSizePx: 6 },
    interaction: {
      dragRecovery: { enable: false },
      paneSwitching: { showTabStrip: false, showSwitcherOverlay: false },
    },
    ...props,
  });
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

async function startLiveDrag(tree: HTMLElement, leafId: string): Promise<void> {
  const header: HTMLElement | null = tree.querySelector(
    `article[data-leaf-id="${leafId}"] header`,
  );
  if (header == null) {
    throw new Error(`expected a default-tile header for ${leafId}`);
  }
  await act(async (): Promise<void> => {
    dispatchPointer(header, "pointerdown", { clientX: 20, clientY: 20 });
  });
  await flushFrames();
  await act(async (): Promise<void> => {
    dispatchPointer(window, "pointermove", { clientX: 40, clientY: 40 });
  });
  await flushFrames();
}

async function releaseDrag(): Promise<void> {
  await act(async (): Promise<void> => {
    dispatchPointer(window, "pointerup", { clientX: 80, clientY: 90 });
  });
  await flushFrames();
}

function placedLeafIds(container: HTMLElement): ReadonlyArray<string> {
  return Array.from(container.querySelectorAll<HTMLElement>("article[data-leaf-id]"))
    .filter((article: HTMLElement): boolean => article.closest("[data-hpt-pane-pool]") == null)
    .map((article: HTMLElement): string => article.getAttribute("data-leaf-id") ?? "")
    .sort();
}

describe("resolveWorkspaceTabHover — pure tab hit-test", (): void => {
  const targets: ReadonlyArray<TilingWorkspaceTabTarget> = [
    { targetId: "tab:main", workspaceId: "main", rect: { left: 0, top: 0, right: 100, bottom: 30 } },
    {
      targetId: "tab:ops",
      workspaceId: "ops",
      rect: { left: 100, top: 0, right: 200, bottom: 30 },
      placement: { kind: "root", side: "first" },
    },
  ];

  it("returns the first containing tab as a workspace-tab hover carrying its placement", (): void => {
    expect(resolveWorkspaceTabHover(targets, { x: 150, y: 10 })).toEqual({
      kind: "workspace-tab",
      targetId: "tab:ops",
      workspaceId: "ops",
      point: { x: 150, y: 10 },
      placement: { kind: "root", side: "first" },
    });
    const main: TilingWorkspaceTabDragHover | null = resolveWorkspaceTabHover(targets, {
      x: 100,
      y: 30,
    });
    // Shared edge: the FIRST target in order wins; no `placement` key is emitted when unset.
    expect(main?.targetId).toBe("tab:main");
    expect(main != null && "placement" in main).toBe(false);
  });

  it("returns null off every tab and treats edges inclusively", (): void => {
    expect(resolveWorkspaceTabHover(targets, { x: 250, y: 10 })).toBeNull();
    expect(resolveWorkspaceTabHover(targets, { x: 50, y: 31 })).toBeNull();
    expect(resolveWorkspaceTabHover([], { x: 50, y: 10 })).toBeNull();
    expect(clientRectContains(targets[0].rect, { x: 0, y: 0 })).toBe(true);
    expect(clientRectContains(targets[0].rect, { x: -1, y: 0 })).toBe(false);
  });
});

describe("TilingRenderer workspace-tab drop target (set mode)", (): void => {
  it("release over a tab moves the leaf via moveLeafToWorkspace, reports the next set, and skips the fly-back", async (): Promise<void> => {
    const onWorkspacesChange = jest.fn((_next: TilingWorkspaceSet): void => {});
    const onMoveLeaf = jest.fn(
      (_leafId: string, _from: string, _to: string): void => {},
    );
    const onExternalDrop: jest.Mock<TilingOnExternalDrop> = jest.fn();
    const view = render(
      React.createElement(SetHarness, {
        dragGhostMode: "auto",
        externalDragHover: TAB_HOVER,
        onWorkspacesChange,
        onMoveLeaf,
        onExternalDrop,
      }),
    );
    await startLiveDrag(view.container, "leaf:a");
    await releaseDrag();

    expect(onWorkspacesChange).toHaveBeenCalledTimes(1);
    const next: TilingWorkspaceSet = onWorkspacesChange.mock.calls[0][0];
    expect(next.activeId).toBe("main");
    const seats: TilingWorkspaceSetQuery = queryWorkspaceSet(next);
    expect(seats.workspacesOfLeaf("leaf:a")).toEqual(["ops"]);
    expect(seats.workspacesOfLeaf("leaf:b")).toEqual(["main"]);
    // `main` collapsed to its remaining leaf; `ops` grew a root split with `a` second.
    expect(next.workspaces[0].layout).toEqual(leaf("b"));
    const ops: TilingWorkspace = next.workspaces[1];
    expect(ops.layout?.kind).toBe("split");
    expect(ops.layout?.kind === "split" ? ops.layout.second : null).toEqual(leaf("a"));
    expect(onMoveLeaf).toHaveBeenCalledWith("leaf:a", "main", "ops");
    // The engine settled it — the host claim hook is NOT consulted for a tab.
    expect(onExternalDrop).not.toHaveBeenCalled();
    expect(document.querySelector("[data-drag-cancel]")).toBeNull();
  });

  it("honours the hover placement when moving", async (): Promise<void> => {
    const onWorkspacesChange = jest.fn((_next: TilingWorkspaceSet): void => {});
    const view = render(
      React.createElement(SetHarness, {
        externalDragHover: { ...TAB_HOVER, placement: { kind: "root", side: "first" } },
        onWorkspacesChange,
      }),
    );
    await startLiveDrag(view.container, "leaf:b");
    await releaseDrag();
    const next: TilingWorkspaceSet = onWorkspacesChange.mock.calls[0][0];
    const ops: TilingLayoutNode | null = next.workspaces[1].layout;
    expect(ops?.kind === "split" ? ops.first : null).toEqual(leaf("b"));
    expect(ops?.kind === "split" ? ops.second : null).toEqual(leaf("c"));
  });

  it("a tab for an unknown workspace declines the claim: no set change, ordinary cancel fly-back", async (): Promise<void> => {
    const onWorkspacesChange = jest.fn((_next: TilingWorkspaceSet): void => {});
    const onMoveLeaf = jest.fn((_leafId: string, _from: string, _to: string): void => {});
    const view = render(
      React.createElement(SetHarness, {
        externalDragHover: { ...TAB_HOVER, workspaceId: "nope" },
        onWorkspacesChange,
        onMoveLeaf,
      }),
    );
    await startLiveDrag(view.container, "leaf:a");
    await releaseDrag();
    expect(onWorkspacesChange).not.toHaveBeenCalled();
    expect(onMoveLeaf).not.toHaveBeenCalled();
    expect(document.querySelector("[data-drag-cancel]")).not.toBeNull();
    expect(placedLeafIds(view.container)).toEqual(["leaf:a", "leaf:b"]);
  });

  it("a plain external hover in set mode still routes to the host onExternalDrop", async (): Promise<void> => {
    const onWorkspacesChange = jest.fn((_next: TilingWorkspaceSet): void => {});
    const onExternalDrop: jest.Mock<TilingOnExternalDrop> = jest.fn();
    const view = render(
      React.createElement(SetHarness, {
        externalDragHover: { targetId: "chat", point: { x: 5, y: 5 } },
        onWorkspacesChange,
        onExternalDrop,
      }),
    );
    await startLiveDrag(view.container, "leaf:a");
    await releaseDrag();
    expect(onExternalDrop).toHaveBeenCalledWith(
      "leaf:a",
      "chat",
      { x: 5, y: 5 },
      { targetId: "chat", point: { x: 5, y: 5 } },
    );
    expect(onWorkspacesChange).not.toHaveBeenCalled();
    expect(document.querySelector("[data-drag-cancel]")).toBeNull();
  });

  it("the compact ghost chip receives the tab's targetId and workspaceId", async (): Promise<void> => {
    const chip = jest.fn((ctx: TilingGhostChipContext): React.ReactNode =>
      React.createElement(
        "span",
        { "data-chip-target": ctx.targetId, "data-chip-workspace": ctx.workspaceId },
        ctx.title,
      ),
    );
    const theme: TilingTheme = { ...resolveTilingTheme(undefined), ghostChip: chip };
    const view = render(
      React.createElement(SetHarness, {
        dragGhostMode: "auto",
        externalDragHover: TAB_HOVER,
        theme,
      }),
    );
    await startLiveDrag(view.container, "leaf:a");
    const compactChip: HTMLElement | null = document.querySelector(
      "[data-drag-ghost-chip][data-drag-ghost-mode='compact']",
    );
    expect(compactChip).not.toBeNull();
    expect(compactChip?.getAttribute("data-drag-ghost-target")).toBe("tab:ops");
    expect(compactChip?.getAttribute("data-drag-ghost-workspace")).toBe("ops");
    expect(document.querySelector("[data-chip-target='tab:ops']")).not.toBeNull();
    expect(document.querySelector("[data-chip-workspace='ops']")?.textContent).toBe("alpha");
    await releaseDrag();
  });
});

describe("TilingRenderer workspace-tab hover in single-layout mode", (): void => {
  it("is the host's to claim through onExternalDrop, unchanged from 26.9.2", async (): Promise<void> => {
    const onExternalDrop: jest.Mock<TilingOnExternalDrop> = jest.fn();
    const hover: TilingExternalDragHover = TAB_HOVER;
    const view = render(
      React.createElement(TilingRenderer, {
        layout: MAIN_LAYOUT,
        tiles: TILES,
        config: { gapPx: 8, minPaneSizePx: 100, handleSizePx: 6 },
        onLayoutChange: (): void => {},
        interaction: {
          dragRecovery: { enable: false },
          paneSwitching: { showTabStrip: false, showSwitcherOverlay: false },
        },
        externalDragHover: hover,
        onExternalDrop,
      }),
    );
    await startLiveDrag(view.container, "leaf:a");
    await releaseDrag();
    expect(onExternalDrop).toHaveBeenCalledWith(
      "leaf:a",
      "tab:ops",
      { x: 320, y: 24 },
      TAB_HOVER,
    );
    expect(document.querySelector("[data-drag-cancel]")).toBeNull();
  });

  it("a host returning false from onExternalDrop declines the claim and gets the cancel fly-back", async (): Promise<void> => {
    const onExternalDrop = jest.fn((): boolean => false);
    const view = render(
      React.createElement(TilingRenderer, {
        layout: MAIN_LAYOUT,
        tiles: TILES,
        config: { gapPx: 8, minPaneSizePx: 100, handleSizePx: 6 },
        onLayoutChange: (): void => {},
        interaction: {
          dragRecovery: { enable: false },
          paneSwitching: { showTabStrip: false, showSwitcherOverlay: false },
        },
        externalDragHover: { targetId: "chat", point: { x: 5, y: 5 } },
        onExternalDrop,
      }),
    );
    await startLiveDrag(view.container, "leaf:a");
    await releaseDrag();
    expect(onExternalDrop).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[data-drag-cancel]")).not.toBeNull();
  });
});
