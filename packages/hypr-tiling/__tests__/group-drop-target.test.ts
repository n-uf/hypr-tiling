/**
 * @jest-environment jsdom
 *
 * A header drag that ends over a host-registered `groupDropTargetRef` commits
 * one `group` node and keeps the moved pane mounted under `paneIdentity: "stable"`.
 * jsdom has no layout, so viewport size and client rects are stubbed.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from "@jest/globals";
import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { TilingRenderer } from "../react/tiling-renderer";
import { collectGroups } from "../engine/state";
import type {
  TilingGroupNode,
  TilingLayoutNode,
  TilingLeafNode,
  TilingRenderTileProps,
  TilingTile,
} from "../engine/types";

const TILES: ReadonlyArray<TilingTile> = [
  { id: "a", title: "alpha", accent: "amber" },
  { id: "b", title: "beta", accent: "cyan" },
];

const LAYOUT: TilingLayoutNode = {
  kind: "split",
  id: "root",
  axis: "horizontal",
  ratio: 0.5,
  first: { kind: "leaf", id: "leaf:a", tileId: "a" },
  second: { kind: "leaf", id: "leaf:b", tileId: "b" },
};

function clientRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: (): Record<string, number> => ({}),
  } as DOMRect;
}

const VIEWPORT_RECT: DOMRect = clientRect(0, 0, 800, 600);

function withMeasuredViewport(width: number, height: number): () => void {
  const widthDescriptor: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientWidth",
  );
  const heightDescriptor: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientHeight",
  );
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: (): number => width,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: (): number => height,
  });
  return (): void => {
    if (widthDescriptor != null) {
      Object.defineProperty(HTMLElement.prototype, "clientWidth", widthDescriptor);
    } else {
      delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    }
    if (heightDescriptor != null) {
      Object.defineProperty(HTMLElement.prototype, "clientHeight", heightDescriptor);
    } else {
      delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
    }
  };
}

let restoreViewport: () => void = (): void => {};

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
    window.cancelAnimationFrame = (handle: number): void => window.clearTimeout(handle);
  }
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect(
    this: HTMLElement,
  ): DOMRect {
    const target: string | undefined = this.dataset.groupDropTarget;
    if (target === "leaf:b") {
      return clientRect(500, 40, 180, 36);
    }
    if (target === "leaf:a") {
      return clientRect(20, 40, 160, 36);
    }
    return VIEWPORT_RECT;
  };
  restoreViewport = withMeasuredViewport(800, 600);
});

afterAll((): void => {
  restoreViewport();
});

afterEach((): void => {
  cleanup();
});

function CountedPane({
  args,
  mounts,
}: {
  args: TilingRenderTileProps;
  mounts: Map<string, number>;
}): React.ReactElement {
  const isPane: boolean = args.surface === "pane";
  React.useEffect((): void => {
    if (isPane) {
      mounts.set(args.tile.id, (mounts.get(args.tile.id) ?? 0) + 1);
    }
  }, [args.tile.id, isPane, mounts]);
  return React.createElement(
    "article",
    { "data-leaf-id": args.leafId, "data-surface": args.surface },
    React.createElement(
      "header",
      {
        "data-group-drop-target": args.leafId,
        ref: args.groupDropTargetRef,
        onPointerDown: args.onHandlePointerDown,
      },
      args.tile.title,
    ),
  );
}

function Host({
  onLayoutChange,
  mounts,
}: {
  onLayoutChange: (next: TilingLayoutNode) => void;
  mounts: Map<string, number>;
}): React.ReactElement {
  const [layout, setLayout] = React.useState<TilingLayoutNode>(LAYOUT);
  return React.createElement(TilingRenderer, {
    layout,
    tiles: TILES,
    config: { gapPx: 8, minPaneSizePx: 100, handleSizePx: 6 },
    onLayoutChange: (next: TilingLayoutNode): void => {
      setLayout(next);
      onLayoutChange(next);
    },
    paneIdentity: "stable",
    interaction: {
      grouping: { enable: true, showGroupTabStrip: false },
      dragRecovery: { enable: false },
    },
    renderTile: (args: TilingRenderTileProps): React.ReactNode =>
      React.createElement(CountedPane, { args, mounts }),
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

describe("host groupDropTargetRef — renderer commit", (): void => {
  it("commits one group from a header drop and does not remount the moved pane", async (): Promise<void> => {
    const mounts: Map<string, number> = new Map<string, number>();
    const onLayoutChange = jest.fn((_next: TilingLayoutNode): void => {});
    const view = render(
      React.createElement(Host, { onLayoutChange, mounts }),
    );
    await flushFrames();
    const baseline: number = onLayoutChange.mock.calls.length;
    expect(mounts.get("a")).toBe(1);

    const header: HTMLElement | null = view.container.querySelector(
      'header[data-group-drop-target="leaf:a"]',
    );
    if (header == null) {
      throw new Error("expected leaf:a group-drop target");
    }
    await act(async (): Promise<void> => {
      dispatchPointer(header, "pointerdown", { clientX: 40, clientY: 50 });
    });
    await flushFrames();
    await act(async (): Promise<void> => {
      dispatchPointer(window, "pointermove", { clientX: 80, clientY: 50 });
    });
    await flushFrames();
    await act(async (): Promise<void> => {
      dispatchPointer(window, "pointermove", { clientX: 560, clientY: 55 });
    });
    await flushFrames();
    await act(async (): Promise<void> => {
      dispatchPointer(window, "pointerup", { clientX: 560, clientY: 55 });
    });
    await flushFrames();

    const commits: ReadonlyArray<TilingLayoutNode> = onLayoutChange.mock.calls
      .slice(baseline)
      .map((call: ReadonlyArray<unknown>): TilingLayoutNode => call[0] as TilingLayoutNode);
    expect(commits).toHaveLength(1);
    const groups: ReadonlyArray<TilingGroupNode> = collectGroups(commits[0]);
    expect(groups).toHaveLength(1);
    const memberIds: ReadonlyArray<string> = groups[0].members.map(
      (member: TilingLeafNode): string => member.id,
    );
    expect([...memberIds].sort()).toEqual(["leaf:a", "leaf:b"]);
    expect(groups[0].activeMemberId).toBe("leaf:a");
    expect(mounts.get("a")).toBe(1);
  });
});
