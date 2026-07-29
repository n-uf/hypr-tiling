import * as React from "react";

// Narrow / coarse viewport detection for the mobile home experience. Both
// hooks initialize to `false` (matching the eagerly-prerendered desktop
// markup) and flip to the live media-query result once mounted, so hydration
// never mismatches the prerendered HTML — the mobile presentation is a
// client-only progressive enhancement over the same content.

function subscribeMediaQuery(
  query: string,
  onChange: (matches: boolean) => void,
): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return (): void => {};
  }
  const mediaQueryList: MediaQueryList = window.matchMedia(query);
  const listener = (event: MediaQueryListEvent): void => onChange(event.matches);
  onChange(mediaQueryList.matches);
  mediaQueryList.addEventListener("change", listener);
  return (): void => mediaQueryList.removeEventListener("change", listener);
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState<boolean>(false);
  React.useEffect((): (() => void) => subscribeMediaQuery(query, setMatches), [
    query,
  ]);
  return matches;
}

// Phones and small tablets in portrait; wide enough that the classic desktop
// dwindle demo stays the default above this width.
const MOBILE_HOME_BREAKPOINT_PX: number = 760;

/** Whether the viewport is narrow enough for the mobile home mode switcher + concepts. */
export function useIsMobileHomeViewport(): boolean {
  return useMediaQuery(`(max-width: ${MOBILE_HOME_BREAKPOINT_PX}px)`);
}

/** Whether the primary pointer is coarse (touch) — drives hiding keyboard-only chrome. */
export function useIsCoarsePointer(): boolean {
  return useMediaQuery("(pointer: coarse)");
}
