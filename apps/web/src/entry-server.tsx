import * as React from "react";
import { renderToString } from "react-dom/server";
import { HomePage } from "./page";
import { DocsPage } from "./docs-page";
import {
  API_REFERENCE_URL,
  CANONICAL_DESCRIPTION,
  DOCS_GUIDE_TOPICS,
  DOCS_URL,
  FEATURE_FACTS,
  PACKAGE_NAME,
  PAGE_TITLE,
  REPO_URL,
  SEO_FAQ_ITEMS,
  SHOWCASE_URL,
  SITE_URL,
  SOCIAL_IMAGE_URL,
  TWITTER_CREATOR_HANDLE,
  TWITTER_SITE_HANDLE,
} from "./docs";
import { buildLlmsTxt } from "./llms";

const DOCS_PAGE_TITLE: string =
  "hypr-tiling documentation - guides & API reference";
const DOCS_PAGE_DESCRIPTION: string =
  "hypr-tiling documentation: install and integration guides, the core layout and interaction model, recipes, and the generated public API reference.";

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
  const howToSteps: ReadonlyArray<Record<string, string>> = [
    {
      "@type": "HowToStep",
      name: "Install package",
      text: "pnpm add @n-uf/hypr-tiling react react-dom",
    },
    {
      "@type": "HowToStep",
      name: "Render controlled layout",
      text: "Render TilingRenderer and apply updates from onLayoutChange into your layout state.",
    },
  ];
  const faqEntities: ReadonlyArray<Record<string, unknown>> = SEO_FAQ_ITEMS.map(
    (item): Record<string, unknown> => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    }),
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
      {
        "@type": "TechArticle",
        headline: PAGE_TITLE,
        description: CANONICAL_DESCRIPTION,
        author: { "@type": "Person", name: "n-uf" },
        publisher: { "@type": "Organization", name: "n-uf" },
        url: DOCS_URL,
        mainEntityOfPage: DOCS_URL,
        image: SOCIAL_IMAGE_URL,
        about: {
          "@type": "SoftwareSourceCode",
          name: PACKAGE_NAME,
          codeRepository: REPO_URL,
        },
      },
      {
        "@type": "HowTo",
        name: "Install hypr-tiling in React",
        description:
          "Install hypr-tiling and wire it as a controlled layout renderer in React.",
        step: howToSteps,
        totalTime: "PT5M",
      },
      {
        "@type": "FAQPage",
        mainEntity: faqEntities,
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
      "split pane",
      "dock layout",
      "window manager ui",
      "hyprland",
      PACKAGE_NAME,
    ].join(", "),
  );
  const jsonLd: string = JSON.stringify(structuredData());
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta name="keywords" content="${keywords}" />`,
    `<meta name="robots" content="index,follow,max-image-preview:large" />`,
    `<meta name="author" content="n-uf" />`,
    `<link rel="canonical" href="${SITE_URL}" />`,
    `<link rel="sitemap" type="application/xml" href="/sitemap.xml" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${SITE_URL}" />`,
    `<meta property="og:image" content="${escapeHtml(SOCIAL_IMAGE_URL)}" />`,
    `<meta property="og:image:alt" content="hypr-tiling social preview" />`,
    `<meta property="og:site_name" content="${escapeHtml(PACKAGE_NAME)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${escapeHtml(SOCIAL_IMAGE_URL)}" />`,
    `<meta name="twitter:site" content="${escapeHtml(TWITTER_SITE_HANDLE)}" />`,
    `<meta name="twitter:creator" content="${escapeHtml(TWITTER_CREATOR_HANDLE)}" />`,
    `<link rel="alternate" type="application/json" href="${escapeHtml(API_REFERENCE_URL)}" />`,
    `<link rel="alternate" type="text/markdown" href="/llms.txt" />`,
    `<script type="application/ld+json">${jsonLd}</script>`,
  ].join("\n    ");
}

// SEO <head> for the `/docs` route. Mirrors the homepage head shape but with
// docs-specific title / description / canonical and a TechArticle + FAQ graph
// whose hasPart lists the guide topics for richer indexing.
export function renderDocsHead(): string {
  const title: string = escapeHtml(DOCS_PAGE_TITLE);
  const description: string = escapeHtml(DOCS_PAGE_DESCRIPTION);
  const keywords: string = escapeHtml(
    [
      "hypr-tiling docs",
      "react tiling documentation",
      "tiling layout api",
      "TilingRenderer",
      "react split pane api",
      PACKAGE_NAME,
    ].join(", "),
  );
  const docsGraph: StructuredDataGraph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        headline: DOCS_PAGE_TITLE,
        description: DOCS_PAGE_DESCRIPTION,
        author: { "@type": "Person", name: "n-uf" },
        publisher: { "@type": "Organization", name: "n-uf" },
        url: DOCS_URL,
        mainEntityOfPage: DOCS_URL,
        image: SOCIAL_IMAGE_URL,
        hasPart: DOCS_GUIDE_TOPICS.map(
          (topic): Record<string, string> => ({
            "@type": "WebPageElement",
            name: topic.title,
            description: topic.summary,
            url: `${DOCS_URL}#${topic.id}`,
          }),
        ),
        about: {
          "@type": "SoftwareSourceCode",
          name: PACKAGE_NAME,
          codeRepository: REPO_URL,
        },
      },
    ],
  };
  const jsonLd: string = JSON.stringify(docsGraph);
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta name="keywords" content="${keywords}" />`,
    `<meta name="robots" content="index,follow,max-image-preview:large" />`,
    `<meta name="author" content="n-uf" />`,
    `<link rel="canonical" href="${escapeHtml(DOCS_URL)}" />`,
    `<link rel="sitemap" type="application/xml" href="/sitemap.xml" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${escapeHtml(DOCS_URL)}" />`,
    `<meta property="og:image" content="${escapeHtml(SOCIAL_IMAGE_URL)}" />`,
    `<meta property="og:image:alt" content="hypr-tiling social preview" />`,
    `<meta property="og:site_name" content="${escapeHtml(PACKAGE_NAME)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${escapeHtml(SOCIAL_IMAGE_URL)}" />`,
    `<meta name="twitter:site" content="${escapeHtml(TWITTER_SITE_HANDLE)}" />`,
    `<meta name="twitter:creator" content="${escapeHtml(TWITTER_CREATOR_HANDLE)}" />`,
    `<link rel="alternate" type="text/markdown" href="/llms.txt" />`,
    `<script type="application/ld+json">${jsonLd}</script>`,
  ].join("\n    ");
}

// SEO <head> for the `/showcase` route. This route is intentionally excluded
// from indexing; the canonical docs and package details live on `/` and `/docs`.
export function renderShowcaseHead(): string {
  const title: string = escapeHtml("hypr-tiling showcase - interactive demo");
  const description: string = escapeHtml(
    "Interactive hypr-tiling showcase route. Canonical documentation and package details are published on the homepage.",
  );
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta name="robots" content="noindex,follow,max-image-preview:large" />`,
    `<meta name="author" content="n-uf" />`,
    `<link rel="canonical" href="${escapeHtml(SHOWCASE_URL)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${escapeHtml(SHOWCASE_URL)}" />`,
    `<meta property="og:image" content="${escapeHtml(SOCIAL_IMAGE_URL)}" />`,
    `<meta property="og:image:alt" content="hypr-tiling social preview" />`,
    `<meta property="og:site_name" content="${escapeHtml(PACKAGE_NAME)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${escapeHtml(SOCIAL_IMAGE_URL)}" />`,
    `<meta name="twitter:site" content="${escapeHtml(TWITTER_SITE_HANDLE)}" />`,
    `<meta name="twitter:creator" content="${escapeHtml(TWITTER_CREATOR_HANDLE)}" />`,
    `<link rel="alternate" type="text/markdown" href="/llms.txt" />`,
  ].join("\n    ");
}

export function llmsTxt(): string {
  return buildLlmsTxt();
}
