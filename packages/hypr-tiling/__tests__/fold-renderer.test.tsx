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
  const globalScope = globalThis as unknown as { ResizeObserver?: unknown };
  if (typeof globalScope.ResizeObserver === "undefined") {
    globalScope.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
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

function renderHome(config: TilingLayoutConfig, reported: Array<TilingLayoutNode> = []): ReturnType<typeof render> {
  function Host(): React.ReactElement {
    const [layout, setLayout] = React.useState<TilingLayoutNode>(HOME);
    return (
      <TilingRenderer
        layout={layout}
        tiles={TILES}
        config={config}
        interaction={{ dragRecovery: { enable: false }, customCursor: false }}
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

  it("folding off: no spine at a phone width (the old layout, unchanged)", async () => {
    const { container } = renderHome(SITE);
    await act(async (): Promise<void> => undefined);
    expect(container.querySelector("[data-hpt-fold-spine]")).toBeNull();
    expect(container.querySelector("[data-hpt-folded]")).toBeNull();
  });
});
