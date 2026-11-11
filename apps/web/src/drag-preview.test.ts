import { afterEach, describe, expect, it } from "@jest/globals";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TilingDragPreview } from "@n-uf/hypr-tiling";
import {
  DEFAULT_HOME_DRAG_PREVIEW,
  readStoredDragPreview,
  writeStoredDragPreview,
} from "./drag-preview-storage";
import { DragPreviewSwitch } from "./drag-preview-switch";

/** A window with a Map-backed localStorage, for the storage round trip. */
function withStorage(): Map<string, string> {
  const store: Map<string, string> = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string): string | null => store.get(key) ?? null,
      setItem: (key: string, value: string): void => void store.set(key, value),
      removeItem: (key: string): void => void store.delete(key),
    },
  };
  return store;
}

afterEach((): void => {
  delete (globalThis as { window?: unknown }).window;
});

describe("home drop preview — persisted like the other home settings", (): void => {
  it("defaults to snap to slot", (): void => {
    expect(DEFAULT_HOME_DRAG_PREVIEW).toBe("snap");
    expect(readStoredDragPreview()).toBe("snap");
    withStorage();
    expect(readStoredDragPreview()).toBe("snap");
  });

  it("round-trips the choice and ignores junk", (): void => {
    const store: Map<string, string> = withStorage();
    writeStoredDragPreview("snap");
    expect(readStoredDragPreview()).toBe("snap");
    writeStoredDragPreview("indicator");
    expect(readStoredDragPreview()).toBe("indicator");
    store.set("hypr-tiling-web.home-drag-preview", "ghost");
    expect(readStoredDragPreview()).toBe("snap");
  });

  it("survives a storage that throws", (): void => {
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (): string => {
          throw new Error("denied");
        },
        setItem: (): void => {
          throw new Error("denied");
        },
      },
    };
    expect(readStoredDragPreview()).toBe("snap");
    expect((): void => writeStoredDragPreview("snap")).not.toThrow();
  });
});

describe("home top bar — the drop preview switch, both options visible", (): void => {
  function markup(preview: TilingDragPreview): string {
    return renderToStaticMarkup(
      React.createElement(DragPreviewSwitch, {
        preview,
        onChange: (): void => undefined,
        className: "group",
        labelClassName: "label",
        activeClassName: "on",
        inactiveClassName: "off",
      }),
    );
  }

  it("is a labelled group with both previews, snap to slot first", (): void => {
    const html: string = markup("snap");
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Drop preview"');
    expect(html).toContain(">drop<");
    expect(html.indexOf(">Snap to slot<")).toBeGreaterThan(-1);
    expect(html.indexOf(">Snap to slot<")).toBeLessThan(html.indexOf(">Indicator<"));
  });

  it("presses exactly the active preview", (): void => {
    const snap: string = markup("snap");
    const indicator: string = markup("indicator");
    expect(snap.match(/aria-pressed="true"/g)?.length).toBe(1);
    expect(indicator.match(/aria-pressed="true"/g)?.length).toBe(1);
    expect(snap).toMatch(/aria-pressed="true"[^>]*class="on"[^>]*>Snap to slot</);
    expect(indicator).toMatch(/aria-pressed="true"[^>]*class="on"[^>]*>Indicator</);
  });
});
