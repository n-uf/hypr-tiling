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
// showcase and docs chunks are code-split (React.lazy) so the homepage bundle
// stays light — the docs chunk (which carries the generated reference bundle)
// is preloaded in main.tsx before hydrating the prerendered /docs markup, so
// the lazy component resolves synchronously and hydration matches. Navigation
// is pushState-based (no full reload) with a popstate listener.

const ShowcaseRoute = React.lazy(
  (): Promise<{ default: React.ComponentType<{ navigate?: (to: string) => void }> }> =>
    import("./showcase-route").then(
      (module): { default: React.ComponentType<{ navigate?: (to: string) => void }> } => ({
        default: module.ShowcaseRoute,
      }),
    ),
);

const DocsRoute = React.lazy(
  (): Promise<{ default: React.ComponentType<{ navigate?: (to: string) => void }> }> =>
    import("./docs-page").then(
      (module): { default: React.ComponentType<{ navigate?: (to: string) => void }> } => ({
        default: module.DocsPage,
      }),
    ),
);

function normalizePath(pathname: string): string {
  const trimmed: string = pathname.replace(/\/+$/, "");
  return trimmed.length === 0 ? "/" : trimmed;
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
    return (
      <React.Suspense fallback={<ShowcaseFallback />}>
        <ShowcaseRoute navigate={navigate} />
      </React.Suspense>
    );
  }
  if (path === "/docs") {
    return (
      <React.Suspense fallback={<DocsFallback />}>
        <DocsRoute navigate={navigate} />
      </React.Suspense>
    );
  }
  return <HomePage navigate={navigate} />;
}
