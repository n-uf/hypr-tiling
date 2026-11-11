import { afterEach, describe, expect, it } from "@jest/globals";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TilingDragPreview, TilingWorkspaceSet } from "@n-uf/hypr-tiling";
import {
  DEFAULT_HOME_DRAG_PREVIEW,
  readStoredDragPreview,
  writeStoredDragPreview,
} from "./drag-preview-storage";
import { HOME_WORKSPACE_SEED } from "./home-workspaces";
import { HomeShortcuts } from "./shortcuts";

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
  it("defaults to the drop indicator", (): void => {
    expect(DEFAULT_HOME_DRAG_PREVIEW).toBe("indicator");
    expect(readStoredDragPreview()).toBe("indicator");
    withStorage();
    expect(readStoredDragPreview()).toBe("indicator");
  });

  it("round-trips the choice and ignores junk", (): void => {
    const store: Map<string, string> = withStorage();
    writeStoredDragPreview("snap");
    expect(readStoredDragPreview()).toBe("snap");
    writeStoredDragPreview("indicator");
    expect(readStoredDragPreview()).toBe("indicator");
    store.set("hypr-tiling-web.home-drag-preview", "ghost");
    expect(readStoredDragPreview()).toBe("indicator");
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
    expect(readStoredDragPreview()).toBe("indicator");
    expect((): void => writeStoredDragPreview("snap")).not.toThrow();
  });
});

describe("home bottom bar — the drop preview toggle sits with the reset controls", (): void => {
  function markup(preview: TilingDragPreview): string {
    return renderToStaticMarkup(
      React.createElement(HomeShortcuts, {
        commandHandleRef: { current: null },
        layout: HOME_WORKSPACE_SEED.workspaces[0]?.layout ?? null,
        workspaceSet: HOME_WORKSPACE_SEED as TilingWorkspaceSet,
        focusedLeafId: null,
        maximizedLeafId: null,
        skin: "mosaic",
        resetWorkspaceDisabled: true,
        resetAllDisabled: true,
        onResetCommand: (): void => undefined,
        dragPreview: preview,
        onDragPreviewChange: (): void => undefined,
      }),
    );
  }

  it("shows the current preview and offers the other, right after Reset all", (): void => {
    const indicator: string = markup("indicator");
    expect(indicator).toContain('data-drag-preview="indicator"');
    expect(indicator).toContain(">Drop indicator<");
    expect(indicator).toContain("Click for snap to slot");
    expect(indicator.indexOf("Reset all")).toBeLessThan(indicator.indexOf('data-drag-preview="indicator"'));
    const snap: string = markup("snap");
    expect(snap).toContain(">Snap to slot<");
    expect(snap).toContain("Click for drop indicator");
  });

  it("is a toggle button: one name, aria-pressed says whether snap is on", (): void => {
    const indicator: string = markup("indicator");
    const snap: string = markup("snap");
    expect(indicator).toContain('aria-label="Drop preview: snap to slot"');
    expect(snap).toContain('aria-label="Drop preview: snap to slot"');
    expect(indicator).toContain('aria-pressed="false"');
    expect(snap).toContain('aria-pressed="true"');
  });
});
