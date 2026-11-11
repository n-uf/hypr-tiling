import * as React from "react";
import type { TilingDragPreview } from "@n-uf/hypr-tiling";
import { useIsHydrating } from "./home-first-paint";

// Namespaced so it never collides with another app's key sharing the origin
// (same convention as the mobile home mode, `mobile-home/mode-storage.ts`).
const STORAGE_KEY: string = "hypr-tiling-web.home-drag-preview";

/** The home's drop preview until the visitor picks one: snap to slot. */
export const DEFAULT_HOME_DRAG_PREVIEW: TilingDragPreview = "snap";

function isDragPreview(value: string): value is TilingDragPreview {
  return value === "indicator" || value === "snap";
}

/** Read the persisted drop preview, falling back to the default when unset or invalid. */
export function readStoredDragPreview(): TilingDragPreview {
  if (typeof window === "undefined") {
    return DEFAULT_HOME_DRAG_PREVIEW;
  }
  try {
    const raw: string | null = window.localStorage.getItem(STORAGE_KEY);
    if (raw != null && isDragPreview(raw)) {
      return raw;
    }
  } catch {
    // Storage access can throw (private browsing, disabled storage); fall
    // back to the default rather than surfacing an error to the user.
  }
  return DEFAULT_HOME_DRAG_PREVIEW;
}

/** Persist the drop preview. A no-op when storage is unavailable. */
export function writeStoredDragPreview(preview: TilingDragPreview): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, preview);
  } catch {
    // Ignore storage write failures — the preview still works for the session.
  }
}

/**
 * The home's drop preview and its setter (which persists the choice). The
 * prerendered home starts at the default, so while hydrating it starts there
 * and applies the stored choice right after; a fresh client render reads the
 * stored choice straight away.
 */
export function useHomeDragPreview(): readonly [
  TilingDragPreview,
  (next: TilingDragPreview) => void,
] {
  const hydrating: boolean = useIsHydrating();
  const [preview, setPreview] = React.useState<TilingDragPreview>(
    (): TilingDragPreview =>
      hydrating ? DEFAULT_HOME_DRAG_PREVIEW : readStoredDragPreview(),
  );
  React.useEffect((): void => {
    setPreview(readStoredDragPreview());
  }, []);
  const changePreview = React.useCallback((next: TilingDragPreview): void => {
    setPreview(next);
    writeStoredDragPreview(next);
  }, []);
  return [preview, changePreview];
}
