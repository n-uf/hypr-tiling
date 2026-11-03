import * as React from "react";

// Narrow / coarse viewport detection for the mobile home experience.
//
// The built `/` ships BOTH home layouts prerendered (see `home-first-paint.tsx`):
// a media query shows the one that fits the viewport, and `main.tsx` drops the
// other and hydrates the kept one. While rendering on the server and while
// hydrating, the hooks below return the layout of the copy being rendered
// (`PrerenderedHomeLayoutContext`), so hydration matches the HTML; afterwards
// they follow the live media query (resize, rotation). Without prerendered
// markup (the dev server, client-side navigation) they read the media query
// on the first render.

export type HomeLayout = "desktop" | "mobile";

/** Which prerendered home copy is being rendered (server) or hydrated (client); null when there is none. */
export const PrerenderedHomeLayoutContext: React.Context<HomeLayout | null> =
  React.createContext<HomeLayout | null>(null);

function subscribeMediaQuery(query: string, onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return (): void => {};
  }
  const mediaQueryList: MediaQueryList = window.matchMedia(query);
  mediaQueryList.addEventListener("change", onChange);
  return (): void => mediaQueryList.removeEventListener("change", onChange);
}

function useMediaQuery(query: string, hydrationValue: boolean): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void): (() => void) => subscribeMediaQuery(query, onChange),
    [query],
  );
  return React.useSyncExternalStore(
    subscribe,
    (): boolean =>
      typeof window.matchMedia === "function"
        ? window.matchMedia(query).matches
        : hydrationValue,
    (): boolean => hydrationValue,
  );
}

// Phones and small tablets in portrait; wide enough that the classic desktop
// dwindle demo stays the default above this width.
export const MOBILE_HOME_BREAKPOINT_PX: number = 760;

/** The media query for the mobile home layout (also used by the prerender's CSS and `main.tsx`). */
export const MOBILE_HOME_QUERY: string = `(max-width: ${MOBILE_HOME_BREAKPOINT_PX}px)`;

/** Whether the viewport is narrow enough for the mobile home mode switcher + concepts. */
export function useIsMobileHomeViewport(): boolean {
  const prerendered: HomeLayout | null = React.useContext(
    PrerenderedHomeLayoutContext,
  );
  return useMediaQuery(MOBILE_HOME_QUERY, prerendered === "mobile");
}

/** Whether the primary pointer is coarse (touch) — drives hiding keyboard-only chrome. */
export function useIsCoarsePointer(): boolean {
  return useMediaQuery("(pointer: coarse)", false);
}
