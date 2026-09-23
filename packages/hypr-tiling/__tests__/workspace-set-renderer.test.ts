/**
 * @jest-environment jsdom
 *
 * `TilingRenderer` workspace-set mode (`workspaces` + `onWorkspacesChange`,
 * `_agent/workspace-set-concept.md` §5): the ACTIVE workspace's tree is
 * painted; switching `activeId` re-renders WITHOUT remounting a pane whose
 * leaf exists in both workspaces (stable pane identity keys on the leaf);
 * tree edits come back as a whole next set; uncontrolled maximize is scoped
 * per workspace; a drag in flight is cancelled when the active workspace
 * changes under it. The single-layout API is exercised alongside so the
 * mode switch is known not to disturb it.
 */
import { afterEach, beforeAll, describe, expect, it, jest } from "@jest/globals";
import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { TilingRenderer } from "../react/tiling-renderer";
import {
  switchWorkspace,
  type TilingWorkspace,
  type TilingWorkspaceSet,
} from "../engine/workspace-set";
import type {
  TilingCommandHandle,
  TilingGroupNode,
  TilingLayoutNode,
  TilingLeafNode,
  TilingRenderTileProps,
  TilingRendererWorkspaceSetProps,
  TilingSplitNode,
  TilingTile,
  TilingWorkspaceSwitchEvent,
} from "../engine/types";

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

function leaf(id: string): TilingLeafNode {
  return { kind: "leaf", id: `leaf:${id}`, tileId: id };
}

function split(
  id: string,
  first: TilingLayoutNode,
  second: TilingLayoutNode,
): TilingSplitNode {
  return { kind: "split", id, axis: "horizontal", ratio: 0.5, first, second };
}

const TILES: ReadonlyArray<TilingTile> = ["a", "b", "c", "d"].map(
  (id: string): TilingTile => ({ id, title: id, accent: "amber" }),
);

// main: a | b      ops: a | c      spare: (empty)
function threeWorkspaces(activeId: string = "main"): TilingWorkspaceSet {
  return {
    workspaces: [
      { id: "main", name: "Main", layout: split("main-root", leaf("a"), leaf("b")) },
      { id: "ops", name: "Ops", layout: split("ops-root", leaf("a"), leaf("c")) },
      { id: "spare", name: "Spare", layout: null },
    ],
    activeId,
  };
}

interface PaneObservation {
  mounts: number;
  instanceToken: object | null;
}

function ObservedPane({
  args,
  observations,
}: {
  args: TilingRenderTileProps;
  observations: Map<string, PaneObservation>;
}): React.ReactElement {
  const tokenRef = React.useRef<object>({});
  const observation: PaneObservation | undefined = observations.get(args.tile.id);
  React.useEffect((): void => {
    if (observation != null) {
      observation.mounts += 1;
    }
  }, [observation]);
  if (observation != null) {
    observation.instanceToken = tokenRef.current;
  }
  return React.createElement(
    "article",
    {
      "data-leaf-id": args.leafId,
      "data-tile-id": args.tile.id,
      "data-surface": args.surface,
      "data-maximized": args.isMaximized ? "true" : "false",
      tabIndex: 0,
      onFocus: args.onFocus,
    },
    React.createElement("header", null, args.tile.title),
  );
}

function freshObservations(): Map<string, PaneObservation> {
  return new Map<string, PaneObservation>(
    TILES.map((tile: TilingTile): [string, PaneObservation] => [
      tile.id,
      { mounts: 0, instanceToken: null },
    ]),
  );
}

type HarnessProps = Omit<
  TilingRendererWorkspaceSetProps,
  "tiles" | "config" | "renderTile"
> & {
  observations?: Map<string, PaneObservation>;
  handleRef?: React.RefObject<TilingCommandHandle | null>;
  renderTile?: TilingRendererWorkspaceSetProps["renderTile"];
};

function Harness({ observations, handleRef, renderTile, ...props }: HarnessProps): React.ReactElement {
  return React.createElement(TilingRenderer, {
    tiles: TILES,
    config: { gapPx: 8, minPaneSizePx: 100, handleSizePx: 6 },
    interaction: {
      dragRecovery: { enable: false },
      paneSwitching: { showTabStrip: false, showSwitcherOverlay: false },
    },
    paneIdentity: "stable",
    ref: handleRef,
    renderTile:
      renderTile ??
      (observations == null
        ? undefined
        : (args: TilingRenderTileProps): React.ReactNode =>
            React.createElement(ObservedPane, { key: args.tile.id, args, observations })),
    ...props,
  });
}

function placedPane(container: HTMLElement, tileId: string): HTMLElement | null {
  const article: HTMLElement | null = container.querySelector<HTMLElement>(
    `article[data-tile-id="${tileId}"][data-surface="pane"]`,
  );
  if (article == null || article.closest("[data-hpt-pane-pool]") != null) {
    return null;
  }
  return article;
}

function placedTileIds(container: HTMLElement): ReadonlyArray<string> {
  return Array.from(
    container.querySelectorAll<HTMLElement>('article[data-surface="pane"]'),
  )
    .filter((article: HTMLElement): boolean => article.closest("[data-hpt-pane-pool]") == null)
    .map((article: HTMLElement): string => article.getAttribute("data-tile-id") ?? "")
    .sort();
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

/** Default-tile pane leaf ids placed in the tree (the drag test uses the default tile — its header is the drag handle). */
function defaultTileLeafIds(container: HTMLElement): ReadonlyArray<string> {
  return Array.from(
    container.querySelectorAll<HTMLElement>("article[data-leaf-id]"),
  )
    .filter((article: HTMLElement): boolean => article.closest("[data-hpt-pane-pool]") == null)
    .map((article: HTMLElement): string => article.getAttribute("data-leaf-id") ?? "")
    .sort();
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

describe("TilingRenderer workspace-set mode — rendering the active workspace", (): void => {
  it("paints only the active workspace's tree and switches without remounting a shared leaf", (): void => {
    const observations: Map<string, PaneObservation> = new Map<string, PaneObservation>(
      TILES.map((tile: TilingTile): [string, PaneObservation] => [
        tile.id,
        { mounts: 0, instanceToken: null },
      ]),
    );
    const view = render(
      React.createElement(Harness, {
        workspaces: threeWorkspaces("main"),
        onWorkspacesChange: (): void => {},
        observations,
      }),
    );
    expect(placedTileIds(view.container)).toEqual(["a", "b"]);
    const sharedNode: HTMLElement | null = placedPane(view.container, "a");
    const sharedToken: object | null = observations.get("a")?.instanceToken ?? null;
    expect(sharedNode).not.toBeNull();
    expect(observations.get("a")?.mounts).toBe(1);

    view.rerender(
      React.createElement(Harness, {
        workspaces: threeWorkspaces("ops"),
        onWorkspacesChange: (): void => {},
        observations,
      }),
    );
    expect(placedTileIds(view.container)).toEqual(["a", "c"]);
    // The shared leaf `leaf:a` keeps its React instance AND its DOM node.
    expect(placedPane(view.container, "a")).toBe(sharedNode);
    expect(observations.get("a")?.instanceToken).toBe(sharedToken);
    expect(observations.get("a")?.mounts).toBe(1);
    // `c` mounted fresh; `b` is no longer placed in the tree.
    expect(observations.get("c")?.mounts).toBe(1);
    expect(placedPane(view.container, "b")).toBeNull();
    expect(view.container.querySelector("[data-hpt-workspace-empty]")).toBeNull();
  });

  it("renders the empty-workspace slot for a null layout and the tree again after switching back", (): void => {
    const renderEmptyWorkspace = jest.fn(
      (workspace: TilingWorkspace): React.ReactNode =>
        React.createElement("p", { "data-empty-for": workspace.id }, `empty ${workspace.name}`),
    );
    const view = render(
      React.createElement(Harness, {
        workspaces: threeWorkspaces("spare"),
        onWorkspacesChange: (): void => {},
        renderEmptyWorkspace,
        className: "host-root",
        observations: freshObservations(),
      }),
    );
    const shell: HTMLElement | null = view.container.querySelector<HTMLElement>(
      "[data-hpt-workspace-empty]",
    );
    expect(shell).not.toBeNull();
    expect(shell?.classList.contains("hpt-root")).toBe(true);
    expect(shell?.classList.contains("host-root")).toBe(true);
    expect(shell?.getAttribute("data-hpt-workspace-id")).toBe("spare");
    expect(view.container.querySelector("[data-empty-for='spare']")?.textContent).toBe(
      "empty Spare",
    );
    expect(renderEmptyWorkspace).toHaveBeenCalledTimes(1);
    expect(placedTileIds(view.container)).toEqual([]);

    view.rerender(
      React.createElement(Harness, {
        workspaces: threeWorkspaces("main"),
        onWorkspacesChange: (): void => {},
        renderEmptyWorkspace,
        observations: freshObservations(),
      }),
    );
    expect(view.container.querySelector("[data-hpt-workspace-empty]")).toBeNull();
    expect(placedTileIds(view.container)).toEqual(["a", "b"]);
  });

  it("reports a tree edit as the next set with only the active workspace's layout replaced", (): void => {
    const onWorkspacesChange = jest.fn((_next: TilingWorkspaceSet): void => {});
    const handleRef: React.RefObject<TilingCommandHandle | null> = React.createRef<TilingCommandHandle>();
    const set: TilingWorkspaceSet = threeWorkspaces("ops");
    render(
      React.createElement(Harness, {
        workspaces: set,
        onWorkspacesChange,
        handleRef,
      }),
    );
    act((): void => {
      handleRef.current?.dispatch({ kind: "set-split-ratio", splitId: "ops-root", ratio: 0.3 });
    });
    expect(onWorkspacesChange).toHaveBeenCalledTimes(1);
    const next: TilingWorkspaceSet = onWorkspacesChange.mock.calls[0][0];
    expect(next.activeId).toBe("ops");
    expect(next.workspaces.map((workspace: TilingWorkspace): string => workspace.id)).toEqual([
      "main",
      "ops",
      "spare",
    ]);
    // Untouched workspaces keep their references.
    expect(next.workspaces[0]).toBe(set.workspaces[0]);
    expect(next.workspaces[2]).toBe(set.workspaces[2]);
    const editedOps: TilingLayoutNode | null = next.workspaces[1].layout;
    expect(editedOps?.kind === "split" ? editedOps.ratio : null).toBeCloseTo(0.3);
    // The command handle addresses the active workspace's tree.
    expect(next.workspaces[0].layout).toEqual(set.workspaces[0].layout);
  });
});

describe("TilingRenderer workspace-set mode — per-workspace maximize scope", (): void => {
  it("uncontrolled maximize is scoped to the workspace it was set in and restored on return", (): void => {
    const onMaximizedLeafChange = jest.fn((_leafId: string | null): void => {});
    const handleRef: React.RefObject<TilingCommandHandle | null> = React.createRef<TilingCommandHandle>();
    const observations: Map<string, PaneObservation> = new Map<string, PaneObservation>(
      TILES.map((tile: TilingTile): [string, PaneObservation] => [
        tile.id,
        { mounts: 0, instanceToken: null },
      ]),
    );
    const view = render(
      React.createElement(Harness, {
        workspaces: threeWorkspaces("main"),
        onWorkspacesChange: (): void => {},
        onMaximizedLeafChange,
        handleRef,
        observations,
      }),
    );
    act((): void => {
      handleRef.current?.dispatch({ kind: "maximize", leafId: "leaf:a" });
    });
    expect(onMaximizedLeafChange).toHaveBeenLastCalledWith("leaf:a");
    // Only the maximized pane is placed; `b` parks in the stable pool.
    expect(placedTileIds(view.container)).toEqual(["a"]);
    expect(placedPane(view.container, "a")?.getAttribute("data-maximized")).toBe("true");

    // Switch to `ops` (which also hosts `leaf:a`): nothing is maximized there.
    view.rerender(
      React.createElement(Harness, {
        workspaces: threeWorkspaces("ops"),
        onWorkspacesChange: (): void => {},
        onMaximizedLeafChange,
        handleRef,
        observations,
      }),
    );
    expect(placedTileIds(view.container)).toEqual(["a", "c"]);
    expect(placedPane(view.container, "a")?.getAttribute("data-maximized")).toBe("false");

    // Back to `main`: its own maximize is restored.
    view.rerender(
      React.createElement(Harness, {
        workspaces: threeWorkspaces("main"),
        onWorkspacesChange: (): void => {},
        onMaximizedLeafChange,
        handleRef,
        observations,
      }),
    );
    expect(placedTileIds(view.container)).toEqual(["a"]);
    expect(placedPane(view.container, "a")?.getAttribute("data-maximized")).toBe("true");
    // The shared pane never remounted through the whole round trip.
    expect(observations.get("a")?.mounts).toBe(1);
  });

  it("a host-controlled maximizedLeafId is passed through untouched", (): void => {
    const view = render(
      React.createElement(Harness, {
        workspaces: threeWorkspaces("main"),
        onWorkspacesChange: (): void => {},
        maximizedLeafId: "leaf:b",
        renderTile: (args: TilingRenderTileProps): React.ReactNode =>
          React.createElement(ObservedPane, {
            key: args.tile.id,
            args,
            observations: new Map<string, PaneObservation>(),
          }),
      }),
    );
    expect(placedTileIds(view.container)).toEqual(["b"]);
    view.rerender(
      React.createElement(Harness, {
        workspaces: threeWorkspaces("ops"),
        onWorkspacesChange: (): void => {},
        maximizedLeafId: "leaf:a",
        renderTile: (args: TilingRenderTileProps): React.ReactNode =>
          React.createElement(ObservedPane, {
            key: args.tile.id,
            args,
            observations: new Map<string, PaneObservation>(),
          }),
      }),
    );
    expect(placedTileIds(view.container)).toEqual(["a"]);
  });
});

describe("TilingRenderer workspace-set mode — drag in flight across a switch", (): void => {
  it("cancels the drag when the active workspace changes under it", async (): Promise<void> => {
    const onWorkspacesChange = jest.fn((_next: TilingWorkspaceSet): void => {});
    const view = render(
      React.createElement(Harness, {
        workspaces: threeWorkspaces("main"),
        onWorkspacesChange,
      }),
    );
    expect(defaultTileLeafIds(view.container)).toEqual(["leaf:a", "leaf:b"]);
    // Drag `b` — a leaf that exists ONLY in `main`.
    await startLiveDrag(view.container, "leaf:b");
    expect(document.querySelector("[data-drag-ghost]")).not.toBeNull();

    view.rerender(
      React.createElement(Harness, {
        workspaces: switchWorkspace(threeWorkspaces("main"), "ops"),
        onWorkspacesChange,
      }),
    );
    await flushFrames();
    // The FSM settled through the cancel edge: no live ghost, no commit.
    expect(document.querySelector("[data-drag-ghost]")).toBeNull();
    expect(onWorkspacesChange).not.toHaveBeenCalled();
    expect(defaultTileLeafIds(view.container)).toEqual(["leaf:a", "leaf:c"]);
    // A subsequent release is inert (no stale FSM state).
    await act(async (): Promise<void> => {
      dispatchPointer(window, "pointerup", { clientX: 80, clientY: 90 });
    });
    await flushFrames();
    expect(onWorkspacesChange).not.toHaveBeenCalled();
  });
});

describe("TilingRenderer workspace-set mode — workspace command dispatch (H8)", (): void => {
  it("dispatches switch-workspace through the handle and fires onWorkspaceSwitch via command", (): void => {
    const onWorkspacesChange = jest.fn((_next: TilingWorkspaceSet): void => {});
    const onWorkspaceSwitch = jest.fn((_event: TilingWorkspaceSwitchEvent): void => {});
    const handleRef: React.RefObject<TilingCommandHandle | null> = React.createRef<TilingCommandHandle>();
    render(
      React.createElement(Harness, {
        workspaces: threeWorkspaces("main"),
        onWorkspacesChange,
        onWorkspaceSwitch,
        handleRef,
      }),
    );
    act((): void => {
      handleRef.current?.dispatch({ kind: "switch-workspace", workspaceId: "ops" });
    });
    expect(onWorkspacesChange).toHaveBeenCalledTimes(1);
    expect(onWorkspacesChange.mock.calls[0][0].activeId).toBe("ops");
    expect(onWorkspaceSwitch).toHaveBeenCalledWith({ from: "main", to: "ops", via: "command" });
  });

  it("dispatches cycle-workspace next/previous and reports via command", (): void => {
    const onWorkspacesChange = jest.fn((_next: TilingWorkspaceSet): void => {});
    const onWorkspaceSwitch = jest.fn((_event: TilingWorkspaceSwitchEvent): void => {});
    const handleRef: React.RefObject<TilingCommandHandle | null> = React.createRef<TilingCommandHandle>();
    render(
      React.createElement(Harness, {
        workspaces: threeWorkspaces("main"),
        onWorkspacesChange,
        onWorkspaceSwitch,
        handleRef,
      }),
    );
    act((): void => {
      handleRef.current?.dispatch({ kind: "cycle-workspace", direction: "next" });
    });
    expect(onWorkspacesChange.mock.calls[0][0].activeId).toBe("ops");
    expect(onWorkspaceSwitch).toHaveBeenLastCalledWith({ from: "main", to: "ops", via: "command" });
    act((): void => {
      handleRef.current?.dispatch({ kind: "cycle-workspace", direction: "previous" });
    });
    expect(onWorkspaceSwitch).toHaveBeenLastCalledWith({ from: "main", to: "spare", via: "command" });
  });

  it("dispatches switch-workspace by 1-based tab index", (): void => {
    const onWorkspacesChange = jest.fn((_next: TilingWorkspaceSet): void => {});
    const handleRef: React.RefObject<TilingCommandHandle | null> = React.createRef<TilingCommandHandle>();
    render(
      React.createElement(Harness, {
        workspaces: threeWorkspaces("main"),
        onWorkspacesChange,
        handleRef,
      }),
    );
    act((): void => {
      handleRef.current?.dispatch({ kind: "switch-workspace", index: 2 });
    });
    expect(onWorkspacesChange.mock.calls[0][0].activeId).toBe("ops");
  });

  it("moves a leaf without follow (activeId stays) and with follow (activeId travels)", (): void => {
    const onWorkspacesChange = jest.fn((_next: TilingWorkspaceSet): void => {});
    const onWorkspaceSwitch = jest.fn((_event: TilingWorkspaceSwitchEvent): void => {});
    const handleRef: React.RefObject<TilingCommandHandle | null> = React.createRef<TilingCommandHandle>();
    const set: TilingWorkspaceSet = threeWorkspaces("main");
    const view = render(
      React.createElement(Harness, {
        workspaces: set,
        onWorkspacesChange,
        onWorkspaceSwitch,
        handleRef,
      }),
    );
    act((): void => {
      handleRef.current?.dispatch({
        kind: "move-leaf-to-workspace",
        leafId: "leaf:b",
        workspaceId: "ops",
        follow: false,
      });
    });
    expect(onWorkspacesChange).toHaveBeenCalledTimes(1);
    const silent: TilingWorkspaceSet = onWorkspacesChange.mock.calls[0][0];
    expect(silent.activeId).toBe("main");
    expect(onWorkspaceSwitch).not.toHaveBeenCalled();
    expect(silent.workspaces[0].layout?.kind === "leaf" ? silent.workspaces[0].layout.id : null).toBe(
      "leaf:a",
    );

    view.rerender(
      React.createElement(Harness, {
        workspaces: silent,
        onWorkspacesChange,
        onWorkspaceSwitch,
        handleRef,
      }),
    );
    act((): void => {
      handleRef.current?.dispatch({
        kind: "move-leaf-to-workspace",
        leafId: "leaf:a",
        workspaceId: "spare",
        follow: true,
      });
    });
    expect(onWorkspacesChange).toHaveBeenCalledTimes(2);
    const followed: TilingWorkspaceSet = onWorkspacesChange.mock.calls[1][0];
    expect(followed.activeId).toBe("spare");
    expect(onWorkspaceSwitch).toHaveBeenCalledWith({ from: "main", to: "spare", via: "command" });
  });

  it("reveal-tile switches to a workspace showing the tile and fires via reveal", (): void => {
    const onWorkspacesChange = jest.fn((_next: TilingWorkspaceSet): void => {});
    const onWorkspaceSwitch = jest.fn((_event: TilingWorkspaceSwitchEvent): void => {});
    const handleRef: React.RefObject<TilingCommandHandle | null> = React.createRef<TilingCommandHandle>();
    render(
      React.createElement(Harness, {
        workspaces: threeWorkspaces("main"),
        onWorkspacesChange,
        onWorkspaceSwitch,
        handleRef,
      }),
    );
    act((): void => {
      handleRef.current?.dispatch({ kind: "reveal-tile", tileId: "c" });
    });
    expect(onWorkspacesChange.mock.calls[0][0].activeId).toBe("ops");
    expect(onWorkspaceSwitch).toHaveBeenCalledWith({ from: "main", to: "ops", via: "reveal" });
  });

  it("reveal-tile prefers the active workspace and activates a grouped member", (): void => {
    const onWorkspacesChange = jest.fn((_next: TilingWorkspaceSet): void => {});
    const onWorkspaceSwitch = jest.fn((_event: TilingWorkspaceSwitchEvent): void => {});
    const handleRef: React.RefObject<TilingCommandHandle | null> = React.createRef<TilingCommandHandle>();
    const grouped: TilingGroupNode = {
      kind: "group",
      id: "g1",
      members: [leaf("b"), leaf("d")],
      activeMemberId: "leaf:b",
    };
    const set: TilingWorkspaceSet = {
      workspaces: [
        { id: "main", name: "Main", layout: grouped },
        { id: "ops", name: "Ops", layout: leaf("d") },
      ],
      activeId: "main",
    };
    render(
      React.createElement(Harness, {
        workspaces: set,
        onWorkspacesChange,
        onWorkspaceSwitch,
        handleRef,
      }),
    );
    act((): void => {
      handleRef.current?.dispatch({ kind: "reveal-tile", tileId: "d" });
    });
    expect(onWorkspaceSwitch).not.toHaveBeenCalled();
    expect(onWorkspacesChange).toHaveBeenCalledTimes(1);
    const nextLayout: TilingLayoutNode | null = onWorkspacesChange.mock.calls[0][0].workspaces[0].layout;
    expect(nextLayout?.kind === "group" ? nextLayout.activeMemberId : null).toBe("leaf:d");
    expect(onWorkspacesChange.mock.calls[0][0].activeId).toBe("main");
  });

  it("workspace commands are a no-op when interaction.workspaces is disabled", (): void => {
    const onWorkspacesChange = jest.fn((_next: TilingWorkspaceSet): void => {});
    const handleRef: React.RefObject<TilingCommandHandle | null> = React.createRef<TilingCommandHandle>();
    render(
      React.createElement(Harness, {
        workspaces: threeWorkspaces("main"),
        onWorkspacesChange,
        handleRef,
        interaction: {
          workspaces: false,
          dragRecovery: { enable: false },
          paneSwitching: { showTabStrip: false, showSwitcherOverlay: false },
        },
      }),
    );
    act((): void => {
      handleRef.current?.dispatch({ kind: "switch-workspace", workspaceId: "ops" });
      handleRef.current?.dispatch({ kind: "cycle-workspace", direction: "next" });
    });
    expect(onWorkspacesChange).not.toHaveBeenCalled();
  });

  it("switches away from an empty workspace through the handle", (): void => {
    const onWorkspacesChange = jest.fn((_next: TilingWorkspaceSet): void => {});
    const onWorkspaceSwitch = jest.fn((_event: TilingWorkspaceSwitchEvent): void => {});
    const handleRef: React.RefObject<TilingCommandHandle | null> = React.createRef<TilingCommandHandle>();
    render(
      React.createElement(Harness, {
        workspaces: threeWorkspaces("spare"),
        onWorkspacesChange,
        onWorkspaceSwitch,
        handleRef,
      }),
    );
    act((): void => {
      handleRef.current?.dispatch({ kind: "switch-workspace", workspaceId: "main" });
    });
    expect(onWorkspacesChange.mock.calls[0][0].activeId).toBe("main");
    expect(onWorkspaceSwitch).toHaveBeenCalledWith({ from: "spare", to: "main", via: "command" });
  });
});

describe("TilingRenderer single-layout mode is unchanged", (): void => {
  it("renders a controlled layout and reports edits through onLayoutChange", (): void => {
    const onLayoutChange = jest.fn((_next: TilingLayoutNode): void => {});
    const handleRef: React.RefObject<TilingCommandHandle | null> = React.createRef<TilingCommandHandle>();
    const layout: TilingLayoutNode = split("root", leaf("a"), leaf("b"));
    const view = render(
      React.createElement(TilingRenderer, {
        ref: handleRef,
        layout,
        tiles: TILES,
        config: { gapPx: 8, minPaneSizePx: 100, handleSizePx: 6 },
        onLayoutChange,
        paneIdentity: "stable",
        interaction: { paneSwitching: { showTabStrip: false, showSwitcherOverlay: false } },
        renderTile: (args: TilingRenderTileProps): React.ReactNode =>
          React.createElement(ObservedPane, {
            key: args.tile.id,
            args,
            observations: new Map<string, PaneObservation>(),
          }),
      }),
    );
    expect(placedTileIds(view.container)).toEqual(["a", "b"]);
    expect(view.container.querySelector("[data-hpt-workspace-empty]")).toBeNull();
    act((): void => {
      handleRef.current?.dispatch({ kind: "set-split-ratio", splitId: "root", ratio: 0.3 });
    });
    expect(onLayoutChange).toHaveBeenCalledTimes(1);
    const next: TilingLayoutNode = onLayoutChange.mock.calls[0][0];
    expect(next.kind === "split" ? next.ratio : null).toBeCloseTo(0.3);
    act((): void => {
      handleRef.current?.dispatch({ kind: "switch-workspace", workspaceId: "ops" });
      handleRef.current?.dispatch({ kind: "cycle-workspace", direction: "next" });
      handleRef.current?.dispatch({ kind: "reveal-tile", tileId: "a" });
    });
    expect(onLayoutChange).toHaveBeenCalledTimes(1);
  });
});
