import * as React from "react";

// Code-split `/docs` route. Kept off `app.tsx` so the homepage can preload
// the chunk (timeline → /docs#release) without an app↔page import cycle.

export interface RouteProps {
  readonly navigate?: (to: string) => void;
}

type RouteComponent = React.ComponentType<RouteProps>;

export interface PreloadableRoute {
  (props: RouteProps): React.ReactElement;
  readonly preload: () => Promise<void>;
  readonly isLoaded: () => boolean;
}

function preloadableRoute(
  load: () => Promise<{ default: RouteComponent }>,
): PreloadableRoute {
  let Loaded: RouteComponent | null = null;
  let pending: Promise<void> | null = null;
  const preload = (): Promise<void> => {
    if (pending == null) {
      pending = load().then((module): void => {
        Loaded = module.default;
      });
    }
    return pending;
  };
  const Route = (props: RouteProps): React.ReactElement => {
    const Resolved: RouteComponent | null = Loaded;
    if (Resolved == null) {
      throw preload();
    }
    return <Resolved {...props} />;
  };
  const route: PreloadableRoute = Object.assign(Route, {
    preload,
    isLoaded: (): boolean => Loaded != null,
  });
  return route;
}

export const DocsRoute: PreloadableRoute = preloadableRoute(
  (): Promise<{ default: RouteComponent }> =>
    import("./docs-page").then(
      (module): { default: RouteComponent } => ({ default: module.DocsPage }),
    ),
);

export function normalizePath(pathname: string): string {
  const hashIndex: number = pathname.indexOf("#");
  const withoutHash: string =
    hashIndex >= 0 ? pathname.slice(0, hashIndex) : pathname;
  const searchIndex: number = withoutHash.indexOf("?");
  const pathOnly: string =
    searchIndex >= 0 ? withoutHash.slice(0, searchIndex) : withoutHash;
  const trimmed: string = pathOnly.replace(/\/+$/, "");
  return trimmed.length === 0 ? "/" : trimmed;
}

export function splitHref(to: string): {
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
} {
  const hashIndex: number = to.indexOf("#");
  const withoutHash: string = hashIndex >= 0 ? to.slice(0, hashIndex) : to;
  const hash: string = hashIndex >= 0 ? to.slice(hashIndex) : "";
  const searchIndex: number = withoutHash.indexOf("?");
  const pathname: string = normalizePath(
    searchIndex >= 0 ? withoutHash.slice(0, searchIndex) : withoutHash,
  );
  const search: string = searchIndex >= 0 ? withoutHash.slice(searchIndex) : "";
  return { pathname, search, hash };
}

export function preloadRoute(path: string): Promise<void> {
  const normalized: string = normalizePath(path);
  if (normalized === "/docs") {
    return DocsRoute.preload();
  }
  return Promise.resolve();
}
