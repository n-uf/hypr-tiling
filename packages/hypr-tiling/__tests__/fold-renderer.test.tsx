/**
 * @jest-environment jsdom
 *
 * Folding in the renderer (`config.fold`): a split the fold plan folds renders
 * its open side and a spine on the edge where the folded side sits; the folded
 * side stays mounted (hidden), so the DOM keeps every pane's text. A tap on a
 * spine focuses the pane it targets, which opens it. Folds are derived only:
 * the layout the host gets back never changes because of one. Where nothing
 * folds the markup is the same as with folding off.
 *
 * jsdom has no layout: the viewport's client size is `VIEWPORT`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "@jest/globals";
import * as React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { TilingRenderer } from "../react/tiling-renderer";
import type { TilingGroupNode, TilingLayoutConfig, TilingLayoutNode, TilingLeafNode, TilingSplitNode, TilingTile } from "../engine/types";

const VIEWPORT: { width: number; height: number } = { width: 390, height: 844 };
const originals: Array<[string, PropertyDescriptor | undefined]> = [];

beforeAll((): void => {
  for (const [name, read] of [
    ["clientWidth", (): number => VIEWPORT.width],
    ["clientHeight", (): number => VIEWPORT.height],
  ] as const) {
    originals.push([name, Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)]);
    Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get: read });
  }
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: (): void => undefined,
    removeEventListener: (): void => undefined,
    addListener: (): void => undefined,
    removeListener: (): void => undefined,
  })) as unknown as typeof window.matchMedia;
  const globalScope = globalThis as unknown as { ResizeObserver?: unknown; PointerEvent?: unknown };
  if (typeof globalScope.ResizeObserver === "undefined") {
    globalScope.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
  }
  if (typeof globalScope.PointerEvent === "undefined") {
    class StubPointerEvent extends MouseEvent {
      readonly pointerId: number;
      readonly pointerType: string;
      readonly isPrimary: boolean;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
        this.pointerType = init.pointerType ?? "mouse";
        this.isPrimary = init.isPrimary ?? true;
      }
    }
    globalScope.PointerEvent = StubPointerEvent;
  }
});

afterAll((): void => {
  for (const [name, descriptor] of originals) {
    if (descriptor != null) Object.defineProperty(HTMLElement.prototype, name, descriptor);
  }
});

afterEach((): void => {
  cleanup();
  VIEWPORT.width = 390;
  VIEWPORT.height = 844;
});

const leaf = (id: string): TilingLeafNode => ({ kind: "leaf", id, tileId: id });
const split = (id: string, axis: "horizontal" | "vertical", ratio: number, first: TilingLayoutNode, second: TilingLayoutNode): TilingSplitNode => ({
  kind: "split",
  id,
  axis,
  ratio,
  first,
  second,
});
const HERO: TilingGroupNode = { kind: "group", id: "home-hero", activeMemberId: "intro", members: [leaf("intro"), leaf("proof"), leaf("scenarios")] };
/** hypr-tiling.n-uf.com's Home tree */
const HOME: TilingLayoutNode = split(
  "home-root",
  "horizontal",
  0.26,
  split("home-intro-stack", "vertical", 0.675, HERO, leaf("discoverability")),
  split("home-features-rest", "horizontal", 0.365, leaf("features"), split("home-install-uses", "horizontal", 0.585, leaf("install"), leaf("usecases"))),
);
const TITLES: Record<string, string> = {
  intro: "hypr-tiling",
  proof: "Proof",
  scenarios: "Scenarios",
  discoverability: "SEO + LLM",
  features: "Features",
  install: "Install",
  usecases: "Use cases",
};
const TILES: ReadonlyArray<TilingTile> = Object.entries(TITLES).map(([id, title]): TilingTile => ({ id, title, rows: [`${title} body text`] }));
const SITE: TilingLayoutConfig = { gapPx: 14, minPaneSizePx: 180, handleSizePx: 8 };
const SITE_FOLD: TilingLayoutConfig = { ...SITE, fold: { minPanePx: { width: 220, height: 200 } } };

function renderHome(
  config: TilingLayoutConfig,
  reported: Array<TilingLayoutNode> = [],
  extra: Partial<React.ComponentProps<typeof TilingRenderer>> = {},
  interaction: Record<string, unknown> = {},
): ReturnType<typeof render> {
  function Host(): React.ReactElement {
    const [layout, setLayout] = React.useState<TilingLayoutNode>(HOME);
    return (
      <TilingRenderer
        {...extra}
        layout={layout}
        tiles={TILES}
        config={config}
        interaction={{ dragRecovery: { enable: false }, customCursor: false, ...interaction }}
        onLayoutChange={(next: TilingLayoutNode): void => {
          reported.push(next);
          setLayout(next);
        }}
      />
    );
  }
  return render(<Host />);
}

const spine = (root: HTMLElement, splitId: string): HTMLButtonElement | null =>
  root.querySelector<HTMLButtonElement>(`[data-hpt-fold-spine="${splitId}"]`);

describe("folding in the renderer", () => {
  it("390 × 844: the root folds into a spine on the right; the folded panes stay in the DOM, hidden", async () => {
    const { container } = renderHome(SITE_FOLD);
    await act(async (): Promise<void> => undefined);
    const root = spine(container, "home-root");
    expect(root).not.toBeNull();
    expect(root?.getAttribute("data-hpt-spine-edge")).toBe("right");
    expect(root?.getAttribute("aria-label")).toBe("Show Features, Install, Use cases");
    const folded = container.querySelector<HTMLElement>('[data-hpt-folded] > [data-hpt-fold-side="folded"]');
    expect(folded?.style.display).toBe("none");
    for (const title of ["Features", "Install", "Use cases"]) {
      expect(folded?.textContent).toContain(`${title} body text`);
    }
    const open = container.querySelector<HTMLElement>('[data-hpt-folded] > [data-hpt-fold-side="open"]');
    expect(open?.textContent).toContain("hypr-tiling body text");
    // every pane's text is in the DOM
    for (const title of Object.values(TITLES).filter((title) => title !== "Proof" && title !== "Scenarios")) {
      expect(container.textContent).toContain(`${title} body text`);
    }
  });

  it("a tap on a spine opens it; the layout the host gets back never carries a fold", async () => {
    const reported: Array<TilingLayoutNode> = [];
    const { container } = renderHome(SITE_FOLD, reported);
    await act(async (): Promise<void> => undefined);
    await act(async (): Promise<void> => {
      fireEvent.click(spine(container, "home-root") as HTMLButtonElement);
    });
    // Features is open: the root's spine moved to the left, and Install · Use cases folded beside Features
    expect(spine(container, "home-root")?.getAttribute("data-hpt-spine-edge")).toBe("left");
    expect(spine(container, "home-root")?.getAttribute("aria-label")).toBe("Show hypr-tiling, SEO + LLM");
    expect(spine(container, "home-features-rest")?.getAttribute("data-hpt-spine-edge")).toBe("right");
    for (const layout of reported) {
      expect(layout).toEqual(HOME);
    }
  });

  it("844 × 390: three columns, the hero's stack and Use cases folded", async () => {
    VIEWPORT.width = 844;
    VIEWPORT.height = 390;
    const { container } = renderHome(SITE_FOLD);
    await act(async (): Promise<void> => undefined);
    expect(spine(container, "home-root")).toBeNull();
    expect(spine(container, "home-intro-stack")?.getAttribute("data-hpt-spine-edge")).toBe("bottom");
    expect(spine(container, "home-install-uses")?.getAttribute("data-hpt-spine-edge")).toBe("right");
  });

  it("1440 × 900: nothing folds, and the markup is the same as with folding off", async () => {
    VIEWPORT.width = 1440;
    VIEWPORT.height = 900;
    const off = renderHome(SITE);
    await act(async (): Promise<void> => undefined);
    const offMarkup: string = off.container.innerHTML;
    cleanup();
    const on = renderHome(SITE_FOLD);
    await act(async (): Promise<void> => undefined);
    expect(on.container.querySelector("[data-hpt-fold-spine]")).toBeNull();
    expect(on.container.innerHTML).toBe(offMarkup);
  });

  it("no pane remounts when a fold turns, there and back", async () => {
    const { container } = renderHome(SITE_FOLD);
    await act(async (): Promise<void> => undefined);
    const panes = (): Map<string, Element> =>
      new Map([...container.querySelectorAll("[data-leaf-id]")].map((element): [string, Element] => [element.getAttribute("data-leaf-id") ?? "", element]));
    const before = panes();
    expect(before.size).toBe(5);
    for (const splitId of ["home-root", "home-root"]) {
      await act(async (): Promise<void> => {
        fireEvent.click(spine(container, splitId) as HTMLButtonElement);
      });
      const after = panes();
      expect(after.size).toBe(5);
      for (const [leafId, element] of after) expect(element).toBe(before.get(leafId));
    }
  });

  it("a tapped spine hands DOM focus to the pane it opened", async () => {
    const { container } = renderHome(SITE_FOLD);
    await act(async (): Promise<void> => undefined);
    const root = spine(container, "home-root") as HTMLButtonElement;
    root.focus();
    await act(async (): Promise<void> => {
      fireEvent.click(root);
    });
    expect(document.activeElement?.closest("[data-leaf-id]")?.getAttribute("data-leaf-id")).toBe("features");
  });

  it("844 × 390: a split drawn at its fitted ratio (the hero column on its 220 px floor)", async () => {
    VIEWPORT.width = 844;
    VIEWPORT.height = 390;
    const { container } = renderHome(SITE_FOLD);
    await act(async (): Promise<void> => undefined);
    const rootFirst = container.querySelector<HTMLElement>("section > div");
    const percent = Number(/calc\(([\d.]+)% - 11px\)/.exec(rootFirst?.style.flexBasis ?? "")?.[1]);
    expect(percent).toBeCloseTo((231 / 844) * 100, 3);
  });

  it("no fold while a pane is maximized", async () => {
    const { container } = renderHome(SITE_FOLD, [], { maximizedLeafId: "features" });
    await act(async (): Promise<void> => undefined);
    expect(container.querySelector("[data-hpt-fold-spine]")).toBeNull();
  });

  it("with focus selection off a spine can't open anything: it is disabled", async () => {
    const { container } = renderHome(SITE_FOLD, [], {}, { focus: false });
    await act(async (): Promise<void> => undefined);
    expect(spine(container, "home-root")?.disabled).toBe(true);
  });

  it("folding off: no spine at a phone width (the old layout, unchanged)", async () => {
    const { container } = renderHome(SITE);
    await act(async (): Promise<void> => undefined);
    expect(container.querySelector("[data-hpt-fold-spine]")).toBeNull();
    expect(container.querySelector("[data-hpt-folded]")).toBeNull();
  });
});

function touch(target: EventTarget, type: string, x: number, y: number): void {
  target.dispatchEvent(
    new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", isPrimary: true, clientX: x, clientY: y }),
  );
}

async function swipe(from: Element, dx: number, dy: number = 0): Promise<void> {
  await act(async (): Promise<void> => {
    touch(from, "pointerdown", 200, 400);
    for (let step = 1; step <= 5; step += 1) {
      touch(window, "pointermove", 200 + (dx * step) / 5, 400 + (dy * step) / 5);
    }
    touch(window, "pointerup", 200 + dx, 400 + dy);
  });
}

const leafElement = (root: HTMLElement, leafId: string): Element => {
  const element = root.querySelector(`[data-hpt-leaf="${leafId}"]`) ?? root.querySelector(`[data-hpt-leaf]`);
  if (element == null) throw new Error(`no leaf ${leafId}`);
  return element;
};

describe("folds on touch and keys", () => {
  it("the open side of a sideways fold is marked with the way it turns", async () => {
    const { container } = renderHome(SITE_FOLD);
    await act(async (): Promise<void> => undefined);
    const open = container.querySelector<HTMLElement>('[data-hpt-folded] > [data-hpt-fold-side="open"]');
    expect(open?.getAttribute("data-hpt-fold-flip")).toBe("x+");
    expect(open?.getAttribute("data-hpt-fold-split")).toBe("home-root");
    expect(open?.style.touchAction).toBe("pan-y");
  });

  it("a swipe left over the open side turns the fold toward its spine on the right", async () => {
    const { container } = renderHome(SITE_FOLD);
    await act(async (): Promise<void> => undefined);
    await swipe(leafElement(container, "intro"), -200);
    expect(spine(container, "home-root")?.getAttribute("data-hpt-spine-edge")).toBe("left");
    // Features is open; a swipe right turns back to the hero column
    await swipe(leafElement(container, "features"), 200);
    expect(spine(container, "home-root")?.getAttribute("data-hpt-spine-edge")).toBe("right");
  });

  it("a short, slow or backward swipe, or a vertical one, doesn't turn it", async () => {
    const { container } = renderHome(SITE_FOLD);
    await act(async (): Promise<void> => undefined);
    await swipe(leafElement(container, "intro"), 40);
    await swipe(leafElement(container, "intro"), -5, -300);
    expect(spine(container, "home-root")?.getAttribute("data-hpt-spine-edge")).toBe("right");
  });

  it("the arrows move focus by where panes really are, and unfold as they go", async () => {
    const { container } = renderHome(SITE_FOLD);
    await act(async (): Promise<void> => undefined);
    (spine(container, "home-root") as HTMLButtonElement).focus();
    await act(async (): Promise<void> => {
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight", bubbles: true }));
    });
    expect(spine(container, "home-root")?.getAttribute("data-hpt-spine-edge")).toBe("left");
    expect(spine(container, "home-features-rest")).not.toBeNull();
    await act(async (): Promise<void> => {
      (spine(container, "home-root") as HTMLButtonElement).focus();
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight", bubbles: true }));
    });
    // Install, on the inner spine, opens next
    expect(spine(container, "home-features-rest")?.getAttribute("data-hpt-spine-edge")).toBe("left");
  });
});
