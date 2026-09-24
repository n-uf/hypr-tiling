import * as React from "react";
import {
  CANONICAL_DESCRIPTION,
  DOCS_URL,
  PAGE_TITLE,
  SITE_URL,
  SOCIAL_IMAGE_URL,
} from "./docs";
import { DocsRoute, normalizePath, preloadRoute, splitHref } from "./docs-route";
import { HomePage } from "./page";

// Tiny client-side router. `/` renders the docs homepage (the SEO / prerender
// surface); `/docs` renders the prerendered guides + generated API reference.
// The docs chunk is code-split so the homepage bundle stays light. Navigation
// is pushState-based (no full reload) with a popstate listener. `to` may carry
// a `#anchor` (home Changelog timeline → `/docs#changelog-26-9-6`).

export { preloadRoute } from "./docs-route";

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
    const parts: {
      readonly pathname: string;
      readonly search: string;
      readonly hash: string;
    } = splitHref(to);
    const next: string = `${parts.pathname}${parts.search}${parts.hash}`;
    const current: string = `${normalizePath(window.location.pathname)}${window.location.search}${window.location.hash}`;
    if (next === current) {
      return;
    }
    window.history.pushState({}, "", next);
    setPath(parts.pathname);
    if (parts.hash === "") {
      window.scrollTo(0, 0);
    }
  }, []);

  React.useEffect((): void => {
    const isDocs: boolean = path === "/docs";
    const pageTitle: string = isDocs
      ? "hypr-tiling documentation - guides & API reference"
      : PAGE_TITLE;
    const pageDescription: string = isDocs
      ? "hypr-tiling documentation: install and integration guides, the core layout and interaction model, recipes, and the generated public API reference."
      : CANONICAL_DESCRIPTION;
    const canonicalHref: string = isDocs ? DOCS_URL : SITE_URL;

    document.title = pageTitle;
    upsertCanonicalLink(canonicalHref);
    upsertMetaTag({
      name: "robots",
      content: "index,follow,max-image-preview:large",
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
