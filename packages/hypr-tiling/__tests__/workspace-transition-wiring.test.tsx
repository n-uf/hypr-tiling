/**
 * @jest-environment jsdom
 *
 * N2 wiring (H6): `interaction.workspaces.switch.transition` mounts the
 * `WorkspaceTransitionStage` inside the set-mode viewport and the wrapper
 * drives it — `begin` BEFORE the tree swaps (the frozen clone shows the
 * OUTGOING workspace), `finish("commit")` once the incoming tree is live,
 * host-driven `activeId` changes caught pre-mutation by the sentinel, a
 * tracking swipe scrubbing the stage and a cancelled swipe settling it back,
 * `"none"` mounting no stage at all, and reduced motion resolving to none.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as React from "react";
import { act, cleanup, render, type RenderResult } from "@testing-library/react";
import { TilingRenderer } from "../react/tiling-renderer";
import { TilingWorkspaceSwipeScope, useWorkspaceSwipe } from "../react/use-workspace-swipe";
import { WORKSPACE_TRANSITION_CLONE_ATTR } from "../react/dom-view-capture";
import { resolveTilingTheme, type TilingTheme } from "../react/theme";
import type { TilingWorkspaceSet } from "../engine/workspace-set";
import { TILING_WORKSPACE_SWIPE_DEFAULTS } from "../engine/workspace-navigation";
import type {
  TilingCommandHandle,
  TilingInteractionCapabilities,
  TilingLayoutNode,
  TilingLeafNode,
  TilingRenderTileProps,
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
  delete (window as { matchMedia?: unknown }).matchMedia;
});

function leaf(id: string): TilingLeafNode {
  return { kind: "leaf", id: `leaf:${id}`, tileId: id };
}

function split(id: string, first: TilingLayoutNode, second: TilingLayoutNode): TilingSplitNode {
  return { kind: "split", id, axis: "horizontal", ratio: 0.5, first, second };
}

const TILES: ReadonlyArray<TilingTile> = ["a", "b", "c"].map(
  (id: string): TilingTile => ({ id, title: `tile-${id}`, accent: "amber" }),
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
    React.createElement("span", { "data-title": args.tile.id }, args.tile.title),
  );
}

/** A 20 ms transition so a settle is a couple of frames away, never a whole 200 ms. */
const FAST_THEME: TilingTheme = {
  ...resolveTilingTheme(undefined),
  workspaceTransition: { durationMs: 20 },
};

/** A 200 ms transition for the settle-gate rows: a settle held over many frames. */
const SLOW_THEME: TilingTheme = {
  ...resolveTilingTheme(undefined),
  workspaceTransition: { durationMs: 200 },
};

interface HostProps {
  readonly initial: TilingWorkspaceSet;
  readonly interaction?: TilingInteractionCapabilities;
  /** Theme; default {@link FAST_THEME}. */
  readonly theme?: TilingTheme;
  readonly handleRef?: React.RefObject<TilingCommandHandle | null>;
  readonly onWorkspaceSwitch?: (event: TilingWorkspaceSwitchEvent) => void;
  readonly setRef?: React.RefObject<((next: TilingWorkspaceSet) => void) | null>;
  readonly transitionOff?: boolean;
}

/** A controlled host that APPLIES every emitted set (the ordinary consumer). */
function Host({ initial, interaction, theme, handleRef, onWorkspaceSwitch, setRef, transitionOff }: HostProps): React.ReactElement {
  const [set, setSet] = React.useState<TilingWorkspaceSet>(initial);
  if (setRef != null) {
    (setRef as { current: ((next: TilingWorkspaceSet) => void) | null }).current = setSet;
  }
  return React.createElement(TilingRenderer, {
    ref: handleRef,
    workspaces: set,
    onWorkspacesChange: setSet,
    onWorkspaceSwitch,
    tiles: TILES,
    config: { gapPx: 8, minPaneSizePx: 100, handleSizePx: 6 },
    theme: theme ?? FAST_THEME,
    paneIdentity: "stable",
    interaction: {
      dragRecovery: { enable: false },
      paneSwitching: { showTabStrip: false, showSwitcherOverlay: false },
      workspaces: { switch: transitionOff === true ? {} : { transition: "slide" } },
      ...interaction,
    },
    renderTile,
  });
}

function root(result: RenderResult): HTMLElement {
  const element: HTMLElement | null = result.container.querySelector<HTMLElement>(".hpt-root");
  if (element == null) {
    throw new Error("hpt-root not rendered");
  }
  return element;
}

function stage(result: RenderResult): HTMLElement | null {
  return result.container.querySelector<HTMLElement>("[data-hpt-workspace-transition]");
}

function clone(result: RenderResult): HTMLElement | null {
  return result.container.querySelector<HTMLElement>(`[${WORKSPACE_TRANSITION_CLONE_ATTR}]`);
}

function incomingLayer(result: RenderResult): HTMLElement {
  const element: HTMLElement | null = result.container.querySelector<HTMLElement>(
    "[data-hpt-workspace-transition-incoming]",
  );
  if (element == null) {
    throw new Error("incoming layer not rendered");
  }
  return element;
}

/** Tile ids painted in the LIVE tree (never inside the clone or the pool). */
function liveTileIds(result: RenderResult): ReadonlyArray<string> {
  return Array.from(result.container.querySelectorAll<HTMLElement>('article[data-surface="pane"]'))
    .filter(
      (article: HTMLElement): boolean =>
        article.closest("[data-hpt-pane-pool]") == null &&
        article.closest(`[${WORKSPACE_TRANSITION_CLONE_ATTR}]`) == null,
    )
    .map((article: HTMLElement): string => article.getAttribute("data-tile-id") ?? "")
    .sort();
}

function settleTransition(ms: number = 200): void {
  // Fake timers drive jsdom's rAF; ~10 frames comfortably exceed the 20 ms
  // curve (pass a longer span for `SLOW_THEME`).
  act((): void => {
    jest.advanceTimersByTime(ms);
  });
}

function wheel(target: EventTarget, deltaX: number): void {
  act((): void => {
    target.dispatchEvent(new WheelEvent("wheel", { deltaX, deltaY: 0, bubbles: true, cancelable: true }));
  });
}

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

describe("N2 wiring — transition capability on the set-mode renderer", (): void => {
  it("`transition: \"slide\"` mounts the stage inside the viewport around the tree", (): void => {
    const result: RenderResult = render(React.createElement(Host, { initial: threeWorkspaces() }));
    const stageElement: HTMLElement | null = stage(result);
    expect(stageElement).not.toBeNull();
    // Inside the renderer root, wrapping the live tree.
    expect(stageElement?.closest(".hpt-root")).toBe(root(result));
    expect(stageElement?.querySelector('article[data-tile-id="a"]')).not.toBeNull();
    expect(clone(result)).toBeNull();
  });

  it("the default (`none`) mounts no stage and a switch produces no clone", (): void => {
    const handleRef: React.RefObject<TilingCommandHandle | null> = React.createRef<TilingCommandHandle>();
    const result: RenderResult = render(
      React.createElement(Host, { initial: threeWorkspaces(), handleRef, transitionOff: true }),
    );
    expect(stage(result)).toBeNull();
    act((): void => {
      handleRef.current?.dispatch({ kind: "switch-workspace", workspaceId: "ops" });
    });
    expect(liveTileIds(result)).toEqual(["a", "c"]);
    expect(stage(result)).toBeNull();
    expect(clone(result)).toBeNull();
  });

  it("a switch through the handle begins the stage BEFORE the tree swaps: the clone shows the outgoing workspace", (): void => {
    const handleRef: React.RefObject<TilingCommandHandle | null> = React.createRef<TilingCommandHandle>();
    const onWorkspaceSwitch = jest.fn((_event: TilingWorkspaceSwitchEvent): void => {});
    const result: RenderResult = render(
      React.createElement(Host, { initial: threeWorkspaces(), handleRef, onWorkspaceSwitch }),
    );
    act((): void => {
      handleRef.current?.dispatch({ kind: "switch-workspace", workspaceId: "ops" });
    });
    // Live tree is ops (a | c) …
    expect(liveTileIds(result)).toEqual(["a", "c"]);
    expect(onWorkspaceSwitch).toHaveBeenCalledWith({ from: "main", to: "ops", via: "command" });
    // … while the frozen clone still paints main (a | b): capture happened pre-swap.
    const frozen: HTMLElement | null = clone(result);
    expect(frozen).not.toBeNull();
    expect(frozen?.textContent).toContain("tile-b");
    expect(frozen?.textContent).not.toContain("tile-c");
    // main → ops is `next`: the incoming layer starts off to the right.
    expect(incomingLayer(result).style.transform).toMatch(/translateX\(/);
    // The commit curve runs and the clone is dropped.
    settleTransition();
    expect(clone(result)).toBeNull();
    expect(incomingLayer(result).style.transform).toBe("none");
  });

  it("a cycle-workspace wrap-around keeps the cycle's own direction (`previous` from the first tab slides prev)", (): void => {
    const handleRef: React.RefObject<TilingCommandHandle | null> = React.createRef<TilingCommandHandle>();
    const result: RenderResult = render(React.createElement(Host, { initial: threeWorkspaces(), handleRef }));
    act((): void => {
      handleRef.current?.dispatch({ kind: "cycle-workspace", direction: "previous" });
    });
    expect(liveTileIds(result)).toEqual(["c"]);
    // `prev`: incoming enters from the LEFT (negative translate).
    expect(incomingLayer(result).style.transform).toMatch(/translateX\(-/);
    settleTransition();
    expect(clone(result)).toBeNull();
  });

  it("a host-driven `activeId` change (no renderer command) is captured pre-mutation by the sentinel", (): void => {
    const setRef: React.RefObject<((next: TilingWorkspaceSet) => void) | null> = React.createRef();
    const result: RenderResult = render(React.createElement(Host, { initial: threeWorkspaces(), setRef }));
    act((): void => {
      setRef.current?.(threeWorkspaces("spare"));
    });
    expect(liveTileIds(result)).toEqual(["c"]);
    const frozen: HTMLElement | null = clone(result);
    expect(frozen).not.toBeNull();
    expect(frozen?.textContent).toContain("tile-a");
    expect(frozen?.textContent).toContain("tile-b");
    settleTransition();
    expect(clone(result)).toBeNull();
  });

  it("a tracking swipe scrubs the stage; releasing short of the commit fraction cancels it", (): void => {
    const result: RenderResult = render(
      React.createElement(Host, {
        initial: threeWorkspaces(),
        interaction: { workspaces: { switch: { wheelSwipe: true, transition: "slide" } } },
      }),
    );
    const host: HTMLElement = root(result);
    // 4 × 40 px = 160 px of 800 px = 0.2 < 0.35 commit fraction, paced at
    // 0.4 px/ms (below the 0.6 px/ms velocity commit).
    wheelBurst(host, 40, 4, 100);
    const frozen: HTMLElement | null = clone(result);
    expect(frozen).not.toBeNull();
    expect(frozen?.textContent).toContain("tile-b");
    // Scrubbed: incoming sits at (1 − 0.2) × 100 % = 80 %.
    expect(incomingLayer(result).style.transform).toBe("translateX(80%)");
    expect(liveTileIds(result)).toEqual(["a", "b"]);

    settleWheelIdle();
    // Cancelled: no switch, the stage settles back and drops the clone.
    settleTransition();
    expect(liveTileIds(result)).toEqual(["a", "b"]);
    expect(clone(result)).toBeNull();
    expect(incomingLayer(result).style.transform).toBe("none");
  });

  it("a committed swipe keeps the swipe's capture (no re-begin) and settles over the incoming tree", (): void => {
    const onWorkspaceSwitch = jest.fn((_event: TilingWorkspaceSwitchEvent): void => {});
    const result: RenderResult = render(
      React.createElement(Host, {
        initial: threeWorkspaces(),
        onWorkspaceSwitch,
        interaction: { workspaces: { switch: { wheelSwipe: true, transition: "slide" } } },
      }),
    );
    const host: HTMLElement = root(result);
    // 12 × 40 px = 480 px = 0.6 > 0.35.
    wheelBurst(host, 40, 12);
    const frozen: HTMLElement | null = clone(result);
    expect(frozen).not.toBeNull();
    expect(incomingLayer(result).style.transform).toBe("translateX(40%)");

    settleWheelIdle();
    expect(onWorkspaceSwitch).toHaveBeenCalledWith({ from: "main", to: "ops", via: "swipe" });
    expect(liveTileIds(result)).toEqual(["a", "c"]);
    // Same clone node — the commit did not re-capture.
    expect(clone(result)).toBe(frozen);
    settleTransition();
    expect(clone(result)).toBeNull();
    expect(incomingLayer(result).style.transform).toBe("none");
  });

  it("`prefers-reduced-motion: reduce` resolves the transition to none: a switch mounts no clone", (): void => {
    (window as { matchMedia?: unknown }).matchMedia = (query: string): MediaQueryList =>
      ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        onchange: null,
        addEventListener: (): void => {},
        removeEventListener: (): void => {},
        addListener: (): void => {},
        removeListener: (): void => {},
        dispatchEvent: (): boolean => false,
      }) as MediaQueryList;
    const handleRef: React.RefObject<TilingCommandHandle | null> = React.createRef<TilingCommandHandle>();
    const result: RenderResult = render(React.createElement(Host, { initial: threeWorkspaces(), handleRef }));
    expect(stage(result)).not.toBeNull();
    act((): void => {
      handleRef.current?.dispatch({ kind: "switch-workspace", workspaceId: "ops" });
    });
    expect(liveTileIds(result)).toEqual(["a", "c"]);
    expect(clone(result)).toBeNull();
    expect(incomingLayer(result).style.transform).toBe("none");
  });
});

/** Publishes the swipe FSM phase the host reads through `useWorkspaceSwipe`. */
function SwipePhaseProbe(): React.ReactElement {
  const snapshot = useWorkspaceSwipe();
  return React.createElement("output", { "data-swipe-phase": snapshot.phase });
}

/** `Host` under a swipe scope with the phase probe beside it. */
function ScopedHost(props: HostProps): React.ReactElement {
  return React.createElement(
    TilingWorkspaceSwipeScope,
    null,
    React.createElement(SwipePhaseProbe),
    React.createElement(Host, props),
  );
}

function swipePhase(result: RenderResult): string | null {
  return result.container.querySelector<HTMLElement>("[data-swipe-phase]")?.getAttribute("data-swipe-phase") ?? null;
}

/**
 * Step frames until the stage drops its clone, asserting the FSM phase is
 * `heldPhase` on every frame the clone is still painted. Returns the number
 * of frames the settle was held (≥ 1).
 */
function stepUntilCloneDropped(result: RenderResult, heldPhase: string): number {
  let frames: number = 0;
  while (clone(result) != null) {
    expect(swipePhase(result)).toBe(heldPhase);
    act((): void => {
      jest.advanceTimersByTime(16);
    });
    frames += 1;
    if (frames > 100) {
      throw new Error("stage never settled");
    }
  }
  return frames;
}

function settleLockout(): void {
  act((): void => {
    jest.advanceTimersByTime(TILING_WORKSPACE_SWIPE_DEFAULTS.lockoutMs + 5);
  });
}

describe("N1 × N2 — the swipe FSM's SETTLE_DONE waits for the switch transition", (): void => {
  it("a committed swipe with `slide` stays `settling` while the stage animates, then enters `lockout` when the clone drops", (): void => {
    const onWorkspaceSwitch = jest.fn((_event: TilingWorkspaceSwitchEvent): void => {});
    const result: RenderResult = render(
      React.createElement(ScopedHost, {
        initial: threeWorkspaces(),
        onWorkspaceSwitch,
        theme: SLOW_THEME,
        interaction: { workspaces: { switch: { wheelSwipe: true, transition: "slide" } } },
      }),
    );
    const host: HTMLElement = root(result);
    wheelBurst(host, 40, 12);
    expect(swipePhase(result)).toBe("tracking");
    settleWheelIdle();
    // The switch landed and the incoming tree is live, but the FSM is HELD
    // in `settling` for as long as the stage still paints the clone.
    expect(onWorkspaceSwitch).toHaveBeenCalledWith({ from: "main", to: "ops", via: "swipe" });
    expect(liveTileIds(result)).toEqual(["a", "c"]);
    expect(clone(result)).not.toBeNull();
    expect(swipePhase(result)).toBe("settling");
    // Held frame after frame while the clone is painted …
    const heldFrames: number = stepUntilCloneDropped(result, "settling");
    expect(heldFrames).toBeGreaterThanOrEqual(2);
    // … and released into `lockout` (the commit edge) the moment it drops.
    expect(swipePhase(result)).toBe("lockout");
    settleLockout();
    expect(swipePhase(result)).toBe("idle");
  });

  it("a cancelled swipe with `slide` stays `settling` until the stage has slid back, then goes `idle`", (): void => {
    const result: RenderResult = render(
      React.createElement(ScopedHost, {
        initial: threeWorkspaces(),
        theme: SLOW_THEME,
        interaction: { workspaces: { switch: { wheelSwipe: true, transition: "slide" } } },
      }),
    );
    const host: HTMLElement = root(result);
    wheelBurst(host, 40, 4, 100);
    expect(swipePhase(result)).toBe("tracking");
    settleWheelIdle();
    expect(liveTileIds(result)).toEqual(["a", "b"]);
    expect(clone(result)).not.toBeNull();
    expect(swipePhase(result)).toBe("settling");
    const heldFrames: number = stepUntilCloneDropped(result, "settling");
    expect(heldFrames).toBeGreaterThanOrEqual(2);
    // Released into `idle` (the cancel edge) the moment the clone drops.
    expect(swipePhase(result)).toBe("idle");
    expect(incomingLayer(result).style.transform).toBe("none");
  });

  it("with the default transition (`none`) the settle is immediate: commit lands straight in `lockout`", (): void => {
    const result: RenderResult = render(
      React.createElement(ScopedHost, {
        initial: threeWorkspaces(),
        transitionOff: true,
        interaction: { workspaces: { switch: { wheelSwipe: true } } },
      }),
    );
    const host: HTMLElement = root(result);
    wheelBurst(host, 40, 12);
    settleWheelIdle();
    expect(liveTileIds(result)).toEqual(["a", "c"]);
    expect(swipePhase(result)).toBe("lockout");
    settleLockout();
    expect(swipePhase(result)).toBe("idle");
  });

  it("with `none` a cancelled swipe settles to `idle` at once", (): void => {
    const result: RenderResult = render(
      React.createElement(ScopedHost, {
        initial: threeWorkspaces(),
        transitionOff: true,
        interaction: { workspaces: { switch: { wheelSwipe: true } } },
      }),
    );
    wheelBurst(root(result), 40, 4, 100);
    settleWheelIdle();
    expect(swipePhase(result)).toBe("idle");
  });

  it("`prefers-reduced-motion` (stage resolves to none) settles synchronously: no held phase", (): void => {
    (window as { matchMedia?: unknown }).matchMedia = (query: string): MediaQueryList =>
      ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        onchange: null,
        addEventListener: (): void => {},
        removeEventListener: (): void => {},
        addListener: (): void => {},
        removeListener: (): void => {},
        dispatchEvent: (): boolean => false,
      }) as MediaQueryList;
    const result: RenderResult = render(
      React.createElement(ScopedHost, {
        initial: threeWorkspaces(),
        interaction: { workspaces: { switch: { wheelSwipe: true, transition: "slide" } } },
      }),
    );
    wheelBurst(root(result), 40, 12);
    settleWheelIdle();
    expect(liveTileIds(result)).toEqual(["a", "c"]);
    expect(clone(result)).toBeNull();
    expect(swipePhase(result)).toBe("lockout");
  });

  it("disabling the swipe input mid-hold force-settles: the FSM does not stay `settling`", (): void => {
    const result: RenderResult = render(
      React.createElement(ScopedHost, {
        initial: threeWorkspaces(),
        theme: SLOW_THEME,
        interaction: { workspaces: { switch: { wheelSwipe: true, transition: "slide" } } },
      }),
    );
    wheelBurst(root(result), 40, 12);
    settleWheelIdle();
    expect(swipePhase(result)).toBe("settling");
    result.rerender(
      React.createElement(ScopedHost, {
        initial: threeWorkspaces(),
        theme: SLOW_THEME,
        interaction: { workspaces: { switch: { wheelSwipe: false, transition: "slide" } } },
      }),
    );
    expect(swipePhase(result)).toBe("idle");
    // The late stage settle is inert.
    settleTransition(400);
    expect(clone(result)).toBeNull();
    expect(swipePhase(result)).toBe("idle");
  });
});
