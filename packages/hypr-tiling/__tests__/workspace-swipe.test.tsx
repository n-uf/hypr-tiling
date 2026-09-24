/**
 * @jest-environment jsdom
 *
 * N1 — swipe navigation in `TilingRenderer` set mode: with
 * `interaction.workspaces.switch.wheelSwipe` a horizontal wheel burst on the
 * renderer root cycles the active workspace through the ordinary command
 * path (`onWorkspacesChange` + `onWorkspaceSwitch({ via: "swipe" })`); off by
 * default; a scroll chain that can still scroll on X blocks arming; and
 * `useWorkspaceSwipe` under a `TilingWorkspaceSwipeScope` observes the
 * gesture's progress while it tracks. The DOM ports are driven with
 * synthetic `WheelEvent`s and Jest fake timers stand in for the wheel-idle
 * and lockout clocks.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as React from "react";
import { act, cleanup, render, type RenderResult } from "@testing-library/react";
import { TilingRenderer } from "../react/tiling-renderer";
import { TilingWorkspaceSwipeScope, useWorkspaceSwipe } from "../react/use-workspace-swipe";
import type { TilingWorkspaceSet } from "../engine/workspace-set";
import {
  TILING_WORKSPACE_SWIPE_DEFAULTS,
  type TilingWorkspaceSwipeSnapshot,
} from "../engine/workspace-navigation";
import type {
  TilingLayoutNode,
  TilingLeafNode,
  TilingRenderTileProps,
  TilingRendererWorkspaceSetProps,
  TilingSplitNode,
  TilingTile,
  TilingWorkspaceSwitchEvent,
} from "../engine/types";

const PANE_RECT: DOMRect = {
  x: 0,
  y: 0,
  left: 0,
  top: 0,
  right: 800,
  bottom: 600,
  width: 800,
  height: 600,
  toJSON: (): Record<string, number> => ({}),
};

beforeAll((): void => {
  const globalScope = globalThis as unknown as { ResizeObserver?: unknown };
  if (typeof globalScope.ResizeObserver === "undefined") {
    class StubResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    globalScope.ResizeObserver = StubResizeObserver;
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

function leaf(id: string): TilingLeafNode {
  return { kind: "leaf", id: `leaf:${id}`, tileId: id };
}

function split(id: string, first: TilingLayoutNode, second: TilingLayoutNode): TilingSplitNode {
  return { kind: "split", id, axis: "horizontal", ratio: 0.5, first, second };
}

const TILES: ReadonlyArray<TilingTile> = ["a", "b", "c"].map(
  (id: string): TilingTile => ({ id, title: id, accent: "amber" }),
);

// main: a | b      ops: a | c      spare: c
function threeWorkspaces(activeId: string = "main"): TilingWorkspaceSet {
  return {
    workspaces: [
      { id: "main", name: "Main", layout: split("main-root", leaf("a"), leaf("b")) },
      { id: "ops", name: "Ops", layout: split("ops-root", leaf("a"), leaf("c")) },
      { id: "spare", name: "Spare", layout: leaf("c") },
    ],
    activeId,
  };
}

function renderTile(args: TilingRenderTileProps): React.ReactNode {
  return React.createElement(
    "article",
    { "data-tile-id": args.tile.id, "data-surface": args.surface },
    // A horizontally scrollable strip inside tile "a" for the scroll-chain test.
    args.tile.id === "a"
      ? React.createElement("div", {
          "data-testid": "x-scroller",
          style: { overflowX: "auto", width: 200 },
        })
      : args.tile.title,
  );
}

type HarnessProps = Omit<TilingRendererWorkspaceSetProps, "tiles" | "config" | "renderTile"> & {
  onSnapshot?: (snapshot: TilingWorkspaceSwipeSnapshot) => void;
};

function SwipeProbe({
  onSnapshot,
}: {
  onSnapshot: (snapshot: TilingWorkspaceSwipeSnapshot) => void;
}): null {
  const snapshot: TilingWorkspaceSwipeSnapshot = useWorkspaceSwipe();
  React.useEffect((): void => {
    onSnapshot(snapshot);
  }, [snapshot, onSnapshot]);
  return null;
}

function Harness({ onSnapshot, interaction, ...props }: HarnessProps): React.ReactElement {
  const renderer: React.ReactElement = React.createElement(TilingRenderer, {
    tiles: TILES,
    config: { gapPx: 8, minPaneSizePx: 100, handleSizePx: 6 },
    interaction: {
      dragRecovery: { enable: false },
      paneSwitching: { showTabStrip: false, showSwitcherOverlay: false },
      ...interaction,
    },
    renderTile,
    ...props,
  });
  if (onSnapshot == null) {
    return renderer;
  }
  return React.createElement(
    TilingWorkspaceSwipeScope,
    null,
    React.createElement(SwipeProbe, { onSnapshot }),
    renderer,
  );
}

function root(result: RenderResult): HTMLElement {
  const element: HTMLElement | null = result.container.querySelector<HTMLElement>(".hpt-root");
  if (element == null) {
    throw new Error("hpt-root not rendered");
  }
  return element;
}

function wheel(target: EventTarget, deltaX: number, deltaY: number = 0): void {
  act((): void => {
    target.dispatchEvent(
      new WheelEvent("wheel", { deltaX, deltaY, bubbles: true, cancelable: true }),
    );
  });
}

// A burst of horizontal wheel samples `gapMs` apart (default 8 ms, a fast
// trackpad); the caller adds the wheel-idle gap.
function wheelBurst(target: EventTarget, stepPx: number, steps: number, gapMs: number = 8): void {
  for (let i: number = 0; i < steps; i += 1) {
    wheel(target, stepPx);
    act((): void => {
      jest.advanceTimersByTime(gapMs);
    });
  }
}

function settleWheelIdle(): void {
  act((): void => {
    jest.advanceTimersByTime(TILING_WORKSPACE_SWIPE_DEFAULTS.wheelIdleMs + 5);
  });
}

interface Controlled {
  result: RenderResult;
  onWorkspacesChange: jest.Mock<(next: TilingWorkspaceSet) => void>;
  onWorkspaceSwitch: jest.Mock<(event: TilingWorkspaceSwitchEvent) => void>;
}

function renderControlled(props: Omit<HarnessProps, "workspaces" | "onWorkspacesChange">): Controlled {
  const onWorkspacesChange = jest.fn((_next: TilingWorkspaceSet): void => {});
  const onWorkspaceSwitch = jest.fn((_event: TilingWorkspaceSwitchEvent): void => {});
  const result: RenderResult = render(
    React.createElement(Harness, {
      workspaces: threeWorkspaces(),
      onWorkspacesChange,
      onWorkspaceSwitch,
      ...props,
    }),
  );
  return { result, onWorkspacesChange, onWorkspaceSwitch };
}

describe("TilingRenderer set mode — wheel swipe navigation (N1)", (): void => {
  it("a horizontal wheel burst past the commit fraction cycles to the next workspace via swipe", (): void => {
    const { result, onWorkspacesChange, onWorkspaceSwitch } = renderControlled({
      interaction: { workspaces: { switch: { wheelSwipe: true } } },
    });
    const host: HTMLElement = root(result);
    expect(host.style.overscrollBehaviorX).toBe("contain");
    expect(host.style.touchAction).toBeFalsy();

    // 12 × 40 px = 480 px of an 800 px (config fallback) viewport = 0.6 > 0.35.
    wheelBurst(host, 40, 12);
    expect(onWorkspacesChange).not.toHaveBeenCalled();
    settleWheelIdle();

    expect(onWorkspacesChange).toHaveBeenCalledTimes(1);
    const next: TilingWorkspaceSet = onWorkspacesChange.mock.calls[0]![0];
    expect(next.activeId).toBe("ops");
    expect(onWorkspaceSwitch).toHaveBeenCalledWith({ from: "main", to: "ops", via: "swipe" });
  });

  it("a leftward burst cycles to the previous workspace; the first workspace has no previous", (): void => {
    const previous: Controlled = renderControlled({
      interaction: { workspaces: { switch: { wheelSwipe: true } } },
    });
    // Active "main" is first: a leftward swipe has no neighbour and never arms.
    wheelBurst(root(previous.result), -40, 12);
    settleWheelIdle();
    expect(previous.onWorkspacesChange).not.toHaveBeenCalled();
    cleanup();

    const onWorkspacesChange = jest.fn((_next: TilingWorkspaceSet): void => {});
    const onWorkspaceSwitch = jest.fn((_event: TilingWorkspaceSwitchEvent): void => {});
    const result: RenderResult = render(
      React.createElement(Harness, {
        workspaces: threeWorkspaces("ops"),
        onWorkspacesChange,
        onWorkspaceSwitch,
        interaction: { workspaces: { switch: { wheelSwipe: true } } },
      }),
    );
    wheelBurst(root(result), -40, 12);
    settleWheelIdle();
    expect(onWorkspacesChange.mock.calls[0]![0].activeId).toBe("main");
    expect(onWorkspaceSwitch).toHaveBeenCalledWith({ from: "ops", to: "main", via: "swipe" });
  });

  it("does nothing when the switch capability is left at its default (off)", (): void => {
    const { result, onWorkspacesChange, onWorkspaceSwitch } = renderControlled({});
    const host: HTMLElement = root(result);
    expect(host.style.overscrollBehaviorX).toBe("");
    wheelBurst(host, 40, 12);
    settleWheelIdle();
    expect(onWorkspacesChange).not.toHaveBeenCalled();
    expect(onWorkspaceSwitch).not.toHaveBeenCalled();
  });

  it("does not arm while an inner element under the pointer can still scroll on X", (): void => {
    const { result, onWorkspacesChange } = renderControlled({
      interaction: { workspaces: { switch: { wheelSwipe: true } } },
    });
    const scroller: HTMLElement | null = result.container.querySelector<HTMLElement>(
      '[data-testid="x-scroller"]',
    );
    if (scroller == null) {
      throw new Error("x-scroller not rendered");
    }
    // jsdom has no layout: give the strip a scrollable extent by hand.
    Object.defineProperty(scroller, "scrollWidth", { value: 600, configurable: true });
    Object.defineProperty(scroller, "clientWidth", { value: 200, configurable: true });
    scroller.scrollLeft = 0;

    wheelBurst(scroller, 40, 12);
    settleWheelIdle();
    expect(onWorkspacesChange).not.toHaveBeenCalled();

    // At its right bound the chain is exhausted and the same burst arms.
    scroller.scrollLeft = 400;
    wheelBurst(scroller, 40, 12);
    settleWheelIdle();
    expect(onWorkspacesChange).toHaveBeenCalledTimes(1);
    expect(onWorkspacesChange.mock.calls[0]![0].activeId).toBe("ops");
  });

  it("a short burst under the commit fraction cancels back to idle without switching", (): void => {
    const { result, onWorkspacesChange } = renderControlled({
      interaction: { workspaces: { switch: { wheelSwipe: true } } },
    });
    // 3 × 30 px = 90 px = 0.11 of 800 px, 100 ms apart = 0.3 px/ms: under both
    // the commit fraction (0.35) and the commit velocity (0.6 px/ms).
    wheelBurst(root(result), 30, 3, 100);
    settleWheelIdle();
    expect(onWorkspacesChange).not.toHaveBeenCalled();
  });

  it("honours the lockout: a second burst inside lockoutMs is swallowed", (): void => {
    const { result, onWorkspacesChange } = renderControlled({
      interaction: { workspaces: { switch: { wheelSwipe: true } } },
    });
    const host: HTMLElement = root(result);
    wheelBurst(host, 40, 12);
    settleWheelIdle();
    expect(onWorkspacesChange).toHaveBeenCalledTimes(1);

    // The controlled harness still shows "main"; a burst right away is swallowed.
    wheelBurst(host, 40, 12);
    settleWheelIdle();
    expect(onWorkspacesChange).toHaveBeenCalledTimes(1);

    act((): void => {
      jest.advanceTimersByTime(TILING_WORKSPACE_SWIPE_DEFAULTS.lockoutMs + 5);
    });
    wheelBurst(host, 40, 12);
    settleWheelIdle();
    expect(onWorkspacesChange).toHaveBeenCalledTimes(2);
  });

  it("touchSwipe sets touch-action: pan-y on the root", (): void => {
    const { result } = renderControlled({
      interaction: { workspaces: { switch: { wheelSwipe: true, touchSwipe: true } } },
    });
    const host: HTMLElement = root(result);
    expect(host.style.touchAction).toBe("pan-y");
    expect(host.style.overscrollBehaviorX).toBe("contain");
  });
});

describe("useWorkspaceSwipe under TilingWorkspaceSwipeScope", (): void => {
  it("reports progress and target while tracking, then idle after the commit", (): void => {
    const seen: TilingWorkspaceSwipeSnapshot[] = [];
    const onSnapshot = (snapshot: TilingWorkspaceSwipeSnapshot): void => {
      seen.push(snapshot);
    };
    const { result, onWorkspacesChange } = renderControlled({
      interaction: { workspaces: { switch: { wheelSwipe: true } } },
      onSnapshot,
    });
    expect(seen[0]).toEqual({ progress: 0, target: null, phase: "idle" });

    wheelBurst(root(result), 40, 12);
    const tracking: TilingWorkspaceSwipeSnapshot | undefined = seen.find(
      (snapshot: TilingWorkspaceSwipeSnapshot): boolean => snapshot.phase === "tracking",
    );
    expect(tracking).toBeDefined();
    expect(tracking!.target).toBe("next");
    const last: TilingWorkspaceSwipeSnapshot = seen[seen.length - 1]!;
    expect(last.phase).toBe("tracking");
    expect(last.progress).toBeCloseTo(480 / 800, 5);

    settleWheelIdle();
    expect(onWorkspacesChange).toHaveBeenCalledTimes(1);
    expect(seen[seen.length - 1]!.phase).toBe("lockout");
    act((): void => {
      jest.advanceTimersByTime(TILING_WORKSPACE_SWIPE_DEFAULTS.lockoutMs + 5);
    });
    expect(seen[seen.length - 1]).toEqual({ progress: 0, target: null, phase: "idle" });
  });

  it("is the idle snapshot outside any scope", (): void => {
    const seen: TilingWorkspaceSwipeSnapshot[] = [];
    render(
      React.createElement(SwipeProbe, {
        onSnapshot: (snapshot: TilingWorkspaceSwipeSnapshot): void => {
          seen.push(snapshot);
        },
      }),
    );
    expect(seen).toEqual([{ progress: 0, target: null, phase: "idle" }]);
  });
});
