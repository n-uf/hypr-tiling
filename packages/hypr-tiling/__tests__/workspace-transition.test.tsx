/**
 * @jest-environment jsdom
 *
 * Workspace-switch transition stage (N2): viewport capture (id / hit-test
 * strip, canvas copy, degraded fallback), slide / fade styles, reduced
 * motion, scrub → finish commit / cancel, clone cleanup on unmount, and
 * a second `begin` mid-flight replacing the clone.
 */
import { afterEach, beforeAll, describe, expect, it, jest } from "@jest/globals";
import * as React from "react";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import {
  HIT_TEST_DATA_ATTRIBUTES,
  VIEW_CAPTURE_CANVAS_PIXEL_BUDGET,
  WORKSPACE_TRANSITION_CLONE_ATTR,
  captureViewClone,
} from "../react/dom-view-capture";
import {
  WorkspaceTransitionStage,
  useWorkspaceTransition,
  type UseWorkspaceTransitionResult,
  type WorkspaceTransitionSettleKind,
} from "../react/workspace-transition";
import {
  resolveTilingTheme,
  resolveWorkspaceTransition,
} from "../react/theme";
import {
  DEFAULT_WORKSPACE_TRANSITION_DURATION_MS,
  DEFAULT_WORKSPACE_TRANSITION_EASING,
} from "../engine/workspace-transition";

type CanvasGetContext = typeof HTMLCanvasElement.prototype.getContext;

interface DrawImageSpy {
  calls: number;
  lastSource: CanvasImageSource | null;
}

function installCanvasContextMock(options: {
  throwOnDraw?: boolean;
  nullContext?: boolean;
  spy: DrawImageSpy;
}): () => void {
  const original: CanvasGetContext = HTMLCanvasElement.prototype.getContext;
  const mockGetContext: CanvasGetContext = ((
    contextId: string,
  ): CanvasRenderingContext2D | null => {
    if (contextId !== "2d") {
      return null;
    }
    if (options.nullContext === true) {
      return null;
    }
    const ctx: Pick<CanvasRenderingContext2D, "drawImage"> = {
      drawImage: (
        image: CanvasImageSource,
        dx: number,
        dy: number,
      ): void => {
        void dx;
        void dy;
        if (options.throwOnDraw === true) {
          throw new Error("tainted canvas");
        }
        options.spy.calls += 1;
        options.spy.lastSource = image;
      },
    };
    return ctx as CanvasRenderingContext2D;
  }) as CanvasGetContext;
  HTMLCanvasElement.prototype.getContext = mockGetContext;
  return (): void => {
    HTMLCanvasElement.prototype.getContext = original;
  };
}

function viewportFixture(html: string): HTMLElement {
  const root: HTMLDivElement = document.createElement("div");
  root.setAttribute("data-testid", "viewport");
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

beforeAll((): void => {
  if (typeof window.requestAnimationFrame !== "function") {
    window.requestAnimationFrame = (callback: FrameRequestCallback): number =>
      window.setTimeout((): void => callback(performance.now()), 0);
    window.cancelAnimationFrame = (handle: number): void => {
      window.clearTimeout(handle);
    };
  }
});

afterEach((): void => {
  cleanup();
  document.body.replaceChildren();
});

describe("captureViewClone", (): void => {
  it("strips ids and renderer hit-test data attrs and marks the clone inert", (): void => {
    const root: HTMLElement = viewportFixture(
      `<article id="pane-a" data-leaf-id="leaf-a" data-hpt-pane="tile-a" data-hpt-pane-slot="tile-a">
         <button id="btn" data-drag-source-pane="" data-drop-target-pane="">go</button>
       </article>`,
    );
    const captured = captureViewClone(root);
    expect(captured.degraded).toBe(false);
    expect(captured.node.getAttribute("aria-hidden")).toBe("true");
    expect(captured.node.style.pointerEvents).toBe("none");
    expect(captured.node.getAttribute(WORKSPACE_TRANSITION_CLONE_ATTR)).toBe("");
    expect(captured.node.hasAttribute("inert")).toBe(true);
    expect(captured.node.querySelector("#pane-a")).toBeNull();
    expect(captured.node.querySelector("#btn")).toBeNull();
    expect(captured.node.querySelector("[data-leaf-id]")).toBeNull();
    expect(captured.node.querySelector("[data-hpt-pane]")).toBeNull();
    expect(captured.node.querySelector("[data-hpt-pane-slot]")).toBeNull();
    expect(captured.node.querySelector("[data-drag-source-pane]")).toBeNull();
    expect(captured.node.querySelector("[data-drop-target-pane]")).toBeNull();
    for (const name of HIT_TEST_DATA_ATTRIBUTES) {
      expect(captured.node.querySelector(`[${name}]`)).toBeNull();
    }
    expect(root.querySelector("#pane-a")).not.toBeNull();
    expect(root.querySelector("[data-leaf-id='leaf-a']")).not.toBeNull();
  });

  it("copies each canvas bitmap via drawImage at the source intrinsic size", (): void => {
    const spy: DrawImageSpy = { calls: 0, lastSource: null };
    const restore: () => void = installCanvasContextMock({ spy });
    try {
      const root: HTMLElement = viewportFixture(`<canvas width="12" height="8"></canvas>`);
      const source: HTMLCanvasElement | null = root.querySelector("canvas");
      expect(source).not.toBeNull();
      if (source == null) {
        return;
      }
      source.width = 12;
      source.height = 8;
      const captured = captureViewClone(root);
      expect(captured.degraded).toBe(false);
      expect(spy.calls).toBe(1);
      expect(spy.lastSource).toBe(source);
      const cloneCanvas: HTMLCanvasElement | null =
        captured.node.querySelector("canvas");
      expect(cloneCanvas).not.toBeNull();
      if (cloneCanvas == null) {
        return;
      }
      expect(cloneCanvas.width).toBe(12);
      expect(cloneCanvas.height).toBe(8);
    } finally {
      restore();
    }
  });

  it("marks the capture degraded when drawImage throws (tainted)", (): void => {
    const spy: DrawImageSpy = { calls: 0, lastSource: null };
    const restore: () => void = installCanvasContextMock({
      throwOnDraw: true,
      spy,
    });
    try {
      const root: HTMLElement = viewportFixture(`<canvas width="4" height="4"></canvas>`);
      const captured = captureViewClone(root);
      expect(captured.degraded).toBe(true);
    } finally {
      restore();
    }
  });

  it("marks the capture degraded when a canvas exceeds the pixel budget", (): void => {
    const spy: DrawImageSpy = { calls: 0, lastSource: null };
    const restore: () => void = installCanvasContextMock({ spy });
    try {
      const root: HTMLElement = viewportFixture(`<canvas></canvas>`);
      const source: HTMLCanvasElement | null = root.querySelector("canvas");
      expect(source).not.toBeNull();
      if (source == null) {
        return;
      }
      source.width = 4000;
      source.height = 4001;
      expect(source.width * source.height).toBeGreaterThan(
        VIEW_CAPTURE_CANVAS_PIXEL_BUDGET,
      );
      const captured = captureViewClone(root);
      expect(captured.degraded).toBe(true);
      expect(spy.calls).toBe(0);
    } finally {
      restore();
    }
  });
});

describe("resolveWorkspaceTransition theme tokens", (): void => {
  it("fills duration / easing from library defaults when a theme omits the slot", (): void => {
    const tokens = resolveWorkspaceTransition(resolveTilingTheme("neon-terminal"));
    expect(tokens.durationMs).toBe(DEFAULT_WORKSPACE_TRANSITION_DURATION_MS);
    expect(tokens.easing).toBe(DEFAULT_WORKSPACE_TRANSITION_EASING);
  });
});

interface HookHarness {
  readonly viewport: HTMLElement;
  readonly result: { current: UseWorkspaceTransitionResult };
  readonly onSettled: jest.Mock<(kind: WorkspaceTransitionSettleKind) => void>;
}

function renderTransitionHook(options: {
  mode?: "none" | "slide" | "fade";
  reducedMotion?: boolean;
  durationMs?: number;
  html?: string;
}): HookHarness {
  const viewport: HTMLElement = viewportFixture(
    options.html ??
      `<article id="live-pane" data-leaf-id="leaf-live">live</article>`,
  );
  const viewportRef: React.RefObject<HTMLElement | null> = {
    current: viewport,
  };
  const onSettled: jest.Mock<(kind: WorkspaceTransitionSettleKind) => void> =
    jest.fn<(kind: WorkspaceTransitionSettleKind) => void>();
  const rendered = renderHook(
    (): UseWorkspaceTransitionResult =>
      useWorkspaceTransition({
        viewportRef,
        mode: options.mode ?? "slide",
        reducedMotion: options.reducedMotion,
        durationMs: options.durationMs ?? 0,
        onSettled,
      }),
  );
  return { viewport, result: rendered.result, onSettled };
}

describe("useWorkspaceTransition — slide / fade styles", (): void => {
  it("emits slide transforms for next at progress 0 / 0.5 / 1", (): void => {
    const { result } = renderTransitionHook({ mode: "slide" });
    act((): void => {
      result.current.begin({ direction: "next" });
    });
    expect(result.current.outgoingStyle.transform).toBe("translateX(0%)");
    expect(result.current.incomingStyle.transform).toBe("translateX(100%)");

    act((): void => {
      result.current.scrub(0.5);
    });
    expect(result.current.outgoingStyle.transform).toBe("translateX(-50%)");
    expect(result.current.incomingStyle.transform).toBe("translateX(50%)");

    act((): void => {
      result.current.scrub(1);
    });
    expect(result.current.outgoingStyle.transform).toBe("translateX(-100%)");
    expect(result.current.incomingStyle.transform).toBe("translateX(0%)");
  });

  it("emits slide transforms for prev at progress 0 / 0.5 / 1", (): void => {
    const { result } = renderTransitionHook({ mode: "slide" });
    act((): void => {
      result.current.begin({ direction: "prev" });
    });
    expect(result.current.outgoingStyle.transform).toBe("translateX(0%)");
    expect(result.current.incomingStyle.transform).toBe("translateX(-100%)");

    act((): void => {
      result.current.scrub(-0.5);
    });
    expect(result.current.outgoingStyle.transform).toBe("translateX(50%)");
    expect(result.current.incomingStyle.transform).toBe("translateX(-50%)");

    act((): void => {
      result.current.scrub(-1);
    });
    expect(result.current.outgoingStyle.transform).toBe("translateX(100%)");
    expect(result.current.incomingStyle.transform).toBe("translateX(0%)");
  });

  it("emits fade opacity on the outgoing clone", (): void => {
    const { result } = renderTransitionHook({ mode: "fade" });
    act((): void => {
      result.current.begin({ direction: "next" });
      result.current.scrub(0.5);
    });
    expect(result.current.outgoingStyle.opacity).toBe(0.5);
    expect(result.current.incomingStyle.opacity).toBe(1);
    expect(result.current.outgoingStyle.transform).toBe("none");
  });
});

describe("useWorkspaceTransition — reduced motion / settle / recapture", (): void => {
  it("resolves reduced motion to none and does not keep a clone", (): void => {
    const { result } = renderTransitionHook({
      mode: "slide",
      reducedMotion: true,
    });
    act((): void => {
      result.current.begin({ direction: "next" });
    });
    expect(result.current.activeMode).toBe("none");
    expect(result.current.outgoingNode).toBeNull();
    expect(result.current.phase).toBe("idle");
  });

  it("falls a degraded slide capture back to fade", (): void => {
    const spy: DrawImageSpy = { calls: 0, lastSource: null };
    const restore: () => void = installCanvasContextMock({
      throwOnDraw: true,
      spy,
    });
    try {
      const { result } = renderTransitionHook({
        mode: "slide",
        html: `<canvas width="4" height="4"></canvas><p>body</p>`,
      });
      act((): void => {
        result.current.begin({ direction: "next" });
      });
      expect(result.current.activeMode).toBe("fade");
      expect(result.current.outgoingNode).not.toBeNull();
    } finally {
      restore();
    }
  });

  it("fires onSettled(commit) after scrub then finish, and drops the clone", (): void => {
    const { result, onSettled } = renderTransitionHook({ mode: "slide" });
    act((): void => {
      result.current.begin({ direction: "next" });
      result.current.scrub(0.4);
    });
    expect(result.current.outgoingNode).not.toBeNull();
    act((): void => {
      result.current.finish("commit");
    });
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith("commit");
    expect(result.current.outgoingNode).toBeNull();
    expect(result.current.phase).toBe("idle");
  });

  it("fires onSettled(cancel) after finish cancel", (): void => {
    const { result, onSettled } = renderTransitionHook({ mode: "slide" });
    act((): void => {
      result.current.begin({ direction: "prev" });
      result.current.scrub(-0.2);
      result.current.finish("cancel");
    });
    expect(onSettled).toHaveBeenCalledWith("cancel");
    expect(result.current.outgoingNode).toBeNull();
  });

  it("replaces the clone when begin is called mid-flight", (): void => {
    const { result, viewport } = renderTransitionHook({
      mode: "slide",
      html: `<span id="first" data-leaf-id="a">first-view</span>`,
    });
    act((): void => {
      result.current.begin({ direction: "next" });
    });
    const firstClone: HTMLElement | null = result.current.outgoingNode;
    expect(firstClone).not.toBeNull();
    expect(firstClone?.textContent).toContain("first-view");

    viewport.innerHTML = `<span id="second" data-leaf-id="b">second-view</span>`;
    act((): void => {
      result.current.begin({ direction: "prev" });
    });
    const secondClone: HTMLElement | null = result.current.outgoingNode;
    expect(secondClone).not.toBeNull();
    expect(secondClone).not.toBe(firstClone);
    expect(secondClone?.textContent).toContain("second-view");
    expect(secondClone?.textContent).not.toContain("first-view");
    expect(firstClone?.isConnected).toBe(false);
    expect(result.current.direction).toBe("prev");
    expect(result.current.unitProgress).toBe(0);
  });
});

interface StageHarnessProps {
  readonly label: string;
  readonly stageRef: React.RefObject<UseWorkspaceTransitionResult | null>;
  readonly viewportRef: React.RefObject<HTMLDivElement | null>;
  readonly onSettled: (kind: WorkspaceTransitionSettleKind) => void;
}

function StageHarness(props: StageHarnessProps): React.ReactElement {
  return (
    <div ref={props.viewportRef} data-testid="viewport">
      <article id="outgoing-pane" data-leaf-id="leaf-out">
        {props.label}
      </article>
      <WorkspaceTransitionStage
        ref={props.stageRef}
        viewportRef={props.viewportRef}
        mode="slide"
        durationMs={0}
        onSettled={props.onSettled}
      >
        <div data-testid="incoming">incoming-tree</div>
      </WorkspaceTransitionStage>
    </div>
  );
}

describe("WorkspaceTransitionStage", (): void => {
  it("unmount removes the clone from the document", (): void => {
    const stageRef: React.RefObject<UseWorkspaceTransitionResult | null> = {
      current: null,
    };
    const viewportRef: React.RefObject<HTMLDivElement | null> = {
      current: null,
    };
    const onSettled: jest.Mock<(kind: WorkspaceTransitionSettleKind) => void> =
      jest.fn<(kind: WorkspaceTransitionSettleKind) => void>();
    const rendered = render(
      <StageHarness
        label="mounted-view"
        stageRef={stageRef}
        viewportRef={viewportRef}
        onSettled={onSettled}
      />,
    );
    act((): void => {
      stageRef.current?.begin({ direction: "next" });
    });
    expect(
      document.querySelector(`[${WORKSPACE_TRANSITION_CLONE_ATTR}]`),
    ).not.toBeNull();
    rendered.unmount();
    expect(
      document.querySelector(`[${WORKSPACE_TRANSITION_CLONE_ATTR}]`),
    ).toBeNull();
  });

  it("mounts the clone in the overlay and applies incoming transforms", (): void => {
    const stageRef: React.RefObject<UseWorkspaceTransitionResult | null> = {
      current: null,
    };
    const viewportRef: React.RefObject<HTMLDivElement | null> = {
      current: null,
    };
    const onSettled: jest.Mock<(kind: WorkspaceTransitionSettleKind) => void> =
      jest.fn<(kind: WorkspaceTransitionSettleKind) => void>();
    const rendered = render(
      <StageHarness
        label="outgoing-view"
        stageRef={stageRef}
        viewportRef={viewportRef}
        onSettled={onSettled}
      />,
    );
    act((): void => {
      stageRef.current?.begin({ direction: "next" });
      stageRef.current?.scrub(0.5);
    });
    const clone: HTMLElement | null = document.querySelector(
      `[${WORKSPACE_TRANSITION_CLONE_ATTR}]`,
    );
    expect(clone).not.toBeNull();
    expect(clone?.getAttribute("aria-hidden")).toBe("true");
    expect(clone?.querySelector("[data-leaf-id]")).toBeNull();
    const stageRoot: HTMLElement | null = rendered.container.querySelector(
      "[data-hpt-workspace-transition]",
    );
    const incoming: HTMLElement | null =
      stageRoot?.querySelector(
        ":scope > [data-hpt-workspace-transition-incoming]",
      ) ?? null;
    expect(incoming?.style.transform).toBe("translateX(50%)");
  });
});
