/**
 * @jest-environment jsdom
 *
 * Native workspace-tab drop target (`_agent/workspace-set-concept.md` §5.5,
 * H3): a `kind: "workspace-tab"` `externalDragHover` settles the drag through
 * the 26.9.2 claim-before-settle path with the ENGINE applying
 * `moveLeafToWorkspace` — the host neither hit-tests nor claims. jsdom
 * geometry is stubbed so a pointer-driven pickup crosses the 6px threshold and
 * lifts the pane.
 */
import { afterEach, beforeAll, describe, expect, it, jest } from "@jest/globals";
import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { TilingRenderer } from "../react/tiling-renderer";
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
  Omit<TilingRendererWorkspaceSetProps, "config" | "workspaces" | "onWorkspacesChange">
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
  it("release over a tab moves the leaf via moveLeafToWorkspace and reports the next set", async (): Promise<void> => {
    const onWorkspacesChange = jest.fn((_next: TilingWorkspaceSet): void => {});
    const onMoveLeaf = jest.fn(
      (_leafId: string, _from: string, _to: string): void => {},
    );
    const onExternalDrop: jest.Mock<TilingOnExternalDrop> = jest.fn();
    const view = render(
      React.createElement(SetHarness, {
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

  it("a tab for an unknown workspace declines the claim: no set change, the pane settles home", async (): Promise<void> => {
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
    // Nothing is lifted any more: the pane is back in its own place.
    expect(view.container.querySelector("[data-hpt-lifted]")).toBeNull();
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
      expect.objectContaining({ kind: "pane", groupId: null, activeLeafId: "leaf:a" }),
    );
    expect(onWorkspacesChange).not.toHaveBeenCalled();
  });
});

describe("TilingRenderer workspace-tab drop target — a tab group", (): void => {
  const GROUP_TILES: ReadonlyArray<TilingTile> = [...TILES, { id: "d", title: "delta", accent: "cyan" }];

  /** main: a | g[b*, c] ; ops: d */
  function groupedWorkspaces(): TilingWorkspaceSet {
    return {
      workspaces: [
        {
          id: "main",
          name: "Main",
          layout: {
            kind: "split",
            id: "main-root",
            axis: "horizontal",
            ratio: 0.5,
            first: leaf("a"),
            second: { kind: "group", id: "g", members: [leaf("b"), leaf("c")], activeMemberId: "leaf:b" },
          },
        },
        { id: "ops", name: "Ops", layout: leaf("d") },
      ],
      activeId: "main",
    };
  }

  it("a group dragged by its title bar moves whole: members, order and active tab, one move report per pane", async (): Promise<void> => {
    const onWorkspacesChange = jest.fn((_next: TilingWorkspaceSet): void => {});
    const onMoveLeaf = jest.fn((_leafId: string, _from: string, _to: string): void => {});
    const onExternalDrop: jest.Mock<TilingOnExternalDrop> = jest.fn();
    const view = render(
      React.createElement(SetHarness, {
        tiles: GROUP_TILES,
        workspaces: groupedWorkspaces(),
        externalDragHover: TAB_HOVER,
        onWorkspacesChange,
        onMoveLeaf,
        onExternalDrop,
      }),
    );
    await startLiveDrag(view.container, "leaf:b");
    await releaseDrag();
    expect(onWorkspacesChange).toHaveBeenCalledTimes(1);
    const next: TilingWorkspaceSet = onWorkspacesChange.mock.calls[0][0];
    // Main is left with alpha alone; ops seats the same group (same id, members, order, active tab) after delta.
    expect(next.workspaces[0].layout).toEqual(leaf("a"));
    const ops: TilingLayoutNode | null = next.workspaces[1].layout;
    expect(ops?.kind).toBe("split");
    const seated: TilingLayoutNode | null = ops?.kind === "split" ? ops.second : null;
    expect(seated).toEqual({ kind: "group", id: "g", members: [leaf("b"), leaf("c")], activeMemberId: "leaf:b" });
    expect(ops?.kind === "split" ? ops.first : null).toEqual(leaf("d"));
    const seats: TilingWorkspaceSetQuery = queryWorkspaceSet(next);
    expect(seats.workspacesOfLeaf("leaf:b")).toEqual(["ops"]);
    expect(seats.workspacesOfLeaf("leaf:c")).toEqual(["ops"]);
    expect(onMoveLeaf.mock.calls).toEqual([
      ["leaf:b", "main", "ops"],
      ["leaf:c", "main", "ops"],
    ]);
    expect(onExternalDrop).not.toHaveBeenCalled();
  });

  it("a tab dragged off the group moves just that pane; the group keeps the rest", async (): Promise<void> => {
    const onWorkspacesChange = jest.fn((_next: TilingWorkspaceSet): void => {});
    const onMoveLeaf = jest.fn((_leafId: string, _from: string, _to: string): void => {});
    const view = render(
      React.createElement(SetHarness, {
        tiles: GROUP_TILES,
        workspaces: groupedWorkspaces(),
        externalDragHover: TAB_HOVER,
        onWorkspacesChange,
        onMoveLeaf,
      }),
    );
    const tabElement: HTMLElement | null = view.container.querySelector('[data-group-id="g"] [data-member-index="1"]');
    expect(tabElement).not.toBeNull();
    await act(async (): Promise<void> => {
      dispatchPointer(tabElement as HTMLElement, "pointerdown", { clientX: 20, clientY: 20 });
    });
    await flushFrames();
    await act(async (): Promise<void> => {
      dispatchPointer(window, "pointermove", { clientX: 40, clientY: 40 });
    });
    await flushFrames();
    await releaseDrag();
    expect(onWorkspacesChange).toHaveBeenCalledTimes(1);
    const next: TilingWorkspaceSet = onWorkspacesChange.mock.calls[0][0];
    const seats: TilingWorkspaceSetQuery = queryWorkspaceSet(next);
    expect(seats.workspacesOfLeaf("leaf:c")).toEqual(["ops"]);
    expect(seats.workspacesOfLeaf("leaf:b")).toEqual(["main"]);
    expect(onMoveLeaf.mock.calls).toEqual([["leaf:c", "main", "ops"]]);
  });

  it("a host claim of a plain external hover receives the whole group", async (): Promise<void> => {
    const onExternalDrop: jest.Mock<TilingOnExternalDrop> = jest.fn();
    const onWorkspacesChange = jest.fn((_next: TilingWorkspaceSet): void => {});
    const view = render(
      React.createElement(SetHarness, {
        tiles: GROUP_TILES,
        workspaces: groupedWorkspaces(),
        externalDragHover: { targetId: "chat", point: { x: 5, y: 5 } },
        onWorkspacesChange,
        onExternalDrop,
      }),
    );
    await startLiveDrag(view.container, "leaf:b");
    await releaseDrag();
    expect(onExternalDrop).toHaveBeenCalledTimes(1);
    const subject = onExternalDrop.mock.calls[0][4];
    expect(subject.kind).toBe("group");
    expect(subject.groupId).toBe("g");
    expect(subject.activeLeafId).toBe("leaf:b");
    expect(subject.members.map((member: TilingLeafNode): string => member.id)).toEqual(["leaf:b", "leaf:c"]);
    expect(onWorkspacesChange).not.toHaveBeenCalled();
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
      expect.objectContaining({ kind: "pane", groupId: null, activeLeafId: "leaf:a" }),
    );
  });

  it("a host returning false from onExternalDrop declines the claim: the pane settles home", async (): Promise<void> => {
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
    expect(view.container.querySelector("[data-hpt-lifted]")).toBeNull();
    expect(view.container.querySelector('article[data-leaf-id="leaf:a"]')).not.toBeNull();
  });
});
