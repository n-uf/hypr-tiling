import {
  SECTION_INDEX_COPY,
  SECTION_LABELS,
  SITE_ORIGIN,
  sectionPath,
  type ContentSection,
} from "./content/constants";
import { escapeHtml } from "./content/markdown";
import { pagesOf, type ContentPage, type ContentSite } from "./content/types";
import { OG_HEIGHT, OG_WIDTH, sectionOgPath } from "./content/validate";

// <head> tags and JSON-LD for the use-case, blog and section index pages. Pure
// string building from the validated pages; server only (the prerender calls it
// through entry-server.tsx).

export const N_UF_ORG_ID: string = "https://n-uf.com/#org";
export const N_UF_ORG: Readonly<Record<string, unknown>> = {
  "@type": "Organization",
  "@id": N_UF_ORG_ID,
  name: "n-uf",
  url: "https://n-uf.com",
  sameAs: ["https://github.com/n-uf"],
};
export const N_UF_REF: Readonly<Record<string, string>> = { "@id": N_UF_ORG_ID };

/** The id of the hypr-tiling SoftwareSourceCode node on the home page's graph. */
export const SOFTWARE_NODE_ID: string = `${SITE_ORIGIN}/#software`;

const TWITTER_HANDLE = "@n_uf";

interface HeadSpec {
  readonly title: string;
  readonly description: string;
  readonly url: string;
  readonly ogType: "article" | "website";
  readonly imagePath: string;
  readonly imageAlt: string;
  readonly graph: ReadonlyArray<Readonly<Record<string, unknown>>>;
  readonly extra?: ReadonlyArray<string>;
}

function renderHead(spec: HeadSpec): string {
  const title: string = escapeHtml(spec.title);
  const description: string = escapeHtml(spec.description);
  const image: string = escapeHtml(`${SITE_ORIGIN}${spec.imagePath}`);
  const url: string = escapeHtml(spec.url);
  // `<` is escaped inside the JSON so no text in a page can close the script element.
  const jsonLd: string = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": spec.graph,
  }).replace(/</g, "\\u003c");
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta name="robots" content="index,follow,max-image-preview:large" />`,
    `<meta name="author" content="n-uf" />`,
    `<link rel="canonical" href="${url}" />`,
    `<link rel="sitemap" type="application/xml" href="/sitemap.xml" />`,
    `<meta property="og:type" content="${spec.ogType}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="${OG_WIDTH}" />`,
    `<meta property="og:image:height" content="${OG_HEIGHT}" />`,
    `<meta property="og:image:alt" content="${escapeHtml(spec.imageAlt)}" />`,
    `<meta property="og:site_name" content="@n-uf/hypr-tiling" />`,
    ...(spec.extra ?? []),
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    `<meta name="twitter:site" content="${TWITTER_HANDLE}" />`,
    `<meta name="twitter:creator" content="${TWITTER_HANDLE}" />`,
    `<link rel="alternate" type="text/markdown" href="/llms.txt" />`,
    `<script type="application/ld+json">${jsonLd}</script>`,
  ].join("\n    ");
}

function breadcrumb(
  url: string,
  trail: ReadonlyArray<{ readonly name: string; readonly item: string }>,
): Record<string, unknown> {
  return {
    "@type": "BreadcrumbList",
    "@id": `${url}#breadcrumb`,
    itemListElement: trail.map((entry, index): Record<string, unknown> => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      item: entry.item,
    })),
  };
}

/** Head tags for a use-case or blog page. */
export function renderContentHead(page: ContentPage): string {
  const imageUrl: string = `${SITE_ORIGIN}${page.ogPath}`;
  const about: Record<string, unknown> = {
    "@type": "SoftwareSourceCode",
    "@id": SOFTWARE_NODE_ID,
    name: "@n-uf/hypr-tiling",
    codeRepository: "https://github.com/n-uf/hypr-tiling",
  };
  const common: Record<string, unknown> = {
    description: page.description,
    datePublished: page.published,
    dateModified: page.updated,
    author: N_UF_REF,
    publisher: N_UF_REF,
    image: imageUrl,
    inLanguage: "en",
    url: page.url,
    mainEntityOfPage: page.url,
    about,
  };
  // A blog page is a TechArticle; a use case is a WebPage (which also carries the breadcrumb link).
  const article: Record<string, unknown> =
    page.section === "blog"
      ? { "@type": "TechArticle", "@id": `${page.url}#article`, headline: page.h1, ...common }
      : {
          "@type": "WebPage",
          "@id": `${page.url}#webpage`,
          name: page.h1,
          ...common,
          breadcrumb: { "@id": `${page.url}#breadcrumb` },
        };
  return renderHead({
    title: page.title,
    description: page.description,
    url: page.url,
    ogType: "article",
    imagePath: page.ogPath,
    imageAlt: page.title,
    extra: [
      `<meta property="article:published_time" content="${page.published}" />`,
      `<meta property="article:modified_time" content="${page.updated}" />`,
      `<meta property="article:author" content="n-uf" />`,
    ],
    graph: [
      N_UF_ORG,
      article,
      breadcrumb(page.url, [
        { name: "Home", item: `${SITE_ORIGIN}/` },
        { name: SECTION_LABELS[page.section].plural, item: `${SITE_ORIGIN}${sectionPath(page.section)}` },
        { name: page.title, item: page.url },
      ]),
      {
        "@type": "FAQPage",
        "@id": `${page.url}#faq`,
        mainEntity: page.faq.map((item): Record<string, unknown> => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  });
}

/** Head tags for a section's index page (`/use-cases`, `/blog`). */
export function renderSectionHead(section: ContentSection, site: ContentSite): string {
  const copy = SECTION_INDEX_COPY[section];
  const url: string = `${SITE_ORIGIN}${sectionPath(section)}`;
  const pages: ReadonlyArray<ContentPage> = pagesOf(site, section);
  return renderHead({
    title: copy.title,
    description: copy.description,
    url,
    ogType: "website",
    imagePath: sectionOgPath(section),
    imageAlt: copy.title,
    graph: [
      N_UF_ORG,
      {
        "@type": "CollectionPage",
        "@id": `${url}#collection`,
        name: copy.h1,
        description: copy.description,
        url,
        inLanguage: "en",
        publisher: N_UF_REF,
        image: `${SITE_ORIGIN}${sectionOgPath(section)}`,
        breadcrumb: { "@id": `${url}#breadcrumb` },
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: pages.length,
          itemListElement: pages.map((page, index): Record<string, unknown> => ({
            "@type": "ListItem",
            position: index + 1,
            url: page.url,
            name: page.title,
          })),
        },
      },
      breadcrumb(url, [
        { name: "Home", item: `${SITE_ORIGIN}/` },
        { name: SECTION_LABELS[section].plural, item: url },
      ]),
    ],
  });
}
