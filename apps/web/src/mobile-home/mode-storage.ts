import { DEFAULT_MOBILE_HOME_MODE, type MobileHomeMode } from "./types";

// Namespaced so it never collides with another app's key sharing the origin
// (see the docs `save-restore` example's `STORAGE_KEY` convention).
const STORAGE_KEY: string = "hypr-tiling-web.home-mobile-mode";

const VALID_MODES: ReadonlySet<string> = new Set<MobileHomeMode>([
  "master",
  "swipe",
  "grid",
]);

function isMobileHomeMode(value: string): value is MobileHomeMode {
  return VALID_MODES.has(value);
}

/** Read the persisted mobile home mode, falling back to the default (`"master"`) when unset or invalid. */
export function readStoredMobileHomeMode(): MobileHomeMode {
  if (typeof window === "undefined") {
    return DEFAULT_MOBILE_HOME_MODE;
  }
  try {
    const raw: string | null = window.localStorage.getItem(STORAGE_KEY);
    if (raw != null && isMobileHomeMode(raw)) {
      return raw;
    }
  } catch {
    // Storage access can throw (private browsing, disabled storage); fall
    // back to the default rather than surfacing an error to the user.
  }
  return DEFAULT_MOBILE_HOME_MODE;
}

/** Persist the selected mobile home mode. A no-op when storage is unavailable. */
export function writeStoredMobileHomeMode(mode: MobileHomeMode): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Ignore storage write failures — the mode still works for the session.
  }
}
