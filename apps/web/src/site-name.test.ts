import { describe, expect, it } from "@jest/globals";
import { renderContentHead, renderSectionHead, WEBSITE_NODE_ID } from "./content-head";
import { SITE_NAME } from "./content/constants";
import { checkContentFiles } from "./content/site";
import type { ContentSite } from "./content/types";
import type { SiteContext } from "./content/validate";
import { renderDocsHead, renderHead } from "./home-head";

// Google's site name comes from the home page's WebSite node and og:site_name;
// every page that emits og:site_name must agree with it.

const CONTEXT: SiteContext = {
  today: "2026-11-05",
  docsAnchors: new Set<string>(["quickstart"]),
  reservedKeywords: new Map<string, string>(),
  inspectImage: () => ({ bytes: 1000, width: 1200, height: 630 }),
};

const FRONT = `---
title: "Sample keyword page"
description: "A sample keyword description that is a single plain sentence with the main keyword, long enough to pass the lower limit of one hundred and twenty."
h1: "A sample keyword page"
mainKeyword: "sample keyword"
kind: comparison
published: 2026-11-01
updated: 2026-11-02
author: n-uf
takeaways: ["One fact.", "Two facts.", "Three facts."]
faq:
  - { q: "First?", a: "Yes." }
  - { q: "Second?", a: "Yes." }
  - { q: "Third?", a: "Yes." }
  - { q: "Fourth?", a: "Yes." }
sources:
  - { title: "A source", url: "https://example.com/a", checked: 2026-11-01 }
related: ["/", "/docs#quickstart"]
---

The sample keyword answer comes first, in one paragraph.
`;

function site(): ContentSite {
  const result = checkContentFiles(
    { files: [{ section: "blog", name: "sample.md", raw: FRONT }], strays: [], rejected: [] },
    CONTEXT,
  );
  expect(result.problems).toEqual([]);
  return result.site;
}

type Node = Record<string, unknown>;

function graphOf(head: string): ReadonlyArray<Node> {
  const match = head.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  expect(match).not.toBeNull();
  return (JSON.parse(match?.[1] ?? "{}") as { "@graph": ReadonlyArray<Node> })["@graph"];
}

function siteName(head: string): string | undefined {
  return head.match(/<meta property="og:site_name" content="([^"]*)"/)?.[1];
}

describe("the site name", (): void => {
  it("is hypr-tiling, not the package name", (): void => {
    expect(SITE_NAME).toBe("hypr-tiling");
  });

  it("the home page's graph holds the WebSite node, next to the n-uf Organization", (): void => {
    const graph = graphOf(renderHead());
    expect(graph.find((node) => node["@type"] === "WebSite")).toEqual({
      "@type": "WebSite",
      "@id": "https://hypr-tiling.n-uf.com/#website",
      name: "hypr-tiling",
      url: "https://hypr-tiling.n-uf.com/",
      publisher: { "@id": "https://n-uf.com/#org" },
    });
    expect(WEBSITE_NODE_ID).toBe("https://hypr-tiling.n-uf.com/#website");
    expect(graph.some((node) => node["@type"] === "Organization" && node["@id"] === "https://n-uf.com/#org")).toBe(true);
    expect(graph.some((node) => node["@type"] === "FAQPage")).toBe(true);
    expect(graph.filter((node) => node["@type"] === "WebSite")).toHaveLength(1);
  });

  it("og:site_name is hypr-tiling on the home page, /docs, a content page and a section index", (): void => {
    const content = site();
    expect(siteName(renderHead())).toBe("hypr-tiling");
    expect(siteName(renderDocsHead())).toBe("hypr-tiling");
    expect(siteName(renderContentHead(content.pages[0]))).toBe("hypr-tiling");
    expect(siteName(renderSectionHead("blog", content))).toBe("hypr-tiling");
  });

  it("/docs, a content page and a section index point at the WebSite node by id, without redefining it", (): void => {
    const content = site();
    const ref = { "@id": WEBSITE_NODE_ID };
    const docs = graphOf(renderDocsHead());
    expect(docs.find((node) => node["@type"] === "TechArticle")?.isPartOf).toEqual(ref);
    const article = graphOf(renderContentHead(content.pages[0]));
    expect(article.find((node) => node["@type"] === "TechArticle")?.isPartOf).toEqual(ref);
    const section = graphOf(renderSectionHead("blog", content));
    expect(section.find((node) => node["@type"] === "CollectionPage")?.isPartOf).toEqual(ref);
    for (const graph of [docs, article, section]) {
      expect(graph.some((node) => node["@type"] === "WebSite")).toBe(false);
    }
  });
});
