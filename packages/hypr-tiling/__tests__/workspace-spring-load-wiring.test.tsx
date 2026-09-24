/**
 * @jest-environment jsdom
 *
 * N3 wiring — spring-loaded workspace-tab drop on the set-mode renderer
 * (`interaction.workspaces.springLoad`, contract in the module doc of
 * `engine/workspace-spring-load.ts`): a dragged pane parked over another
 * workspace's tab for `dwellMs` commits into that workspace
 * (`moveLeafToWorkspace` + `switchWorkspace`), the callbacks fire
 * (`onMoveLeaf`, `onWorkspaceSwitch({ via: "spring-load" })`), and the drag
 * continues (`REARM`) on the leaf's new seat in the destination tree under the
 * still-held pointer, where a later release / Escape settles as an ordinary
 * drag. Disabled capability, a hover that leaves before the dwell, the active
 * workspace's own tab and a drag cancelled mid-dwell all fire nothing.
 *
 * Fake timers drive both the dwell timer (window scheduler) and jsdom's rAF
 * (the drag input coalescer). Geometry is stubbed as in
 * `workspace-tab-drop.test.ts`.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as React from "react";
import { act, cleanup, render, type RenderResult } from "@testing-library/react";
import { TilingRenderer } from "../react/tiling-renderer";
import { WORKSPACE_TRANSITION_CLONE_ATTR } from "../react/dom-view-capture";
import { resolveTilingTheme, type TilingTheme } from "../react/theme";
import { queryWorkspaceSet, type TilingWorkspaceSet } from "../engine/workspace-set";
import type {
  TilingClientPoint,
  TilingExternalDragHover,
  TilingInteractionCapabilities,
  TilingLayoutNode,
  TilingLeafNode,
  TilingTile,
  TilingWorkspaceSwitchEvent,
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

// main: a | b      ops: c
function twoWorkspaces(): TilingWorkspaceSet {
  return {
    workspaces: [
      { id: "main", name: "Main", layout: MAIN_LAYOUT },
      { id: "ops", name: "Ops", layout: leaf("c") },
    ],
    activeId: "main",
  };
}

const OPS_TAB: TilingWorkspaceTabDragHover = {
  kind: "workspace-tab",
  targetId: "tab:ops",
  workspaceId: "ops",
  point: { x: 320, y: 24 },
};
const MAIN_TAB: TilingWorkspaceTabDragHover = {
  kind: "workspace-tab",
  targetId: "tab:main",
  workspaceId: "main",
  point: { x: 120, y: 24 },
};

/** The tab strip occupies y ≤ 30: x < 200 is `main`, x ≥ 200 is `ops`. */
function tabStripResolver(point: TilingClientPoint): TilingExternalDragHover | null {
  if (point.y > 30) {
    return null;
  }
  return point.x >= 200 ? { ...OPS_TAB, point } : { ...MAIN_TAB, point };
}

const PANE_RECT: DOMRect = {
  x: 10,
  y: 40,
  left: 10,
  top: 40,
  right: 210,
  bottom: 190,
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
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect(): DOMRect {
    return PANE_RECT;
  };
});

beforeEach((): void => {
  jest.useFakeTimers();
});

afterEach((): void => {
  cleanup();
  jest.useRealTimers();
});

const DWELL_MS: number = 300;

interface HostProps {
  readonly initial?: TilingWorkspaceSet;
  readonly workspaces?: TilingInteractionCapabilities["workspaces"];
  readonly onWorkspacesChange?: (next: TilingWorkspaceSet) => void;
  readonly onMoveLeaf?: (leafId: string, from: string, to: string) => void;
  readonly onWorkspaceSwitch?: (event: TilingWorkspaceSwitchEvent) => void;
  readonly onExternalDragHoverChange?: (hover: TilingExternalDragHover | null) => void;
  readonly externalDragHover?: TilingExternalDragHover | null;
  readonly theme?: TilingTheme;
}

/** A controlled host that APPLIES every emitted set and forwards the callbacks. */
function Host(props: HostProps): React.ReactElement {
  const [set, setSet] = React.useState<TilingWorkspaceSet>(props.initial ?? twoWorkspaces());
  const onWorkspacesChange = props.onWorkspacesChange;
  const handleChange = React.useCallback(
    (next: TilingWorkspaceSet): void => {
      setSet(next);
      onWorkspacesChange?.(next);
    },
    [onWorkspacesChange],
  );
  return React.createElement(
    "div",
    { "data-host-active": set.activeId },
    React.createElement(TilingRenderer, {
      workspaces: set,
      onWorkspacesChange: handleChange,
      onMoveLeaf: props.onMoveLeaf,
      onWorkspaceSwitch: props.onWorkspaceSwitch,
      tiles: TILES,
      config: { gapPx: 8, minPaneSizePx: 100, handleSizePx: 6 },
      theme: props.theme,
      interaction: {
        dragRecovery: { enable: false },
        paneSwitching: { showTabStrip: false, showSwitcherOverlay: false },
        workspaces: props.workspaces ?? { springLoad: { dwellMs: DWELL_MS } },
      },
      resolveExternalDragHover: props.externalDragHover === undefined ? tabStripResolver : undefined,
      externalDragHover: props.externalDragHover,
      onExternalDragHoverChange: props.onExternalDragHoverChange,
    }),
  );
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

/** Fake timers drive jsdom's rAF: two frames flush the input coalescer. */
function flushFrames(): void {
  act((): void => {
    jest.advanceTimersByTime(40);
  });
}

function advance(ms: number): void {
  act((): void => {
    jest.advanceTimersByTime(ms);
  });
}

function movePointer(x: number, y: number): void {
  act((): void => {
    dispatchPointer(window, "pointermove", { clientX: x, clientY: y });
  });
  flushFrames();
}

function startLiveDrag(container: HTMLElement, leafId: string): void {
  const header: HTMLElement | null = container.querySelector(
    `article[data-leaf-id="${leafId}"] header`,
  );
  if (header == null) {
    throw new Error(`expected a default-tile header for ${leafId}`);
  }
  act((): void => {
    dispatchPointer(header, "pointerdown", { clientX: 20, clientY: 60 });
  });
  flushFrames();
  movePointer(60, 100);
}

function releasePointer(x: number, y: number): void {
  act((): void => {
    dispatchPointer(window, "pointerup", { clientX: x, clientY: y });
  });
  flushFrames();
}

function pressEscape(): void {
  act((): void => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  flushFrames();
}

function liveLeafIds(container: HTMLElement): ReadonlyArray<string> {
  return Array.from(container.querySelectorAll<HTMLElement>("article[data-leaf-id]"))
    .filter(
      (article: HTMLElement): boolean =>
        article.closest("[data-hpt-pane-pool]") == null &&
        article.closest(`[${WORKSPACE_TRANSITION_CLONE_ATTR}]`) == null,
    )
    .map((article: HTMLElement): string => article.getAttribute("data-leaf-id") ?? "")
    .sort();
}

function activeWorkspaceId(result: RenderResult): string | null {
  return result.container.querySelector<HTMLElement>("[data-host-active]")?.getAttribute("data-host-active") ?? null;
}

function ghost(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-drag-ghost]");
}

describe("N3 wiring — spring-loaded tab drop on the set-mode renderer", (): void => {
  it("dwell → fired: leaf moved + active switched, callbacks fire, the drag re-arms in the destination tree and an Escape then cancels it there", (): void => {
    const onWorkspacesChange = jest.fn((_next: TilingWorkspaceSet): void => {});
    const onMoveLeaf = jest.fn((_leafId: string, _from: string, _to: string): void => {});
    const onWorkspaceSwitch = jest.fn((_event: TilingWorkspaceSwitchEvent): void => {});
    const result: RenderResult = render(
      React.createElement(Host, { onWorkspacesChange, onMoveLeaf, onWorkspaceSwitch }),
    );
    startLiveDrag(result.container, "leaf:a");
    expect(ghost()).not.toBeNull();
    // Park over the `ops` tab.
    movePointer(320, 24);
    // Not yet: short of the dwell (the hover landed inside the 40 ms frame flush).
    advance(DWELL_MS - 60);
    expect(onWorkspacesChange).not.toHaveBeenCalled();
    expect(activeWorkspaceId(result)).toBe("main");

    advance(70);
    // Fired: the set moved `a` into `ops` and switched there, in ONE emission.
    expect(onWorkspacesChange).toHaveBeenCalledTimes(1);
    const next: TilingWorkspaceSet = onWorkspacesChange.mock.calls[0][0];
    expect(next.activeId).toBe("ops");
    expect(queryWorkspaceSet(next).workspacesOfLeaf("leaf:a")).toEqual(["ops"]);
    expect(next.workspaces[0].layout).toEqual(leaf("b"));
    expect(next.workspaces[1].layout?.kind).toBe("split");
    expect(onMoveLeaf).toHaveBeenCalledWith("leaf:a", "main", "ops");
    expect(onWorkspaceSwitch).toHaveBeenCalledWith({ from: "main", to: "ops", via: "spring-load" });
    // The destination tree is live (the picked-up leaf free-follows as the
    // ghost, so the tree shows the survivors only) …
    expect(activeWorkspaceId(result)).toBe("ops");
    expect(liveLeafIds(result.container)).toEqual(["leaf:c"]);
    // … and the drag continued there: a live ghost, no cancel fly-back.
    expect(ghost()).not.toBeNull();
    expect(document.querySelector("[data-drag-cancel]")).toBeNull();

    // The re-armed drag is an ordinary drag: Escape cancels it on the NEW
    // tree (fly-back to the new seat) and the set is untouched.
    pressEscape();
    expect(ghost()).toBeNull();
    expect(document.querySelector("[data-drag-cancel]")).not.toBeNull();
    expect(onWorkspacesChange).toHaveBeenCalledTimes(1);
    expect(liveLeafIds(result.container)).toEqual(["leaf:a", "leaf:c"]);
    // A stale release afterwards is inert.
    releasePointer(100, 100);
    expect(onWorkspacesChange).toHaveBeenCalledTimes(1);
  });

  it("after the rearm a release away from every tab settles the continued drag as a plain drop (no second set change)", (): void => {
    const onWorkspacesChange = jest.fn((_next: TilingWorkspaceSet): void => {});
    const onWorkspaceSwitch = jest.fn((_event: TilingWorkspaceSwitchEvent): void => {});
    const result: RenderResult = render(
      React.createElement(Host, { onWorkspacesChange, onWorkspaceSwitch }),
    );
    startLiveDrag(result.container, "leaf:a");
    movePointer(320, 24);
    advance(DWELL_MS + 10);
    expect(onWorkspacesChange).toHaveBeenCalledTimes(1);
    expect(ghost()).not.toBeNull();

    // Move off the strip (the hover clears) and let go over empty space.
    movePointer(100, 300);
    releasePointer(100, 300);
    expect(ghost()).toBeNull();
    // The release found no target: an ordinary cancel fly-back on the ops
    // tree; nothing else moved.
    expect(document.querySelector("[data-drag-cancel]")).not.toBeNull();
    expect(onWorkspacesChange).toHaveBeenCalledTimes(1);
    expect(onWorkspaceSwitch).toHaveBeenCalledTimes(1);
    expect(liveLeafIds(result.container)).toEqual(["leaf:a", "leaf:c"]);
  });

  it("the re-armed drag can spring-load again: dwelling over `main` moves the leaf back", (): void => {
    const onWorkspaceSwitch = jest.fn((_event: TilingWorkspaceSwitchEvent): void => {});
    const onMoveLeaf = jest.fn((_leafId: string, _from: string, _to: string): void => {});
    const result: RenderResult = render(
      React.createElement(Host, { onWorkspaceSwitch, onMoveLeaf }),
    );
    startLiveDrag(result.container, "leaf:a");
    movePointer(320, 24);
    advance(DWELL_MS + 10);
    expect(activeWorkspaceId(result)).toBe("ops");
    // Still parked over `ops` (now the active tab): no dwell. Slide to `main`.
    advance(DWELL_MS * 2);
    expect(onWorkspaceSwitch).toHaveBeenCalledTimes(1);
    movePointer(120, 24);
    advance(DWELL_MS + 10);
    expect(onWorkspaceSwitch).toHaveBeenCalledTimes(2);
    expect(onWorkspaceSwitch).toHaveBeenLastCalledWith({ from: "ops", to: "main", via: "spring-load" });
    expect(onMoveLeaf).toHaveBeenLastCalledWith("leaf:a", "ops", "main");
    expect(activeWorkspaceId(result)).toBe("main");
    expect(liveLeafIds(result.container)).toEqual(["leaf:b"]);
    expect(ghost()).not.toBeNull();
    pressEscape();
    expect(ghost()).toBeNull();
    expect(liveLeafIds(result.container)).toEqual(["leaf:a", "leaf:b"]);
  });

  it("a host-supplied `externalDragHover` prop drives the dwell too (no resolver)", (): void => {
    const onWorkspaceSwitch = jest.fn((_event: TilingWorkspaceSwitchEvent): void => {});
    const result: RenderResult = render(
      React.createElement(Host, { externalDragHover: OPS_TAB, onWorkspaceSwitch }),
    );
    startLiveDrag(result.container, "leaf:b");
    // The hover is a tab from the first dragging frame: the dwell starts at pickup.
    advance(DWELL_MS + 10);
    expect(onWorkspaceSwitch).toHaveBeenCalledWith({ from: "main", to: "ops", via: "spring-load" });
    expect(activeWorkspaceId(result)).toBe("ops");
    expect(liveLeafIds(result.container)).toEqual(["leaf:c"]);
    expect(ghost()).not.toBeNull();
    // The prop still says `ops` — the active tab — so nothing re-fires.
    advance(DWELL_MS * 3);
    expect(onWorkspaceSwitch).toHaveBeenCalledTimes(1);
    pressEscape();
    expect(liveLeafIds(result.container)).toEqual(["leaf:b", "leaf:c"]);
  });

  it("with `transition: \"slide\"` the spring-load switch animates: the frozen clone shows the outgoing workspace", (): void => {
    const theme: TilingTheme = {
      ...resolveTilingTheme(undefined),
      workspaceTransition: { durationMs: 20 },
    };
    const result: RenderResult = render(
      React.createElement(Host, {
        theme,
        workspaces: { springLoad: { dwellMs: DWELL_MS }, switch: { transition: "slide" } },
      }),
    );
    startLiveDrag(result.container, "leaf:a");
    movePointer(320, 24);
    advance(DWELL_MS + 10);
    expect(activeWorkspaceId(result)).toBe("ops");
    const frozen: HTMLElement | null = result.container.querySelector<HTMLElement>(
      `[${WORKSPACE_TRANSITION_CLONE_ATTR}]`,
    );
    expect(frozen).not.toBeNull();
    expect(frozen?.textContent).toContain("beta");
    expect(frozen?.textContent).not.toContain("gamma");
    expect(ghost()).not.toBeNull();
    advance(200);
    expect(result.container.querySelector(`[${WORKSPACE_TRANSITION_CLONE_ATTR}]`)).toBeNull();
    pressEscape();
  });

  it("disabled (default) — parking over a tab fires nothing, release over it still moves via the tab drop", (): void => {
    const onWorkspacesChange = jest.fn((_next: TilingWorkspaceSet): void => {});
    const onWorkspaceSwitch = jest.fn((_event: TilingWorkspaceSwitchEvent): void => {});
    const result: RenderResult = render(
      React.createElement(Host, { workspaces: {}, onWorkspacesChange, onWorkspaceSwitch }),
    );
    startLiveDrag(result.container, "leaf:a");
    movePointer(320, 24);
    advance(5000);
    expect(onWorkspacesChange).not.toHaveBeenCalled();
    expect(activeWorkspaceId(result)).toBe("main");
    expect(ghost()).not.toBeNull();
    releasePointer(320, 24);
    // The pre-N3 tab drop: moved silently, no switch.
    expect(onWorkspacesChange).toHaveBeenCalledTimes(1);
    expect(onWorkspaceSwitch).not.toHaveBeenCalled();
    expect(activeWorkspaceId(result)).toBe("main");
    expect(liveLeafIds(result.container)).toEqual(["leaf:b"]);
  });

  it("`springLoad: false` is the same as omitted", (): void => {
    const onWorkspacesChange = jest.fn((_next: TilingWorkspaceSet): void => {});
    const result: RenderResult = render(
      React.createElement(Host, { workspaces: { springLoad: false }, onWorkspacesChange }),
    );
    startLiveDrag(result.container, "leaf:a");
    movePointer(320, 24);
    advance(5000);
    expect(onWorkspacesChange).not.toHaveBeenCalled();
    pressEscape();
  });

  it("the hover leaves the tab before the dwell — nothing fires, and coming back restarts the dwell from zero", (): void => {
    const onWorkspacesChange = jest.fn((_next: TilingWorkspaceSet): void => {});
    const result: RenderResult = render(React.createElement(Host, { onWorkspacesChange }));
    startLiveDrag(result.container, "leaf:a");
    movePointer(320, 24);
    advance(DWELL_MS - 100);
    movePointer(100, 300);
    advance(DWELL_MS * 2);
    expect(onWorkspacesChange).not.toHaveBeenCalled();
    // Back over the tab: a fresh dwell, not the remainder of the first.
    movePointer(320, 24);
    advance(DWELL_MS - 100);
    expect(onWorkspacesChange).not.toHaveBeenCalled();
    advance(120);
    expect(onWorkspacesChange).toHaveBeenCalledTimes(1);
    pressEscape();
  });

  it("the active workspace's own tab never dwells", (): void => {
    const onWorkspacesChange = jest.fn((_next: TilingWorkspaceSet): void => {});
    const result: RenderResult = render(React.createElement(Host, { onWorkspacesChange }));
    startLiveDrag(result.container, "leaf:a");
    movePointer(120, 24);
    advance(DWELL_MS * 4);
    expect(onWorkspacesChange).not.toHaveBeenCalled();
    expect(ghost()).not.toBeNull();
    pressEscape();
  });

  it("a drag cancelled mid-dwell (Escape) ends the dwell: nothing fires after the timer would have", (): void => {
    const onWorkspacesChange = jest.fn((_next: TilingWorkspaceSet): void => {});
    const onWorkspaceSwitch = jest.fn((_event: TilingWorkspaceSwitchEvent): void => {});
    const result: RenderResult = render(
      React.createElement(Host, { onWorkspacesChange, onWorkspaceSwitch }),
    );
    startLiveDrag(result.container, "leaf:a");
    movePointer(320, 24);
    advance(DWELL_MS - 100);
    pressEscape();
    expect(ghost()).toBeNull();
    advance(DWELL_MS * 3);
    expect(onWorkspacesChange).not.toHaveBeenCalled();
    expect(onWorkspaceSwitch).not.toHaveBeenCalled();
    expect(activeWorkspaceId(result)).toBe("main");
    expect(liveLeafIds(result.container)).toEqual(["leaf:a", "leaf:b"]);
  });

  it("a release mid-dwell settles as the ordinary tab drop (move, no switch) and the dwell is spent", (): void => {
    const onWorkspacesChange = jest.fn((_next: TilingWorkspaceSet): void => {});
    const onWorkspaceSwitch = jest.fn((_event: TilingWorkspaceSwitchEvent): void => {});
    const result: RenderResult = render(
      React.createElement(Host, { onWorkspacesChange, onWorkspaceSwitch }),
    );
    startLiveDrag(result.container, "leaf:a");
    movePointer(320, 24);
    advance(DWELL_MS - 100);
    releasePointer(320, 24);
    expect(onWorkspacesChange).toHaveBeenCalledTimes(1);
    expect(onWorkspacesChange.mock.calls[0][0].activeId).toBe("main");
    advance(DWELL_MS * 3);
    expect(onWorkspacesChange).toHaveBeenCalledTimes(1);
    expect(onWorkspaceSwitch).not.toHaveBeenCalled();
  });

  it("the host's own `onExternalDragHoverChange` still receives every hover change while spring-load is on", (): void => {
    const onExternalDragHoverChange = jest.fn((_hover: TilingExternalDragHover | null): void => {});
    const result: RenderResult = render(React.createElement(Host, { onExternalDragHoverChange }));
    startLiveDrag(result.container, "leaf:a");
    movePointer(320, 24);
    expect(onExternalDragHoverChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "workspace-tab", workspaceId: "ops" }),
    );
    movePointer(100, 300);
    expect(onExternalDragHoverChange).toHaveBeenLastCalledWith(null);
    pressEscape();
  });
});
