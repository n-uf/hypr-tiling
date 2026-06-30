import * as React from "react";
import { renderToString } from "react-dom/server";
import { HomePage } from "./page";
import {
  buildLlmsTxt,
  CANONICAL_DESCRIPTION,
  FEATURE_FACTS,
  INSTALL_SNIPPET,
  PACKAGE_NAME,
  PAGE_TITLE,
  REPO_URL,
  SITE_URL,
} from "./docs";

// Build-time prerender entry. `prerender.mjs` imports this, renders the homepage
// to static HTML, and injects it (plus the SEO <head>) into the dist template so
// the documentation content ships in the initial response. Effects do not run
// during renderToString, so the emitted markup is the pre-measurement tree — the
// same tree the client produces before hydration.
export function render(): string {
  return renderToString(
    <React.StrictMode>
      <HomePage />
    </React.StrictMode>,
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface StructuredDataGraph {
  readonly "@context": "https://schema.org";
  readonly "@graph": ReadonlyArray<Record<string, unknown>>;
}

function structuredData(): StructuredDataGraph {
  const featureList: ReadonlyArray<string> = FEATURE_FACTS.map(
    (fact): string => fact.term,
  );
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareSourceCode",
        name: PACKAGE_NAME,
        description: CANONICAL_DESCRIPTION,
        codeRepository: REPO_URL,
        programmingLanguage: "TypeScript",
        runtimePlatform: "React",
        url: SITE_URL,
        license: "https://polyformproject.org/licenses/perimeter/1.0.1",
      },
      {
        "@type": "SoftwareApplication",
        name: PACKAGE_NAME,
        description: CANONICAL_DESCRIPTION,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web",
        url: SITE_URL,
        softwareHelp: SITE_URL,
        installUrl: SITE_URL,
        featureList: featureList,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      },
    ],
  };
}

// SEO <head> content built from the single content source so meta copy never
// drifts from the page. Injected at the `<!--app-head-->` marker.
export function renderHead(): string {
  const title: string = escapeHtml(PAGE_TITLE);
  const description: string = escapeHtml(CANONICAL_DESCRIPTION);
  const keywords: string = escapeHtml(
    [
      "react tiling",
      "dynamic tiling",
      "split layout",
      "resizable panes",
      "drag and drop layout",
      "tiling window manager react",
      "hyprland",
      PACKAGE_NAME,
    ].join(", "),
  );
  const jsonLd: string = JSON.stringify(structuredData());
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta name="keywords" content="${keywords}" />`,
    `<meta name="author" content="n-uf" />`,
    `<link rel="canonical" href="${SITE_URL}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${SITE_URL}" />`,
    `<meta property="og:site_name" content="${escapeHtml(PACKAGE_NAME)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="install" content="${escapeHtml(INSTALL_SNIPPET)}" />`,
    `<link rel="alternate" type="text/markdown" href="/llms.txt" />`,
    `<script type="application/ld+json">${jsonLd}</script>`,
  ].join("\n    ");
}

export function llmsTxt(): string {
  return buildLlmsTxt();
}
