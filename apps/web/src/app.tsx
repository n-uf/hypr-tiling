import * as React from "react";
import {
  CANONICAL_DESCRIPTION,
  DOCS_URL,
  PAGE_TITLE,
  SHOWCASE_URL,
  SITE_URL,
  SOCIAL_IMAGE_URL,
} from "./docs";
import { HomePage } from "./page";

// Tiny client-side router. `/` renders the redesigned docs homepage (the SEO /
// prerender surface); `/docs` renders the prerendered guides + generated API
// reference; `/showcase` renders the original full interactive showcase. The
// showcase and docs chunks are code-split so the homepage bundle stays light.
// Navigation is pushState-based (no full reload) with a popstate listener.

interface RouteProps {
  readonly navigate?: (to: string) => void;
}

type RouteComponent = React.ComponentType<RouteProps>;

interface PreloadableRoute {
  (props: RouteProps): React.ReactElement;
  readonly preload: () => Promise<void>;
  // True once the chunk has resolved and the route renders synchronously. Used
  // to skip the Suspense wrapper on the hydrated route so the client tree matches
  // the server (which renders the route eagerly, with no Suspense boundary).
  readonly isLoaded: () => boolean;
}

// A code-split route that renders SYNCHRONOUSLY once its chunk has been
// preloaded. `React.lazy` always suspends on its FIRST render — its factory
// promise resolves a microtask after the synchronous render — so hydrating a
// route the server rendered eagerly makes the first client render the Suspense
// fallback, which mismatches the prerendered HTML and forces React to discard
// and regenerate the whole tree. Instead we keep the dynamic `import()` (the
// bundle stays split) but hold the resolved component in a module cache and
// render it directly. `main.tsx` awaits `preload()` before `hydrateRoot`, so on
// the hydrated route the first client render IS the real component, matching the
// server tree byte-for-byte. Client-side navigation into a not-yet-preloaded
// route still suspends (the render throws the load promise), so the enclosing
// Suspense boundary shows the fallback until the chunk arrives.
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

const ShowcaseRoute: PreloadableRoute = preloadableRoute(
  (): Promise<{ default: RouteComponent }> =>
    import("./showcase-route").then(
      (module): { default: RouteComponent } => ({ default: module.ShowcaseRoute }),
    ),
);

const DocsRoute: PreloadableRoute = preloadableRoute(
  (): Promise<{ default: RouteComponent }> =>
    import("./docs-page").then(
      (module): { default: RouteComponent } => ({ default: module.DocsPage }),
    ),
);

function normalizePath(pathname: string): string {
  const trimmed: string = pathname.replace(/\/+$/, "");
  return trimmed.length === 0 ? "/" : trimmed;
}

// Preload the code-split chunk for a route so the caller can `await` it before
// hydrating — the key to a clean hydration of the prerendered /docs markup.
export function preloadRoute(path: string): Promise<void> {
  const normalized: string = normalizePath(path);
  if (normalized === "/docs") {
    return DocsRoute.preload();
  }
  if (normalized === "/showcase") {
    return ShowcaseRoute.preload();
  }
  return Promise.resolve();
}

function ShowcaseFallback(): React.ReactElement {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-[#080a14] font-mono text-[12px] uppercase tracking-[0.22em] text-slate-400">
      loading showcase…
    </div>
  );
}

function DocsFallback(): React.ReactElement {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-[#0c0d0f] font-mono text-[12px] uppercase tracking-[0.22em] text-stone-400">
      loading docs…
    </div>
  );
}

interface MetaTagSpec {
  readonly name?: string;
  readonly property?: string;
  readonly content: string;
}

function upsertCanonicalLink(href: string): void {
  const selector: string = 'link[rel="canonical"]';
  const existing: HTMLLinkElement | null = document.head.querySelector(selector);
  if (existing != null) {
    existing.href = href;
    return;
  }
  const link: HTMLLinkElement = document.createElement("link");
  link.rel = "canonical";
  link.href = href;
  document.head.appendChild(link);
}

function upsertMetaTag(spec: MetaTagSpec): void {
  const attr: "name" | "property" = spec.name != null ? "name" : "property";
  const key: string | undefined = spec.name ?? spec.property;
  if (key == null) {
    return;
  }
  const selector: string = `meta[${attr}="${key}"]`;
  const existing: HTMLMetaElement | null = document.head.querySelector(selector);
  if (existing != null) {
    existing.content = spec.content;
    return;
  }
  const tag: HTMLMetaElement = document.createElement("meta");
  tag.setAttribute(attr, key);
  tag.content = spec.content;
  document.head.appendChild(tag);
}

export function App(): React.ReactElement {
  const [path, setPath] = React.useState<string>((): string =>
    normalizePath(window.location.pathname),
  );

  React.useEffect((): (() => void) => {
    const onPopState = (): void => {
      setPath(normalizePath(window.location.pathname));
    };
    window.addEventListener("popstate", onPopState);
    return (): void => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  const navigate = React.useCallback((to: string): void => {
    const target: string = normalizePath(to);
    if (target === normalizePath(window.location.pathname)) {
      return;
    }
    window.history.pushState({}, "", to);
    setPath(target);
    window.scrollTo(0, 0);
  }, []);

  React.useEffect((): void => {
    const isShowcase: boolean = path === "/showcase";
    const isDocs: boolean = path === "/docs";
    const pageTitle: string = isShowcase
      ? "hypr-tiling showcase - interactive demo"
      : isDocs
        ? "hypr-tiling documentation - guides & API reference"
        : PAGE_TITLE;
    const pageDescription: string = isShowcase
      ? "Interactive hypr-tiling showcase route. Canonical documentation and package details are published on the homepage."
      : isDocs
        ? "hypr-tiling documentation: install and integration guides, the core layout and interaction model, recipes, and the generated public API reference."
        : CANONICAL_DESCRIPTION;
    const canonicalHref: string = isShowcase
      ? SHOWCASE_URL
      : isDocs
        ? DOCS_URL
        : SITE_URL;

    document.title = pageTitle;
    upsertCanonicalLink(canonicalHref);
    upsertMetaTag({
      name: "robots",
      content: isShowcase ? "noindex,follow,max-image-preview:large" : "index,follow,max-image-preview:large",
    });
    upsertMetaTag({ property: "og:url", content: canonicalHref });
    upsertMetaTag({ property: "og:image", content: SOCIAL_IMAGE_URL });
    upsertMetaTag({ name: "twitter:image", content: SOCIAL_IMAGE_URL });
    upsertMetaTag({ name: "description", content: pageDescription });
    upsertMetaTag({ property: "og:description", content: pageDescription });
    upsertMetaTag({ name: "twitter:description", content: pageDescription });
    upsertMetaTag({ property: "og:title", content: pageTitle });
    upsertMetaTag({ name: "twitter:title", content: pageTitle });
  }, [path]);

  if (path === "/showcase") {
    // Already loaded (preloaded before hydrate, or a prior visit) → render
    // directly so the tree matches an eager SSR/prerender; otherwise suspend
    // while the chunk loads on a client navigation.
    if (ShowcaseRoute.isLoaded()) {
      return <ShowcaseRoute navigate={navigate} />;
    }
    return (
      <React.Suspense fallback={<ShowcaseFallback />}>
        <ShowcaseRoute navigate={navigate} />
      </React.Suspense>
    );
  }
  if (path === "/docs") {
    if (DocsRoute.isLoaded()) {
      return <DocsRoute navigate={navigate} />;
    }
    return (
      <React.Suspense fallback={<DocsFallback />}>
        <DocsRoute navigate={navigate} />
      </React.Suspense>
    );
  }
  return <HomePage navigate={navigate} />;
}
