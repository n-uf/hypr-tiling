import * as React from "react";
import { renderToString } from "react-dom/server";
import { HomePage } from "./page";
import { DocsPage } from "./docs-page";
import { buildLlmsTxt } from "./llms";
import { ArticlePage, SectionIndexPage } from "./content-page";
import { renderContentHead, renderSectionHead } from "./content-head";
import { buildSitemap } from "./content/sitemap";
import type { ContentSection } from "./content/constants";
import type { ContentPage, ContentSite } from "./content/types";
import { homeFirstPaintCss, joinPrerenderedHomeCopies } from "./home-first-paint";
import {
  PrerenderedHomeLayoutContext,
  type HomeLayout,
} from "./mobile-home/use-viewport";

function renderHome(layout: HomeLayout): string {
  return renderToString(
    <React.StrictMode>
      <PrerenderedHomeLayoutContext.Provider value={layout}>
        <HomePage />
      </PrerenderedHomeLayoutContext.Provider>
    </React.StrictMode>,
  );
}

// Build-time prerender entry. `prerender.mjs` imports this, renders the homepage
// to static HTML, and injects it (plus the SEO <head>) into the dist template so
// the documentation content ships in the initial response. Effects do not run
// during renderToString, so the emitted markup is the pre-measurement tree — the
// same tree the client produces before hydration. Both layouts ship, desktop
// first; CSS shows the one that fits the viewport (see `home-first-paint.ts`).
export function render(): string {
  return joinPrerenderedHomeCopies(renderHome("desktop"), renderHome("mobile"));
}

// Inline <style> for the home <head>: shows only the home copy that fits the
// viewport, before any script runs.
export function renderHomeFirstPaintStyle(): string {
  return `<style>${homeFirstPaintCss()}</style>`;
}

// Prerender entry for the `/docs` route. `prerender.mjs` writes this into
// `dist/docs/index.html` so the guides + generated API reference ship as static
// HTML. No `navigate` prop is passed, so in-page links stay plain hrefs.
export function renderDocs(): string {
  return renderToString(
    <React.StrictMode>
      <DocsPage />
    </React.StrictMode>,
  );
}

// SEO <head> content of the home page and of `/docs` (meta tags + JSON-LD),
// built from the single content source so meta copy never drifts from the page.
// Injected at the `<!--app-head-->` marker.
export { renderHead, renderDocsHead } from "./home-head";

export function llmsTxt(site: ContentSite): string {
  return buildLlmsTxt(site);
}

export function sitemapXml(site: ContentSite): string {
  return buildSitemap(site);
}

// Use-case and blog pages (see content/ and content-page.tsx): static HTML with
// no tiling script. `prerender.mjs` writes each into the built template.
export function renderContentPage(page: ContentPage, site: ContentSite): string {
  return renderToString(<ArticlePage page={page} site={site} />);
}

export function renderContentPageHead(page: ContentPage): string {
  return renderContentHead(page);
}

export function renderSectionIndex(section: ContentSection, site: ContentSite): string {
  return renderToString(<SectionIndexPage section={section} site={site} />);
}

export function renderSectionIndexHead(section: ContentSection, site: ContentSite): string {
  return renderSectionHead(section, site);
}

export { loadSite } from "./content/build";
export { hiddenPublicFiles } from "./content/site";
