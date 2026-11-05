import { describe, expect, it } from "@jest/globals";
import { renderContentHead, renderSectionHead } from "../content-head";
import { CONTENT_SECTIONS, SECTION_INDEX_COPY } from "./constants";
import { buildSitemap } from "./sitemap";
import type { ContentPage, ContentSite } from "./types";
import { charLength, DESCRIPTION_MAX, DESCRIPTION_MIN, TITLE_MAX } from "./validate";

function page(section: "blog" | "use-cases", slug: string, updated: string): ContentPage {
  const path = `/${section}/${slug}`;
  return {
    section,
    slug,
    path,
    url: `https://hypr-tiling.n-uf.com${path}`,
    file: `content${path}.md`,
    ogPath: `/og/${section}-${slug}.png`,
    title: `Title of ${slug}`,
    description: "Description.",
    h1: `Heading of ${slug}`,
    mainKeyword: slug,
    kind: section === "blog" ? "comparison" : "use-case",
    draft: false,
    published: "2026-11-01",
    updated,
    author: "n-uf",
    takeaways: ["a", "b", "c"],
    faq: [{ q: "Q1?", a: "A1." }],
    sources: [],
    related: ["/", "/docs"],
    ledeHtml: "",
    ledeText: "",
    bodyHtml: "",
    headings: [],
    links: [],
    wordCount: 100,
  };
}

const SITE: ContentSite = {
  pages: [page("blog", "one", "2026-11-03"), page("blog", "two", "2026-11-02"), page("use-cases", "uc", "2026-11-01")],
  hidden: [],
  warnings: [],
};

describe("sitemap", (): void => {
  const xml = buildSitemap(SITE);
  const urls = [...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?\s*<\/url>/g)].map(
    (match) => [match[1], match[2] ?? null],
  );

  it("lists the home, docs, non-empty section indexes and every page, never /llms.txt", (): void => {
    expect(urls.map(([loc]) => loc)).toEqual([
      "https://hypr-tiling.n-uf.com/",
      "https://hypr-tiling.n-uf.com/docs",
      "https://hypr-tiling.n-uf.com/use-cases",
      "https://hypr-tiling.n-uf.com/use-cases/uc",
      "https://hypr-tiling.n-uf.com/blog",
      "https://hypr-tiling.n-uf.com/blog/one",
      "https://hypr-tiling.n-uf.com/blog/two",
    ]);
    expect(xml).not.toContain("llms.txt");
  });

  it("dates only the pages that have a real date", (): void => {
    expect(Object.fromEntries(urls)).toEqual({
      "https://hypr-tiling.n-uf.com/": null,
      "https://hypr-tiling.n-uf.com/docs": null,
      "https://hypr-tiling.n-uf.com/use-cases": "2026-11-01",
      "https://hypr-tiling.n-uf.com/use-cases/uc": "2026-11-01",
      "https://hypr-tiling.n-uf.com/blog": "2026-11-03",
      "https://hypr-tiling.n-uf.com/blog/one": "2026-11-03",
      "https://hypr-tiling.n-uf.com/blog/two": "2026-11-02",
    });
  });

  it("leaves an empty section out", (): void => {
    const only = buildSitemap({ pages: [page("blog", "one", "2026-11-03")], hidden: [], warnings: [] });
    expect(only).not.toContain("/use-cases");
    expect(buildSitemap({ pages: [], hidden: [], warnings: [] })).not.toContain("<lastmod>");
  });
});

describe("section index copy", (): void => {
  it.each(CONTENT_SECTIONS)("%s fits the page limits", (section): void => {
    const copy = SECTION_INDEX_COPY[section];
    expect(charLength(copy.title)).toBeLessThanOrEqual(TITLE_MAX);
    expect(charLength(copy.description)).toBeGreaterThanOrEqual(DESCRIPTION_MIN);
    expect(charLength(copy.description)).toBeLessThanOrEqual(DESCRIPTION_MAX);
  });
});

function headOf(html: string): {
  readonly graph: Array<Record<string, unknown>>;
  readonly count: (pattern: RegExp) => number;
} {
  const json = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (json == null) {
    throw new Error("no JSON-LD");
  }
  return {
    graph: (JSON.parse(json[1]) as { "@graph": Array<Record<string, unknown>> })["@graph"],
    count: (pattern) => (html.match(pattern) ?? []).length,
  };
}

describe("head of a content page", (): void => {
  it("has one robots meta, the canonical, the share image and the n-uf node", (): void => {
    const html = renderContentHead(SITE.pages[0]);
    const head = headOf(html);
    expect(head.count(/<meta name="robots"/g)).toBe(1);
    expect(html).toContain('<link rel="canonical" href="https://hypr-tiling.n-uf.com/blog/one" />');
    expect(html).toContain('<meta property="og:image" content="https://hypr-tiling.n-uf.com/og/blog-one.png" />');
    expect(html).toContain('<meta property="og:type" content="article" />');
    expect(html).toContain('<meta name="twitter:image" content="https://hypr-tiling.n-uf.com/og/blog-one.png" />');
    expect(head.graph).toContainEqual({
      "@type": "Organization",
      "@id": "https://n-uf.com/#org",
      name: "n-uf",
      url: "https://n-uf.com",
      sameAs: ["https://github.com/n-uf"],
    });
  });

  it("a blog page is a TechArticle and a use case a WebPage, with dates, publisher, breadcrumbs and FAQ", (): void => {
    const blog = headOf(renderContentHead(SITE.pages[0])).graph;
    const article = blog.find((node) => node["@type"] === "TechArticle");
    expect(article).toMatchObject({
      headline: "Heading of one",
      datePublished: "2026-11-01",
      dateModified: "2026-11-03",
      author: { "@id": "https://n-uf.com/#org" },
      publisher: { "@id": "https://n-uf.com/#org" },
      image: "https://hypr-tiling.n-uf.com/og/blog-one.png",
      mainEntityOfPage: "https://hypr-tiling.n-uf.com/blog/one",
      about: { "@id": "https://hypr-tiling.n-uf.com/#software" },
    });
    expect(blog.map((node) => node["@type"])).toEqual(["Organization", "TechArticle", "BreadcrumbList", "FAQPage"]);
    const crumbs = blog.find((node) => node["@type"] === "BreadcrumbList") as { itemListElement: Array<{ name: string }> };
    expect(crumbs.itemListElement.map((item) => item.name)).toEqual(["Home", "Blog", "Title of one"]);

    const useCase = headOf(renderContentHead(SITE.pages[2])).graph;
    expect(useCase.map((node) => node["@type"])).toEqual(["Organization", "WebPage", "BreadcrumbList", "FAQPage"]);
    expect(useCase[1]).toMatchObject({ datePublished: "2026-11-01", publisher: { "@id": "https://n-uf.com/#org" } });
  });

  it("a section index is a CollectionPage with an ItemList", (): void => {
    const html = renderSectionHead("blog", SITE);
    const graph = headOf(html).graph;
    expect(html).toContain('<link rel="canonical" href="https://hypr-tiling.n-uf.com/blog" />');
    expect(html).toContain("/og/blog.png");
    const collection = graph.find((node) => node["@type"] === "CollectionPage") as {
      mainEntity: { "@type": string; itemListElement: Array<{ url: string }> };
    };
    expect(collection.mainEntity["@type"]).toBe("ItemList");
    expect(collection.mainEntity.itemListElement.map((item) => item.url)).toEqual([
      "https://hypr-tiling.n-uf.com/blog/one",
      "https://hypr-tiling.n-uf.com/blog/two",
    ]);
  });

  it("keeps text from closing the JSON-LD script", (): void => {
    const nasty = { ...SITE.pages[0], faq: [{ q: "</script><b>?", a: "x" }] };
    const html = renderContentHead(nasty);
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(headOf(html).graph).toHaveLength(4);
  });
});
